/**
 * utils.js
 * Helper functions
 */

const Utils = {
    /**
     * Check if the extension context is still valid.
     * Returns false after extension reload/update when old content scripts linger.
     */
    isExtensionContextValid: () => {
        try {
            return !!(chrome && chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    },

    escapeHtml: (text) => {
        if (!text) return "";
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#x27;");
    },

    debounce: (func, wait, immediate = false) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func.apply(this, args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(this, args);
        };
    },

    throttle: (func, limit) => {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    uid: () => {
        if (window.crypto && window.crypto.getRandomValues) {
            const array = new Uint32Array(2);
            window.crypto.getRandomValues(array);
            return array[0].toString(36) + array[1].toString(36);
        }
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    getSettings: (keys, callback) => {
        if (!Utils.isExtensionContextValid()) {
            if (typeof callback === 'function') {
                const defaultItems = {};
                if (Array.isArray(keys)) {
                    keys.forEach(key => defaultItems[key] = '');
                } else if (typeof keys === 'object') {
                    Object.assign(defaultItems, keys);
                }
                callback(defaultItems);
            }
            return;
        }
        chrome.storage.local.get(keys, (items) => {
            if (chrome.runtime.lastError) {
                console.error('Storage get error:', chrome.runtime.lastError);
                if (typeof callback === 'function') {
                    const defaultItems = {};
                    if (Array.isArray(keys)) {
                        keys.forEach(key => defaultItems[key] = '');
                    } else if (typeof keys === 'object') {
                        Object.assign(defaultItems, keys);
                    }
                    callback(defaultItems);
                }
            } else if (typeof callback === 'function') {
                callback(items);
            }
        });
    },

    setSettings: (items) => {
        if (!Utils.isExtensionContextValid()) return;
        chrome.storage.local.set(items, () => {
            if (chrome.runtime.lastError) {
                console.error('Storage set error:', chrome.runtime.lastError);
            }
        });
    },

    truncateString: (str, maxLength = 10000) => {
        if (!str || typeof str !== 'string') return '';
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    },

    /**
     * Sanitize HTML by removing dangerous elements and attributes.
     * Uses DOMParser for reliable parsing instead of regex.
     */
    validateAndSanitize: (text, maxLength = 10000) => {
        if (!text || typeof text !== 'string') return '';
        try {
            const doc = new DOMParser().parseFromString(text, 'text/html');
            // Remove dangerous elements
            const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form', 'link', 'style'];
            for (const tag of dangerousTags) {
                const els = doc.querySelectorAll(tag);
                els.forEach(el => el.remove());
            }
            // Remove event handler attributes from all elements
            const allEls = doc.querySelectorAll('*');
            allEls.forEach(el => {
                for (const attr of Array.from(el.attributes)) {
                    if (attr.name.startsWith('on') || attr.value.trim().toLowerCase().startsWith('javascript:')) {
                        el.removeAttribute(attr.name);
                    }
                }
            });
            const sanitized = doc.body.textContent || '';
            return Utils.truncateString(sanitized, maxLength);
        } catch (e) {
            // Fallback: strip all HTML tags
            const stripped = text.replace(/<[^>]*>/g, '');
            return Utils.truncateString(stripped, maxLength);
        }
    },

    /**
     * djb2 hash — processes the FULL string.
     */
    simpleHash: (str) => {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
        }
        return Math.abs(hash).toString(36);
    },

    getObjectSize: (obj) => {
        try {
            const str = JSON.stringify(obj);
            return new Blob([str]).size;
        } catch (e) {
            return 0;
        }
    },

    formatBytes: (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
};

// Export to window for browser extension
window.Utils = Utils;
