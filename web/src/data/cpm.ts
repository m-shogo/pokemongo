/**
 * CP Multiplier (CPM) テーブル
 * レベル 1 ~ 55 (0.5刻み) = 109 エントリ
 * levelToIndex(level) で index を取得
 */
export const CPM_TABLE: readonly number[] = [
  // Lv 1-10
  0.094,      0.13513744, 0.16639787, 0.19265091,
  0.21573247, 0.23567772, 0.25572005, 0.27353038,
  0.29024988, 0.30672948, 0.3225,     0.33567771,
  0.34921268, 0.36169922, 0.37523559, 0.38759242,
  0.39956728, 0.41114264, 0.42250001, 0.43292641,
  // Lv 11-20
  0.44310755, 0.45305996, 0.46279839, 0.47232164,
  0.48168495, 0.49088359, 0.49985844, 0.50870176,
  0.51739395, 0.52593927, 0.53435433, 0.54263576,
  0.55079269, 0.55883060, 0.56675452, 0.57456912,
  0.58227891, 0.58988880, 0.59740001, 0.60481550,
  // Lv 21-30
  0.61215729, 0.61940412, 0.62656713, 0.63364918,
  0.64065295, 0.64758096, 0.65443563, 0.66121926,
  0.66793400, 0.67458225, 0.68116492, 0.68768418,
  0.69414365, 0.70054287, 0.70688421, 0.71316660,
  0.71939909, 0.72557561, 0.73170000, 0.73474102,
  // Lv 31-40
  0.73776948, 0.74078556, 0.74378943, 0.74678117,
  0.74976104, 0.75272915, 0.75568551, 0.75863037,
  0.76156384, 0.76448607, 0.76739717, 0.77029727,
  0.77318650, 0.77606494, 0.77893275, 0.78179006,
  0.78463697, 0.78747358, 0.79030001, 0.79311998,
  // Lv 41-50
  0.79592990, 0.79872982, 0.80151970, 0.80429955,
  0.80706939, 0.80982920, 0.81257897, 0.81531870,
  0.81804842, 0.82076808, 0.82347773, 0.82617738,
  0.82886700, 0.83154660, 0.83421618, 0.83687574,
  0.83952528, 0.84216480, 0.84479430, 0.84741378,
  // Lv 51-55
  0.85002324, 0.85262268, 0.85521210, 0.85779150,
  0.86036088, 0.86292024, 0.86547958, 0.86802890,
  0.87056820,
];

/** レベル (1.0~55.0) → CPM_TABLE の index */
export function levelToIndex(level: number): number {
  return Math.round((level - 1) * 2);
}

/** CPM_TABLE の index → レベル */
export function indexToLevel(index: number): number {
  return 1 + index * 0.5;
}

/** ほしのすな → レベル範囲 */
export const DUST_TO_LEVEL: readonly { dust: number; minLevel: number; maxLevel: number }[] = [
  { dust: 200,    minLevel: 1,    maxLevel: 2.5 },
  { dust: 400,    minLevel: 3,    maxLevel: 4.5 },
  { dust: 600,    minLevel: 5,    maxLevel: 6.5 },
  { dust: 800,    minLevel: 7,    maxLevel: 8.5 },
  { dust: 1000,   minLevel: 9,    maxLevel: 10.5 },
  { dust: 1300,   minLevel: 11,   maxLevel: 12.5 },
  { dust: 1600,   minLevel: 13,   maxLevel: 14.5 },
  { dust: 1900,   minLevel: 15,   maxLevel: 16.5 },
  { dust: 2200,   minLevel: 17,   maxLevel: 18.5 },
  { dust: 2500,   minLevel: 19,   maxLevel: 20.5 },
  { dust: 3000,   minLevel: 21,   maxLevel: 22.5 },
  { dust: 3500,   minLevel: 23,   maxLevel: 24.5 },
  { dust: 4000,   minLevel: 25,   maxLevel: 26.5 },
  { dust: 4500,   minLevel: 27,   maxLevel: 28.5 },
  { dust: 5000,   minLevel: 29,   maxLevel: 30.5 },
  { dust: 6000,   minLevel: 31,   maxLevel: 32.5 },
  { dust: 7000,   minLevel: 33,   maxLevel: 34.5 },
  { dust: 8000,   minLevel: 35,   maxLevel: 36.5 },
  { dust: 9000,   minLevel: 37,   maxLevel: 38.5 },
  { dust: 10000,  minLevel: 39,   maxLevel: 40.5 },
  { dust: 12000,  minLevel: 41,   maxLevel: 42.5 },
  { dust: 14000,  minLevel: 43,   maxLevel: 44.5 },
  { dust: 16000,  minLevel: 45,   maxLevel: 46.5 },
  { dust: 18000,  minLevel: 47,   maxLevel: 48.5 },
  { dust: 20000,  minLevel: 49,   maxLevel: 50.5 },
];
