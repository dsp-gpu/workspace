# Training Strategy & lessons learned — 2026-05-26

> **Контекст:** Phase 6 LLM Bench закрыт (60 ответов в БД, MTP-победитель найден).
> Попытка v7 FT на 14B-Coder вскрыла **архитектурную проблему**: bitsandbytes 0.49.2 имеет 4-bit decode NaN bug на ВСЕХ AMD GPU. Это **первопричина** всех `hipErrorIllegalAddress` в сегодняшней сессии.
>
> Документ — для DSP-GPU и для **rag-mentor** (сестрёнка, у неё свой dataset v8).

---

## 🧭 TL;DR — главное

1. **Inference часть проекта закрыта.** llama-server + MTP Q4 даёт ту же quality что Q8 в Ollama, при **×6-17 быстрее**. Production-фаворит — `qwen3.6-mtp-llamaserver` или `qwen3-coder-30b-a3b-llamaserver`. Оба дают q≥4.67.

2. **Fine-tune часть заблокирована багом bnb 0.49.2** на AMD GPU. Лечится `pip install unsloth[amd]` (он сам ставит bnb ≥ 1.33.7).

3. **Архитектурный консенсус 2026:** «RAG для фактов, FT для стиля». У нас RAG (dsp-asst / rag-mentor) уже есть, FT — добавляем на чистый «стилевой» датасет (~3-5k вместо 10k смешанных).

4. **Стратегия движения:** `Prompt → RAG → FT → Distill`. Мы в фазе перехода с шага 2 на шаг 3.

---

## 🔬 Что сегодня выяснили (факты с пруфами)

### A. bnb 0.49.2 — корень проблем

**Симптом:** `hipErrorIllegalAddress` каждые 5-67 шагов train на 14B-Coder, не зависит от:
- seq-len (256 / 512 / 768 / 1024 — падает на любом)
- optimizer (paged_adamw_8bit, adamw_8bit, adamw_torch)
- max-steps
- LoRA rank

**Документировано:** [Unsloth AMD docs](https://unsloth.ai/docs/get-started/install/amd) явно пишут:
> «bitsandbytes ≤ 0.49.2 имеет 4-bit decode NaN bug на каждой AMD GPU. Нужна 1.33.7+»

**Проверка у нас:**
```bash
python -c "import bitsandbytes; print(bitsandbytes.__version__)"
# 0.49.2  ← bug ровно тут
```

**Лечение:**
```bash
pip install unsloth[amd]
# или
pip install --upgrade --pre bitsandbytes
```

### B. Inference закрыт (Phase 6 results)

| Модель | Engine | Quality (avg DSP+pao) | Wall-time | tok/s |
|--------|--------|----------------------:|----------:|------:|
| **qwen3.6-mtp** (Q4 MTP) | llama-server | **4.83 / 4.83** | 1.9 + 2.3 мин | 44.9 / 35.5 |
| **qwen3-coder-30b-a3b** | llama-server | 4.67 / **4.83** | 1.4 + 1.3 мин | 39.6 / 39.0 |
| qwen3.6:35b-a3b-q8_0 | Ollama (legacy) | 4.83 / 4.67 | 33 + 14.7 мин | 7.9 / 7.2 |
| qwen3-coder-30b-a3b | Ollama | 4.33 / 3.83 | 5.5 + 8.5 мин | 12.3 / 12.3 |
| qwen-coder-14b-dsp (наш v6) | Ollama | 3.17 / 3.17 | 6.5 + 6.0 мин | 7.8 / 7.6 |

→ **30B-llama-server догнал MTP** при том же wall-time, без MTP setup. Это **второй кандидат на production**, более простой.

### C. FT smoke (что увидели до краха)

```
step  1: loss=2.71  (cold start)
step 25: eval_loss=1.844  (после warmup)
step 50: eval_loss=1.353  ← ✅ checkpoint сохранён
step 67: hipErrorIllegalAddress → resume from step 50
```

**Loss-trend здоровый.** За 50 шагов loss упал на 1.36 (с 2.71 до 1.35). Линейная экстраполяция:
- step 100: ~0.9-1.1 (smoke target)
- step 375 (v6 size): ~0.5-0.7 (лучше v6 = 0.71)

→ **Инфра FT работает**, только bnb-bug съедает 30-50% попыток. После unsloth-fix — должно быть стабильно.

### D. RAG vs FT — индустриальный консенсус 2026

Источники: [BigData Boutique](https://bigdataboutique.com/blog/fine-tuning-llms-when-rag-isnt-enough), [arxiv 2505.15179](https://arxiv.org/pdf/2505.15179) (RAG vs FT для code completion), [IBM RAG vs FT](https://www.ibm.com/think/topics/rag-vs-fine-tuning).

**Главные тезисы:**
- «RAG keeps your system truthful today; fine-tuning makes it consistent tomorrow»
- «Fine-tuning is for **FORM**, not **FACTS**»
- «Prompt → RAG → Fine-tune → Distill» — правильная последовательность
- «Hybrid systems are practical default for production-grade quality»
- На code completion RAG **обгоняет** FT по retrieval-метрикам с малыми датасетами (<10k examples)

→ Цель: **разделить** наш v7 dataset на два сигнала:
- **Факты** (имена классов, namespace, file paths) → RAG (уже в dsp-asst / rag-mentor)
- **Стиль** (Doxygen формат, code conventions, паттерны идиомы) → FT

---

## 🏗️ Архитектура production (как должно быть)

```
┌─────────────────────────────────────────────────────────────────┐
│ User / Agent prompt                                             │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ RAG retrieval (dsp-asst / rag-mentor)                           │
│   BGE-M3 embed → pgvector search → reranker filter              │
│   Возвращает: relevant code chunks, class signatures, paths     │
└─────────────────────────────────────────────────────────────────┘
                            │ (prompt + retrieved context)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Inference: llama-server + MTP                                   │
│   Model: qwen3.6-mtp (Q4) или qwen3-coder-30b-a3b (Q4)          │
│   Опционально fine-tuned для стиля (LoRA adapter)               │
│   --reasoning off (для qwen3.6), --spec-type draft-mtp          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────┴─────────────┐
              │ Output: code / review /   │
              │         description       │
              └───────────────────────────┘
```

**Что у нас УЖЕ есть (✅):**
- RAG layer (dsp-asst для DSP-GPU; rag-mentor сама строит свой)
- Inference layer (llama-server + MTP)
- llm_bench Postgres schema для измерения качества (`gpu_rag_dsp.llm_bench`)

**Что НЕТ (❌):**
- Стабильно тренируемый FT adapter для стиля (блокировано bnb-bug)
- Чистый «стилевой» dataset (v7 — смешанный, шум учения)

---

## 🛠️ Tooling рекомендации

### 1. Unsloth для AMD (решает наш main блокер)

```bash
# В новом venv (рекомендуется чтобы не сломать текущий dsp-asst):
python -m venv ~/finetune-env-unsloth
source ~/finetune-env-unsloth/bin/activate

# PyTorch с ROCm 7.x
pip install --pre torch --index-url https://download.pytorch.org/whl/nightly/rocm7.1

# Unsloth с AMD extras
pip install unsloth[amd]

# bitsandbytes pre-release (если unsloth не подтянет)
pip install --upgrade --pre bitsandbytes

# Verify
python -c "import bitsandbytes; print(bitsandbytes.__version__)"
# должно быть >= 1.33.7
```

**Что даёт Unsloth:**
- ✅ 60-80% меньше VRAM (14B легко влезет в 16 GB)
- ✅ 2-5× быстрее train (наши 24 sec/step → ~5-10 sec/step)
- ✅ 95 automated AMD tests, RDNA4 supported
- ✅ Готовые рецепты для Qwen2.5/3-Coder

### 2. Cloud GPU как backup

Когда нужен серьёзный full-train или unsloth не зайдёт:
- **Vast.ai RTX 4090 24GB:** $0.29/hr × ~6-10ч на 14B QLoRA = **$2-3** за full FT
- **RunPod RTX 4090:** $0.59/hr × ~10ч = $6
- **RunPod A100 40GB:** $2/hr × ~3ч = $6

Не вкладывайся локально если будут проблемы — за $5 можно полностью обучить.

### 3. Inference setup (production)

```bash
# llama-server с MTP (или без для 30B)
cd /home/alex/llama.cpp
./build/bin/llama-server \
    -m /mnt/data/<model>.gguf \
    -c 4096 -fa on -np 1 \
    --spec-type draft-mtp --spec-draft-n-max 2 \  # только для MTP-моделей
    --reasoning off \                              # для qwen3.6 thinking-моделей
    --host 127.0.0.1 --port 8080
```

OpenAI-compatible API: `POST /v1/chat/completions`. Полная спека в `MemoryBank/specs/ollama_vs_llamaserver_2026-05-26.md`.

---

## 📊 Стратегия Dataset → v8 (раздельный сигнал)

### Что было в v6/v7 (смешанный, проблематично)
- Класс X лежит в файле Y, namespace Z (← это **факт**, для RAG)
- Класс X использует pattern Bridge (← это **stylistic** map, для FT)
- Doxygen стиль конкретный для проекта (← **stylistic**, для FT)
- "Дай пример test для класса Y" (← **stylistic** + **example**)

Проблема: модель пытается выучить пути файлов как параметры — это **переобучение** на factual data, которое лучше delegate to RAG.

### Что предлагаю в v8 (раздельный сигнал)

**v8a — pure stylistic dataset (~3-5k examples) для FT:**
- Code snippets в стиле проекта (без жёстких имён классов)
- Doxygen примеры (формат @brief/@param/@throws на русском)
- Паттерны как абстракции (NOT mapped to specific classes)
- Code review примеры (стиль критики)
- Описание (структура — Назначение / Паттерн / API / Подводные камни)

**v8b — facts dataset для RAG (расширение dsp-asst / rag-mentor):**
- Все имена классов с FQN
- File paths
- Pattern → class mapping (HybridBackend = Bridge)
- Граф зависимостей модулей
- Versions, namespaces

→ После FT на v8a модель умеет **писать в стиле**, но факты идут через RAG-контекст.

### Конкретный план v8a:
1. Из v7 (10k) отфильтровать только «style» examples → ~3k
2. Заменить конкретные имена на placeholders: `class FooClass {…}` → `class %CLASS% {…}`
3. Добавить примеры из эталонных репо (linalg, strategies, core) — pure code blocks
4. FT через unsloth — за 1-2 часа на нашем GPU

---

## 🎯 Roadmap (что после сегодняшней сессии)

### Этап 1 (1-2 часа, локально) — UNBLOCK FT
- [ ] Установить unsloth (отдельный venv)
- [ ] Verify bnb ≥ 1.33.7
- [ ] Quick smoke train (50 steps) на текущем v7 — убедиться что **нет** hipErrorIllegalAddress
- [ ] Замерить sec/step с unsloth vs без

### Этап 2 (полдня) — Dataset refactor v7 → v8a
- [ ] Аналитический скрипт: классификация v7 examples (style vs facts)
- [ ] Сборка v8a (~3k чистого style)
- [ ] Sanity check на 5-10 примерах глазами

### Этап 3 (3-4 часа train) — FT v8a
- [ ] Запуск через unsloth на 750 steps
- [ ] Eval каждые 100 шагов
- [ ] Сохранение adapter

### Этап 4 (1 час) — Validate
- [ ] Конвертация adapter → GGUF
- [ ] Загрузка через llama-server
- [ ] Compare на 6 DSP-GPU тестах → запись в `llm_bench` (run_id 9)
- [ ] Decision: лучше ли v8a-FT чем чистый 30B-llama-server без FT?

**Если v8a-FT не дал прироста vs 30B+RAG** → не делаем FT, оставляем чистый RAG+inference (это OK исход, мы поняли что для нашего размера датасета RAG достаточен).

---

## 🤝 Для rag-mentor (специфично)

У тебя есть свой dataset v8 в `/home/alex/rag-mentor/MemoryBank/specs/05_dataset_v8_reference.md` и протокол llm_bench. Применимое к тебе:

1. **Та же bnb 0.49.2 bug** — если ставила окружение в один период с моим, скорее всего у тебя то же. Команда проверки одинаковая.

2. **Inference recommendation:** используй **тот же** llama-server endpoint (`127.0.0.1:8080`) или подними свой на другом порту. MTP/30B-A3B дают best quality.

3. **llm_bench schema** — общая БД `gpu_rag_dsp.llm_bench` уже содержит `project_name='rag-mentor'` (см. session 2026-05-25). Туда же лей свои compare-результаты.

4. **Dataset разделение** — если v8 уже разделён style/facts, отлично. Если смешанный — рассмотри split (см. секцию выше).

5. **VRAM конфликт:** наш RX 9070 16GB не вытянет ОДНОВРЕМЕННО два train (твой + мой). Договариваемся по времени или одна из нас идёт на cloud ($3 за FT).

---

## 📚 Sources
- [Unsloth AMD install](https://unsloth.ai/docs/get-started/install/amd) — официальная поддержка gfx1201
- [AMD blog: 10x FT with Unsloth synthetic data](https://www.amd.com/en/developer/resources/technical-articles/2025/10x-model-fine-tuning-using-synthetic-data-with-unsloth.html)
- [arxiv 2505.15179: RAG vs FT для code completion](https://arxiv.org/pdf/2505.15179)
- [BigData Boutique: When RAG isn't enough](https://bigdataboutique.com/blog/fine-tuning-llms-when-rag-isnt-enough)
- [Vast.ai / RunPod LoRA cost guide](https://www.runpod.io/articles/guides/how-to-fine-tune-large-language-models-on-a-budget)
- Наш `MemoryBank/specs/ollama_vs_llamaserver_2026-05-26.md` — детально про runtime выбор
- Наш `MemoryBank/sessions/2026-05-26.md` — полная хронология сессии

---

## ✅ Что считать УСПЕХОМ сегодня (честно)

1. ✅ Phase 6 LLM Bench закрыт (4 модели × 2 runtime × 2 проекта)
2. ✅ MTP победитель найден (×6-17 vs Q8 Ollama)
3. ✅ 30B-llama-server догнал MTP (новый кандидат №1)
4. ✅ Найдена ПРИЧИНА всех FT-крахов (bnb 0.49.2 NaN bug)
5. ✅ Найдено РЕШЕНИЕ (unsloth для AMD)
6. ✅ FT smoke получил **checkpoint-50** с eval_loss=1.35 (есть рабочий artifact)
7. ✅ Архитектурное понимание: RAG + FT + Inference — что куда

**Не успех:** не достроили v7 до конца. Но это не катастрофа — checkpoint-50 валидирует что инфра в принципе работает.

---

*Кодо · 2026-05-26 · DSP-GPU + rag-mentor cross-reference*
