# GPU Profiling Report — 2026-04-20 18:38:45

## GPU 0: AMD Radeon RX 9070

### Pipeline Breakdown — spectrum/fft

| Event | Kind | Avg ms | % | Count |
|-------|------|-------:|--:|------:|
| Download | copy | 0.525 | 84.2% | 20 |
| Upload | copy | 0.075 | 12.0% | 20 |
| Pad | kernel | 0.013 | 2.1% | 20 |
| FFT | kernel | 0.011 | 1.8% | 20 |
| **TOTAL** | | **0.624** | **100.0%** |  kernel: 3.9%, copy: 96.1%, barrier: 0.0% |

### Statistical Summary — spectrum/fft

| Event | N | Avg | Med | p95 | StdDev | Min | Max |
|-------|--:|----:|----:|----:|-------:|----:|----:|
| Download | 20 | 0.525 | 0.522 | 0.568 | 0.020 | 0.487 | 0.568 |
| FFT | 20 | 0.011 | 0.011 | 0.011 | 0.000 | 0.011 | 0.011 |
| Pad | 20 | 0.013 | 0.013 | 0.014 | 0.000 | 0.013 | 0.014 |
| Upload | 20 | 0.075 | 0.072 | 0.110 | 0.014 | 0.053 | 0.115 |

