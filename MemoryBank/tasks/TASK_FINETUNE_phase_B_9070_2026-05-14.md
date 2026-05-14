# TASK_FINETUNE_phase_B_9070_2026-05-14

> **Цель:** провести Phase B QLoRA на RX 9070 (Debian, work) с предварительным
>   smoke matrix и обогащением RAG-датасета. База — отлаженный 2080 Ti pipeline (home).
> **Исполнитель:** Alex + Кодо (work workstation).
> **Maintainer:** Кодо
> **Связано:** `MemoryBank/prompts/prompt_for_sister_phase_b_2026-05-14.md`
> **Спека:** `MemoryBank/specs_Linux_Radion_9070/phase_b_models_analysis_2026-05-14.md`
> **Дата:** 2026-05-14

---

## 🎯 Что делаем

1. **Сегодня (work):** smoke matrix всех имеющихся локально моделей на 9070
   × 100–150 шагов (~10–15 мин/модель) — проверка ROCm/bnb-stack + старт loss.
2. **Сегодня вечером (home):** скачать недостающие модели (Coder-14B + 14B general
   + Coder-7B Instruct) — ~70 GB HF safetensors fp16.
3. **Завтра:** обогатить RAG-датасет (dataset_v6) — anti-hallucination,
   explicit pattern pairs, pybind bridges. Smoke matrix повторить на v6.
4. **Через 2–3 дня:** full Phase B (8–12 ч) на лучшем кандидате — rec
   **Qwen2.5-Coder-14B-Instruct** с bf16 + r=16 + max_seq=1024 + grad_ckpt.
5. **Финал:** post-training pipeline (merge_lora → GGUF → Ollama)
   + inference compare на 6 контрольных вопросах.

---

## 📋 Phase 1 — Smoke matrix Day-1 (today, work)

### Pre-flight
- [ ] `systemctl --user stop dsp-asst.service` (освободить ~5 GB VRAM)
- [ ] `rocm-smi --showmemuse` → used <2 GB перед train
- [ ] `python -c "import torch; print(torch.cuda.is_bf16_supported())"` → `True`
- [ ] `python -c "import bitsandbytes; print(bitsandbytes.__version__)"` → нет ImportError
- [ ] `head -1200 dataset_v4_train.jsonl > dataset_smoke_1200.jsonl`

### Прогоны (~10–15 мин/модель × 2 модели = ~25–35 мин)
- [ ] **Smoke #1:** `qwen3-8b` (general 8B) — bf16/r=16/seq=1024/adamw_8bit/150 шагов
- [ ] **Smoke #2:** `qwen2.5-coder-7b` (Coder 7B) — те же параметры

### Фиксация (заполнить таблицу в промпте)

| Модель | Старт loss | Финал loss | Eval loss | gap | Runtime | VRAM peak | OOM? | Best ckpt |
|---|---:|---:|---:|---:|---|---:|---|---|
| qwen3-8b | | | | | | | | |
| qwen2.5-coder-7b | | | | | | | | |

**Acceptance Day-1:**
- ✅ Обе модели не падают по OOM
- ✅ Старт loss ~2.5–3.0, финал <1.8 (на 150 шагов)
- ✅ VRAM peak ≤ 12 GB (запас 4+ GB)
- ✅ Нет ошибок `bf16 not supported` / `bnb missing` в логах

---

## 📋 Phase 2 — Скачать недостающее (today evening, home)

- [ ] 🔴 P0 `Qwen/Qwen2.5-Coder-14B-Instruct` (~28 GB)
- [ ] 🟡 P1 `Qwen/Qwen3-14B` или fallback `Qwen/Qwen2.5-14B-Instruct` (~28 GB)
- [ ] 🟢 P2 `Qwen/Qwen2.5-Coder-7B-Instruct` (~14 GB)
- [ ] Положить на SSD, привезти на работу

**Acceptance Phase-2:**
- ✅ Минимум Coder-14B-Instruct (28 GB) скачан
- ✅ `ls model.safetensors.index.json` существует
- ✅ SHA/размер совпадает с HF (опционально)

---

## 📋 Phase 3 — Обогащение датасета из RAG-БД (Day 2, work)

> 🎯 **Источник:** RAG-БД `dsp-asst` (BGE-M3) — вчера/сегодня (12–13.05) залили
> **~19 000 ключей/пар** по коду DSP-GPU. Это ≈ 4× к текущему `dataset_v4`.

- [ ] Анализ Day-1 inference quality (где модели проседают на Q1–Q6)
- [ ] **Главное:** выгрузить пары из RAG-БД dsp-asst (Qdrant + tsvector payload)
  - [ ] Скрипт-обёртка над dsp-asst API → достаёт `(query, fqn, repo, doxygen, code)`
  - [ ] Фильтр качества: query ≥ 20 chars, payload содержит `repo` + `path` + `doxygen`
  - [ ] Конвертация в формат `{"instruction": ..., "output": ...}` для QLoRA
- [ ] Дополнительно (то что в RAG не покрыто):
  - [ ] anti-hallucination negatives (RochesterGPU style) — `collect_hard_negatives.py`
  - [ ] explicit pattern pairs (Bridge/Adapter/RAII) — `collect_explicit_patterns.py`
  - [ ] pybind bridges (C++ ↔ Python имена) — `collect_pybind_bridge_pairs.py`
  - [ ] namespace correction pairs — `collect_namespace_correction.py`
- [ ] Rebuild → `dataset_v6_train.jsonl` + `dataset_v6_val.jsonl`

**Acceptance Phase-3:**
- ✅ `wc -l dataset_v6_train.jsonl` ≥ 12000 (минимум +7K к v4 из RAG)
- ✅ `wc -l dataset_v6_val.jsonl` ~ 14% от train
- ✅ Sample 10 пар руками проверены — relevance > 80%

---

## 📋 Phase 4 — Smoke v2 на обогащённом датасете (Day 3, work)

- [ ] Повторить Smoke #1 + #2 на `dataset_v6_train.jsonl` (head -1200)
- [ ] Зафиксировать Δ vs Day-1 (loss curves, inference на Q1–Q6)

**Acceptance Phase-4:**
- ✅ Δ loss финал v6 vs v4 ≥ -0.1 (улучшение, не регресс)
- ✅ Score на 6 контрольных вопросах vs Day-1 не упал

---

## 📋 Phase 5 — Full Phase B на Coder-14B (Day 4, work, ~8–12 ч)

- [ ] Распаковать привезённые модели в `/home/alex/offline-debian-pack/1_models/`
- [ ] Подменить `MODEL_DIR` в `run_full_qwen3_r16_9070.sh` →
      `…/Qwen2.5-Coder-14B-Instruct`
- [ ] Запустить ночью `nohup ./run_full_qwen3_r16_9070.sh > full.log 2>&1 &`
- [ ] Утром проверить:
  - [ ] `checkpoint-best` существует
  - [ ] `train_loss` финал < 1.0
  - [ ] `eval_loss` финал < `train_loss + 0.3` (no overfit)
  - [ ] Нет OOM в логах

**Acceptance Phase-5:**
- ✅ Full train завершился без ошибок
- ✅ Best checkpoint загружается через `from_pretrained`
- ✅ Inference smoke `inference_test.py` отвечает что-то осмысленное

---

## 📋 Phase 6 — Post-training + inference compare (Day 5, work)

- [ ] Создать `post_train.sh` (bash-аналог `post_train.ps1`):
  - [ ] merge_lora.py → `…-merged/`
  - [ ] llama.cpp `convert_hf_to_gguf.py` → `f16.gguf`
  - [ ] `llama-quantize` → `Q4_K_M.gguf`
  - [ ] `ollama create qwen-coder-14b-dsp -f Modelfile`
- [ ] Запустить `inference_compare.py` на N моделях × Q1–Q6
- [ ] Заполнить compare matrix в промпте
- [ ] Написать отчёт →
      `MemoryBank/specs_Linux_Radion_9070/phase_b_9070_results_2026-05-XX.md`

**Acceptance Phase-6:**
- ✅ `post_train.sh` работает end-to-end (новый bash-скрипт)
- ✅ Ollama модель `qwen-coder-14b-dsp` доступна (`ollama list`)
- ✅ Inference compare заполнен для всех моделей
- ✅ Отчёт записан + закоммичен в MemoryBank

---

## ✅ DoD (Definition of Done) — общий

- [ ] **Phase 1:** Smoke matrix Day-1 пройден на 2 локальных моделях (~30 мин)
- [ ] **Phase 2:** Coder-14B-Instruct (минимум) скачан и привезён
- [ ] **Phase 3:** `dataset_v6` собран (+500+ пар к v4)
- [ ] **Phase 4:** Smoke v2 показывает прогресс vs Day-1
- [ ] **Phase 5:** Full Phase B завершён, best checkpoint сохранён
- [ ] **Phase 6:** Inference compare заполнен, отчёт записан
- [ ] **NEW артефакт:** `finetune-env/post_train.sh` (bash-аналог `post_train.ps1`)

---

## 🚫 НЕ делаем (вне scope)

- ❌ Fine-tune > 14B (физически не лезет в 16 GB VRAM на 9070)
- ❌ GGUF → safetensors конвертацию (lossy, нарушает «КАЧЕСТВО»)
- ❌ Параллельный train двух моделей одновременно (16 GB не хватит)
- ❌ Изменение `train_simple.py` без записи в TASK-файл
- ❌ Git push результатов без явного OK от Alex'а
  (правило `02-workflow.md` + `16-github-sync.md`)

---

## 🔗 Зависимости

| Что нужно | Откуда | Статус |
|---|---|---|
| RX 9070 + ROCm 7.2+ | Workstation work | ✅ |
| PyTorch ROCm + bf16 | `.venv` | ✅ (надо verify) |
| bitsandbytes-rocm | `.venv` | ⚠️ verify `import` |
| `dataset_v4_train.jsonl` | `/home/alex/finetune-env/` | ✅ (5071 строк) |
| `qwen3-8b`, `qwen2.5-coder-7b` | `/home/alex/offline-debian-pack/1_models/` | ✅ |
| `Qwen2.5-Coder-14B-Instruct` | HF (качаем дома) | ❌ Phase 2 |
| `llama.cpp` (для GGUF) | `~/llama.cpp` | ❓ verify |

---

*TASK создан: Кодо · 2026-05-14 утро · по запросу Alex'а после переписи промпта под 9070.*
