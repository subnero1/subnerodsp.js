# DSP Functions for JavaScript

This module provides digital signal processing functions for computing power spectral density (PSD) and spectrograms of real-valued signals, designed for web-based audio analysis and visualization.

The DSP APIs accept plain JavaScript arrays and numeric typed arrays such as `Float32Array`, `Float64Array`, and integer typed arrays.

## Features

- **Welch's Method** - Robust power spectral density estimation with overlapping segments
- **Spectrogram** - Time-frequency analysis using short-time Fourier transform (STFT)
- **Streaming Spectrogram** - One spectrogram column per fixed-size input chunk
- **Built on fft.js** - Fast FFT implementation optimized for JavaScript
- **Simple API** - Inspired by scipy.signal for ease of use
- **Custom Windows** - Support for built-in and user-defined window functions

## Installation

```bash
pnpm install
```

The module requires `fft.js` for FFT computation.

## API Reference

### `welch(x, options)`

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
import { welch } from './src/dsp.js';

const signal = Float32Array.from([...]); // Your audio signal
const result = welch(signal, {
  fs: 44100,      // 44.1 kHz sample rate
  nperseg: 2048,  // 2048-point segments
  noverlap: 1024  // 50% overlap
});

console.log(result.frequencies); // Frequency bins
console.log(result.psd);         // Power spectral density
```

### `spectrogram(x, options)`

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
  - `mode` (string, default: 'psd'): Output mode ('psd' or 'magnitude')

**Returns:** `{frequencies: number[], times: number[], spectrogram: number[][]}`

The `spectrogram` is a 2D array where `spectrogram[f][t]` is the value at frequency index `f` and time index `t`.

**Example:**
```javascript
import { spectrogram } from './src/dsp.js';

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

### `new SpectrogramStream(options)`

Computes a spectrogram one time slice at a time from streaming input.

**Parameters:**
- Same as `spectrogram(x, options)`

**Properties:**
- `chunkSize` (number): Required input length for each `process()` call, equal to `nperseg - noverlap`
- `frequencies` (number[]): Cached one-sided frequency bins

**Methods:**
- `process(chunk)` → `{frequencies: number[], time: number, spectrogram: number[]}`
- `reset()` → clears overlap history and restarts time indexing

The first call to `process()` uses a zero-prefilled overlap buffer so one output column is returned immediately.

**Example:**
```javascript
import { SpectrogramStream } from './src/dsp.js';

const signal = Float32Array.from([...]);
const stream = new SpectrogramStream({
  fs: 44100,
  nperseg: 1024,
  noverlap: 512,
  mode: 'magnitude'
});

for (let offset = 0; offset + stream.chunkSize <= signal.length; offset += stream.chunkSize) {
  const chunk = signal.subarray(offset, offset + stream.chunkSize);
  const result = stream.process(chunk);
  console.log(result.time, result.spectrogram[0]);
}
```

## Usage Examples

### Basic PSD Estimation

```javascript
import { welch } from './src/dsp.js';

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
import { spectrogram } from './src/dsp.js';

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
import { SpectrogramStream } from './src/dsp.js';

const fs = 1000;
const stream = new SpectrogramStream({
  fs,
  nperseg: 256,
  noverlap: 128,
  mode: 'magnitude'
});

function handleIncomingChunk(chunk) {
  if (chunk.length !== stream.chunkSize) {
    throw new Error(`Expected ${stream.chunkSize} samples`);
  }

  const { time, spectrogram } = stream.process(chunk);
  console.log(`Column at ${time.toFixed(3)} s has ${spectrogram.length} bins`);
}
```

### Custom Window Function

```javascript
import { welch } from './src/dsp.js';

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

Typed-array inputs are consumed directly. When the source signal is a typed array, overlapping segments are taken as typed-array views rather than copying the entire input into a plain array first.

## Important Notes

### Power-of-2 Requirement

Due to fft.js requirements, `nperseg` and `nfft` **must be powers of 2**:
- Valid: 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, etc.
- Invalid: 100, 200, 300, 500, etc.

The functions will throw an error if you provide non-power-of-2 values.

### Overlap Recommendations

- **Welch**: Default overlap is 50% (`noverlap = nperseg/2`), which is optimal for Hann window
- **Spectrogram**: Default overlap is 12.5% (`noverlap = nperseg/8`), which maintains statistical independence between segments

For `SpectrogramStream`, each call to `process(chunk)` must provide exactly one hop of new data:

```javascript
chunk.length === nperseg - noverlap
```

This strict contract keeps the API deterministic: one chunk in, one column out.

### Scaling Options

- **'density'** (default): Returns power spectral density in V²/Hz units
- **'spectrum'**: Returns power spectrum in V² units

## Testing

Run the test suite:

```bash
pnpm test:dsp
```

Run the demo:

```bash
pnpm demo:dsp
```

## Implementation Details

- Uses `realTransform` from fft.js for ~40% faster FFT on real signals
- Returns one-sided spectrum for real-valued inputs (DC to Nyquist)
- Applies proper normalization for both 'density' and 'spectrum' scaling
- Supports detrending to remove DC offset before FFT
- `SpectrogramStream` zero-prefills the initial overlap history so the first chunk immediately yields one column
- Validates all inputs and provides descriptive error messages

## Limitations (Simplified from SciPy)

- Only Hann window built-in (custom windows supported via array)
- Only 'constant' detrending (remove mean) implemented
- No multi-dimensional array support (1D signals only)
- Always returns one-sided spectrum (real input assumption)

## License

MIT
