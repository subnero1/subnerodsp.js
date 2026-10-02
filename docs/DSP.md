# API reference

Full reference for every export of `subnerodsp`. For an introduction, installation and usage guidance, see the [README](../README.md).

All functions accept plain JavaScript arrays and numeric typed arrays such as `Float32Array`, `Float64Array`, and integer typed arrays. Sampling rates must be finite and positive. Spectral segment and FFT lengths must be integer powers of two, at least 2, within fft.js's supported range. Overlap must be a nonnegative integer smaller than the segment length. Custom windows must contain finite samples and have finite, positive energy. Spectrum scaling and spectrogram dB mode also require a finite, nonzero window sum.

## `welch(x, options)`

Computes the Power Spectral Density using Welch's method.

**Parameters:**
- `x` (number[] | TypedArray): Input signal (real-valued)
- `options` (Object):
  - `fs` (number, default: 1.0): Sampling frequency in Hz
  - `window` (string | number[] | TypedArray, default: 'hann'): Window type or custom window array
  - `nperseg` (number, default: 256): Segment length (must be power of 2)
  - `noverlap` (number, default: nperseg/2): Number of overlapping points
  - `nfft` (number, default: nperseg): FFT length (must be power of 2, >= nperseg)
  - `detrend` (string | boolean, default: 'constant'): Detrending ('constant' or false)
  - `scaling` (string, default: 'density'): 'density' (V²/Hz) or 'spectrum' (V²)

**Returns:** `{frequencies: number[], psd: number[]}`

**Example:**
```javascript
import { welch } from 'subnerodsp';

const signal = Float32Array.from([...]); // Your audio signal
const result = welch(signal, {
  fs: 44100,      // 44.1 kHz sample rate
  nperseg: 2048,  // 2048-point segments
  noverlap: 1024  // 50% overlap
});

console.log(result.frequencies); // Frequency bins
console.log(result.psd);         // Power spectral density
```

## `new WelchStream(options)`

Computes a Welch PSD one estimate at a time from a caller-owned buffer (e.g. a ring buffer), writing directly into a caller-supplied `Float32Array`, `Float64Array`, or `number[]`. Allocation-free after construction. The streaming counterpart of `welch()`, sharing the same `mode` choices as `SpectrogramStream`.

It always uses the **most recent** samples (the tail of the input) rather than every segment that fits, which matches a live PSD. `process()` throws if the input is shorter than `needed`.

**Parameters:**
- `options` (Object):
  - `fs` (number, default: 1.0): Sampling frequency in Hz
  - `window` (string | number[] | TypedArray, default: 'hann'): Window type or custom window array
  - `nperseg` (number, default: 1024): Segment length (must be power of 2)
  - `nfft` (number, default: nperseg): FFT length (must be power of 2, >= nperseg)
  - `segments` (number, default: 8): Number of 50%-overlapped segments averaged
  - `detrend` (string | boolean, default: 'constant'): Detrending ('constant' or false)
  - `scaling` (string, default: 'density'): 'density' (V²/Hz) or 'spectrum' (V²) — mode 'psd' only
  - `mode` (string, default: 'db'): Output mode ('db', 'magnitude' or 'psd')
  - `dbEps` (number, default: 1e-20): Power floor added before `10*log10` (mode 'db' only)

**Properties:**
- `numBins` (number): Bins written per call, equal to `nfft/2 + 1`
- `needed` (number): Minimum input length for `process()`, equal to `nperseg + (segments-1)*nperseg/2`
- `frequencies` (number[]): Cached one-sided frequency bins
- `windowSum`, `windowSumSquares` (number): Window normalization constants

**Methods:**
- `process(samples, out, offset = 0)` → writes `numBins` values at `out[offset…]`, returns bins written (`numBins`)

**Throws:** at construction, if `nperseg`/`nfft` aren't powers of 2, `nfft < nperseg`, or `segments` isn't a positive integer; from `process()`, if `samples.length` is below `needed`

**Example:**
```javascript
import { WelchStream } from 'subnerodsp';

const stream = new WelchStream({ fs: 192000, nperseg: 1024, nfft: 2048, segments: 8 });
const out = new Float32Array(stream.numBins); // nfft/2 + 1
stream.process(samples, out);
// out now holds dB values; call again each time new samples arrive — no allocation
```

## `spectrogram(x, options)`

Computes the spectrogram using short-time Fourier transform.

**Parameters:**
- `x` (number[] | TypedArray): Input signal (real-valued)
- `options` (Object):
  - `fs` (number, default: 1.0): Sampling frequency in Hz
  - `window` (string | number[] | TypedArray, default: 'hann'): Window type or custom window array
  - `nperseg` (number, default: 256): Segment length (must be power of 2)
  - `noverlap` (number, default: nperseg/8): Number of overlapping points
  - `nfft` (number, default: nperseg): FFT length (must be power of 2, >= nperseg)
  - `detrend` (string | boolean, default: 'constant'): Detrending ('constant' or false)
  - `scaling` (string, default: 'density'): 'density' (V²/Hz) or 'spectrum' (V²)
  - `mode` (string, default: 'psd'): Output mode ('psd', 'magnitude' or 'db')
  - `dbEps` (number, default: 1e-12): Amplitude floor added before `log10` (mode 'db' only)

**Returns:** `{frequencies: number[], times: number[], spectrogram: number[][]}`

The `spectrogram` is a 2D array where `spectrogram[f][t]` is the value at frequency index `f` and time index `t`.

**Example:**
```javascript
import { spectrogram } from 'subnerodsp';

const signal = Float32Array.from([...]); // Your audio signal
const result = spectrogram(signal, {
  fs: 44100,       // 44.1 kHz sample rate
  nperseg: 1024,   // 1024-point segments
  noverlap: 512,   // 50% overlap
  mode: 'magnitude'
});

console.log(result.frequencies);  // Frequency bins [f0, f1, f2, ...]
console.log(result.times);        // Time bins [t0, t1, t2, ...]
console.log(result.spectrogram);  // 2D array [freq][time]
```

## `new SpectrogramStream(options)`

Computes a spectrogram one time slice (column) at a time from streaming input, writing each column into a caller-supplied buffer. Allocation-free after construction — the FFT, window, and sliding segment buffers are all allocated once. The streaming counterpart of `spectrogram()`.

**Parameters:**
- Same as `spectrogram(x, options)`, but `mode` defaults to `'db'`
- `dbEps` (number, default: 1e-12): Amplitude floor added before `log10` (mode 'db' only)

**Properties:**
- `hop` (number): Required input length for each `process()` call, equal to `nperseg - noverlap`
- `numBins` (number): Number of frequency bins written per column
- `frequencies` (number[]): Cached one-sided frequency bins
- `windowSum`, `windowSumSquares` (number): Window normalization constants, exposed for callers doing their own scaling

**Methods:**
- `process(chunk, out, offset = 0)` → writes `numBins` values at `out[offset…]`, returns the time center (`number`) of this column
- `reset()` → clears overlap history and restarts time indexing

The first call to `process()` uses a zero-prefilled overlap buffer so one output column is returned immediately. Time zero is the first real sample. Column centres are `(hopsProcessed * hop + nperseg / 2 - noverlap) / fs`, using the hop count before the call. The first centre can be negative when overlap exceeds half the window. `reset()` restores this time origin.

**Example:**
```javascript
import { SpectrogramStream } from 'subnerodsp';

const signal = Float32Array.from([...]);
const stream = new SpectrogramStream({
  fs: 44100,
  nperseg: 1024,
  noverlap: 512,
  mode: 'magnitude'
});
const columnOut = new Float32Array(stream.numBins);

for (let offset = 0; offset + stream.hop <= signal.length; offset += stream.hop) {
  const chunk = signal.subarray(offset, offset + stream.hop);
  const time = stream.process(chunk, columnOut);
  console.log(time, columnOut[0]);
}
```

## `upconvert(x, options)`

Converts a complex baseband signal to a real passband signal centered at carrier frequency `fc`. Port of [SignalAnalysis.jl](https://github.com/org-arl/SignalAnalysis.jl)'s `upconvert()`.

Baseband signals are **interleaved complex**: `[I0, Q0, I1, Q1, ...]`. Passband signals are plain real arrays.

**Parameters:**
- `x` (Array | TypedArray): Baseband signal, interleaved complex (even length)
- `options.sps` (number, default: 1): Passband samples per baseband sample; must be a positive integer
- `options.fc` (number, default: 0): Carrier frequency, in the same units as `fs`
- `options.fs` (number, default: 1.0): Baseband sampling frequency. The output sample rate is `sps * fs`

**Returns:** `Float64Array` — the real passband signal.

When `sps > 1` the signal is interpolated with a root raised cosine pulse shape (roll-off β = 0.25, the SignalAnalysis.jl default; not configurable here). That pads the signal with 11 baseband samples of filter transient on each side, so the output length is `(x.length / 2 + 22) * sps`. When `sps === 1` no filtering is applied and the output length is `x.length / 2`.

**Example:**
```javascript
import { upconvert } from 'subnerodsp';

// 3 complex baseband samples at 8 kHz, carrier at 12 kHz, 4 samples per symbol
const baseband = [1, 0, 0, 1, -1, 0];
const passband = upconvert(baseband, { sps: 4, fc: 12000, fs: 8000 });
```

## `downconvert(x, options)`

Converts a real passband signal centered at `fc` back to complex baseband. Port of SignalAnalysis.jl's `downconvert()`.

**Parameters:**
- `x` (Array | TypedArray): Real passband signal
- `options.sps` (number, default: 1): Passband samples per baseband sample; must be a positive integer
- `options.fc` (number, default: 0): Carrier frequency, in the same units as `fs`
- `options.fs` (number, default: 1.0): Passband sampling frequency. The output sample rate is `fs / sps`

**Returns:** `Float64Array` — the baseband signal, interleaved complex, of length `2 * ceil(x.length / sps)`.

The negative frequency image is removed by taking the analytic signal (Hilbert transform, scaled by `1/√2` to undo the `√2` applied by `upconvert()`). When `sps > 1` the result is matched-filtered with the same root raised cosine pulse shape and decimated.

**Example:**
```javascript
import { downconvert } from 'subnerodsp';

const baseband = downconvert(passband, { sps: 4, fc: 12000, fs: 32000 });
const [i0, q0] = [baseband[0], baseband[1]];
```

## Usage Examples

### Basic PSD Estimation

```javascript
import { welch } from 'subnerodsp';

// Generate a 100 Hz sine wave
const fs = 1000;
const duration = 2;
const signal = new Array(fs * duration).fill(0).map((_, i) =>
  Math.sin(2 * Math.PI * 100 * i / fs)
);

const { frequencies, psd } = welch(signal, { fs, nperseg: 512 });

// Find peak frequency
const peakIdx = psd.indexOf(Math.max(...psd));
console.log(`Peak at ${frequencies[peakIdx].toFixed(2)} Hz`);
```

### Time-Frequency Analysis

```javascript
import { spectrogram } from 'subnerodsp';

// Chirp signal: frequency increases over time
const fs = 1000;
const duration = 2;
const signal = new Array(fs * duration).fill(0).map((_, i) => {
  const t = i / fs;
  const freq = 50 + 200 * t; // 50 Hz to 250 Hz
  return Math.sin(2 * Math.PI * freq * t);
});

const { frequencies, times, spectrogram: spec } = spectrogram(signal, {
  fs,
  nperseg: 256,
  noverlap: 192,
  mode: 'magnitude'
});

// spec[f][t] contains magnitude at frequency f and time t
console.log(`Spectrogram size: ${frequencies.length} × ${times.length}`);
```

### Streaming Time-Frequency Analysis

```javascript
import { SpectrogramStream } from 'subnerodsp';

const fs = 1000;
const stream = new SpectrogramStream({
  fs,
  nperseg: 256,
  noverlap: 128,
  mode: 'magnitude'
});
const columnOut = new Float32Array(stream.numBins);

function handleIncomingChunk(chunk) {
  if (chunk.length !== stream.hop) {
    throw new Error(`Expected ${stream.hop} samples`);
  }

  const time = stream.process(chunk, columnOut);
  console.log(`Column at ${time.toFixed(3)} s has ${columnOut.length} bins`);
}
```

### Streaming PSD

```javascript
import { WelchStream } from 'subnerodsp';

const stream = new WelchStream({ fs: 192000, nperseg: 1024, nfft: 2048, segments: 8 });
const out = new Float32Array(stream.numBins); // nfft/2 + 1

function handleIncomingSamples(ringBufferSamples) {
  stream.process(ringBufferSamples, out);
  console.log(`PSD updated, peak ${Math.max(...out).toFixed(1)} dB`);
}
```

### Custom Window Function

```javascript
import { welch } from 'subnerodsp';

// Create a Hamming window
const nperseg = 512;
const hammingWindow = new Array(nperseg).fill(0).map((_, n) =>
  0.54 - 0.46 * Math.cos(2 * Math.PI * n / (nperseg - 1))
);

const signal = [...]; // Your signal
const result = welch(signal, {
  fs: 1000,
  window: hammingWindow,
  nperseg
});
```

Typed-array inputs are read directly into reusable FFT work buffers. Both streaming `process()` methods require a nonnegative integer output offset and a destination with enough space for all bins. Destinations must be plain arrays, `Float32Array`, or `Float64Array`. Destination validation occurs before processing, so rejected destinations or offsets leave the output and spectrogram history unchanged.

## Important Notes

### Power-of-2 Requirement

Due to fft.js requirements, `nperseg` and `nfft` **must be powers of 2**:
- Valid: 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, etc.
- Invalid: 100, 200, 300, 500, etc.

The functions will throw an error if you provide non-power-of-2 values.

### Overlap Recommendations

- **Welch**: Default overlap is 50% (`noverlap = nperseg/2`), which is optimal for Hann window
- **Spectrogram**: Default overlap is 12.5% (`noverlap = nperseg/8`), which maintains statistical independence between segments

For `SpectrogramStream`, each call to `process(chunk, out)` must provide exactly one hop of new data:

```javascript
chunk.length === nperseg - noverlap
```

This strict contract keeps the API deterministic: one chunk in, one column written out.

For `WelchStream`, `process()` throws if `samples.length < stream.needed` (`nperseg + (segments-1)*nperseg/2`). Only the most recent `needed` samples are used.

### Analytic Signal Length

`downconvert()` computes the analytic signal at the original input length. Power-of-two lengths use fft.js directly; other lengths use Bluestein's chirp convolution with fft.js. The convolution uses padding internally without changing the signal's DFT length. Both paths take O(n log n) time, though arbitrary lengths need more work and temporary memory. As in SignalAnalysis.jl, the Hilbert transform assumes that the input block repeats periodically. Discontinuities between the end and beginning can cause boundary effects.

### Carrier Phase Precision

SignalAnalysis.jl stores its frame rate as `Float32`, so its carrier phase axis is single precision. This implementation mixes in double precision, so results agree with the Julia library to ~1e-5 over long signals rather than exactly — the difference is Julia's rounding, not ours. See `tests/generate_signalanalysis_reference.jl`.

### Scaling Options

- **'density'** (default): Returns power spectral density in V²/Hz units
- **'spectrum'**: Returns power spectrum in V² units

## Implementation Details

- Uses `realTransform` from fft.js for ~40% faster FFT on real signals
- Returns one-sided spectrum for real-valued inputs (DC to Nyquist)
- Applies proper normalization for both 'density' and 'spectrum' scaling
- Supports detrending to remove DC offset before FFT
- `SpectrogramStream` zero-prefills the initial overlap history so the first chunk immediately yields one column
- `WelchStream` and `SpectrogramStream` are allocation-free after construction: FFT plans, window arrays, and work buffers are allocated once per instance and reused across `.process()` calls
- `upconvert`/`downconvert` reproduce SignalAnalysis.jl, including DSP.jl's resampling group-delay compensation
- Validates all inputs and provides descriptive error messages

## Limitations (Simplified from SciPy)

- Only the Hann window is built in (custom windows supported via array)
- Only 'constant' detrending (remove mean) is implemented; any other `detrend` value disables detrending
- No multi-dimensional array support (1D signals only)
- Always returns one-sided spectrum (real input assumption)
- `upconvert`/`downconvert` use a fixed root raised cosine pulse shape (β = 0.25); the pulse shape is not configurable, and only integer `sps` is supported

