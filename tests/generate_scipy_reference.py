"""
Generate reference data using SciPy for validating the JavaScript DSP implementation.

This script generates various test signals and computes their PSD (using welch) and
spectrograms (using spectrogram) using SciPy as the reference implementation.

Requirements:
    pip install numpy scipy

Usage:
    python generate_scipy_reference.py
"""

import json
import numpy as np
from scipy import signal


def generate_test_signals(fs=1000):
    """Generate various test signals for validation."""
    signals = {}

    # 1. Pure sine wave at 100 Hz
    duration = 2.0
    t = np.arange(0, duration, 1/fs)
    signals['sine_100hz'] = {
        'fs': fs,
        'signal': np.sin(2 * np.pi * 100 * t).tolist(),
        'description': '100 Hz sine wave, 2 seconds'
    }

    # 2. Two-tone signal (100 Hz + 250 Hz)
    signals['two_tone'] = {
        'fs': fs,
        'signal': (np.sin(2 * np.pi * 100 * t) + 0.5 * np.sin(2 * np.pi * 250 * t)).tolist(),
        'description': '100 Hz + 250 Hz sine waves'
    }

    # 3. Chirp signal (frequency sweep from 50 to 450 Hz)
    chirp = signal.chirp(t, f0=50, f1=450, t1=duration, method='linear')
    signals['chirp'] = {
        'fs': fs,
        'signal': chirp.tolist(),
        'description': 'Linear chirp from 50 to 450 Hz'
    }

    # 4. White noise
    np.random.seed(42)  # For reproducibility
    noise = np.random.randn(len(t)) * 0.1
    signals['white_noise'] = {
        'fs': fs,
        'signal': noise.tolist(),
        'description': 'White Gaussian noise'
    }

    # 5. Sine with DC offset
    signals['sine_with_dc'] = {
        'fs': fs,
        'signal': (np.sin(2 * np.pi * 100 * t) + 0.5).tolist(),
        'description': '100 Hz sine wave with DC offset of 0.5'
    }

    # 6. Short signal for edge cases
    t_short = np.arange(0, 0.5, 1/fs)
    signals['sine_short'] = {
        'fs': fs,
        'signal': np.sin(2 * np.pi * 100 * t_short).tolist(),
        'description': '100 Hz sine wave, 0.5 seconds (short)'
    }

    return signals


def compute_welch_reference(signal_data, test_params):
    """Compute Welch PSD using SciPy for various parameter combinations."""
    results = {}

    for test_name, params in test_params.items():
        sig = np.array(signal_data['signal'])
        fs = signal_data['fs']

        # Compute using SciPy
        f, psd = signal.welch(
            sig,
            fs=fs,
            window=params.get('window', 'hann'),
            nperseg=params.get('nperseg', 256),
            noverlap=params.get('noverlap', None),
            nfft=params.get('nfft', None),
            detrend=params.get('detrend', 'constant'),
            return_onesided=True,
            scaling=params.get('scaling', 'density'),
            average='mean'
        )

        results[test_name] = {
            'params': params,
            'frequencies': f.tolist(),
            'psd': psd.tolist()
        }

    return results


def compute_spectrogram_reference(signal_data, test_params):
    """Compute spectrogram using SciPy for various parameter combinations."""
    results = {}

    for test_name, params in test_params.items():
        sig = np.array(signal_data['signal'])
        fs = signal_data['fs']

        mode = params.get('mode', 'psd')

        # Compute using SciPy
        f, t, spec = signal.spectrogram(
            sig,
            fs=fs,
            window=params.get('window', 'hann'),
            nperseg=params.get('nperseg', 256),
            noverlap=params.get('noverlap', None),
            nfft=params.get('nfft', None),
            detrend=params.get('detrend', 'constant'),
            return_onesided=True,
            scaling=params.get('scaling', 'density'),
            mode=mode
        )

        results[test_name] = {
            'params': params,
            'frequencies': f.tolist(),
            'times': t.tolist(),
            'spectrogram': spec.tolist()  # 2D array [freq, time]
        }

    return results


def main():
    print("Generating test signals...")
    signals = generate_test_signals(fs=1000)

    # Define test parameter sets
    welch_params = {
        'default': {
            'nperseg': 256,
            'noverlap': 128,
            'scaling': 'density',
            'detrend': 'constant'
        },
        'no_overlap': {
            'nperseg': 256,
            'noverlap': 0,
            'scaling': 'density',
            'detrend': 'constant'
        },
        'high_overlap': {
            'nperseg': 256,
            'noverlap': 192,
            'scaling': 'density',
            'detrend': 'constant'
        },
        'spectrum_scaling': {
            'nperseg': 256,
            'noverlap': 128,
            'scaling': 'spectrum',
            'detrend': 'constant'
        },
        'no_detrend': {
            'nperseg': 256,
            'noverlap': 128,
            'scaling': 'density',
            'detrend': False
        },
        'larger_nperseg': {
            'nperseg': 512,
            'noverlap': 256,
            'scaling': 'density',
            'detrend': 'constant'
        },
        'zero_padding': {
            'nperseg': 256,
            'noverlap': 128,
            'nfft': 512,
            'scaling': 'density',
            'detrend': 'constant'
        }
    }

    spectrogram_params = {
        'default': {
            'nperseg': 256,
            'noverlap': 32,  # nperseg/8
            'mode': 'psd',
            'scaling': 'density',
            'detrend': 'constant'
        },
        'magnitude_mode': {
            'nperseg': 256,
            'noverlap': 32,
            'mode': 'magnitude',
            'scaling': 'density',
            'detrend': 'constant'
        },
        'high_overlap': {
            'nperseg': 256,
            'noverlap': 128,
            'mode': 'psd',
            'scaling': 'density',
            'detrend': 'constant'
        },
        'spectrum_scaling': {
            'nperseg': 256,
            'noverlap': 32,
            'mode': 'psd',
            'scaling': 'spectrum',
            'detrend': 'constant'
        },
        'no_detrend': {
            'nperseg': 256,
            'noverlap': 32,
            'mode': 'magnitude',
            'scaling': 'density',
            'detrend': False
        }
    }

    # Generate reference data
    reference_data = {
        'signals': signals,
        'welch': {},
        'spectrogram': {}
    }

    print("Computing Welch PSD reference data...")
    for signal_name, signal_data in signals.items():
        print(f"  Processing {signal_name}...")
        reference_data['welch'][signal_name] = compute_welch_reference(
            signal_data, welch_params
        )

    print("Computing spectrogram reference data...")
    for signal_name, signal_data in signals.items():
        print(f"  Processing {signal_name}...")
        reference_data['spectrogram'][signal_name] = compute_spectrogram_reference(
            signal_data, spectrogram_params
        )

    # Save to JSON
    output_file = 'scipy_reference_data.json'
    print(f"\nSaving reference data to {output_file}...")
    with open(output_file, 'w') as f:
        json.dump(reference_data, f, indent=2)

    print("Done!")
    print(f"\nGenerated reference data for:")
    print(f"  - {len(signals)} test signals")
    print(f"  - {len(welch_params)} Welch parameter sets per signal")
    print(f"  - {len(spectrogram_params)} spectrogram parameter sets per signal")

    # Print summary statistics
    print("\nSignal summary:")
    for name, data in signals.items():
        print(f"  {name}: {len(data['signal'])} samples @ {data['fs']} Hz")


if __name__ == '__main__':
    main()
