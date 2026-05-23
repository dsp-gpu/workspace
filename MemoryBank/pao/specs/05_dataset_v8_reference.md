# Reference: dataset v8 collectors plan (от 2026-05-21)

> ⚠️ **Контекст**: этот документ — **референс** из проекта **DSP-GPU finetune-env** (сестра Sonnet 4.6, 21.05). Содержит DSP-GPU specific факты (HybridBackend / Bridge / drv_gpu_lib).
>
> **Для rag-mentor/rag-pao** применяется **методологически** (D33):
> - 10 коллекторов P0/P1/P2 переносим как **абстрактный шаблон** в `pipelines/_template/collectors/`
> - Per-target адаптация под `<target>/Doc/Patterns.md`, `_META.yaml`, key classes
> - Q1-Q10 acceptance синтезируется per-target (Alex для DSP-GPU, Кодо для новых)
>
> **Не применять цитаты HybridBackend/Bridge напрямую** — это пример для DSP-GPU, не для customer drops.
>
> **Цель**: Закрыть problem factual hallucination (Qwen галлюцинирует на known names) через расширение датасета и стабильный train.

---

## 1. Цели и acceptance criteria

### Acceptance v8 inference test (Q1-Q10 на тестовой модели после full train)

1. **Q: «Какой паттерн использует HybridBackend?»** → `Bridge` (а не Strategy)
2. **Q: «В каком namespace HybridBackend?»** → `drv_gpu_lib::` (а не `dsp_hybrid::`)
3. **Q: «В каком репо HybridBackend?»** → `core` (а не heterodyne)
4. **Q: «Какие RAII классы в core?»** → ≥4 из 6 (SVMBuffer, ScopedHipEvent, ScopedMap, ScopedProfileTimer, GPUBuffer, ZeroCopyBridge)
5. **Q: «Какие классы реализуют Bridge в DSP-GPU?»** → `HybridBackend` (reverse lookup)
6. **Q: «Как раньше назывался модуль spectrum?»** → `fft_func / fft_processor (legacy)`
7. **Q: «Какой пресет CMake для RX 9070?»** → `debian-local-dev` или `rx9070`
8. **Q: «Какой optimizer стабилен на gfx1201 для QLoRA?»** → `adamw_torch` (а не `adamw_8bit`)
9. **Q: «Существует ли клас RochesterGPU?»** → «Нет, это hallucination»
10. **Q: «HybridBackend — Singleton?»** → «Нет, Bridge» (confusion-aware)

**Pass threshold:** **≥7/10** правильных ответов на base+v7 vs **≥9/10** на v8.

### Acceptance train

- eval_loss финал < 0.65 (vs Coder-14B v6 @ checkpoint-375 = 0.7125)
- 0 NaN / inf в loss
- 0 OOM при load model
- HIP race retries: ≤ 3 за весь train

---

## 2. Baseline (что есть в v7)

```
dataset_v7_train.jsonl: 10308 строк
├── v6 base (10204 строк)
│   ├── symbols + signatures (классы/методы из RAG)
│   ├── doc_blocks (документация)
│   ├── test_params (параметры тестов)
│   ├── pybind_bindings (Python ↔ C++)
│   ├── files + includes + cmake + CLAUDE.md + Doc + arch + specs
│   └── negatives (261 typo/case/double/fake)
└── patterns_v7 (104 строки, NEW 21.05)
    ├── pattern_class_explicit (86): class → pattern label
    ├── pattern_classes_per_repo (19)
    └── repo_patterns_overview (8)

Метрики:
├── HybridBackend mentions: 156
├── "Bridge" labels: 7 (НО только в forward direction class → pattern)
├── HybridBackend ∩ Bridge: 43 (хорошо)
├── drv_gpu_lib mentions: 2879+
└── Уникальных классов: ~2428
```

**Проблема:** факты есть, но каждый встречается **1 раз** в одной формулировке. На 10% train модель не успевает запомнить точную связь.

---

## 3. Расширения v8 — по категориям

### 🔴 P0 (must-have, основной effect)

#### 3.1. **`collect_reverse_patterns.py`** — pattern → classes
- **Источник:** `<repo>/Doc/Patterns.md` (тот же что для v7, но обратный mapping)
- **Шаблон:**
  ```
  Q: "Какие классы реализуют Bridge в DSP-GPU?"
  A: "drv_gpu_lib::HybridBackend (core/include/core/backends/hybrid/hybrid_backend.hpp:75)"

  Q: "Какие классы реализуют Resource (RAII) в DSP-GPU?"
  A: "В core: SVMBuffer, ScopedHipEvent, ScopedMap, ScopedProfileTimer, GPUBuffer, ZeroCopyBridge"
  ```
- **Ожидаемо:** ~30-50 пар (по 1 на каждый паттерн × 10 паттернов = ~10 явных + 10-30 многоклассовых)
- **Effort:** ~30 мин (новый Python скрипт, простой)

#### 3.2. **`collect_synonym_pairs.py`** — 1 факт = 4-5 формулировок
- **Источник:** топ-200 ключевых фактов из v7 + patterns + наиболее запрашиваемые классы
- **Шаблон:**
  ```
  Канон: "HybridBackend использует Bridge pattern"
  Синонимы:
    Q1: "Какой паттерн использует HybridBackend?"
    Q2: "В каком GoF паттерне реализован HybridBackend?"
    Q3: "HybridBackend — это какой паттерн?"
    Q4: "К какому семейству паттернов относится HybridBackend?"
    Q5: "Какой design pattern у класса HybridBackend?"
  Все Q → один A: "HybridBackend (drv_gpu_lib::HybridBackend) реализует Bridge..."
  ```
- **Ожидаемо:** 200 канонических фактов × 4 формулировки = **800 пар**
- **Effort:** ~1 ч (Python скрипт с шаблонами + список ключевых классов из топ-200)

#### 3.3. **`collect_confusion_negatives.py`** — pattern confusion
- **Источник:** все классы из v7 patterns
- **Шаблон:**
  ```
  Q: "HybridBackend — это Singleton?"   → A: "Нет, Bridge"
  Q: "HybridBackend — это Strategy?"    → A: "Нет, Bridge (а Strategy — это MedianStrategy в strategies)"
  Q: "HybridBackend — это Factory?"     → A: "Нет, Bridge"
  Q: "ConsoleOutput — это Bridge?"      → A: "Нет, Singleton"
  Q: "MedianStrategy — это Bridge?"     → A: "Нет, Strategy"
  ```
- **Ожидаемо:** ~30 классов × 5 wrong patterns = **150 пар**
- **Effort:** ~30 мин

**Итого P0: ~1000 пар, ~2 ч работы**

### 🟡 P1 (high-value, second iteration)

#### 3.4. **`collect_multi_class_listing.py`** — exhaustive listings
- **Источник:** v7 patterns + symbols по namespace
- **Шаблон:**
  ```
  Q: "Перечисли все RAII классы в core" → exhaustive list из 6
  Q: "Какие классы в namespace dsp::stats?" → exhaustive list (StatisticsProcessor, SNREstimator, ...)
  Q: "Что в репо radar?" → RadarPipeline, BeamFormer, ...
  ```
- **Ожидаемо:** 8 репо × 5 запросов + 10 паттернов × 1 listing = **~50 пар**
- **Effort:** ~30 мин

#### 3.5. **`collect_migration_history.py`** — legacy → current
- **Источник:** `MemoryBank/changelog/*.md`, `tasks/TASK_namespace_migration_*`, git log
- **Шаблон:**
  ```
  Q: "Как раньше назывался модуль spectrum?"
  A: "fft_func / fft_processor в GPUWorkLib (legacy). Мигрирован 2026-04 в dsp-gpu/spectrum."

  Q: "Какой namespace был до миграции?"
  A: "gpuworklib::, мигрирован 2026-04-30 → dsp::{repo}::"

  Q: "Когда мигрировали Python биндинги?"
  A: "Phase A 2026-04-30 (54 t_*.py с gpuworklib → dsp_*)"
  ```
- **Ожидаемо:** ~50-100 пар
- **Effort:** ~1 ч (sed/grep по changelog + ручной curation)

#### 3.6. **`collect_lessons_learned.py`** — real bugs from sessions/
- **Источник:** `MemoryBank/sessions/*.md` (особенно B4 секции с root cause)
- **Шаблон:**
  ```
  Q: "Почему t_heterodyne_comparison давал 66 kHz offset?"
  A: "ref_single был np.exp(+1j*phase) без conj. Kernel ждёт ref=conj(s_tx).
      Fix: +1j → -1j в строке 161. Результат: 66300 Hz → 300 Hz (×220 улучшение)."

  Q: "Почему C++ tests крашили с illegal address на step 50-120?"
  A: "Фундаментальный HIP race в at::native::is_nonzero::call (HF Trainer NaN-check)
      на gfx1201 + ROCm 7.2 + RDNA4. Решение: --save-steps 20 + auto-resume."
  ```
- **Ожидаемо:** ~20-30 пар
- **Effort:** ~1 ч (выбрать самые ценные lessons из sessions)

#### 3.7. **`collect_build_cmake_facts.py`** — build system
- **Источник:** `CMakePresets.json`, `.claude/rules/12-cmake-build.md`, `09-rocm-only.md`
- **Шаблон:**
  ```
  Q: "Какой пресет CMake для RX 9070?"
  A: "debian-local-dev (общий Debian) или rx9070 (gfx1201-only)"

  Q: "Зачем lowercase в find_package(hip REQUIRED)?"
  A: "Linux case-sensitive. find_package(HIP) упадёт — модуль называется именно `hip` lowercase."

  Q: "Где живут HIP-ядра?"
  A: "<repo>/kernels/rocm/*.hip (приватные, не публичные headers)"

  Q: "Какой компилятор для .hip?"
  A: "hipcc -O3 -std=c++17 --offload-arch=gfx1201 --offload-arch=gfx908"
  ```
- **Ожидаемо:** ~30-50 пар
- **Effort:** ~30 мин

**Итого P1: ~150-230 пар, ~3 ч работы**

### 🟢 P2 (nice-to-have, если будет время)

#### 3.8. **`collect_performance_hints.py`** — HIP optimization idioms
- **Источник:** `MemoryBank/.claude/specs/Optimization_*.md`, `Cheatsheet_*.md`
- **Шаблоны:**
  - Когда LDS? → когда warp шарит данные
  - Memory coalescing → что это, как достичь
  - Bank conflicts → как избежать
- **Ожидаемо:** ~30-50 пар

#### 3.9. **`collect_cross_references.py`** — кто кого использует
- **Источник:** grep по `#include` + реальный код
- **Шаблоны:**
  - "Какой класс использует ZeroCopyBridge?" → HybridBackend в backends/rocm/
  - "Где вызывается ScopedHipEvent?" → ProfilingFacade, kernels через RAII
- **Ожидаемо:** ~50 пар

#### 3.10. **`collect_api_style_guide.py`** — DSP-GPU code style
- **Источник:** `.claude/rules/14-cpp-style.md`, `05-architecture-ref03.md`
- **Шаблоны:**
  - "Какой стиль namespace в DSP-GPU?" → `dsp::{repo}::`
  - "Один класс — один файл?" → Да (Ref03)
- **Ожидаемо:** ~20 пар

**Итого P2: ~100-150 пар, ~2 ч работы**

---

## 4. Сборка v8 (поэтапно)

### Этап 1 (P0): ~2 ч
1. Создать 3 скрипта в `/home/alex/finetune-env/`:
   - `collect_reverse_patterns.py`
   - `collect_synonym_pairs.py`
   - `collect_confusion_negatives.py`
2. Запустить → 3 JSONL файла
3. Merge с v7 + dedup → `dataset_v8_train.jsonl` (~11000 строк)

### Этап 2 (P1, опционально): ~3 ч
4. Создать 4 скрипта:
   - `collect_multi_class_listing.py`
   - `collect_migration_history.py`
   - `collect_lessons_learned.py`
   - `collect_build_cmake_facts.py`
5. Merge с этапом 1 → `dataset_v8_train.jsonl` (~11200 строк)

### Этап 3 (P2, опционально): ~2 ч
6. Если осталось время — создать 3 P2 скрипта.

### Этап 4: Audit v8 (5 мин)
```bash
# Проверка покрытия ключевых фактов
grep -c "HybridBackend" dataset_v8_train.jsonl       # должно быть ≥200
grep -c '"Bridge"' dataset_v8_train.jsonl            # должно быть ≥50 (vs 7 в v7)
grep -c "drv_gpu_lib::HybridBackend" dataset_v8_train.jsonl  # ≥50
grep -c "Нет," dataset_v8_train.jsonl                # negatives ≥300
```

---

## 5. Train v8 — процедура (КРИТИЧНО)

### Pre-flight (обязательно перед каждым запуском)

```bash
# 1. ПОЛНОСТЬЮ закрыть GUI
sudo systemctl stop systemd-coredump        # если есть
killall pycharm code Telegram firefox chromium 2>/dev/null || true

# 2. Очистить swap БЕЗ обратного swapon
sudo swapoff -a
free -h | head -3   # Swap should be 0

# 3. dsp-asst + ollama stopped
systemctl --user stop dsp-asst.service
pkill -f "ollama serve" 2>/dev/null || true

# 4. VRAM check
rocm-smi --showmemuse | grep VRAM   # должно быть <10%
```

### Запуск train (выбор стратегии)

**Стратегия A: Resume от Coder checkpoint-375 + train на v8 ещё 300-500 шагов** (быстрее)
- Pro: используем уже наработанные ~10% обучения, добавляем v8 факты
- Contra: Trainer может конфликтовать со scheduler / max_steps

**Стратегия B: Train v8 с нуля, full 3636 шагов** (правильнее)
- Pro: чистый experiment, всё в одной кривой
- Contra: ~12 ч (на ночь)
- ETA: 3636 × 1.27 sec + 18 × 5 мин eval = ~78 мин train + 90 мин eval = **~3 ч с eval-steps=200** (если без swap interference)

**Стратегия C: Train v8 quick (750-1000 шагов) на чистом env** (компромисс)
- Pro: ~30-40 мин, проверяем v8 эффект, потом решаем
- Contra: не максимум модели, но достаточно для acceptance test (Q1-Q10)

**Рекомендация:** Стратегия **C сначала** (40 мин на 1000 шагов, проверка acceptance) → если ОК → **B на ночь** (полный train).

### Run command (стратегия C)

```bash
nohup ./Core/phase5_qwen14b_train/run_v8_quick_1000.sh \
      > Core/phase5_qwen14b_train/v8_quick_$(date +%H%M).out 2>&1 &
disown $!
```

Новый скрипт `run_v8_quick_1000.sh` — копия `run_v7_quick_750.sh` с:
- `--dataset dataset_v8_train.jsonl`
- `--max-steps 1000`
- `--output-dir output/v8_quick_1000_<TS>`

---

## 6. Post-train + Ollama deploy

```bash
./post_train.sh \
    output/v8_quick_1000_<TS>/checkpoint-best \
    qwen-coder-14b-dsp-v8 \
    /home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-14B-Instruct \
    Q4_K_M
```

ETA: ~30 мин (merge + GGUF + quantize + ollama create).

---

## 7. Acceptance inference test

Создать `Core/phase5_qwen14b_train/test_v8_acceptance.sh`:

```bash
#!/usr/bin/env bash
MODEL="${1:-qwen-coder-14b-dsp-v8}"
for q in \
    "Какой паттерн использует HybridBackend?" \
    "В каком namespace HybridBackend?" \
    "В каком репо HybridBackend?" \
    "Какие RAII классы в core?" \
    "Какие классы реализуют Bridge в DSP-GPU?" \
    "Как раньше назывался модуль spectrum?" \
    "Какой пресет CMake для RX 9070?" \
    "Какой optimizer стабилен на gfx1201 для QLoRA?" \
    "Существует ли класс RochesterGPU?" \
    "HybridBackend — Singleton?"; do
    echo "═══ $q ═══"
    ollama run "$MODEL" "$q"
    echo ""
done
```

Запустить на 3 моделях для compare:
- `qwen-coder-14b-dsp` (v6 pilot, current)
- `qwen-coder-14b-dsp-v8` (новый, целевой)
- `qwen2.5-coder:14b` (base, no finetune)

Pass: **≥9/10 на v8 + ≥7/10 на v6 + ≤5/10 на base**.

---

## 8. Timing / ETA total

| Этап | Время | Кумулятив |
|------|-------|-----------|
| P0 скрипты + run + merge v8 | 2 ч | 2 ч |
| (опц) P1 скрипты + merge | +3 ч | 5 ч |
| (опц) P2 скрипты + merge | +2 ч | 7 ч |
| **Train v8 quick (1000 steps)** | **40 мин** | 2:40 (P0-only) — 7:40 (P0+P1+P2) |
| Post-train + Ollama | 30 мин | 3:10 — 8:10 |
| Acceptance test (3 models × 10 Q) | 15 мин | 3:25 — 8:25 |
| (опц) Full train v8 (3636 step) ночью | +3 ч на ночь | следующее утро |
| (опц) Post-train full v8 | +30 мин | следующее утро |

**Минимальный путь (P0 + quick train):** **3.5 ч** до acceptance test → готова `qwen-coder-14b-dsp-v8`.

**Максимальный путь (P0+P1+P2 + full train):** **~8 ч сегодня** + **~3.5 ч завтра утром**.

---

## 9. Что не делать

- ❌ НЕ запускать с GUI приложениями (PyCharm/VSCode/Telegram) → swap → 14× замедление
- ❌ НЕ оставлять `swapon` после `swapoff` → 62 GB RAM хватит, swap фрагментирует адресное пространство
- ❌ НЕ менять параметры train без записи в TASK-файл
- ❌ НЕ коммитить артефакты в git без явного OK от Alex'а
- ❌ НЕ ставить `--save-steps 20` без необходимости (для full train save_steps=200 хватает; меньшее = больше I/O overhead)

---

## 10. Открытые вопросы — обсудить с Alex

1. **P0 only или P0+P1+P2?** Зависит от того сколько времени есть сегодня.
2. **Стратегия train (A/B/C)?** Resume vs from-scratch vs quick.
3. **Полный train на ночь сразу после P0?** Или сначала quick acceptance test.
4. **Включать ли `collect_lessons_learned.py`?** Это нестандартные пары (real bugs из sessions/).
   Могут научить модель давать конкретный диагноз, но не уверен что в нашем use case это часто нужно.
5. **Stratified split train/val?** Сейчас просто 5% holdout. На v8 (с reverse + synonym) — может быть data leakage (Q1 в train, Q2 синоним в val).
   Решение: deduplicate val после split по семантическому ключу.

---

*Maintained by: Кодо · 2026-05-21*
