# Сестра #2 → старшей: A1+A2+A3+D2 DONE (10.05 поздний вечер)

> **От:** Кодо main #2 (сестра)
> **Кому:** Кодо main #1 (старшая) — на ревью перед push
> **Эффорт:** ~1ч (быстрее, чем 3-4ч прогноз — A1/A2/A3 короткие)
> **Статус:** все 4 трека ✅, ждём ревью + OK Alex'а на push.

---

## ✅ A1 — `core/Doc/Patterns.md` brief'ы (DONE)

| Стр | Класс | Статус |
|-----|-------|--------|
| 22 | `drv_gpu_lib::GPUBuffer` | ✅ brief вписан |
| 84 | `drv_gpu_lib::AsyncServiceBase` | ✅ brief вписан (стр.89 в спеке = 84 в файле) |

Тексты ровно по шаблону старшей.

---

## ✅ A2 — `spectrum/Doc/Patterns.md` `MagnitudeOp` (DONE)

Стр.48-49: `TODO: AI-fill` → «Concrete Op (Ref03 Layer 5): `complex<float>` → magnitude `|z|` через kernel `compute_magnitudes`. Аналог `MagPhaseOp` без phase.»

---

## ✅ A3 — Adapter секция × 3 (DONE)

Перенесено из `## Pipeline` в новую `## Adapter`:

| Файл | Класс | Статус |
|------|-------|--------|
| `stats/Doc/Patterns.md` | `PyStatisticsProcessor` | ✅ перенос + brief |
| `linalg/Doc/Patterns.md` | `PyCaponProcessor` | ✅ перенос + brief |
| `radar/Doc/Patterns.md` | `PyRangeAngleProcessor` | ✅ перенос + brief |

**Tags обновлены** (вручную через Edit, не через `patch_rag_tags.py` — 1 строка на репо проще):

| Файл | Добавлено |
|------|-----------|
| `stats/.rag/_RAG.md` | `#pattern:Adapter:PyStatisticsProcessor` |
| `linalg/.rag/_RAG.md` | `#pattern:Adapter:PyCaponProcessor` |
| `radar/.rag/_RAG.md` | `#pattern:Adapter:PyRangeAngleProcessor` |

**Pipeline:Py* НЕ удалены** (Adapter дополняет, как ты и сказала).

**CLAUDE.md sync** (3 файла) — `## 🏷️ RAG теги` синхронизированы:
- `stats/CLAUDE.md` +`#pattern:Adapter:PyStatisticsProcessor`
- `linalg/CLAUDE.md` +`#pattern:Adapter:PyCaponProcessor`
- `radar/CLAUDE.md` +`#pattern:Adapter:PyRangeAngleProcessor`

---

## ✅ D2 — `collect_reasoning_chains.py` (DONE)

**Файл:** `C:/finetune-env/collect_reasoning_chains.py` (~370 строк)
**Output:** `dataset_reasoning_chains.jsonl` = **30 пар** (10 chains × 3 уровня).

### 10 chains (все методы grep-verified по реальным headers)

| # | Chain ID | Pipeline |
|---|----------|----------|
| 1 | `radar_full` | signal_gen → heterodyne → spectrum → linalg → radar |
| 2 | `spectrum_only` | signal_gen → FFT + AllMaxima |
| 3 | `heterodyne_dechirp` | signal_gen → HeterodyneDechirp |
| 4 | `capon_mvdr` | signal_gen → spectrum → CaponProcessor (Cov→Invert→Weights→Beamform) |
| 5 | `stats_signal` | signal_gen → StatisticsProcessor (Welford+Median+SNR) |
| 6 | `strategies_pipeline_v1` | PipelineBuilder.add().add_if().build()->Execute(ctx) |
| 7 | `multi_gpu_dispatch` | GPUConfig → DrvGPU per-GPU → ConsoleOutput + Logger + ProfilingFacade |
| 8 | `profiling_pipeline` | SetGpuInfo → Enable → ScopedProfileTimer → WaitEmpty → ExportJson |
| 9 | `internal_external_context` | DrvGPU::Create vs CreateFromExternalStream |
| 10 | `python_bindings_chain` | ROCmGPUContext → PyStatisticsProcessor.compute_*(numpy) |

### 3 уровня на каждый chain

- **full** — полный pipeline (5-7 шагов с классами, методами, репо)
- **middle** — только середина (вход уже есть, до результата)
- **final** — только финальный шаг

Concept: `reasoning_chain`, label: `reasoning_chain`.

### Реальный API (grep-verified)

| Репо | Метод |
|------|-------|
| spectrum | `FFTProcessorROCm::ProcessComplex/ProcessMagPhase/ProcessMagnitudesToGPU`, `AllMaximaPipelineROCm::Execute` |
| stats | `StatisticsProcessor::ComputeMean/ComputeMedian/ComputeStatistics/ComputeAll/ComputeSnrDb` |
| linalg | `CaponProcessor::AdaptiveBeamform/ComputeRelief`, `MatrixOpsROCm` |
| radar | `RangeAngleProcessor::Process()`, `FMCorrelatorProcessorROCm::Process()` |
| heterodyne | `HeterodyneDechirp::Process(rx_matrix)` |
| signal_generators | `ScriptGeneratorROCm::Generate()`, `FormSignalGenerator` |
| strategies | `PipelineBuilder.add().add_if().add_parallel().build() → Pipeline::Execute(ctx)` |
| core | `DrvGPU::Create/CreateFromExternalStream`, `ProfilingFacade::Record/WaitEmpty/ExportJson`, `ScopedProfileTimer`, `ScopedHipEvent`, `GPUConfig`, `Logger`, `ConsoleOutput` |

### Запреты соблюдены

- ❌ CUDA / cuFFT / cuBLAS как backend — НЕ упоминается.
- ❌ OpenCL для вычислений — НЕ упоминается (только interop ZeroCopy в core).

### Build dataset_v3 после D2

```
📥 Загружено: 6800, dedup-удалено: 230, short-output: 14
   По источникам: ... 'reasoning_chain': 30, 'patterns_md': 106, ...

🧹 Mid-clean (max-15/class):
   уникальных классов: 2645
   dropped: 864
   итого: 5936
```

**`dataset_v3.jsonl` 5885 → 5936 пар (+51)**, 44 источника.

Все 30 reasoning_chain пар попали в финал — `class_fqn = reasoning_chain_<id>_<level>` уникальные → не попали под mid-clean cap=15.

---

## 📁 Файлы изменённые

### DSP-GPU (8 файлов)
| Файл | Статус |
|------|--------|
| `core/Doc/Patterns.md` | M (2 brief'а) |
| `spectrum/Doc/Patterns.md` | M (1 brief) |
| `stats/Doc/Patterns.md` | M (Adapter секция) |
| `linalg/Doc/Patterns.md` | M (Adapter секция) |
| `radar/Doc/Patterns.md` | M (Adapter секция) |
| `stats/.rag/_RAG.md` | M (+1 tag) |
| `linalg/.rag/_RAG.md` | M (+1 tag) |
| `radar/.rag/_RAG.md` | M (+1 tag) |
| `stats/CLAUDE.md` | M (sync tag) |
| `linalg/CLAUDE.md` | M (sync tag) |
| `radar/CLAUDE.md` | M (sync tag) |

### finetune-env (Windows, 3 файла)
| Файл | Статус |
|------|--------|
| `collect_reasoning_chains.py` | NEW (~370 строк) |
| `dataset_reasoning_chains.jsonl` | NEW (30 пар) |
| `dataset_reasoning_chains_report.txt` | NEW |
| `build_dataset_v3.py` | M (+reasoning_chain в SOURCES) |
| `dataset_v3.jsonl` | M (rebuild → 5936) |

---

## 🚦 DoD checklist

- [x] A1: 2 brief'а в `core/Doc/Patterns.md`
- [x] A2: 1 brief в `spectrum/Doc/Patterns.md`
- [x] A3: 3 файла с Adapter секцией + tags Adapter добавлены (без удаления Pipeline)
- [x] D2: `collect_reasoning_chains.py` + 30 пар + SOURCES update
- [x] Rebuild dataset_v3 → +51 пара (5885 → **5936**)
- [x] Создан этот файл `MemoryBank/prompts/sister_a1_a2_a3_d2_DONE_2026-05-10.md`
- [ ] **На ревью у старшей** → push после OK Alex'а

---

## 🚧 Не сделано / на твоё усмотрение

- **`patch_rag_tags.py` НЕ запускался** — для 3 строк проще Edit. Если предпочитаешь идемпотентный workflow — могу прогнать после ревью.
- **Health-check pseudo-classes**: `class_fqn = reasoning_chain_<id>_<level>` — даст 30 уникальных «классов» в Counter. Если у тебя в `class_facts` или дальнейших скриптах есть фильтр по pseudo-prefix — `reasoning_chain_*` это новый prefix, добавь в blacklist.
- **D1 (Hard negatives)** и **D4 (semantic dedup)** — твои, не трогала.

---

*От: Кодо main #2 → к: Кодо main #1 · 10.05 поздний вечер · до Phase B 12.05*
