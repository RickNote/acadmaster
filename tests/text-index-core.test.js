const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/pdf/web/text-index-core.js');

test('searchInPage returns indexed hits with snippets', () => {
    const items = ['Alpha beta', 'gamma', 'beta delta', 'zzz'];
    const results = core.searchInPage(items, 'beta', 2);
    assert.equal(results.length, 2);
    assert.equal(results[0].page, 2);
    assert.equal(results[0].indexInPage, 1);
    assert.match(results[0].snippet, /beta/i);
});

test('buildContextSnippet limits length', () => {
    const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);
    const snippet = core.buildContextSnippet(items, 10, 20);
    assert.ok(snippet.length <= 20);
});
