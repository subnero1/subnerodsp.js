import assert from "node:assert/strict";
import test from "node:test";
import { welch, WelchStream, spectrogram, SpectrogramStream, upconvert, downconvert } from "./dsp.js";

function makeSineSignal(length, fs = 1000, frequency = 10) {
  return new Array(length).fill(0).map((_, i) => Math.sin(2 * Math.PI * frequency * i / fs));
}

function assertEquals(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
}

function assertThrows(fn, errorType, messagePart) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof errorType);
    if (messagePart) {
      assert.match(error.message, new RegExp(messagePart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    return true;
  });
}

function assertAlmostEquals(actual, expected, tolerance = 1e-10, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message ?? `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function assertArrayAlmostEquals(actual, expected, tolerance = 1e-10) {
  assertEquals(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assertAlmostEquals(actual[i], expected[i], tolerance);
  }
}

function assertMatrixAlmostEquals(actual, expected, tolerance = 1e-10) {
  assertEquals(actual.length, expected.length);
  for (let row = 0; row < actual.length; row++) {
    assertArrayAlmostEquals(actual[row], expected[row], tolerance);
  }
}

/**
 * Test power-of-2 validation for welch function.
 */
test("welch throws error for non-power-of-2 nperseg", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  assertThrows(
    () => welch(signal, { nperseg: 100 }),
    Error,
    "nperseg must be a power of 2"
  );

  assertThrows(
    () => welch(signal, { nperseg: 200 }),
    Error,
    "nperseg must be a power of 2"
  );

  assertThrows(
    () => welch(signal, { nperseg: 300 }),
    Error,
    "nperseg must be a power of 2"
  );
});

/**
 * Test power-of-2 validation for spectrogram function.
 */
test("spectrogram throws error for non-power-of-2 nperseg", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  assertThrows(
    () => spectrogram(signal, { nperseg: 100 }),
    Error,
    "nperseg must be a power of 2"
  );
});

/**
 * Test power-of-2 validation for nfft parameter.
 */
test("welch throws error for non-power-of-2 nfft", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  assertThrows(
    () => welch(signal, { nperseg: 128, nfft: 200 }),
    Error,
    "nperseg must be a power of 2"
  );
});

/**
 * Test welch with default parameters.
 */
test("welch works with default parameters", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  const result = welch(signal);

  assertEquals(typeof result, 'object');
  assertEquals(Array.isArray(result.frequencies), true);
  assertEquals(Array.isArray(result.psd), true);
  assertEquals(result.frequencies.length, result.psd.length);

  // With nperseg=256, nfft=256, we should have 129 frequency bins (256/2 + 1)
  assertEquals(result.frequencies.length, 129);
});

/**
 * Test welch with custom nperseg.
 */
test("welch works with custom nperseg", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  const result = welch(signal, { nperseg: 512 });

  // With nperseg=512, nfft=512, we should have 257 frequency bins (512/2 + 1)
  assertEquals(result.frequencies.length, 257);
});

/**
 * Test welch frequency bins are correct.
 */
test("welch generates correct frequency bins", () => {
  const fs = 1000; // 1 kHz sampling rate
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / fs));

  const result = welch(signal, { fs, nperseg: 256 });

  // First frequency should be 0
  assertAlmostEquals(result.frequencies[0], 0, 1e-10);

  // Last frequency should be Nyquist frequency (fs/2)
  assertAlmostEquals(result.frequencies[result.frequencies.length - 1], fs / 2, 1e-6);

  // Frequency spacing should be fs/nfft
  const df = fs / 256;
  assertAlmostEquals(result.frequencies[1], df, 1e-6);
});

/**
 * Test welch with custom window array.
 */
test("welch accepts custom window array", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  // Create a rectangular window (all ones)
  const customWindow = new Array(256).fill(1);

  const result = welch(signal, { window: customWindow });

  assertEquals(result.frequencies.length, 129);
  assertEquals(result.psd.length, 129);
});

/**
 * Test welch throws error for mismatched custom window length.
 */
test("welch throws error for mismatched custom window length", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  const customWindow = new Array(128).fill(1);

  assertThrows(
    () => welch(signal, { nperseg: 256, window: customWindow }),
    Error,
    "Custom window length (128) must match nperseg (256)"
  );
});

/**
 * Test welch with noverlap parameter.
 */
test("welch works with custom noverlap", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  const result = welch(signal, { nperseg: 256, noverlap: 128 });

  assertEquals(result.frequencies.length, 129);
  assertEquals(result.psd.length, 129);
});

/**
 * Test welch throws error for invalid noverlap.
 */
test("welch throws error for noverlap >= nperseg", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  assertThrows(
    () => welch(signal, { nperseg: 256, noverlap: 256 }),
    Error,
    "noverlap (256) must be < nperseg (256)"
  );
});

/**
 * Test welch with nfft > nperseg (zero-padding).
 */
test("welch works with nfft > nperseg", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  const result = welch(signal, { nperseg: 256, nfft: 512 });

  // With nfft=512, we should have 257 frequency bins (512/2 + 1)
  assertEquals(result.frequencies.length, 257);
});

/**
 * Test welch throws error for nfft < nperseg.
 */
test("welch throws error for nfft < nperseg", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  assertThrows(
    () => welch(signal, { nperseg: 256, nfft: 128 }),
    Error,
    "nfft (128) must be >= nperseg (256)"
  );
});

/**
 * Test welch with scaling='spectrum'.
 */
test("welch works with scaling='spectrum'", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  const result = welch(signal, { scaling: 'spectrum' });

  assertEquals(result.frequencies.length, 129);
  assertEquals(result.psd.length, 129);
});

/**
 * Test welch with detrend=false.
 */
test("welch works with detrend=false", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  const result = welch(signal, { detrend: false });

  assertEquals(result.frequencies.length, 129);
  assertEquals(result.psd.length, 129);
});

/**
 * Test welch throws error for empty signal.
 */
test("welch throws error for empty signal", () => {
  assertThrows(
    () => welch([]),
    Error,
    "Input signal x must be a non-empty array or typed array"
  );
});

/**
 * Test welch accepts Float32Array input.
 */
test("welch accepts Float32Array input", () => {
  const signal = Float32Array.from(makeSineSignal(1000));

  const result = welch(signal, { nperseg: 256 });

  assertEquals(result.frequencies.length, 129);
  assertEquals(result.psd.length, 129);
});

/**
 * Test welch accepts Float64Array input.
 */
test("welch accepts Float64Array input", () => {
  const signal = Float64Array.from(makeSineSignal(1000));

  const result = welch(signal, { nperseg: 256 });

  assertEquals(result.frequencies.length, 129);
  assertEquals(result.psd.length, 129);
});

/**
 * Test welch returns the same result for Array and Float32Array input.
 */
test("welch matches Array and Float32Array input", () => {
  const signal = makeSineSignal(2048, 1000, 100);
  const float32Signal = Float32Array.from(signal);

  const arrayResult = welch(signal, { fs: 1000, nperseg: 512, nfft: 512 });
  const typedResult = welch(float32Signal, { fs: 1000, nperseg: 512, nfft: 512 });

  assertArrayAlmostEquals(typedResult.frequencies, arrayResult.frequencies, 1e-12);
  assertArrayAlmostEquals(typedResult.psd, arrayResult.psd, 1e-6);
});

/**
 * Test welch throws error for signal shorter than nperseg.
 */
test("welch throws error for signal shorter than nperseg", () => {
  const signal = new Array(100).fill(0);

  assertThrows(
    () => welch(signal, { nperseg: 256 }),
    Error,
    "nperseg (256) cannot be greater than signal length (100)"
  );
});

/**
 * Test spectrogram with default parameters.
 */
test("spectrogram works with default parameters", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  const result = spectrogram(signal);

  assertEquals(typeof result, 'object');
  assertEquals(Array.isArray(result.frequencies), true);
  assertEquals(Array.isArray(result.times), true);
  assertEquals(Array.isArray(result.spectrogram), true);

  // Check that spectrogram is 2D array
  assertEquals(Array.isArray(result.spectrogram[0]), true);

  // Frequencies should match spectrogram rows
  assertEquals(result.frequencies.length, result.spectrogram.length);

  // Times should match spectrogram columns
  assertEquals(result.times.length, result.spectrogram[0].length);
});

/**
 * Test spectrogram output shape.
 */
test("spectrogram has correct output shape", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  const result = spectrogram(signal, { nperseg: 256, noverlap: 32 });

  // With nperseg=256, nfft=256, we should have 129 frequency bins (256/2 + 1)
  assertEquals(result.frequencies.length, 129);
  assertEquals(result.spectrogram.length, 129);

  // Check that all rows have same number of time bins
  const numTimeBins = result.spectrogram[0].length;
  for (let i = 1; i < result.spectrogram.length; i++) {
    assertEquals(result.spectrogram[i].length, numTimeBins);
  }

  assertEquals(result.times.length, numTimeBins);
});

/**
 * Test spectrogram with mode='magnitude'.
 */
test("spectrogram works with mode='magnitude'", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  const result = spectrogram(signal, { mode: 'magnitude' });

  assertEquals(result.frequencies.length, 129);
  assertEquals(Array.isArray(result.spectrogram), true);
  assertEquals(result.spectrogram.length, 129);
});

/**
 * Test spectrogram throws error for unsupported mode.
 */
test("spectrogram throws error for unsupported mode", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  assertThrows(
    () => spectrogram(signal, { mode: 'invalid' }),
    Error,
    "Unsupported mode: invalid"
  );
});

/**
 * Test spectrogram time bins are correct.
 */
test("spectrogram generates correct time bins", () => {
  const fs = 1000; // 1 kHz sampling rate
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / fs));

  const nperseg = 256;
  const noverlap = 32; // nperseg/8 default
  const result = spectrogram(signal, { fs, nperseg, noverlap });

  // First time should be at center of first segment
  const expectedFirstTime = (nperseg / 2) / fs;
  assertAlmostEquals(result.times[0], expectedFirstTime, 1e-6);

  // Time spacing should be (nperseg - noverlap) / fs
  const step = nperseg - noverlap;
  const dt = step / fs;

  if (result.times.length > 1) {
    assertAlmostEquals(result.times[1] - result.times[0], dt, 1e-6);
  }
});

/**
 * Test spectrogram with custom window array.
 */
test("spectrogram accepts custom window array", () => {
  const signal = new Array(1000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  // Create a rectangular window (all ones)
  const customWindow = new Array(256).fill(1);

  const result = spectrogram(signal, { window: customWindow });

  assertEquals(result.frequencies.length, 129);
  assertEquals(result.spectrogram.length, 129);
});

/**
 * Test spectrogram default noverlap is nperseg/8.
 */
test("spectrogram uses nperseg/8 as default noverlap", () => {
  const signal = new Array(2000).fill(0).map((_, i) => Math.sin(2 * Math.PI * 10 * i / 1000));

  const nperseg = 256;
  const result1 = spectrogram(signal, { nperseg });
  const result2 = spectrogram(signal, { nperseg, noverlap: Math.floor(nperseg / 8) });

  // Should have same number of time bins
  assertEquals(result1.times.length, result2.times.length);
});

/**
 * Test spectrogram accepts Float32Array input.
 */
test("spectrogram accepts Float32Array input", () => {
  const signal = Float32Array.from(makeSineSignal(1000));

  const result = spectrogram(signal, { nperseg: 256, mode: 'magnitude' });

  assertEquals(result.frequencies.length, 129);
  assertEquals(result.spectrogram.length, 129);
});

/**
 * Test spectrogram accepts Float64Array input.
 */
test("spectrogram accepts Float64Array input", () => {
  const signal = Float64Array.from(makeSineSignal(1000));

  const result = spectrogram(signal, { nperseg: 256, mode: 'psd' });

  assertEquals(result.frequencies.length, 129);
  assertEquals(result.spectrogram.length, 129);
});

/**
 * Test spectrogram returns the same result for Array and Float32Array input.
 */
test("spectrogram matches Array and Float32Array input", () => {
  const signal = makeSineSignal(2048, 1000, 100);
  const float32Signal = Float32Array.from(signal);

  const arrayResult = spectrogram(signal, { fs: 1000, nperseg: 256, nfft: 256, mode: 'magnitude' });
  const typedResult = spectrogram(float32Signal, { fs: 1000, nperseg: 256, nfft: 256, mode: 'magnitude' });

  assertArrayAlmostEquals(typedResult.frequencies, arrayResult.frequencies, 1e-12);
  assertArrayAlmostEquals(typedResult.times, arrayResult.times, 1e-12);
  assertMatrixAlmostEquals(typedResult.spectrogram, arrayResult.spectrogram, 1e-6);
});

/**
 * Test welch detects peak frequency for sinusoidal signal.
 */
test("welch detects peak frequency for sinusoidal signal", () => {
  const fs = 1000; // 1 kHz sampling rate
  const f0 = 100; // 100 Hz signal
  const signal = new Array(4096).fill(0).map((_, i) => Math.sin(2 * Math.PI * f0 * i / fs));

  const result = welch(signal, { fs, nperseg: 1024 });

  // Find peak in PSD
  let peakIdx = 0;
  let peakValue = result.psd[0];
  for (let i = 1; i < result.psd.length; i++) {
    if (result.psd[i] > peakValue) {
      peakValue = result.psd[i];
      peakIdx = i;
    }
  }

  // Peak should be close to f0
  const peakFreq = result.frequencies[peakIdx];

  // Allow some tolerance due to discretization
  const tolerance = fs / 1024; // frequency resolution
  assertEquals(Math.abs(peakFreq - f0) < tolerance, true,
    `Peak frequency ${peakFreq} should be close to ${f0} Hz (within ${tolerance} Hz)`);
});

/**
 * Test spectrogram detects consistent frequency for constant sinusoid.
 */
test("spectrogram detects consistent frequency for constant sinusoid", () => {
  const fs = 1000; // 1 kHz sampling rate
  const f0 = 100; // 100 Hz signal
  const signal = new Array(4096).fill(0).map((_, i) => Math.sin(2 * Math.PI * f0 * i / fs));

  const result = spectrogram(signal, { fs, nperseg: 512, mode: 'magnitude' });

  // For each time bin, find the peak frequency
  const peakFreqs = [];
  for (let t = 0; t < result.times.length; t++) {
    let peakIdx = 0;
    let peakValue = result.spectrogram[0][t];
    for (let f = 1; f < result.frequencies.length; f++) {
      if (result.spectrogram[f][t] > peakValue) {
        peakValue = result.spectrogram[f][t];
        peakIdx = f;
      }
    }
    peakFreqs.push(result.frequencies[peakIdx]);
  }

  // All peak frequencies should be consistent (close to f0)
  const tolerance = fs / 512; // frequency resolution
  for (const peakFreq of peakFreqs) {
    assertEquals(Math.abs(peakFreq - f0) < tolerance, true,
      `Peak frequency ${peakFreq} should be close to ${f0} Hz`);
  }
});

/**
 * Test SpectrogramStream enforces exact hop-sized chunks.
 */
test("SpectrogramStream enforces exact hop input", () => {
  const stream = new SpectrogramStream({ nperseg: 256, noverlap: 64, mode: 'magnitude' });
  const out = new Float32Array(stream.numBins);

  assertEquals(stream.hop, 192);
  assertEquals(stream.frequencies.length, 129);

  assertThrows(
    () => stream.process(new Array(191).fill(0), out),
    Error,
    "Input chunk length (191) must equal hop (192)"
  );
});

/**
 * Test SpectrogramStream first frame timing and output shape.
 */
test("SpectrogramStream returns one column with expected time center", () => {
  const fs = 1000;
  const stream = new SpectrogramStream({ fs, nperseg: 256, noverlap: 32, mode: 'magnitude' });
  const chunk = makeSineSignal(stream.hop, fs, 100);
  const out = new Float32Array(stream.numBins);

  const time = stream.process(chunk, out);

  assertEquals(stream.numBins, 129);
  assertAlmostEquals(time, (256 / 2 - 32) / fs, 1e-12);
});

/**
 * Test SpectrogramStream accepts typed-array chunks and writes at a destination offset.
 */
test("SpectrogramStream accepts Float32Array chunks and an output offset", () => {
  const stream = new SpectrogramStream({ nperseg: 256, mode: 'magnitude' });
  const chunk = Float32Array.from(makeSineSignal(stream.hop));
  const out = new Float32Array(stream.numBins * 2);

  stream.process(chunk, out, stream.numBins);

  assertEquals(out.subarray(0, stream.numBins).every((v) => v === 0), true);
  assertEquals(out.subarray(stream.numBins).some((v) => v !== 0), true);
});

/**
 * Test SpectrogramStream reset clears overlap and time state.
 */
test("SpectrogramStream reset restores initial state", () => {
  const fs = 1000;
  const stream = new SpectrogramStream({ fs, nperseg: 256, noverlap: 128, mode: 'magnitude' });
  const firstChunk = makeSineSignal(stream.hop, fs, 100);
  const secondChunk = makeSineSignal(stream.hop, fs, 100).map((value, index) =>
    Math.sin(2 * Math.PI * 100 * (index + stream.hop) / fs)
  );
  const firstOut = new Float32Array(stream.numBins);
  const resetOut = new Float32Array(stream.numBins);

  const firstTime = stream.process(firstChunk, firstOut);
  stream.process(secondChunk, new Float32Array(stream.numBins));
  stream.reset();
  const resetTime = stream.process(firstChunk, resetOut);

  assertAlmostEquals(resetTime, firstTime, 1e-12);
  assertArrayAlmostEquals(resetOut, firstOut, 1e-10);
});

/**
 * Test SpectrogramStream matches batch spectrogram with zero-prefill framing.
 */
test("SpectrogramStream matches batch spectrogram with zero-prefill", () => {
  const fs = 1000;
  const nperseg = 256;
  const noverlap = 128;
  const signal = makeSineSignal(1024, fs, 100);
  const paddedSignal = new Array(noverlap).fill(0).concat(signal);
  const batchResult = spectrogram(paddedSignal, { fs, nperseg, noverlap, mode: 'magnitude' });
  const stream = new SpectrogramStream({ fs, nperseg, noverlap, mode: 'magnitude' });
  const out = new Float32Array(stream.numBins);

  for (let timeIndex = 0; timeIndex < signal.length / stream.hop; timeIndex++) {
    const chunkStart = timeIndex * stream.hop;
    const chunk = signal.slice(chunkStart, chunkStart + stream.hop);
    const time = stream.process(chunk, out);
    const expectedColumn = batchResult.spectrogram.map((row) => row[timeIndex]);

    assertAlmostEquals(time, batchResult.times[timeIndex] - noverlap / fs, 1e-12);
    assertArrayAlmostEquals(out, expectedColumn, 1e-6);
  }
});

/**
 * Test SpectrogramStream mode 'db' matches the legacy display-dB conversion applied
 * to SpectrogramStream mode 'magnitude' output, column by column.
 */
test("SpectrogramStream mode 'db' matches display-dB over SpectrogramStream mode 'magnitude'", () => {
  const fs = 1000;
  const nperseg = 256;
  const noverlap = 32;
  const signal = makeSineSignal(2048, fs, 100);
  const magStream = new SpectrogramStream({ fs, nperseg, noverlap, mode: 'magnitude' });
  const dbStream = new SpectrogramStream({ fs, nperseg, noverlap, mode: 'db' });
  const magOut = new Float32Array(magStream.numBins);
  const dbOut = new Float32Array(dbStream.numBins);

  for (let start = 0; start + magStream.hop <= signal.length; start += magStream.hop) {
    const chunk = signal.slice(start, start + magStream.hop);
    magStream.process(chunk, magOut);
    dbStream.process(chunk, dbOut);

    const expectedDb = Array.from(magOut).map(
      (magnitude) => 20 * Math.log10((magnitude * Math.sqrt(magStream.windowSumSquares * fs) * 2) / magStream.windowSum + 1e-12)
    );

    // 1e-4 accounts for Float32Array output rounding at dB magnitude ~40-50.
    assertArrayAlmostEquals(Array.from(dbOut), expectedDb, 1e-4);
  }
});

/**
 * Test SpectrogramStream sustains many hops into a fixed output buffer (no aliasing
 * from buffer reuse across calls).
 */
test("SpectrogramStream sustains 1000 hops into a pre-sized buffer", () => {
  const fs = 1000;
  const stream = new SpectrogramStream({ fs, nperseg: 256, noverlap: 32, mode: 'magnitude' });
  const out = new Float32Array(stream.numBins);
  const chunk = makeSineSignal(stream.hop, fs, 100);

  let lastTime = -Infinity;
  for (let i = 0; i < 1000; i++) {
    const time = stream.process(chunk, out);
    assertEquals(time > lastTime, true);
    lastTime = time;
  }

  assertEquals(out.some((v) => Number.isFinite(v) && v !== 0), true);
});

/**
 * Test WelchStream mode 'db' matches 10*log10(welch().psd + 1e-20) for both
 * plain arrays and typed-array input.
 */
test("WelchStream mode 'db' matches batch welch() in dB", () => {
  const fs = 1000;
  const nperseg = 256;
  const segments = 4;
  const noverlap = Math.floor(nperseg / 2);
  const needed = nperseg + (segments - 1) * (nperseg - noverlap);
  const signal = makeSineSignal(needed, fs, 50);

  const batch = welch(signal, { fs, nperseg, noverlap });
  const expectedDb = batch.psd.map((value) => 10 * Math.log10(value + 1e-20));

  const stream = new WelchStream({ fs, nperseg, segments });
  assertEquals(stream.numBins, batch.frequencies.length);

  const out = new Float32Array(stream.numBins);
  const bins = stream.process(signal, out);

  assertEquals(bins, batch.frequencies.length);
  // 1e-4 accounts for Float32Array output rounding at dB magnitude ~40-50.
  assertArrayAlmostEquals(Array.from(out), expectedDb, 1e-4);

  // Float32Array *input* quantizes the samples themselves, so bins near the
  // numerical noise floor diverge from the float64 reference; only compare
  // bins comfortably above it (there's a real signal peak at -11 dB here).
  const outTyped = new Float32Array(stream.numBins);
  stream.process(Float32Array.from(signal), outTyped);
  for (let i = 0; i < expectedDb.length; i++) {
    if (expectedDb[i] < -60) continue;
    assertAlmostEquals(outTyped[i], expectedDb[i], 1e-4);
  }
});

/**
 * Test WelchStream mode 'psd' matches batch welch()'s linear PSD directly
 * (no dB conversion) - the same parity as SpectrogramStream's 'psd'/'magnitude' modes
 * against spectrogram().
 */
test("WelchStream mode 'psd' matches batch welch() directly", () => {
  const fs = 1000;
  const nperseg = 256;
  const segments = 4;
  const noverlap = Math.floor(nperseg / 2);
  const needed = nperseg + (segments - 1) * (nperseg - noverlap);
  const signal = makeSineSignal(needed, fs, 50);

  const batch = welch(signal, { fs, nperseg, noverlap });
  const stream = new WelchStream({ fs, nperseg, segments, mode: 'psd' });
  const out = new Float32Array(stream.numBins);
  stream.process(signal, out);

  assertArrayAlmostEquals(Array.from(out), batch.psd, 1e-6);
});

/**
 * Test WelchStream is strict about insufficient samples and bad params.
 */
test("WelchStream throws on insufficient samples and invalid params", () => {
  assertThrows(
    () => new WelchStream({ nperseg: 100, segments: 1 }),
    Error,
    "nperseg must be a power of 2"
  );

  assertThrows(
    () => new WelchStream({ nperseg: 256, segments: 0 }),
    Error,
    "segments"
  );

  const stream = new WelchStream({ nperseg: 256, segments: 8 });
  const out = new Float32Array(stream.numBins);

  assertThrows(
    () => stream.process(makeSineSignal(300), out),
    Error,
    "too short"
  );
});

/**
 * Test that upconvert followed by downconvert recovers the baseband signal.
 */
test("upconvert/downconvert round trip recovers baseband", () => {
  // Whole numbers of cycles per window, so the FFT-based Hilbert transform in
  // downconvert() has no wraparound error and recovery is exact.
  const n = 256;
  const fs = 1000;
  const fc = (fs * 8) / n;
  const baseband = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    baseband[2 * i] = Math.cos((2 * Math.PI * 4 * i) / n);
    baseband[2 * i + 1] = Math.sin((2 * Math.PI * 3 * i) / n);
  }

  const passband = upconvert(baseband, { sps: 1, fc, fs });
  const recovered = downconvert(passband, { sps: 1, fc, fs });

  assertArrayAlmostEquals(Array.from(recovered), Array.from(baseband), 1e-9);
});

/**
 * Test upconvert with fc = 0 is just a sqrt(2) gain on the in-phase component.
 */
test("upconvert at fc = 0 scales the in-phase component", () => {
  const baseband = [1, 0, -0.5, 0, 0.25, 0];
  assertArrayAlmostEquals(
    Array.from(upconvert(baseband, { sps: 1, fc: 0 })),
    [Math.SQRT2, -Math.SQRT2 / 2, Math.SQRT2 / 4]
  );
});

/**
 * Test output lengths and sample rates for both conversions.
 */
test("upconvert/downconvert output lengths", () => {
  const baseband = new Float64Array(2 * 100);

  assertEquals(upconvert(baseband, { sps: 1 }).length, 100);
  // sps > 1 adds 11 baseband samples of pulse shape transient on each side.
  assertEquals(upconvert(baseband, { sps: 4 }).length, (100 + 22) * 4);

  const passband = new Float64Array(100);
  assertEquals(downconvert(passband, { sps: 1 }).length, 200);
  assertEquals(downconvert(passband, { sps: 4 }).length, 2 * 25);
});

/**
 * Test input validation for upconvert and downconvert.
 */
test("upconvert/downconvert reject invalid inputs", () => {
  assertThrows(() => upconvert([1, 2, 3]), Error, "interleaved complex");
  assertThrows(() => upconvert([]), Error, "non-empty");
  assertThrows(() => downconvert([]), Error, "non-empty");
  assertThrows(() => upconvert([1, 0], { sps: 0 }), Error, "sps must be a positive integer");
  assertThrows(() => downconvert([1], { sps: 1.5 }), Error, "sps must be a positive integer");
});


test("spectral options reject invalid segment sizes and overlaps", () => {
  const signal = makeSineSignal(32);
  const calls = [
    (options) => welch(signal, options),
    (options) => spectrogram(signal, options),
    (options) => new SpectrogramStream(options),
    (options) => new WelchStream({ ...options, segments: 1 })
  ];
  for (const call of calls) {
    for (const nperseg of [1, 2.5, NaN, Infinity, '8', 2 ** 32 + 2]) {
      assert.throws(() => call({ nperseg, nfft: 8 }), /nperseg/);
    }
    for (const nfft of [1, 8.5, NaN, Infinity, '8', 2 ** 32 + 8]) {
      assert.throws(() => call({ nperseg: 8, nfft }), /power of 2/);
    }
  }
  for (const call of calls.slice(0, 3)) {
    for (const noverlap of [-1, 0.5, NaN, Infinity, '4']) {
      assert.throws(() => call({ nperseg: 8, noverlap }), /noverlap/);
    }
  }
});

test("all entry points reject invalid sampling rates", () => {
  const signal = makeSineSignal(32);
  for (const fs of [0, -1, NaN, Infinity, '1000', null]) {
    const options = { fs, nperseg: 8 };
    for (const call of [
      () => welch(signal, options), () => spectrogram(signal, options),
      () => new SpectrogramStream(options), () => new WelchStream(options),
      () => upconvert([1, 0], options), () => downconvert(signal, options)
    ]) assert.throws(call, /fs must be finite and positive/);
  }
});

test("streams reject invalid destinations without changing output or history", () => {
  for (const Stream of [SpectrogramStream, WelchStream]) {
    const options = { nperseg: 8, segments: 1, mode: 'psd' };
    const stream = new Stream(options);
    const reference = new Stream(options);
    const chunk = makeSineSignal(stream.hop ?? stream.needed);
    const first = new Float64Array(stream.numBins);
    stream.process(chunk, first);
    reference.process(chunk, new Float64Array(stream.numBins));
    for (const out of [Array(stream.numBins + 2).fill(-123), new Float32Array(stream.numBins + 2).fill(-123), new Float64Array(stream.numBins + 2).fill(-123)]) {
      const before = Array.from(out);
      for (const offset of [-1, 0.5, NaN, Infinity, '0']) {
        assert.throws(() => stream.process(chunk, out, offset), /offset/);
        assert.deepEqual(Array.from(out), before);
      }
      assert.throws(() => stream.process(chunk, out, out.length), /Output must hold/);
      assert.deepEqual(Array.from(out), before);
    }
    for (const out of [null, { length: 100 }, new Int16Array(100)]) {
      assert.throws(() => stream.process(chunk, out), /Output must be/);
    }
    const actual = new Float64Array(stream.numBins);
    const expected = new Float64Array(stream.numBins);
    assert.equal(stream.process(chunk, actual), reference.process(chunk, expected));
    assertArrayAlmostEquals(actual, expected);
  }
});

test("custom windows validate normalization and preserve sign invariance", () => {
  const signal = makeSineSignal(16);
  const calls = [
    (options) => welch(signal, options), (options) => spectrogram(signal, options),
    (options) => new SpectrogramStream(options), (options) => new WelchStream(options)
  ];
  for (const call of calls) {
    for (const window of [Array(8).fill(0), Array(8).fill(NaN), Array(8).fill(Infinity)]) {
      assert.throws(() => call({ nperseg: 8, window }), /Window/);
    }
  }
  const zeroSum = [1, -1, 1, -1, 1, -1, 1, -1];
  assert.ok(welch(signal, { nperseg: 8, window: zeroSum }).psd.every(Number.isFinite));
  for (const call of calls) {
    assert.throws(() => call({ nperseg: 8, window: zeroSum, scaling: 'spectrum' }), /nonzero sum/);
  }
  assert.throws(() => spectrogram(signal, { nperseg: 8, window: zeroSum, mode: 'db' }), /nonzero sum/);
  const tinySum = [1, -1, 0, 0, 0, 0, 0, 1e-200];
  assert.throws(() => welch(signal, { nperseg: 8, window: tinySum, scaling: 'spectrum' }), /nonzero sum/);
  for (const mode of ['psd', 'magnitude', 'db']) {
    const options = { nperseg: 8, detrend: false, mode };
    const positive = spectrogram(signal, { ...options, window: Array(8).fill(1) });
    const negative = spectrogram(signal, { ...options, window: Array(8).fill(-1) });
    assertMatrixAlmostEquals(positive.spectrogram, negative.spectrogram);
  }
});

test("stream times use the first real sample as origin across overlap and reset", () => {
  for (const noverlap of [0, 2, 4, 6, 7]) {
    const stream = new SpectrogramStream({ nperseg: 8, noverlap, fs: 8 });
    const out = new Float64Array(stream.numBins);
    const chunk = Array(stream.hop).fill(1);
    for (let i = 0; i < 3; i++) {
      assertAlmostEquals(stream.process(chunk, out), (i * stream.hop + 4 - noverlap) / 8);
    }
    stream.reset();
    assertAlmostEquals(stream.process(chunk, out), (4 - noverlap) / 8);
  }
});

// Direct DFT provides a reference independent of the FFT and chirp convolution.
function analyticDftReference(signal, fc, fs) {
  const n = signal.length;
  const spectrum = Array.from({ length: n }, (_, k) => {
    let re = 0;
    let im = 0;
    for (let j = 0; j < n; j++) {
      const phase = -2 * Math.PI * k * j / n;
      re += signal[j] * Math.cos(phase);
      im += signal[j] * Math.sin(phase);
    }
    const gain = k === 0 || (n % 2 === 0 && k === n / 2) ? 1 : (k < n / 2 ? 2 : 0);
    return [re * gain, im * gain];
  });
  const out = new Float64Array(2 * n);
  for (let j = 0; j < n; j++) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < n; k++) {
      const phase = 2 * Math.PI * k * j / n;
      re += spectrum[k][0] * Math.cos(phase) - spectrum[k][1] * Math.sin(phase);
      im += spectrum[k][0] * Math.sin(phase) + spectrum[k][1] * Math.cos(phase);
    }
    const phase = -2 * Math.PI * fc * j / fs;
    out[2 * j] = (re * Math.cos(phase) - im * Math.sin(phase)) / (n * Math.SQRT2);
    out[2 * j + 1] = (re * Math.sin(phase) + im * Math.cos(phase)) / (n * Math.SQRT2);
  }
  return out;
}

test("downconvert matches an original-length DFT for odd, even and prime lengths", () => {
  for (const n of [1, 2, 3, 6, 8, 15, 17, 32, 100, 257]) {
    const signal = Float64Array.from({ length: n }, (_, i) => Math.cos(0.9 * i + 0.2) + 0.3 * Math.sin(0.13 * i));
    for (const fc of [0, 2.3]) {
      assertArrayAlmostEquals(downconvert(signal, { fc, fs: 100 }), analyticDftReference(signal, fc, 100), 1e-10);
    }
  }
});

test("downconvert preserves DC and even-length Nyquist without quadrature artifacts", () => {
  for (const n of [1, 2, 3, 6, 15, 16, 17]) {
    const signal = Array(n).fill(Math.SQRT2);
    assertArrayAlmostEquals(downconvert(signal), signal.flatMap(() => [1, 0]));
    if (n % 2 === 0) {
      const nyquist = signal.map((value, i) => value * (-1) ** i);
      assertArrayAlmostEquals(downconvert(nyquist), nyquist.flatMap((value) => [value / Math.SQRT2, 0]));
    }
  }
});

test("upconvert/downconvert round trips recover tones at arbitrary lengths", () => {
  for (const n of [9, 10, 17, 31, 100, 257]) {
    const baseband = Array.from({ length: n }, (_, i) => [Math.cos(2 * Math.PI * i / n), Math.sin(2 * Math.PI * i / n)]).flat();
    const passband = upconvert(baseband, { fc: 3, fs: n });
    assertArrayAlmostEquals(downconvert(passband, { fc: 3, fs: n }), baseband, 1e-10);
  }
});
