const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/shared/translation-memory-core.js');

test('normalizeTMText normalizes spaces and quotes', () => {
    const v = core.normalizeTMText('  Hello   “World”  ');
    assert.equal(v, 'hello "world"');
});

test('calcTMSimilarity returns high score for close strings', () => {
    const a = core.normalizeTMText('transformer based model');
    const b = core.normalizeTMText('transformer-based models');
    const score = core.calcTMSimilarity(a, b);
    assert.ok(score > 0.75);
});
