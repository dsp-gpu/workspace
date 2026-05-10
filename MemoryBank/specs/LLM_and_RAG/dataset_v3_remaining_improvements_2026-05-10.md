# Что осталось улучшить в dataset_v3 после 10.05

> **Старт:** 1093 dirty (Phase A) → **Финал 10.05:** **5883 пар, 44 источника, +438% baseline = 5.38x**.
> Все физические источники проекта охвачены. Ниже — что **не сделано** и **что можно** для следующего витка.
>
> **Передавать сестрёнкам:** см. секцию приоритетов в конце.

---

## ✅ Что уже закрыто (44 источника)

**Из БД `rag_dsp.*`:** symbols (class/method/free_function/field/namespace), test_params (param_edges/throws/return), pybind_bindings, doc_blocks (rich), cmake_targets, file_grouping.

**Из filesystem:** Doc/{Full,Quick,API,Patterns,deep}/, CLAUDE.md, README.md, .rag/arch/{C2,C3,C4}/, kernels/*.hpp (HIP+OpenCL), tests/test_*.hpp, .claude/specs/, MemoryBank/{specs,architecture,agent,prompts,changelog,feedback}, DSP/{Doc,Examples,Python}/, cmake/*.cmake, CMakePresets.json, test_utils/.

**Алгоритмическое:** python_aug, usage_aug, **negative_lookup × 2 (418 пар)**, namespace_correction, explicit_patterns (anti-galлюц).

**Anti-galлюц P0 (после medium-train inference на 2080 Ti):** patterns_md (89 классов / 30 паттернов), namespace_correction (130 пар «legacy fft_processor → dsp::spectrum»), 9 P0 правок в Patterns.md (brief'ы + file:line).

---

## 📋 Что осталось — 14 пунктов в 5 категориях

### 🟢 A. Лёгкие правки (есть, не сделано) — P1 effort 10-30 мин

| # | Что | Effort | Эффект |
|---|-----|-------:|--------|
| **A1** | `core/Doc/Patterns.md`: brief'ы для `GPUBuffer` (стр.22) и `AsyncServiceBase` (стр.89) | 5 мин | -2 пустых описания |
| **A2** | `spectrum/Doc/Patterns.md:48-49`: `MagnitudeOp` brief = `TODO: AI-fill` → реальный (нужно дописать в header или удалить запись) | 10 мин | -1 TODO |
| **A3** | Adapter секция в `stats/linalg/radar/Doc/Patterns.md`: вынести `Py*Processor` (`PyStatisticsProcessor` / `PyCaponProcessor` / `PyRangeAngleProcessor`) из Pipeline в новую секцию **Adapter** | 15 мин | правильная классификация Adapter pattern |
| **A4** | Косметика: off-by-one file:line у `ProfilingFacade` (`:68` doxygen vs `:69` class) — мелочь | skip | low ROI |

**Передавать сестре:** «возьми A1+A2+A3 — простой Edit в 4 файлах».

---

### 🟡 B. После Phase B 12.05 inference — P0 (зависит от результата train на 9070)

| # | Что | Триггер | Эффект |
|---|-----|---------|--------|
| **B1** | **3-way inference compare** (baseline r=8 dirty / smoke r=8 dataset_v3 / full r=16 dataset_v3 на 9070) — найдёт новые галлюцинации | после full train 12.05 | список конкретных weak spots |
| **B2** | Точечные anti-galлюц шаблоны под найденные weak spots | после B1 | ~50-200 пар per category |
| **B3** | RAGAs faithfulness / abstain на golden-set v2 (CTX5 partial) | модель в Ollama deployed | метрика «знает vs гадает» |

**Передавать сестре:** «жди результат 12.05 → сделай B1 → выбери top-3 проблемы → шаблоны». Это **ГЛАВНЫЙ** трек после Phase B.

---

### 🟠 C. Большие источники, отложенные — Effort 5-10ч

| # | Что | Effort | Риск |
|---|-----|-------:|------|
| **C1** | **AI-summary v2** через `qwen3-8b-dsp:latest` (наша fine-tuned модель!) на топ-44 классов. Phase A v1 на чистом qwen3:8b делал галлюц 2/5 — fine-tuned может быть лучше | 3-5ч | 🟡 нужен фильтр качества (deep-review каждого summary) |
| **C2** | **Cross-class deps graph** (G1 graph extension partial) — статический парсинг .cpp/.hpp → AST → «метод A вызывает метод B» → пары «как X использует Y» | 9-11ч | 🔴 сложно, требует libclang |
| **C3** | **Late Chunking BGE-M3** (CTX7 deferred) — улучшит retrieval (НЕ dataset, но retrieval) | 2ч | нужен `transformers==4.46` venv на AMD |

**Передавать сестре:** «C1 — после Phase B (нужна обученная модель). C2 — отдельный спринт. C3 — Phase C+».

---

### 🟢 D. Качество > количество (новые шаблоны на существующих данных)

| # | Что | Effort | Эффект |
|---|-----|-------:|--------|
| **D1** | **Hard negatives** — пары «не знаю / не реализовано». Примеры: «Есть ли CUDA backend в DSP-GPU?» → «Нет, только ROCm/HIP (правило 09-rocm-only)»; «Есть ли OpenCV интеграция?» → «Нет». Сейчас 0 таких. | 2ч | критично против fabrication |
| **D2** | **Reasoning chains / multi-step Q&A** — «Если хочу полный radar pipeline, какая цепочка классов?» → step 1 (signal_gen), step 2 (heterodyne), step 3 (spectrum), step 4 (linalg), step 5 (radar). Сейчас pipeline_data_flow=85, но без явных шагов. | 3-4ч | улучшает code generation |
| **D3** | **Code completion templates** — «Дай boilerplate для нового `IPipelineStep`», «Добавь Op в spectrum» — на основе Ref03 6-слойной модели + реальных классов | 2-3ч | приучает модель к шаблонам проекта |
| **D4** | **Mid-clean semantic dedup** — top-15 классов имеют ~30 пар каждый. Часть может быть semantic-near-dups. Прогон через embeddings cosine sim → отрезать >0.92 | 1ч | -~50-150 пар, +качество |

**Передавать сестре:** «D1 + D2 — приоритет, D3 опционально, D4 — после анализа top-15 классов на дубли».

---

### 🔴 E. Risky / experimental

| # | Что | Риск |
|---|-----|------|
| **E1** | **Synthetic Q&A loop**: fine-tuned модель → генерирует свои Q&A → curated subset → recursive fine-tune. Self-training. | 🔴 распространяет ошибки модели, требует **очень** строгий фильтр (deep-review каждой пары) |
| **E2** | **Adversarial pairs** через GPT-4 / Claude API (платные) — «найди как сломать модель» | 🟡 деньги + контроль quality |

**Передавать сестре:** «E1 — только если Phase B показал острую нехватку, E2 — только при бюджете».

---

## 🎯 Приоритеты (по смыслу, не по effort)

```
1. Phase B 12.05 train → запустить → дождаться результата          ⏰ next 48h
2. B1: 3-way inference compare → найти weak spots                  ⏰ 12-13.05
3. B2: точечные anti-galлюц шаблоны под weak spots (top-3)          ⏰ 13-14.05
4. D1: Hard negatives (CUDA / OpenCV / другие фейк-фичи)           ⏰ параллельно с B2
5. A1+A2+A3: лёгкие правки в Patterns.md (косметика)               ⏰ когда руки свободны
6. D2: Reasoning chains / multi-step                                ⏰ Phase C
7. C1: AI-summary через qwen3-8b-dsp (наш!) на топ-44               ⏰ Phase C
8. RAGAs eval (B3)                                                  ⏰ после деплоя в Ollama
9. C2: Cross-class deps graph (libclang)                            ⏰ Phase D
10. D3: Code templates / D4: semantic dedup                         ⏰ когда нужно
```

## 🚨 Что НЕ делать

- ❌ **augmentation round 5+** (сейчас 4 раунда: python_aug + usage_aug + negative_lookup × 2). Diminishing returns, риск разбавить сигнал. Phase A diagnostic 8.05 уже показал что больше пар ≠ лучше.
- ❌ Третьи доки от других проектов (third_party). Только DSP-GPU.
- ❌ **E1 Synthetic loop** до Phase B — может усилить существующие галлюцинации.

---

## 📊 Текущая метрика datasetа (snapshot 10.05)

```
dataset_v3_final_2026-05-10.jsonl = 5883 пар (cap=30)
44 источника / 30+ концептов
2400+ уникальных классов
+438% от baseline 1093 = 5.38x
```

**Готовность к Phase B:** ✅ ALL GREEN (smoke 2080 Ti PASSED).

---

*Maintained by: Кодо main #1 (старшая) · 2026-05-10 поздняя ночь · после P0-fix + agent push 11 репо*
