# subnerodsp.js

Digital signal processing functions for computing power spectral density and spectrograms of real-valued audio signals, optimized for web-based visualization, plus baseband/passband conversion ported from [SignalAnalysis.jl](https://github.com/org-arl/SignalAnalysis.jl).
These APIs accept plain JavaScript arrays and numeric typed arrays such as `Float32Array` and `Float64Array`.

## Installation

```bash
pnpm add subnerodsp
```

## Quick Start

```javascript
import { welch, WelchStream, spectrogram, SpectrogramStream } from 'subnerodsp';

// Generate a test signal
const fs = 1000; // 1 kHz sampling rate
const signal = Float32Array.from({ length: 2000 }, (_, i) =>
  Math.sin(2 * Math.PI * 100 * i / fs)
);

// Compute power spectral density
const psd = welch(signal, { fs, nperseg: 512 });
console.log(psd.frequencies); // Frequency bins
console.log(psd.psd);         // Power values

// Streaming PSD: write directly into a caller-owned buffer, no allocation
// after construction
const welchStream = new WelchStream({ fs, nperseg: 1024, nfft: 2048, segments: 8 });
const psdOut = new Float32Array(welchStream.numBins);
welchStream.process(signal, psdOut); // dB by default

// Compute spectrogram
const spec = spectrogram(signal, { fs, nperseg: 256, mode: 'magnitude' });
console.log(spec.frequencies);  // Frequency bins
console.log(spec.times);        // Time bins
console.log(spec.spectrogram);  // 2D array [freq][time]

// Streaming spectrogram: one column (in dB) per hop into a caller-owned buffer
const specStream = new SpectrogramStream({ fs, nperseg: 256, noverlap: 128 });
const columnOut = new Float32Array(specStream.numBins);
const chunk = signal.slice(0, specStream.hop);
const time = specStream.process(chunk, columnOut);
console.log(time);       // Center time of this column
console.log(columnOut);  // 1D array across frequencies
```

`WelchStream` and `SpectrogramStream` are the allocation-free, streaming counterparts of `welch()` and `spectrogram()` respectively — same option names, same `mode` choices (`'psd'`, `'magnitude'`, `'db'`), constructed once and reused via `.process()`.

## Functions

### `welch(signal, options)`

Estimates power spectral density using Welch's method with overlapping segments.

**Parameters:**
- `signal` (number[] | TypedArray): Input signal (real-valued)
- `options` (Object):
  - `fs` (number, default: 1.0): Sampling frequency in Hz
  - `window` (string | number[] | TypedArray, default: 'hann'): Window type or custom array
  - `nperseg` (number, default: 256): Segment length (must be power of 2)
  - `noverlap` (number, default: nperseg/2): Overlap between segments
  - `nfft` (number, default: nperseg): FFT length (power of 2, >= nperseg)
  - `detrend` (string | boolean, default: 'constant'): Detrend type
  - `scaling` (string, default: 'density'): 'density' or 'spectrum'

**Returns:** `{frequencies: number[], psd: number[]}`

### `new WelchStream(options)`

Computes a Welch PSD one estimate at a time from a caller-owned buffer (e.g. a ring buffer), writing into a caller-supplied array. Allocation-free after construction. Strict: unlike `welch()`, it does not clamp `nperseg` to fit short input — callers must ensure enough samples. Always reads the **most recent** samples (the tail of the input), so it fits a live/streaming PSD.

**Parameters:**
- `options` (Object):
  - `fs` (number, default: 1.0): Sampling frequency in Hz
  - `window` (string | number[] | TypedArray, default: 'hann'): Window type or custom array
  - `nperseg` (number, default: 1024): Segment length (power of 2)
  - `nfft` (number, default: nperseg): FFT length (power of 2, >= nperseg)
  - `segments` (number, default: 8): Number of 50%-overlapped segments to average
  - `detrend` (string | boolean, default: 'constant'): Detrend type
  - `scaling` (string, default: 'density'): 'density' or 'spectrum' (mode 'psd' only)
  - `mode` (string, default: 'db'): 'db', 'magnitude' or 'psd'
  - `dbEps` (number, default: 1e-20): Power floor added before `10*log10` (mode 'db' only)

**Properties and methods:**
- `numBins` - Number of frequency bins written per call, equal to `nfft/2 + 1`
- `needed` - Minimum input length required by `process()`, equal to `nperseg + (segments-1)*nperseg/2`
- `frequencies` - Cached frequency bins
- `windowSum` / `windowSumSquares` - Window normalization constants
- `process(samples, out, offset = 0)` - Writes `numBins` values at `out[offset…]`, returns bins written (`numBins`)

### `spectrogram(signal, options)`

Computes time-frequency representation using short-time Fourier transform (STFT).

**Parameters:**
- Same as `welch()`, plus:
  - `noverlap` (default: nperseg/8 for spectrograms)
  - `mode` (string, default: 'psd'): Output mode ('psd', 'magnitude' or 'db')
  - `dbEps` (number, default: 1e-12): Amplitude floor added before `log10` (mode 'db' only)

**Returns:** `{frequencies: number[], times: number[], spectrogram: number[][]}`

### `new SpectrogramStream(options)`

Computes one spectrogram time slice (column) at a time from a fixed-size input stream, writing each column into a caller-supplied buffer. Allocation-free after construction.

**Parameters:**
- Same options as `spectrogram()`, but `mode` defaults to `'db'`

**Properties and methods:**
- `hop` - Required input chunk length for each `process()` call, equal to `nperseg - noverlap`
- `numBins` - Number of frequency bins written per column
- `frequencies` - Cached frequency bins for all returned columns
- `windowSum` / `windowSumSquares` - Window normalization constants, exposed for callers doing their own scaling
- `process(chunk, out, offset = 0)` - Writes `numBins` values at `out[offset…]` and returns the time center (a number) of this column
- `reset()` - Clears internal overlap history and restarts time indexing

The first `process()` call uses a zero-prefilled overlap buffer so the stream returns one column immediately.

### `upconvert(x, options)`

Converts a complex baseband signal to a real passband signal centered at carrier frequency `fc`. Baseband signals are interleaved complex (`[I0, Q0, I1, Q1, ...]`); passband signals are plain real arrays.

**Parameters:**
- `x` - Baseband signal, interleaved complex (even length)
- `sps` (number, default: 1) - Passband samples per baseband sample; positive integer
- `fc` (number, default: 0) - Carrier frequency, same units as `fs`
- `fs` (number, default: 1.0) - Baseband sampling frequency; output rate is `sps * fs`

**Returns:** `Float64Array` - the real passband signal

When `sps > 1` the signal is interpolated with a root raised cosine pulse shape (β = 0.25), which adds 11 baseband samples of filter transient on each side, so the output length is `(x.length / 2 + 22) * sps`.

### `downconvert(x, options)`

Converts a real passband signal centered at `fc` back to complex baseband, removing the negative frequency image via the analytic signal, then matched-filtering and decimating when `sps > 1`.

**Parameters:**
- `x` - Real passband signal
- `sps` (number, default: 1) - Passband samples per baseband sample; positive integer
- `fc` (number, default: 0) - Carrier frequency, same units as `fs`
- `fs` (number, default: 1.0) - Passband sampling frequency; output rate is `fs / sps`

**Returns:** `Float64Array` - baseband signal, interleaved complex, length `2 * ceil(x.length / sps)`

## Examples

**Detect peak frequency**
```javascript
const { frequencies, psd } = welch(signal, { fs: 1000, nperseg: 1024 });
const peakIdx = psd.indexOf(Math.max(...psd));
console.log(`Peak at ${frequencies[peakIdx].toFixed(2)} Hz`);
```

**Baseband to passband and back**
```javascript
import { upconvert, downconvert } from 'subnerodsp';

// 3 complex baseband samples, 4 passband samples per baseband sample
const baseband = [1, 0, 0, 1, -1, 0];
const passband = upconvert(baseband, { sps: 4, fc: 12000, fs: 8000 });

// Back to baseband at the passband rate of sps * fs
const recovered = downconvert(passband, { sps: 4, fc: 12000, fs: 32000 });
```

**Custom Hamming window**
```javascript
const nperseg = 512;
const window = new Array(nperseg).fill(0).map((_, n) =>
  0.54 - 0.46 * Math.cos(2 * Math.PI * n / (nperseg - 1))
);

const result = welch(signal, { fs: 1000, window, nperseg });
```

Typed-array inputs are processed directly. When the source signal is a typed array, segment extraction uses typed-array views instead of first converting the full signal into a plain array.

**Time-frequency chirp analysis**
```javascript
// Generate chirp: frequency increases over time
const signal = new Array(2000).fill(0).map((_, i) => {
  const t = i / 1000;
  return Math.sin(2 * Math.PI * (50 + 200 * t) * t);
});

const { frequencies, times, spectrogram: spec } = spectrogram(signal, {
  fs: 1000,
  nperseg: 256,
  mode: 'magnitude'
});

// spec[f][t] shows energy distribution over time and frequency
```

**Streaming spectrogram**
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

for (let offset = 0; offset + stream.hop <= signal.length; offset += stream.hop) {
  const chunk = signal.slice(offset, offset + stream.hop);
  const time = stream.process(chunk, columnOut);
  console.log(time, columnOut[0]);
}
```

**Streaming PSD**
```javascript
import { WelchStream } from 'subnerodsp';

const fs = 1000;
const stream = new WelchStream({ fs, nperseg: 1024, nfft: 2048, segments: 8 });
const out = new Float32Array(stream.numBins);
stream.process(signal, out);
console.log(out); // dB values, most-recent-samples PSD estimate
```

## Important Notes

- **Power-of-2 requirement**: `nperseg` and `nfft` must be powers of 2 (2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, etc.) due to FFT.js requirements
- **Overlap recommendations**:
  - Welch: 50% overlap (nperseg/2) optimal for Hann window
  - Spectrogram: 12.5% overlap (nperseg/8) for statistical independence
- **Streaming chunk contract**: `SpectrogramStream.process(chunk, out)` requires exactly `nperseg - noverlap` samples and writes exactly one new column
- **`WelchStream` is strict**: unlike `welch()`, it does not clamp `nperseg` to fit short input — `process()` throws if `samples.length` is below `nperseg + (segments-1)*nperseg/2` (exposed as `stream.needed`)
- **Streaming startup behavior**: The first streaming column is computed with zero-prefilled history for the missing overlap samples
- **Scaling**: 'density' returns V²/Hz, 'spectrum' returns V²
- **One-sided spectrum**: Always returned for real-valued inputs (DC to Nyquist)
- **Pulse shaping**: `upconvert`/`downconvert` always use a root raised cosine pulse shape with β = 0.25 (the SignalAnalysis.jl default) and integer `sps` only
- **Analytic signal length**: `downconvert` zero-pads to a power-of-2 length for the FFT; use power-of-2 passband lengths for exact agreement with SignalAnalysis.jl

For complete documentation, see [docs/DSP.md](docs/DSP.md).

## Testing

Run all tests:
```bash
pnpm test
```

Run specific test suites:
```bash
pnpm test:unit
pnpm test:scipy
pnpm test:julia
```

`pnpm test:scipy` and `pnpm test:julia` validate the DSP functions against reference data from SciPy and SignalAnalysis.jl. See [tests/README.md](tests/README.md) for how to regenerate that data.

## Demo

Run the DSP demo:
```bash
pnpm demo
```

## Dependencies

- [fft.js](https://github.com/indutny/fft.js) - Fast Fourier Transform implementation

## License

MIT
