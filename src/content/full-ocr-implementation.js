/**
 * full-ocr-implementation.js
 * OCR engine wrapper — bridges Tesseract.js to window.OCREngine.
 * Worker creation is deferred to the first recognize() call to avoid
 * CSP violations on pages that restrict worker-src (e.g. GitHub).
 */

(function() {
    'use strict';

    // Create Tesseract namespace if it doesn't exist
    if (typeof window.Tesseract === 'undefined') {
        window.Tesseract = {};
    }

    const hasCreateWorker = typeof Tesseract !== 'undefined' && typeof Tesseract.createWorker !== 'undefined';
    const hasSimpleAPI = typeof Tesseract !== 'undefined' && typeof Tesseract.recognize !== 'undefined';

    if (hasCreateWorker || hasSimpleAPI) {
        // Real Tesseract.js library is available
        window.OCREngine = {
            /**
             * Recognize text in an image. Creates a worker on demand.
             * Throws a clear error if CSP blocks blob: workers.
             */
            async recognize(imageSource, languages = ['eng']) {
                // Try simple API first (doesn't require a separate worker)
                if (hasSimpleAPI) {
                    try {
                        const result = await Tesseract.recognize(imageSource, languages.join('+'));
                        return result.data.text || '';
                    } catch (simpleError) {
                        // Fall through to worker API
                        if (!hasCreateWorker) throw simpleError;
                    }
                }

                // Worker API — created on demand, not at script load time
                if (hasCreateWorker) {
                    let worker;
                    try {
                        worker = Tesseract.createWorker();
                    } catch (createErr) {
                        const msg = (createErr.message || '').toLowerCase();
                        if (msg.includes('content security policy') || msg.includes('worker-src') || msg.includes('csp')) {
                            throw new Error('此页面的安全策略 (CSP) 禁止创建 OCR Worker。请在其他页面使用图片翻译。');
                        }
                        throw createErr;
                    }

                    try {
                        if (typeof worker.load === 'function') await worker.load();
                        if (typeof worker.loadLanguage === 'function') {
                            for (const lang of languages) {
                                await worker.loadLanguage(lang);
                            }
                        }
                        if (typeof worker.initialize === 'function') {
                            await worker.initialize(languages.join('+'));
                        }

                        const result = await worker.recognize(imageSource);
                        return result.data?.text || '';
                    } finally {
                        // Always clean up the worker
                        if (worker && typeof worker.terminate === 'function') {
                            worker.terminate().catch(() => {});
                        }
                    }
                }

                throw new Error('No available Tesseract API found');
            }
        };
    } else {
        // No Tesseract.js loaded — stub that reports the issue
        window.OCREngine = {
            async recognize() {
                throw new Error('OCR 引擎未加载。请确保 Tesseract.js 已正确加载。');
            }
        };
    }

    // Legacy compatibility: keep FullOCRTranslator symbol, but delegate to the single OCRTranslator implementation.
    class FullOCRTranslator {
        constructor() {
            this._delegate = null;
        }

        async initialize() {
            if (window.__xiaoetOcrTranslator) {
                this._delegate = window.__xiaoetOcrTranslator;
                return;
            }
            if (typeof window.OCRTranslator === 'function') {
                this._delegate = new window.OCRTranslator();
                window.__xiaoetOcrTranslator = this._delegate;
                if (typeof this._delegate.initialize === 'function') {
                    await this._delegate.initialize();
                }
            }
        }

        async ocrAndTranslate(imageSrc, targetLang = 'zh-CN', engine = 'google') {
            if (!this._delegate) await this.initialize();
            if (!this._delegate || typeof this._delegate.ocrAndTranslate !== 'function') {
                throw new Error('OCR 主实现不可用，请刷新页面后重试。');
            }
            return this._delegate.ocrAndTranslate(imageSrc, targetLang, engine);
        }
    }

    window.FullOCRTranslator = FullOCRTranslator;
})();
