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
- `tampermonkey/docs/iv-ocr-tool.md` - 詳細ドキュメント
- `tampermonkey/docs/ocr-performance-improvement.md` - OCR パフォーマンス改善メモ
- `web/` - React IV チェッカーアプリ (Phase 2)
- `docs/` - GitHub Pages 用ビルド出力

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

## ロードマップ

### Phase 1: 現行 JS ブラッシュアップ
- OCR パフォーマンス改善（読み込み速度）
- 名前 OCR の精度向上（カタカナ認識が不安定）
- IV ゲージ読み取り改善（IV=0 の空バー検出が弱い）
- コードのモジュール分割・重複排除

### Phase 2: React 移行 + 自前 IV 計算
- 9db 依存を排除し、IV 計算ロジックを内製化
- ポケモンデータ（種族値・CPM テーブル等）を内蔵
- PC: OCR 自動読み取り機能つき
- スマホ: タップで個体値入力 → リーグ別順位表示（スーパー/ハイパー/マスター）

## 既知の課題
- 名前 OCR が不安定（カタカナの誤認識が多い）
- IV ゲージが 0 のとき空バーを正しく検出できない
- OCR / 計算全体的に遅い
