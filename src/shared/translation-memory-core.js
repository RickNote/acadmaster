(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TranslationMemoryCore = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    function normalizeTMText(text) {
        return String(text || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201c\u201d]/g, '"')
            .trim();
    }

    function bigramDiceSimilarity(a, b) {
        if (!a || !b) return 0;
        if (a === b) return 1;
        if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

        const gramsA = new Map();
        for (let i = 0; i < a.length - 1; i++) {
            const g = a.slice(i, i + 2);
            gramsA.set(g, (gramsA.get(g) || 0) + 1);
        }

        let intersection = 0;
        let gramsBCount = 0;
        for (let i = 0; i < b.length - 1; i++) {
            const g = b.slice(i, i + 2);
            gramsBCount++;
            const count = gramsA.get(g) || 0;
            if (count > 0) {
                intersection++;
                gramsA.set(g, count - 1);
            }
        }

        const gramsACount = Math.max(a.length - 1, 0);
        const denom = gramsACount + gramsBCount;
        return denom > 0 ? (2 * intersection) / denom : 0;
    }

    function calcTMSimilarity(queryNorm, candidateNorm) {
        if (!queryNorm || !candidateNorm) return 0;
        if (queryNorm === candidateNorm) return 1;
        const dice = bigramDiceSimilarity(queryNorm, candidateNorm);
        const includeBoost = (queryNorm.includes(candidateNorm) || candidateNorm.includes(queryNorm))
            ? Math.min(queryNorm.length, candidateNorm.length) / Math.max(queryNorm.length, candidateNorm.length)
            : 0;
        return Math.max(dice, includeBoost);
    }

    return {
        normalizeTMText,
        bigramDiceSimilarity,
        calcTMSimilarity
    };
});
