/** ポケモンの種族値定義 */
export interface Pokemon {
  id: number;
  name: string;
  baseAtk: number;
  baseDef: number;
  baseSta: number;
}

/** ユーザー入力 */
export interface IvInput {
  cp: number | null;
  hp: number | null;
  dust: number | null;
  atk: number | null;   // 0-15 (ゲージ手入力時)
  def: number | null;   // 0-15
  sta: number | null;   // 0-15
  lucky: boolean;       // キラポケモン (IV下限 12)
  purified: boolean;    // リトレーンポケモン
  shadow: boolean;      // シャドウポケモン
}

/** リーグキー */
export type LeagueKey = 'little' | 'great' | 'ultra' | 'master' | 'master51';

/** IV 計算結果 1件 */
export interface IvResult {
  level: number;
  atk: number;          // 0-15
  def: number;          // 0-15
  sta: number;          // 0-15
  cp: number;
  hp: number;
  ivPercent: number;    // 0-100
  statProduct: number;  // PvP 用: atk * def * sta
  /** リーグ別ランク情報 */
  leagues: Record<LeagueKey, LeagueRank | null>;
}

/** リーグ内での順位情報 */
export interface LeagueRank {
  rank: number;         // 1位 = 最高
  maxCp: number;        // そのリーグ上限でのCP
  maxLevel: number;     // そのリーグ上限でのレベル
  statProduct: number;
  scp: number;          // SCP: (statProduct)^(2/3) / 10
  percentOfBest: number; // 1位の stat product に対する割合 (%)
}

/** 進化ランキング: リーグ別情報 */
export interface EvolutionLeagueInfo {
  rank: number;
  cp: number;
  level: number;
  scp: number;
  preCp: number;        // 前CP: 選択ポケモンの同レベルでのCP
}

/** 進化ランキング: 1形態分 */
export interface EvolutionRankEntry {
  pokemon: Pokemon;
  leagues: Record<LeagueKey, EvolutionLeagueInfo | null>;
}

/** ほしのすな → レベル範囲テーブル */
export interface DustLevel {
  dust: number;
  minLevel: number;
  maxLevel: number;
}
