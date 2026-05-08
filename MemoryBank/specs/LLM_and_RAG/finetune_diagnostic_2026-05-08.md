# Finetune Diagnostic 2026-05-08 — глубокий анализ 3 экспериментов

> Контекст: Phase A (07.05 утро) дала `qwen3-8b-dsp` со слабым качеством
> (зацикливание в Ollama, выдуманные библиотеки). На вечер 07.05 + утро 08.05
> провели 3 эксперимента для понимания корня проблемы.

## TL;DR

**Главное открытие**: `train_loss` (даже last-N avg) **слабо коррелирует** с inference quality
на маленьких узкоспециализированных датасетах. Возможно увидеть **ниже loss + хуже ответы**.

**Опровергнутая гипотеза**: «датасет = bottleneck → max-5/class clean».
**Фактическая причина** ухудшения на clean: catastrophic forgetting + потеря critical mass
повторений факт-имён.

---

## 1. Постановка экспериментов

| # | Имя | Dataset | r | epochs | steps | hardware |
|---|-----|---------|---|--------|-------|----------|
| 1 | **Phase A** (07.05 утро) | `dataset_enriched.jsonl` (1093, dirty) | 4 | 3 | 411 | 2080 Ti @ 11GB |
| 2 | **Diagnostic** (07.05 вечер) | то же 1093 dirty | **8** | 3 | 411 | то же |
| 3 | **CLEAN** (08.05 утро) | `dataset_enriched_clean.jsonl` (247, clean) | 8 | 3 | 93 | то же |

**Цель эксп. 2 vs 1**: изолировать вклад LoRA r (одна переменная меняется).
**Цель эксп. 3 vs 2**: изолировать вклад датасета (одна переменная меняется).

Конфиг clean_dataset.py: drop unknown class (47), drop output<50 chars (38),
hash-dedup, **max 5 примеров на класс** (срезает 70% датасета: 1093 → 247).

## 2. Train metrics — финальные

### 2.1 Полное среднее (transformers `train_loss`)

| Run | full avg | min | runtime |
|-----|----------|-----|---------|
| Phase A r=4 | **1.180** | 0.58 | 44 мин |
| Diagnostic r=8 | **1.113** | 0.61 | 62 мин |
| CLEAN r=8 | **1.272** | 0.65 | 26 мин |

**Парадокс**: CLEAN имеет САМЫЙ ВЫСОКИЙ полный avg, хотя last-N показывает обратное.

### 2.2 Last-10 шагов avg (правильная метрика)

Для маленьких runs (CLEAN: 93 шагов) первые 10 warmup-шагов дают вклад **11%**.
На больших (Phase A/Diagnostic: 411 шагов) — те же 10 шагов = **2.4%**.
→ Сравнение по `train_loss` (full avg) **некорректно** между runs разной длины.

| Run | last-10 avg | last-20 avg |
|-----|-------------|-------------|
| Phase A r=4 | n/a (лога нет в cheatsheet) | n/a |
| Diagnostic r=8 | ~0.95 | ~0.95 |
| CLEAN r=8 | **0.815** | 0.826 |

**По last-10**: CLEAN выглядит лучшим. По inference — наоборот.

### 2.3 grad_norm (стабильность)

| Run | финал. range |
|-----|--------------|
| Phase A r=4 | n/a |
| Diagnostic r=8 | 0.7-1.0 |
| CLEAN r=8 | 0.55-0.83 (стабильнее) |

CLEAN показывает **бОльшую стабильность** — модель в режиме «тонкой подгонки», не
обучения с нуля. Это **признак overfit** на узкий набор.

## 3. Inference compare (3 промпта × 3 модели)

Промпты (фиксированные в `inference_test.py`):
1. «Опиши назначение класса FFTProcessorROCm из репозитория spectrum проекта DSP-GPU.»
2. «Покажи пример использования ScopedHipEvent (core) — RAII-обёртка hipEvent_t.»
3. «Какие ROCm-библиотеки используются в DSP-GPU? Кратко.»

### 3.1 Промпт 1 — FFTProcessorROCm

| Модель | Главная характеристика | Галлюцинации |
|--------|------------------------|--------------|
| BASE (без LoRA) | общее: 1D/2D FFT на ROCm | хорошо в общем плане |
| Phase A r=4 (dirty) | **hipFFT** ✅, методы выдуманы | `processComplex`, `validate`, `getFrequencyAxis` |
| Diagnostic r=8 (dirty) | **rocfft** ❌, методы выдуманы | `process_2d`, `get_result` |
| **CLEAN r=8** | **«ROCm = Rochester GPU»** ❌❌ + «архитектура VEGA» ❌ | новый класс галлюцинаций — НЕ было ни на base, ни на dirty |

**Вывод**: CLEAN добавил **нового мусора**, dirty-r=4 был ближе к правде (hipFFT).

### 3.2 Промпт 2 — ScopedHipEvent

| Модель | Path | Namespace |
|--------|------|-----------|
| BASE (без LoRA) | inline класс, без include | нет namespace, использует `std::cerr` ❌ |
| Phase A r=4 (dirty) | `core/rocm/hip_event.hpp` ⚠️ | `drv_gpu_lib::` ✅ |
| Diagnostic r=8 (dirty) | `core/services/hip_event.hpp` ✅ (близко) | `drv_gpu_lib::` ✅ |
| **CLEAN r=8** | `core/ScopedHipEvent.hpp` ❌ | **`core::` ❌** (потерян!) |

**Вывод**: CLEAN **потерял** namespace `drv_gpu_lib::`, который был ✅ на обоих dirty-runs.

### 3.3 Промпт 3 — ROCm libs

| Модель | Кол-во правильных | Зацикливание |
|--------|-------------------|--------------|
| BASE (без LoRA) | путаница (ROCclr, ROCmath) | да |
| Phase A r=4 (dirty) | 3/5 + выдуманные (rocm_spectral, rocm_gpu_utils) | да |
| Diagnostic r=8 (dirty) | **5/5** (hip, hipfft, rocsolver, rocprim, hiprtc) | **нет** ✅ |
| **CLEAN r=8** | **4** (HIP Core, HIPfft, HIPblas, ROCprim) | **да, сильное** (повтор блока 3 раза) |

**Вывод**: Diagnostic r=8 dirty был **лучшим** на этом промпте. CLEAN деградировал.

## 4. Анализ — почему CLEAN хуже

### 4.1 Critical mass повторений

В `dataset_enriched.jsonl` (1093):
- упоминаний `hipfft` (грубо): ~20-30 раз через множество примеров
- упоминаний `drv_gpu_lib::`: ~50-100 раз
- упоминаний `rocsolver`, `rocprim`: ~10-15 раз каждое

В `dataset_enriched_clean.jsonl` (247) после max-5/class:
- упоминаний `hipfft`: ~5-7 раз
- упоминаний `drv_gpu_lib::`: ~10-15 раз
- упоминаний `rocsolver`, `rocprim`: ~2-3 раза

→ модель видит факт-имена **в 4-5 раз реже** → не закрепляет в LoRA весах.

### 4.2 Catastrophic forgetting в LoRA

LoRA с r=8 имеет 7.67M параметров (vs base 8.2B). Это **0.09%** capacity модели.
На узком наборе 247 LoRA «перезаписывает» часть знаний:
- база знала `drv_gpu_lib::` через множество вариаций контекста (dirty 1093) — на CLEAN
  модель «переучилась» под `core::` (видимо в редких clean-примерах был такой namespace).
- база знала «ROCm = Radeon Open Compute» — на CLEAN модель вообще выдала «Rochester GPU»
  (galu в base из training corpus, который dirty закрепил, а clean не успел).

### 4.3 Train_loss ≠ inference quality

CLEAN дал **last-10 avg 0.815** (лучший показатель) — но это **overfit на синтаксис**:
модель отлично предсказывает следующий токен **в ответах из train-set**, потому что
шаблоны коротких clean-примеров проще. Но она **не накопила фактуры** для inference на
**новых промптах** (промпты в inference_test.py НЕ из train-set).

## 5. Корректные выводы для Phase B (12.05 на 9070)

### ❌ Что НЕ работает (опровергнуто экспериментом 3)

- max-5/class clean → потеря critical mass → catastrophic forgetting
- «меньше = чище» — НЕ для маленьких узкоспециальных датасетов с неравномерным
  распределением классов

### ✅ Что брать на 9070

| Стратегия | Логика | Ожидание |
|-----------|--------|----------|
| **dirty 1093 + r=16 + bf16** | capacity-up без trade-off датасета | last-10 ~0.7-0.9, inference как у dirty r=8 + чуть лучше |
| **expanded 2000+ + r=16** | накопление critical mass | last-10 ~0.6-0.8, inference радикально лучше |
| **mid-clean (max-15/class) + r=16** | компромисс: убрать жёсткие дубли, оставить factu | промежуточный |
| **новый формат промпта** | возможно `### Задача / ### Код / ### Ответ` учит копировать шаблон | требует отдельный эксперимент |

### 🚫 Чего НЕ делать на 9070

- Не использовать `dataset_enriched_clean.jsonl` (247) — это путь к галлюцинациям
- Не запускать r=8 «для скорости» — на 9070 r=16 не сильно медленнее
- Не верить полному `train_loss` (full avg) — смотреть только **last-10/last-20**
- Не оценивать модель только по train_loss — **обязательно eval_loss + inference compare**

## 6. Методические выводы

1. **Метрика для сравнения runs разной длины** — `last-N avg`, не full avg.
2. **Train_loss низкий ≠ модель хорошая** на маленьких узких датасетах.
3. **Eval split (10% holdout)** — обязателен на 9070, без него не видно overfit.
4. **Inference compare** — единственный честный judge при отсутствии eval_set.
5. **Critical mass повторений** факт-имён важнее «чистоты» — если в датасете факты
   повторяются 10+ раз, они закрепляются в LoRA. Если 2-3 раза — теряются при overfit.

## 7. Артефакты на момент написания

| Артефакт | Путь | Размер |
|----------|------|--------|
| Phase A r=4 dirty адаптер | `C:\finetune-env\output\full-r4-2026-05-07\` | ~60 MB |
| Diagnostic r=8 dirty адаптер | `C:\finetune-env\output\full-qwen3-r8-2026-05-07\` | ~120 MB |
| CLEAN r=8 адаптер | `C:\finetune-env\output\full-qwen3-r8-clean-2026-05-08\` | ~120 MB |
| 2-way inference compare logs | `C:\finetune-env\output\compare-r4-vs-r8\` | — |
| 3-way inference compare logs | `C:\finetune-env\output\compare-3way\` | — |
| dataset_enriched.jsonl (dirty) | `C:\finetune-env\` | 5.14 MB / 1093 lines |
| dataset_enriched_clean.jsonl (НЕ использовать) | `C:\finetune-env\` | 0.5 MB / 247 lines |

---

*Записал: Кодо · 2026-05-08*
