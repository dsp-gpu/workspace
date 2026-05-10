# TASK_DATASET_v4_cleanup — чистый dataset_v4 для Phase B 12.05

> **Создан:** 2026-05-10 ночь · **Приоритет:** 🔴 P0 (БЛОКЕР Phase B)
> **Effort:** ~2-3 часа · **Контекст:** smoke 2080 Ti поймал 5 ошибок (см. `specs/LLM_and_RAG/smoke_2080ti_2026-05-10_PASSED.md`)

---

## 🎯 Цель

Сделать **dataset_v4.jsonl** = очищенный + дополненный dataset_v3 для Phase B на RX 9070 12.05.

Лечит 4 из 5 ошибок smoke (Singleton/Bridge, dsp_fft/spectrum, TestBackend, RochesterGPU). Пятая (beam_count truncation) лечится `max_seq_len=1024` в Phase B.

---

## 📋 Подэтапы (4 шага)

### 1. 🔴 Fix `collect_inheritance.py` — skip Test*  (~5 мин)

**Bug:** в `dataset_inheritance.jsonl` пара «IBackend → ROCm/OpenCL/**TestBackend**». TestBackend — test-helper, не production.

**Файл:** `C:/finetune-env/collect_inheritance.py:55` (regex `find_implementations`).

**Fix:**
```python
# Skip test-helper implementations
if impl_name.startswith("Test") or impl_name.endswith("Test"):
    continue
```

**Verify:** перегенерить → `dataset_inheritance.jsonl` не должен содержать TestBackend / TestSomething.

---

### 2. 🔴 negative_lookup × 5 — anti-hallucination (~30 мин)

**Bug:** RochesterGPU выдумала с подробностями — 261 negative_lookup на 79 классов **не хватило**.

**Файл:** `C:/finetune-env/collect_negative_pairs.py`

**Fix:**
1. Расширить `FAKE_PREFIXES` (с 10 до 30):
   ```python
   FAKE_PREFIXES = [
       "Rochester", "Microsoft", "Apple", "Google", "Yandex",
       "Intel", "Cisco", "Adobe", "Tensor", "Quantum",
       "Boston", "Stanford", "MIT", "Tesla", "Amazon",
       "Meta", "OpenAI", "Anthropic", "Samsung", "Sony",
       "Nokia", "IBM", "Oracle", "Salesforce", "Twitter",
       "Netflix", "Spotify", "Uber", "Airbnb", "Discord",
   ]
   ```
2. Добавить **ещё 2 типа** опечаток:
   - **typo_double**: удвоить случайную букву (`ROCmBackend` → `ROCmmBackend`)
   - **typo_case**: испортить регистр (`HybridBackend` → `hybridBackend` / `HYBRIDbackend`)
3. **Расширить классы** с 79 (`limit=80`) до **150** (`limit=160`).

**Ожидаемо:** 261 → ~1300 пар negative_lookup.

**Дополнительный спец-блок** в output для топ-10 классов:
```
Класс `RochesterGPU` НЕ существует в DSP-GPU. Список реальных классов в core:
HybridBackend, ROCmBackend, OpenCLBackend, ROCmCore, DrvGPU, GPUManager, ...
Не выдумывай несуществующие классы.
```

---

### 3. 🟡 `<repo>/Doc/Patterns.md` руками (Alex, ~1 ч его времени)

**Bug:** модель путает Singleton vs Bridge для HybridBackend.

**Решение НЕ алгоритмическое** — Alex сам пишет 8 файлов (по одному на каждый репо: core/spectrum/stats/signal_generators/heterodyne/linalg/radar/strategies). 100% accuracy.

**Шаблон `<repo>/Doc/Patterns.md`:**
```markdown
# Архитектурные паттерны репо `<repo>`

## RAII (Resource Acquisition Is Initialization)
- `ScopedHipEvent` — обёртка hipEvent_t (ctor=create, dtor=destroy)
- `ScopedMap` — RAII над hipHostMalloc/hipFree
...

## Singleton
- `ConsoleOutput::GetInstance()` — единственный поток вывода для multi-GPU
- `ServiceManager::GetInstance()` — координатор сервисов
- `GPUManager::GetInstance()` — реестр всех GPU
...

## Bridge
- `DrvGPU` (фасад) → `IBackend` (interface) → `ROCmBackend / OpenCLBackend / HybridBackend` (impls)
- Назначение: один высокоуровневый API для разных GPU backend'ов

## Factory
- `ConfigSerializerFactory` — выбор JSON/YAML reader

## Strategy
- `IPipelineStep` (strategies repo) — `MedianStrategy / MeanStrategy / ...`

## Observer
- (если есть)
```

**Автоматический подхват:** `collect_doc_deep.py` уже работает с `<repo>/Doc/*.md` — Patterns.md автоматически попадёт в dataset как 8 пар (по одной на репо).

---

### 4. 🟡 `namespace_correction_pairs` (~20 мин)

**Bug:** модель сказала FFTProcessorROCm живёт в `dsp_fft` (legacy), а правильно `dsp::spectrum`.

**Новый скрипт:** `C:/finetune-env/collect_namespace_corrections.py` — для каждого репо генерит пары:
```
Q: «Какой каноничный namespace для FFTProcessorROCm?»
A: «Каноничный namespace `dsp::spectrum::FFTProcessorROCm`. Legacy имя
    `fft_processor::FFTProcessorROCm` deprecated (см. .claude/rules/10-modules.md)»
```

**Источник:** `.claude/rules/10-modules.md` таблица «Каноничные имена» (legacy → canonical).

**Объём:** 8 репо × ~5-10 классов = ~50-70 пар.

---

## ✅ DoD

- [ ] `collect_inheritance.py` — skip Test* (verify: нет TestBackend в output)
- [ ] `collect_negative_pairs.py` — 30 prefixes + 2 новых typo + limit=160 → ~1300 пар
- [ ] `<repo>/Doc/Patterns.md` × 8 репо (руками Alex)
- [ ] `collect_namespace_corrections.py` — 50-70 пар
- [ ] Rebuild `dataset_v3.jsonl` → ~7100 пар
- [ ] **Snapshot:** `dataset_v4_2026-05-11.jsonl` (защита от случайных правок)
- [ ] Train/val split (90/10) → `dataset_v4_train.jsonl` + `dataset_v4_val.jsonl`
- [ ] Smoke 2080 Ti на 350 пар (1 эпоха, 5-10 мин) — pipeline работает
- [ ] **Только тогда** Phase B на RX 9070 12.05

---

## ⚠️ Что НЕ делать

❌ **Не удалять весь dataset_v3** — большинство пар хорошие, проблема локальная (TestBackend + legacy namespace). Cleanup лучше чем re-build.

❌ **Не делать continue training на текущем checkpoint medium-2080ti-2026-05-10** — cosine LR довёл lr→0. Resume требует нового LR (`--lr 5e-5 --epochs 2 --warmup-steps 0`). Лучше свежий Phase B на 9070 (3 эпохи + r=16 + bf16 + правильный schedule).

❌ **Не менять модель** Qwen3-8B → Qwen2.5-coder ДО Phase B. Сначала проверить что Qwen3 + dataset_v4 работает. Если good → параллельно тренировать Qwen2.5-coder для сравнения (отдельный run, тот же dataset).

---

## 🔁 После Phase B (12.05)

1. Inference compare на тех же 6 вопросах (что в smoke) — сравнить с baseline 0.78
2. Прогноз: eval_loss ~0.40-0.50 (3 эпохи + bf16 + r=16)
3. Если RochesterGPU всё ещё выдумывается → negative_lookup × 10 (2600 пар)
4. Если хорошо → start Qwen2.5-coder параллель

---

## Связано

- Spec: `MemoryBank/specs/LLM_and_RAG/smoke_2080ti_2026-05-10_PASSED.md` (root-cause + рекомендации)
- Phase B TASK: `tasks/TASK_FINETUNE_phase_B_2026-05-12.md`
- Inference script: `C:/finetune-env/inference_compare.py`
- Plot script: `C:/finetune-env/plot_train_curves.py`

---

*Created: 2026-05-10 ночь · Кодо main · после smoke + medium train на 2080 Ti*
