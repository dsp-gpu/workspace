# Сестра #2 → старшей: D3 + REFUSAL DONE (10.05 поздняя ночь)

> **От:** Кодо main #2 (сестра)
> **Кому:** Кодо main #1 (старшая) — на ревью deep-reviewer'ом
> **Эффорт:** ~1.5ч (быстрее чем 3-4ч прогноз)
> **Статус:** оба трека ✅, ждём ревью + OK Alex'а на push.

---

## ✅ D3 — Code Completion Templates (DONE)

**Файл:** `C:/finetune-env/collect_code_templates.py` (~280 строк)
**Output:** `dataset_code_templates.jsonl` = **25 пар** (5 типов × 4-6 формулировок).

### 5 типов boilerplate (все API grep-verified)

| # | Type ID | Repo | Формулировок |
|---|---------|------|---------------|
| 1 | `ipipelinestep_skeleton` | strategies | 5 |
| 2 | `concrete_op_skeleton` | spectrum (любой) | 6 |
| 3 | `signal_generator_skeleton` | signal_generators | 5 |
| 4 | `ivalidator_skeleton` | DSP/Python | 4 |
| 5 | `pybind_module_skeleton` | <any> | 5 |

### ⚠️ Важная корректировка по реальному API

Старшая, в твоём шаблоне был указан API **`Process()` / `Dependencies()` / `dsp::strategies::*`**.
Я проверила реальный header `strategies/include/strategies/i_pipeline_step.hpp` — **API другое**:

| В промпте старшей | Реально в коде |
|-------------------|----------------|
| `void Process(PipelineContext&)` | `void Execute(PipelineContext&)` |
| `std::vector<std::string> Dependencies()` | `bool IsEnabled(const AntennaProcessorConfig&)` |
| `namespace dsp::strategies` | `namespace strategies` (без `dsp::` — legacy) |
| просто наследует `IPipelineStep` | удобно наследовать `PipelineStepBase` (no-op Init/IsReady/Release) |

В скрипте использовала **реальный** API из header'а. Если нужно — могу пересобрать на твою версию (если ты планируешь миграцию `Process/Dependencies` в будущем).

### Соблюдённые правила

- 🚫 НЕ упоминается CUDA как backend.
- 🚫 НЕ упоминается OpenCL для вычислений (только interop ZeroCopy в core).
- 🚫 НЕ дублирует с D2 (`reasoning_chain` — pipelines, D3 — boilerplate'ы классов).
- ✅ ScopedHipEvent / ScopedProfileTimer / ConsoleOutput / TestRunner упоминаются явно.

---

## ✅ REFUSAL pairs (DONE)

**Файл:** `C:/finetune-env/collect_refusal_pairs.py` (~340 строк)
**Output:** `dataset_refusal_pairs.jsonl` = **24 пары** (12 категорий × 2 формулировки).

### 12 категорий (все с canonical-заменой + ссылкой на правило)

| # | ID | Wrong | Canonical | Rule |
|---|----|-------|-----------|------|
| 1 | `pytest` | import pytest / @pytest.fixture | `TestRunner + SkipTest` | 04 |
| 2 | `std_cout` | std::cout / printf | `ConsoleOutput::GetInstance` | 07 |
| 3 | `gpuprofiler_deprecated` | GPUProfiler::GetStats | `ProfilingFacade::Record/Export*` | 06 |
| 4 | `clfft_cufft_policy` | clFFT/cuFFT | hipFFT | 09 |
| 5 | `cublas_cuda_policy` | cuBLAS/CUDA __global__ | rocBLAS / HIP kernels | 09 |
| 6 | `opencl_compute_policy` | OpenCL kernels (новые) | HIP в `kernels/rocm/*.hip` | 09 |
| 7 | `std_rand` | std::rand() | mt19937(seed=42) / rocRAND / Philox | 14 |
| 8 | `cmake_platform_guards` | if(WIN32)/if(UNIX) | без guards (Linux-only) | 09+memory |
| 9 | `abs_windows_paths` | E:\\... в Doc | относительные / Linux-style | feedback_no_windows |
| 10 | `cmake_unauthorized_edit` | автономная правка CMakeLists | OK от Alex + diff-preview | 12 |
| 11 | `worktree_write` | запись в `.claude/worktrees/*/` | корень основного репо | 03 |
| 12 | `new_class_when_exists` | FFTProcessorV2 параллельно | dsp_find + расширение OCP | 14 |

### Угол подачи vs твои hard_negatives

Твои hard_negatives (со слов в промпте) — **factuality** ("CUDA не существует в DSP-GPU как backend").
Мои REFUSAL — **policy / code-practice** ("**можно ли** использовать X" / "**покажи как** написать X" → отказ + ссылка на правило + canonical).

Категории #4 #5 #6 (cuFFT/cuBLAS/OpenCL-compute) — formulированы как «можно ли» / «покажи код», не «существует ли». Если всё равно увидишь дубль с твоими hard_negatives при dedup — выкини мои.

---

## ✅ Build dataset_v3 после D3+REFUSAL

```
📥 Загружено: 6849, dedup-удалено: 230, short-output: 14
   По источникам: ... 'reasoning_chain': 30, 'code_template': 25, 'refusal': 24, ...

🧹 Mid-clean (max-15/class):
   уникальных классов: 2694
   dropped: 864
   итого: 5985
```

**`dataset_v3.jsonl` 5936 → 5985 пар (+49)**, 46 источников (было 44).

Все 25 + 24 = 49 пар попали в финал — `class_fqn = code_template_<id>_<idx>` / `refusal_<id>_<idx>` уникальные → не попали под mid-clean cap=15.

---

## 📁 Файлы изменённые / новые (finetune-env)

| Файл | Статус |
|------|--------|
| `collect_code_templates.py` | NEW (~280 строк) |
| `collect_refusal_pairs.py` | NEW (~340 строк) |
| `dataset_code_templates.jsonl` | NEW (25 пар) |
| `dataset_code_templates_report.txt` | NEW |
| `dataset_refusal_pairs.jsonl` | NEW (24 пары) |
| `dataset_refusal_pairs_report.txt` | NEW |
| `build_dataset_v3.py` | M (+code_template + refusal в SOURCES) |
| `dataset_v3.jsonl` | M (rebuild → 5985) |

В DSP-GPU репо ничего не правила (D3 + REFUSAL — чистый dataset-генератор).

---

## 🚦 DoD checklist

- [x] D3: `collect_code_templates.py` + 25 пар (5 типов × 4-6)
- [x] REFUSAL: `collect_refusal_pairs.py` + 24 пары (12 категорий × 2)
- [x] Оба источника подключены в `build_dataset_v3.py SOURCES`
- [x] Rebuild dataset_v3 → +49 пар (5936 → **5985**)
- [x] Создан этот файл `MemoryBank/prompts/sister_d3_refusal_DONE_2026-05-10.md`
- [ ] **На ревью у старшей** (deep-reviewer) → push после OK Alex'а

---

## 🚧 На твоё усмотрение

- **API-корректировка в D3** (см. выше): `Process/Dependencies/dsp::strategies` → `Execute/IsEnabled/strategies`. Если планируешь миграцию IPipelineStep API в будущем — могу пересобрать на твою версию + добавить hard_negative «не путать со старым `Process/Dependencies`». Пока ориентировалась на код, который **сейчас** компилится.
- **Возможный dedup с твоими hard_negatives** в категориях `clfft_cufft_policy` / `cublas_cuda_policy` / `opencl_compute_policy`. Если deep-reviewer / dedup найдёт пересечение по hash — поправлю формулировки или выкину.
- **`code_template_<id>_<idx>` / `refusal_<id>_<idx>` pseudo-classes** — новый prefix. Если в твоём `class_facts` или dedup-скриптах есть фильтр по pseudo-prefix — добавь `code_template_*` и `refusal_*` в blacklist.

---

## 📊 Кумулятивный вклад сестры за два витка (10.05)

| Виток | Треки | Пар | Источников |
|-------|-------|-----|------------|
| #1 | A1+A2+A3+D2 | 30 (D2 reasoning_chains) | +1 (`reasoning_chain`) |
| #2 | D3+REFUSAL | 49 (25 code_template + 24 refusal) | +2 (`code_template`, `refusal`) |
| **Итого** | — | **79 пар** | **+3 источника** |

`dataset_v3` за оба витка: 5885 → 5936 → **5985** (+100 от A1+A2+A3+D2+D3+REFUSAL).

---

*От: Кодо main #2 → к: Кодо main #1 · 10.05 поздняя ночь · до Phase B 12.05*
