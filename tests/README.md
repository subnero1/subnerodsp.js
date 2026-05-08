# DSP Validation Tests

This directory contains validation tests that compare the JavaScript DSP implementation against SciPy as the reference implementation.

## Files

- `generate_scipy_reference.py` - Python script that generates reference data using SciPy
- `scipy_reference_data.json` - Reference data file (generated, not in git)
- `scipy_validation_test.js` - Node.js test suite that validates JS implementation against reference
- `scipy_validation_test.js` - Node.js test suite that validates JS implementation against reference
- `debug_*.py` / `debug_*.js` - Debug scripts for troubleshooting

## Running Validation Tests

### Prerequisites

Install Python dependencies:
```bash
pip install numpy scipy
```

### Generate Reference Data

First, generate the reference data using SciPy:

```bash
cd tests
python generate_scipy_reference.py
```

This creates `scipy_reference_data.json` containing:
- 6 different test signals (sine waves, chirps, noise, etc.)
- 7 parameter combinations for Welch's method
- 5 parameter combinations for spectrogram
- Expected outputs from SciPy for each combination

### Run Validation Tests

Run the Node.js tests to validate the JavaScript implementation:

```bash
pnpm test:scipy
```

Expected output:
```
✓ Loaded SciPy reference data
▶ Welch: sine_100hz - default parameters
   ✔ Welch: sine_100hz - default parameters
...
✔ 17 tests passing
```

## Test Coverage

### Welch PSD Tests (10 tests)

Tests various signals and parameter combinations:
- Pure sine waves (100 Hz)
- Two-tone signals (100 Hz + 250 Hz)
- Chirp signals (frequency sweeps)
- White Gaussian noise
- Signals with DC offset

Parameters tested:
- Default parameters
- No overlap (noverlap=0)
- High overlap (noverlap=192/256)
- Spectrum vs density scaling
- With/without detrending
- Different segment sizes (nperseg=256, 512)
- Zero-padding (nfft > nperseg)

### Spectrogram Tests (7 tests)

Tests time-frequency analysis with:
- PSD mode vs magnitude mode
- Different overlap settings
- Spectrum vs density scaling
- Various signal types

## Validation Criteria

Tests verify that JavaScript output matches SciPy within numerical precision:

- **Frequencies**: Exact match (within machine epsilon)
- **PSD values**: Relative error < 1e-6, Absolute error < 1e-10
- **Spectrograms**: < 1% of points can have larger errors

All current tests achieve **much better** precision than required:
- Typical relative errors: ~1e-12 to 1e-15
- Maximum absolute errors: ~1e-16 to 1e-17

## Implementation Notes

The JavaScript implementation matches SciPy's behavior for:

1. **Window function**: Uses periodic Hann window (like SciPy's default for spectral estimation)
2. **Normalization**:
   - Density scaling: Divides by `fs * sum(window^2)`
   - Spectrum scaling: Divides by `(sum(window))^2`
   - Magnitude mode: Divides by `sqrt(sum(window^2) * fs)`
3. **One-sided spectrum**: Doubles power for non-DC/non-Nyquist bins
4. **Detrending**: Removes mean from each segment

## Debugging

If tests fail, use the debug scripts:

```bash
# Check SciPy's window and normalization
python tests/debug_scipy.py
python tests/debug_window.py
python tests/debug_magnitude.py

# Check JavaScript implementation
node tests/debug_js.js
```

## Regenerating Reference Data

If you modify the DSP implementation or want to test with different parameters:

1. Edit `generate_scipy_reference.py` to add new test cases
2. Run `python generate_scipy_reference.py` to regenerate reference data
3. Update `scipy_validation_test.js` to add corresponding test cases
4. Run the validation tests

## Why Validate Against SciPy?

SciPy is the de facto standard for scientific computing in Python and is:
- Widely used and battle-tested
- Well-documented with clear API specifications
- Based on peer-reviewed algorithms (Welch 1967, etc.)
- Maintained by the scientific computing community

By matching SciPy's output, we ensure our JavaScript implementation is correct and can be trusted for scientific applications.
