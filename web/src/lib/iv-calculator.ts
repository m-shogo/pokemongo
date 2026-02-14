import { CPM_TABLE, DUST_TO_LEVEL, levelToIndex, indexToLevel } from '../data/cpm';
import type { Pokemon, IvInput, IvResult } from './types';

const LEAGUE_CAPS = {
  great: 1500,
  ultra: 2500,
  master: Infinity,
} as const;

type League = keyof typeof LEAGUE_CAPS;

/** CP 計算 (公式) */
export function calcCp(
  baseAtk: number, baseDef: number, baseSta: number,
  ivAtk: number, ivDef: number, ivSta: number,
  cpm: number,
): number {
  const atk = (baseAtk + ivAtk) * cpm;
  const def = (baseDef + ivDef) * cpm;
  const sta = (baseSta + ivSta) * cpm;
  return Math.max(10, Math.floor(atk * Math.sqrt(def) * Math.sqrt(sta) / 10));
}

/** HP 計算 */
export function calcHp(baseSta: number, ivSta: number, cpm: number): number {
  return Math.max(10, Math.floor((baseSta + ivSta) * cpm));
}

/** stat product (PvP 用) */
function statProduct(
  baseAtk: number, baseDef: number, baseSta: number,
  ivAtk: number, ivDef: number, ivSta: number,
  cpm: number,
): number {
  const atk = (baseAtk + ivAtk) * cpm;
  const def = (baseDef + ivDef) * cpm;
  const sta = Math.max(10, Math.floor((baseSta + ivSta) * cpm));
  return atk * def * sta;
}

/** ほしのすなからレベル範囲を取得 */
function getLevelRange(dust: number | null): { min: number; max: number } {
  if (dust === null) return { min: 1, max: 55 };
  const entry = DUST_TO_LEVEL.find((d) => d.dust === dust);
  if (!entry) return { min: 1, max: 55 };
  return { min: entry.minLevel, max: entry.maxLevel };
}

/** あるIV組み合わせで、CP上限以下の最大レベルを求める */
function findMaxLevel(
  pokemon: Pokemon, ivAtk: number, ivDef: number, ivSta: number,
  cpCap: number,
): { level: number; cp: number; sp: number } | null {
  const { baseAtk, baseDef, baseSta } = pokemon;

  // マスターリーグ: 常に最大レベル
  if (cpCap === Infinity) {
    const idx = CPM_TABLE.length - 1;
    const cpm = CPM_TABLE[idx];
    return {
      level: indexToLevel(idx),
      cp: calcCp(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta, cpm),
      sp: statProduct(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta, cpm),
    };
  }

  for (let idx = CPM_TABLE.length - 1; idx >= 0; idx--) {
    const cpm = CPM_TABLE[idx];
    const cp = calcCp(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta, cpm);
    if (cp <= cpCap) {
      return {
        level: indexToLevel(idx),
        cp,
        sp: statProduct(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta, cpm),
      };
    }
  }
  return null;
}

// --- リーグランキングキャッシュ ---
// 同一ポケモンなら全4096通りのランキングは不変 → 1回だけ計算してキャッシュ
let _rankCacheId = -1;
let _rankCache: Record<League, number[]> | null = null;

function getOrBuildLeagueTables(pokemon: Pokemon): Record<League, number[]> {
  if (_rankCacheId === pokemon.id && _rankCache) return _rankCache;

  const tables = {} as Record<League, number[]>;
  for (const league of ['great', 'ultra', 'master'] as const) {
    const cpCap = LEAGUE_CAPS[league];
    const sps: number[] = [];
    for (let a = 0; a <= 15; a++) {
      for (let d = 0; d <= 15; d++) {
        for (let s = 0; s <= 15; s++) {
          const entry = findMaxLevel(pokemon, a, d, s, cpCap);
          if (entry) sps.push(entry.sp);
        }
      }
    }
    sps.sort((a, b) => b - a);
    tables[league] = sps;
  }

  _rankCacheId = pokemon.id;
  _rankCache = tables;
  return tables;
}

/** 降順ソート済み配列から順位を二分探索で求める */
function findRank(sortedDesc: number[], target: number): number {
  let lo = 0;
  let hi = sortedDesc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDesc[mid] > target) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

/** リーグランクを計算 */
function calcLeagueRanks(
  pokemon: Pokemon, ivAtk: number, ivDef: number, ivSta: number,
  tables: Record<League, number[]>,
): IvResult['leagues'] {
  const result: IvResult['leagues'] = { great: null, ultra: null, master: null };

  for (const league of ['great', 'ultra', 'master'] as const) {
    const me = findMaxLevel(pokemon, ivAtk, ivDef, ivSta, LEAGUE_CAPS[league]);
    if (!me) continue;

    const sorted = tables[league];
    const bestSp = sorted[0] ?? 1;

    result[league] = {
      rank: findRank(sorted, me.sp),
      maxCp: me.cp,
      maxLevel: me.level,
      statProduct: me.sp,
      percentOfBest: Math.round((me.sp / bestSp) * 10000) / 100,
    };
  }

  return result;
}

/** メイン: 入力条件に合致する全 IV 組み合わせを返す */
export function calculateAllIvCombinations(
  pokemon: Pokemon, input: IvInput,
): IvResult[] {
  const { min: minLevel, max: maxLevel } = getLevelRange(input.dust);
  const ivMin = input.lucky ? 12 : input.purified ? 1 : 0;
  const results: IvResult[] = [];

  // IV 範囲
  const atkRange = input.atk !== null ? [input.atk] : range(ivMin, 15);
  const defRange = input.def !== null ? [input.def] : range(ivMin, 15);
  const staRange = input.sta !== null ? [input.sta] : range(ivMin, 15);

  for (const ivAtk of atkRange) {
    for (const ivDef of defRange) {
      for (const ivSta of staRange) {
        // 各レベルでCP/HPが一致するか
        for (let level = minLevel; level <= maxLevel; level += 0.5) {
          const idx = levelToIndex(level);
          if (idx < 0 || idx >= CPM_TABLE.length) continue;
          const cpm = CPM_TABLE[idx];

          const cp = calcCp(pokemon.baseAtk, pokemon.baseDef, pokemon.baseSta, ivAtk, ivDef, ivSta, cpm);
          if (input.cp !== null && cp !== input.cp) continue;

          const hp = calcHp(pokemon.baseSta, ivSta, cpm);
          if (input.hp !== null && hp !== input.hp) continue;

          const ivPercent = Math.round(((ivAtk + ivDef + ivSta) / 45) * 100);
          const sp = statProduct(pokemon.baseAtk, pokemon.baseDef, pokemon.baseSta, ivAtk, ivDef, ivSta, cpm);

          results.push({
            level,
            atk: ivAtk,
            def: ivDef,
            sta: ivSta,
            cp,
            hp,
            ivPercent,
            statProduct: sp,
            leagues: { great: null, ultra: null, master: null },
          });
        }
      }
    }
  }

  // リーグランクテーブルを1回だけ構築 (同一ポケモンならキャッシュヒット)
  const tables = getOrBuildLeagueTables(pokemon);

  // 同じIV組み合わせ (異なるレベル) は同じリーグランク → 重複計算を排除
  const ivRankCache = new Map<number, IvResult['leagues']>();
  for (const r of results) {
    const key = r.atk * 256 + r.def * 16 + r.sta;
    let cached = ivRankCache.get(key);
    if (!cached) {
      cached = calcLeagueRanks(pokemon, r.atk, r.def, r.sta, tables);
      ivRankCache.set(key, cached);
    }
    r.leagues = cached;
  }

  // IV% 降順 → レベル降順でソート
  results.sort((a, b) => b.ivPercent - a.ivPercent || b.level - a.level);

  return results;
}

function range(min: number, max: number): number[] {
  const arr: number[] = [];
  for (let i = min; i <= max; i++) arr.push(i);
  return arr;
}
