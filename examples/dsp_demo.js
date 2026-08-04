/**
 * Demo script showing how to use the DSP functions (welch and spectrogram).
 *
 * Run with: node examples/dsp_demo.js
 */

import { welch, spectrogram, upconvert, downconvert } from "../src/dsp.js";

// Generate a test signal: 100 Hz + 250 Hz sinusoids with noise
const fs = 1000; // 1 kHz sampling rate
const duration = 2; // 2 seconds
const numSamples = fs * duration;

console.log("Generating test signal...");
console.log(`  Sampling rate: ${fs} Hz`);
console.log(`  Duration: ${duration} seconds`);
console.log(`  Signal: 100 Hz + 250 Hz sinusoids + noise\n`);

const signal = new Array(numSamples);
for (let i = 0; i < numSamples; i++) {
  const t = i / fs;
  signal[i] =
    Math.sin(2 * Math.PI * 100 * t) +       // 100 Hz component
    0.5 * Math.sin(2 * Math.PI * 250 * t) + // 250 Hz component
    0.1 * (Math.random() - 0.5);            // Noise
}

// Example 1: Welch's PSD estimation
console.log("=== Welch's Method (Power Spectral Density) ===");
const welchResult = welch(signal, {
  fs: fs,
  nperseg: 512,
  noverlap: 256,
  window: 'hann',
  scaling: 'density'
});

console.log(`Number of frequency bins: ${welchResult.frequencies.length}`);
console.log(`Frequency range: ${welchResult.frequencies[0].toFixed(2)} Hz to ${welchResult.frequencies[welchResult.frequencies.length - 1].toFixed(2)} Hz`);

// Find peaks in the PSD
const peaks = [];
for (let i = 1; i < welchResult.psd.length - 1; i++) {
  if (welchResult.psd[i] > welchResult.psd[i - 1] &&
      welchResult.psd[i] > welchResult.psd[i + 1] &&
      welchResult.psd[i] > 0.01) { // Threshold to avoid noise peaks
    peaks.push({
      frequency: welchResult.frequencies[i],
      power: welchResult.psd[i]
    });
  }
}

// Sort by power and show top 3
peaks.sort((a, b) => b.power - a.power);
console.log("\nTop frequency peaks:");
for (let i = 0; i < Math.min(3, peaks.length); i++) {
  console.log(`  ${peaks[i].frequency.toFixed(2)} Hz: ${peaks[i].power.toFixed(6)}`);
}

// Example 2: Spectrogram
console.log("\n=== Spectrogram (Time-Frequency Analysis) ===");
const spectrogramResult = spectrogram(signal, {
  fs: fs,
  nperseg: 256,
  noverlap: 128,
  window: 'hann',
  mode: 'psd'
});

console.log(`Number of frequency bins: ${spectrogramResult.frequencies.length}`);
console.log(`Number of time bins: ${spectrogramResult.times.length}`);
console.log(`Time range: ${spectrogramResult.times[0].toFixed(3)} s to ${spectrogramResult.times[spectrogramResult.times.length - 1].toFixed(3)} s`);
console.log(`Spectrogram shape: ${spectrogramResult.spectrogram.length} frequencies × ${spectrogramResult.spectrogram[0].length} time bins`);

// Find the strongest frequency at the middle time bin
const midTimeIdx = Math.floor(spectrogramResult.times.length / 2);
let maxPower = 0;
let maxFreqIdx = 0;
for (let f = 0; f < spectrogramResult.frequencies.length; f++) {
  if (spectrogramResult.spectrogram[f][midTimeIdx] > maxPower) {
    maxPower = spectrogramResult.spectrogram[f][midTimeIdx];
    maxFreqIdx = f;
  }
}

console.log(`\nStrongest frequency at t=${spectrogramResult.times[midTimeIdx].toFixed(3)}s: ${spectrogramResult.frequencies[maxFreqIdx].toFixed(2)} Hz`);

// Example 3: Using custom window
console.log("\n=== Using Custom Window ===");
const customWindow = new Array(256);
// Create a Hamming window manually
for (let n = 0; n < 256; n++) {
  customWindow[n] = 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (256 - 1));
}

const customResult = welch(signal, {
  fs: fs,
  nperseg: 256,
  window: customWindow
});

console.log(`Custom window PSD computed successfully`);
console.log(`Number of frequency bins: ${customResult.frequencies.length}`);

// Example 4: Magnitude spectrogram
console.log("\n=== Magnitude Spectrogram ===");
const magResult = spectrogram(signal, {
  fs: fs,
  nperseg: 256,
  mode: 'magnitude'
});

console.log(`Magnitude spectrogram shape: ${magResult.spectrogram.length} × ${magResult.spectrogram[0].length}`);
console.log(`Max magnitude in spectrogram: ${Math.max(...magResult.spectrogram.flat()).toFixed(4)}`);

// Example 5: Baseband <-> passband conversion
console.log("\n=== Up/Downconversion ===");
const nsym = 256;
const baseband = new Float64Array(2 * nsym);
for (let i = 0; i < nsym; i++) {
  baseband[2 * i] = Math.cos(2 * Math.PI * 4 * i / nsym);
  baseband[2 * i + 1] = Math.sin(2 * Math.PI * 3 * i / nsym);
}

const bbFs = 1000;
const carrier = bbFs * 8 / nsym;
const pb = upconvert(baseband, { sps: 1, fc: carrier, fs: bbFs });
const bb = downconvert(pb, { sps: 1, fc: carrier, fs: bbFs });

let maxError = 0;
for (let i = 0; i < baseband.length; i++) {
  maxError = Math.max(maxError, Math.abs(bb[i] - baseband[i]));
}

console.log(`Passband samples: ${pb.length}, baseband samples: ${bb.length / 2}`);
console.log(`Round trip max error: ${maxError.toExponential(2)}`);

console.log("\n✓ Demo completed successfully!");
