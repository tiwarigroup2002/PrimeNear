// Minimal jest-style `expect` on top of node:assert, used with `node --test`.
const assert = require('node:assert/strict');

module.exports = function expect(actual) {
  return {
    toBe: (v) => assert.strictEqual(actual, v),
    toEqual: (v) => assert.deepStrictEqual(actual, v),
    toContain: (v) => assert.ok(actual.includes(v), `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(v)}`),
    toMatch: (rx) => assert.match(actual, rx),
    toHaveLength: (n) => assert.strictEqual(actual.length, n),
    toBeGreaterThan: (n) => assert.ok(actual > n, `expected ${actual} > ${n}`),
    toBeCloseTo: (n, digits = 2) => assert.ok(Math.abs(actual - n) < 10 ** -digits / 2, `expected ${actual} ≈ ${n}`),
    toBeTruthy: () => assert.ok(actual),
    not: {
      toBe: (v) => assert.notStrictEqual(actual, v),
      toContain: (v) => assert.ok(!actual.includes(v), `expected ${JSON.stringify(actual)} not to contain ${JSON.stringify(v)}`),
    },
  };
};
