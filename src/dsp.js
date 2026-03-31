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
 * Creates a segment view/copy from an array-like numeric input.
 * @param {ArrayLike<number> & { subarray?: Function }} x - The input signal
 * @param {number} start - Start index
 * @param {number} end - End index
 * @returns {ArrayLike<number>} Segment data
 */
function sliceNumericArrayLike(x, start, end) {
  if (Array.isArray(x)) {
    return x.slice(start, end);
  }

  return x.subarray(start, end);
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
  return n > 0 && (n & (n - 1)) === 0;
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

/**
 * Generates a Hann window of the specified length.
 * Uses periodic version (matches SciPy's default for spectral estimation).
 * @param {number} length - The length of the window
 * @returns {number[]} The Hann window array
 */
function hannWindow(length) {
  const window = new Array(length);
  for (let n = 0; n < length; n++) {
    // Periodic window: 0.5 - 0.5 * cos(2*pi*n / N)
    // This matches scipy's default for spectral estimation
    window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / length);
  }
  return window;
}

/**
 * Removes the mean (DC component) from a signal segment.
 * @param {ArrayLike<number>} segment - The signal segment
 * @returns {number[]} The detrended segment
 */
function detrendConstant(segment) {
  const mean = sumArrayLike(segment) / segment.length;
  const detrended = new Array(segment.length);

  for (let i = 0; i < segment.length; i++) {
    detrended[i] = segment[i] - mean;
  }

  return detrended;
}



/**
 * Extracts overlapping segments from a signal.
 * @param {ArrayLike<number> & { subarray?: Function }} x - The input signal
 * @param {number} nperseg - Length of each segment
 * @param {number} noverlap - Number of points to overlap between segments
 * @returns {Array<ArrayLike<number>>} Array of signal segments
 */
function extractSegments(x, nperseg, noverlap) {
  const step = nperseg - noverlap;
  const segments = [];

  for (let i = 0; i <= x.length - nperseg; i += step) {
    segments.push(sliceNumericArrayLike(x, i, i + nperseg));
  }

  return segments;
}

/**
 * Computes the magnitude spectrum from FFT output.
 * @param {number[]} complexArray - FFT output in complex format [real0, imag0, real1, imag1, ...]
 * @param {number} nfft - The FFT size
 * @returns {number[]} Array of magnitudes (one-sided for real input)
 */
function getMagnitudeSpectrum(complexArray, nfft) {
  const numFreqs = Math.floor(nfft / 2) + 1; // One-sided spectrum
  const magnitudes = new Array(numFreqs);

  for (let i = 0; i < numFreqs; i++) {
    const real = complexArray[i * 2];
    const imag = complexArray[i * 2 + 1];
    magnitudes[i] = Math.sqrt(real * real + imag * imag);
  }

  return magnitudes;
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

  // Set defaults
  if (noverlap === null) {
    noverlap = Math.floor(nperseg / 2);
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

  // Generate or validate window
  let windowArray;
  if (typeof window === 'string') {
    if (window === 'hann') {
      windowArray = hannWindow(nperseg);
    } else {
      throw new Error(`Unsupported window type: ${window}. Use 'hann' or provide a custom window array.`);
    }
  } else if (isNumericArrayLike(window)) {
    if (window.length !== nperseg) {
      throw new Error(`Custom window length (${window.length}) must match nperseg (${nperseg})`);
    }
    windowArray = window;
  } else {
    throw new Error('window must be a string, array, or typed array');
  }

  // Extract segments
  const segments = extractSegments(x, nperseg, noverlap);

  if (segments.length === 0) {
    throw new Error('Not enough data for even one segment');
  }

  // Initialize FFT
  const fft = new FFT(nfft);
  const numFreqs = Math.floor(nfft / 2) + 1;
  const psdSum = new Array(numFreqs).fill(0);

  // Compute window normalization factors
  const windowSumSquares = sumSquaresArrayLike(windowArray);
  const windowSum = sumArrayLike(windowArray);

  // Process each segment
  for (const segment of segments) {
    // Detrend
    let processedSegment = segment;
    if (detrend === 'constant') {
      processedSegment = detrendConstant(segment);
    }

    // Apply window
    const windowed = new Array(nperseg);
    for (let i = 0; i < nperseg; i++) {
      windowed[i] = processedSegment[i] * windowArray[i];
    }

    // Zero-pad if nfft > nperseg
    const fftInput = new Array(nfft).fill(0);
    for (let i = 0; i < nperseg; i++) {
      fftInput[i] = windowed[i];
    }

    // Compute FFT
    const fftOutput = fft.createComplexArray();
    fft.realTransform(fftOutput, fftInput);
    fft.completeSpectrum(fftOutput);

    // Compute magnitude spectrum
    const magnitudes = getMagnitudeSpectrum(fftOutput, nfft);

    // Accumulate power (magnitude squared)
    for (let i = 0; i < numFreqs; i++) {
      psdSum[i] += magnitudes[i] * magnitudes[i];
    }
  }

  // Average and scale
  const numSegments = segments.length;
  const psd = new Array(numFreqs);

  for (let i = 0; i < numFreqs; i++) {
    psd[i] = psdSum[i] / numSegments;

    // Apply scaling
    if (scaling === 'density') {
      // Power spectral density: V²/Hz
      // Normalize by fs * sum(window^2)
      psd[i] = psd[i] / (fs * windowSumSquares);

      // Double the power for non-DC and non-Nyquist bins (one-sided spectrum)
      if (i > 0 && i < numFreqs - 1) {
        psd[i] *= 2;
      }
    } else if (scaling === 'spectrum') {
      // Power spectrum: V²
      // Normalize by (sum(window))^2
      psd[i] = psd[i] / (windowSum * windowSum);

      // Double the power for non-DC and non-Nyquist bins (one-sided spectrum)
      if (i > 0 && i < numFreqs - 1) {
        psd[i] *= 2;
      }
    } else {
      throw new Error(`Unsupported scaling: ${scaling}. Use 'density' or 'spectrum'.`);
    }
  }

  // Generate frequency array
  const frequencies = getFrequencies(nfft, fs);

  return { frequencies, psd };
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
 * @param {string} [options.mode='psd'] - Output mode: 'psd' or 'magnitude'
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
  mode = 'psd'
} = {}) {
  // Validate inputs
  if (!isNumericArrayLike(x) || x.length === 0) {
    throw new Error('Input signal x must be a non-empty array or typed array');
  }

  validatePowerOf2(nperseg);

  if (nperseg > x.length) {
    throw new Error(`nperseg (${nperseg}) cannot be greater than signal length (${x.length})`);
  }

  if (mode !== 'psd' && mode !== 'magnitude') {
    throw new Error(`Unsupported mode: ${mode}. Use 'psd' or 'magnitude'.`);
  }

  // Set defaults
  if (noverlap === null) {
    noverlap = Math.floor(nperseg / 8); // Default for spectrogram (vs nperseg/2 for welch)
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

  // Generate or validate window
  let windowArray;
  if (typeof window === 'string') {
    if (window === 'hann') {
      windowArray = hannWindow(nperseg);
    } else {
      throw new Error(`Unsupported window type: ${window}. Use 'hann' or provide a custom window array.`);
    }
  } else if (isNumericArrayLike(window)) {
    if (window.length !== nperseg) {
      throw new Error(`Custom window length (${window.length}) must match nperseg (${nperseg})`);
    }
    windowArray = window;
  } else {
    throw new Error('window must be a string, array, or typed array');
  }

  // Extract segments
  const segments = extractSegments(x, nperseg, noverlap);

  if (segments.length === 0) {
    throw new Error('Not enough data for even one segment');
  }

  // Initialize FFT
  const fft = new FFT(nfft);
  const numFreqs = Math.floor(nfft / 2) + 1;
  const numTimes = segments.length;

  // Compute window normalization factors
  const windowSumSquares = sumSquaresArrayLike(windowArray);
  const windowSum = sumArrayLike(windowArray);

  // Initialize spectrogram array [frequency][time]
  const spec = new Array(numFreqs);
  for (let i = 0; i < numFreqs; i++) {
    spec[i] = new Array(numTimes);
  }

  // Compute time centers for each segment
  const step = nperseg - noverlap;
  const times = new Array(numTimes);
  for (let i = 0; i < numTimes; i++) {
    const segmentStart = i * step;
    const segmentCenter = segmentStart + nperseg / 2;
    times[i] = segmentCenter / fs;
  }

  // Process each segment
  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const segment = segments[segIdx];

    // Detrend
    let processedSegment = segment;
    if (detrend === 'constant') {
      processedSegment = detrendConstant(segment);
    }

    // Apply window
    const windowed = new Array(nperseg);
    for (let i = 0; i < nperseg; i++) {
      windowed[i] = processedSegment[i] * windowArray[i];
    }

    // Zero-pad if nfft > nperseg
    const fftInput = new Array(nfft).fill(0);
    for (let i = 0; i < nperseg; i++) {
      fftInput[i] = windowed[i];
    }

    // Compute FFT
    const fftOutput = fft.createComplexArray();
    fft.realTransform(fftOutput, fftInput);
    fft.completeSpectrum(fftOutput);

    // Compute magnitude spectrum
    const magnitudes = getMagnitudeSpectrum(fftOutput, nfft);

    // Store results based on mode
    for (let i = 0; i < numFreqs; i++) {
      if (mode === 'magnitude') {
        // For magnitude mode, normalize by sqrt(sum(window^2) * fs)
        // This matches scipy's scaling
        const scale = Math.sqrt(windowSumSquares * fs);
        spec[i][segIdx] = magnitudes[i] / scale;
      } else if (mode === 'psd') {
        // Compute power spectral density
        let psdValue = magnitudes[i] * magnitudes[i];

        if (scaling === 'density') {
          // Normalize by fs * sum(window^2)
          psdValue = psdValue / (fs * windowSumSquares);
          // Double for non-DC and non-Nyquist bins (one-sided spectrum)
          if (i > 0 && i < numFreqs - 1) {
            psdValue *= 2;
          }
        } else if (scaling === 'spectrum') {
          // Normalize by (sum(window))^2
          psdValue = psdValue / (windowSum * windowSum);
          // Double for non-DC and non-Nyquist bins (one-sided spectrum)
          if (i > 0 && i < numFreqs - 1) {
            psdValue *= 2;
          }
        } else {
          throw new Error(`Unsupported scaling: ${scaling}. Use 'density' or 'spectrum'.`);
        }

        spec[i][segIdx] = psdValue;
      }
    }
  }

  // Generate frequency array
  const frequencies = getFrequencies(nfft, fs);

  return { frequencies, times, spectrogram: spec };
}
