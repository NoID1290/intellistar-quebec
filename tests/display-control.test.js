'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  sleepMonitors,
  wakeMonitors,
  getDrmOutputs,
  getDisplayStatus,
  resolveEnvironment,
} = require('../display-control');

test('display-control module tests', async (t) => {
  await t.test('getDrmOutputs returns an array of output descriptors', () => {
    const outputs = getDrmOutputs();
    assert.ok(Array.isArray(outputs));
    if (outputs.length > 0) {
      assert.ok(typeof outputs[0].name === 'string');
      assert.ok(typeof outputs[0].connected === 'boolean');
      assert.ok(typeof outputs[0].dpms === 'string');
      assert.ok(typeof outputs[0].enabled === 'string');
    }
  });

  await t.test('getDisplayStatus returns structured display state', () => {
    const status = getDisplayStatus();
    assert.ok(typeof status === 'object');
    assert.ok(Array.isArray(status.outputs));
    assert.equal(typeof status.connectedCount, 'number');
    assert.equal(typeof status.allAsleep, 'boolean');
    assert.equal(typeof status.summary, 'string');
  });

  await t.test('resolveEnvironment populates wayland/xcb platform', () => {
    const envWayland = resolveEnvironment({ WAYLAND_DISPLAY: 'wayland-0' });
    assert.equal(envWayland.QT_QPA_PLATFORM, 'wayland');

    const envX11 = resolveEnvironment({ DISPLAY: ':0' });
    assert.equal(envX11.QT_QPA_PLATFORM, 'xcb');
  });

  await t.test('sleepMonitors succeeds when mock tool succeeds', () => {
    // Create temporary mock script that exits 0
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-test-'));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const mockBin = path.join(tmpDir, 'mock-kscreen');
    fs.writeFileSync(mockBin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const res = sleepMonitors(process.env, { kscreenBin: mockBin });
    assert.equal(res.success, true);
    assert.equal(res.action, 'sleep');
    assert.equal(res.method, 'kscreen-doctor');
    assert.equal(res.error, null);
    assert.ok(Array.isArray(res.outputs));
  });

  await t.test('wakeMonitors succeeds when mock tool succeeds', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-test-'));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const mockBin = path.join(tmpDir, 'mock-kscreen');
    fs.writeFileSync(mockBin, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const res = wakeMonitors(process.env, { kscreenBin: mockBin });
    assert.equal(res.success, true);
    assert.equal(res.action, 'wake');
    assert.equal(res.method, 'kscreen-doctor');
    assert.equal(res.error, null);
    assert.ok(Array.isArray(res.outputs));
  });

  await t.test('sleepMonitors falls back to secondary methods if primary fails', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-test-'));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const failBin = path.join(tmpDir, 'mock-fail');
    fs.writeFileSync(failBin, '#!/bin/sh\nexit 1\n', { mode: 0o755 });

    const successXset = path.join(tmpDir, 'mock-xset');
    fs.writeFileSync(successXset, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const res = sleepMonitors({ DISPLAY: ':0' }, {
      kscreenBin: failBin,
      xsetBin: successXset,
      forceXset: true,
    });
    assert.equal(res.success, true);
    assert.equal(res.method, 'xset');
  });

  await t.test('sleepMonitors gracefully reports failure when all methods fail', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-test-'));
    t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

    const failBin = path.join(tmpDir, 'mock-fail');
    fs.writeFileSync(failBin, '#!/bin/sh\nexit 1\n', { mode: 0o755 });

    const res = sleepMonitors({}, {
      kscreenBin: failBin,
      xsetBin: failBin,
      forceXset: false,
    });
    assert.equal(res.success, false);
    assert.ok(res.error);
  });
});

