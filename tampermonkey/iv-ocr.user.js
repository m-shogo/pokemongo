// ==UserScript==
// @name         9db IV AutoFill via OCR (Pokémon GO)
// @namespace    https://local.example/iv-ocr
// @version      0.1.0
// @description  iPhoneミラー/キャプチャ映像からCP/HP/ほしのすなをOCRで読み取り、9dbのIV計算ページへ自動入力します。
// @author       you
// @match        https://9db.jp/pokemongo/data/6606*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      pokemongo-get.com
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@4.0.2/dist/tesseract.min.js
// ==/UserScript==
(function () {
  'use strict';

  /**
   * ROI (Region of Interest) を正規化座標で表現する型
   * @typedef {{x:number,y:number,w:number,h:number}} ROI
   */

  /**
   * ゲージ測定結果を表す型
   * @typedef {{ratio:number,confidence:number}} GaugeSample
   */

  /**
   * 名前サジェストボタンに使う型
   * @typedef {'match' | 'prefix' | 'last'} NameSuggestionSource
   * @typedef {{label: string, value: string, source: NameSuggestionSource}} NameSuggestion
   * @typedef {{matched: string | null, normalized: string, suggestions: NameSuggestion[]}} NameReadResult
   */

  /**
   * スクリプト全体で使う状態オブジェクト
   * @typedef {{
   *   stream: MediaStream | null,
   *   videoEl: HTMLVideoElement | null,
   *   canvasEl: HTMLCanvasElement | null,
   *   ctx: CanvasRenderingContext2D | null,
   *   roi: {cp: ROI | null, hp: ROI | null, dust: ROI | null, name: ROI | null, atkGauge: ROI | null, defGauge: ROI | null, hpGauge: ROI | null},
   *   running: boolean,
   *   autoFill: boolean,
   *   autoSelectName: boolean,
   *   source: 'screen' | 'camera',
   *   calibTarget: 'none' | 'cp' | 'hp' | 'dust' | 'name' | 'atkGauge' | 'defGauge' | 'hpGauge' | 'autoStat' | 'autoName',
   *   loopId: number | null,
   *   lastValues: {cp: number | null, hp: number | null, dust: number | null},
  *   lastName: string | null,
  *   lastNameMatched: string | null,
   *   lastIv: {atk: number | null, def: number | null, hp: number | null},
   *   stableBuf: {cp: number[], hp: number[], dust: number[]},
   *   stableIvBuf: {atk: GaugeSample[], def: GaugeSample[], hp: GaugeSample[]},
   *   draftRect: ROI | null,
   *   lastAutoFillAt: number | null,
   *   ocrStats: {attempts: number, successes: number},
   *   theme: 'default' | 'contrast',
   *   onboardingSeen: boolean,
   *   nameSuggestions: NameSuggestion[],
   *   lastNameNormalized: string,
   *   activeNameValue: string | null,
   *   manualNameOverride: string | null,
   *   manualIvOverrides: {atk: number | null, def: number | null, hp: number | null},
   *   currentScreenSignature: string | null,
  *   manualIvScreenSignature: string | null,
  *   manualNameScreenSignature: string | null
   * }} OCRState
   */
  const LS_KEY = 'iv-ocr-roi-v1';
  const LS_AUTO_SELECT_KEY = 'iv-ocr-auto-select-v1';
  const SCRIPT_RAW_URL = 'https://raw.githubusercontent.com/m-shogo/pokemongo/main/tampermonkey/iv-ocr.user.js';
  const SCRIPT_CACHE = { text: null, fetchedAt: 0 };
  /** @typedef {'super' | 'hyper' | 'master'} LeagueKey */
  /** @typedef {{html: string | null, fetchedAt: number}} LeagueCache */
  const LEAGUE_CONFIG = {
    super: { url: 'https://pokemongo-get.com/pvpranking/?league=0', title: 'スーパーリーグ' },
    hyper: { url: 'https://pokemongo-get.com/pvpranking/?league=1', title: 'ハイパーリーグ' },
    master: { url: 'https://pokemongo-get.com/pvpranking/?league=2', title: 'マスターリーグ' },
  };
  /** @type {Record<LeagueKey, LeagueCache>} */
  const LEAGUE_CACHE = {
    super: { html: null, fetchedAt: 0 },
    hyper: { html: null, fetchedAt: 0 },
    master: { html: null, fetchedAt: 0 },
  };
  const LEAGUE_CACHE_TTL = 15 * 60 * 1000;
  const LS_THEME_KEY = 'iv-ocr-theme-contrast';
  const LS_ONBOARD_KEY = 'iv-ocr-onboarded';
  const ROI_LEGENDS = [
    { key: 'cp', label: 'CP', color: '#0af' },
    { key: 'hp', label: 'HP', color: '#fc0' },
    { key: 'dust', label: 'ほしのすな', color: '#6c6' },
    { key: 'name', label: '名前', color: '#f06292' },
    { key: 'atkGauge', label: 'こうげきバー', color: '#ff7043' },
    { key: 'defGauge', label: 'ぼうぎょバー', color: '#26a69a' },
    { key: 'hpGauge', label: 'HPバー', color: '#7e57c2' }
  ];
  const TOAST_DURATION = 4500;
  const ROI_COLOR_BASE = {
    cp: '#0af',
    hp: '#fc0',
    dust: '#6c6',
    name: '#f06292',
    atkGauge: '#ff7043',
    defGauge: '#26a69a',
    hpGauge: '#7e57c2'
  };
  const ROI_COLOR_ACTIVE = {
    cp: '#00e5ff',
    hp: '#ffd54f',
    dust: '#a5d6a7',
    name: '#f48fb1',
    atkGauge: '#ff8a65',
    defGauge: '#4db6ac',
    hpGauge: '#9575cd'
  };
  const CANVAS_MAX_WIDTH = 360; // 省リソース運用のための上限
  const CANVAS_MAX_HEIGHT = 640;
  const LOOP_INTERVALS = {
    ocr: 750,
    iv: 650,
    name: 1800,
  };

  const PERF_LOG_KEY = 'iv-ocr-perf-log';
  let perfEnabled = loadPerfLogFlag();
  let perfCounter = 0;

  const PERF = {
    measure(label, fn) {
      if (!perfEnabled) return fn();
      const tag = buildPerfLabel(label);
      console.time(tag);
      try {
        return fn();
      } finally {
        console.timeEnd(tag);
      }
    },
    async measureAsync(label, fn) {
      if (!perfEnabled) return fn();
      const tag = buildPerfLabel(label);
      console.time(tag);
      try {
        return await fn();
      } finally {
        console.timeEnd(tag);
      }
    },
    setEnabled(value) {
      perfEnabled = Boolean(value);
      savePerfLogFlag(perfEnabled);
    },
    isEnabled() {
      return perfEnabled;
    }
  };

  /** @type {OCRState} */
  const STATE = {
    stream: null,
    videoEl: null,
    canvasEl: null,
    ctx: null,
    roi: loadROI(),
    running: false,
    autoFill: false,
    autoSelectName: false,
    source: 'screen',
    calibTarget: 'none',
    loopId: null,
    lastValues: { cp: null, hp: null, dust: null },
    lastName: null,
    lastNameMatched: null,
    lastIv: { atk: null, def: null, hp: null },
    stableBuf: { cp: [], hp: [], dust: [] },
    stableIvBuf: { atk: [], def: [], hp: [] },
    draftRect: null,
    lastAutoFillAt: null,
    ocrStats: { attempts: 0, successes: 0 },
    theme: 'default',
    onboardingSeen: false,
    nameSuggestions: [],
    lastNameNormalized: '',
    activeNameValue: null,
    manualNameOverride: null,
    manualIvOverrides: { atk: null, def: null, hp: null },
    currentScreenSignature: null,
    manualIvScreenSignature: null,
    manualNameScreenSignature: null,
  };

  // 手動IVの維持可否を判定するために連続一致回数を追跡
  const SCREEN_CHANGE_CONFIRMATIONS = 2;
  /** @type {{value: string | null, count: number}} */
  const signatureChangeTracker = { value: null, count: 0 };
  const nameSignatureChangeTracker = { value: null, count: 0 }; // 名前入力の保持判断用
  const EMPTY_SCREEN_SIGNATURE = JSON.stringify({
    cp: null,
    hp: null,
    dust: null,
    atk: null,
    def: null,
    hpIv: null,
    name: null,
  });

  const NAME_CACHE = { names: [], expiry: 0 };
  /** @type {number | null} */
  let nameSelectionTimer = null;

  STATE.autoSelectName = loadAutoSelectFlag();

  // ---------------------
  // UI 初期化
  // ---------------------

  GM_addStyle(`
    .ivocr-panel {
      position: fixed; right: 16px; bottom: 16px;
      width: min(360px, calc(100vw - 32px));
      background: #111; color: #fff; z-index: 999999;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, 'Noto Sans JP', sans-serif;
      border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.4);
      border: 1px solid #333;
      display: flex; flex-direction: column;
      max-height: calc(100vh - 32px);
      overflow: hidden;
    }
    .ivocr-panel.ivocr-wide {
      width: min(740px, calc(100vw - 32px));
    }
    .ivocr-panel.ivocr-dragging { opacity: 0.9; cursor: grabbing; }
    .ivocr-header { padding: 8px 12px; font-weight: 600; background: #222; display:flex; justify-content:space-between; align-items:center; cursor: grab; gap:8px; }
    .ivocr-header-title { display:flex; align-items:center; gap:8px; }
    .ivocr-header-actions { margin-left:auto; display:flex; align-items:center; gap:6px; cursor:auto; }
    .ivocr-header-actions button { cursor:pointer; }
    .ivocr-btn-mini { padding:4px 8px; font-size:11px; border-radius:6px; border:1px solid #555; background:#2a2a2a; color:#fff; cursor:pointer; }
    .ivocr-btn-mini:hover { background:#353535; }
    .ivocr-header-actions .ivocr-btn-mini { margin-left:0; }
    .ivocr-help-btn {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1px solid #555;
      background: #1f1f1f;
      color: #fce4ec;
      font-size: 13px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      transition: background 0.2s ease;
    }
    .ivocr-help-btn:hover { background:#333; }
    .ivocr-body { padding: 8px 12px; overflow-y: auto; flex: 1; }
    .ivocr-row { display:flex; gap:8px; align-items:center; margin:6px 0; flex-wrap:wrap; }
    .ivocr-row label { font-size: 12px; color: #ccc; }
    .ivocr-row input[type="number"] { width: 80px; }
    .ivocr-name-suggestions { display:flex; gap:6px; flex-wrap:wrap; }
    .ivocr-name-suggestions button { padding:4px 8px; font-size:11px; border:1px solid #444; border-radius:6px; background:#1b1b1b; color:#f2f2f2; cursor:pointer; transition:background 0.2s ease,color 0.2s ease,border-color 0.2s ease; }
    .ivocr-name-suggestions button:hover { background:#2a2a2a; }
    .ivocr-name-suggestions button[data-source="prefix"] { border-style:dashed; }
    .ivocr-name-suggestions button[data-source="last"] { border-color:#555; color:#ccc; }
    .ivocr-name-suggestions button.is-active { border-color:#f06292; color:#f06292; }
    .ivocr-name-input { flex:1 1 100%; width:100%; height:36px; padding:6px 8px; border-radius:6px; border:1px solid #444; background:#1b1b1b; color:#f5f5f5; font-size:12px; line-height:1.4; }
    .ivocr-name-input:focus { outline:none; border-color:#64b5f6; box-shadow:0 0 0 1px rgba(100,181,246,0.35); }
    .ivocr-name-input.is-manual { border-color:#f06292; box-shadow:0 0 0 1px rgba(240,98,146,0.4); }
    .ivocr-name-input::placeholder { color:#888; }
    .ivocr-iv-fields { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .ivocr-iv-field { display:flex; align-items:center; gap:4px; font-size:12px; color:#ccc; }
    .ivocr-iv-field input { width:48px; padding:3px 6px; border-radius:4px; border:1px solid #444; background:#1b1b1b; color:#f5f5f5; }
    .ivocr-iv-field input:focus { outline:none; border-color:#64b5f6; box-shadow:0 0 0 1px rgba(100,181,246,0.35); }
    .ivocr-iv-field input.is-manual { border-color:#f06292; box-shadow:0 0 0 1px rgba(240,98,146,0.4); }
    .ivocr-btn { padding: 6px 10px; font-size: 12px; border: 1px solid #444; background:#1f1f1f; color:#fff; border-radius:6px; cursor:pointer; }
    .ivocr-btn:hover { background:#2a2a2a; }
    .ivocr-btn[data-calib] {
      transition: border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease;
    }
    .ivocr-btn[data-calib="cp"]:hover,
    .ivocr-btn[data-calib="cp"].is-active { border-color:#00e5ff; color:#00e5ff; box-shadow:0 0 10px rgba(0,229,255,0.35); }
    .ivocr-btn[data-calib="hp"]:hover,
    .ivocr-btn[data-calib="hp"].is-active { border-color:#ffd54f; color:#ffd54f; box-shadow:0 0 10px rgba(255,213,79,0.35); }
    .ivocr-btn[data-calib="dust"]:hover,
    .ivocr-btn[data-calib="dust"].is-active { border-color:#a5d6a7; color:#a5d6a7; box-shadow:0 0 10px rgba(165,214,167,0.35); }
    .ivocr-btn[data-calib="name"]:hover,
    .ivocr-btn[data-calib="name"].is-active { border-color:#f06292; color:#f06292; box-shadow:0 0 10px rgba(240,98,146,0.35); }
    .ivocr-btn[data-calib="atkGauge"]:hover,
    .ivocr-btn[data-calib="atkGauge"].is-active { border-color:#ff7043; color:#ff7043; box-shadow:0 0 10px rgba(255,112,67,0.35); }
    .ivocr-btn[data-calib="defGauge"]:hover,
    .ivocr-btn[data-calib="defGauge"].is-active { border-color:#26a69a; color:#26a69a; box-shadow:0 0 10px rgba(38,166,154,0.35); }
    .ivocr-btn[data-calib="hpGauge"]:hover,
    .ivocr-btn[data-calib="hpGauge"].is-active { border-color:#7e57c2; color:#7e57c2; box-shadow:0 0 10px rgba(126,87,194,0.35); }
    .ivocr-btn[data-calib="autoStat"]:hover,
    .ivocr-btn[data-calib="autoStat"].is-active { border-color:#ffb74d; color:#ffb74d; box-shadow:0 0 10px rgba(255,183,77,0.35); }
    .ivocr-btn[data-calib="autoName"]:hover,
    .ivocr-btn[data-calib="autoName"].is-active { border-color:#ba68c8; color:#ba68c8; box-shadow:0 0 10px rgba(186,104,200,0.35); }
    .ivocr-toggle { display:flex; align-items:center; gap:6px; }
    .ivocr-preview-container {
      position: relative;
      background:#000;
      border-radius:6px;
      border:1px solid #333;
      max-height: calc(70vh);
      overflow:auto;
      display:flex;
      justify-content:center;
      align-items:flex-start;
      padding: 4px;
    }
    .ivocr-preview {
      width: 100%;
      height: auto;
      display:block;
      margin: 0 auto;
      background:#000;
      border:none;
      aspect-ratio: 1 / 2;
    }
    .ivocr-badge { padding:2px 6px; border-radius:4px; background:#333; color:#ddd; font-size:11px; }
    .ivocr-panel.ivocr-wide .ivocr-preview-container { max-height: calc(85vh); }
    .ivocr-btn[data-calib="autoStat"].is-active { border-color:#ffb74d; color:#ffb74d; box-shadow:0 0 10px rgba(255,183,77,0.35); }
    .ivocr-fieldset { border:1px solid #2f2f2f; border-radius:8px; padding:8px 10px; margin:8px 0; display:flex; flex-direction:column; gap:6px; }
    .ivocr-legend { padding:0 6px; font-size:12px; color:#bdbdbd; }
    .ivocr-help-popup {
      position: absolute;
      top: 52px;
      right: 16px;
      width: min(320px, calc(100vw - 48px));
      max-height: calc(100vh - 120px);
      overflow-y: auto;
      background: #141414;
      color: #f5f5f5;
      border: 1px solid #333;
      border-radius: 8px;
      box-shadow: 0 12px 24px rgba(0,0,0,.45);
      padding: 16px;
      font-size: 13px;
      display: none;
      z-index: 1000000;
    }
    .ivocr-help-popup.open { display: block; }
    .ivocr-help-popup__header {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      font-weight:600;
      font-size:15px;
      margin-bottom:8px;
    }
    .ivocr-help-popup__section { margin-bottom: 16px; }
    .ivocr-help-popup__title { font-weight: 600; font-size: 14px; margin: 0 0 6px 0; }
    .ivocr-help-popup__text { margin: 0 0 6px 0; line-height: 1.6; }
    .ivocr-help-popup__list { margin: 4px 0 6px 0; padding-left: 18px; line-height: 1.6; }
    .ivocr-help-popup__list--numbered { list-style: decimal; }
    .ivocr-help-popup__list--alpha { list-style: upper-alpha; }
    .ivocr-help-popup__list--nested { list-style: disc; margin-top: 4px; }
    .ivocr-help-popup__subhead { font-weight: 600; margin: 6px 0 4px 0; }
    .ivocr-help-popup__foot { font-size: 11px; color: #bbb; line-height: 1.5; border-top: 1px solid #2a2a2a; padding-top: 8px; }
    .ivocr-help-close {
      border: 1px solid #555;
      background: transparent;
      color: #eee;
      border-radius: 6px;
      font-size: 14px;
      width: 28px;
      height: 24px;
      cursor: pointer;
    }
    .ivocr-help-close:hover { background:#2e2e2e; }
    .ivocr-copy-btn {
      width: 100%;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 600;
      border: 1px solid #4a90e2;
      background: linear-gradient(135deg, #1976d2, #42a5f5);
      color: #fff;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
    }
    .ivocr-copy-btn:hover { box-shadow: 0 3px 12px rgba(25,118,210,0.4); transform: translateY(-1px); }
    .ivocr-copy-btn:disabled {
      opacity: 0.65;
      cursor: default;
      box-shadow: none;
      transform: none;
    }
    .ivocr-copy-note { font-size: 11px; color:#bdbdbd; line-height: 1.5; margin-top: 6px; }
    .ivocr-accordion { border-top:1px solid #2a2a2a; margin-top:12px; padding-top:8px; display:flex; flex-direction:column; gap:8px; }
    .ivocr-accordion__btn { width:100%; text-align:left; background:#1a1a1a; color:#e0e0e0; border:1px solid #333; border-radius:6px; padding:8px 10px; font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:space-between; transition:background 0.2s ease; }
    .ivocr-accordion__btn:hover { background:#232323; }
    .ivocr-accordion__btn.is-open { background:#2a2a2a; }
    .ivocr-accordion__panel { display:none; border:1px solid #353535; border-radius:6px; padding:8px 10px; background:#1d1d1d; }
    .ivocr-accordion__panel.open { display:block; }
    .ivocr-tooltip { position:relative; }
    .ivocr-tooltip[data-tip]:hover::after {
      content: attr(data-tip);
      position:absolute;
      left:50%;
      transform:translate(-50%, -100%);
      background:rgba(0,0,0,0.9);
      color:#fff; font-size:11px;
      padding:4px 6px; border-radius:4px;
      white-space:nowrap;
      pointer-events:none;
      margin-bottom:6px;
      z-index:1000001;
    }
    .ivocr-legend-wrap { display:flex; flex-wrap:wrap; gap:6px; margin:6px 0 4px; }
    .ivocr-legend-badge { display:flex; align-items:center; gap:4px; font-size:11px; padding:4px 6px; border-radius:999px; background:#1b1b1b; border:1px solid #2f2f2f; }
    .ivocr-legend-dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
    .ivocr-auto-status { font-size:11px; color:#bbb; display:flex; align-items:center; gap:8px; }
    .ivocr-toast-container { position:fixed; right:20px; bottom:20px; display:flex; flex-direction:column; gap:10px; z-index:1000001; pointer-events:none; }
    .ivocr-toast { min-width:220px; max-width:320px; padding:10px 14px; border-radius:8px; color:#fff; font-size:13px; background:rgba(66, 165, 245, 0.9); box-shadow:0 6px 14px rgba(0,0,0,0.35); pointer-events:auto; }
    .ivocr-toast--error { background:rgba(239, 83, 80, 0.92); }
    .ivocr-toast--success { background:rgba(129, 199, 132, 0.9); }
    .ivocr-toast button { border:none; background:transparent; color:#fff; font-size:13px; cursor:pointer; margin-left:auto; }
    .ivocr-modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.65); display:none; align-items:center; justify-content:center; z-index:1000002; }
    .ivocr-modal-backdrop.open { display:flex; }
    .ivocr-modal { width:min(420px, calc(100vw - 40px)); background:#121212; color:#f5f5f5; border-radius:12px; padding:20px; border:1px solid #2f2f2f; box-shadow:0 12px 28px rgba(0,0,0,0.45); }
    .ivocr-modal h2 { margin:0 0 12px 0; font-size:18px; }
    .ivocr-modal ul { margin:0 0 16px 18px; padding:0; font-size:13px; line-height:1.6; }
    .ivocr-modal__actions { display:flex; gap:10px; justify-content:flex-end; }
    .ivocr-modal__btn { border:1px solid #4a90e2; background:#1e3a5f; color:#e3f2fd; padding:8px 14px; border-radius:8px; cursor:pointer; }
    .ivocr-modal__btn:hover { background:#274a78; }
    .ivocr-theme-contrast { background:#f5f5f5; color:#111; border-color:#ccc; }
    .ivocr-theme-contrast .ivocr-header { background:#e0e0e0; color:#111; }
    .ivocr-theme-contrast .ivocr-body { color:#1a1a1a; }
    .ivocr-theme-contrast .ivocr-row label { color:#333; }
    .ivocr-theme-contrast .ivocr-small { color:#444; }
    .ivocr-theme-contrast .ivocr-auto-status { color:#444; }
    .ivocr-theme-contrast .ivocr-help-popup { background:#f0f0f0; color:#1a1a1a; border-color:#bbb; }
    .ivocr-theme-contrast .ivocr-help-popup__title { color:#111; }
    .ivocr-theme-contrast .ivocr-help-popup__foot { color:#555; border-top-color:#ccc; }
    .ivocr-theme-contrast .ivocr-help-popup__text,
    .ivocr-theme-contrast .ivocr-help-popup__list { color:#222; }
    .ivocr-theme-contrast .ivocr-copy-note { color:#444; }
    .ivocr-theme-contrast .ivocr-btn { background:#fafafa; color:#111; border-color:#bbb; }
    .ivocr-theme-contrast .ivocr-btn:hover { background:#f0f0f0; }
    .ivocr-theme-contrast .ivocr-name-suggestions button { background:#fff; color:#111; border-color:#bbb; }
    .ivocr-theme-contrast .ivocr-name-suggestions button:hover { background:#f0f0f0; }
    .ivocr-theme-contrast .ivocr-name-suggestions button[data-source="prefix"] { border-style:dashed; }
    .ivocr-theme-contrast .ivocr-name-suggestions button[data-source="last"] { border-color:#999; color:#555; }
    .ivocr-theme-contrast .ivocr-name-suggestions button.is-active { border-color:#d81b60; color:#d81b60; }
    .ivocr-theme-contrast .ivocr-name-input { background:#fff; color:#111; border-color:#bbb; }
    .ivocr-theme-contrast .ivocr-name-input.is-manual { border-color:#d81b60; box-shadow:0 0 0 1px rgba(216,27,96,0.35); }
    .ivocr-theme-contrast .ivocr-iv-field { color:#333; }
    .ivocr-theme-contrast .ivocr-iv-field input { background:#fff; color:#111; border-color:#bbb; }
    .ivocr-theme-contrast .ivocr-iv-field input.is-manual { border-color:#d81b60; box-shadow:0 0 0 1px rgba(216,27,96,0.35); }
    .ivocr-theme-contrast .ivocr-fieldset { border-color:#c7c7c7; }
    .ivocr-theme-contrast .ivocr-legend { color:#333; }
    .ivocr-theme-contrast .ivocr-legend-badge { background:#f9f9f9; border-color:#d0d0d0; color:#222; }
    .ivocr-theme-toggle { border:1px solid #555; background:#1f1f1f; color:#fff; border-radius:6px; padding:4px 8px; font-size:11px; cursor:pointer; }
    .ivocr-theme-contrast .ivocr-theme-toggle { background:#e0e0e0; color:#111; border-color:#bbb; }
    .ivocr-contrast .ivocr-toast { color:#111; }
    .ivocr-league-accordion { margin-top:8px; display:flex; flex-direction:column; gap:8px; }
    .ivocr-league-table { max-height:520px; overflow:auto; border:1px solid #353535; border-radius:8px; padding:8px; background:#1b1b1b; }
    .ivocr-league-table table { width:100%; border-collapse:collapse; font-size:11px; color:#f2f2f2; background-color: #ffffff; }
    .ivocr-league-table th, .ivocr-league-table td { border-bottom:1px solid #313131; padding:4px 6px; }
    .ivocr-league-table tr:last-child th, .ivocr-league-table tr:last-child td { border-bottom:none; }
    .ivocr-league-table img { max-width:64px; height:auto; display:block; margin:0 auto; }
    .ivocr-error { color:#f44336; font-size:12px; }
    .ivocr-theme-contrast .ivocr-league-table { background:#fff; color:#111; border-color:#ccc; }
    .ivocr-theme-contrast .ivocr-league-table table { color:#111; }
    .ivocr-league-table .table-par { display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 5px;}
    .ivocr-league-table .table-par + .table-par { margin-top: 5px; }
    .text-center{ text-align: center; }
    .ivocr-theme-contrast .ivocr-error { color:#d32f2f; }
  `);

    const panel = document.createElement('div');
  panel.className = 'ivocr-panel';
  panel.innerHTML = `
    <div class="ivocr-header">
      <div class="ivocr-header-title">
        <div>IV OCR</div>
        <div class="ivocr-badge">Beta</div>
        <button class="ivocr-help-btn" id="ivocr-help-btn" type="button" data-ignore-drag="true">?</button>
      </div>
      <div class="ivocr-header-actions" data-ignore-drag="true">
        <button class="ivocr-theme-toggle" id="ivocr-theme-toggle" type="button">高コントラスト</button>
        <button class="ivocr-btn-mini" id="ivocr-wide-toggle">拡大表示</button>
      </div>
    </div>
    <div class="ivocr-help-popup" id="ivocr-help-popup" data-ignore-drag="true">
      <div class="ivocr-help-popup__header">
        <span>使い方ガイド</span>
        <button class="ivocr-help-close" id="ivocr-help-close" type="button" aria-label="閉じる">&times;</button>
      </div>
      <div class="ivocr-help-popup__section">
        <h3 class="ivocr-help-popup__title">1. まずはここから（クイックスタート）</h3>
        <ol class="ivocr-help-popup__list ivocr-help-popup__list--numbered">
          <li data-progress-step="source"><strong>開始ボタンを押す</strong>とミラーアプリやキャプチャデバイスを選ぶ画面が出ます。選択後、プレビューに iPhone 画面が表示されます。</li>
          <li><strong>枠を作る</strong>: 「校正: 名前」「校正: こうげきバー」「校正: ぼうぎょバー」「校正: HPバー」を押して、プレビュー上で左上→右下の順に2クリック。必要なラベルとバーを囲みます。</li>
          <li><strong>保存する</strong>: 枠が揃ったら「保存」で位置を記憶。次回以降は自動で読み込まれます。</li>
          <li><strong>自動入力する</strong>: 「自動入力」にチェックを入れると、読み取った値とIVゲージが 9db のフォームに転記されます。</li>
          <li><strong>名前やゲージも読みたい</strong>場合は、「校正: 名前」「自動: ラベル→バー」などで枠を追加してください。</li>
        </ol>
      </div>
      <div class="ivocr-help-popup__section">
        <h3 class="ivocr-help-popup__title">2. パネルのボタンと表示の見方</h3>
        <ul class="ivocr-help-popup__list">
          <li><strong>プレビュー上で 2クリック</strong>: 左上→右下の順にクリックして読み取り枠 (ROI) を作成します。ズレたら再度クリックで上書きできます。</li>
          <li><strong>校正系ボタン (CP/HP/すな/名前/こうげきバー/ぼうぎょバー/HPバー)</strong>: それぞれの値やゲージの位置を指定するためのボタンです。押した状態でプレビューを2クリックすると範囲が保存されます。</li>
          <li><strong>自動: ラベル→バー</strong>: 画面上の「こうげき」「ぼうぎょ」「HP」ラベル付近をクリックすると、対応する横バーを自動検出します。</li>
          <li><strong>自動: HPバー→名前</strong>: HPゲージの緑部分をクリックすると、その上にあるポケモン名の枠を推定して設定します。</li>
          <li><strong>保存</strong>: 作成した枠をブラウザの <code>localStorage</code> に保存します。再読み込みしても枠が維持されます。</li>
          <li><strong>枠クリア</strong>: すべての枠をリセットします。再設定したいときに使用してください。</li>
          <li><strong>状態</strong>: 現在の動作状況を表示します。例)「Idle」は待機中、「稼働中」は読み取りを実行中、「停止」はキャプチャを止めた状態です。</li>
          <li><strong>名前 / 最新値 / IV推定</strong>: 最新のOCR結果を確認する欄です。値が安定すると数字が入り、読み取れていないと <code>-</code> のままです。</li>
          <li><strong>自動入力</strong>: チェックすると、安定した値を9dbの入力欄とIVバーへ自動転記します。精度に不安がある場合はオフのまま手動確認しましょう。</li>
          <li><strong>候補を自動選択（先頭1件）</strong>: ポケモン名の入力候補リストが開いたら先頭の1件を自動クリックします。誤検出が心配なときはオフにしてください。</li>
        </ul>
      </div>
      <div class="ivocr-help-popup__section">
        <h3 class="ivocr-help-popup__title">3. スクリプトを準備する</h3>
        <p class="ivocr-help-popup__text">Tampermonkey に貼るコードは下のボタンで一括コピーできます。貼り付け先が空だったとしても上書きされるので安心です。</p>
        <button class="ivocr-copy-btn" id="ivocr-copy-script" type="button" data-ignore-drag="true">コードをコピー</button>
        <ol class="ivocr-help-popup__list ivocr-help-popup__list--numbered">
          <li>ブラウザ右上の Tampermonkey アイコン → 「ダッシュボード」を開きます。</li>
          <li>「+ 新規スクリプト」を押し、エディタを全選択して削除します。</li>
          <li>コピーしたコードを貼り付けて保存します。</li>
          <li>9db の IV 計算ページを再読み込みすると、右下にこのパネルが表示されます。</li>
        </ol>
        <p class="ivocr-copy-note">コピーがうまくいかない場合は数秒待ってから再試行し、ブラウザのポップアップブロックやネットワーク状況をご確認ください。</p>
      </div>
      <div class="ivocr-accordion" id="ivocr-help-accordion">
        <div>
          <button class="ivocr-accordion__btn" data-accordion-toggle="purpose">4. このツールの目的と仕組み<span>開く</span></button>
          <div class="ivocr-accordion__panel" data-accordion-panel="purpose">
            <ul class="ivocr-help-popup__list">
              <li><strong>目的:</strong> iPhone 上の Pokémon GO 画面を Windows PC にミラー表示し、9db IV 計算ページ (https://9db.jp/pokemongo/data/6606) に自動入力します。</li>
              <li>スワイプなどの操作は手動。<strong>数値入力だけ</strong>このツールが肩代わりします。</li>
              <li>入力ソースは 2 種類あります。
                <ul class="ivocr-help-popup__list ivocr-help-popup__list--nested">
                  <li>画面共有: AirPlay ミラーアプリのウィンドウを <code>getDisplayMedia</code> でキャプチャ。</li>
                  <li>キャプチャカード: Lightning-&gt;HDMI-&gt;USB で繋いだ映像を <code>getUserMedia</code> で取り込み。</li>
                </ul>
              </li>
              <li>映像から <code>Tesseract.js</code> で CP/HP/ほしのすなを OCR し、9db の DOM を自動で書き換えます。</li>
              <li>フォーム探索はラベル (<code>CP</code> / <code>HP</code> など) や <code>name</code> / <code>id</code> / <code>placeholder</code> を組み合わせて実施しているので、多少のUI変更にも耐性があります。</li>
            </ul>
          </div>
        </div>
        <div>
          <button class="ivocr-accordion__btn" data-accordion-toggle="windows">5. Windows + iOS の事前準備<span>開く</span></button>
          <div class="ivocr-accordion__panel" data-accordion-panel="windows">
            <ol class="ivocr-help-popup__list ivocr-help-popup__list--numbered">
              <li><strong>ブラウザ</strong>: Windows に最新の Google Chrome または Microsoft Edge をインストールし、常に更新しておきます。</li>
              <li><strong>Tampermonkey</strong>: ブラウザ拡張ストアから追加し、有効化します。</li>
              <li><strong>9db ページ</strong>: https://9db.jp/pokemongo/data/6606 を開いておきます。</li>
              <li><strong>iPhone を Windows に映す</strong>
                <ol class="ivocr-help-popup__list ivocr-help-popup__list--alpha" type="A">
                  <li><strong>無線 (AirPlay)</strong>
                    <ul class="ivocr-help-popup__list ivocr-help-popup__list--nested">
                      <li>無料なら LetsView がシンプル。有料で安定重視なら AirServer も選択肢です。</li>
                      <li>iPhone と PC を同じ Wi-Fi に接続し、コントロールセンター → 画面ミラーリングで PC 側アプリを選びます。</li>
                    </ul>
                  </li>
                  <li><strong>有線 (キャプチャカード)</strong>
                    <ul class="ivocr-help-popup__list ivocr-help-popup__list--nested">
                      <li>Lightning-&gt;HDMI アダプタ → HDMI ケーブル → USB キャプチャカードで PC に接続します。</li>
                      <li>ブラウザがキャプチャデバイスを認識しているか確認します。</li>
                    </ul>
                  </li>
                </ol>
              </li>
            </ol>
          </div>
        </div>
        <div>
          <button class="ivocr-accordion__btn" data-accordion-toggle="mac">6. macOS での準備（必要な場合）<span>開く</span></button>
          <div class="ivocr-accordion__panel" data-accordion-panel="mac">
            <ol class="ivocr-help-popup__list ivocr-help-popup__list--numbered">
              <li>最新の Chrome または Edge をインストールし、Tampermonkey を追加します。</li>
              <li><strong>iPhone を Mac に映す方法</strong>
                <ol class="ivocr-help-popup__list ivocr-help-popup__list--alpha" type="A">
                  <li><strong>無線 (AirPlay)</strong>: コントロールセンター → 画面ミラーリングで Mac を選択 (macOS Monterey 以降推奨)。</li>
                  <li><strong>有線 (QuickTime)</strong>: Lightning ケーブルで接続し、QuickTime Player → 新規ムービー収録 → カメラ/マイクに iPhone を指定。</li>
                  <li><strong>有線 (キャプチャカード)</strong>: Lightning-&gt;HDMI アダプタとキャプチャカードで入力し、Chrome の <code>getUserMedia</code> からデバイスを選びます。</li>
                </ol>
              </li>
              <li><strong>オプション</strong>: Mac に映した画面を Teams / Zoom / OBS NDI などで Windows へ再配信する構成も可能です。</li>
            </ol>
          </div>
        </div>
      </div>
      <div class="ivocr-help-popup__foot">
        ヒント: 画面を明るく・大きく映すほど OCR 精度が安定します。枠がずれたら再校正し、「拡大表示」でパネル幅を広げると操作しやすくなります。
      </div>
    </div>
    <div class="ivocr-body">
      <div class="ivocr-row">
        <label>入力ソース</label>
        <select id="ivocr-source">
          <option value="screen">Screen（画面共有）</option>
          <option value="camera">Camera（キャプチャ）</option>
        </select>
        <button class="ivocr-btn" id="ivocr-start">開始</button>
        <button class="ivocr-btn" id="ivocr-stop">停止</button>
      </div>
      <div class="ivocr-preview-container">
        <canvas class="ivocr-preview" id="ivocr-canvas" width="320" height="640"></canvas>
      </div>
      <div class="ivocr-legend-wrap" id="ivocr-legend"></div>
      <div class="ivocr-accordion ivocr-calib-accordion">
        <div>
          <button class="ivocr-accordion__btn" data-accordion-toggle="calibration">枠校正と自動推定<span>開く</span></button>
          <div class="ivocr-accordion__panel" data-accordion-panel="calibration">
            <div class="ivocr-row">
              <span class="ivocr-small">プレビュー上で 2クリック（左上→右下）で枠を作成</span>
            </div>
            <fieldset class="ivocr-fieldset" data-group="calibration">
              <legend class="ivocr-legend">枠校正と自動推定</legend>
              <div class="ivocr-row">
                <button class="ivocr-btn ivocr-tooltip" id="ivocr-calib-cp" data-calib="cp" data-tip="CPの数値を囲むよう左上→右下でクリック">校正: CP</button>
                <button class="ivocr-btn ivocr-tooltip" id="ivocr-calib-hp" data-calib="hp" data-tip="HPの数値部分を枠で指定">校正: HP</button>
                <button class="ivocr-btn ivocr-tooltip" id="ivocr-calib-dust" data-calib="dust" data-tip="ほしのすな表示を枠で指定">校正: すな</button>
              </div>
              <div class="ivocr-row">
                <button class="ivocr-btn ivocr-tooltip" id="ivocr-calib-name" data-calib="name" data-tip="ポケモン名の表示欄を囲みます">校正: 名前</button>
                <button class="ivocr-btn ivocr-tooltip" id="ivocr-calib-atk" data-calib="atkGauge" data-tip="こうげきバー全体を囲みます">校正: こうげきバー</button>
                <button class="ivocr-btn ivocr-tooltip" id="ivocr-calib-def" data-calib="defGauge" data-tip="ぼうぎょバー全体を囲みます">校正: ぼうぎょバー</button>
                <button class="ivocr-btn ivocr-tooltip" id="ivocr-calib-hpbar" data-calib="hpGauge" data-tip="HPバー全体を囲みます">校正: HPバー</button>
              </div>
              <div class="ivocr-row">
                <button class="ivocr-btn ivocr-tooltip" id="ivocr-auto-stat" data-calib="autoStat" data-tip="ラベル文字の付近をクリックするとバーを推定">自動: ラベル→バー</button>
                <span class="ivocr-small">ラベル付近をクリックすると対応バーを自動検出</span>
              </div>
              <div class="ivocr-row">
                <button class="ivocr-btn ivocr-tooltip" id="ivocr-auto-name" data-calib="autoName" data-tip="HPバー上の緑部分をクリックすると名前枠を推定">自動: HPバー→名前</button>
                <span class="ivocr-small">HPゲージの緑部分をクリックで名前枠を自動設定</span>
              </div>
              <div class="ivocr-row">
                <button class="ivocr-btn" id="ivocr-save">保存</button>
                <button class="ivocr-btn" id="ivocr-clear">枠クリア</button>
              </div>
            </fieldset>
          </div>
        </div>
      </div>
      <div class="ivocr-row">
        <label>状態</label>
        <span id="ivocr-status" class="ivocr-badge">Idle</span>
      </div>
      <div class="ivocr-row ivocr-name-row">
        <label>名前</label>
        <input id="ivocr-name-input" class="ivocr-name-input" type="text" placeholder="認識中…" />
      </div>
      <div class="ivocr-row">
        <label>候補</label>
        <div id="ivocr-name-suggestions" class="ivocr-name-suggestions"></div>
      </div>
      <div class="ivocr-row">
        <label>最新値</label>
        <span>CP: <span id="ivocr-val-cp">-</span></span>
        <span>HP: <span id="ivocr-val-hp">-</span></span>
        <span>すな: <span id="ivocr-val-dust">-</span></span>
      </div>
      <div class="ivocr-row ivocr-iv-row">
        <label>IV推定</label>
        <div class="ivocr-iv-fields">
          <label class="ivocr-iv-field">攻:
            <input type="number" id="ivocr-iv-atk-input" min="0" max="15" step="1" inputmode="numeric" placeholder="--" />
          </label>
          <label class="ivocr-iv-field">防:
            <input type="number" id="ivocr-iv-def-input" min="0" max="15" step="1" inputmode="numeric" placeholder="--" />
          </label>
          <label class="ivocr-iv-field">HP:
            <input type="number" id="ivocr-iv-hp-input" min="0" max="15" step="1" inputmode="numeric" placeholder="--" />
          </label>
        </div>
      </div>
      <div class="ivocr-row ivocr-toggle">
        <input type="checkbox" id="ivocr-autofill" />
        <label for="ivocr-autofill">自動入力</label>
      </div>
      <div class="ivocr-row ivocr-auto-status" id="ivocr-auto-status">
        <span>最終転記: <span id="ivocr-auto-timestamp">-</span></span>
        <span>成功率: <span id="ivocr-ocr-score">-</span></span>
      </div>
      <div class="ivocr-row ivocr-toggle">
        <input type="checkbox" id="ivocr-autoselect" />
        <label for="ivocr-autoselect">候補を自動選択（先頭1件）</label>
      </div>
      <div class="ivocr-row ivocr-small">
        Tips: 許可ダイアログでミラーウィンドウまたはキャプチャデバイスを選択してください。
      </div>
      <div class="ivocr-accordion ivocr-league-accordion" id="ivocr-league-accordion">
        <div>
          <button class="ivocr-accordion__btn" data-accordion-toggle="league-super">スーパーリーグ<span>開く</span></button>
          <div class="ivocr-accordion__panel" data-accordion-panel="league-super">
            <div id="ivocr-league-super" class="ivocr-league-table">
              <div class="ivocr-small">スーパーリーグのランキングを読み込み中です…</div>
            </div>
          </div>
        </div>
        <div>
          <button class="ivocr-accordion__btn" data-accordion-toggle="league-hyper">ハイパーリーグ<span>開く</span></button>
          <div class="ivocr-accordion__panel" data-accordion-panel="league-hyper">
            <div id="ivocr-league-hyper" class="ivocr-league-table">
              <div class="ivocr-small">ハイパーリーグのランキングを読み込み中です…</div>
            </div>
          </div>
        </div>
        <div>
          <button class="ivocr-accordion__btn" data-accordion-toggle="league-master">マスターリーグ<span>開く</span></button>
          <div class="ivocr-accordion__panel" data-accordion-panel="league-master">
            <div id="ivocr-league-master" class="ivocr-league-table">
              <div class="ivocr-small">マスターリーグのランキングを読み込み中です…</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const elSource = /** @type {HTMLSelectElement} */ (panel.querySelector('#ivocr-source'));
  const elStart = panel.querySelector('#ivocr-start');
  const elStop = panel.querySelector('#ivocr-stop');
  const elCanvas = /** @type {HTMLCanvasElement} */ (panel.querySelector('#ivocr-canvas'));
  const elStatus = panel.querySelector('#ivocr-status');
  const elValCp = panel.querySelector('#ivocr-val-cp');
  const elValHp = panel.querySelector('#ivocr-val-hp');
  const elValDust = panel.querySelector('#ivocr-val-dust');
  const elAutoFill = /** @type {HTMLInputElement} */ (panel.querySelector('#ivocr-autofill'));
  const elAutoSelect = /** @type {HTMLInputElement} */ (panel.querySelector('#ivocr-autoselect'));
  const btnCalibCp = panel.querySelector('#ivocr-calib-cp');
  const btnCalibHp = panel.querySelector('#ivocr-calib-hp');
  const btnCalibDust = panel.querySelector('#ivocr-calib-dust');
  const btnCalibName = panel.querySelector('#ivocr-calib-name');
  const btnCalibAtk = panel.querySelector('#ivocr-calib-atk');
  const btnCalibDef = panel.querySelector('#ivocr-calib-def');
  const btnCalibHpBar = panel.querySelector('#ivocr-calib-hpbar');
  const btnAutoStat = panel.querySelector('#ivocr-auto-stat');
  const btnAutoName = panel.querySelector('#ivocr-auto-name');
  const btnSave = panel.querySelector('#ivocr-save');
  const btnClear = panel.querySelector('#ivocr-clear');
  const btnWideToggle = panel.querySelector('#ivocr-wide-toggle');
  const btnHelp = panel.querySelector('#ivocr-help-btn');
  const helpPopup = panel.querySelector('#ivocr-help-popup');
  const btnHelpClose = panel.querySelector('#ivocr-help-close');
  const btnCopyScript = panel.querySelector('#ivocr-copy-script');
  const btnThemeToggle = panel.querySelector('#ivocr-theme-toggle');
  const headerEl = panel.querySelector('.ivocr-header');
  const nameInput = /** @type {HTMLInputElement | null} */ (panel.querySelector('#ivocr-name-input'));
  const elNameSuggestions = panel.querySelector('#ivocr-name-suggestions');
  /** @typedef {'atk' | 'def' | 'hp'} IvKind */
  const IV_KINDS = /** @type {IvKind[]} */ (['atk', 'def', 'hp']);
  /** @type {Record<IvKind, HTMLInputElement | null>} */
  const ivInputs = {
    atk: panel.querySelector('#ivocr-iv-atk-input'),
    def: panel.querySelector('#ivocr-iv-def-input'),
    hp: panel.querySelector('#ivocr-iv-hp-input'),
  };
  const leagueContainers = {
    super: panel.querySelector('#ivocr-league-super'),
    hyper: panel.querySelector('#ivocr-league-hyper'),
    master: panel.querySelector('#ivocr-league-master'),
  };

  const calibButtonMap = {
    cp: btnCalibCp,
    hp: btnCalibHp,
    dust: btnCalibDust,
    name: btnCalibName,
    atkGauge: btnCalibAtk,
    defGauge: btnCalibDef,
    hpGauge: btnCalibHpBar,
    autoStat: btnAutoStat,
    autoName: btnAutoName,
  };

  STATE.canvasEl = elCanvas;
  STATE.ctx = elCanvas.getContext('2d');
  STATE.videoEl = document.createElement('video');
  STATE.videoEl.playsInline = true;
  STATE.videoEl.muted = true;
  STATE.videoEl.addEventListener('loadedmetadata', handleVideoMetadata);

  const PANEL_POS_KEY = 'iv-ocr-panel-pos-v1';
  const PANEL_WIDE_KEY = 'iv-ocr-panel-wide-v1';
  restorePanelPosition();
  restorePanelWideState();
  STATE.theme = loadThemePreference();
  applyTheme(STATE.theme);
  setupAccordions(panel);
  /** @type {Array<'super' | 'hyper' | 'master'>} */ (['super', 'hyper', 'master']).forEach((leagueKey) => {
    // 各リーグのランキングをあらかじめ取得しておく
    loadLeagueTable(leagueKey, /** @type {HTMLElement | null} */ (leagueContainers[leagueKey]));
  });
  if (headerEl) {
    enablePanelDrag(headerEl);
  }

  // ---------------------
  // 校正クリック処理
  // ---------------------

  let clickStep = 0;
  /** @type {{x:number,y:number} | null} */
  let tempStart = null;

  btnCalibCp?.addEventListener('click', () => setCalibTarget('cp'));
  btnCalibHp?.addEventListener('click', () => setCalibTarget('hp'));
  btnCalibDust?.addEventListener('click', () => setCalibTarget('dust'));
  btnCalibName?.addEventListener('click', () => setCalibTarget('name'));
  btnCalibAtk?.addEventListener('click', () => setCalibTarget('atkGauge'));
  btnCalibDef?.addEventListener('click', () => setCalibTarget('defGauge'));
  btnCalibHpBar?.addEventListener('click', () => setCalibTarget('hpGauge'));
  btnAutoStat?.addEventListener('click', () => {
    const next = setCalibTarget('autoStat');
    if (next === 'autoStat') {
      toast('ラベル文字の少し上をクリックしてください。');
    } else {
      toast('自動校正（ラベル→バー）を終了しました。');
    }
  });
  btnAutoName?.addEventListener('click', () => {
    const next = setCalibTarget('autoName');
    if (next === 'autoName') {
      toast('HPバーの緑色部分をクリックしてください。');
    } else {
      toast('自動校正（HPバー→名前）を終了しました。');
    }
  });
  btnSave?.addEventListener('click', () => { saveROI(STATE.roi); toast('ROI を localStorage に保存しました。'); });
  btnClear?.addEventListener('click', () => {
    STATE.roi = { cp: null, hp: null, dust: null, name: null, atkGauge: null, defGauge: null, hpGauge: null };
    STATE.draftRect = null;
    saveROI(STATE.roi);
    toast('ROI をクリアしました。');
  });

  btnWideToggle?.addEventListener('click', () => {
    const isWide = !panel.classList.contains('ivocr-wide');
    applyPanelWideState(isWide);
    localStorage.setItem(PANEL_WIDE_KEY, JSON.stringify({ enabled: isWide }));
  });

  btnHelp?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleHelpPopup();
  });

  btnHelpClose?.addEventListener('click', (event) => {
    event.stopPropagation();
    closeHelpPopup();
  });

  btnCopyScript?.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (!(btnCopyScript instanceof HTMLButtonElement)) return;
    await copyScriptSourceToClipboard(btnCopyScript);
  });

  btnThemeToggle?.addEventListener('click', () => {
    const nextTheme = STATE.theme === 'contrast' ? 'default' : 'contrast';
    setTheme(nextTheme);
  });

  for (const kind of IV_KINDS) {
    const input = ivInputs[kind];
    if (!input) continue;
    input.addEventListener('input', () => handleManualIvInput(kind, input));
    input.addEventListener('change', () => handleManualIvInput(kind, input));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });
  }

  window.addEventListener('click', (event) => {
    if (!helpPopup || !helpPopup.classList.contains('open')) return;
    if (!(event.target instanceof Node)) return;
    if (!panel.contains(event.target) || (!helpPopup.contains(event.target) && event.target !== btnHelp)) {
      closeHelpPopup();
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('#wiki_atk a[data-val], #wiki_def a[data-val], #wiki_hp a[data-val]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const span = anchor.closest('span[id^="wiki_"]');
    if (!span) return;
    const kindId = span.id.replace('wiki_', '');
    if (!isIvKind(kindId)) return;
    const value = Number(anchor.dataset.val);
    if (!Number.isFinite(value)) return;
    applyManualIvOverride(kindId, value, { source: 'dom' });
  });

  elSource?.addEventListener('change', () => {
    STATE.source = /** @type {typeof STATE.source} */ (elSource.value);
  });

  elAutoFill?.addEventListener('change', () => {
    STATE.autoFill = elAutoFill.checked;
  });

  if (elAutoSelect) {
    elAutoSelect.checked = STATE.autoSelectName;
    elAutoSelect.addEventListener('change', () => {
      STATE.autoSelectName = elAutoSelect.checked;
      saveAutoSelectFlag(STATE.autoSelectName);
      if (!STATE.autoSelectName && nameSelectionTimer !== null) {
        window.clearTimeout(nameSelectionTimer);
        nameSelectionTimer = null;
      }
    });
  }

  if (nameInput) {
    if (STATE.manualNameOverride) {
      nameInput.value = STATE.manualNameOverride;
      nameInput.classList.add('is-manual');
    }
    nameInput.addEventListener('input', () => {
      applyManualNameOverride(nameInput.value, { fill: false, syncDom: true });
    });
    nameInput.addEventListener('change', () => {
      applyManualNameOverride(nameInput.value, { fill: true, syncDom: true });
    });
    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        nameInput.blur();
      }
    });
  }

  if (elNameSuggestions instanceof HTMLElement) {
    elNameSuggestions.addEventListener('click', (event) => {
      // 候補ボタン経由で検索欄へ即座に転記する
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const { value } = target.dataset;
      if (!value) return;
      applyManualNameOverride(value, { fill: true });
    });
  }

  elStart?.addEventListener('click', startCapture);
  elStop?.addEventListener('click', stopCapture);

  elCanvas.addEventListener('click', async (e) => {
    if (STATE.calibTarget === 'none') return;
    const rect = elCanvas.getBoundingClientRect();
    const scaleX = elCanvas.width / rect.width;
    const scaleY = elCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (STATE.calibTarget === 'autoStat') {
      await autoCalibrateStat({ x, y });
      STATE.calibTarget = 'none';
      clickStep = 0;
      tempStart = null;
      STATE.draftRect = null;
      updateCalibButtonState();
      return;
    }

    if (STATE.calibTarget === 'autoName') {
      await autoCalibrateName({ x, y });
      STATE.calibTarget = 'none';
      clickStep = 0;
      tempStart = null;
      STATE.draftRect = null;
      updateCalibButtonState();
      return;
    }

    if (clickStep === 0) {
      tempStart = { x, y };
      clickStep = 1;
      STATE.draftRect = null;
      toast('右下の枠をドラッグしてROIを指定してください。');
      return;
    }

    if (!tempStart) {
      clickStep = 0;
      STATE.draftRect = null;
      toast('もう一度開始点をクリックしてください。');
      return;
    }

    const x1 = Math.min(tempStart.x, x);
    const y1 = Math.min(tempStart.y, y);
    const x2 = Math.max(tempStart.x, x);
    const y2 = Math.max(tempStart.y, y);
    const roi = pxToNorm({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, elCanvas);
    const target = STATE.calibTarget;
    setROI(target, roi);
    if (target === 'autoStat' || target === 'autoName') {
      STATE.calibTarget = 'none';
    }
    clickStep = 0;
    tempStart = null;
    STATE.draftRect = null;
    updateCalibButtonState();
    toast('枠を保存する場合は「保存」ボタンを押してください。');
  });

  elCanvas.addEventListener('mousemove', (e) => {
    if (STATE.calibTarget === 'none') return;
    if (STATE.calibTarget === 'autoStat' || STATE.calibTarget === 'autoName') return;
    if (clickStep !== 1 || !tempStart) return;
    const rect = elCanvas.getBoundingClientRect();
    const scaleX = elCanvas.width / rect.width;
    const scaleY = elCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const x1 = Math.min(tempStart.x, x);
    const y1 = Math.min(tempStart.y, y);
    const x2 = Math.max(tempStart.x, x);
    const y2 = Math.max(tempStart.y, y);
    STATE.draftRect = pxToNorm({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, elCanvas);
  });

  elCanvas.addEventListener('mouseleave', () => {
    if (clickStep === 1) {
      STATE.draftRect = null;
    }
  });
  const throttledOcr = throttle(async () => PERF.measureAsync('ocr-read', async () => {
    if (!STATE.canvasEl) return;
    const next = await readAll(STATE.canvasEl, STATE.roi);
    if (!next) return;
    const stable = stabilize(next, STATE.stableBuf);
    if (!stable) return;
    STATE.lastValues = stable;
    renderValues(stable);
    if (STATE.autoFill) {
      fillTo9db(stable);
    }
  }), LOOP_INTERVALS.ocr);

  const throttledIv = throttle(() => PERF.measure('iv-read', () => {
    if (!STATE.canvasEl) return;
    const samples = readGauges(STATE.canvasEl, STATE.roi);
    if (!samples) return;
    const stable = stabilizeIvSamples(samples, STATE.stableIvBuf, STATE.lastIv);
    if (!stable) return;
    STATE.lastIv = stable;
    const effective = getEffectiveIv(stable);
    renderIv(effective);
    handleManualIvScreenChange();
    if (STATE.autoFill) {
      fillIvBars(effective);
    }
  }), LOOP_INTERVALS.iv);

  const throttledName = throttle(async () => PERF.measureAsync('name-read', async () => {
    if (!STATE.canvasEl) return;
    const result = await readPokemonName(STATE.canvasEl, STATE.roi, STATE.lastName);
    if (!result) {
      handleManualNameScreenChange();
      return;
    }
    const manual = STATE.manualNameOverride;
    if (manual) {
      renderName(result, manual);
      if (STATE.lastName !== manual) {
        STATE.lastName = manual;
      }
      handleManualNameScreenChange();
      return;
    }

    const matched = result.matched;
    const sameAsBefore = matched ? matched === STATE.lastName : false;
    renderName(result);
    if (!matched || sameAsBefore) {
      handleManualNameScreenChange();
      return;
    }
    STATE.lastName = matched;
    handleManualNameScreenChange();
  }), LOOP_INTERVALS.name);

  async function loop() {
    if (!STATE.running || !STATE.videoEl || !STATE.ctx || !STATE.canvasEl) return;
    PERF.measure('frame', () => {
      const { videoEl, ctx, canvasEl } = STATE;

      adjustCanvasResolution();

      if (videoEl.readyState >= 2) {
        ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
        drawROIs(ctx, canvasEl, STATE.roi, STATE.calibTarget, STATE.draftRect);
        throttledOcr();
        throttledIv();
        throttledName();
      }
      STATE.loopId = requestAnimationFrame(loop);
    });
  }

  function renderValues(values) {
    if (elValCp) elValCp.textContent = values.cp?.toString() ?? '-';
    if (elValHp) elValHp.textContent = values.hp?.toString() ?? '-';
    if (elValDust) elValDust.textContent = values.dust?.toString() ?? '-';
  }

  /**
   * OCRから得られた名前情報と候補ボタンを同時に描画する
   * @param {NameReadResult | null} result
   * @param {string | null} [activeValue]
   */
  function renderName(result, activeValue) {
    const matched = result?.matched ?? null;
    const normalized = result?.normalized ?? '';
    const suggestions = result?.suggestions ?? [];
    STATE.nameSuggestions = suggestions;
    STATE.lastNameNormalized = normalized;

    if (matched || suggestions[0]?.value) {
      const canonical = matched ?? suggestions[0]?.value ?? null;
      if (canonical) {
        STATE.lastNameMatched = canonical;
      }
    }

    // 最上位候補はテキスト入力に表示し、それ以外の上位4件をボタンとして利用する
    const [primarySuggestion, ...rawSecondary] = suggestions;
    const secondarySuggestions = rawSecondary
      .filter((item) => !primarySuggestion || item.value !== primarySuggestion.value)
      .slice(0, 4);

    if (typeof activeValue === 'string') {
      STATE.manualNameOverride = activeValue;
    } else if (activeValue === null) {
      STATE.manualNameOverride = null;
    }

    let manualValue = typeof activeValue === 'string' ? activeValue : STATE.manualNameOverride;
    if (typeof manualValue === 'string') {
      const trimmed = manualValue.trim();
      manualValue = trimmed.length ? trimmed : null;
      STATE.manualNameOverride = manualValue;
    }

    const primaryValue = primarySuggestion?.value ?? matched ?? normalized ?? '';
    const displayText = manualValue ?? primaryValue ?? '';

    if (manualValue) {
      STATE.lastName = manualValue;
    } else {
      const canonical = primarySuggestion?.value ?? matched ?? null;
      if (canonical) {
        STATE.lastName = canonical;
      }
    }

    STATE.activeNameValue = manualValue ?? matched ?? primarySuggestion?.value ?? null;

    if (nameInput instanceof HTMLInputElement) {
      const activeEl = document.activeElement;
      if (activeEl !== nameInput || typeof activeValue === 'string') {
        if (nameInput.value !== displayText) {
          nameInput.value = displayText;
        }
      }
      nameInput.classList.toggle('is-manual', Boolean(manualValue));
      nameInput.placeholder = normalized || '認識中…';
    }

    if (!manualValue) {
      const shouldFocus = STATE.autoFill;
      const shouldTriggerSelection = STATE.autoFill && STATE.autoSelectName;
      const shouldDispatchChange = STATE.autoFill;
      // 第一候補を9db側の検索欄にも反映（手動入力中はapplyManualNameOverrideで同期）
      fillPokemonName(displayText, {
        focus: shouldFocus,
        triggerSelection: shouldTriggerSelection,
        dispatchChange: shouldDispatchChange,
      });
    }

    if (!(elNameSuggestions instanceof HTMLElement)) return;
    elNameSuggestions.replaceChildren();
    if (!secondarySuggestions.length) return;

    const highlight = STATE.activeNameValue;
    for (const suggestion of secondarySuggestions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = suggestion.label;
      btn.dataset.value = suggestion.value;
      btn.dataset.source = suggestion.source;
      if (highlight && suggestion.value === highlight) {
        btn.classList.add('is-active');
      }
      elNameSuggestions.appendChild(btn);
    }
  }

  function renderIv(iv) {
    const activeEl = document.activeElement;
    for (const kind of IV_KINDS) {
      const input = ivInputs[kind];
      if (!input) continue;
      const isManual = STATE.manualIvOverrides[kind] !== null;
      if (activeEl !== input || isManual) {
        const nextValue = iv[kind];
        input.value = nextValue == null ? '' : String(nextValue);
      }
      input.classList.toggle('is-manual', isManual);
      const base = STATE.lastIv?.[kind];
      input.title = isManual && typeof base === 'number'
        ? `手動設定中 / OCR推定: ${base}`
        : 'OCR推定値 (0〜15)';
    }
  }

  /**
   * テキストエリアや候補選択からの名前変更を内部状態と9dbへ反映
   * @param {string} value
  * @param {{fill?: boolean, syncDom?: boolean}} [options]
   */
  function applyManualNameOverride(value, options = {}) {
    const fill = options.fill ?? true;
    const syncDom = options.syncDom ?? false;
    const trimmed = value.trim();
    const manual = trimmed.length ? trimmed : null;

    STATE.manualNameOverride = manual;
    STATE.activeNameValue = manual ?? STATE.activeNameValue ?? null;

    if (manual) {
      STATE.lastName = manual;
      if (fill) {
        fillPokemonName(manual, {
          focus: false,
          triggerSelection: STATE.autoFill && STATE.autoSelectName,
          dispatchChange: STATE.autoFill,
        });
      } else if (syncDom) {
        fillPokemonName(manual, {
          focus: false,
          triggerSelection: false,
          dispatchChange: false,
        });
      }
      const signature = computeScreenSignature();
      STATE.manualNameScreenSignature = signature === EMPTY_SCREEN_SIGNATURE ? null : signature;
      nameSignatureChangeTracker.value = null;
      nameSignatureChangeTracker.count = 0;
    } else {
      STATE.manualNameScreenSignature = null;
      nameSignatureChangeTracker.value = null;
      nameSignatureChangeTracker.count = 0;
    }

    renderName({
      matched: STATE.lastName ?? null,
      normalized: STATE.lastNameNormalized,
      suggestions: STATE.nameSuggestions,
    }, manual);
  }

  /**
   * 手動入力した名前をリセットし、最新のOCR結果へ戻します。
   */
  function clearManualNameOverride() {
    if (!STATE.manualNameOverride) return;
    STATE.manualNameOverride = null;
    STATE.manualNameScreenSignature = null;
    nameSignatureChangeTracker.value = null;
    nameSignatureChangeTracker.count = 0;
    renderName({
      matched: STATE.lastNameMatched ?? null,
      normalized: STATE.lastNameNormalized,
      suggestions: STATE.nameSuggestions,
    }, null);
  }

  /**
   * スワイプ等で画面が切り替わった際に手動名前を自動解除します。
   */
  function handleManualNameScreenChange() {
    if (!STATE.manualNameOverride) {
      STATE.manualNameScreenSignature = null;
      nameSignatureChangeTracker.value = null;
      nameSignatureChangeTracker.count = 0;
      return;
    }

    const nextSignature = computeScreenSignature();
    if (nextSignature === EMPTY_SCREEN_SIGNATURE) {
      return;
    }

    if (!STATE.manualNameScreenSignature) {
      STATE.manualNameScreenSignature = nextSignature;
      nameSignatureChangeTracker.value = null;
      nameSignatureChangeTracker.count = 0;
      return;
    }

    if (STATE.manualNameScreenSignature === nextSignature) {
      nameSignatureChangeTracker.value = null;
      nameSignatureChangeTracker.count = 0;
      return;
    }

    if (nameSignatureChangeTracker.value === nextSignature) {
      nameSignatureChangeTracker.count += 1;
    } else {
      nameSignatureChangeTracker.value = nextSignature;
      nameSignatureChangeTracker.count = 1;
    }

    if (nameSignatureChangeTracker.count >= SCREEN_CHANGE_CONFIRMATIONS) {
      clearManualNameOverride();
    }
  }

  /**
   * 手動入力用に値を 0〜15 の整数へ丸め込みます。
   * @param {number} value
   * @returns {number | null}
   */
  function clampIvValue(value) {
    if (!Number.isFinite(value)) return null;
    const rounded = Math.round(value);
    return clamp(rounded, 0, 15);
  }

  /**
   * OCR結果と手動入力を統合した IV を返します。
   * @param {{atk:number|null,def:number|null,hp:number|null} | null} [base]
   * @returns {{atk:number|null,def:number|null,hp:number|null}}
   */
  function getEffectiveIv(base) {
    const fallback = base ?? STATE.lastIv ?? { atk: null, def: null, hp: null };
    return {
      atk: STATE.manualIvOverrides.atk ?? fallback.atk ?? null,
      def: STATE.manualIvOverrides.def ?? fallback.def ?? null,
      hp: STATE.manualIvOverrides.hp ?? fallback.hp ?? null,
    };
  }

  /**
   * パネル側で IV を手動入力した際の処理
   * @param {IvKind} kind
   * @param {HTMLInputElement} input
   */
  function handleManualIvInput(kind, input) {
    const raw = input.value.trim();
    if (!raw) {
      applyManualIvOverride(kind, null);
      return;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      toast('IV は 0〜15 の半角数字で入力してください。');
      input.value = '';
      applyManualIvOverride(kind, null);
      return;
    }

    const clamped = clampIvValue(parsed);
    if (clamped === null) {
      toast('IV は 0〜15 の範囲で指定してください。');
      input.value = '';
      applyManualIvOverride(kind, null);
      return;
    }

    if (clamped !== parsed) {
      toast('IV を 0〜15 の範囲に丸めました。');
    }
    input.value = String(clamped);
    applyManualIvOverride(kind, clamped);
  }

  /**
   * 手動 IV が一つでも有効かどうかを返します。
   * @returns {boolean}
   */
  function hasManualIvOverrides() {
    return IV_KINDS.some((kind) => STATE.manualIvOverrides[kind] !== null);
  }

  /**
   * 直近の画面情報をまとめて署名化し、スワイプ検出に使います。
   * @returns {string}
   */
  function computeScreenSignature() {
    const valueSnapshot = STATE.lastValues ?? { cp: null, hp: null, dust: null };
    const ivSnapshot = STATE.lastIv ?? { atk: null, def: null, hp: null };
    const nameKey = STATE.lastNameNormalized || STATE.lastName || null;
    return JSON.stringify({
      cp: typeof valueSnapshot.cp === 'number' ? valueSnapshot.cp : null,
      hp: typeof valueSnapshot.hp === 'number' ? valueSnapshot.hp : null,
      dust: typeof valueSnapshot.dust === 'number' ? valueSnapshot.dust : null,
      atk: typeof ivSnapshot.atk === 'number' ? ivSnapshot.atk : null,
      def: typeof ivSnapshot.def === 'number' ? ivSnapshot.def : null,
      hpIv: typeof ivSnapshot.hp === 'number' ? ivSnapshot.hp : null,
      name: nameKey,
    });
  }

  /**
   * 2つの署名間で数値ステータスが変化したか判定します。
   * @param {string | null} prev
   * @param {string | null} next
   * @returns {boolean}
   */
  function hasStatSignatureDelta(prev, next) {
    if (!prev || !next || prev === next) return false;
    try {
      const prevObj = JSON.parse(prev);
      const nextObj = JSON.parse(next);
      const keys = /** @type {Array<'cp'|'hp'|'dust'|'atk'|'def'|'hpIv'>} */ (['cp', 'hp', 'dust', 'atk', 'def', 'hpIv']);
      return keys.some((key) => {
        const prevVal = prevObj?.[key] ?? null;
        const nextVal = nextObj?.[key] ?? null;
        return nextVal !== null && nextVal !== prevVal;
      });
    } catch (error) {
      console.warn('[IV OCR] signature parse failed:', error);
      return true;
    }
  }

  /**
   * 手動 IV の上書き状態を記録し、必要に応じて DOM を同期
   * @param {IvKind} kind
   * @param {number | null} value
   * @param {{source?: 'panel' | 'dom'}} [options]
   */
  function applyManualIvOverride(kind, value, options = {}) {
    const source = options.source ?? 'panel';
    const normalized = value === null ? null : clampIvValue(value);
    const base = STATE.lastIv?.[kind] ?? null;

    if (normalized === null) {
      STATE.manualIvOverrides[kind] = null;
    } else {
      STATE.manualIvOverrides[kind] = normalized;
    }

    if (hasManualIvOverrides()) {
      const signature = computeScreenSignature();
      STATE.currentScreenSignature = signature;
      STATE.manualIvScreenSignature = signature === EMPTY_SCREEN_SIGNATURE ? null : signature;
      signatureChangeTracker.value = null;
      signatureChangeTracker.count = 0;
    } else {
      STATE.manualIvScreenSignature = null;
    }

    const effective = getEffectiveIv();
    renderIv(effective);

    if (source === 'panel') {
      reflectIvToDom(effective);
    }
  }

  /**
   * 手動 IV の上書きをまとめて解除し、OCR 読み取りに戻します。
   * @param {{source?: 'panel' | 'dom'}} [options]
   */
  function clearManualIvOverrides(options = {}) {
    if (!hasManualIvOverrides()) return;
    for (const kind of IV_KINDS) {
      STATE.manualIvOverrides[kind] = null;
    }
    STATE.manualIvScreenSignature = null;
    signatureChangeTracker.value = null;
    signatureChangeTracker.count = 0;
    const effective = getEffectiveIv();
    renderIv(effective);
    const source = options.source ?? 'panel';
    if (source === 'panel') {
      reflectIvToDom(effective);
    }
  }

  /**
   * OCRが新しい画面を捉えたと判断できた場合に手動IVを解除します。
   */
  function handleManualIvScreenChange() {
    const nextSignature = computeScreenSignature();
    const hasInformativeData = nextSignature !== EMPTY_SCREEN_SIGNATURE;
    if (STATE.currentScreenSignature !== nextSignature) {
      STATE.currentScreenSignature = nextSignature;
    }

    if (!hasManualIvOverrides()) {
      signatureChangeTracker.value = null;
      signatureChangeTracker.count = 0;
      return;
    }

    if (!hasInformativeData) {
      return;
    }

    if (!STATE.manualIvScreenSignature) {
      STATE.manualIvScreenSignature = nextSignature;
      signatureChangeTracker.value = null;
      signatureChangeTracker.count = 0;
      return;
    }

    if (STATE.manualIvScreenSignature === EMPTY_SCREEN_SIGNATURE) {
      STATE.manualIvScreenSignature = nextSignature;
      signatureChangeTracker.value = null;
      signatureChangeTracker.count = 0;
      return;
    }

    if (STATE.manualIvScreenSignature === nextSignature) {
      signatureChangeTracker.value = null;
      signatureChangeTracker.count = 0;
      return;
    }

    if (hasStatSignatureDelta(STATE.manualIvScreenSignature, nextSignature)) {
      clearManualIvOverrides({ source: 'panel' });
      STATE.manualIvScreenSignature = nextSignature;
      signatureChangeTracker.value = null;
      signatureChangeTracker.count = 0;
      return;
    }

    if (signatureChangeTracker.value === nextSignature) {
      signatureChangeTracker.count += 1;
    } else {
      signatureChangeTracker.value = nextSignature;
      signatureChangeTracker.count = 1;
    }

    if (signatureChangeTracker.count >= SCREEN_CHANGE_CONFIRMATIONS) {
      clearManualIvOverrides({ source: 'panel' });
      STATE.manualIvScreenSignature = nextSignature;
      signatureChangeTracker.value = null;
      signatureChangeTracker.count = 0;
    }
  }

  /**
   * 文字列が IV 種別か判定します。
   * @param {string} value
   * @returns {value is IvKind}
   */
  function isIvKind(value) {
    return value === 'atk' || value === 'def' || value === 'hp';
  }

  // ---------------------
  // キャプチャの開始 / 停止
  // ---------------------

  async function startCapture() {
    try {
      await stopCapture();
      updateStatus('要求中');
      if (STATE.source === 'screen') {
        STATE.stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: false,
        });
      } else {
        STATE.stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      }
      if (!STATE.videoEl || !STATE.stream) throw new Error('Video element or stream missing');
      STATE.videoEl.srcObject = STATE.stream;
      await STATE.videoEl.play();
      STATE.running = true;
      updateStatus('稼働中');
      loop();
    } catch (error) {
      console.error('[IV OCR] startCapture error:', error);
      alert('キャプチャの開始に失敗しました。共有設定と権限を確認してください。');
      updateStatus('エラー');
    }
  }

  async function stopCapture() {
    if (STATE.loopId) cancelAnimationFrame(STATE.loopId);
    STATE.loopId = null;
    if (STATE.stream) {
      STATE.stream.getTracks().forEach((track) => track.stop());
      STATE.stream = null;
    }
    if (STATE.videoEl) {
      STATE.videoEl.pause();
      STATE.videoEl.srcObject = null;
    }
    STATE.running = false;
    updateStatus('停止');
  }

  function updateStatus(text) {
    if (elStatus) elStatus.textContent = text;
  }

  function applyPanelPosition(x, y) {
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function restorePanelPosition() {
    try {
      const raw = localStorage.getItem(PANEL_POS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
        applyPanelPosition(parsed.x, parsed.y);
      }
    } catch (error) {
      console.warn('[IV OCR] restorePanelPosition error:', error);
    }
  }

  function applyPanelWideState(enabled) {
    if (enabled) {
      panel.classList.add('ivocr-wide');
    } else {
      panel.classList.remove('ivocr-wide');
    }
    updateWideButtonLabel(enabled);
  }

  function restorePanelWideState() {
    try {
      const raw = localStorage.getItem(PANEL_WIDE_KEY);
      if (!raw) {
        applyPanelWideState(false);
        return;
      }
      const parsed = JSON.parse(raw);
      const enabled = Boolean(parsed?.enabled);
      applyPanelWideState(enabled);
    } catch (error) {
      console.warn('[IV OCR] restorePanelWideState error:', error);
      applyPanelWideState(false);
    }
  }

  function updateWideButtonLabel(isWide) {
    if (btnWideToggle) {
      btnWideToggle.textContent = isWide ? '標準表示' : '拡大表示';
    }
  }

  function setCalibTarget(target) {
    if (STATE.calibTarget === target) {
      STATE.calibTarget = 'none';
      clickStep = 0;
      tempStart = null;
      STATE.draftRect = null;
      updateCalibButtonState();
      return STATE.calibTarget;
    }
    STATE.calibTarget = target;
    clickStep = 0;
    tempStart = null;
    STATE.draftRect = null;
    updateCalibButtonState();
    return STATE.calibTarget;
  }

  function updateCalibButtonState() {
    Object.entries(calibButtonMap).forEach(([key, button]) => {
      if (!(button instanceof HTMLElement)) return;
      if (STATE.calibTarget === key) {
        button.classList.add('is-active');
      } else {
        button.classList.remove('is-active');
      }
    });
  }

  /**
   * ヘルプポップアップを開く
   */
  function openHelpPopup() {
    if (!helpPopup) return;
    helpPopup.classList.add('open');
    helpPopup.scrollTop = 0;
    updateHelpToggleState(true);
  }

  /**
   * ヘルプポップアップを閉じる
   */
  function closeHelpPopup() {
    if (!helpPopup) return;
    helpPopup.classList.remove('open');
    updateHelpToggleState(false);
  }

  function toggleHelpPopup() {
    if (!helpPopup) return;
    if (helpPopup.classList.contains('open')) {
      closeHelpPopup();
    } else {
      openHelpPopup();
    }
  }

  function updateHelpToggleState(isOpen) {
    if (!(btnHelp instanceof HTMLElement)) return;
    btnHelp.setAttribute('aria-expanded', String(isOpen));
    btnHelp.classList.toggle('is-active', isOpen);
  }

  /**
   * アコーディオン全体の初期化（ヘルプ内・リーグ内の両方）
   * @param {HTMLElement | null} root
   */
  function setupAccordions(root) {
    if (!(root instanceof HTMLElement)) return;
    const groups = root.querySelectorAll('.ivocr-accordion');
    groups.forEach((group) => initAccordionGroup(group));
  }

  /**
   * 単一のアコーディオングループに開閉イベントを設定
   * @param {Element} groupEl
   */
  function initAccordionGroup(groupEl) {
    if (!(groupEl instanceof HTMLElement)) return;
    const toggles = Array.from(groupEl.querySelectorAll('[data-accordion-toggle]'));
    const panels = Array.from(groupEl.querySelectorAll('[data-accordion-panel]'));
    toggles.forEach((toggleEl) => {
      if (!(toggleEl instanceof HTMLButtonElement)) return;
      if (toggleEl.dataset.accordionBound === 'true') return;
      toggleEl.dataset.accordionBound = 'true';
      updateAccordionButtonState(toggleEl, false);
      toggleEl.addEventListener('click', () => {
        const key = toggleEl.dataset.accordionToggle;
        if (!key) return;
        const panelEl = groupEl.querySelector(`[data-accordion-panel="${key}"]`);
        if (!(panelEl instanceof HTMLElement)) return;
        const willOpen = !panelEl.classList.contains('open');
        panels.forEach((panelNode) => {
          if (!(panelNode instanceof HTMLElement)) return;
          const panelKey = panelNode.getAttribute('data-accordion-panel');
          panelNode.classList.remove('open');
          const relatedToggle = groupEl.querySelector(`[data-accordion-toggle="${panelKey}"]`);
          if (relatedToggle instanceof HTMLButtonElement) {
            updateAccordionButtonState(relatedToggle, false);
          }
        });
        if (willOpen) {
          panelEl.classList.add('open');
          updateAccordionButtonState(toggleEl, true);
        }
      });
    });
  }

  /**
   * ボタンのラベルと状態を開閉に合わせて更新
   * @param {HTMLButtonElement} button
   * @param {boolean} isOpen
   */
  function updateAccordionButtonState(button, isOpen) {
    button.setAttribute('aria-expanded', String(isOpen));
    button.classList.toggle('is-open', isOpen);
    const labelSpan = button.querySelector('span');
    if (labelSpan instanceof HTMLElement) {
      labelSpan.textContent = isOpen ? '閉じる' : '開く';
    }
  }

  /**
   * 指定リーグのランキングテーブルを取得し、パネル内に描画する
   * @param {LeagueKey} leagueKey
   * @param {HTMLElement | null} containerEl
   */
  function loadLeagueTable(leagueKey, containerEl) {
    if (!(containerEl instanceof HTMLElement)) return;
    const config = LEAGUE_CONFIG[leagueKey];
    const cache = LEAGUE_CACHE[leagueKey];
    if (!config || !cache) return;

    const now = Date.now();
    if (cache.html && now - cache.fetchedAt < LEAGUE_CACHE_TTL) {
      containerEl.innerHTML = cache.html;
      return;
    }

    containerEl.innerHTML = `<div class="ivocr-small">${config.title}のランキングを読み込み中です…</div>`;

    // GM_xmlhttpRequest なら CORS 制約を回避して公式データを取得できる
    GM_xmlhttpRequest({
      method: 'GET',
      url: config.url,
      timeout: 8000,
      onload(response) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(response.responseText, 'text/html');
          const table = doc.querySelector('.battle-ranking-table.bold');
          if (!(table instanceof HTMLTableElement)) {
            throw new Error('ランキング表が見つかりませんでした');
          }
          const fragmentHost = document.createElement('div');
          fragmentHost.appendChild(document.importNode(table, true));
          const html = fragmentHost.innerHTML;
          cache.html = html;
          cache.fetchedAt = Date.now();
          containerEl.innerHTML = html;
        } catch (error) {
          console.warn(`[IV OCR] ${leagueKey} league parse error:`, error);
          containerEl.innerHTML = `<div class="ivocr-error">${config.title}のデータ解析に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}</div>`;
        }
      },
      onerror() {
        containerEl.innerHTML = `<div class="ivocr-error">${config.title}の取得中にネットワークエラーが発生しました。</div>`;
      },
      ontimeout() {
        containerEl.innerHTML = `<div class="ivocr-error">${config.title}の取得がタイムアウトしました。</div>`;
      },
    });
  }

  /**
   * テーマを適用しボタン表示も更新
   * @param {'default' | 'contrast'} theme
   */
  function applyTheme(theme) {
    const isContrast = theme === 'contrast';
    panel.classList.toggle('ivocr-theme-contrast', isContrast);
    updateThemeToggleLabel(theme);
  }

  function updateThemeToggleLabel(theme) {
    if (!(btnThemeToggle instanceof HTMLButtonElement)) return;
    btnThemeToggle.textContent = theme === 'contrast' ? '標準テーマ' : '高コントラスト';
  }

  function setTheme(theme) {
    STATE.theme = theme;
    applyTheme(theme);
    saveThemePreference(theme);
  }

  function loadThemePreference() {
    try {
      const raw = localStorage.getItem(LS_THEME_KEY);
      if (!raw) return 'default';
      const parsed = JSON.parse(raw);
      return parsed?.theme === 'contrast' ? 'contrast' : 'default';
    } catch (error) {
      console.warn('[IV OCR] loadThemePreference error:', error);
      return 'default';
    }
  }

  function saveThemePreference(theme) {
    try {
      localStorage.setItem(LS_THEME_KEY, JSON.stringify({ theme }));
    } catch (error) {
      console.warn('[IV OCR] saveThemePreference error:', error);
    }
  }

  function handleVideoMetadata() {
    adjustCanvasResolution();
  }

  function adjustCanvasResolution() {
    if (!STATE.canvasEl || !STATE.videoEl) return;
    const vw = STATE.videoEl.videoWidth || 0;
    const vh = STATE.videoEl.videoHeight || 0;
    if (!vw || !vh) return;
    const nextSize = computeOptimalCanvasSize(vw, vh);
    if (STATE.canvasEl.width !== nextSize.width || STATE.canvasEl.height !== nextSize.height) {
      STATE.canvasEl.width = nextSize.width;
      STATE.canvasEl.height = nextSize.height;
      STATE.canvasEl.style.aspectRatio = `${nextSize.width} / ${nextSize.height}`;
    }
  }

  function computeOptimalCanvasSize(videoWidth, videoHeight) {
    if (!videoWidth || !videoHeight) {
      return { width: videoWidth || 1, height: videoHeight || 1 };
    }
    const widthScale = CANVAS_MAX_WIDTH / videoWidth;
    const heightScale = CANVAS_MAX_HEIGHT / videoHeight;
    const scale = Math.min(1, widthScale, heightScale);
    const width = Math.max(1, Math.round(videoWidth * scale));
    const height = Math.max(1, Math.round(videoHeight * scale));
    return { width, height };
  }

  // ---------------------
  // ROI ユーティリティ
  // ---------------------

  /**
   * ピクセル座標を 0-1 の正規化座標へ変換します。
   * @param {{x:number,y:number,w:number,h:number}} rect
   * @param {HTMLCanvasElement} canvas
   * @returns {ROI}
   */
  function pxToNorm(rect, canvas) {
    return {
      x: rect.x / canvas.width,
      y: rect.y / canvas.height,
      w: rect.w / canvas.width,
      h: rect.h / canvas.height,
    };
  }

  /**
   * 正規化座標の ROI を実際のピクセル座標へ変換します。
   * @param {ROI} r
   * @param {HTMLCanvasElement} canvas
   */
  function normToPx(r, canvas) {
    return {
      x: Math.round(r.x * canvas.width),
      y: Math.round(r.y * canvas.height),
      w: Math.round(r.w * canvas.width),
      h: Math.round(r.h * canvas.height),
    };
  }

  /**
   * ROI を対象キーへ設定します。
   * @param {'cp'|'hp'|'dust'|'name'|'atkGauge'|'defGauge'|'hpGauge'} target
   * @param {ROI} roi
   */
  function setROI(target, roi) {
    if (target === 'cp') STATE.roi.cp = roi;
    if (target === 'hp') STATE.roi.hp = roi;
    if (target === 'dust') STATE.roi.dust = roi;
    if (target === 'name') STATE.roi.name = roi;
    if (target === 'atkGauge') STATE.roi.atkGauge = roi;
    if (target === 'defGauge') STATE.roi.defGauge = roi;
    if (target === 'hpGauge') STATE.roi.hpGauge = roi;
  }

  /**
   * ROI を localStorage に保存します。
   * @param {{cp: ROI | null, hp: ROI | null, dust: ROI | null, name: ROI | null, atkGauge: ROI | null, defGauge: ROI | null, hpGauge: ROI | null}} roi
   */
  function saveROI(roi) {
    localStorage.setItem(LS_KEY, JSON.stringify(roi));
  }

  /**
   * localStorage から ROI を読み込みます。
   * @returns {{cp: ROI | null, hp: ROI | null, dust: ROI | null, name: ROI | null, atkGauge: ROI | null, defGauge: ROI | null, hpGauge: ROI | null}}
   */
  function loadROI() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { cp: null, hp: null, dust: null, name: null, atkGauge: null, defGauge: null, hpGauge: null };
      const parsed = JSON.parse(raw);
      return {
        cp: parsed?.cp ?? null,
        hp: parsed?.hp ?? null,
        dust: parsed?.dust ?? null,
        name: parsed?.name ?? null,
        atkGauge: parsed?.atkGauge ?? null,
        defGauge: parsed?.defGauge ?? null,
        hpGauge: parsed?.hpGauge ?? null,
      };
    } catch (error) {
      console.warn('[IV OCR] loadROI error:', error);
      return { cp: null, hp: null, dust: null, name: null, atkGauge: null, defGauge: null, hpGauge: null };
    }
  }

  function saveAutoSelectFlag(enabled) {
    try {
      localStorage.setItem(LS_AUTO_SELECT_KEY, JSON.stringify({ enabled }));
    } catch (error) {
      console.warn('[IV OCR] saveAutoSelectFlag error:', error);
    }
  }

  function loadAutoSelectFlag() {
    try {
      const raw = localStorage.getItem(LS_AUTO_SELECT_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.enabled);
    } catch (error) {
      console.warn('[IV OCR] loadAutoSelectFlag error:', error);
      return false;
    }
  }

  /**
   * ROI を可視化するための枠線を描画します。
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} canvas
   * @param {{cp: ROI | null, hp: ROI | null, dust: ROI | null, name: ROI | null, atkGauge: ROI | null, defGauge: ROI | null, hpGauge: ROI | null}} roi
   * @param {'none'|'cp'|'hp'|'dust'|'name'|'atkGauge'|'defGauge'|'hpGauge'|'autoStat'|'autoName'} active
   * @param {ROI | null} draftRect
   */
  function drawROIs(ctx, canvas, roi, active, draftRect) {
    ctx.save();
    const draw = (r, color) => {
      if (!r) return;
      const p = normToPx(r, canvas);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
    };
    /** @type {(keyof typeof ROI_COLOR_BASE)[]} */
    (['cp', 'hp', 'dust', 'name', 'atkGauge', 'defGauge', 'hpGauge']).forEach((key) => {
      const baseColor = ROI_COLOR_BASE[key];
      const activeColor = ROI_COLOR_ACTIVE[key];
      draw(roi[key], active === key ? activeColor : baseColor);
    });

    if (
      draftRect &&
      active !== 'none' &&
      active !== 'autoStat' &&
      active !== 'autoName'
    ) {
      const color = ROI_COLOR_ACTIVE[active] || '#4fc3f7';
      const p = normToPx(draftRect, canvas);
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = color;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.restore();
    }

    ctx.restore();
  }

  // ---------------------
  // OCR 処理
  // ---------------------

  const TesseractLib = window.Tesseract;

  /**
   * 全ての ROI を OCR し、数値を抽出します。
   * @param {HTMLCanvasElement} preview
   * @param {{cp: ROI | null, hp: ROI | null, dust: ROI | null}} roi
   * @returns {Promise<{cp:number|null,hp:number|null,dust:number|null}|null>}
   */
  async function readAll(preview, roi) {
    if (!roi.cp && !roi.hp && !roi.dust) return null;
    const result = { cp: null, hp: null, dust: null };
    /** @type {Promise<void>[]} */
    const tasks = [];

    const readOne = async (r) => {
      const crop = cropCanvas(preview, r);
      const ocr = await TesseractLib.recognize(crop, 'eng', {
        tessedit_char_whitelist: '0123456789',
      });
      const text = (ocr.data?.text || '').replace(/[^0-9]/g, '');
      return text ? Number(text) : null;
    };

    if (roi.cp) tasks.push(readOne(roi.cp).then((v) => { result.cp = v; }).catch(() => {}));
    if (roi.hp) tasks.push(readOne(roi.hp).then((v) => { result.hp = v; }).catch(() => {}));
    if (roi.dust) tasks.push(readOne(roi.dust).then((v) => { result.dust = v; }).catch(() => {}));

    await Promise.all(tasks);
    return result;
  }

  /**
   * ROI 部分を切り出して画像前処理を行います。
   * @param {HTMLCanvasElement} preview
   * @param {ROI} r
   * @returns {HTMLCanvasElement}
   */
  function cropCanvasRaw(preview, r) {
    const p = normToPx(r, preview);
    const canvas = document.createElement('canvas');
    canvas.width = p.w;
    canvas.height = p.h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(preview, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h);
    return canvas;
  }

  function cropCanvas(preview, r) {
    const canvas = cropCanvasRaw(preview, r);
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const rVal = img.data[i];
      const gVal = img.data[i + 1];
      const bVal = img.data[i + 2];
      const luminance = 0.299 * rVal + 0.587 * gVal + 0.114 * bVal;
      const value = luminance > 160 ? 255 : luminance < 100 ? 0 : luminance;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = value;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /**
   * ノイズ低減のために 3 フレーム分の中央値で安定化します。
   * @param {{cp:number|null,hp:number|null,dust:number|null}} next
   * @param {{cp:number[],hp:number[],dust:number[]}} buffer
   * @returns {{cp:number|null,hp:number|null,dust:number|null}|null}
   */
  function stabilize(next, buffer) {
    const out = { cp: null, hp: null, dust: null };
    const updater = (key) => {
      const value = next[key];
      if (typeof value === 'number' && !Number.isNaN(value)) {
        buffer[key].push(value);
        if (buffer[key].length > 3) buffer[key].shift();
      }
      if (buffer[key].length === 3) {
        const sorted = [...buffer[key]].sort((a, b) => a - b);
        out[key] = sorted[1];
      }
    };
    updater('cp');
    updater('hp');
    updater('dust');
    if (out.cp !== null || out.hp !== null || out.dust !== null) return out;
    return null;
  }

  // 直近のサンプルから中央値を用いて揺れを抑える
  function stabilizeIvSamples(next, buffer, previous) {
    const prev = previous ?? { atk: null, def: null, hp: null };
    const result = {
      atk: prev.atk ?? null,
      def: prev.def ?? null,
      hp: prev.hp ?? null,
    };
    let hasUpdate = false;

    ['atk', 'def', 'hp'].forEach((key) => {
      const sample = next[key];
      if (sample && Number.isFinite(sample.ratio) && Number.isFinite(sample.confidence)) {
        buffer[key].push(sample);
        if (buffer[key].length > 5) buffer[key].shift();

        const latestRatio = buffer[key][buffer[key].length - 1].ratio;
        const lastValue = prev[key];
        if (lastValue !== null) {
          const lastRatio = clamp(lastValue / 15, 0, 1);
          if (Math.abs(latestRatio - lastRatio) > 0.35) {
            const keep = buffer[key].slice(-2);
            buffer[key].splice(0, buffer[key].length, ...keep);
          }
        }

        const filtered = buffer[key].filter((item) => Math.abs(item.ratio - latestRatio) <= 0.35);
        if (filtered.length) {
          const trimmed = filtered.slice(-4);
          buffer[key].splice(0, buffer[key].length, ...trimmed);
        } else {
          buffer[key].splice(0, buffer[key].length - 1);
        }
      }

      const validSamples = buffer[key].filter((item) => item.confidence >= 0.35);
      if (validSamples.length < 3) return;

      const ratios = validSamples.map((item) => item.ratio).sort((a, b) => a - b);
      const medianRatio = ratios[Math.floor(ratios.length / 2)] ?? null;
      if (medianRatio === null) return;

      const candidate = clamp(Math.round(medianRatio * 15), 0, 15);
      const recent = validSamples
        .slice(-3)
        .map((item) => clamp(Math.round(item.ratio * 15), 0, 15));
      const recentStable = recent.length === 3 && recent.every((value) => value === recent[0]);
      const maxConfidence = validSamples.reduce((max, item) => Math.max(max, item.confidence), 0);
      const lastValue = prev[key];

      if (
        recentStable ||
        lastValue === null ||
        Math.abs(candidate - lastValue) >= 1 ||
        maxConfidence >= 0.6
      ) {
        if (result[key] !== candidate) {
          result[key] = candidate;
          hasUpdate = true;
        }
      }
    });

    return hasUpdate ? result : null;
  }

  function readGauges(preview, roi) {
    /** @type {{atk: GaugeSample | null, def: GaugeSample | null, hp: GaugeSample | null}} */
    const result = { atk: null, def: null, hp: null };
    if (roi.atkGauge) result.atk = measureGaugeRobust(preview, roi.atkGauge);
    if (roi.defGauge) result.def = measureGaugeRobust(preview, roi.defGauge);
    if (roi.hpGauge) result.hp = measureGaugeRobust(preview, roi.hpGauge);
    if (!result.atk && !result.def && !result.hp) return null;
    return result;
  }

  // ゲージの塗りつぶし率と信頼度を推定
  function measureGaugeRobust(preview, roi) {
    const canvas = cropCanvasRaw(preview, roi);
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    if (!width || !height) return null;

    const bandTop = Math.floor(height * 0.35);
    const bandBottom = Math.ceil(height * 0.65);
    const bandHeight = Math.max(1, bandBottom - bandTop);
    const data = ctx.getImageData(0, 0, width, height).data;
    const columnScore = new Array(width).fill(0);
    for (let x = 0; x < width; x += 1) {
      let score = 0;
      for (let y = bandTop; y < bandBottom; y += 1) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        score += computeWarmScore(r, g, b, 110);
      }
      columnScore[x] = score / bandHeight;
    }

    const smoothed = smoothArray(columnScore, 5);
    const sorted = [...smoothed].sort((a, b) => a - b);
    const base = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
    const peak = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
    const dynamicRange = peak - base;
    if (!Number.isFinite(dynamicRange) || dynamicRange < 4) return null;
    const threshold = base + dynamicRange * 0.25;

    let filled = -1;
    let consecutiveMiss = 0;
    let maxGap = 0;
    let hitCount = 0;
    const tolerance = Math.max(2, Math.floor(width * 0.05));
    for (let x = 0; x < width; x += 1) {
      if (smoothed[x] >= threshold) {
        filled = x;
        hitCount += 1;
        consecutiveMiss = 0;
      } else if (filled !== -1) {
        consecutiveMiss += 1;
        if (consecutiveMiss > maxGap) {
          maxGap = consecutiveMiss;
        }
        if (consecutiveMiss > tolerance) {
          break;
        }
      }
    }

    if (filled < 0) return null;
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

    return {
      ratio: clamp(ratio, 0, 1),
      confidence,
    };
  }

  /**
   * ステータスラベルをクリックした位置から自動的にバーの ROI を推定します。
   * @param {{x:number,y:number}} point
   */
  async function autoCalibrateStat(point) {
    if (!STATE.canvasEl) return;
    const label = await detectStatLabel(STATE.canvasEl, point);
    if (!label) {
      toast('ラベルを読み取れませんでした。少し大きめにクリックしてください。');
      return;
    }
    const barRoi = detectStatBar(STATE.canvasEl, point);
    if (!barRoi) {
      toast(`${label.text} のバーを検出できませんでした。位置を変えて再試行してください。`);
      return;
    }
    if (label.kind === 'atk') STATE.roi.atkGauge = barRoi;
    if (label.kind === 'def') STATE.roi.defGauge = barRoi;
    if (label.kind === 'hp') STATE.roi.hpGauge = barRoi;
    toast(`${label.text} を認識し、バー範囲を自動設定しました。保存ボタンで確定できます。`);
  }

  /**
   * HPバーの緑色領域を基準に名前表示エリアを推定します。
   * @param {{x:number,y:number}} point
   */
  async function autoCalibrateName(point) {
    if (!STATE.canvasEl) return;
    const hpRoi = detectHpGauge(STATE.canvasEl, point);
    if (!hpRoi) {
      toast('HPバーを検出できませんでした。もう一度クリックしてください。');
      return;
    }
    const nameRoi = detectNameAboveBar(STATE.canvasEl, hpRoi);
    if (!nameRoi) {
      toast('名前領域を検出できませんでした。画面を少しズームして再試行してください。');
      return;
    }
    STATE.roi.hpGauge = hpRoi;
    STATE.roi.name = nameRoi;
    toast('HPバーと名前枠を自動設定しました。保存ボタンで確定できます。');
  }

  async function detectStatLabel(preview, point) {
    const boxWidth = Math.round(preview.width * 0.24);
    const boxHeight = Math.round(preview.height * 0.08);
    const left = clamp(Math.round(point.x - boxWidth * 0.5), 0, Math.max(0, preview.width - boxWidth));
    const top = clamp(Math.round(point.y - boxHeight * 0.6), 0, Math.max(0, preview.height - boxHeight));
    const roi = {
      x: left / preview.width,
      y: top / preview.height,
      w: boxWidth / preview.width,
      h: boxHeight / preview.height,
    };
    const canvas = cropCanvasRaw(preview, roi);
    if (!canvas.width || !canvas.height) return null;
    try {
      const res = await TesseractLib.recognize(canvas, 'jpn+eng', { psm: 7 });
      const raw = res?.data?.text ?? '';
      const normalized = normalizeStatLabel(raw);
      if (!normalized) return null;
      if (normalized.includes('こうげき') || normalized.includes('攻撃')) {
        return { kind: 'atk', text: 'こうげき' };
      }
      if (normalized.includes('ぼうぎょ') || normalized.includes('防御')) {
        return { kind: 'def', text: 'ぼうぎょ' };
      }
      if (normalized.includes('hp') || normalized.includes('ｈｐ')) {
        return { kind: 'hp', text: 'HP' };
      }
      return null;
    } catch (error) {
      console.warn('[IV OCR] detectStatLabel error:', error);
      return null;
    }
  }

  function detectStatBar(preview, point) {
    const searchWidth = Math.round(preview.width * 0.5);
    const searchHeight = Math.round(preview.height * 0.18);
    let left = Math.round(point.x - searchWidth * 0.5);
    left = clamp(left, 0, Math.max(0, preview.width - searchWidth));
    let top = Math.round(point.y + preview.height * 0.015);
    top = clamp(top, 0, Math.max(0, preview.height - searchHeight));
    const width = Math.min(searchWidth, preview.width - left);
    const height = Math.min(searchHeight, preview.height - top);
    if (width <= 0 || height <= 0) return null;
    const roi = {
      x: left / preview.width,
      y: top / preview.height,
      w: width / preview.width,
      h: height / preview.height,
    };

    const canvas = cropCanvasRaw(preview, roi);
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    if (!w || !h) return null;
    const data = ctx.getImageData(0, 0, w, h).data;

    const rowScore = new Array(h).fill(0);
    for (let y = 0; y < h; y += 1) {
      let sum = 0;
      for (let x = 0; x < w; x += 1) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        sum += computeWarmScore(r, g, b, 105);
      }
      rowScore[y] = sum / w;
    }

    const peakRow = Math.max(...rowScore);
    if (!Number.isFinite(peakRow) || peakRow < 10) return null;
    const upperCut = peakRow * 0.55;
    const lowerCut = peakRow * 0.4;
    let topRow = -1;
    let bottomRow = -1;
    for (let y = 0; y < h; y += 1) {
      if (rowScore[y] >= upperCut) {
        topRow = y;
        break;
      }
    }
    if (topRow === -1) {
      for (let y = 0; y < h; y += 1) {
        if (rowScore[y] >= lowerCut) {
          topRow = y;
          break;
        }
      }
    }
    for (let y = h - 1; y >= 0; y -= 1) {
      if (rowScore[y] >= lowerCut) {
        bottomRow = y;
        break;
      }
    }
    if (topRow === -1 || bottomRow === -1) return null;
    if (bottomRow <= topRow) bottomRow = Math.min(h - 1, topRow + Math.max(4, Math.floor(h * 0.06)));

    const colScore = new Array(w).fill(0);
    const verticalSpan = Math.max(1, bottomRow - topRow + 1);
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let y = topRow; y <= bottomRow; y += 1) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        sum += computeWarmScore(r, g, b, 105);
      }
      colScore[x] = sum / verticalSpan;
    }

    const peakCol = Math.max(...colScore);
    if (!Number.isFinite(peakCol) || peakCol < 8) return null;
    const colThresh = peakCol * 0.4;
    let leftCol = -1;
    let rightCol = -1;
    for (let x = 0; x < w; x += 1) {
      if (colScore[x] >= colThresh) {
        leftCol = x;
        break;
      }
    }
    for (let x = w - 1; x >= 0; x -= 1) {
      if (colScore[x] >= colThresh) {
        rightCol = x;
        break;
      }
    }
    if (leftCol === -1 || rightCol === -1) return null;

    const marginX = Math.max(2, Math.floor(w * 0.02));
    const marginY = Math.max(1, Math.floor(h * 0.02));
    leftCol = clamp(leftCol - marginX, 0, w - 1);
    rightCol = clamp(rightCol + marginX, 0, w - 1);
    topRow = clamp(topRow - marginY, 0, h - 1);
    bottomRow = clamp(bottomRow + marginY, 0, h - 1);

    const absLeft = left + leftCol;
    const absTop = top + topRow;
    const absRight = left + rightCol + 1;
    const absBottom = top + bottomRow + 1;

    return {
      x: absLeft / preview.width,
      y: absTop / preview.height,
      w: Math.max(1, absRight - absLeft) / preview.width,
      h: Math.max(1, absBottom - absTop) / preview.height,
    };
  }

  function detectHpGauge(preview, point) {
    const searchWidth = Math.round(preview.width * 0.65);
    const searchHeight = Math.round(preview.height * 0.22);
    let left = Math.round(point.x - searchWidth * 0.5);
    left = clamp(left, 0, Math.max(0, preview.width - searchWidth));
    let top = Math.round(point.y - searchHeight * 0.4);
    top = clamp(top, 0, Math.max(0, preview.height - searchHeight));
    const width = Math.min(searchWidth, preview.width - left);
    const height = Math.min(searchHeight, preview.height - top);
    if (width <= 0 || height <= 0) return null;

    const roi = {
      x: left / preview.width,
      y: top / preview.height,
      w: width / preview.width,
      h: height / preview.height,
    };

    const canvas = cropCanvasRaw(preview, roi);
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    if (!w || !h) return null;
    const data = ctx.getImageData(0, 0, w, h).data;

    const rowScore = new Array(h).fill(0);
    for (let y = 0; y < h; y += 1) {
      let sum = 0;
      for (let x = 0; x < w; x += 1) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        sum += computeGreenScore(r, g, b, 85);
      }
      rowScore[y] = sum / w;
    }

    const peakRow = Math.max(...rowScore);
    if (!Number.isFinite(peakRow) || peakRow < 8) return null;
    const rowUpper = peakRow * 0.5;
    const rowLower = peakRow * 0.35;
    let topRow = -1;
    let bottomRow = -1;
    for (let y = 0; y < h; y += 1) {
      if (rowScore[y] >= rowUpper) {
        topRow = y;
        break;
      }
    }
    if (topRow === -1) {
      for (let y = 0; y < h; y += 1) {
        if (rowScore[y] >= rowLower) {
          topRow = y;
          break;
        }
      }
    }
    for (let y = h - 1; y >= 0; y -= 1) {
      if (rowScore[y] >= rowLower) {
        bottomRow = y;
        break;
      }
    }
    if (topRow === -1 || bottomRow === -1) return null;
    if (bottomRow <= topRow) bottomRow = Math.min(h - 1, topRow + Math.max(4, Math.floor(h * 0.08)));

    const verticalSpan = Math.max(1, bottomRow - topRow + 1);
    const colScore = new Array(w).fill(0);
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let y = topRow; y <= bottomRow; y += 1) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        sum += computeGreenScore(r, g, b, 90);
      }
      colScore[x] = sum / verticalSpan;
    }

    const peakCol = Math.max(...colScore);
    if (!Number.isFinite(peakCol) || peakCol < 6) return null;
    const colThresh = peakCol * 0.4;
    let leftCol = -1;
    let rightCol = -1;
    for (let x = 0; x < w; x += 1) {
      if (colScore[x] >= colThresh) {
        leftCol = x;
        break;
      }
    }
    for (let x = w - 1; x >= 0; x -= 1) {
      if (colScore[x] >= colThresh) {
        rightCol = x;
        break;
      }
    }
    if (leftCol === -1 || rightCol === -1) return null;

    const marginX = Math.max(3, Math.floor(w * 0.025));
    const marginY = Math.max(1, Math.floor(h * 0.02));
    leftCol = clamp(leftCol - marginX, 0, w - 1);
    rightCol = clamp(rightCol + marginX, 0, w - 1);
    topRow = clamp(topRow - marginY, 0, h - 1);
    bottomRow = clamp(bottomRow + marginY, 0, h - 1);

    const absLeft = left + leftCol;
    const absTop = top + topRow;
    const absRight = left + rightCol + 1;
    const absBottom = top + bottomRow + 1;

    return {
      x: absLeft / preview.width,
      y: absTop / preview.height,
      w: Math.max(1, absRight - absLeft) / preview.width,
      h: Math.max(1, absBottom - absTop) / preview.height,
    };
  }

  function detectNameAboveBar(preview, hpRoi) {
    // HPバー中心から名前帯を推定し、中央揃えの領域を切り出す
    const hpPx = normToPx(hpRoi, preview);
    const bar = {
      x: Math.round(hpPx.x * preview.width),
      y: Math.round(hpPx.y * preview.height),
      w: Math.round(hpPx.w * preview.width),
      h: Math.round(hpPx.h * preview.height),
    };
    if (!bar.w || !bar.h) return null;

    const bandWidth = Math.min(preview.width, Math.round(bar.w * 1.2));
    const bandHeight = Math.max(Math.round(bar.h * 3.3), Math.round(preview.height * 0.04));
    const centerX = clamp(bar.x + Math.round(bar.w * 0.5), 0, preview.width);
    const anchorTop = clamp(bar.y - Math.round(bar.h * 3.6), 0, preview.height);
    const left = clamp(Math.round(centerX - bandWidth * 0.5), 0, Math.max(0, preview.width - bandWidth));
    const top = clamp(anchorTop - Math.round(bandHeight * 0.5), 0, Math.max(0, preview.height - bandHeight));
    const roi = {
      x: left / preview.width,
      y: top / preview.height,
      w: bandWidth / preview.width,
      h: bandHeight / preview.height,
    };

    return tightenByWhiteProjection(preview, roi);
  }

  function tightenByWhiteProjection(preview, roi) {
    const px = normToPx(roi, preview);
    if (!px.w || !px.h) return roi;
    const canvas = cropCanvasRaw(preview, roi);
    const ctx = canvas.getContext('2d');
    if (!ctx) return roi;
    const { width, height } = canvas;
    if (!width || !height) return roi;

    const image = ctx.getImageData(0, 0, width, height).data;
    const rowScore = new Array(height).fill(0);
    const colScore = new Array(width).fill(0);

    for (let y = 0; y < height; y += 1) {
      let sumRow = 0;
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        const score = computeWhiteScore(image[idx], image[idx + 1], image[idx + 2]);
        sumRow += score;
        colScore[x] += score;
      }
      rowScore[y] = sumRow / Math.max(width, 1);
    }

    for (let x = 0; x < width; x += 1) {
      colScore[x] = colScore[x] / Math.max(height, 1);
    }

    const maxRow = Math.max(...rowScore);
    const maxCol = Math.max(...colScore);
    if (!Number.isFinite(maxRow) || !Number.isFinite(maxCol) || maxRow < 8 || maxCol < 5) {
      return roi;
    }

    const rowThresh = maxRow * 0.28;
    const colThresh = maxCol * 0.32;

    let topRow = rowScore.findIndex((value) => value >= rowThresh);
    let bottomRow = -1;
    for (let y = height - 1; y >= 0; y -= 1) {
      if (rowScore[y] >= rowThresh) {
        bottomRow = y;
        break;
      }
    }
    if (topRow < 0 || bottomRow < 0) return roi;

    let leftCol = colScore.findIndex((value) => value >= colThresh);
    let rightCol = -1;
    for (let x = width - 1; x >= 0; x -= 1) {
      if (colScore[x] >= colThresh) {
        rightCol = x;
        break;
      }
    }
    if (leftCol < 0 || rightCol < 0) return roi;

    const marginY = Math.max(1, Math.floor(height * 0.08));
    const marginX = Math.max(1, Math.floor(width * 0.05));

    topRow = clamp(topRow - marginY, 0, height - 1);
    bottomRow = clamp(bottomRow + marginY, 0, height - 1);
    leftCol = clamp(leftCol - marginX, 0, width - 1);
    rightCol = clamp(rightCol + marginX, 0, width - 1);

    if (bottomRow <= topRow) bottomRow = Math.min(height - 1, topRow + Math.max(3, Math.floor(height * 0.2)));
    if (rightCol <= leftCol) rightCol = Math.min(width - 1, leftCol + Math.max(3, Math.floor(width * 0.2)));

    const absLeft = px.x + leftCol;
    const absTop = px.y + topRow;
    const absRight = px.x + rightCol + 1;
    const absBottom = px.y + bottomRow + 1;

    return {
      x: absLeft / preview.width,
      y: absTop / preview.height,
      w: Math.max(1, absRight - absLeft) / preview.width,
      h: Math.max(1, absBottom - absTop) / preview.height,
    };
  }

  async function readPokemonName(preview, roi, lastAccepted) {
    // カタカナ専用OCRで読み取り、候補ボタン生成に必要な情報をまとめる
    let target = roi.name;
    if (!target && roi.hpGauge) {
      target = detectNameAboveBar(preview, roi.hpGauge);
      if (target) {
        STATE.roi.name = target;
      }
    }
    if (!target) return null;

    const canvas = cropCanvasRaw(preview, target);
    if (!canvas.width || !canvas.height) return null;

    try {
      const res = await TesseractLib.recognize(canvas, 'jpn', {
        tessedit_char_whitelist: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンヴァィゥェォッャュョー',
        psm: 7,
      });
      const confidence = Number(res?.data?.confidence ?? 0);
      const normalized = normalizeKatakana(res?.data?.text ?? '');
      if (normalized.length < 2) return null;
      if (confidence < 25 && normalized.length < 3) return null;

      return createNameReadResult(normalized, lastAccepted);
    } catch (error) {
      console.warn('[IV OCR] readPokemonName error:', error);
      return null;
    }
  }

  /**
   * OCR文字列をもとに候補リストを構築する
   * @param {string} katakana
   * @param {string | null} lastAccepted
   * @returns {NameReadResult}
   */
  function createNameReadResult(katakana, lastAccepted) {
    const candidates = collectPokemonNameCandidates();
    const prefixes = Array.from(new Set([
      katakana,
      katakana.slice(0, 4),
      katakana.slice(0, 3),
      katakana.slice(0, 2),
      katakana.slice(0, 1),
    ].filter(Boolean)));

    /** @type {string[]} */
    const matches = [];
    for (const prefix of prefixes) {
      for (const name of candidates) {
        if (!name.startsWith(prefix)) continue;
        if (matches.includes(name)) continue;
        matches.push(name);
        if (matches.length >= 6) break;
      }
      if (matches.length >= 6) break;
    }

    if (!matches.length && lastAccepted && prefixes.some((prefix) => lastAccepted.startsWith(prefix))) {
      matches.push(lastAccepted);
    }

    /** @type {NameSuggestion[]} */
    const suggestions = [];
    const seen = new Set();

    for (const name of matches) {
      if (!name || seen.has(name)) continue;
      suggestions.push({ label: name, value: name, source: 'match' });
      seen.add(name);
    }

    if (lastAccepted && !seen.has(lastAccepted)) {
      suggestions.push({ label: `${lastAccepted} (直前)`, value: lastAccepted, source: 'last' });
      seen.add(lastAccepted);
    }

    const prefixSuggestions = prefixes.filter((prefix) => prefix.length >= 2).slice(0, 3);
    for (const prefix of prefixSuggestions) {
      if (seen.has(prefix)) continue;
      suggestions.push({ label: `${prefix}で検索`, value: prefix, source: 'prefix' });
      seen.add(prefix);
    }

    return {
      matched: matches[0] ?? null,
      normalized: katakana,
      suggestions: suggestions.slice(0, 5),
    };
  }

  function collectPokemonNameCandidates() {
    // ページ内の候補リストをざっくり収集してキャッシュ
    const now = Date.now();
    if (NAME_CACHE.names.length && now < NAME_CACHE.expiry) {
      return NAME_CACHE.names;
    }

    const seen = new Set();
    const push = (value) => {
      if (!value) return;
      const normalized = normalizeKatakana(value);
      if (normalized.length >= 2) {
        seen.add(normalized);
      }
    };

    document.querySelectorAll('[data-name-kana]').forEach((el) => {
      push(el.getAttribute('data-name-kana') || '');
    });
    document.querySelectorAll('[data-name-katakana]').forEach((el) => {
      push(el.getAttribute('data-name-katakana') || '');
    });
    document.querySelectorAll('[data-name]').forEach((el) => {
      push(el.getAttribute('data-name') || '');
    });
    document.querySelectorAll('option').forEach((option) => {
      push(option.textContent || '');
    });
    document.querySelectorAll('.pokemon_name, .pokemon-list__name, .wiki_pokemon_name, .list_pokemon a').forEach((el) => {
      push(el.textContent || '');
    });

    const searchInput = document.querySelector('input[type="search"][placeholder="ポケモンを選択"]');
    if (searchInput && searchInput.value) {
      push(searchInput.value);
    }

    NAME_CACHE.names = Array.from(seen);
    NAME_CACHE.expiry = now + 15000;
    return NAME_CACHE.names;
  }

  function normalizeKatakana(text) {
    if (!text) return '';
    const normalized = text.normalize('NFKC').replace(/[\r\n\s]+/g, '');
    const hira = katakanaToHiragana(normalized);
    const kata = hiraganaToKatakana(hira);
    let cleaned = kata.replace(/[^ァ-ヴー゛゜ヵヶ]/g, '');
    // 先頭に長音「ー」や濁点記号だけが残るケースを除去し、実際のカタカナ文字から開始する
    while (cleaned.length && !/[ァ-ヴヵヶ]/.test(cleaned[0])) {
      cleaned = cleaned.slice(1);
    }
    return cleaned;
  }

  function hiraganaToKatakana(str) {
    return str.replace(/[ぁ-ん]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  }

  // ---------------------
  // DOM 自動入力処理
  // ---------------------

  /**
   * 9db 側の入力フォームを探索して値を入力します。
   * @param {{cp:number|null,hp:number|null,dust:number|null}} values
   */
  function fillTo9db(values) {
    const cpInput = findInputByLabels(['CP']) ?? findInputByHints(['cp']);
    const hpInput = findInputByLabels(['HP']) ?? findInputByHints(['hp']);
    const dustInput = findInputByLabels(['ほしのすな', 'すな', '砂']) ?? findInputByHints(['dust', 'すな']);

    if (cpInput && typeof values.cp === 'number') setInputValue(cpInput, String(values.cp));
    if (hpInput && typeof values.hp === 'number') setInputValue(hpInput, String(values.hp));
    if (dustInput && typeof values.dust === 'number') setInputValue(dustInput, String(values.dust));
  }

  function fillIvBars(iv) {
    reflectIvToDom(iv);
  }

  /**
   * 9db 側の検索欄へ名前を反映します。
   * @param {string} name
   * @param {{focus?: boolean, triggerSelection?: boolean, dispatchChange?: boolean}} [options]
   */
  function fillPokemonName(name, options = {}) {
    const {
      focus = true,
      triggerSelection = STATE.autoSelectName,
      dispatchChange = true,
    } = options;

    const primaryInput = document.querySelector('#select3_1 input[type="search"]');
    const fallbackInput = document.querySelector('input[type="search"][placeholder="ポケモンを選択"]');
    const input = primaryInput instanceof HTMLInputElement ? primaryInput : fallbackInput;
    if (!input) return;

    const same = input.value === name;
    if (focus && document.activeElement !== input) {
      input.focus();
    }

    if (!same) {
      input.value = name;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (dispatchChange) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (triggerSelection && STATE.autoSelectName) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (dispatchChange) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    if (triggerSelection && STATE.autoSelectName) {
      scheduleTopCandidateSelection();
    }
  }

  // サジェストが開いたら先頭候補をクリックする
  function scheduleTopCandidateSelection() {
    if (!STATE.autoSelectName) return;
    if (nameSelectionTimer !== null) {
      window.clearTimeout(nameSelectionTimer);
      nameSelectionTimer = null;
    }

    let attempts = 0;

    const trySelect = () => {
      if (!STATE.autoSelectName) {
        nameSelectionTimer = null;
        return;
      }
      const cell = findTopVisibleNameCandidate();
      if (cell) {
        const rect = cell.getBoundingClientRect();
        const view = resolveViewFromNode(cell) || window; // Tampermonkey の sandbox window ではなく実ページ側を使う
        const opts = { view, bubbles: true, cancelable: true, clientX: rect.left + 4, clientY: rect.top + 4 };
        cell.dispatchEvent(new MouseEvent('mousedown', opts));
        cell.dispatchEvent(new MouseEvent('mouseup', opts));
        cell.dispatchEvent(new MouseEvent('click', opts));
        nameSelectionTimer = null;
        return;
      }

      attempts += 1;
      if (attempts >= 8) {
        nameSelectionTimer = null;
        return;
      }
      nameSelectionTimer = window.setTimeout(trySelect, 120);
    };

    nameSelectionTimer = window.setTimeout(trySelect, 120);
  }

  // 画面上で表示状態の候補リストから最上段セルを見つける
  function findTopVisibleNameCandidate() {
    const containers = Array.from(document.querySelectorAll('.disp_n, .search_result, .pokemon_list')); // 9db 内の候補一覧クラスをざっくり網羅
    for (const container of containers) {
      if (!(container instanceof HTMLElement)) continue;
      const style = window.getComputedStyle(container);
      if (style.display === 'none' || style.visibility === 'hidden') {
        continue;
      }
      const cell = container.querySelector('table tbody tr td, table tr td, .pokemon-list__name, .list_pokemon td, .pokemon_list td');
      if (cell instanceof HTMLElement) {
        return cell;
      }
    }
    return null;
  }

  function loadPerfLogFlag() {
    try {
      return localStorage.getItem(PERF_LOG_KEY) === '1';
    } catch (error) {
      console.warn('[IV OCR] PERF flag load failed:', error);
      return false;
    }
  }

  function savePerfLogFlag(value) {
    try {
      localStorage.setItem(PERF_LOG_KEY, value ? '1' : '0');
    } catch (error) {
      console.warn('[IV OCR] PERF flag save failed:', error);
    }
  }

  function buildPerfLabel(label) {
    perfCounter = (perfCounter + 1) % 1048576; // wrap to avoid overly long suffix
    return `[IV OCR] ${label}#${perfCounter.toString(16)}`;
  }

  function exposePerfToggle() {
    try {
      const host = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      if (!host) return;
      host.ivocrPerfLog = {
        enable() {
          PERF.setEnabled(true);
          console.info('[IV OCR] Performance logging enabled');
        },
        disable() {
          PERF.setEnabled(false);
          console.info('[IV OCR] Performance logging disabled');
        },
        toggle() {
          PERF.setEnabled(!PERF.isEnabled());
          console.info('[IV OCR] Performance logging toggled ->', PERF.isEnabled());
        },
        status() {
          console.info('[IV OCR] Performance logging status ->', PERF.isEnabled());
          return PERF.isEnabled();
        }
      };
    } catch (error) {
      console.warn('[IV OCR] PERF toggle exposure failed:', error);
    }
  }

  exposePerfToggle();

  /**
   * Tampermonkey サンドボックスからでも実ページの window を取得する
   * @param {Node} node
   * @returns {Window | null}
   */
  const resolveViewFromNode = (node) => {
    if (!(node instanceof Node)) {
      return typeof unsafeWindow !== 'undefined' ? unsafeWindow : null;
    }
    const doc = node.ownerDocument;
    if (doc && doc.defaultView) return doc.defaultView;
    if (typeof unsafeWindow !== 'undefined') return unsafeWindow;
    return null;
  };

  // DOM が置き換わっても IV 表示を復元するためのヘルパー
  const reflectIvToDom = createIvDomReflector();

  function createIvDomReflector() {
    /** @type {{atk:number|null,def:number|null,hp:number|null}} */
    let lastApplied = { atk: null, def: null, hp: null };
    /** @type {MutationObserver | null} */
    let observer = null;

    const simulateClick = (anchor) => {
      const rect = anchor.getBoundingClientRect();
      const view = resolveViewFromNode(anchor) || window; // 実ページ側の window を使わないと MouseEvent が失敗する
      const opts = {
        view,
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      };
      anchor.dispatchEvent(new MouseEvent('mousedown', opts));
      anchor.dispatchEvent(new MouseEvent('mouseup', opts));
      anchor.dispatchEvent(new MouseEvent('click', opts));
    };

    const syncKind = (kind, rawValue) => {
      const span = document.getElementById(`wiki_${kind}`);
      const hidden = document.querySelector(`input[name="${kind}"][data-id="${kind}"]`);
      if (!(span instanceof HTMLElement) || !(hidden instanceof HTMLInputElement)) return;

      const desired = typeof rawValue === 'number' ? clampIvValue(rawValue) : null;
      if (desired === null) return;

      const current = Number(hidden.value || '0') || 0;

      if (desired === 0) {
        if (current === 0) return;
        const activeAnchor = span.querySelector('a.bar_maxr');
        if (activeAnchor instanceof HTMLAnchorElement) {
          simulateClick(activeAnchor);
        } else {
          hidden.value = '0';
          hidden.dispatchEvent(new Event('input', { bubbles: true }));
          hidden.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }

      if (current === desired) return;

      const anchor = span.querySelector(`a[data-val="${desired}"]`);
      if (!(anchor instanceof HTMLAnchorElement)) return;

      simulateClick(anchor);
    };

    const applyAll = () => {
      syncKind('atk', lastApplied.atk);
      syncKind('def', lastApplied.def);
      syncKind('hp', lastApplied.hp);
    };

    const ensureObserver = () => {
      if (observer || !document.body) return;
      observer = new MutationObserver(() => {
        applyAll();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    };

    return (values) => {
      lastApplied = {
        atk: typeof values.atk === 'number' ? values.atk : null,
        def: typeof values.def === 'number' ? values.def : null,
        hp: typeof values.hp === 'number' ? values.hp : null,
      };
      ensureObserver();
      applyAll();
    };
  }

  /**
   * input 要素に値を設定し、React などの監視にも届くイベントを発火します。
   * @param {HTMLInputElement} input
   * @param {string} value
   */
  function setInputValue(input, value) {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * ラベル要素に基づいて該当する input を探します。
   * @param {string[]} keywords
   * @returns {HTMLInputElement | null}
   */
  function findInputByLabels(keywords) {
    const labels = Array.from(document.querySelectorAll('label'));
    for (const labelEl of labels) {
      const text = (labelEl.textContent || '').trim();
      if (!keywords.some((keyword) => text.includes(keyword))) continue;
      const forId = labelEl.getAttribute('for');
      if (forId) {
        const el = document.getElementById(forId);
        if (el && el.tagName.toLowerCase() === 'input') return /** @type {HTMLInputElement} */ (el);
      }
      const nested = labelEl.querySelector('input');
      if (nested) return /** @type {HTMLInputElement} */ (nested);
    }
    return null;
  }

  /**
   * name/id/placeholder に含まれるキーワードで input を探します。
   * @param {string[]} hints
   * @returns {HTMLInputElement | null}
   */
  function findInputByHints(hints) {
    const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"], input:not([type])'));
    return inputs.find((inputEl) => {
      const name = (inputEl.getAttribute('name') || '').toLowerCase();
      const id = (inputEl.id || '').toLowerCase();
      const placeholder = (inputEl.getAttribute('placeholder') || '').toLowerCase();
      return hints.some((hint) => name.includes(hint) || id.includes(hint) || placeholder.includes(hint));
    }) || null;
  }

  // ---------------------
  // 汎用ユーティリティ
  // ---------------------

  /**
   * 一定時間ごとに関数を実行する throttle 実装です。
   * @template {(...args:any[])=>void} F
   * @param {F} fn
   * @param {number} wait
   * @returns {F}
   */
  function throttle(fn, wait) {
    let last = 0;
    /** @type {number | null} */
    let timer = null;
    return function throttled(...args) {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        last = now;
        fn.apply(this, args);
      } else if (!timer) {
        timer = window.setTimeout(() => {
          last = Date.now();
          timer = null;
          fn.apply(this, args);
        }, remaining);
      }
    };
  }

  /**
   * コンソール表示用の小さなラッパーです。
   * @param {string} message
   */
  function toast(message) {
    console.log('[IV OCR]', message);
  }

  async function copyScriptSourceToClipboard(button) {
    const originalLabel = button.textContent || 'コードをコピー';
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = '取得中...';
    try {
      const source = await loadScriptSourceText();
      if (!source) throw new Error('script source is empty');
      GM_setClipboard(source, 'text');
      button.textContent = 'コピーしました';
      toast('ユーザースクリプトをクリップボードへコピーしました。');
    } catch (error) {
      console.error('[IV OCR] copyScriptSourceToClipboard error:', error);
      button.textContent = 'コピー失敗';
      toast('コピーに失敗しました。ネットワークや GitHub への接続状況をご確認ください。');
    } finally {
      window.setTimeout(() => {
        button.textContent = originalLabel;
        button.disabled = false;
      }, 2200);
    }
  }

  function loadScriptSourceText() {
    const now = Date.now();
    if (SCRIPT_CACHE.text && now - SCRIPT_CACHE.fetchedAt < 60 * 1000) {
      return Promise.resolve(SCRIPT_CACHE.text);
    }
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: SCRIPT_RAW_URL,
        headers: { 'Cache-Control': 'no-cache' },
        onload: (response) => {
          if (response.status >= 200 && response.status < 300) {
            SCRIPT_CACHE.text = response.responseText;
            SCRIPT_CACHE.fetchedAt = Date.now();
            resolve(response.responseText);
          } else {
            reject(new Error(`HTTP ${response.status}`));
          }
        },
        onerror: () => reject(new Error('Network error')),
        ontimeout: () => reject(new Error('Timeout')),
        timeout: 15000,
      });
    });
  }

  /**
   * パネルをドラッグ移動可能にします。
   * @param {Element} handleEl
   */
  function enablePanelDrag(handleEl) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onPointerDown = (event) => {
      if (!(event instanceof PointerEvent)) return;
      if (event.target instanceof Element && event.target.closest('[data-ignore-drag="true"], button, select, input')) {
        return;
      }
      dragging = true;
      panel.classList.add('ivocr-dragging');
      handleEl.setPointerCapture(event.pointerId);
      const rect = panel.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      event.preventDefault();
    };

    const onPointerMove = (event) => {
      if (!dragging || !(event instanceof PointerEvent)) return;
      const maxX = window.innerWidth - panel.offsetWidth;
      const maxY = window.innerHeight - panel.offsetHeight;
      const nextX = clamp(event.clientX - offsetX, 0, Math.max(0, maxX));
      const nextY = clamp(event.clientY - offsetY, 0, Math.max(0, maxY));
      applyPanelPosition(nextX, nextY);
    };

    const finishDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove('ivocr-dragging');
      if (event instanceof PointerEvent) {
        handleEl.releasePointerCapture(event.pointerId);
      }
      const rect = panel.getBoundingClientRect();
      localStorage.setItem(PANEL_POS_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
    };

    handleEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
  }

  /**
   * 値を指定した範囲へ収めます。
   * @param {number} value
   * @param {number} min
   * @param {number} max
   */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * 1次元の移動平均でノイズを平滑化します。
   * @param {number[]} arr
   * @param {number} windowSize
   */
  function smoothArray(arr, windowSize) {
    if (windowSize <= 1) return arr.slice();
    const half = Math.floor(windowSize / 2);
    const result = new Array(arr.length).fill(0);
    for (let i = 0; i < arr.length; i += 1) {
      let sum = 0;
      let count = 0;
      for (let j = -half; j <= half; j += 1) {
        const idx = i + j;
        if (idx < 0 || idx >= arr.length) continue;
        sum += arr[idx];
        count += 1;
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

  function computeGreenScore(r, g, b, base) {
    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    const saturation = maxCh - minCh;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const greenBoost = Math.max(0, g - Math.max(r, b));
    return greenBoost * 0.7 + Math.max(0, luminance - base) * 0.25 + Math.max(0, saturation - 20) * 0.1;
  }

  function computeWhiteScore(r, g, b) {
    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    const saturation = maxCh - minCh;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return Math.max(0, luminance - 150) - Math.max(0, saturation - 18) * 0.6;
  }

  function normalizeStatLabel(text) {
    if (!text) return '';
    const half = toHalfWidth(text).replace(/\s+/g, '');
    const lower = half.toLowerCase();
    const kana = katakanaToHiragana(lower);
    return kana;
  }

  function toHalfWidth(str) {
    return str.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');
  }

  function katakanaToHiragana(str) {
    return str.replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  }

  // ---------------------
  // 初期化処理
  // ---------------------

  renderValues({ cp: null, hp: null, dust: null });
  renderName({ matched: null, normalized: '', suggestions: [] });
  renderIv(getEffectiveIv({ atk: null, def: null, hp: null }));
  updateStatus('Idle');
  updateCalibButtonState();

})();





