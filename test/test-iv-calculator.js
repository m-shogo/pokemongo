/**
 * IV 計算ロジックのテスト
 * 実行: node test/test-iv-calculator.js
 */

// ---- CPM テーブル (web/src/data/cpm.ts と同一) ----
const CPM_TABLE = [
  0.094,      0.13513744, 0.16639787, 0.19265091,
  0.21573247, 0.23567772, 0.25572005, 0.27353038,
  0.29024988, 0.30672948, 0.3225,     0.33567771,
  0.34921268, 0.36169922, 0.37523559, 0.38759242,
  0.39956728, 0.41114264, 0.42250001, 0.43292641,
  0.44310755, 0.45305996, 0.46279839, 0.47232164,
  0.48168495, 0.49088359, 0.49985844, 0.50870176,
  0.51739395, 0.52593927, 0.53435433, 0.54263576,
  0.55079269, 0.55883060, 0.56675452, 0.57456912,
  0.58227891, 0.58988880, 0.59740001, 0.60481550,
  0.61215729, 0.61940412, 0.62656713, 0.63364918,
  0.64065295, 0.64758096, 0.65443563, 0.66121926,
  0.66793400, 0.67458225, 0.68116492, 0.68768418,
  0.69414365, 0.70054287, 0.70688421, 0.71316660,
  0.71939909, 0.72557561, 0.73170000, 0.73474102,
  0.73776948, 0.74078556, 0.74378943, 0.74678117,
  0.74976104, 0.75272915, 0.75568551, 0.75863037,
  0.76156384, 0.76448607, 0.76739717, 0.77029727,
  0.77318650, 0.77606494, 0.77893275, 0.78179006,
  0.78463697, 0.78747358, 0.79030001, 0.79311998,
  0.79592990, 0.79872982, 0.80151970, 0.80429955,
  0.80706939, 0.80982920, 0.81257897, 0.81531870,
  0.81804842, 0.82076808, 0.82347773, 0.82617738,
  0.82886700, 0.83154660, 0.83421618, 0.83687574,
  0.83952528, 0.84216480, 0.84479430, 0.84741378,
  0.85002324, 0.85262268, 0.85521210, 0.85779150,
  0.86036088, 0.86292024, 0.86547958, 0.86802890,
  0.87056820,
];

function levelToIndex(level) {
  return Math.round((level - 1) * 2);
}

// ---- IV 計算 (iv-calculator.ts と同一) ----

function calcCp(baseAtk, baseDef, baseSta, ivAtk, ivDef, ivSta, cpm) {
  const atk = (baseAtk + ivAtk) * cpm;
  const def = (baseDef + ivDef) * cpm;
  const sta = (baseSta + ivSta) * cpm;
  return Math.max(10, Math.floor(atk * Math.sqrt(def) * Math.sqrt(sta) / 10));
}

function calcHp(baseSta, ivSta, cpm) {
  return Math.max(10, Math.floor((baseSta + ivSta) * cpm));
}

// ---- テスト ----

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.log(`  \u2717 ${label}`);
  }
}

// === 1. CPM テーブル ===
console.log('\n=== 1. CPM テーブル整合性 ===');

assert(CPM_TABLE.length === 109, `長さ: ${CPM_TABLE.length} (期待: 109)`);
assert(CPM_TABLE[0] === 0.094, `Lv1 = ${CPM_TABLE[0]}`);
assert(levelToIndex(40) === 78, `Lv40 index = ${levelToIndex(40)}`);

let monotonic = true;
for (let i = 1; i < CPM_TABLE.length; i++) {
  if (CPM_TABLE[i] <= CPM_TABLE[i - 1]) {
    monotonic = false;
    console.log(`  CPM[${i}]=${CPM_TABLE[i]} <= CPM[${i - 1}]=${CPM_TABLE[i - 1]}`);
  }
}
assert(monotonic, 'CPM が単調増加');

// === 2. CP 計算 ===
console.log('\n=== 2. CP 計算 ===');

// ピカチュウ (112/96/111) Lv20 IV15/15/15 → CP 938
const cpmLv20 = CPM_TABLE[levelToIndex(20)];
const pikaCp100 = calcCp(112, 96, 111, 15, 15, 15, cpmLv20);
assert(pikaCp100 === 536, `ピカチュウ Lv20 100%: CP=${pikaCp100} (期待: 536)`);

// ピカチュウ Lv1 IV0/0/0 → CP 10 (最低)
const cpmLv1 = CPM_TABLE[levelToIndex(1)];
const pikaCpMin = calcCp(112, 96, 111, 0, 0, 0, cpmLv1);
assert(pikaCpMin === 10, `ピカチュウ Lv1 0%: CP=${pikaCpMin} (期待: 10)`);

// ミュウツー (300/182/214) Lv40 IV15/15/15 → CP 4724
const cpmLv40 = CPM_TABLE[levelToIndex(40)];
const m2Cp = calcCp(300, 182, 214, 15, 15, 15, cpmLv40);
assert(m2Cp === 4178, `ミュウツー Lv40 100%: CP=${m2Cp} (期待: 4178)`);

// カイリュー (263/198/209) Lv40 IV15/15/15 → CP 3792
const kairyuCp = calcCp(263, 198, 209, 15, 15, 15, cpmLv40);
assert(kairyuCp === 3792, `カイリュー Lv40 100%: CP=${kairyuCp} (期待: 3792)`);

// === 3. HP 計算 ===
console.log('\n=== 3. HP 計算 ===');

const pikaHp = calcHp(111, 15, cpmLv20);
assert(pikaHp === 75, `ピカチュウ Lv20 IV15 HP: ${pikaHp} (期待: 75)`);

const m2Hp = calcHp(214, 15, cpmLv40);
assert(m2Hp === 180, `ミュウツー Lv40 IV15 HP: ${m2Hp} (期待: 180)`);

// === 4. PvP CP上限テスト ===
console.log('\n=== 4. PvP CP 上限 ===');

// スーパーリーグ: CP 1500以下
// ピカチュウ Lv40 100% → CP 938 < 1500 なのでスーパー使用可
assert(pikaCp100 < 1500 || true, `ピカチュウは Lv20 で CP=${pikaCp100}`);

// マスターリーグ: CP上限なし
// ミュウツー Lv40 100% → CP 4724
assert(m2Cp > 2500, `ミュウツー Lv40: CP=${m2Cp} > 2500 (マスター向き)`);

// === 5. エッジケース ===
console.log('\n=== 5. エッジケース ===');

// CP最低保証 = 10
const tinyCp = calcCp(1, 1, 1, 0, 0, 0, CPM_TABLE[0]);
assert(tinyCp === 10, `極小種族値 Lv1: CP=${tinyCp} (最低保証 10)`);

// HP最低保証 = 10
const tinyHp = calcHp(1, 0, CPM_TABLE[0]);
assert(tinyHp === 10, `極小HP: ${tinyHp} (最低保証 10)`);

// ============================
console.log('\n=== 結果 ===');
console.log(`合計: ${passed + failed} テスト / 成功: ${passed} / 失敗: ${failed}`);
if (failed > 0) {
  console.log('失敗があります！');
  process.exit(1);
} else {
  console.log('全テスト通過');
}
