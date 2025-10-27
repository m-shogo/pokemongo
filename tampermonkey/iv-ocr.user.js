// ==UserScript==
// @name         9db IV AutoFill via OCR (Pokémon GO)
// @namespace    https://local.example/iv-ocr
// @version      0.1.0
// @description  iPhoneミラー/キャプチャ映像からCP/HP/ほしのすなをOCRで読み取り、9dbのIV計算ページへ自動入力します。
// @author       you
// @match        https://9db.jp/pokemongo/data/6606*
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@4.0.2/dist/tesseract.min.js
// ==/UserScript==

(function () {
  'use strict';

  /**
   * ROI (Region of Interest) を正規化座標で表現する型
   * @typedef {{x:number,y:number,w:number,h:number}} ROI
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
   *   source: 'screen' | 'camera',
  *   calibTarget: 'none' | 'cp' | 'hp' | 'dust' | 'name' | 'atkGauge' | 'defGauge' | 'hpGauge' | 'autoStat' | 'autoName',
   *   loopId: number | null,
   *   lastValues: {cp: number | null, hp: number | null, dust: number | null},
  *   lastName: string | null,
  *   lastIv: {atk: number | null, def: number | null, hp: number | null},
  *   stableBuf: {cp: number[], hp: number[], dust: number[]},
  *   stableIvBuf: {atk: number[], def: number[], hp: number[]}
   * }} OCRState
   */

  const LS_KEY = 'iv-ocr-roi-v1';

  /** @type {OCRState} */
  const STATE = {
    stream: null,
    videoEl: null,
    canvasEl: null,
    ctx: null,
    roi: loadROI(),
    running: false,
    autoFill: false,
    source: 'screen',
    calibTarget: 'none',
    loopId: null,
    lastValues: { cp: null, hp: null, dust: null },
    lastName: null,
    lastIv: { atk: null, def: null, hp: null },
    stableBuf: { cp: [], hp: [], dust: [] },
    stableIvBuf: { atk: [], def: [], hp: [] },
  };

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
    .ivocr-header-actions .ivocr-btn-mini { padding:4px 8px; font-size:11px; border-radius:6px; border:1px solid #555; background:#2a2a2a; color:#fff; }
    .ivocr-header-actions .ivocr-btn-mini:hover { background:#353535; }
    .ivocr-body { padding: 8px 12px; overflow-y: auto; flex: 1; }
    .ivocr-row { display:flex; gap:8px; align-items:center; margin:6px 0; flex-wrap:wrap; }
    .ivocr-row label { font-size: 12px; color: #ccc; }
    .ivocr-row input[type="number"] { width: 80px; }
    .ivocr-btn { padding: 6px 10px; font-size: 12px; border: 1px solid #444; background:#1f1f1f; color:#fff; border-radius:6px; cursor:pointer; }
    .ivocr-btn:hover { background:#2a2a2a; }
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
    .ivocr-small { font-size: 11px; color:#aaa; }
  `);

  const panel = document.createElement('div');
  panel.className = 'ivocr-panel';
  panel.innerHTML = `
    <div class="ivocr-header">
      <div class="ivocr-header-title">
        <div>IV OCR</div>
        <div class="ivocr-badge">Beta</div>
      </div>
      <div class="ivocr-header-actions" data-ignore-drag="true">
        <button class="ivocr-btn-mini" id="ivocr-wide-toggle">拡大表示</button>
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
      <div class="ivocr-row">
        <span class="ivocr-small">プレビュー上で 2クリック（左上→右下）で枠を作成</span>
      </div>
      <div class="ivocr-row">
        <button class="ivocr-btn" id="ivocr-calib-cp">校正: CP</button>
        <button class="ivocr-btn" id="ivocr-calib-hp">校正: HP</button>
        <button class="ivocr-btn" id="ivocr-calib-dust">校正: すな</button>
        <button class="ivocr-btn" id="ivocr-save">保存</button>
        <button class="ivocr-btn" id="ivocr-clear">枠クリア</button>
      </div>
      <div class="ivocr-row">
        <button class="ivocr-btn" id="ivocr-calib-name">校正: 名前</button>
        <button class="ivocr-btn" id="ivocr-calib-atk">校正: こうげきバー</button>
        <button class="ivocr-btn" id="ivocr-calib-def">校正: ぼうぎょバー</button>
        <button class="ivocr-btn" id="ivocr-calib-hpbar">校正: HPバー</button>
      </div>
      <div class="ivocr-row">
        <button class="ivocr-btn" id="ivocr-auto-stat">自動: ラベル→バー</button>
        <span class="ivocr-small">ラベル付近をクリックすると対応バーを自動検出</span>
      </div>
      <div class="ivocr-row">
        <button class="ivocr-btn" id="ivocr-auto-name">自動: HPバー→名前</button>
        <span class="ivocr-small">HPゲージの緑部分をクリックで名前枠を自動設定</span>
      </div>
      <div class="ivocr-row">
        <label>状態</label>
        <span id="ivocr-status" class="ivocr-badge">Idle</span>
      </div>
      <div class="ivocr-row">
        <label>名前</label>
        <span id="ivocr-name">-</span>
      </div>
      <div class="ivocr-row">
        <label>最新値</label>
        <span>CP: <span id="ivocr-val-cp">-</span></span>
        <span>HP: <span id="ivocr-val-hp">-</span></span>
        <span>すな: <span id="ivocr-val-dust">-</span></span>
      </div>
      <div class="ivocr-row">
        <label>IV推定</label>
        <span>攻: <span id="ivocr-iv-atk">-</span></span>
        <span>防: <span id="ivocr-iv-def">-</span></span>
        <span>HP: <span id="ivocr-iv-hp">-</span></span>
      </div>
      <div class="ivocr-row ivocr-toggle">
        <input type="checkbox" id="ivocr-autofill" />
        <label for="ivocr-autofill">自動入力</label>
      </div>
      <div class="ivocr-row ivocr-small">
        Tips: 許可ダイアログでミラーウィンドウまたはキャプチャデバイスを選択してください。
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
  const elName = panel.querySelector('#ivocr-name');
  const elIvAtk = panel.querySelector('#ivocr-iv-atk');
  const elIvDef = panel.querySelector('#ivocr-iv-def');
  const elIvHp = panel.querySelector('#ivocr-iv-hp');

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

  // ---------------------
  // 校正クリック処理
  // ---------------------

  let clickStep = 0;
  /** @type {{x:number,y:number} | null} */
  let tempStart = null;

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
      return;
    }

    if (STATE.calibTarget === 'autoName') {
      await autoCalibrateName({ x, y });
      STATE.calibTarget = 'none';
      clickStep = 0;
      tempStart = null;
      return;
    }

    if (clickStep === 0) {
      tempStart = { x, y };
      clickStep = 1;
    } else {
      if (!tempStart) return;
      const x1 = Math.min(tempStart.x, x);
      const y1 = Math.min(tempStart.y, y);
      const x2 = Math.max(tempStart.x, x);
      const y2 = Math.max(tempStart.y, y);
      const roi = pxToNorm({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, elCanvas);
      setROI(STATE.calibTarget, roi);
      STATE.calibTarget = 'none';
      clickStep = 0;
      tempStart = null;
      toast('枠を保存する場合は「保存」ボタンを押してください。');
    }
  });

  btnCalibCp?.addEventListener('click', () => { STATE.calibTarget = 'cp'; clickStep = 0; tempStart = null; });
  btnCalibHp?.addEventListener('click', () => { STATE.calibTarget = 'hp'; clickStep = 0; tempStart = null; });
  btnCalibDust?.addEventListener('click', () => { STATE.calibTarget = 'dust'; clickStep = 0; tempStart = null; });
  btnCalibName?.addEventListener('click', () => { STATE.calibTarget = 'name'; clickStep = 0; tempStart = null; });
  btnCalibAtk?.addEventListener('click', () => { STATE.calibTarget = 'atkGauge'; clickStep = 0; tempStart = null; });
  btnCalibDef?.addEventListener('click', () => { STATE.calibTarget = 'defGauge'; clickStep = 0; tempStart = null; });
  btnCalibHpBar?.addEventListener('click', () => { STATE.calibTarget = 'hpGauge'; clickStep = 0; tempStart = null; });
  btnAutoStat?.addEventListener('click', () => {
    STATE.calibTarget = 'autoStat';
    clickStep = 0;
    tempStart = null;
    toast('ラベル文字の少し上をクリックしてください。');
  });
  btnAutoName?.addEventListener('click', () => {
    STATE.calibTarget = 'autoName';
    clickStep = 0;
    tempStart = null;
    toast('HPバーの緑色部分をクリックしてください。');
  });
  btnSave?.addEventListener('click', () => { saveROI(STATE.roi); toast('ROI を localStorage に保存しました。'); });
  btnClear?.addEventListener('click', () => {
    STATE.roi = { cp: null, hp: null, dust: null, name: null, atkGauge: null, defGauge: null, hpGauge: null };
    saveROI(STATE.roi);
    toast('ROI をクリアしました。');
  });

  btnWideToggle?.addEventListener('click', () => {
    const isWide = !panel.classList.contains('ivocr-wide');
    applyPanelWideState(isWide);
    localStorage.setItem(PANEL_WIDE_KEY, JSON.stringify({ enabled: isWide }));
  });

  elSource?.addEventListener('change', () => {
    STATE.source = /** @type {typeof STATE.source} */ (elSource.value);
  });

  elAutoFill?.addEventListener('change', () => {
    STATE.autoFill = elAutoFill.checked;
  });

  elStart?.addEventListener('click', startCapture);
  elStop?.addEventListener('click', stopCapture);

  // ---------------------
  // パネルのドラッグ移動対応
  // ---------------------

  const headerEl = panel.querySelector('.ivocr-header');
  if (headerEl) {
    enablePanelDrag(headerEl);
  }

  // ---------------------
  // メインループ (描画 + OCR)
  // ---------------------

  const throttledOcr = throttle(async () => {
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
  }, 700);

  const throttledIv = throttle(() => {
    if (!STATE.canvasEl) return;
    const ivs = readGauges(STATE.canvasEl, STATE.roi);
    if (!ivs) return;
    const stable = stabilizeIv(ivs, STATE.stableIvBuf);
    if (!stable) return;
    STATE.lastIv = stable;
    renderIv(stable);
    if (STATE.autoFill) {
      fillIvBars(stable);
    }
  }, 600);

  const throttledName = throttle(async () => {
    if (!STATE.canvasEl) return;
    const raw = await readName(STATE.canvasEl, STATE.roi);
    if (!raw) return;
    const cleaned = sanitizeName(raw);
    if (!cleaned) return;
    if (cleaned === STATE.lastName) return;
    STATE.lastName = cleaned;
    renderName(cleaned);
    if (STATE.autoFill) {
      fillPokemonName(cleaned);
    }
  }, 1500);

  async function loop() {
    if (!STATE.running || !STATE.videoEl || !STATE.ctx || !STATE.canvasEl) return;
    const { videoEl, ctx, canvasEl } = STATE;

    adjustCanvasResolution();

    if (videoEl.readyState >= 2) {
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      drawROIs(ctx, canvasEl, STATE.roi, STATE.calibTarget);
      throttledOcr();
      throttledIv();
      throttledName();
    }
    STATE.loopId = requestAnimationFrame(loop);
  }

  function renderValues(values) {
    if (elValCp) elValCp.textContent = values.cp?.toString() ?? '-';
    if (elValHp) elValHp.textContent = values.hp?.toString() ?? '-';
    if (elValDust) elValDust.textContent = values.dust?.toString() ?? '-';
  }

  function renderName(name) {
    if (elName) elName.textContent = name ?? '-';
  }

  function renderIv(iv) {
    if (elIvAtk) elIvAtk.textContent = iv.atk ?? '-';
    if (elIvDef) elIvDef.textContent = iv.def ?? '-';
    if (elIvHp) elIvHp.textContent = iv.hp ?? '-';
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

  function handleVideoMetadata() {
    adjustCanvasResolution();
  }

  function adjustCanvasResolution() {
    if (!STATE.canvasEl || !STATE.videoEl) return;
    const vw = STATE.videoEl.videoWidth || 0;
    const vh = STATE.videoEl.videoHeight || 0;
    if (!vw || !vh) return;
    if (STATE.canvasEl.width !== vw || STATE.canvasEl.height !== vh) {
      STATE.canvasEl.width = vw;
      STATE.canvasEl.height = vh;
      STATE.canvasEl.style.aspectRatio = `${vw} / ${vh}`;
    }
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

  /**
   * ROI を可視化するための枠線を描画します。
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} canvas
   * @param {{cp: ROI | null, hp: ROI | null, dust: ROI | null, name: ROI | null, atkGauge: ROI | null, defGauge: ROI | null, hpGauge: ROI | null}} roi
  * @param {'none'|'cp'|'hp'|'dust'|'name'|'atkGauge'|'defGauge'|'hpGauge'|'autoStat'|'autoName'} active
   */
  function drawROIs(ctx, canvas, roi, active) {
    ctx.save();
    const draw = (r, color) => {
      if (!r) return;
      const p = normToPx(r, canvas);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
    };
    draw(roi.cp, active === 'cp' ? '#00e5ff' : '#0af');
    draw(roi.hp, active === 'hp' ? '#ffd54f' : '#fc0');
    draw(roi.dust, active === 'dust' ? '#a5d6a7' : '#6c6');
    draw(roi.name, active === 'name' ? '#f48fb1' : '#f06292');
    draw(roi.atkGauge, active === 'atkGauge' ? '#ff8a65' : '#ff7043');
    draw(roi.defGauge, active === 'defGauge' ? '#4db6ac' : '#26a69a');
    draw(roi.hpGauge, active === 'hpGauge' ? '#9575cd' : '#7e57c2');
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

  function stabilizeIv(next, buffer) {
    const out = { atk: null, def: null, hp: null };
    ['atk', 'def', 'hp'].forEach((key) => {
      const value = next[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        buffer[key].push(value);
        if (buffer[key].length > 3) buffer[key].shift();
      }
      if (buffer[key].length === 3) {
        const sorted = [...buffer[key]].sort((a, b) => a - b);
        out[key] = sorted[1];
      }
    });
    if (out.atk !== null || out.def !== null || out.hp !== null) return out;
    return null;
  }

  function readGauges(preview, roi) {
    const result = { atk: null, def: null, hp: null };
    if (roi.atkGauge) result.atk = measureGauge(preview, roi.atkGauge);
    if (roi.defGauge) result.def = measureGauge(preview, roi.defGauge);
    if (roi.hpGauge) result.hp = measureGauge(preview, roi.hpGauge);
    if (result.atk === null && result.def === null && result.hp === null) return null;
    return result;
  }

  function measureGauge(preview, roi) {
    const canvas = cropCanvasRaw(preview, roi);
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    if (!width || !height) return null;

    // ゲージ中央帯だけを平均化し、背景の影響を減らす
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
    if (!Number.isFinite(dynamicRange) || dynamicRange < 5) return null;
    const threshold = base + dynamicRange * 0.25;

    let filled = -1;
    let consecutiveMiss = 0;
    const tolerance = Math.max(2, Math.floor(width * 0.05));
    for (let x = 0; x < width; x += 1) {
      if (smoothed[x] >= threshold) {
        filled = x;
        consecutiveMiss = 0;
      } else if (filled !== -1) {
        consecutiveMiss += 1;
        if (consecutiveMiss > tolerance) {
          break;
        }
      }
    }

    if (filled < 0) return 0;
    let ratio = (filled + 1) / width;

    // ピンクバーなど満タン時は極端にピクセルが高くなるため補正
    const rightTail = smoothed.slice(Math.max(0, width - Math.floor(width * 0.08)));
    const tailAvg = rightTail.length ? rightTail.reduce((sum, v) => sum + v, 0) / rightTail.length : 0;
    if (tailAvg >= threshold * 0.95) {
      ratio = 1;
    }

    let iv = Math.round(ratio * 15);
    if (iv >= 14 && ratio > 0.93) {
      iv = 15;
    }
    return clamp(iv, 0, 15);
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
    STATE.roi.hpGauge = STATE.roi.hpGauge ?? hpRoi;
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
    const hpPx = normToPx(hpRoi, preview);
    const bar = {
      x: Math.round(hpPx.x * preview.width),
      y: Math.round(hpPx.y * preview.height),
      w: Math.round(hpPx.w * preview.width),
      h: Math.round(hpPx.h * preview.height),
    };
    if (!bar.w || !bar.h) return null;

    const searchWidth = Math.min(preview.width, Math.round(bar.w * 1.1));
    const searchLeft = clamp(bar.x + Math.round(bar.w * 0.5) - Math.round(searchWidth * 0.5), 0, Math.max(0, preview.width - searchWidth));
    const searchBottom = clamp(bar.y - Math.round(bar.h * 0.3), 0, preview.height);
    const searchTop = clamp(searchBottom - Math.max(Math.round(bar.h * 14), Math.round(preview.height * 0.05)), 0, searchBottom);
    const searchHeight = Math.max(1, searchBottom - searchTop);

    if (searchHeight < 4) return null;

    const roi = {
      x: searchLeft / preview.width,
      y: searchTop / preview.height,
      w: searchWidth / preview.width,
      h: searchHeight / preview.height,
    };

    const canvas = cropCanvasRaw(preview, roi);
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    if (!w || !h) return null;
    const data = ctx.getImageData(0, 0, w, h).data;

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const score = computeWhiteScore(r, g, b);
        if (score >= 18) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX === -1 || maxY === -1) {
      const fallbackTop = clamp(Math.round(searchTop + searchHeight * 0.25), 0, preview.height);
      const fallbackBottom = clamp(Math.round(searchTop + searchHeight * 0.55), fallbackTop + 1, preview.height);
      return {
        x: searchLeft / preview.width,
        y: fallbackTop / preview.height,
        w: searchWidth / preview.width,
        h: Math.max(1, fallbackBottom - fallbackTop) / preview.height,
      };
    }

    const marginX = Math.max(4, Math.floor(w * 0.05));
    const marginY = Math.max(3, Math.floor(h * 0.06));
    minX = clamp(minX - marginX, 0, w - 1);
    maxX = clamp(maxX + marginX, 0, w - 1);
    minY = clamp(minY - marginY, 0, h - 1);
    maxY = clamp(maxY + marginY, 0, h - 1);

    const absLeft = searchLeft + minX;
    const absTop = searchTop + minY;
    const absRight = searchLeft + maxX + 1;
    const absBottom = searchTop + maxY + 1;

    return {
      x: absLeft / preview.width,
      y: absTop / preview.height,
      w: Math.max(1, absRight - absLeft) / preview.width,
      h: Math.max(1, absBottom - absTop) / preview.height,
    };
  }

  async function readName(preview, roi) {
    if (!roi.name) return null;
    const canvas = cropCanvasRaw(preview, roi.name);
    if (!canvas.width || !canvas.height) return null;
    try {
      const res = await TesseractLib.recognize(canvas, 'jpn+eng', {
        psm: 7,
      });
      return res?.data?.text ?? '';
    } catch (error) {
      console.warn('[IV OCR] readName error:', error);
      return null;
    }
  }

  function sanitizeName(text) {
    if (!text) return '';
    const normalized = text.replace(/[\r\n]+/g, '').replace(/\s+/g, '').replace(/[☆★]/g, '').trim();
    if (normalized.length < 2) return '';
    return normalized;
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
    if (typeof iv.atk === 'number') applyIvValue('atk', iv.atk);
    if (typeof iv.def === 'number') applyIvValue('def', iv.def);
    if (typeof iv.hp === 'number') applyIvValue('hp', iv.hp);
  }

  function fillPokemonName(name) {
    const input = document.querySelector('input[type="search"][placeholder="ポケモンを選択"]');
    if (!input) return;
    if (input.value === name) return;
    input.focus();
    input.value = name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
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

  function applyIvValue(kind, value) {
    const iv = clamp(Math.round(value), 0, 15);
    const hidden = document.querySelector(`input[name="${kind}"][data-id="${kind}"]`);
    if (hidden) {
      hidden.value = String(iv);
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const span = document.getElementById(`wiki_${kind}`);
    if (!span) return;
    const anchors = Array.from(span.querySelectorAll('a[data-val]'));
    anchors.forEach((anchor) => {
      const val = Number(anchor.dataset.val || '0');
      if (iv === 0) {
        anchor.classList.remove('iv_active', 'bar_maxr');
        return;
      }
      if (val <= iv) {
        anchor.classList.add('iv_active');
      } else {
        anchor.classList.remove('iv_active');
      }
      if (val === iv) {
        anchor.classList.add('bar_maxr');
      } else {
        anchor.classList.remove('bar_maxr');
      }
    });
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
  renderName(null);
  renderIv({ atk: null, def: null, hp: null });
  updateStatus('Idle');

})();
