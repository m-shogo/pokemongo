# CLAUDE.md

## プロジェクト概要
Pokemon GO の個体値(IV)を OCR で自動読み取りし、9db の IV 計算ページに自動入力する Tampermonkey ユーザースクリプト。

## 技術スタック
- JavaScript (Tampermonkey ユーザースクリプト)
- Tesseract.js (OCR エンジン)
- Web Worker (`ocr-worker.js`)
- Screen Capture API / Camera API

## ファイル構成
- `tampermonkey/iv-ocr.user.js` - メインスクリプト本体
- `tampermonkey/ocr-worker.js` - OCR 処理用 Web Worker
- `docs/iv-ocr-tool.md` - 詳細ドキュメント
- `docs/ocr-performance-improvement.md` - OCR パフォーマンス改善メモ

## 動作の仕組み
1. iPhone の画面を AirPlay / キャプチャカードで PC に映す
2. ブラウザの画面共有 or カメラ入力で映像を取得
3. ユーザーが ROI (読み取り領域) を校正
4. Tesseract.js で CP / HP / ほしのすな / ポケモン名を OCR
5. こうげき / ぼうぎょ / HP バーの塗りつぶし率から IV ゲージを推定
6. 9db (https://9db.jp/pokemongo/data/6606) のフォームに自動入力

## 対応環境
- Windows PC (Chrome / Edge 推奨)、macOS も可
- iPhone (Pokemon GO プレイ用)
- Tampermonkey ブラウザ拡張が必要

## 開発の方針
- 日本語でコメント・ドキュメントを書く
- 個人用途の学習プロジェクト
