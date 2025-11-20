self.importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@4.0.2/dist/tesseract.min.js');
const TesseractLib = self.Tesseract;

/**
 * @typedef {{
 *   id: string,
 *   kind: 'digits' | 'name',
 *   imageData: ImageData,
 *   whitelist?: string,
 *   params?: Record<string, any>
 * }} OcrRequest
 * @typedef {{
 *   id: string,
 *   text: string,
 *   confidence: number,
 * }} OcrResponse
 */

self.addEventListener('message', async (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'ocr-request') {
    const request = /** @type {OcrRequest} */ (data.payload);
    const response = await handleOcrRequest(request).catch((error) => ({
      id: request.id,
      text: '',
      confidence: 0,
      error: error?.message ?? 'unknown',
    }));
    self.postMessage({ type: 'ocr-response', payload: response });
  }
});

async function handleOcrRequest(request) {
  const { id, imageData, kind, whitelist, params } = request;
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  const lang = kind === 'name' ? 'jpn' : 'eng';
  const options = Object.assign(
    {},
    whitelist ? { tessedit_char_whitelist: whitelist } : null,
    params || {}
  );
  const result = await TesseractLib.recognize(canvas, lang, options);
  const text = result?.data?.text ?? '';
  const confidence = Number(result?.data?.confidence ?? 0);
  return { id, text, confidence };
}
