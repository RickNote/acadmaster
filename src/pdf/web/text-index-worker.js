/* global importScripts, postMessage */
importScripts('./text-index-core.js');

const state = {
    totalPages: 0,
    indexedPages: new Set(),
    pageItems: new Map()
};

self.onmessage = function (event) {
    const { type, data } = event.data || {};

    if (type === 'INIT') {
        state.totalPages = Number(data?.totalPages || 0);
        state.indexedPages.clear();
        state.pageItems.clear();
        postProgress();
        return;
    }

    if (type === 'INDEX_PAGE') {
        const page = Number(data?.page || 0);
        if (!page) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        state.pageItems.set(page, items);
        state.indexedPages.add(page);
        postProgress();
        return;
    }

    if (type === 'SEARCH') {
        const requestId = Number(data?.requestId || 0);
        const query = String(data?.query || '');
        const fromPage = Number(data?.fromPage || 1);
        const toPage = Number(data?.toPage || state.totalPages || fromPage);

        const results = [];
        for (let page = fromPage; page <= toPage; page++) {
            const items = state.pageItems.get(page) || [];
            const pageResults = self.TextIndexCore.searchInPage(items, query, page);
            results.push(...pageResults);
        }

        postMessage({ type: 'SEARCH_RESULT', data: { requestId, results } });
    }
};

function postProgress() {
    postMessage({
        type: 'INDEX_PROGRESS',
        data: {
            done: state.indexedPages.size,
            total: state.totalPages
        }
    });
}
