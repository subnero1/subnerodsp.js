#!/usr/bin/env julia
#
# Generates reference data for upconvert/downconvert by running SignalAnalysis.jl,
# so the JavaScript implementation in src/dsp.js can be validated against it.
#
# Usage:
#   julia tests/generate_signalanalysis_reference.jl
#
# Writes tests/signalanalysis_reference_data.json

using Pkg
Pkg.activate(; temp = true)
Pkg.add(["SignalAnalysis", "JSON"])

using SignalAnalysis
using JSON
using DSP: resample

# SignalAnalysis stores framerate as Float32, so its `domain(s)` time axis - and hence
# the carrier phase in upconvert/downconvert - is single precision. That drifts by up to
# ~1e-5 over these test signals. The JS implementation mixes in double precision, so we
# emit two references per case:
#   * "*64": the same algorithm with a Float64 time axis (strict comparison, 1e-9)
#   * the raw library output (loose comparison, proves we match the real thing in practice)
# Everything else (rrcosfir taps, DSP.jl resample, hilbert) is used exactly as-is.

function upconvert64(x::Vector{ComplexF64}, sps, fc, fs)
  s = x
  if sps != 1
    h = rrcosfir(0.25, sps)
    pad = cld(length(h), 2*sps) - 1
    s = resample(vcat(zeros(ComplexF64, pad), s, zeros(ComplexF64, pad)), sps, h)
  end
  √2 * real.(s .* cis.(2π * fc * (0:length(s)-1) ./ (sps * fs)))
end

function downconvert64(x::Vector{Float64}, sps, fc, fs)
  s = samples(analytic(x))
  s = s .* cis.(-2π * fc * (0:length(s)-1) ./ fs)
  sps == 1 ? s : resample(s, 1//sps, rrcosfir(0.25, sps))
end

# Deterministic (no RNG) baseband: two tones plus a slow drift, distinct on I and Q.
baseband(n) = ComplexF64[
  (cos(0.11i + 0.3) + 0.4cos(0.7i)) + im * (sin(0.07i) - 0.25sin(0.31i + 1.1))
  for i in 0:n-1
]

# Deterministic real passband signal.
passband(n) = Float64[cos(0.9i + 0.2) + 0.3sin(0.13i) for i in 0:n-1]

interleave(x) = collect(Iterators.flatten((real(v), imag(v)) for v in x))

cases = Dict{String,Any}()

# rrcosfir taps: catches pulse shape bugs directly.
cases["rrcosfir"] = [
  Dict("beta" => 0.25, "sps" => sps, "taps" => collect(rrcosfir(0.25, sps)))
  for sps in (1, 2, 4)
]

# upconvert: baseband lengths chosen so the passband length is a power of 2
# (sps == 1 -> n, sps > 1 -> (n + 22) * sps), keeping the JS FFT-based analytic exact.
fs = 1000.0
up = []
for (sps, n) in ((1, 512), (2, 234), (4, 234)), fc in (0.0, 200.0, 300.0)
  bb = baseband(n)
  pb = upconvert(signal(bb, fs), sps, fc; fs = fs)
  push!(up, Dict(
    "sps" => sps, "fc" => fc, "fs" => fs,
    "baseband" => interleave(bb),
    "passband" => collect(samples(pb)),
    "passband64" => upconvert64(bb, sps, fc, fs)
  ))
end
cases["upconvert"] = up

# downconvert: passband lengths are powers of 2 for the same reason.
down = []
for (sps, m) in ((1, 512), (2, 512), (4, 1024)), fc in (0.0, 200.0, 300.0)
  pbfs = fs * sps
  pb = passband(m)
  bb = downconvert(signal(pb, pbfs), sps, fc; fs = pbfs)
  push!(down, Dict(
    "sps" => sps, "fc" => fc, "fs" => pbfs,
    "passband" => pb,
    "baseband" => interleave(samples(bb)),
    "baseband64" => interleave(downconvert64(pb, sps, fc, pbfs))
  ))
end
cases["downconvert"] = down

# Round trip: upconvert then downconvert at the same sps/fc.
trips = []
for (sps, n) in ((1, 512), (4, 234)), fc in (200.0,)
  bb = baseband(n)
  pb = upconvert(signal(bb, fs), sps, fc; fs = fs)
  rt = downconvert(pb, sps, fc; fs = fs * sps)
  push!(trips, Dict(
    "sps" => sps, "fc" => fc, "fs" => fs,
    "baseband" => interleave(bb),
    "roundtrip" => interleave(samples(rt)),
    "roundtrip64" => interleave(downconvert64(upconvert64(bb, sps, fc, fs), sps, fc, fs * sps))
  ))
end
cases["roundtrip"] = trips

out = joinpath(@__DIR__, "signalanalysis_reference_data.json")
open(out, "w") do io
  JSON.print(io, cases)
end
println("wrote $out")
