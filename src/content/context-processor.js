/**
 * context-processor.js
 * Advanced context processing for intelligent translation
 */

(function() {
    'use strict';

    try {
        // Block-level tag names that don't require getComputedStyle
        const BLOCK_TAGS = new Set([
            'P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
            'MAIN', 'ASIDE', 'BLOCKQUOTE', 'LI', 'DD', 'DT',
            'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY', 'TABLE',
            'FORM', 'FIELDSET', 'ADDRESS', 'PRE', 'HR'
        ]);

        class ContextProcessor {
            constructor() {
                this.maxContextLength = 2000;
                this.maxParagraphs = 10;
                this.cache = new Map();
                this.cacheMaxSize = 100;
            }

            async extractContext(selection, options = {}) {
                const {
                    includeParagraphs = true,
                    includeHeaders = true,
                    includeAdjacentElements = true,
                    maxLength = this.maxContextLength
                } = options;

                const cacheKey = this.generateCacheKey(selection.toString(), options);

                if (this.cache.has(cacheKey)) {
                    return this.cache.get(cacheKey);
                }

                let context = '';

                try {
                    if (includeParagraphs) {
                        context += this.extractParagraphContext(selection) + '\n\n';
                    }

                    if (includeHeaders) {
                        context += this.extractHeaderContext(selection) + '\n\n';
                    }

                    if (includeAdjacentElements) {
                        context += this.extractAdjacentContext(selection) + '\n\n';
                    }

                    context = context.substring(0, maxLength).trim();
                    this.addToCache(cacheKey, context);

                } catch (error) {
                    console.warn('Error extracting context:', error);
                    context = this.basicContextExtraction(selection);
                }

                return context;
            }

            extractParagraphContext(selection) {
                if (!selection || selection.rangeCount === 0) return '';

                const range = selection.getRangeAt(0);
                if (!range) return '';

                let context = '';
                const selectedElement = this.findContainingBlockElement(range.commonAncestorContainer);

                if (selectedElement) {
                    const siblings = this.getSiblingsWithinLimit(selectedElement, this.maxParagraphs);

                    for (const sibling of siblings) {
                        const text = sibling.textContent || sibling.innerText || '';
                        if (text.trim().length > 10) {
                            context += text.trim() + ' ';
                        }
                    }
                }

                return context.substring(0, this.maxContextLength);
            }

            extractHeaderContext(selection) {
                if (!selection || selection.rangeCount === 0) return '';

                const range = selection.getRangeAt(0);
                if (!range) return '';

                let context = '';
                const selectedElement = this.findContainingBlockElement(range.commonAncestorContainer);

                if (selectedElement) {
                    const headings = this.findNearbyHeadings(selectedElement);
                    for (const heading of headings) {
                        context += heading.textContent.trim() + ' ';
                    }
                }

                return context.substring(0, 500);
            }

            extractAdjacentContext(selection) {
                if (!selection || selection.rangeCount === 0) return '';

                const range = selection.getRangeAt(0);
                if (!range) return '';

                let context = '';
                const selectedElement = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
                    ? range.commonAncestorContainer
                    : range.commonAncestorContainer.parentElement;

                if (selectedElement) {
                    const prevSibling = selectedElement.previousElementSibling;
                    const nextSibling = selectedElement.nextElementSibling;

                    if (prevSibling) {
                        context += (prevSibling.textContent || '').substring(0, 300) + ' ';
                    }
                    if (nextSibling) {
                        context += (nextSibling.textContent || '').substring(0, 300) + ' ';
                    }
                    // Only include parent text if it's short (to avoid duplicating entire page)
                    if (selectedElement.parentElement) {
                        const parentText = selectedElement.parentElement.textContent || '';
                        if (parentText.length < 800) {
                            context += parentText.substring(0, 400);
                        }
                    }
                }

                return context.substring(0, 800);
            }

            /**
             * Find the nearest block-level ancestor.
             * Checks tagName first (no reflow); only calls getComputedStyle as a fallback.
             */
            findContainingBlockElement(node) {
                let current = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

                while (current && current !== document.body) {
                    // Fast path: known block-level tags
                    if (BLOCK_TAGS.has(current.tagName)) {
                        return current;
                    }

                    // Slow path: check computed style only when needed
                    try {
                        const display = window.getComputedStyle(current).display;
                        if (display === 'block' || display === 'flex' || display === 'grid' ||
                            display === 'table' || display === 'list-item') {
                            return current;
                        }
                    } catch (e) {
                        // getComputedStyle can fail on detached nodes
                    }

                    current = current.parentElement;
                }

                return document.body;
            }

            getSiblingsWithinLimit(element, limit) {
                const siblings = [];
                let current = element.previousElementSibling;
                let count = 0;

                while (current && count < limit / 2) {
                    siblings.unshift(current);
                    current = current.previousElementSibling;
                    count++;
                }

                siblings.push(element);
                count = 0;

                current = element.nextElementSibling;
                while (current && count < limit / 2) {
                    siblings.push(current);
                    current = current.nextElementSibling;
                    count++;
                }

                return siblings;
            }

            /**
             * Find headings near an element, traversing at most 5 levels up.
             */
            findNearbyHeadings(element) {
                const headings = [];
                let current = element;
                let depth = 0;
                const maxDepth = 5;

                while (current && current !== document.body && headings.length < 3 && depth < maxDepth) {
                    if (current.parentElement) {
                        // Only query direct children headings to avoid massive querySelectorAll
                        for (const child of current.parentElement.children) {
                            if (/^H[1-6]$/.test(child.tagName) && !headings.includes(child)) {
                                headings.push(child);
                                if (headings.length >= 3) break;
                            }
                        }
                    }

                    current = current.parentElement;
                    depth++;
                }

                return headings;
            }

            basicContextExtraction(selection) {
                if (!selection || selection.rangeCount === 0) return '';

                const range = selection.getRangeAt(0);
                if (!range) return '';

                try {
                    const contextRange = range.cloneRange();
                    const startContainer = range.startContainer;
                    const startOffset = range.startOffset;

                    try {
                        if (startContainer.nodeType === Node.TEXT_NODE) {
                            const contextStart = Math.max(0, startOffset - 500);
                            contextRange.setStart(startContainer, contextStart);
                        }
                    } catch (e) {
                        // Could not expand range
                    }

                    return contextRange.toString().substring(0, 1000);
                } catch (e) {
                    return '';
                }
            }

            /**
             * Hash full text for cache key, not just first 100 chars.
             */
            generateCacheKey(text, options) {
                const hashFn = (typeof Utils !== 'undefined' && Utils.simpleHash)
                    ? Utils.simpleHash
                    : this._fallbackHash;
                const textHash = hashFn(text);
                const optionsHash = hashFn(JSON.stringify(options));
                return `${textHash}_${optionsHash}`;
            }

            _fallbackHash(str) {
                let hash = 5381;
                for (let i = 0; i < str.length; i++) {
                    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
                }
                return Math.abs(hash).toString(36);
            }

            addToCache(key, value) {
                if (this.cache.size >= this.cacheMaxSize) {
                    const firstKey = this.cache.keys().next().value;
                    this.cache.delete(firstKey);
                }
                this.cache.set(key, value);
            }

            clearCache() {
                this.cache.clear();
            }
        }

        window.ContextProcessor = ContextProcessor;

    } catch (error) {
        console.error('FATAL ERROR in context-processor.js:', error);
    }
})();
