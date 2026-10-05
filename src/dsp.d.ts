/** Built-in window name, or custom window samples of length `nperseg`. */
export type Window = 'hann' | ArrayLike<number>;
/** `'constant'` removes the mean of each segment; any other value disables detrending. */
export type Detrend = 'constant' | false;
/** `'density'` gives V²/Hz, `'spectrum'` gives V². */
export type Scaling = 'density' | 'spectrum';
export type Mode = 'psd' | 'magnitude' | 'db';
/** Destination for streaming output. */
export type Output = number[] | Float32Array | Float64Array;

export interface SpectralOptions {
  /** Sampling frequency. Default 1.0. */
  fs?: number;
  /** Default 'hann'. */
  window?: Window;
  /** Segment length, a power of 2. Default 256 (1024 for WelchStream). */
  nperseg?: number;
  /** FFT length, a power of 2 and at least `nperseg`. Default `nperseg`. */
  nfft?: number | null;
  /** Default 'constant'. */
  detrend?: Detrend;
  /** Applies to mode 'psd' only. Default 'density'. */
  scaling?: Scaling;
}

export interface WelchOptions extends SpectralOptions {
  /** Default nperseg / 2. */
  noverlap?: number | null;
}

export interface SpectrogramOptions extends SpectralOptions {
  /** Default nperseg / 8. */
  noverlap?: number | null;
  /** Default 'psd' for spectrogram(), 'db' for SpectrogramStream. */
  mode?: Mode;
  /** Amplitude floor added before log in mode 'db'. Default 1e-12. */
  dbEps?: number;
}

export interface WelchStreamOptions extends SpectralOptions {
  /** Number of 50%-overlapped segments to average. Default 8. */
  segments?: number;
  /** Default 'db'. */
  mode?: Mode;
  /** Power floor added before log in mode 'db'. Default 1e-20. */
  dbEps?: number;
}

export interface ConversionOptions {
  /** Passband samples per baseband sample, a positive integer. Default 1. */
  sps?: number;
  /** Carrier frequency, in the same units as `fs`. Default 0. */
  fc?: number;
  /** Sampling frequency of the input signal. Default 1.0. */
  fs?: number;
}

/** Streaming STFT: consumes one hop per call and writes one spectral column. */
export class SpectrogramStream {
  constructor(options?: SpectrogramOptions);
  readonly fs: number;
  readonly nperseg: number;
  readonly noverlap: number;
  readonly nfft: number;
  readonly detrend: Detrend;
  readonly scaling: Scaling;
  readonly mode: Mode;
  readonly dbEps: number;
  /** Samples consumed per `process` call. */
  readonly hop: number;
  /** Columns produced since construction or the last `reset`. */
  readonly hopsProcessed: number;
  readonly numBins: number;
  readonly frequencies: number[];
  readonly windowSum: number;
  readonly windowSumSquares: number;
  /** Clears overlap history and the time origin. */
  reset(): void;
  /** Writes one column of `numBins` values into `out`, returning its time centre in seconds. */
  process(chunk: ArrayLike<number>, out: Output, offset?: number): number;
}

/** Streaming Welch PSD: reads the last `needed` samples and writes one estimate. */
export class WelchStream {
  constructor(options?: WelchStreamOptions);
  readonly fs: number;
  readonly nperseg: number;
  readonly noverlap: number;
  readonly nfft: number;
  readonly detrend: Detrend;
  readonly scaling: Scaling;
  readonly mode: Mode;
  readonly dbEps: number;
  readonly segments: number;
  readonly step: number;
  /** Samples read by each `process` call. */
  readonly needed: number;
  readonly numBins: number;
  readonly frequencies: number[];
  readonly windowSum: number;
  readonly windowSumSquares: number;
  /** Writes `numBins` values into `out` and returns `numBins`. */
  process(samples: ArrayLike<number>, out: Output, offset?: number): number;
}

/** Welch power spectral density estimate. */
export function welch(
  x: ArrayLike<number>,
  options?: WelchOptions,
): { frequencies: number[]; psd: number[] };

/** Spectrogram indexed as `spectrogram[frequency][time]`. */
export function spectrogram(
  x: ArrayLike<number>,
  options?: SpectrogramOptions,
): { frequencies: number[]; times: number[]; spectrogram: number[][] };

/** Converts interleaved complex baseband to a real passband signal. */
export function upconvert(x: ArrayLike<number>, options?: ConversionOptions): Float64Array;

/** Converts a real passband signal to interleaved complex baseband. */
export function downconvert(x: ArrayLike<number>, options?: ConversionOptions): Float64Array;
