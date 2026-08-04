/**
 * Validation tests comparing the JavaScript upconvert/downconvert implementation
 * against SignalAnalysis.jl (Julia).
 *
 * To regenerate reference data:
 *   julia tests/generate_signalanalysis_reference.jl
 *
 * To run these tests:
 *   node --test tests/signalanalysis_validation_test.js
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { upconvert, downconvert } from "../src/dsp.js";

const reference = JSON.parse(
  readFileSync(new URL('./signalanalysis_reference_data.json', import.meta.url), 'utf8')
);

// SignalAnalysis stores framerate as Float32, so its carrier phase axis is single
// precision. We mix in double precision, so the "*64" fixtures (same algorithm, Float64
// time axis) are the strict reference; the raw library output is checked loosely.
const FLOAT32_PHASE_TOL = 1e-4;

function assertArrayAlmostEquals(actual, expected, tolerance, message) {
  assert.equal(actual.length, expected.length, `${message}: length`);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= tolerance,
      `${message}: index ${i}: ${actual[i]} vs ${expected[i]}`
    );
  }
}

test('rrcosfir taps match SignalAnalysis.jl', () => {
  // rrcosfir is private, but upconvert exercises it end to end; here we check the
  // taps indirectly via an impulse: upconverting a unit impulse at fc = 0 yields
  // sqrt(2) * the interpolated impulse response.
  for (const { sps, taps } of reference.rrcosfir) {
    if (sps === 1) continue;  // sps = 1 does no filtering
    const impulse = new Float64Array(2);
    impulse[0] = 1;
    const out = upconvert(impulse, { sps, fc: 0, fs: 1 });
    const pad = Math.ceil(taps.length / (2 * sps)) - 1;
    const delay = (taps.length - 1) / 2;
    const expected = out.map((_, i) => {
      const k = i + delay - pad * sps;
      return k >= 0 && k < taps.length ? Math.SQRT2 * taps[k] : 0;
    });
    assertArrayAlmostEquals(out, expected, 1e-12, `rrcosfir sps=${sps}`);
  }
});

test('upconvert matches SignalAnalysis.jl', () => {
  for (const c of reference.upconvert) {
    const out = upconvert(c.baseband, { sps: c.sps, fc: c.fc, fs: c.fs });
    assertArrayAlmostEquals(out, c.passband64, 1e-9, `upconvert sps=${c.sps} fc=${c.fc}`);
    assertArrayAlmostEquals(out, c.passband, FLOAT32_PHASE_TOL, `upconvert (raw) sps=${c.sps} fc=${c.fc}`);
  }
});

test('downconvert matches SignalAnalysis.jl', () => {
  for (const c of reference.downconvert) {
    const out = downconvert(c.passband, { sps: c.sps, fc: c.fc, fs: c.fs });
    assertArrayAlmostEquals(out, c.baseband64, 1e-9, `downconvert sps=${c.sps} fc=${c.fc}`);
    assertArrayAlmostEquals(out, c.baseband, FLOAT32_PHASE_TOL, `downconvert (raw) sps=${c.sps} fc=${c.fc}`);
  }
});

test('round trip matches SignalAnalysis.jl', () => {
  for (const c of reference.roundtrip) {
    const pb = upconvert(c.baseband, { sps: c.sps, fc: c.fc, fs: c.fs });
    const out = downconvert(pb, { sps: c.sps, fc: c.fc, fs: c.fs * c.sps });
    assertArrayAlmostEquals(out, c.roundtrip64, 1e-9, `roundtrip sps=${c.sps} fc=${c.fc}`);
    assertArrayAlmostEquals(out, c.roundtrip, FLOAT32_PHASE_TOL, `roundtrip (raw) sps=${c.sps} fc=${c.fc}`);
  }
});
