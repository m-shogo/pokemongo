/**
 * iv-ocr.user.js のロジック部分をアプリなしで検証するテスト
 *
 * 実行: node test/test-ocr-logic.js
 */

// ---- ユーティリティ関数（本体から抽出） ----

function katakanaToHiragana(str) {
  return str.replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function hiraganaToKatakana(str) {
  return str.replace(/[ぁ-ん]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

function normalizeKatakana(text) {
  if (!text) return '';
  let normalized = text.normalize('NFKC').replace(/[\r\n\s]+/g, '');
  normalized = normalized
    .replace(/力/g, 'カ')
    .replace(/夕/g, 'タ')
    .replace(/口/g, 'ロ')
    .replace(/二/g, 'ニ')
    .replace(/工/g, 'エ')
    .replace(/卜/g, 'ト')
    .replace(/一/g, 'ー');
  const hira = katakanaToHiragana(normalized);
  const kata = hiraganaToKatakana(hira);
  let cleaned = kata.replace(/[^ァ-ヶー]/g, '');
  while (cleaned.length && !/[ァ-ヴヵヶ]/.test(cleaned[0])) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function smoothArray(arr, windowSize) {
  if (windowSize <= 1) return arr.slice();
  const half = Math.floor(windowSize / 2);
  const result = new Array(arr.length).fill(0);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = -half; j <= half; j++) {
      const idx = i + j;
      if (idx < 0 || idx >= arr.length) continue;
      sum += arr[idx];
      count++;
    }
    result[i] = count ? sum / count : arr[i];
  }
  return result;
}

function computeWarmScore(r, g, b, base) {
  const maxCh = Math.max(r, g, b);
  const minCh = Math.min(r, g, b);
  const saturation = maxCh - minCh;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  const warmBoost = Math.max(0, r - Math.max(g, b));
  return saturation * 0.7 + Math.max(0, luminance - base) * 0.25 + warmBoost * 0.45;
}

/**
 * measureGaugeRobust の簡易版（Canvas なしでピクセル配列から直接テスト）
 * @param {number[]} columnScore - 各列のウォームスコア
 * @param {number} width
 */
function measureGaugeFromScores(columnScore, width) {
  const smoothed = smoothArray(columnScore, 5);
  const sorted = [...smoothed].sort((a, b) => a - b);
  const base = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
  const peak = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const dynamicRange = peak - base;

  if (!Number.isFinite(dynamicRange) || dynamicRange < 4) {
    const avgScore = columnScore.reduce((s, v) => s + v, 0) / (columnScore.length || 1);
    if (avgScore < 8) {
      return { ratio: 0, confidence: clamp(0.7 - avgScore * 0.05, 0.3, 0.7) };
    }
    return null;
  }
  const threshold = base + dynamicRange * 0.25;

  let filled = -1;
  let consecutiveMiss = 0;
  let maxGap = 0;
  let hitCount = 0;
  const tolerance = Math.max(2, Math.floor(width * 0.05));
  for (let x = 0; x < width; x++) {
    if (smoothed[x] >= threshold) {
      filled = x;
      hitCount++;
      consecutiveMiss = 0;
    } else if (filled !== -1) {
      consecutiveMiss++;
      if (consecutiveMiss > maxGap) maxGap = consecutiveMiss;
      if (consecutiveMiss > tolerance) break;
    }
  }

  if (filled < 0) {
    const avgScore = columnScore.reduce((s, v) => s + v, 0) / (columnScore.length || 1);
    if (avgScore < threshold * 0.5) {
      return { ratio: 0, confidence: clamp(0.5 - avgScore * 0.02, 0.25, 0.5) };
    }
    return null;
  }
  let ratio = (filled + 1) / width;

  const rightTail = smoothed.slice(Math.max(0, width - Math.floor(width * 0.08)));
  const tailAvg = rightTail.length ? rightTail.reduce((sum, v) => sum + v, 0) / rightTail.length : 0;
  if (tailAvg >= threshold * 0.95) {
    ratio = 1;
  }

  const signalStrength = clamp(dynamicRange / 60, 0, 1);
  const coverageScore = clamp(hitCount / Math.max(width * 0.35, 1), 0, 1);
  const gapScore = 1 - clamp(maxGap / Math.max(width * 0.15, 1), 0, 1);
  const confidence = clamp(signalStrength * 0.55 + coverageScore * 0.25 + gapScore * 0.2, 0, 1);

  return { ratio: clamp(ratio, 0, 1), confidence };
}

// ---- テスト実行 ----

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
}

// ============================
console.log('\n=== 1. 名前OCRホワイトリスト ===');
// ============================

const WHITELIST = 'アイウエオカキクケコガギグゲゴサシスセソザジズゼゾタチツテトダヂヅデドナニヌネノハヒフヘホバビブベボパピプペポマミムメモヤユヨラリルレロワヲンヴァィゥェォッャュョー';

const testNames = [
  'ピカチュウ',
  'ガブリアス',
  'ゲンガー',
  'ギャラドス',
  'バンギラス',
  'ドサイドン',
  'パルキア',
  'ディアルガ',
  'ザシアン',
  'ゾロアーク',
  'カイリュー',
  'メタグロス',
  'ルカリオ',
  'トゲキッス',
  'ボーマンダ',
];

for (const name of testNames) {
  const allInWhitelist = [...name].every((ch) => WHITELIST.includes(ch));
  assert(allInWhitelist, `「${name}」の全文字がホワイトリストに含まれる`);
}

// ============================
console.log('\n=== 2. normalizeKatakana ===');
// ============================

// 漢字誤認識の補正
assert(normalizeKatakana('ピ力チュウ') === 'ピカチュウ', '漢字「力」→「カ」 補正');
assert(normalizeKatakana('カイリュ一') === 'カイリュー', '漢数字がクリーニングされる');
assert(normalizeKatakana('口ズレイド') === 'ロズレイド', '漢字「口」→「ロ」 補正');
assert(normalizeKatakana('卜ゲキッス') === 'トゲキッス', '漢字「卜」→「ト」 補正');
assert(normalizeKatakana('工ーフィ') === 'エーフィ', '漢字「工」→「エ」 補正');

// ひらがな→カタカナ変換
assert(normalizeKatakana('ぴかちゅう') === 'ピカチュウ', 'ひらがな → カタカナ変換');

// ノイズ除去
assert(normalizeKatakana('  ガブリアス  ') === 'ガブリアス', '空白除去');
assert(normalizeKatakana('ーーガブリアス') === 'ガブリアス', '先頭の長音除去');
assert(normalizeKatakana('') === '', '空文字');
assert(normalizeKatakana('abc123') === '', '非カタカナ文字は除去');

// 濁音・半濁音
assert(normalizeKatakana('ガギグゲゴ') === 'ガギグゲゴ', '濁音がそのまま保持される');
assert(normalizeKatakana('パピプペポ') === 'パピプペポ', '半濁音がそのまま保持される');

// ============================
console.log('\n=== 3. IVゲージ IV=0 検出 ===');
// ============================

// 空バー: 全列スコアがほぼ0（灰色の背景のみ）
const emptyBar = new Array(100).fill(0).map(() => Math.random() * 2);
const emptyResult = measureGaugeFromScores(emptyBar, 100);
assert(emptyResult !== null, 'IV=0: null ではなく結果を返す');
assert(emptyResult?.ratio === 0, `IV=0: ratio = 0 (実際: ${emptyResult?.ratio})`);
assert(emptyResult?.confidence > 0.2, `IV=0: 信頼度 > 0.2 (実際: ${emptyResult?.confidence?.toFixed(2)})`);

// 満タンバー: 全列が高スコア
const fullBar = new Array(100).fill(0).map(() => 50 + Math.random() * 20);
const fullResult = measureGaugeFromScores(fullBar, 100);
assert(fullResult !== null, 'IV=15: null ではなく結果を返す');
assert(fullResult?.ratio > 0.9, `IV=15: ratio > 0.9 (実際: ${fullResult?.ratio?.toFixed(2)})`);

// 半分バー: 前半が高スコア、後半が低スコア
const halfBar = new Array(100).fill(0).map((_, i) => i < 50 ? 40 + Math.random() * 15 : Math.random() * 3);
const halfResult = measureGaugeFromScores(halfBar, 100);
assert(halfResult !== null, 'IV≈7: null ではなく結果を返す');
assert(halfResult?.ratio > 0.3 && halfResult?.ratio < 0.7, `IV≈7: ratio ≈ 0.5 (実際: ${halfResult?.ratio?.toFixed(2)})`);

// 低バー（IV=1~2相当）: 先頭数列だけ高スコア
const lowBar = new Array(100).fill(0).map((_, i) => i < 8 ? 35 + Math.random() * 10 : Math.random() * 2);
const lowResult = measureGaugeFromScores(lowBar, 100);
assert(lowResult !== null, 'IV≈1: null ではなく結果を返す');
assert(lowResult?.ratio < 0.2, `IV≈1: ratio < 0.2 (実際: ${lowResult?.ratio?.toFixed(2)})`);

// ============================
console.log('\n=== 結果 ===');
console.log(`合計: ${passed + failed} テスト / 成功: ${passed} / 失敗: ${failed}`);
if (failed > 0) {
  console.log('⚠ 失敗があります！');
  process.exit(1);
} else {
  console.log('全テスト通過');
}
