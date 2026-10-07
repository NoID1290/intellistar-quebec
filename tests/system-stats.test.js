'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getCpuUsage,
  getCpuTemp,
  getGpuUsage,
  getRamStats,
  getDiskStats,
  getSystemStats,
  formatStatsText,
} = require('../system-stats');

test('system-stats telemetry functions', async (t) => {
  await t.test('getCpuUsage returns a number between 0 and 100', () => {
    const usage = getCpuUsage();
    assert.equal(typeof usage, 'number');
    assert.ok(usage >= 0 && usage <= 100);
  });

  await t.test('getCpuTemp returns temperature object or null on unsupported platforms', () => {
    const temp = getCpuTemp();
    if (temp !== null) {
      assert.equal(typeof temp.celsius, 'number');
      assert.equal(typeof temp.fahrenheit, 'number');
      assert.ok(temp.celsius > 0 && temp.celsius < 150);
      assert.ok(temp.fahrenheit > 32 && temp.fahrenheit < 300);
    }
  });

  await t.test('getGpuUsage returns a percentage number between 0 and 100', () => {
    const usage = getGpuUsage();
    assert.equal(typeof usage, 'number');
    assert.ok(usage >= 0 && usage <= 100);
  });

  await t.test('getRamStats returns valid RAM statistics', () => {
    const ram = getRamStats();
    assert.equal(typeof ram.totalBytes, 'number');
    assert.ok(ram.totalBytes > 0);
    assert.equal(typeof ram.usedBytes, 'number');
    assert.ok(ram.usedBytes >= 0);
    assert.equal(typeof ram.availableBytes, 'number');
    assert.ok(ram.availableBytes >= 0);
    assert.equal(typeof ram.usagePercent, 'number');
    assert.ok(ram.usagePercent >= 0 && ram.usagePercent <= 100);
    assert.equal(typeof ram.usedGb, 'string');
    assert.equal(typeof ram.totalGb, 'string');
  });

  await t.test('getDiskStats returns disk usage metrics', () => {
    const disk = getDiskStats();
    assert.equal(typeof disk.totalBytes, 'number');
    assert.ok(disk.totalBytes > 0);
    assert.equal(typeof disk.usedBytes, 'number');
    assert.ok(disk.usedBytes >= 0);
    assert.equal(typeof disk.usagePercent, 'number');
    assert.ok(disk.usagePercent >= 0 && disk.usagePercent <= 100);
    assert.equal(typeof disk.usedGb, 'string');
    assert.equal(typeof disk.totalGb, 'string');
  });

  await t.test('getSystemStats bundles all PC metrics into structured payload', () => {
    const stats = getSystemStats();
    assert.ok(typeof stats.cpu === 'object');
    assert.equal(typeof stats.cpu.usage, 'number');
    assert.ok(typeof stats.gpu === 'object');
    assert.equal(typeof stats.gpu.usage, 'number');
    assert.ok(typeof stats.ram === 'object');
    assert.ok(typeof stats.disk === 'object');
    assert.equal(typeof stats.hostname, 'string');
  });

  await t.test('formatStatsText generates readable terminal output', () => {
    const text = formatStatsText();
    assert.match(text, /PC SYSTEM STATS/);
    assert.match(text, /CPU USAGE/);
    assert.match(text, /CPU TEMP/);
    assert.match(text, /GPU USAGE/);
    assert.match(text, /RAM/);
    assert.match(text, /DISK/);
  });
});

