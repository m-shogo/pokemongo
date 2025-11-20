# OCR パフォーマンス改善ロードマップ

既存の Tampermonkey スクリプト（`tampermonkey/iv-ocr.user.js`）へ段階的に改善を加える手順です。各ステップごとに挙動確認を行い、既存機能（自動入力、手動入力保持、ROI 操作など）への回 regressions を防ぐことを目的とします。

---

## Step 0: リポジトリの準備と計測環境の確認
- ブランチを分けて作業する（例: `feature/ocr-optimization`）。
- Chrome DevTools の Performance / Memory タブを使って CPU 時間とヒープ使用量を計測できるようにする。
- スクリプト内で `console.time('ocr-frame')` → `console.timeEnd('ocr-frame')` を仮利用し、処理時間を把握できるようにする（後で削除）。
- **確認項目**: 現状の自動入力、手動入力保持、ROI 校正がすべて正常に動く。

-## Step 1: ディスプレイ解像度とフレーム頻度の最適化
- `adjustCanvasResolution` に 360×640 上限を設け、動画解像度が高い場合は縮小して描画・OCR する。
- OCR/IV/名前の `throttle` をそれぞれ 750ms / 650ms / 1800ms に設定し、CPU コスト低減と体感レスポンスのバランスを取る。
- **リスク**: サイズを下げ過ぎると OCR の精度が落ちる。ROI 位置がズレていないか確認。
- **確認項目**: CP/HP/すな/名前の OCR 精度と自動入力タイミングが変わっていないか、手動 IV 解除が正しく動くか。

## Step 2: 画像前処理ユーティリティの導入
- `preprocessCanvas(srcCanvas, options)` のような関数を追加し、明度・コントラスト・2値化を行う。TypeScript で管理する場合は `PreprocessOptions` 型を定義。
- OCR へ渡す前に ROI ごとに前処理を行い、ログを切り替えて効果を比較する。
- **リスク**: 二値化の閾値が不適切だと全面白/黒になる。オプションを段階的に試験する。
- **確認項目**: 前処理 ON/OFF を切り替えて OCR 精度を比較。視覚的に ROI が適切に保たれているか。

## Step 3: 値の安定化と検証ロジックの強化
- 現在の `stabilize` / `stabilizeIvSamples` を見直し、移動平均や中央値フィルタを導入して瞬間的なノイズを除去。
- 読み取った値を候補リストと照合し、閾値より差が大きい場合はリトライや警告を出す。
- **リスク**: 安定化バッファが大きすぎるとレスポンスが遅くなる。バッファ長と閾値をログで調整。
- **確認項目**: 手動入力保持ロジックに影響がないか（スワイプ検知が遅れていないか）。

## Step 4: Web Worker への処理分離
- `workers/ocrWorker.js`（または `ts`）を追加し、OCR と前処理を Worker へ移す。
- メインスレッドではキャンバスから `ImageData` を切り出し、Worker へポスト。Worker 側で Tesseract を呼び出す。
- メッセージ型例:
  ```ts
  type OcrRequest = { id: string; roi: ROI; imageData: ImageData };
  type OcrResponse = { id: string; text: string; confidence: number };
  ```
- **リスク**: Worker 未対応環境では従来の同期処理にフォールバックする必要がある。
- **確認項目**: Worker 導入後も UI レスポンスが向上（フリーズしなくなる）しているか。停止時に `worker.terminate()` が呼ばれているか。

## Step 5: OffscreenCanvas の活用とフォールバック
- Worker 内で `OffscreenCanvas` を使える場合は描画から前処理まで完結させる。
- 非対応ブラウザではメインスレッドの `HTMLCanvasElement` で代替し、処理は Step 4 のワーカー構成を保つ。
- **リスク**: HTTPS でないページや古い Edge などでは `OffscreenCanvas` が無効。`instanceof OffscreenCanvas` で判定し、try-catch でフォールバック。
- **確認項目**: `OffscreenCanvas` 利用時とフォールバック時の挙動が一致しているか。

## Step 6: メモリ管理とクリーンアップ
- OCR 結果のバッファ長を固定（例: 数十件）にし、`shift()` で古いデータを破棄する。
- `stopCapture()` で `ImageData` や Worker を確実に解放。イベントリスナーの解除と `requestAnimationFrame` のキャンセルを再確認。
- **リスク**: クリーンアップ漏れがあるとタブ閉鎖までメモリが解放されない。
- **確認項目**: Chrome の Memory プロファイルでスナップショットを比較し、リークがないか確認。

## Step 7: リグレッションテストとユーザー確認
- 各ステップ完了ごとに主要なシナリオ（自動入力、手動入力保持、ROI 校正、スワイプ検知、候補ボタン）をチェック。
- 問題がなければ Pull Request としてまとめ、レビュー時に計測結果・改善点・既存機能の確認内容を添付。
- 必要に応じてロールバックしやすいよう、機能フラグや設定値を `localStorage` でトグル可能にしておく。

---

各ステップは単体でコミットし、都度既存機能が壊れていないかを確認してから次に進んでください。必要であればステップ順を入れ替えても構いませんが、事前に計測と確認を行うことを推奨します。