#!/usr/bin/env node
/**
 * ポケモンGO 種族値データ自動更新スクリプト
 *
 * データソース:
 *   - PvPoke gamemaster.json → 種族値 (baseAtk, baseDef, baseSta)
 *   - PokeAPI pokemon-species → 日本語名
 *
 * 使い方:
 *   node scripts/update-pokemon-data.mjs
 *
 * GitHub Actions (update-pokemon-data.yml) から自動実行も可
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'web', 'src', 'data', 'pokemon');

// --- 世代ごとの図鑑番号範囲 ---
const GENERATIONS = [
  { gen: 1, start: 1, end: 151, region: 'カントー地方' },
  { gen: 2, start: 152, end: 251, region: 'ジョウト地方' },
  { gen: 3, start: 252, end: 386, region: 'ホウエン地方' },
  { gen: 4, start: 387, end: 493, region: 'シンオウ地方' },
  { gen: 5, start: 494, end: 649, region: 'イッシュ地方' },
  { gen: 6, start: 650, end: 721, region: 'カロス地方' },
  { gen: 7, start: 722, end: 809, region: 'アローラ地方' },
  { gen: 8, start: 810, end: 905, region: 'ガラル・ヒスイ地方' },
  { gen: 9, start: 906, end: 1025, region: 'パルデア地方' },
];

// --- ユーティリティ ---

/** リトライ付き fetch */
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return res;
    } catch (err) {
      if (i === retries) throw err;
      const wait = 1000 * (i + 1);
      console.warn(`  リトライ ${i + 1}/${retries} (${wait}ms後): ${url}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/** レート制限を守りながら並列リクエスト (バッチ処理) */
async function batchFetch(urls, batchSize = 20, delayMs = 500) {
  const results = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((url) =>
        fetchWithRetry(url)
          .then((r) => r.json())
          .catch((err) => {
            console.warn(`  スキップ: ${url} (${err.message})`);
            return null;
          })
      )
    );
    results.push(...batchResults);
    if (i + batchSize < urls.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

// --- メイン処理 ---

async function main() {
  console.log('=== ポケモンGO 種族値データ更新 ===\n');

  // 1. PvPoke gamemaster.json から種族値を取得
  console.log('1. PvPoke gamemaster.json を取得中...');
  const gmRes = await fetchWithRetry(
    'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json'
  );
  const gamemaster = await gmRes.json();

  // pokemon 配列から通常フォームのみ抽出（dex番号ベース）
  const pokemonMap = new Map();
  for (const p of gamemaster.pokemon) {
    const dex = p.dex;
    if (!dex || dex <= 0) continue;

    // 通常フォームを優先 (speciesId にハイフンが無いもの)
    // フォーム違いは後で別途対応
    if (!pokemonMap.has(dex) && !p.speciesId.includes('_')) {
      pokemonMap.set(dex, {
        id: dex,
        nameEn: p.speciesName,
        baseAtk: p.baseStats.atk,
        baseDef: p.baseStats.def,
        baseSta: p.baseStats.hp,
      });
    }
  }
  console.log(`  → ${pokemonMap.size} 種のポケモンを取得\n`);

  // 2. PokeAPI から日本語名を取得
  console.log('2. PokeAPI から日本語名を取得中...');
  const maxDex = Math.max(...pokemonMap.keys());
  const speciesUrls = [];
  for (let i = 1; i <= maxDex; i++) {
    if (pokemonMap.has(i)) {
      speciesUrls.push(`https://pokeapi.co/api/v2/pokemon-species/${i}`);
    }
  }

  const speciesResults = await batchFetch(speciesUrls, 50, 1000);

  let jaNameCount = 0;
  for (const species of speciesResults) {
    if (!species) continue;
    const id = species.id;
    if (!pokemonMap.has(id)) continue;

    const jaName = species.names?.find(
      (n) => n.language.name === 'ja-Hrkt' || n.language.name === 'ja'
    );
    if (jaName) {
      pokemonMap.get(id).nameJa = jaName.name;
      jaNameCount++;
    }
  }
  console.log(`  → ${jaNameCount} 件の日本語名を取得\n`);

  // 3. 世代別 TypeScript ファイルを生成
  console.log('3. TypeScript ファイルを生成中...');
  mkdirSync(OUT_DIR, { recursive: true });

  for (const gen of GENERATIONS) {
    const pokemon = [];
    for (let id = gen.start; id <= gen.end; id++) {
      const p = pokemonMap.get(id);
      if (!p) continue;
      pokemon.push({
        id: p.id,
        name: p.nameJa || p.nameEn, // 日本語名がなければ英語名
        baseAtk: p.baseAtk,
        baseDef: p.baseDef,
        baseSta: p.baseSta,
      });
    }

    if (pokemon.length === 0) continue;

    const padStart = String(gen.start).padStart(3, '0');
    const padEnd = String(gen.end).padStart(3, '0');

    const lines = pokemon.map(
      (p) =>
        `  { id: ${p.id}, name: '${p.name}', baseAtk: ${p.baseAtk}, baseDef: ${p.baseDef}, baseSta: ${p.baseSta} },`
    );

    const content = `import type { Pokemon } from '../../lib/types';

/** 第${gen.gen}世代 ${gen.region} (#${padStart}-#${padEnd}) */
export const GEN${gen.gen}_POKEMON: Pokemon[] = [
${lines.join('\n')}
];
`;

    const filePath = join(OUT_DIR, `gen${gen.gen}.ts`);
    writeFileSync(filePath, content, 'utf-8');
    console.log(`  → gen${gen.gen}.ts (${pokemon.length}匹)`);
  }

  // 4. index.ts を生成
  const activeGens = GENERATIONS.filter((g) => {
    for (let id = g.start; id <= g.end; id++) {
      if (pokemonMap.has(id)) return true;
    }
    return false;
  });

  const imports = activeGens
    .map(
      (g) =>
        `import { GEN${g.gen}_POKEMON } from './gen${g.gen}';`
    )
    .join('\n');

  const spreads = activeGens
    .map((g) => `  ...GEN${g.gen}_POKEMON,`)
    .join('\n');

  const indexContent = `import type { Pokemon } from '../../lib/types';
${imports}

/**
 * 全ポケモン種族値データ (Gen 1〜${activeGens[activeGens.length - 1].gen})
 * 新世代追加時は genX.ts を作成してここに追加するだけでOK
 *
 * データソース: PvPoke gamemaster.json + PokeAPI
 * 自動生成: scripts/update-pokemon-data.mjs
 */
export const POKEMON_DATA: Pokemon[] = [
${spreads}
].sort((a, b) => a.id - b.id);
`;

  writeFileSync(join(OUT_DIR, 'index.ts'), indexContent, 'utf-8');
  console.log(`  → index.ts\n`);

  console.log('=== 完了！===');
  console.log(`合計 ${pokemonMap.size} 種のポケモンデータを更新しました`);
}

main().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
