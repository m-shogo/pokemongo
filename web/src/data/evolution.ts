import type { Pokemon } from '../lib/types';

/**
 * 進化チェーンデータ
 * 各ファミリーは最終進化形（メガ含む）→ 基本形の順
 * メガ進化: id = 10000 + dexId, メガX: 20000 + dexId, メガY: 30000 + dexId
 */
export const EVOLUTION_FAMILIES: Pokemon[][] = [
  // --- 第1世代 ---
  // フシギダネ系
  [
    { id: 10003, name: 'メガフシギバナ', baseAtk: 241, baseDef: 246, baseSta: 190 },
    { id: 3, name: 'フシギバナ', baseAtk: 198, baseDef: 189, baseSta: 190 },
    { id: 2, name: 'フシギソウ', baseAtk: 151, baseDef: 143, baseSta: 155 },
    { id: 1, name: 'フシギダネ', baseAtk: 118, baseDef: 111, baseSta: 128 },
  ],
  // ヒトカゲ系
  [
    { id: 30006, name: 'メガリザードンY', baseAtk: 319, baseDef: 212, baseSta: 186 },
    { id: 20006, name: 'メガリザードンX', baseAtk: 273, baseDef: 213, baseSta: 186 },
    { id: 6, name: 'リザードン', baseAtk: 223, baseDef: 173, baseSta: 186 },
    { id: 5, name: 'リザード', baseAtk: 158, baseDef: 126, baseSta: 151 },
    { id: 4, name: 'ヒトカゲ', baseAtk: 116, baseDef: 93, baseSta: 118 },
  ],
  // ゼニガメ系
  [
    { id: 10009, name: 'メガカメックス', baseAtk: 264, baseDef: 237, baseSta: 188 },
    { id: 9, name: 'カメックス', baseAtk: 171, baseDef: 207, baseSta: 188 },
    { id: 8, name: 'カメール', baseAtk: 126, baseDef: 155, baseSta: 153 },
    { id: 7, name: 'ゼニガメ', baseAtk: 94, baseDef: 121, baseSta: 127 },
  ],
  // ピカチュウ系
  [
    { id: 26, name: 'ライチュウ', baseAtk: 193, baseDef: 151, baseSta: 155 },
    { id: 25, name: 'ピカチュウ', baseAtk: 112, baseDef: 96, baseSta: 111 },
  ],
  // ウインディ系
  [
    { id: 59, name: 'ウインディ', baseAtk: 227, baseDef: 166, baseSta: 207 },
  ],
  // フーディン系
  [
    { id: 10065, name: 'メガフーディン', baseAtk: 367, baseDef: 193, baseSta: 146 },
    { id: 65, name: 'フーディン', baseAtk: 271, baseDef: 167, baseSta: 146 },
  ],
  // カイリキー系
  [
    { id: 68, name: 'カイリキー', baseAtk: 234, baseDef: 159, baseSta: 207 },
  ],
  // ゲンガー系
  [
    { id: 10094, name: 'メガゲンガー', baseAtk: 349, baseDef: 199, baseSta: 155 },
    { id: 94, name: 'ゲンガー', baseAtk: 261, baseDef: 149, baseSta: 155 },
  ],
  // サイドン → ドサイドン系
  [
    { id: 464, name: 'ドサイドン', baseAtk: 241, baseDef: 190, baseSta: 251 },
    { id: 112, name: 'サイドン', baseAtk: 222, baseDef: 171, baseSta: 233 },
  ],
  // ギャラドス系
  [
    { id: 10130, name: 'メガギャラドス', baseAtk: 292, baseDef: 247, baseSta: 216 },
    { id: 130, name: 'ギャラドス', baseAtk: 237, baseDef: 186, baseSta: 216 },
  ],
  // ラプラス (単体)
  [
    { id: 131, name: 'ラプラス', baseAtk: 165, baseDef: 174, baseSta: 277 },
  ],
  // イーブイ系 (各進化は個別ファミリー扱い)
  [
    { id: 134, name: 'シャワーズ', baseAtk: 205, baseDef: 161, baseSta: 277 },
  ],
  [
    { id: 135, name: 'サンダース', baseAtk: 232, baseDef: 182, baseSta: 163 },
  ],
  [
    { id: 136, name: 'ブースター', baseAtk: 246, baseDef: 179, baseSta: 163 },
  ],
  [
    { id: 196, name: 'エーフィ', baseAtk: 261, baseDef: 175, baseSta: 163 },
  ],
  [
    { id: 197, name: 'ブラッキー', baseAtk: 126, baseDef: 240, baseSta: 216 },
  ],
  [
    { id: 700, name: 'ニンフィア', baseAtk: 203, baseDef: 205, baseSta: 216 },
  ],
  // カビゴン (単体)
  [
    { id: 143, name: 'カビゴン', baseAtk: 190, baseDef: 169, baseSta: 330 },
  ],
  // カイリュー系
  [
    { id: 149, name: 'カイリュー', baseAtk: 263, baseDef: 198, baseSta: 209 },
  ],
  // ミュウツー (単体)
  [
    { id: 150, name: 'ミュウツー', baseAtk: 300, baseDef: 182, baseSta: 214 },
  ],
  // ミュウ (単体)
  [
    { id: 151, name: 'ミュウ', baseAtk: 210, baseDef: 210, baseSta: 225 },
  ],
  // --- 第2世代 ---
  // メガニウム系
  [
    { id: 154, name: 'メガニウム', baseAtk: 168, baseDef: 202, baseSta: 190 },
  ],
  // バクフーン系
  [
    { id: 157, name: 'バクフーン', baseAtk: 223, baseDef: 173, baseSta: 186 },
  ],
  // オーダイル系
  [
    { id: 160, name: 'オーダイル', baseAtk: 205, baseDef: 188, baseSta: 198 },
  ],
  // デンリュウ系
  [
    { id: 10181, name: 'メガデンリュウ', baseAtk: 294, baseDef: 203, baseSta: 207 },
    { id: 181, name: 'デンリュウ', baseAtk: 211, baseDef: 169, baseSta: 207 },
  ],
  // ハガネール系
  [
    { id: 10208, name: 'メガハガネール', baseAtk: 212, baseDef: 327, baseSta: 181 },
    { id: 208, name: 'ハガネール', baseAtk: 148, baseDef: 272, baseSta: 181 },
  ],
  // ハッサム系
  [
    { id: 10212, name: 'メガハッサム', baseAtk: 279, baseDef: 250, baseSta: 172 },
    { id: 212, name: 'ハッサム', baseAtk: 236, baseDef: 181, baseSta: 172 },
  ],
  // バンギラス系
  [
    { id: 10248, name: 'メガバンギラス', baseAtk: 309, baseDef: 276, baseSta: 225 },
    { id: 248, name: 'バンギラス', baseAtk: 251, baseDef: 207, baseSta: 225 },
  ],
  // ルギア (単体)
  [
    { id: 249, name: 'ルギア', baseAtk: 193, baseDef: 310, baseSta: 235 },
  ],
  // ホウオウ (単体)
  [
    { id: 250, name: 'ホウオウ', baseAtk: 239, baseDef: 244, baseSta: 214 },
  ],
  // --- 第3世代 ---
  // バシャーモ系
  [
    { id: 10257, name: 'メガバシャーモ', baseAtk: 329, baseDef: 168, baseSta: 190 },
    { id: 257, name: 'バシャーモ', baseAtk: 240, baseDef: 141, baseSta: 190 },
  ],
  // ラグラージ系
  [
    { id: 10260, name: 'メガラグラージ', baseAtk: 283, baseDef: 218, baseSta: 225 },
    { id: 260, name: 'ラグラージ', baseAtk: 208, baseDef: 175, baseSta: 225 },
  ],
  // サーナイト系 (エルレイドと共有ファミリー)
  [
    { id: 10282, name: 'メガサーナイト', baseAtk: 326, baseDef: 229, baseSta: 169 },
    { id: 282, name: 'サーナイト', baseAtk: 237, baseDef: 195, baseSta: 169 },
    { id: 475, name: 'エルレイド', baseAtk: 237, baseDef: 195, baseSta: 169 },
  ],
  // ハリテヤマ (単体)
  [
    { id: 297, name: 'ハリテヤマ', baseAtk: 209, baseDef: 114, baseSta: 302 },
  ],
  // ボスゴドラ系
  [
    { id: 10306, name: 'メガボスゴドラ', baseAtk: 247, baseDef: 331, baseSta: 172 },
    { id: 306, name: 'ボスゴドラ', baseAtk: 198, baseDef: 257, baseSta: 172 },
  ],
  // フライゴン (単体)
  [
    { id: 330, name: 'フライゴン', baseAtk: 205, baseDef: 168, baseSta: 190 },
  ],
  // ボーマンダ系
  [
    { id: 10373, name: 'メガボーマンダ', baseAtk: 310, baseDef: 251, baseSta: 216 },
    { id: 373, name: 'ボーマンダ', baseAtk: 277, baseDef: 168, baseSta: 216 },
  ],
  // メタグロス系
  [
    { id: 10376, name: 'メガメタグロス', baseAtk: 300, baseDef: 289, baseSta: 190 },
    { id: 376, name: 'メタグロス', baseAtk: 257, baseDef: 228, baseSta: 190 },
  ],
  // レジスチル (単体)
  [
    { id: 379, name: 'レジスチル', baseAtk: 143, baseDef: 285, baseSta: 190 },
  ],
  // カイオーガ (単体)
  [
    { id: 382, name: 'カイオーガ', baseAtk: 270, baseDef: 228, baseSta: 205 },
  ],
  // グラードン (単体)
  [
    { id: 383, name: 'グラードン', baseAtk: 270, baseDef: 228, baseSta: 205 },
  ],
  // レックウザ系
  [
    { id: 10384, name: 'メガレックウザ', baseAtk: 354, baseDef: 236, baseSta: 213 },
    { id: 384, name: 'レックウザ', baseAtk: 284, baseDef: 170, baseSta: 213 },
  ],
  // --- 第4世代 ---
  // ゴウカザル (単体)
  [
    { id: 392, name: 'ゴウカザル', baseAtk: 222, baseDef: 151, baseSta: 183 },
  ],
  // エンペルト (単体)
  [
    { id: 395, name: 'エンペルト', baseAtk: 210, baseDef: 186, baseSta: 197 },
  ],
  // ロズレイド (単体)
  [
    { id: 407, name: 'ロズレイド', baseAtk: 243, baseDef: 185, baseSta: 155 },
  ],
  // ラムパルド (単体)
  [
    { id: 409, name: 'ラムパルド', baseAtk: 295, baseDef: 109, baseSta: 219 },
  ],
  // ガブリアス系
  [
    { id: 10445, name: 'メガガブリアス', baseAtk: 339, baseDef: 222, baseSta: 239 },
    { id: 445, name: 'ガブリアス', baseAtk: 261, baseDef: 193, baseSta: 239 },
  ],
  // ルカリオ系
  [
    { id: 10448, name: 'メガルカリオ', baseAtk: 310, baseDef: 175, baseSta: 172 },
    { id: 448, name: 'ルカリオ', baseAtk: 236, baseDef: 144, baseSta: 172 },
  ],
  // マニューラ (単体)
  [
    { id: 461, name: 'マニューラ', baseAtk: 243, baseDef: 171, baseSta: 172 },
  ],
  // トゲキッス (単体)
  [
    { id: 468, name: 'トゲキッス', baseAtk: 225, baseDef: 217, baseSta: 198 },
  ],
  // グライオン (単体)
  [
    { id: 472, name: 'グライオン', baseAtk: 185, baseDef: 222, baseSta: 181 },
  ],
  // マンムー (単体)
  [
    { id: 473, name: 'マンムー', baseAtk: 247, baseDef: 146, baseSta: 242 },
  ],
  // ディアルガ (単体)
  [
    { id: 483, name: 'ディアルガ', baseAtk: 275, baseDef: 211, baseSta: 205 },
  ],
  // パルキア (単体)
  [
    { id: 484, name: 'パルキア', baseAtk: 280, baseDef: 215, baseSta: 189 },
  ],
  // ギラティナ (単体)
  [
    { id: 487, name: 'ギラティナ', baseAtk: 187, baseDef: 225, baseSta: 284 },
  ],
  // --- 第5世代 ---
  // ローブシン (単体)
  [
    { id: 534, name: 'ローブシン', baseAtk: 243, baseDef: 158, baseSta: 233 },
  ],
  // オノノクス (単体)
  [
    { id: 612, name: 'オノノクス', baseAtk: 284, baseDef: 172, baseSta: 183 },
  ],
  // サザンドラ (単体)
  [
    { id: 635, name: 'サザンドラ', baseAtk: 256, baseDef: 188, baseSta: 211 },
  ],
  // コバルオン (単体)
  [
    { id: 638, name: 'コバルオン', baseAtk: 192, baseDef: 229, baseSta: 209 },
  ],
  // ゼクロム (単体)
  [
    { id: 644, name: 'ゼクロム', baseAtk: 275, baseDef: 211, baseSta: 205 },
  ],
  // ランドロス (単体)
  [
    { id: 645, name: 'ランドロス', baseAtk: 261, baseDef: 182, baseSta: 205 },
  ],
  // --- 第6世代以降 ---
  // ジガルデ (単体)
  [
    { id: 718, name: 'ジガルデ', baseAtk: 203, baseDef: 232, baseSta: 268 },
  ],
  // ザシアン (単体)
  [
    { id: 888, name: 'ザシアン', baseAtk: 254, baseDef: 236, baseSta: 192 },
  ],
  // ザマゼンタ (単体)
  [
    { id: 889, name: 'ザマゼンタ', baseAtk: 254, baseDef: 236, baseSta: 192 },
  ],
];

// pokemonId → ファミリーのインデックスマップ (初回アクセス時に構築)
let _familyMap: Map<number, number> | null = null;

function buildFamilyMap(): Map<number, number> {
  if (_familyMap) return _familyMap;
  _familyMap = new Map();
  for (let i = 0; i < EVOLUTION_FAMILIES.length; i++) {
    for (const form of EVOLUTION_FAMILIES[i]) {
      _familyMap.set(form.id, i);
    }
  }
  return _familyMap;
}

/** 指定ポケモンの進化ファミリーを取得 (最終進化形→基本形の順) */
export function getEvolutionFamily(pokemonId: number): Pokemon[] | null {
  const map = buildFamilyMap();
  const idx = map.get(pokemonId);
  if (idx === undefined) return null;
  return EVOLUTION_FAMILIES[idx];
}
