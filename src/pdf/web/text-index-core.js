(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TextIndexCore = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    function normalizeText(text) {
        return String(text || '').toLowerCase();
    }

    function buildContextSnippet(items, centerIndex, maxChars) {
        const limit = Number(maxChars || 120);
        if (!Array.isArray(items) || centerIndex < 0 || centerIndex >= items.length) return '';
        const left = Math.max(0, centerIndex - 3);
        const right = Math.min(items.length - 1, centerIndex + 3);
        let snippet = items.slice(left, right + 1)
            .map(t => String(t || '').trim())
            .filter(Boolean)
            .join(' ');
        if (snippet.length > limit) snippet = `${snippet.slice(0, limit - 1)}…`;
        return snippet;
    }

    function searchInPage(items, query, page) {
        const q = normalizeText(query).trim();
        if (!q || !Array.isArray(items)) return [];
        const results = [];
        let indexInPage = 0;
        items.forEach((item, idx) => {
            const text = normalizeText(item);
            if (!text || !text.includes(q)) return;
            indexInPage += 1;
            results.push({
                page,
                indexInPage,
                snippet: buildContextSnippet(items, idx, 120)
            });
        });
        return results;
    }

    return {
        normalizeText,
        buildContextSnippet,
        searchInPage
    };
});
