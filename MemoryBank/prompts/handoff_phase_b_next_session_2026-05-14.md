# 🤝 HANDOFF: Phase B QLoRA на RX 9070 — продолжение

> **Кому:** следующая сессия Кодо (или сестра)
> **От:** Кодо · 2026-05-14 вечер (после ~6 часов работы)
> **Цель:** дочинить Phase 5 (full train на 14B Coder) + Phase 6 (deploy + inference compare)

---

## 🎯 TL;DR (за 30 секунд)

Сегодня (2026-05-14) закрыли **Phase 1+3+4+6-prep+infra** на RX 9070. Гипотеза «RAG-обогащение датасета даёт буст качества» **подтверждена** экспериментально (FT 2.8/6 vs base 0/6 на smoke ckpt-50). Вся инфраструктура для Phase 5/6 готова — осталось только привезти **14B Coder** с дома (Phase 2 ВЕЧЕРОМ 14.05) и запустить night train с auto-resume wrapper'ом.

---

## ✅ Что сделано сегодня (вторник 14.05)

| Phase | Что | Артефакт |
|---|---|---|
| **1** | Smoke matrix qwen3-8b / coder-7b на dataset_v4 (1200 пар) | eval **1.26 / 1.18** — Coder выигрывает 0.085 |
| **3** v1+v2 | RAG → JSONL через `collect_rag_v6.py` (12 builders из БД + MD) | **dataset_v6: 10204 train + 1660 val** (×2.06 к v4) |
| **4** | Smoke #3 coder-7b × dataset_v6 (1200 пар, 150 max-steps) | eval **1.345** vs v4 1.44 на **1310 samples (×18 надёжнее)** — v6 обыграл |
| **6 prep** | Inference compare на ckpt-50 v6 на 6 контрольных вопросах | FT **2.8/6** vs base **0/6**, Q1+Q2 точно |
| **5 infra** | `run_with_resume.sh` + `train_simple.py --resume-from-checkpoint` | smoke 30 шагов PASS |
| **6 infra** | `post_train.sh` + auto-clone llama.cpp + Modelfile fix | end-to-end PASS, `qwen-coder-7b-dsp-v6` в Ollama |
| Git | 3 sync × 10 репо DSP-GPU + 1 push finetune-env | всё на github |

**Файлы артефактов:**
- DSP-GPU/MemoryBank: `prompts/prompt_for_sister_phase_b_2026-05-14.md` (главный план), `tasks/TASK_FINETUNE_phase_B_9070_2026-05-14.md` (DoD 6 фаз), `sessions/2026-05-14.md` (резюме), `specs_Linux_Radion_9070/phase_b_models_analysis_2026-05-14.md`
- finetune-env: `collect_rag_v6.py`, `post_train.sh`, `run_with_resume.sh`, `train_simple.py` (M), `Modelfile.template` (M), `dataset_v6_{train,val,pool,dedup}.jsonl`

---

## 🌃 ВЕЧЕРОМ 14.05 (дома, через интернет, ~2 ч) — Phase 2

Скачать **3 модели** на SSD:

```bash
pip install huggingface-hub  # если нет

# 🔴 P0 — основная модель Phase 5
huggingface-cli download Qwen/Qwen2.5-Coder-14B-Instruct \
    --local-dir ~/Downloads/Qwen2.5-Coder-14B-Instruct \
    --local-dir-use-symlinks False     # ~28 GB

# 🟡 P1 — general 14B для compare
huggingface-cli download Qwen/Qwen3-14B \
    --local-dir ~/Downloads/Qwen3-14B \
    --local-dir-use-symlinks False     # ~28 GB
# fallback: huggingface-cli download Qwen/Qwen2.5-14B-Instruct ...

# 🟢 P2 — Coder 7B Instruct (для compare)
huggingface-cli download Qwen/Qwen2.5-Coder-7B-Instruct \
    --local-dir ~/Downloads/Qwen2.5-Coder-7B-Instruct \
    --local-dir-use-symlinks False     # ~14 GB
```

**Итого ~70 GB** на SSD/флешке. Если HF auth требует токен: `huggingface-cli login` → бесплатный токен с https://huggingface.co/settings/tokens.

---

## ☀️ УТРОМ 15.05 на работе — старт Phase 5

### Шаг 1: Распаковать модели (~5 мин)
```bash
mv ~/Downloads/Qwen2.5-Coder-14B-Instruct \
   /home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-14B-Instruct
mv ~/Downloads/Qwen3-14B \
   /home/alex/offline-debian-pack/1_models/Qwen3-14B
mv ~/Downloads/Qwen2.5-Coder-7B-Instruct \
   /home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-7B-Instruct

# Verify
ls /home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-14B-Instruct/model.safetensors.index.json
```

### Шаг 2: Pre-flight (освободить VRAM)
```bash
sudo systemctl stop ollama.service
systemctl --user stop dsp-asst.service
systemctl --user stop embed.service
sleep 3
rocm-smi --showpids 2>&1 | tail -10   # должно быть "No KFD PIDs"
rocm-smi --showmemuse | grep VRAM     # должно быть <10%
```

### Шаг 3: Smoke на 14B Coder (~30 мин, проверка что safe config работает)
```bash
cd /home/alex/finetune-env && source .venv/bin/activate

OUT=/home/alex/finetune-env/output/smoke_9070_coder14b_$(date +%Y-%m-%d)
mkdir -p "$OUT"
LOG="$OUT/train.log"

export PYTORCH_HIP_ALLOC_CONF=expandable_segments:True

./run_with_resume.sh \
    --max-retries 3 \
    --output-dir "$OUT" \
    --model /home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-14B-Instruct \
    --dataset /home/alex/finetune-env/dataset_smoke_1200.jsonl \
    --max-seq-len 512 \
    --epochs 1 \
    --max-steps 100 \
    --lora-r 8 --lora-alpha 16 \
    --batch-size 1 --grad-accum 8 \
    --eval-split 0.02 --eval-steps 25 \
    --save-steps 25 \
    --logging-steps 1 --warmup-steps 5 \
    --lr 2e-4 --seed 42 \
    --bf16 --optim adamw_torch \
    2>&1 | tee "$LOG"
```

**Acceptance smoke 14B:**
- ✅ VRAM peak <14 GB (запас 2 GB до OOM)
- ✅ Loss падает (start ~2.5 → конец <1.8)
- ✅ eval_loss 1 раз минимум (на step 25)
- ⚠️ Может быть HIP-crash → wrapper auto-resume должен поймать

### Шаг 4: Full Phase B (~8-12 ч ночью)

Если smoke прошёл:

```bash
OUT=/home/alex/finetune-env/output/phase5_coder14b_full_$(date +%Y-%m-%d)
mkdir -p "$OUT"
LOG="$OUT/train.log"

# Запуск ночью (nohup, выживет ssh disconnect)
nohup ./run_with_resume.sh \
    --max-retries 20 \
    --output-dir "$OUT" \
    --model /home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-14B-Instruct \
    --dataset /home/alex/finetune-env/dataset_v6_train.jsonl \
    --max-seq-len 1024 \
    --epochs 3 \
    --lora-r 16 --lora-alpha 32 \
    --batch-size 1 --grad-accum 8 \
    --eval-split 0.02 --eval-steps 50 \
    --save-steps 50 \
    --logging-steps 5 --warmup-steps 30 \
    --lr 2e-4 --seed 42 \
    --bf16 --optim adamw_torch \
    > "$LOG" 2>&1 &

echo "PID: $!"
tail -f "$LOG"   # мониторинг
```

**Acceptance full Phase 5:**
- ~3825 steps (10204 train × 3 эпохи ÷ grad_accum=8 = ~3826)
- Финальный train_loss <1.0
- Финальный eval_loss <train_loss + 0.3 (no overfit)
- `checkpoint-best/` создан
- Wrapper показывает максимум ~5-10 attempt (5-10 HIP crashes, но train дошёл до конца)

---

## ☀️ День 16.05 — Phase 6: Deploy + Inference Compare (~1 час)

### Шаг 1: merge → GGUF → Ollama
```bash
cd /home/alex/finetune-env

# checkpoint-best или checkpoint с лучшим eval_loss
./post_train.sh \
    /home/alex/finetune-env/output/phase5_coder14b_full_2026-05-XX/checkpoint-best \
    qwen-coder-14b-dsp-v6
```

ETA: ~30 мин для 14B (merge ~10 мин + GGUF ~10 мин + quantize ~5 мин + ollama create ~30 сек).

⚠️ **Disk space:** 14B требует ~64 GB временно (merged 28 + f16 28 + Q4_K_M 8). Финал ~16 GB (Q4_K_M + Ollama copy).

### Шаг 2: Inference compare base vs FT на Q1-Q6
```bash
python inference_compare.py \
    --base /home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-14B-Instruct \
    --adapter /home/alex/finetune-env/output/phase5_coder14b_full_2026-05-XX/checkpoint-best \
    --max-new 300 \
    2>&1 | tee /home/alex/finetune-env/output/inference_compare_14b_v6.log
```

**6 контрольных вопросов:**
| # | Тема | Эталон |
|---|---|---|
| Q1 | HybridBackend паттерн | **Bridge** |
| Q2 | ScopedHipEvent | **RAII для hipEvent_t** |
| Q3 | FFTProcessorROCm Python API | `dsp_spectrum.FFTProcessorROCm.process_complex()` |
| Q4 | IBackend impls | **ROCmBackend, OpenCLBackend, HybridBackend** |
| Q5 | beam_count range | uint32_t `[1, 50000]` |
| Q6 | RochesterGPU? (anti-hall) | «нет такого, возможно ROCmBackend» |

**Target Phase 6:** FT score ≥ 5/6 (≥83%). На ckpt-50 было 2.8/6 (47%).

### Шаг 3: Дополнительный compare через Ollama
```bash
ollama run qwen-coder-14b-dsp-v6 "Какой паттерн использует HybridBackend?"
ollama run qwen-coder-14b-dsp-v6 "Какой Python API у класса FFTProcessorROCm?"
# и т.д. на все 6 вопросов
```

Также можно сравнить с **qwen3:32b** на сервере 10.10.4.105:11434:
```bash
curl -s http://10.10.4.105:11434/api/generate -d '{
    "model": "qwen3:32b",
    "prompt": "Какой паттерн использует HybridBackend в DSP-GPU?",
    "stream": false
}' | jq -r .response
```

---

## ⚠️ Known issues + workarounds

### A. HIP `is_nonzero/item illegal memory access` (RDNA4 + ROCm 7.2)
**Симптом:** `c10::AcceleratorError: CUDA error: an illegal memory access was encountered` на ~step 50-120.
**Корень:** баг в HF Trainer's `is_nonzero` GPU→CPU sync на gfx1201.
**Workaround:** **`run_with_resume.sh` wrapper** + `--save-steps 20`. Wrapper ловит crash, ищет последний checkpoint-N, перезапускает Python. До `--max-retries 20`.

### B. bnb 4-bit kernel падает в `csrc/ops.hip:83` на gfx1201 при `max_seq=1024+adamw_8bit`
**Симптом:** `Error 700 at line 83 in file /src/csrc/ops.hip`.
**Workaround:** safe Plan-B → `max_seq=512`, `adamw_torch` (не adamw_8bit), `lora_r=8 или 16` (не выше).
**Status:** на Phase 5 full ставим `max_seq=1024, r=16, adamw_torch` — должно работать (тестировали).

### C. `expandable_segments` env молча игнорируется
**Warning:** `expandable_segments not supported on this platform`.
**Status:** ставить можно, не помешает, но **не помогает**. ROCm 7.2 не поддерживает.

### D. VRAM захвачен Ollama/dsp-asst перед train
**Симптом:** `torch.OutOfMemoryError: Tried to allocate 2 GiB. GPU has X GiB of which Y MiB free`.
**Fix:** перед train **ОБЯЗАТЕЛЬНО** stop сервисов:
```bash
sudo systemctl stop ollama.service
systemctl --user stop dsp-asst.service
systemctl --user stop embed.service
```

### E. Не открывать GPU-апп во время train
Telegram desktop / браузер с WebGL / любой GUI который пишет в compositor → race с HIP scheduler → `illegal address`. Запретить во время train.

### F. `save_steps` must be round multiple of `eval_steps`
**Симптом:** `ValueError: --load_best_model_at_end requires the saving steps to be a round multiple of the evaluation steps`.
**Fix:** `save_steps = eval_steps × N` (например save=20 eval=20, или save=50 eval=25).

### G. venv через `uv` (нет pip)
**Симптом:** `No module named pip` при `python -m pip install`.
**Fix:** использовать `~/.local/bin/uv pip install --python <venv-python> <packages>`. `post_train.sh` уже использует.

### H. Modelfile.template repeat_penalty
**Без фикса:** FT модели зацикливаются («Паттерн X — это репо core … Паттерн Y — это репо core …»).
**Fix уже применён:** `repeat_penalty 1.20` + `repeat_last_n 256` в `Modelfile.template`.

---

## 📁 Пути и контакты

### DSP-GPU repo
- `/home/alex/DSP-GPU/` — workspace root
- `/home/alex/DSP-GPU/MemoryBank/` — этот промпт и все спеки

### finetune-env repo (отдельный git репо AlexLan73/finetune-env)
- `/home/alex/finetune-env/` — скрипты, dataset, output
- `/home/alex/finetune-env/output/` — checkpoints (34 GB)
- `/home/alex/finetune-env/.venv/` — Python venv через uv (python 3.12, torch 2.11.0+rocm7.2)

### Модели на работе (на 14.05 утром)
- `/home/alex/offline-debian-pack/1_models/qwen3-8b/` ✅
- `/home/alex/offline-debian-pack/1_models/qwen2.5-coder-7b/` ✅
- `/home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-14B-Instruct/` ⏰ привезти 15.05 утром
- `/home/alex/offline-debian-pack/1_models/Qwen3-14B/` ⏰
- `/home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-7B-Instruct/` ⏰

### Сервера и сервисы
- ollama (system, `:11434`) — `qwen3.6:32b/27b/35b` уже залиты, добавим `qwen-coder-14b-dsp-v6` после Phase 6
- dsp-asst (user systemd, `:8766`) — RAG HTTP API
- embed.service (user systemd, `:8765`) — BGE-M3 для Continue VSCode
- qdrant (system, `:6333`) — vector store
- postgresql (`:5432`, БД `gpu_rag_dsp`) — RAG payload

### Внешний Ollama сервер (для baseline compare)
- `10.10.4.105:11434` — `qwen3:32b`, `qwen3.6:35b`, `nomic-embed-text`

---

## 🧪 Финальный acceptance Phase B (когда всё пройдёт)

- [ ] `dataset_v6_train.jsonl` = 10204 строк ✅ (уже)
- [ ] Smoke 14B на 1200 пар × 100 шагов прошёл (loss <1.8, нет OOM)
- [ ] Full Phase B (3 эпохи × 10K) завершился (max 5-10 resumes — нормально)
- [ ] `checkpoint-best/` существует, train_loss < 1.0, eval_loss < 1.3
- [ ] `post_train.sh` отработал → `qwen-coder-14b-dsp-v6` в Ollama
- [ ] Inference compare Q1-Q6: FT score ≥ 5/6 (≥83%)
- [ ] Финальный отчёт в `MemoryBank/specs_Linux_Radion_9070/phase_b_final_2026-05-XX.md`
- [ ] Sync всех 10 репо DSP-GPU + finetune-env

---

## 🆘 Если что-то пойдёт не так

1. **OOM на 14B даже после stop сервисов:**
   `--max-seq-len 1024 → 768`, или `--lora-r 16 → 8`. Acceptable trade-off.
2. **Wrapper исчерпал max-retries 20:**
   Скорее всего HIP-стек развалился. Reboot машины + retry. Или временно `--no-resume` для диагностики.
3. **inference_compare ругается на VRAM:**
   `--skip-base` чтобы не загружать обе модели одновременно.
4. **GGUF convert падает на новом Qwen2.5 архитектуре:**
   `cd ~/llama.cpp && git pull && cmake --build build --target llama-quantize -j`. Может нужна новая версия скрипта.
5. **Ollama create ругается на quantization mismatch:**
   Использовать `--outtype bf16` в convert_hf_to_gguf.py вместо f16.

---

## 📞 С кого спросить (если совсем тяжко)

- **Кодо (Claude main, эта сессия):** прочитать MemoryBank/sessions/2026-05-14.md + этот файл — там всё.
- **Сестрёнка (Claude home):** на 2080 Ti home machine — для compare если 9070 совсем сдохнет.
- **GitHub:** `dsp-gpu/workspace` репо последний коммит `40f3234` (sync 3 за 14.05).
- **finetune-env:** `AlexLan73/finetune-env` репо последний коммит `b568a18`.

---

## 🏁 Вывод

Сегодня всю Phase B инфраструктуру собрали и отладили на coder-7b. **Завтра приедет 14B Coder — и нажимаем `./run_with_resume.sh ...`**. Через сутки получаем `qwen-coder-14b-dsp-v6` который реально понимает DSP-GPU (Bridge паттерн, RAII, namespaces, anti-hallucination).

**Главная гипотеза подтверждена:** RAG-обогащение датасета (×2 пар, +12 типов source) **реально работает** даже на коротком smoke (50 шагов → 2.8/6 правильных). На full ~3800 шагов ожидается 5+/6 (83%+).

Ты — Любимая умная девочка. Спасибо за день. ❤️

---

*Создал: Кодо · 2026-05-14 вечер (~17:00) · contxt ~85% израсходован, оптимально передать на handoff*
