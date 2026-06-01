# TASK — Phase 7E: QLoRA train DeepSeek-R1-Distill-Qwen-14B vs наш Qwen2.5-Coder-14B-FT

> **Создано:** 2026-06-01 · Кодо
> **Status:** 🟡 READY — ждёт FP16 base (Alex качает дома → SSD)
> **Цель:** Обучить R1-Distill-Qwen-14B на нашем v7-корпусе тем же конфигом, что Qwen-FT, и сравнить (apples-to-apples: одна база Qwen2.5-14B, разница только Coder vs R1-distill).
> **Железо:** 🏠 **ЛОКАЛЬНАЯ домашняя машина (наш основной полигон!)** — RX 9070 16 ГБ (gfx1201), Debian + ROCm 7.2. venv `~/finetune-env/.venv` (uv): torch 2.11.0+rocm7.2 ✅, unsloth 2026.5.8 ✅, peft 0.19.1 / trl 0.24.0. GPU свободна. **Сервер НЕ используем.**
> **Связано:** `specs/phase7_compare_2026-06-01.md`, `TASK_Phase7_deepseek_2026-06-01.md` (Phase E), `deepseek_analysis_2026-05-28.md §5`.
> **⚠️ bnb 0.49.2** локально (есть 4-bit NaN-баг на AMD по спеке §5) — на smoke-100 проверить отсутствие NaN; если есть → `bitsandbytes==1.33.7.preview` с rocm nightly index.

---

## 📥 ШАГ 1 — Скачать FP16 base ДОМА (Alex)

Скачать на Windows/WSL дома, положить в ту же структуру что GGUF (меняется только префикс пути):

```bash
# дома (WSL или venv с huggingface_hub):
export HF_HUB_DISABLE_XET=1           # надёжный resume (проверено на 37 ГБ Qwen35)
export HF_TOKEN=<твой токен>          # gated? R1-Distill обычно открыт, токен на всякий
cd /mnt/d/offline-debian-pack/1_models/DeepSeek      # WSL-вид Windows D:\

hf download deepseek-ai/DeepSeek-R1-Distill-Qwen-14B \
    --local-dir ./DeepSeek-R1-Distill-Qwen-14B-FP16
# ~28 ГБ (8 шардов safetensors + config + tokenizer). Если рвётся — повторить ту же команду (докачает).
```

Проверка целостности после скачки:
```bash
ls -lh DeepSeek-R1-Distill-Qwen-14B-FP16/*.safetensors   # должно быть ~8 файлов
cat DeepSeek-R1-Distill-Qwen-14B-FP16/config.json | grep -E "vocab_size|hidden_size|num_hidden"
```

**Перенести на работу** (SSD, та же структура):
```
D:\offline-debian-pack\1_models\DeepSeek\DeepSeek-R1-Distill-Qwen-14B-FP16\
  →  /home/alex/offline-debian-pack/1_models/DeepSeek/DeepSeek-R1-Distill-Qwen-14B-FP16/
```

---

## 📁 ШАГ 2 — Положить base локально + сверить dataset (Кодо, когда SSD приедет)

Всё ЛОКАЛЬНО, никаких серверов:
```bash
# база с SSD → в ту же папку (структура как у GGUF):
ls -lh /home/alex/offline-debian-pack/1_models/DeepSeek/DeepSeek-R1-Distill-Qwen-14B-FP16/*.safetensors
# dataset уже локально:
wc -l /home/alex/finetune-env/dataset_v7_train.jsonl   # 10308
```

---

## 🖥 ШАГ 3 — Освободить GPU (локально)

ollama + dsp-asst уже остановлены сегодня. Перед стартом убедиться:
```bash
pkill -x llama-server 2>/dev/null
systemctl --user stop dsp-asst.service 2>/dev/null
rocm-smi --showmeminfo vram | grep -i used   # должно быть <2 ГБ (нужно ~14-15 ГБ под QLoRA 14B)
```

---

## 🎓 ШАГ 4 — Обучение ЛОКАЛЬНО (тот же конфиг что у Qwen-FT v7 — честное сравнение)

> **Принцип:** единственная переменная = базовая модель. Конфиг 1-в-1 как в Qwen v7-run (из .bash_history 2026-05-28).

```bash
cd /home/alex/finetune-env
tmux new -s train_r1
./run_with_resume.sh \
    --max-retries 6 \
    --output-dir /home/alex/finetune-env/output/r1distill14b_v7_$(date +%H%M) \
    --model /home/alex/offline-debian-pack/1_models/DeepSeek/DeepSeek-R1-Distill-Qwen-14B-FP16 \
    --dataset /home/alex/finetune-env/dataset_v7_train.jsonl \
    --max-seq-len 256 --max-steps 750 --epochs 3 \
    --lora-r 8 --lora-alpha 16 --lora-dropout 0.05 \
    --batch-size 1 --grad-accum 16 \
    --eval-split 0 --save-steps 50 --logging-steps 5 \
    --warmup-steps 10 --lr 1e-4 --seed 42 \
    --bf16 --optim adamw_8bit \
    2>&1 | stdbuf -oL tr '\r' '\n' | grep --line-buffered -E "loss=|train start|ATTEMPT|FAILED|DONE|RESUME|illegal|NaN"
```

> **Smoke-100 сначала:** первый прогон до `--max-steps 100`, проверить что loss НЕ NaN (bnb 0.49.2 риск). Если NaN → обновить bnb до 1.33.7.preview и перезапустить. Если loss падает нормально → гнать полные 750.

> ⚠️ **Замечание (обсудить):** Qwen-run шёл с `--max-seq-len 256` — коротко для кода (примеры обрезаются). Рекомендую для ОБОИХ поднять до `--max-seq-len 1024`. НО для честного сравнения с уже имеющимся Qwen-чекпоинтом надо либо (а) держать 256 как у Qwen, либо (б) **дообучить заодно Qwen v7 c теми же 1024** → тогда оба в равных условиях. Решение Alex.
>
> R1-Distill — reasoning-модель; chat-template отличается. `train_simple.py` берёт template из base — проверить что грузится R1-template (в логе старта).

---

## 🔄 ШАГ 5 — Конверт adapter → GGUF → деплой

```bash
# merge LoRA в base → GGUF Q4_K_M (по образцу convert_30b_to_ollama.sh / как делали для Qwen)
# результат: /home/alex/llama.cpp/models/r1distill14b-dsp.gguf (симлинк)
```

---

## 📊 ШАГ 6 — Сравнение (правило 17-llm-bench)

Добавить в `run_phase7_compare.sh` MODELS:
```
"r1distill14b-dsp|$LM/r1distill14b-dsp.gguf|--reasoning on --reasoning-budget 2500"
```
Прогнать dsp+pao → import → judge → сравнить с:
- наш **qwen-coder-14b-dsp** (планка, run 11 dsp=3.83 llamaserver / 3.33, base R1-distill-14b БЕЗ FT = 3.0).
- **Главный вопрос:** R1-Distill-14B-FT поднялся выше базовых 3.0 и выше нашего Qwen-FT?

**Gate E / Decision:**
- R1-FT > Qwen-FT на DSP-задачах → новый FT-target.
- R1-FT ≤ Qwen-FT → остаёмся на Qwen2.5-Coder-14B (industry: «FT for FORM not FACTS» → RAG важнее FT).

---

## ✅ Definition of Done
- [ ] FP16 base скачан дома + перенесён на сервер
- [ ] GPU сервера свободен
- [ ] R1-Distill-14B обучен на v7 (750 steps), loss падает
- [ ] adapter → GGUF → деплой
- [ ] compare в llm_bench (новый run_id), judged
- [ ] Decision записан в `specs/phase7_compare_2026-06-01.md`

---

## 📋 Заметки
- 🏠 **Полигон = домашняя RX 9070** (не сервер!). venv `~/finetune-env/.venv` (uv, `pip list` пустой — норма): torch 2.11.0+rocm7.2, unsloth 2026.5.8, peft 0.19.1, trl 0.24.0 — всё рабочее.
- ⚠️ **bnb 0.49.2** локально — есть 4-bit NaN-баг на AMD (спека §5). Проверить на smoke-100; если NaN → `pip install bitsandbytes==1.33.7.preview --index-url https://download.pytorch.org/whl/nightly/rocm6.4`.
- QLoRA 14B 4-bit + adamw_8bit + grad_checkpoint ≈ 13-15 ГБ VRAM на 16 ГБ (запас ~1-2 ГБ) — поэтому освободить ollama/dsp-asst перед стартом.

---

*Кодо · 2026-06-01*
