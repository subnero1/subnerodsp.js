# subnerodsp.js

Spectral analysis and baseband/passband conversion for JavaScript, in the browser and in Node.js.

- **Welch PSD** and **spectrograms**, numerically matched to `scipy.signal`
- **Streaming, allocation-free** versions of both, for live displays, Web Workers and audio callbacks
- **Upconversion and downconversion** between complex baseband and real passband, ported from [SignalAnalysis.jl](https://github.com/org-arl/SignalAnalysis.jl)
- Accepts plain arrays and any numeric typed array (`Float32Array`, `Float64Array`, `Int16Array`, ...)
- Pure ES modules with a single dependency, [fft.js](https://github.com/indutny/fft.js)

## Installation

Install from GitHub with any package manager:

```bash
pnpm add github:subnero1/subnerodsp.js#v1.0.0
# or
npm install github:subnero1/subnerodsp.js#v1.0.0
```

Everything is exported from the package root:

```javascript
import { welch, spectrogram, WelchStream, SpectrogramStream, upconvert, downconvert } from 'subnerodsp';
```

Requires an ES module environment: Node.js 18 or later, or any modern browser via a bundler such as Vite.

## Quick start

```javascript
import { welch, spectrogram } from 'subnerodsp';

// 2 seconds of a 100 Hz tone sampled at 1 kHz
const fs = 1000;
const signal = Float32Array.from({ length: 2 * fs }, (_, i) => Math.sin(2 * Math.PI * 100 * i / fs));

// Power spectral density
const { frequencies, psd } = welch(signal, { fs, nperseg: 512 });
const peak = psd.indexOf(Math.max(...psd));
console.log(`Peak at ${frequencies[peak].toFixed(1)} Hz`); // Peak at 99.6 Hz

// Spectrogram in dB, indexed as spec[frequency][time]
const { times, spectrogram: spec } = spectrogram(signal, { fs, nperseg: 256, mode: 'db' });
```

## API at a glance

| Export | Use it for | Output |
|---|---|---|
| `welch(x, options)` | PSD of a whole signal | `{ frequencies, psd }` as plain arrays |
| `spectrogram(x, options)` | Time-frequency view of a whole signal | `{ frequencies, times, spectrogram }`, with `spectrogram[f][t]` |
| `new WelchStream(options)` | Live PSD of the most recent samples in a buffer | Writes `numBins` values into your array |
| `new SpectrogramStream(options)` | Live spectrogram, one column per chunk | Writes `numBins` values into your array, returns the column time |
| `upconvert(x, options)` | Complex baseband to real passband | `Float64Array` |
| `downconvert(x, options)` | Real passband to complex baseband | `Float64Array`, interleaved complex |

Every option, default and property is documented in the [API reference](docs/DSP.md).

### Common options

| Option | Default | Meaning |
|---|---|---|
| `fs` | `1.0` | Sampling rate. Frequencies and times come back in matching units (Hz and seconds if `fs` is in Hz). |
| `nperseg` | `256` (`1024` for `WelchStream`) | Segment length. Must be a power of 2 and no longer than the signal. |
| `noverlap` | `nperseg/2` (Welch), `nperseg/8` (spectrogram) | Samples shared by neighbouring segments. |
| `nfft` | `nperseg` | FFT length. A power of 2, at least `nperseg`. Larger values zero-pad for a smoother-looking spectrum. |
| `window` | `'hann'` | `'hann'`, or your own array of length `nperseg`. |
| `detrend` | `'constant'` | `'constant'` removes each segment's mean. Any other value, such as `false`, disables detrending. |
| `scaling` | `'density'` | `'density'` gives V²/Hz, `'spectrum'` gives V². Applies to `mode: 'psd'`. |
| `mode` | `'psd'` (`'db'` for the streams) | `'psd'`, `'magnitude'` or `'db'`. Not available on `welch()`. |

## Choosing parameters

The segment length trades frequency resolution against time resolution and variance:

- **Bin spacing** is `fs / nfft`. Raising `nfft` above `nperseg` interpolates the spectrum but does not separate closer tones.
- **Frequency resolution** is roughly `2 * fs / nperseg` with the Hann window. To tell apart two tones `Δf` apart, use `nperseg ≥ 2 * fs / Δf`.
- **Spectrogram time step** is `(nperseg - noverlap) / fs` seconds per column.
- **Welch variance** drops as more segments are averaged. For a fixed signal length, a shorter `nperseg` gives a smoother but coarser PSD.

For example, at `fs = 48000` with `nperseg = 1024`, bins are 46.9 Hz apart, and a spectrogram with `noverlap = 512` produces a column every 10.7 ms.

## Streaming

`WelchStream` and `SpectrogramStream` take the same options as `welch()` and `spectrogram()`. You construct them once, then call `process()` repeatedly. They allocate nothing after construction and write into an array you own, so they suit render loops and audio callbacks.

**Live spectrogram (waterfall).** Feed exactly `stream.hop` new samples per call and get one column back:

```javascript
import { SpectrogramStream } from 'subnerodsp';

const stream = new SpectrogramStream({ fs: 48000, nperseg: 1024, noverlap: 512 }); // dB by default
const column = new Float32Array(stream.numBins);

function onSamples(chunk) {                 // chunk.length === stream.hop (512 here)
  const t = stream.process(chunk, column);  // centre time of this column, in seconds
  drawColumn(t, column);                    // column[i] is the level at stream.frequencies[i]
}
```

The first column is computed against zero-filled history, so output starts immediately. Call `stream.reset()` to start a new recording.

**Live PSD.** Keep the latest samples in a buffer and estimate from its tail:

```javascript
import { WelchStream } from 'subnerodsp';

const stream = new WelchStream({ fs: 48000, nperseg: 1024, segments: 8 }); // dB by default
const out = new Float32Array(stream.numBins);

// buffer must hold at least stream.needed samples; the most recent ones are used
stream.process(buffer, out);
```

`WelchStream` averages `segments` half-overlapped segments, so it needs `stream.needed = nperseg + (segments - 1) * nperseg / 2` samples and throws if given fewer. Both streams take an optional `offset` argument to `process()`, to write into one row of a larger array.

### Output modes and dB

| `mode` | Value per bin |
|---|---|
| `'psd'` | Power, scaled by `scaling` (V²/Hz or V²) |
| `'magnitude'` | Amplitude spectral density, `|X| / √(fs · Σw²)` |
| `'db'` in `spectrogram` / `SpectrogramStream` | Amplitude spectrum in dB, `20·log10(2·|X| / Σw + dbEps)`. A full-scale sine reads close to 0 dB. |
| `'db'` in `WelchStream` | Power spectral density in dB, `10·log10(psd + dbEps)` |

Here `X` is the FFT of the windowed segment and `w` is the window. `dbEps` sets the floor that silent bins settle at. It defaults to `1e-12` for spectrograms and `1e-20` for `WelchStream`.

## Baseband and passband

Baseband signals are complex and stored **interleaved**: `[I0, Q0, I1, Q1, ...]`. Passband signals are real.

```javascript
import { upconvert, downconvert } from 'subnerodsp';

const baseband = [1, 0, 0, 1, -1, 0];    // 3 complex samples: 1, j, -1
const fs = 8000;                          // baseband sample rate
const sps = 4;                            // passband samples per baseband sample

const passband = upconvert(baseband, { sps, fc: 12000, fs });              // sampled at sps * fs = 32 kHz
const recovered = downconvert(passband, { sps, fc: 12000, fs: sps * fs }); // back to 8 kHz baseband
```

In both functions `fs` is the rate of the **input** signal. With `sps > 1` both apply a root raised cosine filter (β = 0.25). `upconvert` adds 11 baseband samples of filter transient on each side, so its output has `(x.length / 2 + 22) * sps` samples.

## Limitations

- `nperseg` and `nfft` must be powers of 2. Other values throw.
- The only built-in window is Hann. Pass an array for others, such as Hamming or Blackman.
- Detrending removes the mean or nothing. There is no linear detrend.
- Spectra are one-sided (DC to Nyquist), because inputs are assumed real.
- `upconvert`/`downconvert` use a fixed root raised cosine pulse (β = 0.25) and integer `sps` only.
- No TypeScript declarations yet. The JSDoc in `src/dsp.js` gives editors type hints.

## Accuracy

The test suite compares outputs against reference data generated by the libraries this one follows:

- `welch` and `spectrogram` against **SciPy** (`scipy.signal`), typically agreeing to 1e-12 relative error.
- `upconvert` and `downconvert` against **SignalAnalysis.jl**, to 1e-9 against a double-precision run of the same algorithm. SignalAnalysis.jl itself keeps carrier phase in `Float32`, so agreement with its raw output is about 1e-5.

See [tests/README.md](tests/README.md) for details and for how to regenerate the reference data.

## Development

```bash
pnpm install
pnpm test          # all tests
pnpm test:unit     # unit tests only
pnpm test:scipy    # SciPy validation
pnpm test:julia    # SignalAnalysis.jl validation
pnpm demo          # run examples/dsp_demo.js
```

## License

[MIT](LICENSE)
