/**
 * ocr-translator.js
 * OCR and image-to-text translation functionality
 */

(function() {
    'use strict';

    try {
        class OCRTranslator {
    constructor() {
        this.ocrWorker = null;
        this.isInitialized = false;
        this.tesseractWorkerPromise = null;
        this.maxTranslateRetries = 1;
        this.taskTimeoutMs = 45000;
    }

    /**
     * Initialize OCR worker.
     * Only sets isInitialized = true when a usable OCR engine actually exists.
     * Detects CSP violations (blob: worker blocked) and gives a clear error.
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            if (typeof Tesseract !== 'undefined' && typeof Tesseract.createWorker === 'function') {
                this.ocrWorker = Tesseract.createWorker({
                    logger: (progress) => {
                        if (progress.progress !== undefined) {
                            console.debug(`OCR Progress: ${Math.round(progress.progress * 100)}%`);
                        }
                    }
                });

                const hasLoad = typeof this.ocrWorker.load === 'function';
                const hasLoadLanguage = typeof this.ocrWorker.loadLanguage === 'function';
                const hasInitialize = typeof this.ocrWorker.initialize === 'function';

                if (hasLoad && hasLoadLanguage && hasInitialize) {
                    await this.ocrWorker.load();
                    await this.ocrWorker.loadLanguage('eng');
                    await this.ocrWorker.initialize('eng');
                    this.isInitialized = true;
                    return;
                }
            }

            // Fallback: check global OCREngine
            if (typeof window.OCREngine !== 'undefined') {
                this.isInitialized = true;
                return;
            }

            // No OCR engine available — do NOT set isInitialized = true
            console.warn('No OCR engine available. OCR features will not work.');
        } catch (error) {
            // Detect CSP violation (blob: worker blocked by page's Content-Security-Policy)
            const msg = (error.message || '').toLowerCase();
            if (msg.includes('content security policy') || msg.includes('csp') || msg.includes('worker-src')) {
                this.cspBlocked = true;
                console.warn('OCR blocked by page CSP: blob: workers are not allowed on this site.');
                throw new Error('此页面的安全策略禁止 OCR 功能。请在其他页面上使用图片翻译。');
            }
            console.error('Failed to initialize OCR worker:', error);
            // Leave isInitialized = false so callers know OCR is not available
        }
    }

    /**
     * Perform OCR on an image and translate the text
     */
    async ocrAndTranslate(imageSrc, targetLang = 'zh-CN', engine = 'google') {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.isInitialized) {
            throw new Error('OCR engine could not be initialized. Please check that Tesseract.js is loaded.');
        }

        try {
            const ocrLang = this.getOCRLanguageForTarget(targetLang);
            const result = await this.performOCR(imageSrc, ocrLang);

            if (!result || !result.data || !result.data.text) {
                throw new Error('OCR failed to extract text from image');
            }

            let extractedText = result.data.text.trim();
            extractedText = this.cleanOCRResult(extractedText);
            extractedText = this.postProcessAcademicText(extractedText);

            const translatedText = await this.translateTextWithRetry(extractedText, targetLang, engine);

            return {
                original: extractedText,
                translated: translatedText,
                confidence: result.data.confidence || 95
            };
        } catch (error) {
            console.error('OCR and translation failed:', error);

            // Fallback to global OCREngine
            if (typeof window.OCREngine !== 'undefined') {
                try {
                    let extractedText = await window.OCREngine.recognize(imageSrc, [this.getOCRLanguageForTarget(targetLang)]);
                    extractedText = this.cleanOCRResult(extractedText);
                    extractedText = this.postProcessAcademicText(extractedText);
                    const translatedText = await this.translateTextWithRetry(extractedText, targetLang, engine);

                    return {
                        original: extractedText,
                        translated: translatedText,
                        confidence: 95
                    };
                } catch (fallbackError) {
                    console.error('Fallback OCR also failed:', fallbackError);
                }
            }

            throw error;
        }
    }

    /**
     * Post-process academic text to improve readability
     */
    postProcessAcademicText(text) {
        if (!text) return text;

        let processed = text;

        // Fix comma in numbers: "1 0 2" between digits → "1,2"
        processed = processed.replace(/(\d)\s*[oO]\s*(\d)/g, '$1,$2');

        // Fix citation brackets
        processed = processed.replace(/\[\s*(\d+)\s*\]/g, '[$1]');

        // Standardize academic abbreviations like "Fig. 2"
        processed = processed.replace(/\b(Fig|Eq|Ref|Tab|Sec|Ch|pp?)\s*\.?\s*(\d+)/gi, '$1. $2');

        // Multiple spaces to single space
        processed = processed.replace(/\s+/g, ' ');

        return processed.trim();
    }

    /**
     * Clean up OCR result to remove noise.
     * Conservative approach: only fix patterns that are unambiguously OCR errors.
     */
    cleanOCRResult(text) {
        if (!text) return text;

        let cleaned = text.replace(/\s+/g, ' ').trim();

        // Fix common OCR artifacts: max 2 consecutive identical chars
        cleaned = cleaned.replace(/(.)\1{2,}/g, '$1$1');

        // Fix digit-O-digit patterns: "1O3" → "103" (O between digits is almost always 0)
        cleaned = cleaned.replace(/(\d)O(\d)/g, '$10$2');
        cleaned = cleaned.replace(/O(?=\d{2,})/g, '0');

        // Fix pipe character that should be l or I based on context
        cleaned = cleaned.replace(/\|(?=[a-z])/g, 'l');  // |etter → letter
        cleaned = cleaned.replace(/\|(?=[A-Z\s])/g, 'I'); // |N → IN

        // Remove lines that are mostly garbage
        const lines = cleaned.split('\n');
        const filteredLines = lines.filter(line => {
            if (!line.trim()) return false;
            const alphaNumCount = (line.match(/[a-zA-Z0-9]/g) || []).length;
            const ratio = line.length > 0 ? alphaNumCount / line.length : 0;
            return ratio >= 0.10;
        });

        cleaned = filteredLines.join('\n').trim();

        // Collapse multiple blank lines
        cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');

        // Normalize punctuation runs
        cleaned = cleaned.replace(/([.!?]){2,}/g, '$1');

        // Multiple spaces to single
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        return cleaned;
    }

    /**
     * Map target language to Tesseract OCR language code
     */
    getOCRLanguageForTarget(targetLang) {
        const langMap = {
            'zh-CN': 'chi_sim',
            'zh-TW': 'chi_tra',
            'ja': 'jpn',
            'ko': 'kor',
            'fr': 'fra',
            'de': 'deu',
            'ru': 'rus',
            'es': 'spa',
            'ar': 'ara',
            'it': 'ita',
            'pt': 'por'
        };
        return langMap[targetLang] || 'eng';
    }

    /**
     * Perform OCR on an image
     */
    async performOCR(imageSrc, language = 'eng') {
        // Try global OCREngine first
        if (typeof window.OCREngine !== 'undefined') {
            try {
                const recognizedText = await window.OCREngine.recognize(imageSrc, [language]);
                return {
                    data: {
                        text: recognizedText,
                        confidence: 95
                    }
                };
            } catch (error) {
                console.error('Global OCREngine failed:', error);
                // Fall through to worker
            }
        }

        // Try worker
        if (this.ocrWorker && typeof this.ocrWorker.recognize === 'function') {
            return await this.ocrWorker.recognize(imageSrc);
        }

        throw new Error('OCR engine not available');
    }

    /**
     * Translate text using unified task-event protocol.
     */
    async translateText(text, targetLang, engine) {
        return new Promise((resolve, reject) => {
            if (typeof Utils !== 'undefined' && !Utils.isExtensionContextValid()) {
                reject(new Error('扩展已更新，请刷新页面后重试。'));
                return;
            }

            let taskId = '';
            let settled = false;
            let timeoutId = null;

            const cleanup = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                if (typeof Utils !== 'undefined' && Utils.isExtensionContextValid()) {
                    chrome.runtime.onMessage.removeListener(onTaskEvent);
                }
            };

            const finishResolve = (value) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(value);
            };

            const finishReject = (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error);
            };

            const onTaskEvent = (msg) => {
                if (!msg || msg.type !== 'TASK_EVENT') return;
                if (!taskId || msg.taskId !== taskId) return;

                if (msg.event === 'TASK_RESULT') {
                    finishResolve(msg.payload?.translated || '');
                } else if (msg.event === 'TASK_ERROR') {
                    finishReject(new Error(msg.payload?.message || 'Translation failed'));
                } else if (msg.event === 'TASK_DONE' && msg.payload?.status === 'failed') {
                    finishReject(new Error('Translation failed'));
                }
            };

            chrome.runtime.onMessage.addListener(onTaskEvent);

            chrome.runtime.sendMessage({
                type: 'REQUEST_TASK_TRANSLATE',
                text,
                targetLang,
                engine,
                mode: 'ocr',
                stream: false
            }, (response) => {
                if (chrome.runtime.lastError) {
                    finishReject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (response && response.success) {
                    taskId = response.taskId || '';
                    if (!taskId) {
                        finishReject(new Error('Task id missing'));
                        return;
                    }

                    timeoutId = setTimeout(() => {
                        finishReject(new Error('OCR 翻译任务超时，请重试。'));
                    }, this.taskTimeoutMs);
                } else {
                    finishReject(new Error((response && response.error) || 'Translation failed'));
                }
            });
        });
    }

    async translateTextWithRetry(text, targetLang, engine) {
        let attempt = 0;
        let lastError = null;

        while (attempt <= this.maxTranslateRetries) {
            try {
                return await this.translateText(text, targetLang, engine);
            } catch (error) {
                lastError = error;
                attempt += 1;
                if (attempt > this.maxTranslateRetries) break;
                await new Promise(resolve => setTimeout(resolve, 150 * attempt));
            }
        }

        throw lastError || new Error('Translation failed');
    }

    /**
     * Process image from file input.
     * Validates file type and size before processing.
     */
    async processImageFile(file) {
        // Validate file
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
        if (!allowedTypes.includes(file.type)) {
            throw new Error(`Unsupported image type: ${file.type}`);
        }
        const maxSize = 20 * 1024 * 1024; // 20MB
        if (file.size > maxSize) {
            throw new Error('Image file is too large (max 20MB)');
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const imageData = e.target.result;
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const img = new Image();

                    img.onload = () => {
                        const maxWidth = 1200;
                        const maxHeight = 1600;

                        let { width, height } = img;
                        if (width > maxWidth || height > maxHeight) {
                            const ratio = Math.min(maxWidth / width, maxHeight / height);
                            width *= ratio;
                            height *= ratio;
                        }

                        canvas.width = width;
                        canvas.height = height;
                        ctx.drawImage(img, 0, 0, width, height);

                        const resizedImageData = canvas.toDataURL('image/jpeg', 0.8);
                        resolve(resizedImageData);
                    };

                    img.onerror = () => reject(new Error('Failed to load image'));
                    img.src = imageData;
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * Cleanup resources — must be called on page unload
     */
    async destroy() {
        if (this.ocrWorker) {
            try {
                await this.ocrWorker.terminate();
            } catch (e) {
                // Worker may already be terminated
            }
            this.ocrWorker = null;
        }
        this.isInitialized = false;
    }
}

        window.OCRTranslator = OCRTranslator;

    } catch (error) {
        console.error('FATAL ERROR in ocr-translator.js:', error);
    }
})();
