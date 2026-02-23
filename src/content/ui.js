/**
 * ui.js
 * Manages the ShadowDOM interactions and UI State
 */
class TranslatorUI {
    constructor() {
        this.host = null;
        this.shadow = null;
        this.card = null;
        this.icon = null;
        this.streamActive = false;

        // State
        this.engine = 'google';
        this.targetLang = 'zh-CN';
        this.pendingRect = null; // Store rect for async/stream positioning
        this.currentTaskId = '';
        this.toastTimer = null;

        // Security and performance enhancements
        this.translationHistory = []; // Keep limited history for performance
        this.maxHistorySize = 10;
        this.lastUpdateTime = 0; // Throttle updates
        this.updateThrottleMs = 100; // Throttle UI updates
        
        // Lock state to prevent accidental closing
        this.isLocked = false;

        this._initHost();
        this.setupClickOutsideHandler();
    }

    _initHost() {
        if (document.getElementById('xiaoet-overlay-host')) return;

        this.host = document.createElement('div');
        this.host.id = 'xiaoet-overlay-host';
        Object.assign(this.host.style, {
            position: 'fixed', zIndex: '2147483647', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none'
        });
        document.body.appendChild(this.host);
        this.shadow = this.host.attachShadow({ mode: 'open' });

        // Inject Styles
        const styleEl = document.createElement('style');
        styleEl.textContent = STYLES;
        this.shadow.appendChild(styleEl);
    }

    setPendingRect(rect) {
        this.pendingRect = rect;
    }

    showLoading(autoPosition = true, rect = null) {
        this.createCard();
        this._renderLoading();
        this.setTaskState('处理中…', 'info');
        this.card.classList.add('visible');
        if (autoPosition) this.positionCard(rect);
    }


    showResult(original, translated, mode, detectedLang, fallbackEngine) {
        this.createCard();
        this._renderTranslation(original, translated, mode);
        this.setTaskState('', '');
        this.card.classList.add('visible');
        if (!this.card.hasAttribute('data-msg-positioned')) {
            this.positionCard(this.pendingRect);
            this.pendingRect = null;
        }

        // Show language info in header
        if (detectedLang) {
            this._showLangInfo(detectedLang);
        }

        // Show fallback notice if engine fell back
        if (fallbackEngine) {
            this._showFallbackNotice(fallbackEngine);
        }

        this._addToHistory(original, translated, mode);
    }

    startStream(original) {
        this.createCard();
        this.streamActive = true;
        this._renderTranslation(original, "", "translate", true);
        this.setTaskState('流式翻译中…', 'info');
        this.card.classList.add('visible');
        if (!this.card.hasAttribute('data-msg-positioned')) {
            this.positionCard(this.pendingRect);
            this.pendingRect = null; // Clear after use
        }
        
        // Add to translation history
        this._addToHistory(original, "", "translate");
    }
    
    // Add to translation history with size limiting
    _addToHistory(original, translated, mode) {
        // Sanitize inputs before storing
        const sanitizedOriginal = this._sanitizeText(original);
        const sanitizedTranslated = this._sanitizeText(translated);
        
        this.translationHistory.push({
            original: sanitizedOriginal,
            translated: sanitizedTranslated,
            mode: mode,
            timestamp: Date.now()
        });
        
        // Limit history size
        if (this.translationHistory.length > this.maxHistorySize) {
            this.translationHistory.shift(); // Remove oldest entry
        }
    }

    appendStreamChunk(chunk) {
        if (!this.card) return;
        
        // Throttle UI updates to improve performance
        const now = Date.now();
        if (now - this.lastUpdateTime < this.updateThrottleMs) {
            // Schedule update for later if we're updating too frequently
            if (!this.pendingUpdate) {
                this.pendingUpdate = chunk;
                setTimeout(() => {
                    if (this.pendingUpdate) {
                        this._applyChunkUpdate(this.pendingUpdate);
                        this.pendingUpdate = null;
                    }
                }, this.updateThrottleMs);
            } else {
                // Accumulate pending updates
                this.pendingUpdate += chunk;
            }
            return;
        }
        
        this._applyChunkUpdate(chunk);
        this.lastUpdateTime = now;
    }
    
    _applyChunkUpdate(chunk) {
        const targetEl = this.shadow.querySelector('textarea.target');

        if (targetEl) {
            // textarea.value is plain text — no HTML parsing, no XSS risk.
            // Do NOT HTML-encode here or users see literal &amp; etc.
            targetEl.value += chunk;
            this._autoResize(targetEl);
            targetEl.scrollTop = targetEl.scrollHeight;
        }
    }

    endStream() {
        this.streamActive = false;
        const cursor = this.shadow.querySelector('.cursor');
        if (cursor) cursor.classList.add('hidden');
        this.setTaskState('', '');
    }

    setTaskState(message, level = 'info') {
        this.createCard();
        const header = this.card.querySelector('.header .brand');
        if (!header) return;

        let el = header.querySelector('.task-state');
        if (!message) {
            if (el) el.remove();
            return;
        }

        if (!el) {
            el = document.createElement('span');
            el.className = 'task-state';
            el.style.cssText = 'margin-left:8px;font-size:11px;padding:2px 6px;border-radius:10px;';
            header.appendChild(el);
        }

        el.textContent = message;
        if (level === 'error') {
            el.style.background = 'rgba(220,38,38,0.12)';
            el.style.color = '#dc2626';
        } else if (level === 'success') {
            el.style.background = 'rgba(22,163,74,0.12)';
            el.style.color = '#16a34a';
        } else {
            el.style.background = 'rgba(65,54,241,0.12)';
            el.style.color = '#4136f1';
        }
    }

    setCancelable(enabled, taskId = '') {
        this.currentTaskId = enabled ? String(taskId || '') : '';
        if (!this.card) return;
        const cancelBtn = this.card.querySelector('#btnCancelTask');
        if (cancelBtn) {
            cancelBtn.style.display = enabled ? 'inline-flex' : 'none';
        }
    }

    showToast(message, level = 'info') {
        if (!this.shadow) return;
        let toast = this.shadow.querySelector('.xiaoet-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'xiaoet-toast';
            this.shadow.appendChild(toast);
        }
        toast.textContent = String(message || '');
        toast.setAttribute('data-level', level || 'info');
        toast.classList.add('visible');

        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            toast.classList.remove('visible');
            this.toastTimer = null;
        }, 2200);
    }

    showDocumentPanel() {
        this.createCard();
        this._renderTranslation('', '', 'document');
        this.setTaskState('文档翻译中…', 'info');
        this.card.classList.add('visible');
        if (!this.card.hasAttribute('data-msg-positioned')) {
            this.positionCard(this.pendingRect);
            this.pendingRect = null;
        }
    }

    setDocumentStage(stage = 'translating') {
        if (!this.card) return;
        const map = {
            extracting: '正在提取文本…',
            translating: '正在翻译段落…',
            applying: '正在回填页面…',
            canceling: '正在取消…',
            canceled: '已取消',
            completed: '已完成'
        };
        const label = map[stage] || '处理中…';
        this.setTaskState(label, stage === 'completed' ? 'success' : 'info');
    }

    createCard() {
        if (this.card) return this.card;

        const el = document.createElement('div');
        el.className = 'card';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', '学术大拿翻译面板');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML = `
            <div class="header">
                <div class="brand">
                    <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z"/></svg>
                    <span>学术大拿</span>
                </div>
                <div class="controls">
                    <div class="select-group">
                        <select id="engineSelect">
                            <option value="google">Google</option>
                            <option value="deepseek">DeepSeek</option>
                            <option value="deepl">DeepL</option>
                            <option value="openai">OpenAI</option>
                            <option value="multi">Multi-Fusion</option>
                        </select>
                        <svg class="select-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
                    </div>
                    <div class="select-group">
                        <select id="domainSelect">
                            <option value="default">通用</option>
                            <option value="academic">学术</option>
                            <option value="medical">医学</option>
                            <option value="legal">法律</option>
                            <option value="technical">技术</option>
                        </select>
                        <svg class="select-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
                    </div>
                    <div class="select-group">
                        <select id="langSelect">
                            <option value="zh-CN">中文</option>
                            <option value="en">English</option>
                            <option value="ja">日本語</option>
                            <option value="ko">한국어</option>
                        </select>
                        <svg class="select-icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
                    </div>
                    <div class="lock-btn" title="锁定悬浮窗">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 15v2m-3 0h6m-6-3v-3a3 3 0 013-3h3a3 3 0 013 3v3m-6 0h6m-6 3v3a3 3 0 003 3h3a3 3 0 003-3v-3m-6 0h6"/>
                        </svg>
                    </div>
                    <div class="close-btn" title="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div>
                </div>
            </div>
            <div class="body-container"></div>
            <div class="action-bar">
                <button class="icon-btn ghost" id="btnRetry" title="重试">
                    <span>重试</span>
                </button>
                <button class="icon-btn ghost" id="btnCancelTask" title="取消任务" style="display:none;">
                    <span>取消</span>
                </button>
                <button class="icon-btn" id="btnCopy" title="Copy">
                     <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                </button>
            </div>
        `;

        this.shadow.appendChild(el);
        this.card = el;

        // Bind Events
        const header = el.querySelector('.header');
        DragHandler.makeDraggable(el, header);

        el.querySelector('.close-btn').onclick = () => this.hideCard();

        // Lock button functionality
        const lockBtn = el.querySelector('.lock-btn');
        if (lockBtn) {
            lockBtn.setAttribute('role', 'button');
            lockBtn.setAttribute('aria-label', '锁定悬浮窗');
            lockBtn.onclick = (e) => {
                e.stopPropagation(); // Prevent the click from bubbling up
                this.isLocked = !this.isLocked;
                this.updateLockButton();
            };
        }

        const engSel = el.querySelector('#engineSelect');
        const domainSel = el.querySelector('#domainSelect');
        const langSel = el.querySelector('#langSelect');
        const closeBtn = el.querySelector('.close-btn');
        if (engSel) engSel.setAttribute('aria-label', '翻译引擎');
        if (domainSel) domainSel.setAttribute('aria-label', '翻译领域');
        if (langSel) langSel.setAttribute('aria-label', '目标语言');
        if (closeBtn) {
            closeBtn.setAttribute('role', 'button');
            closeBtn.setAttribute('aria-label', '关闭翻译面板');
        }

        // Load Props
        engSel.value = this.engine;
        domainSel.value = this.domain || 'default';  // Default to 'default' domain
        langSel.value = this.targetLang;

        engSel.onchange = (e) => {
            this.engine = e.target.value;
            Utils.setSettings({ translationEngine: this.engine });
            this._triggerReTranslate();
            this.updateEngineDisplay();
        };

        domainSel.onchange = (e) => {
            this.domain = e.target.value;
            // No need to trigger re-translation for domain change alone
        };

        langSel.onchange = (e) => {
            this.targetLang = e.target.value;
            Utils.setSettings({ targetLang: this.targetLang });
            this._triggerReTranslate();
        };

        el.querySelector('#btnCopy').onclick = () => {
            const t = this.shadow.querySelector('textarea.target');
            if (t) {
                navigator.clipboard.writeText(t.value);
                this.showToast('已复制到剪贴板', 'success');
            }
        };

        const retryBtn = el.querySelector('#btnRetry');
        if (retryBtn) {
            retryBtn.setAttribute('aria-label', '重试翻译');
            retryBtn.onclick = () => this._triggerReTranslate();
        }

        const cancelBtn = el.querySelector('#btnCancelTask');
        if (cancelBtn) {
            cancelBtn.setAttribute('aria-label', '取消当前翻译任务');
            cancelBtn.onclick = () => {
                document.dispatchEvent(new CustomEvent('xiaoet:cancel-task', {
                    detail: { taskId: this.currentTaskId }
                }));
            };
        }

        // Update lock button initially (the lockBtn was already selected and assigned earlier)
        // Use setTimeout to ensure DOM is fully rendered before updating the button
        setTimeout(() => {
            this.updateLockButton();
        }, 0);

        // Also make sure the lock button has the correct initial state immediately
        this.updateLockButton();

        // Prevent click events inside the card from bubbling up and triggering the outside click handler
        this.card.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        return this.card;
    }

    hideCard() {
        if (this.card) {
            this.card.classList.remove('visible');
            setTimeout(() => {
                if (this.card) this.card.remove();
                this.card = null;
            }, 300);
        }
    }
    
    // Method to toggle lock state
    toggleLock() {
        this.isLocked = !this.isLocked;
        if (this.card) {
            this.updateLockButton();
        }
    }
    
    // Method to handle clicks outside the card
    setupClickOutsideHandler() {
        // Add document-level click handler to close when clicking outside
        document.addEventListener('click', (event) => {
            if (this.card && this.card.classList.contains('visible')) {
                // Check if the click is outside the card
                const isClickInsideCard = this.card.contains(event.target);
                const isClickOnTriggerIcon = event.target.closest('.trigger-icon') || event.target.classList.contains('trigger-icon');
                
                // Only close if not locked and clicked outside the card
                if (!this.isLocked && !isClickInsideCard && !isClickOnTriggerIcon) {
                    this.hideCard();
                }
            }
        });
        
        // Add escape key to close card
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.card && this.card.classList.contains('visible')) {
                this.hideCard();
            }
        });
    }

    _renderLoading() {
        const body = this.card.querySelector('.body-container');
        body.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <span class="pulse-text">Thinking...</span>
            </div>
        `;
    }

    _renderTranslation(original, translated, mode, isStreaming = false) {
        const body = this.card.querySelector('.body-container');
        
        // Different UI for different modes
        if (mode === 'ocr') {
            // Enhanced OCR-specific UI with image preview and better layout
            body.innerHTML = `
                <div class="ocr-container">
                    <div class="ocr-header">
                        <div class="ocr-title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                            </svg>
                            <span>图像文字识别</span>
                        </div>
                        <div class="ocr-actions">
                            <button id="btnSelectImage" class="btn-secondary" title="选择图片">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="17,8 12,3 7,8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                                选择图片
                            </button>
                        </div>
                    </div>
                    
                    <div class="ocr-image-preview" id="imagePreviewArea">
                        <div class="image-placeholder">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                <path d="M21 15l-5-5L5 21"></path>
                            </svg>
                            <p>点击"选择图片"按钮上传图像</p>
                        </div>
                        <img id="ocrImagePreview" style="display: none; max-width: 100%; max-height: 200px;" />
                    </div>
                    
                    <div class="ocr-process-area">
                        <div class="ocr-input-section">
                            <div class="io-label">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                                </svg>
                                <span>识别结果</span>
                            </div>
                            <textarea id="ocrSourceText" class="source" rows="3">${Utils.escapeHtml(original)}</textarea>
                        </div>
                        
                        <div class="ocr-translate-section">
                            <div class="io-label">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2L2 22h20L12 2zm0 3.5L19.5 20H4.5L12 5.5z"/>
                                </svg>
                                <span>AI翻译</span>
                                <div class="engine-indicator" title="当前翻译引擎">
                                    <span class="engine-badge">${this.engine.toUpperCase()}</span>
                                </div>
                            </div>
                            <div style="position:relative">
                                <textarea id="ocrTargetText" class="target" rows="3" readonly>${Utils.escapeHtml(translated)}</textarea>
                                ${isStreaming ? '<span class="cursor"></span>' : ''}
                            </div>
                        </div>
                    </div>
                    
                    <div class="ocr-footer">
                        <button id="btnOcrRecognize" class="btn-primary" title="执行OCR识别">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="11 19 2 12 11 5 11 19"></polygon>
                                <polygon points="22 19 13 12 22 5 22 19"></polygon>
                            </svg>
                            识别文字
                        </button>
                        <button id="btnOcrTranslate" class="btn-accent" title="翻译识别结果">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            翻译
                        </button>
                    </div>
                </div>
            `;
            
            // Add event listeners for OCR UI elements
            const selectImageButton = body.querySelector('#btnSelectImage');
            const recognizeButton = body.querySelector('#btnOcrRecognize');
            const translateButton = body.querySelector('#btnOcrTranslate');
            const imagePreview = body.querySelector('#ocrImagePreview');
            const sourceTextarea = body.querySelector('#ocrSourceText');
            const targetTextarea = body.querySelector('#ocrTargetText');
            
            if (selectImageButton) {
                selectImageButton.onclick = () => {
                    // Create file input element
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = 'image/*';
                    fileInput.onchange = (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                imagePreview.src = event.target.result;
                                imagePreview.style.display = 'block';
                                
                                const placeholder = body.querySelector('.image-placeholder');
                                if (placeholder) {
                                    placeholder.style.display = 'none';
                                }
                                
                                // Automatically trigger OCR recognition when image is loaded
                                setTimeout(() => {
                                    if (window.OCRTranslator && window.OCRTranslator.prototype && 
                                        typeof window.OCRTranslator.prototype.initialize === 'function') {
                                        // We won't auto-trigger OCR here to avoid issues
                                        // User will click the recognize button manually
                                    } else {
                                        sourceTextarea.value = "OCR功能需要初始化，请确保Tesseract.js库已正确加载";
                                    }
                                }, 300);
                            };
                            reader.readAsDataURL(file);
                        }
                    };
                    fileInput.click();
                };
            }
            
            if (recognizeButton) {
                recognizeButton.onclick = async () => {
                    if (window.OCRTranslator) {
                        try {
                            // Reuse shared OCR translator singleton across modules.
                            let ocrTranslatorInstance = window.__xiaoetOcrTranslator;
                            if (!ocrTranslatorInstance) {
                                ocrTranslatorInstance = new window.OCRTranslator();
                                window.__xiaoetOcrTranslator = ocrTranslatorInstance;
                            }
                            if (!ocrTranslatorInstance.isInitialized && typeof ocrTranslatorInstance.initialize === 'function') {
                                await ocrTranslatorInstance.initialize();
                            }
                            
                            if (imagePreview.src && (imagePreview.src.startsWith('blob:') || imagePreview.src.startsWith('data:image'))) {
                                this.showLoading(false); // Show loading without repositioning
                                
                                // Extract text from image using OCR
                                const result = await ocrTranslatorInstance.ocrAndTranslate(
                                    imagePreview.src, 
                                    this.targetLang || 'zh-CN', 
                                    this.engine || 'google'
                                );
                                
                                // Update source text area with OCR result
                                if (sourceTextarea) {
                                    sourceTextarea.value = result.original;
                                    this._autoResize(sourceTextarea);
                                }
                                
                                // Update target text area with translation
                                if (targetTextarea) {
                                    targetTextarea.value = result.translated;
                                    this._autoResize(targetTextarea);
                                }
                                
                                this.hideCard(); // Hide loading
                            } else {
                                this.showToast('请选择一张图片后再点击识别', 'warning');
                            }
                        } catch (error) {
                            console.error('OCR recognition failed:', error);
                            if (sourceTextarea) {
                                sourceTextarea.value = `OCR识别失败: ${error.message}`;
                            }
                        }
                    } else {
                            this.showToast('OCR功能不可用，请确保Tesseract.js库已正确加载', 'error');
                    }
                };
            }
            
            if (translateButton && sourceTextarea && targetTextarea) {
                translateButton.onclick = () => {
                    const sourceText = sourceTextarea.value.trim();
                    if (sourceText) {
                        // Trigger re-translation with the OCR text
                        document.dispatchEvent(new CustomEvent('xiaoet:retranslate', {
                            detail: { 
                                text: sourceText, 
                                engine: this.engine, 
                                targetLang: this.targetLang 
                            }
                        }));
                    }
                };
            }
        } else if (mode === 'document') {
            // Document translation UI
            body.innerHTML = `
                <div class="io-container">
                    <div class="io-label">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                        </svg>
                        <span>文档翻译</span>
                    </div>
                    <div class="document-translation-controls">
                        <button class="document-translation-btn" id="btnCancelDocument">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="15" y1="9" x2="9" y2="15"/>
                                <line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                            取消翻译
                        </button>
                        <button class="document-translation-btn" id="btnRestoreOriginal">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                                <path d="M3 3v5h5"/>
                            </svg>
                            恢复原文
                        </button>
                        <button class="document-translation-btn" id="btnExport">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7,10 12,15 17,10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            导出翻译
                        </button>
                    </div>
                    <div class="progress-bar">
                        <div class="progress" id="document-progress"></div>
                    </div>
                </div>
            `;
            
            // Add event listeners for document translation controls
            const restoreBtn = body.querySelector('#btnRestoreOriginal');
            const exportBtn = body.querySelector('#btnExport');
            const cancelBtn = body.querySelector('#btnCancelDocument');

            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    document.dispatchEvent(new CustomEvent('xiaoet:cancel-document'));
                };
            }
            
            if (restoreBtn) {
                restoreBtn.onclick = () => {
                    document.dispatchEvent(new CustomEvent('xiaoet:restore-document'));
                };
            }
            
            if (exportBtn) {
                exportBtn.onclick = () => {
                    document.dispatchEvent(new CustomEvent('xiaoet:export-document'));
                };
            }
        } else {
            // Default translation UI
            body.innerHTML = `
                <div class="io-container">
                    <div class="io-label">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 3h18v18H3z"/>
                        </svg>
                        <span>原文</span>
                        <button id="btnSwap" class="swap-btn" title="交换原文和译文">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M8 7l4-4 4 4"/>
                                <path d="M12 21V3"/>
                                <path d="M16 17l-4 4-4-4"/>
                            </svg>
                        </button>
                    </div>
                    <textarea class="source" rows="1">${Utils.escapeHtml(original)}</textarea>
                </div>
                <div class="io-container target-box">
                    <div class="io-label">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2L2 22h20L12 2zm0 3.5L19.5 20H4.5L12 5.5z"/>
                        </svg>
                        <span>AI翻译</span>
                        <div class="engine-indicator" title="当前翻译引擎">
                            <span class="engine-badge">${this.engine.toUpperCase()}</span>
                        </div>
                    </div>
                    <div style="position:relative">
                        <textarea class="target" rows="1" readonly>${Utils.escapeHtml(translated)}</textarea>
                        ${isStreaming ? '<span class="cursor"></span>' : ''}
                    </div>
                </div>
            `;
        }

        // Common functionality for default mode
        if (mode !== 'document') {
            const src = body.querySelector('.source');
            const tgt = body.querySelector('.target');

            if (src && tgt) {
                this._autoResize(src);
                this._autoResize(tgt);

                // Add swap functionality
                const swapBtn = body.querySelector('#btnSwap');
                if (swapBtn) {
                    swapBtn.onclick = () => {
                        const originalValue = src.value;
                        const translatedValue = tgt.value;

                        src.value = translatedValue;
                        tgt.value = originalValue;

                        this._autoResize(src);
                        this._autoResize(tgt);

                        // Trigger re-translation with swapped content
                        this.engine = this.engine; // Keep current engine
                        document.dispatchEvent(new CustomEvent('xiaoet:retranslate', {
                            detail: { text: src.value.trim(), engine: this.engine, targetLang: this.targetLang }
                        }));
                    };
                }

                src.oninput = () => {
                    this._autoResize(src);
                    // Enable real-time translation with debounce
                    if (this._debouncedTranslate) {
                        clearTimeout(this._debouncedTranslate);
                    }
                    this._debouncedTranslate = setTimeout(() => {
                        if (src.value.trim() !== '') {
                            document.dispatchEvent(new CustomEvent('xiaoet:retranslate', {
                                detail: { text: src.value.trim(), engine: this.engine, targetLang: this.targetLang }
                            }));
                        }
                    }, 900); // 900ms delay for real-time translation
                };

                src.onkeydown = (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this._triggerReTranslate();
                    }
                };
            }
        }
    }

    _autoResize(el) {
        if (!this._resizePending) {
            this._resizePending = new Set();
            requestAnimationFrame(() => {
                for (const target of this._resizePending) {
                    target.style.height = 'auto';
                    target.style.height = Math.min(target.scrollHeight, 300) + 'px';
                }
                this._resizePending = null;
            });
        }
        this._resizePending.add(el);
    }

    _triggerReTranslate() {
        const src = this.shadow.querySelector('textarea.source');
        if (src && src.value.trim()) {
            // Sanitize input before dispatching event
            const sanitizedText = this._sanitizeText(src.value.trim());
            
            // Dispatch event to Main
            document.dispatchEvent(new CustomEvent('xiaoet:retranslate', {
                detail: { text: sanitizedText, engine: this.engine, targetLang: this.targetLang }
            }));
        }
    }
    
    // Sanitize text to prevent XSS
    _sanitizeText(text) {
        if (!text || typeof text !== 'string') return '';
        
        // Basic HTML entity encoding to prevent XSS
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }
    
    // Update the engine badge display
    updateEngineDisplay() {
        const engineBadge = this.shadow.querySelector('.engine-badge');
        if (engineBadge) {
            engineBadge.textContent = this.engine.toUpperCase();
        }
    }
    
    // Update the lock button display
    updateLockButton() {
        if (!this.card) return; // Ensure card exists
        
        const lockBtn = this.card.querySelector('.lock-btn');
        if (lockBtn) {
            const svg = lockBtn.querySelector('svg');
            if (svg) {
                // Clear existing paths
                while (svg.firstChild) {
                    svg.removeChild(svg.firstChild);
                }

                if (this.isLocked) {
                    // Locked icon - a closed padlock
                    svg.innerHTML = `
                        <path d="M16 10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h8Z"/>
                        <path d="M12 15v-3m-2 3h4M8 10V7a4 4 0 1 1 8 0v3"/>
                    `;
                    lockBtn.title = '解锁悬浮窗';
                    lockBtn.setAttribute('aria-label', '解锁悬浮窗');
                    // Add visual feedback for locked state
                    lockBtn.style.backgroundColor = 'var(--primary)';
                    lockBtn.style.color = 'white';
                } else {
                    // Unlocked icon - an open padlock
                    svg.innerHTML = `
                        <path d="M16 10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h8Z"/>
                        <path d="M10 10V7a4 4 0 1 1 4 0v3"/>
                    `;
                    lockBtn.title = '锁定悬浮窗';
                    lockBtn.setAttribute('aria-label', '锁定悬浮窗');
                    // Reset to default style when unlocked
                    lockBtn.style.backgroundColor = '';
                    lockBtn.style.color = '';
                }
            }
        }
    }

    /**
     * Show an error message in the translation card.
     */
    showError(errorMessage) {
        const errorObj = (errorMessage && typeof errorMessage === 'object')
            ? errorMessage
            : { message: String(errorMessage || '任务失败') };
        const advice = errorObj.advice ? `<div class="error-advice">${Utils.escapeHtml(errorObj.advice)}</div>` : '';

        this.createCard();
        this.setTaskState('任务失败', 'error');
        const body = this.card.querySelector('.body-container');
        body.innerHTML = `
            <div class="error-state">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <div class="error-message">${Utils.escapeHtml(errorObj.message || '任务失败')}</div>
                ${advice}
                <div class="error-actions">
                    <button class="error-action" id="btnRetryNow">重试</button>
                    <button class="error-action" id="btnOpenSettings">打开设置</button>
                </div>
            </div>
        `;
        this.card.classList.add('visible');
        if (!this.card.hasAttribute('data-msg-positioned')) {
            this.positionCard(this.pendingRect);
            this.pendingRect = null;
        }

        const settingsBtn = body.querySelector('#btnOpenSettings');
        const retryBtn = body.querySelector('#btnRetryNow');
        if (retryBtn) {
            retryBtn.onclick = () => this._triggerReTranslate();
        }
        if (settingsBtn) {
            settingsBtn.onclick = () => {
                if (typeof Utils !== 'undefined' && Utils.isExtensionContextValid()) {
                    chrome.runtime.openOptionsPage();
                }
            };
        }
    }

    /**
     * Show detected source language in the card header.
     */
    _showLangInfo(detectedLang) {
        if (!this.card) return;
        const LANG_NAMES = {
            'zh': '中文', 'en': 'EN', 'ja': '日本語', 'ko': '한국어',
            'de': 'DE', 'fr': 'FR', 'es': 'ES', 'ru': 'RU', 'ar': 'AR',
            'pt': 'PT', 'it': 'IT'
        };
        const langCode = typeof detectedLang === 'string' ? detectedLang.split('-')[0] : '';
        const langName = LANG_NAMES[langCode] || langCode.toUpperCase();

        const header = this.card.querySelector('.header .brand');
        if (header && langName) {
            // Remove existing lang-info if any
            const existing = header.querySelector('.lang-info');
            if (existing) existing.remove();

            const langEl = document.createElement('span');
            langEl.className = 'lang-info';
            langEl.textContent = `${langName} → ${LANG_NAMES[this.targetLang.split('-')[0]] || this.targetLang}`;
            header.appendChild(langEl);
        }
    }

    /**
     * Show a notice when the engine fell back to a different one.
     */
    _showFallbackNotice(fallbackEngine) {
        if (!this.card) return;
        const body = this.card.querySelector('.body-container');
        if (!body) return;

        // Remove existing notice if any
        const existing = body.querySelector('.fallback-notice');
        if (existing) existing.remove();

        const notice = document.createElement('div');
        notice.className = 'fallback-notice';
        notice.innerHTML = `⚠ 已降级至 ${Utils.escapeHtml(fallbackEngine.toUpperCase())} 引擎`;
        body.insertBefore(notice, body.firstChild);
    }

    /**
     * Update document translation progress bar.
     */
    updateProgress(percent) {
        if (!this.card) return;
        const bar = this.card.querySelector('#document-progress');
        if (bar) {
            bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        }
        const pulseText = this.card.querySelector('.pulse-text');
        if (pulseText) {
            pulseText.textContent = `翻译中... ${Math.round(percent)}%`;
        }
    }

    positionCard(rectInfo = null) {
        if (!this.card) return;

        let rect = rectInfo;
        const sel = window.getSelection();

        if (!rect) {
            if (sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                rect = range.getBoundingClientRect();
            }
        }

        const cardWidth = 480;
        const cardHeight = 300;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 10;
        let top = 100, left = 100;

        if (rect && (rect.width > 0 || rect.height > 0)) {
            left = rect.left + (rect.width / 2) - (cardWidth / 2);
            top = rect.bottom + 12;

            // Horizontal bounds
            if (left < margin) left = margin;
            if (left + cardWidth > vw - margin) left = vw - cardWidth - margin;

            // Vertical: if card would overflow bottom, flip above selection
            if (top + cardHeight > vh - margin) {
                top = rect.top - cardHeight - 12;
            }
            // If flipped above also overflows top, just pin to top
            if (top < margin) top = margin;
        }

        this.card.style.left = `${left}px`;
        this.card.style.top = `${top}px`;
        this.card.setAttribute('data-msg-positioned', 'true');
    }

    // Icon logic
    showIcon(x, y, onClick) {
        if (x <= 5 && y <= 5) return; // Fix: Prevent stuck in top-left corner
        if (this.icon) this.icon.remove();

        this.icon = document.createElement('div');
        this.icon.className = 'trigger-icon';
        this.icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>`;

        Object.assign(this.icon.style, {
            left: `${x + 12}px`, top: `${y + 12}px`
        });

        this.icon.onmousedown = (e) => e.stopPropagation(); // prevent closing immediately
        this.icon.onclick = (e) => {
            e.stopPropagation();
            this.hideIcon();
            onClick();
        };

        this.shadow.appendChild(this.icon);

        // Animate in
        requestAnimationFrame(() => this.icon.classList.add('visible'));
    }

    hideIcon() {
        if (this.icon) {
            this.icon.classList.remove('visible');
            setTimeout(() => { if (this.icon) this.icon.remove(); this.icon = null; }, 300);
        }
    }
}

// Add event listeners for document translation
document.addEventListener('xiaoet:restore-document', () => {
    if (typeof Utils !== 'undefined' && Utils.isExtensionContextValid()) {
        chrome.runtime.sendMessage({ type: 'TRIGGER_RESTORE_DOCUMENT' });
    }
});

document.addEventListener('xiaoet:export-document', () => {
    if (typeof Utils !== 'undefined' && Utils.isExtensionContextValid()) {
        chrome.runtime.sendMessage({ type: 'TRIGGER_EXPORT_DOCUMENT' });
    }
});

// Export to window for browser extension
window.TranslatorUI = TranslatorUI;
