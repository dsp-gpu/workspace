# 🗂️ DSP-GPU — MemoryBank MASTER INDEX

> **Workspace**: `/home/alex/DSP-GPU/` (Debian 13 trixie — рабочий полигон)
> **Organization**: `github.com/dsp-gpu`
> **Эталон-монолит**: `/home/alex/C++/GPUWorkLib/` (не трогаем!)
> **GPU**: AMD Radeon RX 9070 (gfx1201) + MI100 (gfx908) · **ROCm 7.2+ / HIP**
> **Последнее обновление**: 2026-06-01 (Profiler/KernelCache v2 техдолг закрыт + верифицирован на gfx1201)

---

## 🚦 Статус проекта

Миграция GPUWorkLib (монолит) → dsp-gpu (10 модульных репо) — **завершена и принята на GPU**.

| Фаза | Описание | Статус |
|------|----------|--------|
| 0 | Аудит зависимостей | ✅ DONE |
| 1 | CMake-скелеты 9 репо | ✅ DONE + pushed |
| 2 | Копирование кода | ✅ DONE |
| 3 | CMake-адаптация | ✅ DONE |
| 3b | Python bindings | ✅ DONE |
| 3c | AMD-стандарт + ScopedHipEvent RAII | ✅ DONE 2026-04-15 |
| 3d | Namespace `dsp::<repo>::*` (7/7) | ✅ DONE 2026-05-12 |
| **4** | **Testing на Debian GPU (gfx1201 + ROCm 7.2)** | ✅ **DONE 2026-06-01** |

### Фаза 4 — что принято (acceptance на RX 9070)

- ✅ **Namespace acceptance 26/26 PASS** (2026-05-13) — 7/7 build, 9/9 ctest, 8/8 Python imports
- ✅ **Python migration 53/54 PASS** (2026-05-21) — 1 off-scope (нужен LLM api_keys.json)
- ✅ **Profiler v2** — `new_profiler` слита в main 7/7 репо; **core: 108 PASS / 0 FAIL / 3 SKIP** на gfx1201 (2026-06-01); Record latency 276 ns, golden export, Q7 timing-source
- ✅ **KernelCache v2** — `kernel_cache_v2` слита в core/main; ручной hiprtc вычищен; pre-warm cache (.hsaco + manifest SHA256)
- 🔜 Tag `v0.2.0` — готов к простановке (ждёт OK Alex)

---

## 📊 Статус репо (2026-06-01, всё в origin/main)

| Репо | HEAD | Namespace | Тесты на GPU |
|------|------|-----------|--------------|
| **core** | `8a9c17b` | `drv_gpu_lib::*` (canonical) | ✅ 108/0/3 (gfx1201) |
| **spectrum** | `ef9e899` | `dsp::spectrum` | ✅ acceptance |
| **stats** | `88e5e79` | `dsp::stats` | ✅ acceptance |
| **signal_generators** | `0ffb8fb` | `dsp::signal_generators` | ✅ acceptance |
| **heterodyne** | `d7686ac` | `dsp::heterodyne` | ✅ acceptance |
| **linalg** | `934e424` | `dsp::linalg` | ✅ acceptance + 15× ScalarAbsError |
| **radar** | `bc96301` | `dsp::radar` | ✅ acceptance |
| **strategies** | `a8022a4` | `dsp::strategies` | ✅ 53/54 Python |
| **DSP** (meta) | `b5c6679` | — | — |
| **workspace** | `285b9e9` | — | — |

---

## 📁 Структура workspace

```
/home/alex/DSP-GPU/
├── CLAUDE.md · DSP-GPU.code-workspace
├── MemoryBank/                     ← spec + tasks + changelog + rules (canonical)
├── .vscode/ + .claude/
│
├── core/                           ← DrvGPU + ProfilingFacade v2 + ScopedHipEvent
├── spectrum/                       ← FFT + filters + lch_farrow
├── stats/                          ← statistics + SNR
├── signal_generators/              ← CW/LFM/Noise/Script/Form
├── heterodyne/                     ← Dechirp/NCO/Mix
├── linalg/                         ← vector_algebra + capon
├── radar/                          ← range_angle + fm_correlator
├── strategies/                     ← pipelines v1
└── DSP/                            ← мета-репо + Python/ + Doc/ + Results/
```

---

## 🧪 Параллельный трек — LLM & RAG (finetune-env, отдельный репо)

> Полная история → `tasks/IN_PROGRESS.md` (верхние секции) + `.claude/rules/17-llm-bench.md`.

- **RAG-стек** на Debian: PG + Qdrant + Ollama + embed + dsp-asst (systemd autostart). 19,961 row в `rag_dsp.*`.
- **llm_bench** schema (`gpu_rag_dsp.llm_bench`) — multi-project compare (dsp-gpu / pao-contrib / rag-mentor).
- **Phase 6** — 3 модели × 2 проекта, no catastrophic forgetting (14B-DSP 3.2=3.2).
- **Phase 7** (2026-06-01) — DeepSeek compare A→D done; ни одна не бьёт production-стек. Phase E (train R1-Distill-14B) ждёт FP16 base (качается дома).
- **Production LLM**: `qwen3.6-mtp-llamaserver` Q4_K_M (с 2026-05-26).

---

## 📚 Ключевые документы

### 📝 Specs (ревью / аудиты)
| Документ | Тема |
|----------|------|
| [core_spectrum_REVIEW_2026-04-15.md](specs/core_spectrum_REVIEW_2026-04-15.md) | core + spectrum review |
| [GPUProfiler_Rewrite_Proposal_2026-04-16.md](specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md) | Profiler v2 proposal |
| [KernelCache_v2_Proposal_2026-04-16.md](specs/KernelCache_v2_Proposal_2026-04-16.md) | KernelCache v2 proposal |
| [phase7_compare_2026-06-01.md](specs/phase7_compare_2026-06-01.md) | LLM Phase 7 DeepSeek compare |

### 📐 Doc (новое)
| Документ | Тема |
|----------|------|
| `core/Doc/Services/Profiling/Full.md` | ProfilingFacade v2 — полный API (01.06) |

### 📋 Активные / отложенные таски
| Документ | Статус |
|----------|--------|
| `tasks/IN_PROGRESS.md` | 🟢 актуальный указатель (LLM Phase 7 + техдолг закрыт) |
| `tasks/TASK_Phase7E_train_r1distill14b_2026-06-01.md` | 🟡 ждёт FP16 base |
| `.future/TASK_remove_opencl_legacy_classes_2026-05-08.md` | ⏸ инвентаризация caller'ов factory |
| `.future/TASK_pybind_review.md` · `TASK_gtest_variant...` · `TASK_script_dsl_rocm.md` · `TASK_namespace_migration_legacy...` | ⏸ перспективные |

---

## 🔖 Что дальше (не горит)

| # | Задача | Когда |
|---|--------|-------|
| 1 | Tag `v0.2.0` на все 10 репо (release) | после OK Alex |
| 2 | LLM Phase 7E — train R1-Distill-14B (FP16) | после привоза base |
| 3 | `.future/` — OpenCL legacy classes, pybind review | по необходимости |

---

## ⚠️ Важные ссылки

- **Эталон-монолит**: `/home/alex/C++/GPUWorkLib/` (не трогать!)
- **GitHub org**: `github.com/dsp-gpu`
- **LLM/RAG**: `/home/alex/finetune-env/` (отдельный git-репо)
- **Ветки**: `main` = Linux/ROCm (рабочая). Профайлер/кэш-ветки удалены 01.06 (слиты в main).
- **Полигон**: 🏠 домашняя RX 9070 (тесты/обучение). Дома RTX 2080 Ti (качать). Сервер 10.10.4.105 — не для обучения.

---

*Created: 2026-04-12 · Updated: 2026-06-01 (Phase 4 DONE + Profiler/KernelCache v2 closed) · Maintained by: Кодо*
