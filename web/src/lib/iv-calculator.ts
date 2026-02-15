import { CPM_TABLE, DUST_TO_LEVEL, levelToIndex, indexToLevel } from '../data/cpm';
import { getEvolutionFamily } from '../data/evolution';
import type { Pokemon, IvInput, IvResult, LeagueKey, EvolutionRankEntry, EvolutionLeagueInfo } from './types';

/** リーグ設定 */
interface LeagueConfig {
  cpCap: number;
  maxLevel: number;   // 探索レベル上限
}

const LEAGUE_CONFIGS: Record<LeagueKey, LeagueConfig> = {
  little:   { cpCap: 500,      maxLevel: 51 },
  great:    { cpCap: 1500,     maxLevel: 51 },
  ultra:    { cpCap: 2500,     maxLevel: 51 },
  master:   { cpCap: Infinity, maxLevel: 50 },
  master51: { cpCap: Infinity, maxLevel: 51 },
} as const;

const LEAGUE_KEYS: LeagueKey[] = ['little', 'great', 'ultra', 'master', 'master51'];

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

/** SCP 計算: (statProduct)^(2/3) / 10 */
function calcScp(sp: number): number {
  return Math.floor(Math.pow(sp, 2 / 3) / 10);
}

/** ほしのすなからレベル範囲を取得 */
function getLevelRange(dust: number | null): { min: number; max: number } {
  if (dust === null) return { min: 1, max: 55 };
  const entry = DUST_TO_LEVEL.find((d) => d.dust === dust);
  if (!entry) return { min: 1, max: 55 };
  return { min: entry.minLevel, max: entry.maxLevel };
}

/** あるIV組み合わせで、CP上限以下の最大レベルを求める (二分探索) */
function findMaxLevel(
  pokemon: Pokemon, ivAtk: number, ivDef: number, ivSta: number,
  cpCap: number, maxLevel: number,
): { level: number; cp: number; sp: number } | null {
  const { baseAtk, baseDef, baseSta } = pokemon;
  const maxIdx = Math.min(levelToIndex(maxLevel), CPM_TABLE.length - 1);

  // マスターリーグ (CP上限なし): 指定レベルで固定
  if (cpCap === Infinity) {
    const cpm = CPM_TABLE[maxIdx];
    return {
      level: indexToLevel(maxIdx),
      cp: calcCp(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta, cpm),
      sp: statProduct(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta, cpm),
    };
  }

  // 最大レベルでもCP以下なら即答
  const cpAtMax = calcCp(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta, CPM_TABLE[maxIdx]);
  if (cpAtMax <= cpCap) {
    return {
      level: indexToLevel(maxIdx),
      cp: cpAtMax,
      sp: statProduct(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta, CPM_TABLE[maxIdx]),
    };
  }

  // Lv1でもCP超過なら不可能
  if (calcCp(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta, CPM_TABLE[0]) > cpCap) {
    return null;
  }

  // 二分探索: CP <= cpCap を満たす最大インデックスを探す
  // CPはレベルに対して単調非減少
  let lo = 0;
  let hi = maxIdx;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (calcCp(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta, CPM_TABLE[mid]) <= cpCap) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const cpm = CPM_TABLE[lo];
  return {
    level: indexToLevel(lo),
    cp: calcCp(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta, cpm),
    sp: statProduct(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta, cpm),
  };
}

// --- リーグランキングキャッシュ (Map ベース: 複数ポケモン対応) ---
const _rankCacheMap = new Map<number, Record<LeagueKey, number[]>>();

function getOrBuildLeagueTables(pokemon: Pokemon): Record<LeagueKey, number[]> {
  const cached = _rankCacheMap.get(pokemon.id);
  if (cached) return cached;

  const tables = {} as Record<LeagueKey, number[]>;
  for (const league of LEAGUE_KEYS) {
    const config = LEAGUE_CONFIGS[league];
    const sps: number[] = [];
    for (let a = 0; a <= 15; a++) {
      for (let d = 0; d <= 15; d++) {
        for (let s = 0; s <= 15; s++) {
          const entry = findMaxLevel(pokemon, a, d, s, config.cpCap, config.maxLevel);
          if (entry) sps.push(entry.sp);
        }
      }
    }
    sps.sort((a, b) => b - a);
    tables[league] = sps;
  }

  _rankCacheMap.set(pokemon.id, tables);
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
  tables: Record<LeagueKey, number[]>,
): IvResult['leagues'] {
  const result: IvResult['leagues'] = {
    little: null, great: null, ultra: null, master: null, master51: null,
  };

  for (const league of LEAGUE_KEYS) {
    const config = LEAGUE_CONFIGS[league];
    const me = findMaxLevel(pokemon, ivAtk, ivDef, ivSta, config.cpCap, config.maxLevel);
    if (!me) continue;

    const sorted = tables[league];
    const bestSp = sorted[0] ?? 1;

    result[league] = {
      rank: findRank(sorted, me.sp),
      maxCp: me.cp,
      maxLevel: me.level,
      statProduct: me.sp,
      scp: calcScp(me.sp),
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
            leagues: { little: null, great: null, ultra: null, master: null, master51: null },
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

/**
 * 進化ランキング計算:
 * 選択ポケモンのIVを指定 → 進化ファミリー全形態のリーグ別順位を返す
 * 前CP = 選択ポケモンの同レベルでのCP
 */
export function calculateEvolutionRankings(
  selectedPokemon: Pokemon,
  ivAtk: number,
  ivDef: number,
  ivSta: number,
): EvolutionRankEntry[] {
  const family = getEvolutionFamily(selectedPokemon.id);
  if (!family) {
    // ファミリーが見つからない場合、選択ポケモン単体で計算
    return [buildSingleRankEntry(selectedPokemon, selectedPokemon, ivAtk, ivDef, ivSta)];
  }

  return family.map((form) =>
    buildSingleRankEntry(form, selectedPokemon, ivAtk, ivDef, ivSta)
  );
}

/** 1形態分のランキングを構築 */
function buildSingleRankEntry(
  form: Pokemon,
  selectedPokemon: Pokemon,
  ivAtk: number,
  ivDef: number,
  ivSta: number,
): EvolutionRankEntry {
  const tables = getOrBuildLeagueTables(form);
  const leagues = {} as Record<LeagueKey, EvolutionLeagueInfo | null>;

  for (const league of LEAGUE_KEYS) {
    const config = LEAGUE_CONFIGS[league];
    const me = findMaxLevel(form, ivAtk, ivDef, ivSta, config.cpCap, config.maxLevel);
    if (!me) {
      leagues[league] = null;
      continue;
    }

    const sorted = tables[league];
    const idx = levelToIndex(me.level);
    const cpm = CPM_TABLE[idx];

    // 前CP: 選択ポケモンの同レベルでのCP
    const preCp = calcCp(
      selectedPokemon.baseAtk, selectedPokemon.baseDef, selectedPokemon.baseSta,
      ivAtk, ivDef, ivSta, cpm,
    );

    leagues[league] = {
      rank: findRank(sorted, me.sp),
      cp: me.cp,
      level: me.level,
      scp: calcScp(me.sp),
      preCp,
    };
  }

  return { pokemon: form, leagues };
}
