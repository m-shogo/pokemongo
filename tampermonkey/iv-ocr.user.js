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
   *   roi: {cp: ROI | null, hp: ROI | null, dust: ROI | null},
   *   running: boolean,
   *   autoFill: boolean,
   *   source: 'screen' | 'camera',
   *   calibTarget: 'none' | 'cp' | 'hp' | 'dust',
   *   loopId: number | null,
   *   lastValues: {cp: number | null, hp: number | null, dust: number | null},
   *   stableBuf: {cp: number[], hp: number[], dust: number[]}
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
    stableBuf: { cp: [], hp: [], dust: [] },
  };

  // ---------------------
  // UI 初期化
  // ---------------------

  GM_addStyle(`
    .ivocr-panel {
      position: fixed; right: 16px; bottom: 16px;
      width: 340px; background: #111; color: #fff; z-index: 999999;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, 'Noto Sans JP', sans-serif;
      border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.4);
      overflow: hidden; border: 1px solid #333;
    }
    .ivocr-header { padding: 8px 12px; font-weight: 600; background: #222; display:flex; justify-content:space-between; align-items:center; }
    .ivocr-body { padding: 8px 12px; }
    .ivocr-row { display:flex; gap:8px; align-items:center; margin:6px 0; flex-wrap:wrap; }
    .ivocr-row label { font-size: 12px; color: #ccc; }
    .ivocr-row input[type="number"] { width: 80px; }
    .ivocr-btn { padding: 6px 10px; font-size: 12px; border: 1px solid #444; background:#1f1f1f; color:#fff; border-radius:6px; cursor:pointer; }
    .ivocr-btn:hover { background:#2a2a2a; }
    .ivocr-toggle { display:flex; align-items:center; gap:6px; }
    .ivocr-preview { width: 320px; height: 640px; background:#000; border-radius:6px; border:1px solid #333; }
    .ivocr-badge { padding:2px 6px; border-radius:4px; background:#333; color:#ddd; font-size:11px; }
    .ivocr-small { font-size: 11px; color:#aaa; }
  `);

  const panel = document.createElement('div');
  panel.className = 'ivocr-panel';
  panel.innerHTML = `
    <div class="ivocr-header">
      <div>IV OCR</div>
      <div class="ivocr-badge">Beta</div>
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
      <canvas class="ivocr-preview" id="ivocr-canvas" width="320" height="640"></canvas>
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
        <label>状態</label>
        <span id="ivocr-status" class="ivocr-badge">Idle</span>
      </div>
      <div class="ivocr-row">
        <label>最新値</label>
        <span>CP: <span id="ivocr-val-cp">-</span></span>
        <span>HP: <span id="ivocr-val-hp">-</span></span>
        <span>すな: <span id="ivocr-val-dust">-</span></span>
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
  const btnSave = panel.querySelector('#ivocr-save');
  const btnClear = panel.querySelector('#ivocr-clear');

  STATE.canvasEl = elCanvas;
  STATE.ctx = elCanvas.getContext('2d');
  STATE.videoEl = document.createElement('video');
  STATE.videoEl.playsInline = true;
  STATE.videoEl.muted = true;

  // ---------------------
  // 校正クリック処理
  // ---------------------

  let clickStep = 0;
  /** @type {{x:number,y:number} | null} */
  let tempStart = null;

  elCanvas.addEventListener('click', (e) => {
    if (STATE.calibTarget === 'none') return;
    const rect = elCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
  btnSave?.addEventListener('click', () => { saveROI(STATE.roi); toast('ROI を localStorage に保存しました。'); });
  btnClear?.addEventListener('click', () => { STATE.roi = { cp: null, hp: null, dust: null }; saveROI(STATE.roi); toast('ROI をクリアしました。'); });

  elSource?.addEventListener('change', () => {
    STATE.source = /** @type {typeof STATE.source} */ (elSource.value);
  });

  elAutoFill?.addEventListener('change', () => {
    STATE.autoFill = elAutoFill.checked;
  });

  elStart?.addEventListener('click', startCapture);
  elStop?.addEventListener('click', stopCapture);

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

  async function loop() {
    if (!STATE.running || !STATE.videoEl || !STATE.ctx || !STATE.canvasEl) return;
    const { videoEl, ctx, canvasEl } = STATE;

    if (videoEl.readyState >= 2) {
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      drawROIs(ctx, canvasEl, STATE.roi, STATE.calibTarget);
      throttledOcr();
    }
    STATE.loopId = requestAnimationFrame(loop);
  }

  function renderValues(values) {
    if (elValCp) elValCp.textContent = values.cp?.toString() ?? '-';
    if (elValHp) elValHp.textContent = values.hp?.toString() ?? '-';
    if (elValDust) elValDust.textContent = values.dust?.toString() ?? '-';
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
   * @param {'cp'|'hp'|'dust'} target
   * @param {ROI} roi
   */
  function setROI(target, roi) {
    if (target === 'cp') STATE.roi.cp = roi;
    if (target === 'hp') STATE.roi.hp = roi;
    if (target === 'dust') STATE.roi.dust = roi;
  }

  /**
   * ROI を localStorage に保存します。
   * @param {{cp: ROI | null, hp: ROI | null, dust: ROI | null}} roi
   */
  function saveROI(roi) {
    localStorage.setItem(LS_KEY, JSON.stringify(roi));
  }

  /**
   * localStorage から ROI を読み込みます。
   * @returns {{cp: ROI | null, hp: ROI | null, dust: ROI | null}}
   */
  function loadROI() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return { cp: null, hp: null, dust: null };
      const parsed = JSON.parse(raw);
      return {
        cp: parsed?.cp ?? null,
        hp: parsed?.hp ?? null,
        dust: parsed?.dust ?? null,
      };
    } catch (error) {
      console.warn('[IV OCR] loadROI error:', error);
      return { cp: null, hp: null, dust: null };
    }
  }

  /**
   * ROI を可視化するための枠線を描画します。
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} canvas
   * @param {{cp: ROI | null, hp: ROI | null, dust: ROI | null}} roi
   * @param {'none'|'cp'|'hp'|'dust'} active
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
  function cropCanvas(preview, r) {
    const p = normToPx(r, preview);
    const canvas = document.createElement('canvas');
    canvas.width = p.w;
    canvas.height = p.h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(preview, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h);

    const img = ctx.getImageData(0, 0, p.w, p.h);
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

  // ---------------------
  // 初期化処理
  // ---------------------

  renderValues({ cp: null, hp: null, dust: null });
  updateStatus('Idle');

})();
