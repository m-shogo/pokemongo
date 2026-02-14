/**
 * IV 計算ロジックのテスト (Node.js で直接実行)
 *
 * 実行: node --experimental-strip-types web/src/lib/iv-calculator.test.ts
 * または: npx tsx web/src/lib/iv-calculator.test.ts
 */

import { calcCp, calcHp, calculateAllIvCombinations } from './iv-calculator';
import { CPM_TABLE, levelToIndex } from '../data/cpm';
import type { Pokemon, IvInput } from './types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.log(`  \u2717 ${label}`);
  }
}

// --- テスト用ポケモン ---
const pikachu: Pokemon = { id: 25, name: 'ピカチュウ', baseAtk: 112, baseDef: 96, baseSta: 111 };
const mewtwo: Pokemon = { id: 150, name: 'ミュウツー', baseAtk: 300, baseDef: 182, baseSta: 214 };

// ============================
console.log('\n=== 1. CP 計算 ===');
// ============================

// ピカチュウ Lv20 IV15/15/15 → CP 938 (既知値)
const cpmLv20 = CPM_TABLE[levelToIndex(20)];
const pikaCp = calcCp(112, 96, 111, 15, 15, 15, cpmLv20);
assert(pikaCp === 938, `ピカチュウ Lv20 100%: CP=${pikaCp} (期待: 938)`);

// ピカチュウ Lv1 IV0/0/0 → CP 10 (最低値は10)
const cpmLv1 = CPM_TABLE[levelToIndex(1)];
const pikaMinCp = calcCp(112, 96, 111, 0, 0, 0, cpmLv1);
assert(pikaMinCp === 10, `ピカチュウ Lv1 0%: CP=${pikaMinCp} (期待: 10)`);

// ============================
console.log('\n=== 2. HP 計算 ===');
// ============================

const pikaHp = calcHp(111, 15, cpmLv20);
assert(pikaHp >= 10, `ピカチュウ HP >= 10 (実際: ${pikaHp})`);

// ============================
console.log('\n=== 3. IV 組み合わせ計算 ===');
// ============================

// ミュウツー CP=4724 は Lv40 IV15/15/15
const input100: IvInput = {
  cp: 4724,
  hp: null,
  dust: null,
  atk: 15,
  def: 15,
  sta: 15,
  lucky: false,
  purified: false,
  shadow: false,
};
const result100 = calculateAllIvCombinations(mewtwo, input100);
assert(result100.length >= 1, `ミュウツー 100% CP4724: ${result100.length} 件の結果`);
if (result100.length > 0) {
  assert(result100[0].ivPercent === 100, `IV% = ${result100[0].ivPercent} (期待: 100)`);
  assert(result100[0].level === 40, `Level = ${result100[0].level} (期待: 40)`);
}

// キラポケモン: IV下限12
const luckyInput: IvInput = {
  cp: null,
  hp: null,
  dust: 2500,
  atk: null,
  def: null,
  sta: null,
  lucky: true,
  purified: false,
  shadow: false,
};
const luckyResults = calculateAllIvCombinations(pikachu, luckyInput);
const allAbove12 = luckyResults.every((r) => r.atk >= 12 && r.def >= 12 && r.sta >= 12);
assert(allAbove12, `キラポケモン: 全IV >= 12 (${luckyResults.length} 件)`);

// ============================
console.log('\n=== 4. リーグランク ===');
// ============================

// 少ない結果でリーグランクが付与されるか
const rankInput: IvInput = {
  cp: null,
  hp: null,
  dust: null,
  atk: 0,
  def: 15,
  sta: 14,
  lucky: false,
  purified: false,
  shadow: false,
};
const rankResults = calculateAllIvCombinations(pikachu, rankInput);
const withLeague = rankResults.filter((r) => r.leagues.great !== null);
assert(withLeague.length > 0, `リーグランクが付与されている (${withLeague.length} 件)`);
if (withLeague.length > 0) {
  const gl = withLeague[0].leagues.great!;
  assert(gl.rank >= 1 && gl.rank <= 4096, `スーパーリーグ rank=${gl.rank}`);
  assert(gl.percentOfBest > 0 && gl.percentOfBest <= 100, `percentOfBest=${gl.percentOfBest}%`);
  assert(gl.scp > 0, `SCP=${gl.scp}`);

  // 500リーグ
  const lt = withLeague[0].leagues.little;
  assert(lt !== null, 'リトルリーグ(500)ランクが存在');
  if (lt) {
    assert(lt.rank >= 1 && lt.rank <= 4096, `リトルリーグ rank=${lt.rank}`);
    assert(lt.maxCp <= 500, `リトルリーグ CP=${lt.maxCp} <= 500`);
  }

  // マスターリーグ Lv50/51
  const ml50 = withLeague[0].leagues.master;
  const ml51 = withLeague[0].leagues.master51;
  assert(ml50 !== null, 'マスターリーグ(Lv50)ランクが存在');
  assert(ml51 !== null, 'マスターリーグ(Lv51)ランクが存在');
  if (ml50 && ml51) {
    assert(ml50.maxLevel === 50, `ML Lv50: maxLevel=${ml50.maxLevel}`);
    assert(ml51.maxLevel === 51, `ML Lv51: maxLevel=${ml51.maxLevel}`);
    assert(ml51.maxCp >= ml50.maxCp, `ML Lv51 CP >= Lv50 CP`);
    assert(ml51.scp >= ml50.scp, `ML Lv51 SCP >= Lv50 SCP`);
  }
}

// ============================
console.log('\n=== 5. CPM テーブル整合性 ===');
// ============================

assert(CPM_TABLE.length === 109, `CPMテーブル長: ${CPM_TABLE.length} (期待: 109)`);
assert(CPM_TABLE[0] === 0.094, `Lv1 CPM = ${CPM_TABLE[0]}`);
assert(levelToIndex(40) === 78, `Lv40 index = ${levelToIndex(40)} (期待: 78)`);
// CPM は単調増加
let monotonic = true;
for (let i = 1; i < CPM_TABLE.length; i++) {
  if (CPM_TABLE[i] <= CPM_TABLE[i - 1]) {
    monotonic = false;
    console.log(`    CPM[${i}]=${CPM_TABLE[i]} <= CPM[${i-1}]=${CPM_TABLE[i-1]}`);
  }
}
assert(monotonic, 'CPM テーブルが単調増加');

// ============================
console.log('\n=== 結果 ===');
console.log(`合計: ${passed + failed} テスト / 成功: ${passed} / 失敗: ${failed}`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('全テスト通過');
}
