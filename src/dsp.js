import FFT from 'fft.js';

/**
 * Checks whether a value is a plain array or a numeric typed array.
 * @param {unknown} value - The value to validate
 * @returns {boolean} True if the value supports numeric indexed access
 */
function isNumericArrayLike(value) {
  return Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
}

/**
 * Sums numeric values in an array-like input.
 * @param {ArrayLike<number>} values - Values to sum
 * @returns {number} Sum of all entries
 */
function sumArrayLike(values) {
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }
  return sum;
}

/**
 * Sums squared numeric values in an array-like input.
 * @param {ArrayLike<number>} values - Values to sum
 * @returns {number} Sum of squared entries
 */
function sumSquaresArrayLike(values) {
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] * values[i];
  }
  return sum;
}

/**
 * Checks if a number is a power of 2.
 * @param {number} n - The number to check
 * @returns {boolean} True if n is a power of 2
 */
function isPowerOf2(n) {
  return Number.isInteger(n) && n >= 2 && n <= 2 ** 29 && (n & (n - 1)) === 0;
}

/**
 * Validates that nperseg is a power of 2 (required by fft.js).
 * @param {number} nperseg - The segment length to validate
 * @throws {Error} If nperseg is not a power of 2
 */
function validatePowerOf2(nperseg) {
  if (!isPowerOf2(nperseg)) {
    throw new Error(
      `nperseg must be a power of 2 (2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, etc.). Got ${nperseg}`
    );
  }
}

/** Validates the input sampling rate. */
function validateFs(fs) {
  if (!Number.isFinite(fs) || fs <= 0) {
    throw new Error(`fs must be finite and positive. Got ${fs}`);
  }
}

/** Validates a destination before a stream reads or advances its history. */
function validateOutput(out, offset, numBins) {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error(`offset must be a nonnegative integer. Got ${offset}`);
  }
  if (!(Array.isArray(out) || out instanceof Float32Array || out instanceof Float64Array)) {
    throw new Error('Output must be an array, Float32Array, or Float64Array');
  }
  if (out.length < offset + numBins) {
    throw new Error(`Output must hold ${numBins} values at offset ${offset}`);
  }
}

/**
 * Validates spectrogram/spectral scaling mode.
 * @param {string} scaling - Scaling mode
 * @throws {Error} If scaling is unsupported
 */
function validateScaling(scaling) {
  if (scaling !== 'density' && scaling !== 'spectrum') {
    throw new Error(`Unsupported scaling: ${scaling}. Use 'density' or 'spectrum'.`);
  }
}

/**
 * Validates spectrogram output mode.
 * @param {string} mode - Spectrogram mode
 * @throws {Error} If mode is unsupported
 */
function validateSpectrogramMode(mode) {
  if (mode !== 'psd' && mode !== 'magnitude' && mode !== 'db') {
    throw new Error(`Unsupported mode: ${mode}. Use 'psd', 'magnitude' or 'db'.`);
  }
}

/**
 * Generates a Hann window of the specified length.
 * Uses periodic version (matches SciPy's default for spectral estimation).
 * @param {number} length - The length of the window
 * @returns {Float64Array} The Hann window
 */
function hannWindow(length) {
  const window = new Float64Array(length);
  for (let n = 0; n < length; n++) {
    // Periodic window: 0.5 - 0.5 * cos(2*pi*n / N)
    // This matches scipy's default for spectral estimation
    window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / length);
  }
  return window;
}

/**
 * Generates frequency bins for one-sided spectrum.
 * @param {number} nfft - The FFT size
 * @param {number} fs - The sampling frequency
 * @returns {number[]} Array of frequency values
 */
function getFrequencies(nfft, fs) {
  const numFreqs = Math.floor(nfft / 2) + 1;
  const frequencies = new Array(numFreqs);
  const df = fs / nfft;

  for (let i = 0; i < numFreqs; i++) {
    frequencies[i] = i * df;
  }

  return frequencies;
}

/**
 * Resolves a built-in or custom window specification.
 * @param {string|ArrayLike<number>} window - Window type or samples
 * @param {number} nperseg - Segment length
 * @returns {Float64Array} Window samples
 */
function resolveWindow(window, nperseg) {
  if (typeof window === 'string') {
    if (window === 'hann') {
      return hannWindow(nperseg);
    }

    throw new Error(`Unsupported window type: ${window}. Use 'hann' or provide a custom window array.`);
  }

  if (isNumericArrayLike(window)) {
    if (window.length !== nperseg) {
      throw new Error(`Custom window length (${window.length}) must match nperseg (${nperseg})`);
    }

    return Float64Array.from(window);
  }

  throw new Error('window must be a string, array, or typed array');
}

/**
 * Builds validated, reusable state for spectral computations.
 *
 * The returned state owns every work buffer the transform needs, so repeated
 * calls through {@link magSqInto} allocate nothing.
 *
 * @param {Object} options - Spectral options
 * @param {number} [options.fs=1.0] - Sampling frequency
 * @param {string|ArrayLike<number>} [options.window='hann'] - Window type or samples
 * @param {number} [options.nperseg=256] - Segment length
 * @param {number|null} [options.noverlap=null] - Overlap length (default nperseg/8)
 * @param {number|null} [options.nfft=null] - FFT length
 * @param {string|boolean} [options.detrend='constant'] - Detrend mode
 * @param {string} [options.scaling='density'] - Spectral scaling
 * @param {string} [options.mode='psd'] - Output mode
 * @returns {Object} Validated configuration and cached work buffers
 */
function createDspState({
  fs = 1.0,
  window = 'hann',
  nperseg = 256,
  noverlap = null,
  nfft = null,
  detrend = 'constant',
  scaling = 'density',
  mode = 'psd'
} = {}) {
  validateFs(fs);
  validatePowerOf2(nperseg);
  validateSpectrogramMode(mode);
  validateScaling(scaling);

  if (noverlap === null) {
    noverlap = Math.floor(nperseg / 8);
  }

  if (nfft === null) {
    nfft = nperseg;
  }

  validatePowerOf2(nfft);

  if (nfft < nperseg) {
    throw new Error(`nfft (${nfft}) must be >= nperseg (${nperseg})`);
  }

  if (noverlap >= nperseg) {
    throw new Error(`noverlap (${noverlap}) must be < nperseg (${nperseg})`);
  }

  if (!Number.isInteger(noverlap) || noverlap < 0) {
    throw new Error(`noverlap (${noverlap}) must be a nonnegative integer`);
  }

  const windowArray = resolveWindow(window, nperseg);
  const windowSumSquares = sumSquaresArrayLike(windowArray);
  const windowSum = sumArrayLike(windowArray);
  if (!windowArray.every(Number.isFinite) || !Number.isFinite(windowSumSquares) || windowSumSquares <= 0) {
    throw new Error('Window must contain finite samples and have finite, positive energy');
  }
  const windowNormalization = mode === 'db' ? Math.abs(windowSum) : windowSum * windowSum;
  if ((mode === 'db' || (mode === 'psd' && scaling === 'spectrum')) &&
      (!Number.isFinite(windowNormalization) || windowNormalization <= 0)) {
    throw new Error('Window must have a finite, nonzero sum for this normalization');
  }
  const fft = new FFT(nfft);
  const numFreqs = Math.floor(nfft / 2) + 1;

  return {
    fs,
    windowArray,
    nperseg,
    noverlap,
    nfft,
    detrend,
    scaling,
    mode,
    step: nperseg - noverlap,
    fft,
    numFreqs,
    frequencies: getFrequencies(nfft, fs),
    windowSumSquares,
    windowSum,
    // Work buffers, reused across calls. The [nperseg, nfft) tail of fftInput
    // stays zero (zero-padding) because only [0, nperseg) is ever written.
    fftInput: new Float64Array(nfft),
    fftOutput: fft.createComplexArray(),
    magSq: new Float64Array(numFreqs),
    magSqSum: new Float64Array(numFreqs)
  };
}

/**
 * Transforms one segment and writes its one-sided magnitude-squared spectrum
 * into `state.magSq`. Allocation-free.
 *
 * @param {Object} state - State from createDspState()
 * @param {ArrayLike<number>} x - Input signal
 * @param {number} offset - Index of the segment's first sample in x
 */
function magSqInto(state, x, offset) {
  const { nperseg, numFreqs, windowArray, fftInput, fftOutput, magSq } = state;

  let mean = 0;
  if (state.detrend === 'constant') {
    let sum = 0;
    for (let i = 0; i < nperseg; i++) {
      sum += x[offset + i];
    }
    mean = sum / nperseg;
  }

  for (let i = 0; i < nperseg; i++) {
    fftInput[i] = (x[offset + i] - mean) * windowArray[i];
  }

  state.fft.realTransform(fftOutput, fftInput);
  state.fft.completeSpectrum(fftOutput);

  for (let i = 0; i < numFreqs; i++) {
    const real = fftOutput[i * 2];
    const imag = fftOutput[i * 2 + 1];
    magSq[i] = real * real + imag * imag;
  }
}

/**
 * Converts one magnitude-squared spectrum to the configured output mode and
 * writes it into `out` starting at `offset`. Allocation-free.
 *
 * @param {Object} state - State from createDspState()
 * @param {ArrayLike<number>} magSq - Magnitude-squared spectrum (usually state.magSq)
 * @param {number[]|Float32Array|Float64Array} out - Destination
 * @param {number} [offset=0] - Destination offset
 */
function scaleInto(state, magSq, out, offset = 0) {
  const { numFreqs, fs, windowSum, windowSumSquares } = state;

  for (let i = 0; i < numFreqs; i++) {
    let value;

    if (state.mode === 'magnitude') {
      value = Math.sqrt(magSq[i]) / Math.sqrt(windowSumSquares * fs);
    } else if (state.mode === 'db') {
      // Amplitude spectrum in dB. Equals the legacy display-dB conversion
      // 20*log10(magnitudeMode * sqrt(windowSumSquares * fs) * 2 / abs(windowSum)).
      value = 20 * Math.log10((Math.sqrt(magSq[i]) * 2) / Math.abs(windowSum) + state.dbEps);
    } else {
      value = magSq[i];

      if (state.scaling === 'density') {
        value = value / (fs * windowSumSquares);
      } else {
        value = value / (windowSum * windowSum);
      }

      if (i > 0 && i < numFreqs - 1) {
        value *= 2;
      }
    }

    out[offset + i] = value;
  }
}

/**
 * Streaming short-time Fourier transform.
 *
 * Consumes exactly one hop of new samples per call and writes one spectral
 * column into a caller-supplied array (typically a slot of a ring buffer).
 * After construction it allocates nothing. The streaming counterpart of
 * {@link spectrogram}, with the same `mode` choices.
 */
export class SpectrogramStream {
  /**
   * @param {Object} options - Configuration
   * @param {number} [options.fs=1.0] - Sampling frequency
   * @param {string|ArrayLike<number>} [options.window='hann'] - Window type or samples
   * @param {number} [options.nperseg=256] - Segment (window) length, power of 2
   * @param {number|null} [options.noverlap=null] - Overlap length (default nperseg/8)
   * @param {number|null} [options.nfft=null] - FFT length (default nperseg)
   * @param {string|boolean} [options.detrend='constant'] - Detrend type
   * @param {string} [options.scaling='density'] - 'density' or 'spectrum' (mode 'psd' only)
   * @param {string} [options.mode='db'] - 'db', 'magnitude' or 'psd'
   * @param {number} [options.dbEps=1e-12] - Amplitude floor added before log (mode 'db')
   */
  constructor({ mode = 'db', dbEps = 1e-12, ...options } = {}) {
    const state = createDspState({ ...options, mode });
    state.dbEps = dbEps;

    this.fs = state.fs;
    this.nperseg = state.nperseg;
    this.noverlap = state.noverlap;
    this.nfft = state.nfft;
    this.detrend = state.detrend;
    this.scaling = state.scaling;
    this.mode = state.mode;
    this.dbEps = dbEps;
    this.hop = state.step;
    this.numBins = state.numFreqs;
    this.frequencies = state.frequencies;
    this.windowSum = state.windowSum;
    this.windowSumSquares = state.windowSumSquares;

    this._state = state;
    this._segment = new Float64Array(state.nperseg);
    this.reset();
  }

  /**
   * Clears overlap history and the time origin.
   */
  reset() {
    this._segment.fill(0);
    this.hopsProcessed = 0;
  }

  /**
   * Processes one hop of new samples and writes one column of `numBins` values.
   *
   * @param {ArrayLike<number>} chunk - Exactly `hop` new samples
   * @param {number[]|Float32Array|Float64Array} out - Destination for the column
   * @param {number} [offset=0] - Destination offset
   * @returns {number} Time centre of this column, in seconds
   */
  process(chunk, out, offset = 0) {
    if (!isNumericArrayLike(chunk) || chunk.length === 0) {
      throw new Error('Input chunk must be a non-empty array or typed array');
    }

    if (chunk.length !== this.hop) {
      throw new Error(`Input chunk length (${chunk.length}) must equal hop (${this.hop})`);
    }

    validateOutput(out, offset, this.numBins);

    this._segment.copyWithin(0, this.hop);
    this._segment.set(chunk, this.noverlap);

    magSqInto(this._state, this._segment, 0);
    scaleInto(this._state, this._state.magSq, out, offset);

    const time = (this.hopsProcessed * this.hop + this.nperseg / 2 - this.noverlap) / this.fs;
    this.hopsProcessed += 1;

    return time;
  }
}

/**
 * Streaming Welch PSD estimator.
 *
 * Each call reads the tail of a caller-owned buffer (e.g. a ring buffer) and
 * writes one spectral estimate into a caller-supplied array — no clamping,
 * no accumulation between calls. After construction it allocates nothing.
 * The streaming counterpart of {@link welch}, with the same `mode` choices
 * as {@link SpectrogramStream}.
 */
export class WelchStream {
  /**
   * @param {Object} options - Configuration
   * @param {number} [options.fs=1.0] - Sampling frequency
   * @param {string|ArrayLike<number>} [options.window='hann'] - Window type or samples
   * @param {number} [options.nperseg=1024] - Segment length, power of 2
   * @param {number|null} [options.nfft=null] - FFT length (default nperseg)
   * @param {number} [options.segments=8] - Number of 50%-overlapped segments to average
   * @param {string|boolean} [options.detrend='constant'] - Detrend type
   * @param {string} [options.scaling='density'] - 'density' or 'spectrum' (mode 'psd' only)
   * @param {string} [options.mode='db'] - 'db', 'magnitude' or 'psd'
   * @param {number} [options.dbEps=1e-20] - Power floor added before log (mode 'db')
   */
  constructor({ mode = 'db', dbEps = 1e-20, segments = 8, ...options } = {}) {
    if (!Number.isInteger(segments) || segments < 1) {
      throw new Error(`segments (${segments}) must be a positive integer`);
    }

    const noverlap = Math.floor((options.nperseg ?? 1024) / 2);
    // dB is 10*log10(psd + dbEps): computed from the 'psd' path, then logged.
    const state = createDspState({ nperseg: 1024, ...options, noverlap, mode: mode === 'db' ? 'psd' : mode });
    state.dbEps = dbEps;

    this.fs = state.fs;
    this.nperseg = state.nperseg;
    this.noverlap = state.noverlap;
    this.nfft = state.nfft;
    this.detrend = state.detrend;
    this.scaling = state.scaling;
    this.mode = mode;
    this.dbEps = dbEps;
    this.segments = segments;
    this.step = state.step;
    this.needed = state.nperseg + (segments - 1) * state.step;
    this.numBins = state.numFreqs;
    this.frequencies = state.frequencies;
    this.windowSum = state.windowSum;
    this.windowSumSquares = state.windowSumSquares;

    this._state = state;
    this._scaled = new Float64Array(state.numFreqs);
  }

  /**
   * Computes one PSD estimate from the tail of `samples` and writes it into `out`.
   *
   * @param {ArrayLike<number>} samples - Input signal; only the last `needed` samples are read
   * @param {number[]|Float32Array|Float64Array} out - Destination for `numBins` values
   * @param {number} [offset=0] - Destination offset
   * @returns {number} Number of bins written (`numBins`)
   */
  process(samples, out, offset = 0) {
    if (!isNumericArrayLike(samples) || samples.length === 0) {
      throw new Error('Input signal must be a non-empty array or typed array');
    }

    if (samples.length < this.needed) {
      throw new Error(
        `Input length (${samples.length}) is too short for ${this.segments} segments of nperseg ${this.nperseg} (need ${this.needed})`
      );
    }

    validateOutput(out, offset, this.numBins);

    const state = this._state;
    const { numFreqs, magSq, magSqSum } = state;
    const start = samples.length - this.needed;

    magSqSum.fill(0);

    for (let seg = 0; seg < this.segments; seg++) {
      magSqInto(state, samples, start + seg * this.step);

      for (let i = 0; i < numFreqs; i++) {
        magSqSum[i] += magSq[i];
      }
    }

    for (let i = 0; i < numFreqs; i++) {
      magSqSum[i] /= this.segments;
    }

    scaleInto(state, magSqSum, this._scaled, 0);

    if (this.mode === 'db') {
      for (let i = 0; i < numFreqs; i++) {
        out[offset + i] = 10 * Math.log10(this._scaled[i] + this.dbEps);
      }
    } else {
      for (let i = 0; i < numFreqs; i++) {
        out[offset + i] = this._scaled[i];
      }
    }

    return numFreqs;
  }
}

/**
 * Computes the Power Spectral Density using Welch's method.
 *
 * This function estimates the power spectral density by dividing the signal into
 * overlapping segments, computing a modified periodogram for each segment, and
 * averaging the periodograms.
 *
 * @param {ArrayLike<number>} x - The input signal (real-valued)
 * @param {Object} options - Configuration options
 * @param {number} [options.fs=1.0] - Sampling frequency
 * @param {string|ArrayLike<number>} [options.window='hann'] - Window type ('hann') or custom window array
 * @param {number} [options.nperseg=256] - Length of each segment (must be power of 2)
 * @param {number|null} [options.noverlap=null] - Number of points to overlap (default: nperseg/2)
 * @param {number|null} [options.nfft=null] - FFT length (default: nperseg, must be >= nperseg and power of 2)
 * @param {string|boolean} [options.detrend='constant'] - Detrend type ('constant' to remove mean, or false)
 * @param {string} [options.scaling='density'] - 'density' for V²/Hz or 'spectrum' for V²
 * @returns {{frequencies: number[], psd: number[]}} Object containing frequency array and PSD array
 *
 * @example
 * const signal = [0.1, 0.2, 0.3, ...]; // Your signal data
 * const result = welch(signal, {fs: 1000, nperseg: 256});
 * console.log(result.frequencies); // Frequency bins
 * console.log(result.psd); // Power spectral density
 */
export function welch(x, {
  fs = 1.0,
  window = 'hann',
  nperseg = 256,
  noverlap = null,
  nfft = null,
  detrend = 'constant',
  scaling = 'density'
} = {}) {
  // Validate inputs
  if (!isNumericArrayLike(x) || x.length === 0) {
    throw new Error('Input signal x must be a non-empty array or typed array');
  }

  validatePowerOf2(nperseg);

  if (nperseg > x.length) {
    throw new Error(`nperseg (${nperseg}) cannot be greater than signal length (${x.length})`);
  }

  if (noverlap === null) {
    noverlap = Math.floor(nperseg / 2);
  }

  const state = createDspState({ fs, window, nperseg, noverlap, nfft, detrend, scaling });
  const { numFreqs, magSq, magSqSum: psdSum, step } = state;
  let numSegments = 0;

  for (let offset = 0; offset <= x.length - nperseg; offset += step) {
    magSqInto(state, x, offset);

    for (let i = 0; i < numFreqs; i++) {
      psdSum[i] += magSq[i];
    }

    numSegments += 1;
  }

  if (numSegments === 0) {
    throw new Error('Not enough data for even one segment');
  }

  // Average, then apply the configured scaling (state.mode defaults to 'psd').
  for (let i = 0; i < numFreqs; i++) {
    psdSum[i] /= numSegments;
  }

  const psd = new Array(numFreqs);
  scaleInto(state, psdSum, psd, 0);

  return { frequencies: state.frequencies, psd };
}

/**
 * Computes the spectrogram of a signal using short-time Fourier transform (STFT).
 *
 * This function computes a spectrogram by dividing the signal into overlapping
 * segments, computing a modified periodogram for each segment, and returning
 * the time-frequency representation.
 *
 * @param {ArrayLike<number>} x - The input signal (real-valued)
 * @param {Object} options - Configuration options
 * @param {number} [options.fs=1.0] - Sampling frequency
 * @param {string|ArrayLike<number>} [options.window='hann'] - Window type ('hann') or custom window array
 * @param {number} [options.nperseg=256] - Length of each segment (must be power of 2)
 * @param {number|null} [options.noverlap=null] - Number of points to overlap (default: nperseg/8)
 * @param {number|null} [options.nfft=null] - FFT length (default: nperseg, must be >= nperseg and power of 2)
 * @param {string|boolean} [options.detrend='constant'] - Detrend type ('constant' to remove mean, or false)
 * @param {string} [options.scaling='density'] - 'density' for V²/Hz or 'spectrum' for V²
 * @param {string} [options.mode='psd'] - Output mode: 'psd', 'magnitude' or 'db'
 * @param {number} [options.dbEps=1e-12] - Amplitude floor added before log (mode 'db')
 * @returns {{frequencies: number[], times: number[], spectrogram: number[][]}} Object containing frequency array, time array, and 2D spectrogram (frequency × time)
 *
 * @example
 * const signal = [0.1, 0.2, 0.3, ...]; // Your signal data
 * const result = spectrogram(signal, {fs: 1000, nperseg: 256, mode: 'magnitude'});
 * console.log(result.frequencies); // Frequency bins
 * console.log(result.times); // Time bins
 * console.log(result.spectrogram); // 2D array [freq][time]
 */
export function spectrogram(x, {
  fs = 1.0,
  window = 'hann',
  nperseg = 256,
  noverlap = null,
  nfft = null,
  detrend = 'constant',
  scaling = 'density',
  mode = 'psd',
  dbEps = 1e-12
} = {}) {
  // Validate inputs
  if (!isNumericArrayLike(x) || x.length === 0) {
    throw new Error('Input signal x must be a non-empty array or typed array');
  }

  if (nperseg > x.length) {
    throw new Error(`nperseg (${nperseg}) cannot be greater than signal length (${x.length})`);
  }

  const state = createDspState({ fs, window, nperseg, noverlap, nfft, detrend, scaling, mode });
  state.dbEps = dbEps;

  const { numFreqs, magSq, step } = state;
  const numTimes = Math.floor((x.length - state.nperseg) / step) + 1;

  if (numTimes < 1) {
    throw new Error('Not enough data for even one segment');
  }

  // Initialize spectrogram array [frequency][time]
  const spec = new Array(numFreqs);
  for (let i = 0; i < numFreqs; i++) {
    spec[i] = new Array(numTimes);
  }

  const times = new Array(numTimes);
  const column = new Array(numFreqs);

  for (let segIdx = 0; segIdx < numTimes; segIdx++) {
    const segmentStart = segIdx * step;
    times[segIdx] = (segmentStart + state.nperseg / 2) / state.fs;

    magSqInto(state, x, segmentStart);
    scaleInto(state, magSq, column, 0);

    for (let i = 0; i < numFreqs; i++) {
      spec[i][segIdx] = column[i];
    }
  }

  return { frequencies: state.frequencies, times, spectrogram: spec };
}

/**
 * Validates a samples-per-symbol / resampling factor.
 * @param {number} sps - Samples per baseband sample
 * @throws {Error} If sps is not a positive integer
 */
function validateSps(sps) {
  if (!Number.isInteger(sps) || sps < 1) {
    throw new Error(`sps must be a positive integer. Got ${sps}`);
  }
}

/**
 * Generates a root raised cosine FIR pulse shaping filter.
 * Port of SignalAnalysis.jl's rrcosfir(), normalized to unit energy.
 * @param {number} beta - Roll-off factor
 * @param {number} sps - Samples per symbol
 * @returns {Float64Array} Filter taps, length 2*floor(span*sps/2)+1
 */
function rrcosfir(beta, sps) {
  const span = beta < 0.68 ? 33 - Math.floor(44 * beta) : 4;
  const delay = Math.floor((span * sps) / 2);
  const h = new Float64Array(2 * delay + 1);

  for (let i = 0; i < h.length; i++) {
    const t = (i - delay) / sps;
    if (t === 0) {
      h[i] = (1 + beta * (4 / Math.PI - 1)) / sps;
    } else if (Math.abs(t) === 1 / (4 * beta)) {
      h[i] = (beta / (Math.SQRT2 * sps)) *
        ((1 + 2 / Math.PI) * Math.sin(Math.PI / (4 * beta)) +
         (1 - 2 / Math.PI) * Math.cos(Math.PI / (4 * beta)));
    } else {
      h[i] = (Math.sin(Math.PI * t * (1 - beta)) +
              4 * beta * t * Math.cos(Math.PI * t * (1 + beta))) /
             (Math.PI * t * (1 - (4 * beta * t) ** 2)) / sps;
    }
  }

  const norm = Math.sqrt(sumSquaresArrayLike(h));
  for (let i = 0; i < h.length; i++) {
    h[i] /= norm;
  }

  return h;
}

/**
 * Transforms an interleaved complex signal at its original length.
 * Bluestein's chirp convolution handles lengths unsupported by fft.js in O(n log n).
 * Padding is confined to the convolution and does not change the DFT length.
 */
function complexTransform(input, inverse = false) {
  const n = input.length / 2;
  if (n === 1) return Float64Array.from(input);
  if (isPowerOf2(n)) {
    const fft = new FFT(n);
    const out = fft.createComplexArray();
    if (inverse) fft.inverseTransform(out, input);
    else fft.transform(out, input);
    return out;
  }

  let size = 2;
  while (size < 2 * n - 1) size *= 2;
  validatePowerOf2(size);
  const fft = new FFT(size);
  const a = fft.createComplexArray();
  const b = fft.createComplexArray();
  const sign = inverse ? 1 : -1;

  // exp(sign*i*pi*j²/n) factors the DFT into a circular convolution.
  for (let j = 0; j < n; j++) {
    const phase = sign * Math.PI * ((j * j) % (2 * n)) / n;
    const re = Math.cos(phase);
    const im = Math.sin(phase);
    a[2 * j] = input[2 * j] * re - input[2 * j + 1] * im;
    a[2 * j + 1] = input[2 * j] * im + input[2 * j + 1] * re;
    b[2 * j] = re;
    b[2 * j + 1] = -im;
    if (j > 0) {
      b[2 * (size - j)] = re;
      b[2 * (size - j) + 1] = -im;
    }
  }

  const aSpectrum = fft.createComplexArray();
  const bSpectrum = fft.createComplexArray();
  fft.transform(aSpectrum, a);
  fft.transform(bSpectrum, b);
  for (let j = 0; j < size; j++) {
    const re = aSpectrum[2 * j];
    const im = aSpectrum[2 * j + 1];
    aSpectrum[2 * j] = re * bSpectrum[2 * j] - im * bSpectrum[2 * j + 1];
    aSpectrum[2 * j + 1] = re * bSpectrum[2 * j + 1] + im * bSpectrum[2 * j];
  }
  fft.inverseTransform(a, aSpectrum);

  const out = new Float64Array(2 * n);
  const scale = inverse ? n : 1;
  for (let j = 0; j < n; j++) {
    const phase = sign * Math.PI * ((j * j) % (2 * n)) / n;
    const re = Math.cos(phase);
    const im = Math.sin(phase);
    out[2 * j] = (a[2 * j] * re - a[2 * j + 1] * im) / scale;
    out[2 * j + 1] = (a[2 * j] * im + a[2 * j + 1] * re) / scale;
  }
  return out;
}

/**
 * Computes hilbert(x) / sqrt(2) using the original signal length.
 * Matches SignalAnalysis.jl's analytic() scaling and periodic boundary assumption.
 * @param {ArrayLike<number>} x - Real input signal
 * @returns {Float64Array} Interleaved complex analytic signal, length 2*x.length
 */
function analytic(x) {
  const n = x.length;
  const input = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) input[2 * i] = x[i];
  const spectrum = complexTransform(input);

  // Keep DC and even-length Nyquist, double positives, and remove negatives.
  for (let i = 1; i < n; i++) {
    const gain = i <= Math.floor((n - 1) / 2) ? 2 : (n % 2 === 0 && i === n / 2 ? 1 : 0);
    spectrum[2 * i] *= gain;
    spectrum[2 * i + 1] *= gain;
  }
  const timeDomain = complexTransform(spectrum, true);
  const out = new Float64Array(2 * n);
  for (let i = 0; i < 2 * n; i++) out[i] = timeDomain[i] / Math.SQRT2;
  return out;
}

/**
 * Interpolates an interleaved complex signal by an integer factor.
 *
 * Equivalent to DSP.jl's resample(x, sps, h): zero-stuff by sps, convolve with h,
 * and drop the filter's group delay of (h.length-1)/2 output samples.
 *
 * @param {ArrayLike<number>} x - Interleaved complex input
 * @param {number} sps - Interpolation factor
 * @param {Float64Array} h - Filter taps (odd length)
 * @returns {Float64Array} Interleaved complex output, length sps*x.length
 */
function interpolate(x, sps, h) {
  const n = x.length / 2;
  const delay = (h.length - 1) / 2;
  const out = new Float64Array(2 * n * sps);

  for (let i = 0; i < n * sps; i++) {
    const base = i + delay;
    let re = 0;
    let im = 0;
    // Only taps aligned with a non-zero (non-stuffed) input sample contribute.
    for (let k = base % sps; k < h.length; k += sps) {
      const m = (base - k) / sps;
      if (m >= 0 && m < n) {
        re += h[k] * x[2 * m];
        im += h[k] * x[2 * m + 1];
      }
    }
    out[2 * i] = re;
    out[2 * i + 1] = im;
  }

  return out;
}

/**
 * Decimates an interleaved complex signal by an integer factor.
 *
 * Equivalent to DSP.jl's resample(x, 1//sps, h): convolve with h, drop the
 * group delay of (h.length-1)/2 samples, and keep every sps-th sample.
 *
 * @param {ArrayLike<number>} x - Interleaved complex input
 * @param {number} sps - Decimation factor
 * @param {Float64Array} h - Filter taps (odd length)
 * @returns {Float64Array} Interleaved complex output, length 2*ceil(x.length/2/sps)
 */
function decimate(x, sps, h) {
  const n = x.length / 2;
  const delay = (h.length - 1) / 2;
  const outLen = Math.ceil(n / sps);
  const out = new Float64Array(2 * outLen);

  for (let j = 0; j < outLen; j++) {
    const base = j * sps + delay;
    let re = 0;
    let im = 0;
    for (let k = Math.max(0, base - n + 1); k < h.length && k <= base; k++) {
      const m = base - k;
      re += h[k] * x[2 * m];
      im += h[k] * x[2 * m + 1];
    }
    out[2 * j] = re;
    out[2 * j + 1] = im;
  }

  return out;
}

/**
 * Converts a complex baseband signal to a real passband signal centered at fc.
 *
 * Port of SignalAnalysis.jl's upconvert(). When sps > 1 the signal is interpolated
 * with a root raised cosine pulse shape (beta = 0.25), which pads the signal with
 * 11 baseband samples of filter transient on each side.
 *
 * @param {ArrayLike<number>} x - Baseband signal as interleaved complex [I0, Q0, I1, Q1, ...]
 * @param {Object} options - Configuration options
 * @param {number} [options.sps=1] - Passband samples per baseband sample (positive integer)
 * @param {number} [options.fc=0] - Carrier frequency (same units as fs)
 * @param {number} [options.fs=1.0] - Baseband sampling frequency; output rate is sps*fs
 * @returns {Float64Array} Real passband signal, length x.length/2 if sps is 1, else (x.length/2 + 22)*sps
 *
 * @example
 * const baseband = [1, 0, 0, 1, -1, 0];  // 3 complex samples
 * const passband = upconvert(baseband, {sps: 4, fc: 12000, fs: 8000});
 */
export function upconvert(x, { sps = 1, fc = 0, fs = 1.0 } = {}) {
  if (!isNumericArrayLike(x) || x.length === 0) {
    throw new Error('Input signal x must be a non-empty array or typed array');
  }

  if (x.length % 2 !== 0) {
    throw new Error(`Baseband signal must be interleaved complex (even length). Got ${x.length}`);
  }

  validateSps(sps);
  validateFs(fs);

  let s = x;

  if (sps > 1) {
    const h = rrcosfir(0.25, sps);
    // Pad with the filter's transient length so no signal energy is lost.
    const pad = Math.ceil(h.length / (2 * sps)) - 1;
    const padded = new Float64Array(x.length + 4 * pad);
    for (let i = 0; i < x.length; i++) {
      padded[2 * pad + i] = x[i];
    }
    s = interpolate(padded, sps, h);
  }

  const n = s.length / 2;
  const fsOut = sps * fs;
  const out = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const phase = (2 * Math.PI * fc * i) / fsOut;
    out[i] = Math.SQRT2 * (s[2 * i] * Math.cos(phase) - s[2 * i + 1] * Math.sin(phase));
  }

  return out;
}

/**
 * Converts a real passband signal centered at fc to complex baseband.
 *
 * Port of SignalAnalysis.jl's downconvert(). The negative frequency image is removed
 * by taking the analytic signal; when sps > 1 the result is matched-filtered with a
 * root raised cosine pulse shape (beta = 0.25) and decimated.
 *
 * @param {ArrayLike<number>} x - Real passband signal
 * @param {Object} options - Configuration options
 * @param {number} [options.sps=1] - Passband samples per baseband sample (positive integer)
 * @param {number} [options.fc=0] - Carrier frequency (same units as fs)
 * @param {number} [options.fs=1.0] - Passband sampling frequency; output rate is fs/sps
 * @returns {Float64Array} Baseband signal as interleaved complex, length 2*ceil(x.length/sps)
 *
 * @example
 * const baseband = downconvert(passband, {sps: 4, fc: 12000, fs: 32000});
 * const i0 = baseband[0], q0 = baseband[1];
 */
export function downconvert(x, { sps = 1, fc = 0, fs = 1.0 } = {}) {
  if (!isNumericArrayLike(x) || x.length === 0) {
    throw new Error('Input signal x must be a non-empty array or typed array');
  }

  validateSps(sps);
  validateFs(fs);

  const s = analytic(x);

  for (let i = 0; i < x.length; i++) {
    const phase = (-2 * Math.PI * fc * i) / fs;
    const re = s[2 * i];
    const im = s[2 * i + 1];
    s[2 * i] = re * Math.cos(phase) - im * Math.sin(phase);
    s[2 * i + 1] = re * Math.sin(phase) + im * Math.cos(phase);
  }

  return sps === 1 ? s : decimate(s, sps, rrcosfir(0.25, sps));
}
