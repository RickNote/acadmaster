/**
 * adapter.js
 * Content adaptation module for various website types
 */

class ContentAdapter {
    constructor() {
        this.siteConfigs = {
            // Academic paper sites
            'arxiv.org': {
                selectors: ['.abstract', '.dateline', '.authors'],
                preprocess: (text) => this.preprocessArxiv(text),
                postprocess: (text) => this.postprocessAcademic(text)
            },
            'sciencedirect.com': {
                selectors: ['.abstract', '.keywords', 'article'],
                preprocess: (text) => this.preprocessScienceDirect(text),
                postprocess: (text) => this.postprocessAcademic(text)
            },
            'springer.com': {
                selectors: ['.Abstract', '.Keyword', 'article'],
                preprocess: (text) => this.preprocessSpringer(text),
                postprocess: (text) => this.postprocessAcademic(text)
            },
            'nature.com': {
                selectors: ['.c-article-section__content', '.Abs', '.Article'],
                preprocess: (text) => this.preprocessNature(text),
                postprocess: (text) => this.postprocessAcademic(text)
            },
            'ieee.org': {
                selectors: ['.abstract-text', '.abstract-plus', '.document-content'],
                preprocess: (text) => this.preprocessIEEE(text),
                postprocess: (text) => this.postprocessAcademic(text)
            },
            // Social media
            'twitter.com': {
                selectors: ['[data-testid="tweetText"]', '.tweet-text'],
                preprocess: (text) => this.preprocessSocial(text),
                postprocess: (text) => text
            },
            'facebook.com': {
                selectors: ['[data-ad-comet-preview="message"]', '[role="feed"]'],
                preprocess: (text) => this.preprocessSocial(text),
                postprocess: (text) => text
            },
            // News sites — use semantic selectors, not CSS-in-JS class hashes
            'nytimes.com': {
                selectors: ['article p', '.story-body-text', 'section[name="articleBody"]'],
                preprocess: (text) => this.preprocessNews(text),
                postprocess: (text) => text
            },
            'bbc.com': {
                selectors: ['article p', '[data-component="text-block"]', 'main p'],
                preprocess: (text) => this.preprocessNews(text),
                postprocess: (text) => text
            },
            // Generic sites
            'default': {
                selectors: ['article', 'main', '[role="main"]', '.content', '#content'],
                preprocess: (text) => this.preprocessGeneric(text),
                postprocess: (text) => text
            }
        };
    }

    detectSite() {
        const hostname = window.location.hostname;

        for (const [site, config] of Object.entries(this.siteConfigs)) {
            if (site !== 'default' && hostname.includes(site)) {
                return config;
            }
        }

        return this.siteConfigs.default;
    }

    preprocessArxiv(text) {
        text = text.replace(/Abstract:\s*/, '');
        text = text.replace(/\[Submitted on.*?\]/g, '');
        return text.trim();
    }

    preprocessScienceDirect(text) {
        text = text.replace(/Abstract(.*)Keywords:/is, '$1');
        return text.trim();
    }

    preprocessSpringer(text) {
        text = text.replace(/Abstract(.*)Keywords/is, '$1');
        return text.trim();
    }

    preprocessNature(text) {
        text = text.replace(/Abstract(.*)Introduction/is, '$1');
        return text.trim();
    }

    preprocessIEEE(text) {
        text = text.replace(/Abstract\.\s*/, '');
        return text.trim();
    }

    preprocessSocial(text) {
        text = text.replace(/@\w+/g, '');
        text = text.replace(/#\w+/g, '');
        text = text.replace(/https?:\/\/\S+/g, '');
        return text.trim();
    }

    preprocessNews(text) {
        text = text.replace(/\(CNN\)|\(AP\)|\(Reuters\)/g, '');
        return text.trim();
    }

    preprocessGeneric(text) {
        text = text.replace(/\s+/g, ' ');
        return text.trim();
    }

    postprocessAcademic(text) {
        text = text.replace(/\[(\d+)\]/g, '[$1]');
        return text;
    }

    extractContent() {
        const config = this.detectSite();
        let content = '';

        for (const selector of config.selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                if (this.isLikelyUIElement(element)) continue;

                const text = element.textContent || element.innerText || '';
                if (text && text.length > 20) {
                    content += text + '\n\n';
                }
            }

            if (content) break;
        }

        return config.preprocess ? config.preprocess(content) : content;
    }

    /**
     * Check if an element is likely a UI control.
     * Handles SVG elements where className is an SVGAnimatedString.
     */
    isLikelyUIElement(element) {
        const uiClassNames = [
            'button', 'btn', 'nav', 'navigation', 'menu', 'footer',
            'header', 'sidebar', 'advertisement', 'ad', 'cookie',
            'modal', 'popup', 'overlay', 'tooltip', 'dropdown'
        ];

        const rawClassName = element.className;
        const className = (typeof rawClassName === 'string' ? rawClassName : (rawClassName?.baseVal || '')).toLowerCase();
        const tagName = element.tagName.toLowerCase();

        for (const name of uiClassNames) {
            if (className.includes(name)) return true;
        }

        return ['nav', 'footer', 'header', 'aside'].includes(tagName);
    }

    adaptContentForPageType() {
        const url = window.location.href;

        if (url.includes('pdf') || document.querySelector('embed[type="application/pdf"]') ||
            document.querySelector('object[type="application/pdf"]')) {
            return this.handlePdfContent();
        }

        if (this.isAcademicPaperPage()) {
            return this.extractAcademicContent();
        }

        return this.extractContent();
    }

    isAcademicPaperPage() {
        const title = document.title.toLowerCase();

        const academicIndicators = [
            'paper', 'research', 'journal', 'conference', 'proceedings',
            'academic', 'scholarly', 'thesis', 'dissertation'
        ];

        for (const indicator of academicIndicators) {
            if (title.includes(indicator)) return true;
        }

        const metaKeywords = document.querySelector('meta[name="keywords"]');
        if (metaKeywords && metaKeywords.content.toLowerCase().includes('paper')) {
            return true;
        }

        return false;
    }

    extractAcademicContent() {
        let content = '';

        const academicSelectors = [
            '.abstract', '.Abstract', '[class*="abstract"]',
            '.introduction', '[class*="introduction"]',
            '.methodology', '[class*="method"]',
            '.conclusion', '[class*="conclusion"]',
            '.results', '[class*="result"]',
            '.discussion', '[class*="discuss"]',
            'article', '.article-body', '.content'
        ];

        const seen = new Set();

        for (const selector of academicSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                if (this.isLikelyUIElement(element)) continue;
                if (seen.has(element)) continue;
                seen.add(element);

                const text = element.textContent || element.innerText || '';
                if (text && text.length > 50) {
                    content += this.cleanAcademicText(text) + '\n\n';
                }
            }
        }

        return content.trim();
    }

    cleanAcademicText(text) {
        text = text.replace(/\s*\[\d+\]\s*/g, ' ');
        text = text.replace(/\s+/g, ' ');
        text = text.replace(/^\s*\d+\s*$/, '');
        return text.trim();
    }

    handlePdfContent() {
        return "PDF content detected. Academic viewer will handle this content appropriately.";
    }

    getContextAroundSelection(selection) {
        if (!selection || selection.rangeCount === 0) return '';

        const range = selection.getRangeAt(0);
        if (!range) return '';

        try {
            const contextRange = range.cloneRange();

            const startContainer = range.startContainer;
            const startOffset = range.startOffset;
            const endContainer = range.endContainer;
            const endOffset = range.endOffset;

            try {
                if (startContainer.nodeType === Node.TEXT_NODE) {
                    const contextStart = Math.max(0, startOffset - 300);
                    contextRange.setStart(startContainer, contextStart);
                } else {
                    let prevSibling = startContainer.previousSibling;
                    let charsCollected = 0;

                    while (prevSibling && charsCollected < 300) {
                        if (prevSibling.nodeType === Node.TEXT_NODE) {
                            const text = prevSibling.textContent;
                            const needed = 300 - charsCollected;
                            const start = Math.max(0, text.length - needed);
                            contextRange.setStart(prevSibling, start);
                            charsCollected += (text.length - start);
                        }
                        prevSibling = prevSibling.previousSibling;
                    }
                }
            } catch (e) {
                console.debug('Could not expand context range backward:', e);
            }

            try {
                if (endContainer.nodeType === Node.TEXT_NODE) {
                    const contextEnd = Math.min(endOffset + 300, endContainer.textContent.length);
                    contextRange.setEnd(endContainer, contextEnd);
                } else {
                    let nextSibling = endContainer.nextSibling;
                    let charsCollected = 0;

                    while (nextSibling && charsCollected < 300) {
                        if (nextSibling.nodeType === Node.TEXT_NODE) {
                            const text = nextSibling.textContent;
                            const needed = 300 - charsCollected;
                            const end = Math.min(needed, text.length);
                            contextRange.setEnd(nextSibling, end);
                            charsCollected += end;
                        }
                        nextSibling = nextSibling.nextSibling;
                    }
                }
            } catch (e) {
                console.debug('Could not expand context range forward:', e);
            }

            const contextText = contextRange.toString().substring(0, 600);
            return contextText;
        } catch (e) {
            console.debug('Could not extract context:', e);
            return '';
        }
    }
}

// Export to window for browser extension
window.ContentAdapter = ContentAdapter;
