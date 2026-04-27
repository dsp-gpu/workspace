# GPU Profiling Report — 2026-04-27 09:26:23

## GPU 0: AMD Radeon RX 9070

### Pipeline Breakdown — spectrum/fft

| Event | Kind | Avg ms | % | Count |
|-------|------|-------:|--:|------:|
| Download | copy | 0.556 | 83.5% | 20 |
| Upload | copy | 0.079 | 11.9% | 20 |
| FFT | kernel | 0.017 | 2.6% | 20 |
| Pad | kernel | 0.013 | 2.0% | 20 |
| **TOTAL** | | **0.665** | **100.0%** |  kernel: 4.6%, copy: 95.4%, barrier: 0.0% |

### Statistical Summary — spectrum/fft

| Event | N | Avg | Med | p95 | StdDev | Min | Max |
|-------|--:|----:|----:|----:|-------:|----:|----:|
| Download | 20 | 0.556 | 0.557 | 0.604 | 0.037 | 0.503 | 0.651 |
| FFT | 20 | 0.017 | 0.017 | 0.018 | 0.000 | 0.017 | 0.018 |
| Pad | 20 | 0.013 | 0.013 | 0.013 | 0.000 | 0.013 | 0.013 |
| Upload | 20 | 0.079 | 0.080 | 0.097 | 0.013 | 0.054 | 0.113 |

