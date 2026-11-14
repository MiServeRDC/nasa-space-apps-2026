# `ares-telemetry-ingest` — Phase 1 (GATHER): Multi-Modal Bus, Radar/Vocal DSP & SQI Filter

**Assigned Owner:** `@LelloXV` (`work/LelloXV`)  

## Scope
1. Lock-free multi-rate telemetry ring buffer ($100\text{ Hz}$ waveforms, $20\text{ Hz}$ UI frames, $1\text{ Hz}$ habitat avionics).
2. Contactless nocturnal mmWave/Wi-Fi CSI Doppler radar DSP ($\Delta\phi(t) = 4\pi d(t)/\lambda$) with $60/120\text{ Hz}$ ECLSS fan harmonic notch filtering (grounded in PhysioNet `CEBS` & NASA `ARCHeR`).
3. Acoustic vocal biomarker DSP ($F_0$ pitch, jitter, shimmer, spectral tilt, pause ratio grounded in NASA `HERA` & `CHAPEA`).
4. Real-time `CSA CANS` autonomous neutron spectrometer stream (~30% radiation dose fraction).
5. Spectral Entropy Signal Quality Index (`SQI >= 0.70`) motion-artifact and floating-sweat electrode decoupling filter (benchmarked on `PPG-DaLiA` & `Fantasia`).
