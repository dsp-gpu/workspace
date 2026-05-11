# Halluc-rate метрики 4 моделей — PG+Qdrant validator (2026-05-11)

> **Эксперимент:** 11.05 утро · 2080 Ti дома · validator через `dsp-asst serve` (PG `rag_dsp.symbols` + Qdrant `dsp_gpu_rag_v1` через SSH-туннель)
> **Скрипт:** `E:\finetune-env\validate_inference.py` (был `C:\finetune-env\` до миграции 11.05)
> **Связь:** spec `postgres_grounded_inference_2026-05-11.md` (этот файл — экспериментальное подтверждение)

---

## 📊 Сводная таблица (6 вопросов × 9 запусков)

| Модель | Total IDs | Real | Fake | **Halluc %** | Δ vs base |
|--------|----------:|-----:|-----:|------------:|----------:|
| Base qwen3-8b           | 14 |  5 |  9 | **64.3%** | — |
| Hour-180  (180 steps)   | 27 | 12 | 15 | **55.6%** | −8.7 pp |
| Resume-360 (+180 steps) | 25 | 10 | 15 | **60.0%** | −4.3 pp ⚠️ |
| **Resume2-540 (+52 expl-neg, v5 dataset)** | 31 | 15 | 16 | **51.6%** ✅ | **−12.7 pp** |
| Resume2 RAW (через grounded_inference.py) | 23 | 9 | 14 | 60.9% | −3.4 pp |
| **Resume2 + P2 GROUNDED** ⭐ | 17 | 9 | 8 | **47.1%** | **−17.2 pp от base / −13.8 pp от RAW** |
| **Long-v6-1220 RAW** (v6 dataset = +1548 db_facts) | 28 | 13 | 15 | **53.6%** ✅ | **−10.7 pp** |
| Long-v6-1220 + P2 RAW | 31 | 14 | 17 | 54.8% | −9.5 pp |
| Long-v6-1220 + **P2 GROUNDED** | 27 | 11 | 16 | **59.3%** ⚠️ | −5.0 pp (хуже RAW!) |

### ⚠️ Парадокс Long-v6 + P2

Long-train натренировал модель **более уверенно** говорить про классы. Когда в БД `doxy_brief = "(описание отсутствует)"` (много TODO в `rag_dsp.symbols`), P2 grounding инжектирует это в prompt — и модель **дополняет пустое место выдумкой**.

**Пример Q4 IBackend:**
- БД для `drv_gpu_lib::IBackend`: `doxy_brief = "(описание отсутствует в БД)"`
- Модель в Long-v6 видит это и выдаёт 11 fake identifiers (рассказывает «придуманную» структуру)
- В resume2-540 (менее обученной) — выдала всего 1 (модель скромнее)

**Вывод:** **качество `doxy_brief` в БД важнее количества train шагов** для P2 режима.

### 🏆 Best result

**`Resume2 + P2 GROUNDED = 47.1% halluc`** (комбо: умеренный train + полный grounding).
Long-v6 даёт лучший RAW, но проигрывает в P2.

## 📉 Eval loss timeline (вторичная метрика)

| Эксперимент | Steps total | eval_loss |
|-------------|------------:|----------:|
| Hour-180 | 180 | 1.089 |
| Resume-360 | 360 | 0.985 |
| Resume2-540 | 540 | 0.9323 |
| Short-test-v6 (620) | 620 | 0.9454 |
| **Long-train-v6 (1220)** | **1220** | **0.8333** (-23.5% vs Hour) |

## 📈 Per-question breakdown

| Q | Тема | Base | Hour-180 | Resume-360 | Resume2-540 |
|---|------|-----:|--------:|----------:|------------:|
| Q1 | HybridBackend | 75.0% | 60.0% | 75.0% | **77.8%** ❌ |
| Q2 | ScopedHipEvent | 0.0% | 0.0% | 40.0% | 50.0% |
| Q3 | FFTProcessorROCm namespace | 66.7% | 66.7% | 50.0% | 50.0% |
| Q4 | IBackend impls | 75.0% | 55.6% | **25.0%** ✅ | 33.3% |
| Q5 | beam_count edges | 0.0% | 0.0% | 0.0% | 0.0% |
| Q6 | RochesterGPU (anti-gallуц) | 100.0% | 62.5% | **100.0%** ❌ | **50.0%** ✅ |

---

## 🎯 Главное доказательство — Q6 RochesterGPU

> **Это ровно та регрессия, которую мы хотели полечить +52 explicit_negative парами.**

```
Base:        100.0%  (1/1 fakes)
Hour-180:     62.5%  (5/8 fakes)  ← train немного помог
Resume-360:  100.0%  (5/5 fakes)  ← УГЛУБИЛО галлюц
                                       («ROCm backend на HIP/hipFFT с hipMalloc...»)
Resume2-540:  50.0%  (4/8 fakes)  ✅ +52 explicit_neg ВДВОЕ снизили halluc
```

**Вывод:** прямые negative pairs формата «X не существует — возможно ты имел в виду Y» **работают** на anti-hallucination. Это эмпирическое подтверждение.

---

## 🔍 Анализ паттернов

### ✅ Что continue training лечит хорошо

1. **Backend enumeration (Q4 IBackend):**
   - Base: 75% halluc (выдумывает CUDA/CPU/HIP)
   - Resume: **25%** ← убрала CPU, оставила OpenCL+ROCm
   - Эффект `collect_inheritance.py` + `collect_explicit_patterns.py`

2. **RAII / hipEvent (Q2 ScopedHipEvent — на base):**
   - Base: 0% halluc (просто общее описание, без выдумки имён)
   - Hour: 0% halluc (полный RAII + код)

### ❌ Что НЕ лечит train

1. **GoF паттерн идентификация (Q1 HybridBackend):**
   - Все 4 модели путают: Composite / Singleton + Factory Method / Singleton + CUDA
   - Правильно: **Bridge** (HybridBackend = Bridge между ROCm и OpenCL)
   - Resume2 даже **ХУЖЕ** (выдумывает `CreateCUDA()`)
   - → Нужны **больше explicit_pattern пар** на GoF, или P2 wrapper

2. **Namespace точность (Q3):**
   - 3 fine-tuned модели стабильно говорят `dsp::signal_processing` вместо `dsp::spectrum`
   - → Нужны явные namespace correction пары для FFTProcessorROCm

3. **Глубокая галлюцинация на ScopedHipEvent (Q2 fine-tuned):**
   - Base: 0% halluc (мало деталей)
   - Hour/Resume/Resume2: 0% / 40% / 50% — модель **больше деталей → больше fakes**
   - Это **парадокс training**: чем больше стиль, тем больше выдумок

---

## 💡 Ключевые выводы для Phase B 9070

| Вывод | Action item |
|-------|-------------|
| **Train alone снижает halluc на 12.7 pp** за 540 шагов на 2080 Ti | Phase B 9070 (3 epochs × r=16 × bf16) ожидаемо даст 30-40% halluc |
| **explicit_negative пары ВДВОЕ режут Q6 halluc** | На 9070 добавить **+200 explicit_neg** (vs текущих 52) — Q6 → <20% |
| **GoF паттерны НЕ выучиваются** через generic training | Нужны явные explicit_pattern пары: «HybridBackend = Bridge, НЕ Singleton, НЕ Composite» |
| **Namespace ошибки стабильны** | namespace_correction pairs для FFT/Capon/Stats expand |
| **halluc 51.6% всё равно МНОГО для production** | **P2 RAG wrapper НЕОБХОДИМ** — без grounding модель в principe не вылечится |

---

## 🚀 Прогноз для Phase B + P2

```
Текущее (2080 Ti, 540 steps, dataset_v3 + 52 expl-neg):  51.6% halluc

Phase B 9070 alone (3 ep × r=16 × bf16 × dataset_v4):    ~30-40% halluc (прогноз)
Phase B 9070 + P2 RAG wrapper:                            <20%   (target)
Phase B 9070 + P2 + +200 expl-neg + explicit_patterns:   <10%   (production)
```

---

## 📁 Артефакты

| Файл | Что |
|------|-----|
| `E:\finetune-env\validate_inference.py` | Validator (~280 строк) |
| `E:\finetune-env\halluc_report.md` | Markdown report от последнего запуска |
| `E:\finetune-env\output\dynamics-hour-resume2-2026-05-11\` | Best checkpoint (51.6% halluc) |
| `E:\finetune-env\output\compare-resume2-2026-05-11\inference_resume2.log` | Inference output |
| `E:\finetune-env\dataset_v3_dynamics_v5_2026-05-11.jsonl` | Snapshot v5 (6138 пар) |

> ⚠️ **Пути после миграции 11.05** — был `C:\finetune-env\`, стал `E:\finetune-env\`. См. `MemoryBank/specs/finetune_env_reorg_review_2026-05-11.md` §3.

---

## 🔗 Связи

- `postgres_grounded_inference_2026-05-11.md` — теоретическая спека идеи (этот файл — экспериментальное подтверждение)
- `migration_plan_2026-05-10.md` — соседний файл (план миграции на 9070)
- `MemoryBank/specs/LLM_and_RAG/smoke_2080ti_2026-05-10_PASSED.md` — предыдущий контекст smoke train

---

*Эксперимент: Alex + Кодо · 2026-05-11 утро · 2080 Ti дома · 4 модели × 6 вопросов × validator через `dsp-asst serve`*
