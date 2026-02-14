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
- `preprocessCanvas(srcCanvas, options)` を実装し、明度 1.15 / コントラスト 1.25 / 二値化しきい値 150（数値系）と、名前用に 1.05 / 1.15 / 140 のプロファイルを用意。
- `readAll`（CP/HP/すな）と `readPokemonName` の切り出し結果へ自動適用し、OCR 精度向上とノイズ低減を図る。
- **リスク**: 二値化の閾値が不適切だと全面白/黒になる。オプションを段階的に試験する。
- **確認項目**: 前処理 ON/OFF を切り替えて OCR 精度を比較。視覚的に ROI が適切に保たれているか。

## Step 3: 値の安定化と検証ロジックの強化
- `stabilize` を 5 サンプル構成の中央値＋外れ値確認に刷新し、CP/HP/すな単位で「前回値との差分が閾値を超える場合は2回連続で一致するまで保留」する確認フローを導入。
- `stabilizeIvSamples` でも同様の確認キューを追加し、IV 推定が 1 以上変動する場合は連続観測で裏付けされるまで確定しないようにした。
- **リスク**: 安定化バッファが大きすぎるとレスポンスが遅くなる。バッファ長と閾値をログで調整。
- **確認項目**: 手動入力保持ロジックに影響がないか（スワイプ検知が遅れていないか）。

## Step 4: Web Worker への処理分離
- `tampermonkey/ocr-worker.js` を追加し、`importScripts` で Tesseract を読み込んだ上で `OffscreenCanvas` に `ImageData` を描画→OCR 実行→結果を `postMessage`。
- メインスレッドでは `recognizeViaWorker` を導入し、Worker が使えない環境では従来の `Tesseract.recognize` にフォールバックする。`startCapture` で Worker を初期化し、`stopCapture` で terminate。
- メッセージ型例:
  ```ts
  type OcrRequest = { id: string; roi: ROI; imageData: ImageData };
  type OcrResponse = { id: string; text: string; confidence: number };
  ```
- **リスク**: Worker 未対応環境では従来の同期処理にフォールバックする必要がある。
- **確認項目**: Worker 導入後も UI レスポンスが向上（フリーズしなくなる）しているか。停止時に `worker.terminate()` が呼ばれているか。

## Step 5: OffscreenCanvas の活用とフォールバック
- Worker 内で `OffscreenCanvas` を使える場合は描画から前処理まで完結させる。
- `OffscreenCanvas` が未実装または初期化エラーになる環境では `ImageData` をそのまま Tesseract に渡し、ワーカー構成を維持しながら性能差を最小化する。
- **リスク**: HTTPS でないページや古い Edge などでは `OffscreenCanvas` が無効。try-catch で判定し、フォールバックが必ず走るようにする。
- **確認項目**: `OffscreenCanvas` 利用時とフォールバック時の OCR 精度・レスポンスが同等か。

## Step 6: メモリ管理とクリーンアップ
- OCR 結果のログを 40 件で打ち止めにし、古いものは `shift()` で破棄。成功率（`#ivocr-ocr-score`）はこのバッファを参照して更新する。
- `stopCapture()` で `requestAnimationFrame` のキャンセルに加えて、キャンバスのピクセルバッファをクリアし、`ocrResultHistory`・`STATE.ocrStats`・`STATE.lastAutoFillAt` をリセットする。
- Worker 終了時には `drainPendingOcrTasks()` で未解決の OCR Promise を空返信で resolve し、ImageData 参照を破棄した上で `terminate()` を呼ぶ。
- 自動入力が走ったタイミングを `markAutoFill()` で記録し、`#ivocr-auto-timestamp` に最終転記時刻を表示。手動停止時は `null` に戻して UI をリセットする。
- **リスク**: クリーンアップ漏れがあるとタブ閉鎖までメモリが解放されない。特に Worker 側で例外が出た場合に `drainPendingOcrTasks` が呼ばれているかを確認する。
- **確認項目**: Chrome の Memory プロファイルで `startCapture`→`stopCapture` を 3 周繰り返し、ヒープグラフが右肩上がりになっていないか。成功率表示が capture のたびに初期化されるか。停止直後に pending Promise が残っていないか（DevTools の async スタックで確認）。

## Step 7: リグレッションテストとユーザー確認
- 右下パネルに `実験的設定`（Worker/前処理/安定化ロジックのトグル）と `リグレッション確認` のチェックリストを追加。Step1〜6 の変更を個別に ON/OFF でき、巻き戻し検証が簡単になる。
- チェックリスト（5項目）は `localStorage` に保存されるので、テスターは1項目ずつ実機確認しながら結果を可視化できる。`チェックをリセット` で検証をやり直せる。
- Pull Request 前に各シナリオ（自動入力、手動入力保持、ROI 校正、スワイプ検知、名前候補の同期）が ✅ になった状態のスクリーンショットと計測ログを添付する。
- 機能フラグを変更した場合は `FEATURE_FLAG_KEY` の値を書き添えて共有し、レビューアが同じ条件を再現できるようにする。

---

各ステップは単体でコミットし、都度既存機能が壊れていないかを確認してから次に進んでください。必要であればステップ順を入れ替えても構いませんが、事前に計測と確認を行うことを推奨します。