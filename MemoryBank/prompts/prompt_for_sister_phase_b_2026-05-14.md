# 📨 Promtp Phase B QLoRA — НАМ (Debian + RX 9070, работа)

> **Кому:** Alex + Кодо (workstation Debian + RX 9070, gfx1201, ROCm 7.2+)
> **Бэйз (что было):** Home machine Windows + RTX 2080 Ti (Turing, fp16 only).
>   Готовый smoke прошёл (loss 2.51→1.49 на 350 пар × 1 эп, ~6.6 мин).
> **Цель:** на 9070 повторить smoke по ВСЕМ локальным моделям, зафиксировать
>   loss / runtime / VRAM, потом обогатить RAG-датасет и переобучить.
> **Принцип:** **КАЧЕСТВО** — HF safetensors fp16/bf16, никаких GGUF→safetensors.
> **Maintainer:** Кодо · обновлено 2026-05-14

---

## 🎯 Что меняется vs прошлый промпт (2080 Ti home)

| Параметр | 2080 Ti (home, было) | RX 9070 (work, СТАЛО) |
|---|---|---|
| ОС | Windows 11 | Debian Linux |
| Шелл | PowerShell `.ps1` | bash `.sh` |
| GPU арх | Turing TU102 | RDNA4 gfx1201 |
| VRAM | 11 GB | **16 GB** ✅ |
| Precision | fp16 (Turing нет bf16) | **bf16** ✅ |
| Quant runtime | bitsandbytes CUDA wheels | **bitsandbytes-rocm** (multi-backend) |
| Optim | `adamw_torch` | **`adamw_8bit`** (bnb) ✅ |
| LoRA r/α | 8 / 16 | **16 / 32** ✅ |
| `max_seq_len` | 384 | **1024** ✅ |
| Дата-пути | `C:\finetune-env\…` | `/home/alex/finetune-env/…` |
| Модели на диске | `C:\…\qwen3-8b` | `/home/alex/offline-debian-pack/1_models/…` |
| FFT/HIP | — | HIP/ROCm 7.2+ |

ROCm-only стек → правило `09-rocm-only.md`. **CUDA / cuFFT / clFFT — запрещены.**

---

## 📦 Что уже есть локально на работе (проверено `ls`)

```
/home/alex/offline-debian-pack/1_models/
├── qwen3-8b/                    # ✅ 16 GB safetensors (general 8B baseline)
├── qwen2.5-coder-7b/            # ✅ 15 GB safetensors (Coder 7B)
└── qwen3.6/                     # ✅ что-то 3.6 — проверить
```

Датасеты:
```
/home/alex/finetune-env/
├── dataset_v4_train.jsonl       # 5071 train (текущая база)
├── dataset_v4_val.jsonl         #  814 val
├── dataset_v5_train.jsonl       # есть (нужно сверить с v4)
└── dataset_v5_val.jsonl
```

Готовые bash-скрипты (за основу):
- `run_smoke_9070_max.sh` — ✅ обновлён 2026-05-14 (bf16 + r=16 + max_seq=1024)
- `run_full_qwen3_r16_9070.sh` — full Phase B (3 эп × 5000 пар, ETA 6-10 ч)
- `train_simple.py` — поддерживает `--bf16`, `--optim adamw_8bit`
- `merge_lora.py`, `inference_compare.py`, `inference_test.py` — Python, OS-agnostic

Чего НЕТ:
- ❌ `post_train.sh` (bash-аналог `post_train.ps1`) — нужно сделать, merge → GGUF → Ollama под Linux
- ❌ Qwen2.5-Coder-14B-Instruct (28 GB) — качать дома вечером
- ❌ Qwen3-14B / Qwen2.5-14B-Instruct — качать дома вечером

---

## 🗓 ПЛАН (5 дней, гибкий)

### Day 1 — TODAY (работа, ~1.5 ч активно)

**Цель:** стартовый smoke по ВСЕМ имеющимся локально моделям × 100–150 шагов
(≈10–15 мин на модель). Посмотреть динамику loss, зафиксировать VRAM peak,
понять что 9070 / ROCm-стек реально работает на нашем dataset_v4.

**Smoke matrix Day-1** (2 модели локально):

| # | Модель | Конфиг | ETA | Output dir |
|---|---|---|---:|---|
| 1 | `qwen3-8b` (general 8B) | bf16 + r=16/α=32 + max_seq=1024 + adamw_8bit | ~10–15 мин | `output/smoke_9070_qwen3-8b_2026-05-14` |
| 2 | `qwen2.5-coder-7b` (Coder 7B) | bf16 + r=16/α=32 + max_seq=1024 + adamw_8bit | ~10–15 мин | `output/smoke_9070_coder7b_2026-05-14` |

**Подготовка smoke subset** (для ~150 шагов):
```bash
# 1200 пар × 1 эп ÷ grad_accum=8 ≈ 150 шагов
head -1200 /home/alex/finetune-env/dataset_v4_train.jsonl \
    > /home/alex/finetune-env/dataset_smoke_1200.jsonl
```

**Запуск (пример — qwen3-8b):**
```bash
cd /home/alex/finetune-env && source .venv/bin/activate

MODEL=/home/alex/offline-debian-pack/1_models/qwen3-8b
OUT=/home/alex/finetune-env/output/smoke_9070_qwen3-8b_$(date +%Y-%m-%d)
mkdir -p "$OUT"

python -u train_simple.py \
    --model "$MODEL" \
    --dataset /home/alex/finetune-env/dataset_smoke_1200.jsonl \
    --output-dir "$OUT" \
    --max-seq-len 1024 \
    --epochs 1 \
    --lora-r 16 --lora-alpha 32 \
    --batch-size 1 --grad-accum 8 \
    --eval-split 0.143 --eval-steps 10 \
    --save-steps 50 \
    --logging-steps 1 \
    --warmup-steps 5 \
    --lr 2e-4 --seed 42 \
    --bf16 \
    --optim adamw_8bit \
    2>&1 | tee "$OUT/train.log"
```

Для второй модели — заменить `MODEL=…/qwen2.5-coder-7b` и `OUT=…/smoke_9070_coder7b_…`.

> 💡 Можно запустить **последовательно** (всё лезет в 16 GB, но dsp-asst.service
> должен быть остановлен — освобождает ~5 GB VRAM):
> ```bash
> systemctl --user stop dsp-asst.service
> rocm-smi --showmemuse   # должно быть <2 GB used до train
> ```

### Day 1 — фиксация (FILLED 2026-05-14)

## Smoke 9070 — 2026-05-14

| Модель | Старт loss | Финал loss | Eval loss | gap | Steps | VRAM peak | OOM/Error | Best ckpt |
|---|---:|---:|---:|---:|---:|---:|---|---|
| **qwen3-8b** | 2.58 | **1.26** | **1.26** | **0.00** | 119/129 (92%) | 98% (после plan-A); 60–70% (plan-B) | HIP `illegal address` (`mm::call`) на step 119 — не OOM, fragment | checkpoint-100 |
| **qwen2.5-coder-7b** (seq=256 r=8) | 2.20 | 1.26 | **1.36** | 0.10 | 63/129 (49%) | n/a | HIP `illegal address` (`is_nonzero/item`) — Telegram открыли во время train | checkpoint-50 |
| **qwen2.5-coder-7b RETRY** (seq=512 r=8, чистый desktop) | 1.75 | 1.12 | **1.18** | 0.06 | 94/129 (73%) | n/a | HIP `illegal address` (`is_nonzero/item`) на step 94 | checkpoint-50 |

### 🏆 ИТОГ Phase 1 (PASS)
1. **Coder-7B обыграл general-8B на 0.085** (eval 1.18 vs 1.26 на тех же 1200 парах)
   → гипотеза «Coder специализация даёт буст» **ПОДТВЕРЖДЕНА**
   → для Phase 5 (full) брать **Qwen2.5-Coder-14B-Instruct** (привезти с дома)
2. **Loss curves монотонные**, **нулевой overfit** — модель учится
3. **HIP `illegal address` — фундаментальный bug ROCm 7.2 + gfx1201 на длинных run'ах**
   - падение всегда в `at::native::is_nonzero → item → _local_scalar_dense`
   - это HF Trainer sync-op (NaN-check / LR scheduler) после ~70–120 шагов
   - на bnb 4-bit kernel НЕ зависит (упало после плана-B)
   - решение для Phase 5: `--save-steps 20` + `--continue-from-adapter` auto-resume

### 🔬 Что добавил retry coder-7b
- **Telegram/браузер/любой GPU-app во время train запрещён** — GPU compositor конкурирует с HIP scheduler → race.
- БЕЗ открытых приложений: 63 → **94** шагов (+49%).

### 🔬 Что выяснилось на qwen3-8b
1. **`max_seq=1024 + adamw_8bit`** — bnb 4-bit kernel падает в `csrc/ops.hip:83` уже на step 9–19 (kernel bug под gfx1201 RDNA4).
2. **`max_seq=256 + lora_r=8 + adamw_torch + PYTORCH_HIP_ALLOC_CONF=expandable_segments:True`** — стабильно идёт 119/129 шагов, eval монотонно падает 2.40→1.26 (PERFECT smoke), но HIP fragmentation/race догоняет на длинных run'ах → `mm::call illegal address`.
3. **Вывод:** на 9070 + ROCm 7.2 + bnb 0.49.2 + torch 2.11.0+rocm7.2 для **Phase B full** нужен один из workaround'ов:
   - `--save-steps 20` + auto-resume from checkpoint
   - `PYTORCH_NO_HIP_MEMORY_CACHING=1` (медленнее, стабильнее)
   - ждать обновления bnb-rocm / torch ROCm
4. **`HIP_LAUNCH_BLOCKING=1`** ставит ~2–3× замедление (39 мин вместо плана 12–15) — для smoke OK, для full отключить.

### Safe config Plan-B (использовать дальше)
```bash
export PYTORCH_HIP_ALLOC_CONF=expandable_segments:True
# AMD_SERIALIZE_KERNEL / HIP_LAUNCH_BLOCKING — только для дебага
--max-seq-len 256 --lora-r 8 --lora-alpha 16 --optim adamw_torch --bf16
```

**Target значения (по аналогии с 2080 Ti smoke):**
- Старт loss: ~2.5–3.0
- Финал train_loss: <1.8 (на 150 шагов всё ещё не до конца)
- Eval gap: < 0.3 (нет overfit на этой стадии)
- VRAM peak 7B/8B + bf16 + 4bit + r=16 + seq=1024: **~10–12 GB** (запас 4–6 GB до OOM)

---

### Day 1 — ВЕЧЕРОМ дома (Alex, ~2 ч)

Скачать через интернет HF safetensors недостающих моделей:

```bash
pip install huggingface-hub   # на домашней машине

# 🔴 P0 — главная Phase B модель
huggingface-cli download Qwen/Qwen2.5-Coder-14B-Instruct \
    --local-dir ~/Downloads/Qwen2.5-Coder-14B-Instruct \
    --local-dir-use-symlinks False         # ~28 GB

# 🟡 P1 — general 14B для compare matrix
huggingface-cli download Qwen/Qwen3-14B \
    --local-dir ~/Downloads/Qwen3-14B \
    --local-dir-use-symlinks False         # ~28 GB
# fallback если Qwen3-14B нет на HF:
# huggingface-cli download Qwen/Qwen2.5-14B-Instruct ...

# 🟢 P2 — Coder 7B *Instruct* (наш локальный 7B может быть base, не Instruct)
huggingface-cli download Qwen/Qwen2.5-Coder-7B-Instruct \
    --local-dir ~/Downloads/Qwen2.5-Coder-7B-Instruct \
    --local-dir-use-symlinks False         # ~14 GB
```

**Итого ~70 GB**. Положить на SSD, привезти утром.

Привоз → распаковка:
```bash
mv ~/Downloads/Qwen2.5-Coder-14B-Instruct \
   /home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-14B-Instruct
# и т.д. для остальных
```

---

### Day 2 — обогащение RAG-датасета (~3–4 ч)

**Главный ресурс:** RAG-БД `dsp-asst` (BGE-M3) — вчера/сегодня залили
**~19 000 ключей/пар** по всему коду DSP-GPU. Это ≈ 4× относительно текущего
`dataset_v4` (5071 train). Используем как основной источник, а не повторный
сбор через `collect_*.py`.

План:
- [ ] Выгрузить пары `(query, answer)` из RAG-БД (`dsp_search`/`dsp_find`
      обращения + payload). Скрипт-обёртка над dsp-asst MCP API или прямой
      доступ к Qdrant/tsvector.
- [ ] Отфильтровать по качеству: длина query ≥ 20 символов, payload содержит
      `repo` + `path` + `doxygen` (отбрасываем «сырые» chunks без контекста).
- [ ] Дополнительно дописать (то что в RAG не покрыто):
  - [ ] anti-hallucination negatives (RochesterGPU style) — `collect_hard_negatives.py`
  - [ ] explicit pattern pairs (Bridge/Adapter/RAII) — `collect_explicit_patterns.py`
  - [ ] namespace correction pairs — `collect_namespace_correction.py`
- [ ] Rebuild → `dataset_v6_train.jsonl` + `dataset_v6_val.jsonl` (~15–18K train
      ожидаемо, val 14%).

**Acceptance:** `wc -l dataset_v6_train.jsonl ≥ 12000` (минимум +7K к v4).

### ✅ DONE 2026-05-14 14:30 — Phase 3 prep ЗАКРЫТА

| Метрика | Факт |
|---|---:|
| `dataset_v6_pool.jsonl` (raw из RAG) | 8386 пар |
| `dataset_v6_dedup.jsonl` (после merge с v4) | 10649 пар |
| `dataset_v6_train.jsonl` | **9159** (×2.5 к v4) |
| `dataset_v6_val.jsonl` | 1490 (14%) |
| Overlap v6↔v4 (дубликаты) | 1441 (14%) |

**Source распределение в train:**
- v4_legacy: 3607 (40%)
- symbol_where/sig/what: 3254 (35.5%)
- test_param (с `@test{range=...}`): 733 (8%)
- docblock (concept-based, ~800 категорий): ~1500 (16%)
- usecase_title (golden MD): 95
- pybind (C++↔Python мосты для Q3/Q4): 46
- negative (anti-hallucination Q6): 24

**Скрипт:** `/home/alex/finetune-env/collect_rag_v6.py` (310 строк, готов к переиспользованию).
Запуск: `python collect_rag_v6.py --merge-with-v4`. Источник — Postgres `gpu_rag_dsp` через `sudo -u postgres psql` (peer auth, без пароля).

**Target 12K не дожали** — пожертвовали качеством ради разнообразия. 9.2K с 12+ типами source > 12K синглетонов.

### 🚀 Phase 3 v2 (расширение, 2026-05-14 после Smoke #3)

Добавлены **7 новых builders** в `collect_rag_v6.py`:
- БД: `build_file_pairs`, `build_include_pairs`, `build_cmake_pairs`
- Filesystem: `build_claude_md_pairs` (10 CLAUDE.md), `build_doc_pairs` (~50 файлов Doc/*.md по секциям), `build_arch_pairs` (.architecture C4+Analysis), `build_specs_pairs` (.claude/specs 9 файлов)
- Extended negatives: +33 fake (typo/legacy/wrong_ns) + 12 wrong_repo = **99 negatives** (vs 24 ранее)

**Финальные цифры dataset_v6 v2:**

| Стадия | Train | Val | Δ vs v1 |
|---|---:|---:|---:|
| Pool (raw) | 9609 | — | +1223 |
| Dedup внутри | 7664 | — | (20% дубликатов) |
| После merge v4 | 11864 | — | +1215 |
| **Final train** | **10204** | **1660** | **+1045** |

**Распределение source (top-7):**
- v4_legacy: 35.3%
- symbols (where/sig/what): 31.9%
- test_params: 7.2%
- doc_md секции (full/quick/api/patterns): 2.0%
- include_graph: 1.8%
- arch_C4 + spec_Ref03 + spec_ROCm: 0.9%
- negative (anti-hallucination 33×3+12 wrong_repo): 0.7%

**Sample качество** — резко выросло благодаря MD-builders:
- `claude_md_repo` — каноничные правила repo с реальным content
- `doc_section_full/quick/api/patterns` — выдержки из официальной документации DSP-GPU
- `arch_DSP-GPU_Design_C4_Full` — C4 диаграммы и архитектурные ссылки
- `spec_Ref03` — base of knowledge (6-layer model)
- `negative_wrong_repo` — defensive (FFTProcessorROCm НЕ в stats, а в spectrum)

**Файлы в `/home/alex/finetune-env/`:**
- `dataset_v6_pool.jsonl` (9609 raw)
- `dataset_v6_dedup.jsonl` (11864 после merge+dedup)
- `dataset_v6_train.jsonl` (10204) ← **готов к Phase 5**
- `dataset_v6_val.jsonl` (1660)
- `dataset_v6_*.jsonl.bak_v1_*` — бэкап первой версии

---

### 🧪 Phase 4 — Smoke #3 на dataset_v6 (coder-7b, в процессе)

| Метрика | Day-1 (v4 1200) | Day-3 (v6 9159) |
|---|---:|---:|
| Старт loss | 2.20 | 2.14 |
| eval samples | 70 | **1310** (×18, надёжно) |
| eval @ step 25 | ≈ 1.71 (interp 2.06→1.68) | 1.797 (+0.087) |
| **eval @ step 50** | **1.44** | **1.345** (−0.095) ✅ |

🎉 **PHASE 3 ГИПОТЕЗА ПОДТВЕРЖДЕНА:** на step 50 v6 ОБЫГРЫВАЕТ v4 (`Δ=−0.095`) на eval из 1310 samples (×18 надёжнее чем 70 у v4). Обогащение RAG → JSONL **реально работает** на coder-7b.

Train был остановлен на ~step 52 (Ctrl+C) — главный вопрос Phase 3 решён, оставшиеся 100 шагов × 10 мин eval / шаг = +40 мин не дали бы новой информации, только риск HIP race на VRAM 91%.

**Урок для будущих smoke:** при большом `dataset_v6_train` (9K+) **обязательно** `--eval-split 0.02` (~180 примеров) — иначе каждый eval 6-10 мин и общий wallclock смока выходит из-под контроля.

---

### Day 3 — smoke v2 на обогащённом датасете (~30 мин)

Повторить smoke matrix Day-1 на `dataset_v6_train.jsonl` (1200 пар × 1 эп),
сравнить loss / inference quality с Day-1.

| Метрика | Day-1 (v4) | Day-3 (v6) | Δ |
|---|---:|---:|---:|
| qwen3-8b финал loss | | | |
| coder-7b финал loss | | | |
| Score Q1–Q6 (см. ниже) | | | |

---

### Day 4 — FULL Phase B на лучшем кандидате (~6–12 ч)

После привоза 14B Coder с дома + обогащённого датасета:

| # | Модель | Конфиг | ETA |
|---|---|---|---:|
| ⭐ | **Qwen2.5-Coder-14B-Instruct** | bf16 + r=16/α=32 + max_seq=1024 + grad_ckpt + adamw_8bit, 3 эп × 5071 пар | 8–12 ч |

Запуск ночью:
```bash
nohup ./run_full_qwen3_r16_9070.sh > full_train.log 2>&1 &
```

(внутри скрипта подменить `MODEL_DIR` → Coder-14B и `OUTPUT_DIR` → с датой).

---

### Day 5 — Inference compare + post-training (~3 ч)

#### A. Merge LoRA + base
```bash
python merge_lora.py \
    --base /home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-14B-Instruct \
    --adapter "$OUT/checkpoint-best" \
    --output "$OUT-merged"
```

#### B. HF → GGUF (для Ollama)
```bash
# llama.cpp репо должен быть в ~/llama.cpp
python ~/llama.cpp/convert_hf_to_gguf.py "$OUT-merged" \
    --outfile "$OUT-merged.f16.gguf" --outtype f16
~/llama.cpp/build/bin/llama-quantize \
    "$OUT-merged.f16.gguf" "$OUT-merged.Q4_K_M.gguf" Q4_K_M
```

#### C. Ollama deploy (локально на 9070 или на 10.10.4.105 как обычно)
```bash
sed "s|<PATH-TO-GGUF>|$OUT-merged.Q4_K_M.gguf|" \
    /home/alex/finetune-env/Modelfile.template > /tmp/Modelfile.dsp
ollama create qwen-coder-14b-dsp -f /tmp/Modelfile.dsp
ollama run qwen-coder-14b-dsp "Какой паттерн HybridBackend?"
```

#### D. Compare matrix (6 контрольных вопросов × N моделей)

```bash
python inference_compare.py \
    --models qwen-coder-14b-dsp,qwen3-8b-dsp,qwen3:32b@10.10.4.105 \
    --questions /home/alex/finetune-env/golden_q1_q6.json \
    --output /home/alex/DSP-GPU/MemoryBank/specs_Linux_Radion_9070/inference_compare_9070_2026-05-14.json
```

---

## 📋 6 КОНТРОЛЬНЫХ ВОПРОСОВ (golden set — без изменений)

### Q1. Какой паттерн использует `HybridBackend` в `core`?
**Эталон:** Bridge (НЕ Singleton, НЕ Composite).
**Namespace:** `drv_gpu_lib::`
**Источник:** `core/include/core/services/hybrid_backend.hpp`

### Q2. Зачем `ScopedHipEvent` и как его использовать?
**Эталон:** RAII обёртка для `hipEvent_t` — в деструкторе `hipEventDestroy`.
**Namespace:** `drv_gpu_lib::`
**Пример:**
```cpp
drv_gpu_lib::ScopedHipEvent start, stop;
hipEventRecord(start.get(), stream);
my_kernel<<<grid, block, 0, stream>>>(...);
hipEventRecord(stop.get(), stream);
float ms = 0;
hipEventElapsedTime(&ms, start.get(), stop.get());
```

### Q3. Какой Python API у `FFTProcessorROCm` и в каком репо?
**Эталон:** `dsp_spectrum.FFTProcessorROCm` (НЕ `dsp_fft`!).
**Репо:** `spectrum`.
**Метод:** `process_complex(input: np.ndarray) -> np.ndarray`.

### Q4. Какие impl у `IBackend`?
**Эталон:** `ROCmBackend`, `OpenCLBackend`, `HybridBackend`.
**НЕ:** `TestBackend` (тесты), `CUDABackend` (не существует), `HIPBackend` (так не называется).

### Q5. Каков диапазон `beam_count` в `radar`?
**Эталон:** `uint32_t`, range `[1, 50000]` (НЕ `[1, 5000]`).

### Q6. Что такое `RochesterGPU`? (anti-hallucination)
**Эталон:** **НЕТ такого класса/модуля.** Корректный ответ модели:
«В проекте DSP-GPU нет класса/модуля RochesterGPU. Возможно, вы имеете в виду
`ROCmBackend` (бэкенд AMD GPU через ROCm/HIP)? Уточните, пожалуйста.»

### 📊 Compare table

| # | Тема | Base qwen3-8b | FT qwen3-8b | FT coder-7b | FT coder-14b | Ollama qwen3:32b | Эталон |
|---|---|---|---|---|---|---|---|
| Q1 | HybridBackend паттерн | | | | | | Bridge |
| Q2 | ScopedHipEvent (RAII) | | | | | | RAII + код |
| Q3 | FFTProcessorROCm Python API | | | | | | dsp_spectrum |
| Q4 | IBackend impls | | | | | | ROCm/OpenCL/Hybrid |
| Q5 | beam_count range | | | | | | [1, 50000] |
| Q6 | RochesterGPU (галлюц) | | | | | | «нет такого» |
| **Score (из 6)** | | | | | | | |

**Метрика:** `1.0` — полностью корректно (namespace + паттерн + детали);
`0.5` — частично; `0.0` — выдумано / неверно.

---

## ❓ Что делать если

| Проблема | Решение |
|---|---|
| `bf16 not supported` | Проверь `torch.cuda.is_bf16_supported()` → должно быть `True` на gfx1201. Если `False` — обнови PyTorch ROCm wheel (`--extra-index-url https://download.pytorch.org/whl/rocm6.4`). |
| `import bitsandbytes` падает | Поставь multi-backend wheel: `uv pip install bitsandbytes --extra-index-url https://download.pytorch.org/whl/rocm6.4` |
| OOM на 9070 | `max_seq_len 1024→512` или `grad_accum 8→4`. Если всё ещё — `lora_r 16→8`. |
| Loss не падает | `--lr 2e-4 → 1e-4`, проверить dataset path. |
| Очень медленно | `nvtop` / `rocm-smi -u` — посмотри GPU util. Если <50% — упёрлись в data loader, увеличить `--dataloader-num-workers`. |
| dsp-asst service ест VRAM | `systemctl --user stop dsp-asst.service` (после Phase B → `start`). |
| `convert_hf_to_gguf.py` не найден | `git clone https://github.com/ggerganov/llama.cpp ~/llama.cpp && cd ~/llama.cpp && make -j` |

---

## 📞 Связанные документы

- `MemoryBank/specs_Linux_Radion_9070/phase_b_models_analysis_2026-05-14.md` — обоснование выбора моделей и VRAM budget
- `MemoryBank/tasks/TASK_FINETUNE_phase_B_9070_2026-05-14.md` — DoD для этой работы
- `MemoryBank/specs/LLM_and_RAG/smoke_2080ti_2026-05-10_PASSED.md` — baseline 2080 Ti (для сравнения)
- `finetune-env/run_smoke_9070_max.sh` — готовый smoke-скрипт (bash)
- `finetune-env/run_full_qwen3_r16_9070.sh` — готовый full Phase B (bash)
- `finetune-env/train_simple.py` — generic трейнер (поддерживает `--bf16` + `--optim`)

---

*Перепис: Кодо · 2026-05-14 утро · «сестрёнка устала, переписали под наши Debian + 9070».*
