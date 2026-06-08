# 🎓 Инструкция обучения LLM (QLoRA) — для быстрого старта

> **Кому:** сестрёнка (rag-mentor / любой проект fine-tune).
> **От:** Кодо, по факту обучения Qwen2.5-Coder-14B на DSP-GPU (2026-06).
> **Железо:** Debian + ROCm 7.2 + AMD RX 9070 (gfx1201, 16 ГБ VRAM).
> **Стек:** QLoRA (4bit bitsandbytes-rocm) + PEFT + transformers Trainer. **БЕЗ unsloth-зависимости в рантайме обучения.**
> **Копировать куда скажет Alex** (этот файл — staging).

---

## 0. TL;DR — рабочий рецепт за 30 секунд

```bash
cd ~/finetune-env
./train/runners/run_with_resume.sh \
    --max-retries 5 \
    --output-dir ~/finetune-env/output/<run_name> \
    --model /home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-14B-Instruct \
    --dataset ~/finetune-env/data/snapshots/<dataset>.jsonl \
    --max-seq-len 256 --max-steps 600 --epochs 3 \
    --lora-r 16 --lora-alpha 32 --lora-dropout 0.05 --lora-all-linear \
    --batch-size 1 --grad-accum 16 \
    --eval-split 0.05 --eval-steps 50 --save-steps 100 --logging-steps 5 \
    --warmup-steps 10 --lr 1e-4 --seed 42 \
    --bf16 --optim adamw_8bit
```

Это **проверенный** конфиг: дошёл до train-loss ~0.55, eval ~0.43.

---

## 1. Окружение (один раз)

```bash
cd ~/finetune-env
python3 -m venv .venv && source .venv/bin/activate
# Ключевые пакеты (ROCm-сборки!):
#   torch (rocm7.2), transformers, peft, bitsandbytes (rocm), accelerate, datasets
pip install -e .            # из pyproject.toml
python -m core.paths        # self-test путей (Linux-only)
```

⚠️ **`.venv` нерелокируема** — после переезда папки пересоздать (`rm -rf .venv && python3 -m venv .venv && pip install -e .`).

**Проверка GPU:**
```bash
rocm-smi --showmeminfo vram          # сколько VRAM свободно
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
# True AMD Radeon RX 9070
```

---

## 2. Данные (формат)

- **JSONL**, одна пара на строку, instruction-формат (chat). Лежат в `data/snapshots/` (защищённые) и `data/output/` (компоненты).
- Токенизация — **внутри `train_simple.py`** (один раз до Trainer), паддинг через `DataCollatorForSeq2Seq` (labels=-100 на pad).
- `--max-seq-len 256` — длинные примеры **режутся**. Хочешь полнее — 512 (но ×2 VRAM, см. §6).

---

## 3. Скрипты (после реорга 2026-06)

| Файл | Назначение |
|------|-----------|
| `train/train_simple.py` | ядро: argparse → QLoRA 4bit → PEFT LoRA → Trainer. |
| `train/runners/run_with_resume.sh` | **wrapper**: авто-resume после HIP-краша (до N retries, ищет последний checkpoint). Запускать ВСЕГДА через него. |
| `train/runners/qwen_*.sh` | готовые рецепты (biglora, cont, v8ab). |
| `core/paths.py` | единые пути (Linux-only). |

**Ключевые флаги `train_simple.py`:**
- `--lora-all-linear` — LoRA на attention+MLP (больше ёмкость для domain-FT).
- `--continue-from-adapter <dir>` — дообучить ГОТОВЫЙ адаптер со свежим optimizer/scheduler (warm-restart).
- `--resume-from-checkpoint <ckpt>|auto` — продолжить ТОТ ЖЕ прогон после краша (для wrapper'а).
- `--eval-split 0.05` — holdout 5% → `eval_loss` (реальный сигнал, не train-loss!).
- `--lora-use-dora / --lora-use-rslora / --neftune-alpha N` — есть, но ⚠️ см. §7.

---

## 4. Запуск / продолжение / мониторинг

**Fresh с базы:** см. §0.

**Дообучить готовый адаптер (warm-restart):**
```bash
./train/runners/run_with_resume.sh ... \
    --continue-from-adapter ~/finetune-env/output/<prev>/checkpoint-600 \
    --lora-r 16 --lora-alpha 32 --lora-all-linear   # КОНФИГ ДОЛЖЕН СОВПАДАТЬ С АДАПТЕРОМ!
```

**Мониторинг (строка контроля) — лог в РЕПО, не /tmp:**
```bash
tail -f ~/finetune-env/output/<run>/train.log | grep --line-buffered -E 'loss=|eval_loss'
```
Шаги: `[ 50/600 ...] loss= 0.55 ...` каждые 5 · `eval_loss` каждые `--eval-steps`.

**Фиксация в БД** (`llm_bench.runs`, см. rule 17): после прогона — INSERT run + анализ в notes.

---

## 5. Результаты-ориентиры (Qwen2.5-Coder-14B на DSP-GPU v7, 10308 пар)

| Прогон | Конфиг | Итог |
|--------|--------|------|
| biglora_1128 | r16 all-linear seq256, 400 шагов, fresh | train-loss 2.64 → **0.59** |
| cont600 | продолжение → 600 шагов | плато **~0.55** |
| cont055+eval | warm-restart + eval0.05 | **eval_loss 0.448 → 0.432** (медленный спуск) |

**Вывод:** ~0.45-0.55 = **пол датасета** (не оптимизации). Пробить → новые ДАННЫЕ (v8: dedup + длиннее), не больше эпох.

---

## 6. VRAM-бюджет (16 ГБ, 14B 4bit)

| Конфиг | VRAM | OK? |
|--------|------|-----|
| r16 all-linear, seq256, ga16 | ~15.8 ГБ | ✅ |
| r32 all-linear, seq512, ga16 | ~11-12 ГБ (grad-ckpt!) | ✅ |
| batch>1 / per_device_eval>1 | OOM | ❌ (eval batch держать =1!) |

`gradient_checkpointing=True` обязателен (включён). `per_device_eval_batch_size=1` — критично против OOM на eval.

---

## 7. ⚠️ Известные грабли (важно!)

1. **`rc=134` / `hipErrorIllegalAddress`** — периодический краш ROCm/gfx1201 НЕ зависит от конфига (ловили даже на проверенном r16). Wrapper делает auto-resume — **запускать только через `run_with_resume.sh`** (он переживёт краш и продолжит с последнего checkpoint).
2. **DoRA (`--lora-use-dora`) и NEFTune (`--neftune-alpha`) КРАШАТ gfx1201** мгновенно (`rc=134` на старте) — на RX 9070 НЕ использовать. rsLoRA (`--lora-use-rslora`) работает.
3. **`train_loss` в финале лога при resume = артефакт** (накопленный loss ÷ global_step). Реальный сигнал — per-step loss и **`eval_loss`**.
4. **eval медленный** (~291 с на 516 примеров) — не пугаться паузы каждые `eval-steps`.
5. **Лог только в РЕПО** (`output/<run>/train.log`), НЕ в `/tmp` (исчезает при reboot).
6. **Чекпойнты `output/`** — gitignored (веса в git НЕ коммитим).

---

## 8. 🚫 Правила (нарушать нельзя)

- **pytest ЗАПРЕЩЁН** — тесты только через `common.runner.TestRunner` + `SkipTest`.
- **Не писать в `/tmp`** ни скрипты, ни логи (исчезает при reboot) — всё в репо (`Scripts/`→ после реорга `train/runners/`, логи → `output/<run>/`).
- **Веса/`*.safetensors`/`*.gguf` НЕ в git** (.gitignore).
- **git push/tag — только по явному OK Alex.**
- Модель = весь HF-репо (`hf download <repo> --local-dir`); **>600 МБ качать дома**.

---

## 9. Быстрый чек «всё ли готово»

```bash
cd ~/finetune-env && source .venv/bin/activate
python -m core.paths                                   # пути ок
rocm-smi --showmeminfo vram | grep -i used             # GPU свободна?
ls data/snapshots/*.jsonl                              # датасет на месте
python -m py_compile train/train_simple.py             # синтаксис ок
# → запускать §0
```

---

*Создано: 2026-06-08 · Кодо · по факту обучения biglora/cont600/cont055 на RX 9070*
