# Ollama vs llama-server — глубокий анализ (2026-05-26)

> **Контекст:** после Phase 6 LLM Benchmark Suite Кодо нашёл что Q4 MTP через llama-server даёт ту же или лучше качество, в 6-17× быстрее по wall-time чем Q8 через Ollama. Alex спросил: что мы теряем, что приобретаем при переходе на llama-server?

---

## TL;DR

| Критерий | Ollama | llama-server | Победитель |
|----------|--------|--------------|-----------|
| **Скорость inference** | базовая | + MTP speculative decode, +каскадные оптимизации | **llama-server** (×6-17) |
| **Качество новейших моделей** | отстаёт от main llama.cpp | свежие фиксы доступны сразу через `git pull` | **llama-server** |
| **MTP / speculative decoding** | нет (для Qwen3.6 на Linux) | да | **llama-server** |
| **Управление thinking-models** | `/no_think` system prompt (нестабильно) | `--reasoning off/on/auto/budget N` | **llama-server** |
| **Простота запуска** | `ollama run model` | длинная CLI с флагами | **Ollama** |
| **Multi-model (быстро переключаться)** | держит N в RAM + auto-swap | one-process-one-model, нужно kill+start | **Ollama** |
| **Менеджмент моделей** | `ollama pull/list/rm`, Modelfile | вручную через `convert_hf_to_gguf.py` + `llama-quantize` | **Ollama** |
| **Прозрачность runtime** | "magic" auto-fit, ограниченные параметры | весь llama.cpp под капотом | **llama-server** |
| **Параллельные запросы** | один поток per модель | `-np N` (slots monitoring) | **llama-server** |
| **OpenAI API совместимость** | `/api/generate` + `/v1` shim | native `/v1/chat/completions` | ничья |
| **GGUF совместимость** | автоматически + Ollama Registry | вручную скачать с HF | **Ollama** |
| **Cross-runtime GGUF reuse** | свои blob-форматы (хеши) | стандартный GGUF | **llama-server** |
| **Setup learning curve** | минимальная | средняя (cmake, hipcc, флаги) | **Ollama** |

**Главное:** не "или-или" — **они дополняют друг друга**.

---

## Что МЫ теряем при отказе от Ollama

1. **Multi-model в одной памяти.** Ollama держит несколько моделей в RAM (выгружает по LRU) и автоматически переключается между ними по имени. У llama-server **одна модель = один процесс**, для смены — kill+start (плюс 30-180s загрузки).
2. **Шаблоны/Modelfile.** Удобный `Modelfile`-формат: `FROM <gguf>`, `TEMPLATE`, `SYSTEM`, `PARAMETER`. Хранится в Ollama Registry, легко переносится. У llama-server параметры — флаги CLI или config-файл (менее портативно).
3. **`ollama pull` magic.** Скачать модель — одна команда. У llama-server — `huggingface-cli download` + куда-то положить + симлинк.
4. **Управление через CLI.** `ollama list`, `ollama rm`, `ollama show <model>` — приятные команды. У llama-server — `ls models/`, нет встроенного inventory.
5. **Auto-restart.** systemd unit Ollama настроен на `Restart=always`. У llama-server нужно делать самим.
6. **Community ecosystem.** Большинство туториалов, gh-репо, web-UI (Open WebUI, LibreChat) изначально нацелены на Ollama. У llama-server совместимость через `/v1/...` есть, но иногда нужны конфиги.

## Что МЫ ПРИОБРЕТАЕМ переходя на llama-server

1. **MTP / Speculative Decoding** (×1.5-2 на самой модели + Q4 vs Q8 даёт ещё ускорение).
   - В наших замерах: Q4 MTP llama-server vs Q8 Ollama = **×6-17 по wall-time**, тот же или лучше quality.
   - Ollama 0.24 умеет MTP **только для Gemma 4 + MLX (Mac)**, для Qwen3.6 на Linux/ROCm — нет.
2. **Полный набор флагов llama.cpp** (300+ опций):
   - `--reasoning off/on/auto` — управление thinking trace (для Qwen3.5/3.6, DeepSeek-R1, QwQ)
   - `--reasoning-budget N` — лимит токенов на reasoning
   - `--cache-ram`, prompt caching по умолчанию (8 GB), context checkpoints
   - `--cache-idle-slots`, `--kv-unified` — KV-cache management
   - `-fa on` (flash attention), `-ngl N` (offload), `-fit on/off` (auto-fit memory)
   - `--spec-draft-*` — speculative decoding с draft model или MTP
   - `-np N` — параллельные slots для concurrent requests
3. **Свежие архитектуры моментально.** llama.cpp выпускает фиксы по 10-30 коммитов в день. Новая модель → fix в main → `git pull + cmake --build` через час.
4. **Прозрачность runtime.** Видим `gpu_layers offloaded`, `model size`, `KV cache size`, метрики per-request (`prompt_per_token_ms`, `predict_per_token_ms`).
5. **Multi-backend choice.** `-DGGML_HIP=ON` (ROCm), `-DGGML_CUDA=ON` (NVIDIA), `-DGGML_METAL=ON` (Apple), `-DGGML_VULKAN=ON` (cross-vendor). Один и тот же бинарник.
6. **Single GGUF file = portable.** GGUF от Unsloth/Bartowski работают сразу. У Ollama своя blob-схема с хешами, GGUF нужно "импортировать" через Modelfile.
7. **Production-grade metrics.** `--metrics` (Prometheus), `--slots`, `/health`, `/v1/models`, structured logging.

---

## Можно ли использовать ОБА одновременно?

**Технически — ДА**, они слушают **разные порты**:
- Ollama: `localhost:11434` (`/api/generate`, `/v1/...`)
- llama-server: `127.0.0.1:8080` (`/v1/chat/completions`, `/completion`, `/health`)

Клиенты ходят в свой endpoint, конфликта на сетевом уровне нет.

**НО есть VRAM-конфликт** на RX 9070 (16 ГБ):
- Каждая 35B Q4-Q8 модель занимает 12-19 ГБ VRAM (или CPU при partial offload)
- Одновременно 2 большие модели **не помещаются** в VRAM
- Будут либо OOM, либо обе уйдут на CPU (катастрофически медленно)

**Когда одновременно ОК:**
- Малые модели (7B-14B Q4) в обеих runtime — может прокатить (требует тестирования)
- Одна работает на GPU, другая в CPU-only режиме (для лёгких задач — embed, rerank)
- Embedding/rerank в Ollama (BGE/E5 ~500 MB) + большая модель в llama-server

**Когда лучше переключаться:**
- Большие модели (30B+) — точно по одной
- Когда нужна максимальная скорость на одной модели
- Когда нужно сравнивать модели — точно по одной, чтобы не было interference

**Практический скрипт переключения:**

```bash
# Запустить Ollama, остановить llama-server
sudo pkill -9 -f "llama-server"
sudo systemctl start ollama

# Vice versa
sudo systemctl stop ollama
sleep 3
cd /home/alex/llama.cpp
nohup ./build/bin/llama-server -m ... > /tmp/llama-server.log 2>&1 &
```

Можно завернуть в `~/.local/bin/switch-llm.sh` с аргументом `ollama` / `llamaserver`.

---

## Гибридная стратегия (рекомендация Кодо)

### По типу задачи

| Задача | Runtime | Почему |
|--------|---------|--------|
| **RAG / dsp_asst поиск** | Ollama (BGE-M3 эмбеддер) | Маленькая модель, всегда в RAM, быстро доступна |
| **AI-judge / scoring** | llama-server (qwen3.6-mtp) | MTP даёт ×6-17 speed-up, scoring batch жирный |
| **Code generation** | llama-server (qwen3.6-mtp) | Главная skill — нужна max скорость и качество |
| **Quick test модели** | Ollama (`ollama run`) | Сменить модель — одна команда |
| **Production inference** | llama-server | Управление reasoning, метрики, slots |
| **Compare моделей** | llama-server | Те же флаги, чисто, без "magic" |
| **Dev exploration** | Ollama | Удобный CLI, быстро переключаться |

### По модели

| Модель | Размер | Runtime | Причина |
|--------|-------:|---------|---------|
| **qwen3.6-mtp** (Q4 22GB) | большая | **llama-server** | MTP, `--reasoning off` |
| qwen3-coder-30b-a3b | 18 GB | llama-server (или Ollama) | Без MTP — Ollama тоже норм, llama-server быстрее за счёт партиал offload |
| qwen-coder-14b-dsp (наш FT) | 9 GB | оба | Маленькая, обоим вкусно |
| qwen3.6:35b-a3b-q8 | 38 GB | **Ollama** (пока) | Свежий GGUF Q8 для llama-server недоступен — нужно качать |
| BGE-M3 embedder | 0.5 GB | **Ollama** | Always-on для dsp_asst |

### По «жизненной фазе»

1. **Эксперимент / новая модель** → Ollama (быстро поднять, поиграться)
2. **Production / постоянное использование** → llama-server (max performance)
3. **Compare / benchmark** → llama-server (чисто, флаги контролируемы)
4. **Multi-model service** → Ollama (auto-swap)
5. **Single-model service** → llama-server (быстро + метрики)

---

## Возможные ловушки

1. **Ollama-blobs несовместимы с llama-server.** Ollama хранит GGUF в blob с собственным хешем + Modelfile metadata. Использовать его симлинком в llama-server можно (мы так и сделали), **НО при апгрейде llama.cpp** старые GGUF могут перестать загружаться (как с `qwen35moe.rope.dimension_sections`). У Ollama же — `ollama pull` всегда даёт совместимый формат.
2. **Templates в llama-server ≠ Modelfile.** llama-server берёт template из GGUF metadata (`tokenizer.chat_template`). Если template некорректный/устаревший — `--chat-template-file`. У Ollama — `TEMPLATE` в Modelfile, проще.
3. **`/no_think` через system prompt НЕ работает** ни в Ollama, ни в llama-server (issue [llama.cpp #20182](https://github.com/ggml-org/llama.cpp/issues/20182)). В llama-server решается флагом `--reasoning off` (не через prompt). В Ollama 0.21+ — параметром `"think": false` в API request (тоже работает не для всех моделей).
4. **Apt update llama.cpp** → может сломать существующие GGUF (как у нас с qwen35moe). Стратегия: **зафиксировать commit** llama.cpp для production, обновлять только при необходимости.
5. **GPU между процессами не делится бесшовно.** Если Ollama держит модель в VRAM и llama-server тоже хочет — OOM. Нужен порядок `stop X → start Y`.

---

## Финальный вывод

**Для DSP-GPU производства:** `llama-server` с MTP — основной inference engine для качественных задач (code review, описание, документация). Ollama остаётся как **универсальный швейцарский нож** для quick test, embedder и моделей где MTP не критичен.

**Не "или-или" — оба полезны в своих ролях.**

---

## Что качать дома (для финализации Phase 6)

См. `MemoryBank/tasks/TASK_download_qwen35_q8_gguf.md` — нужно `Qwen3.6-35B-A3B-Q8_0.gguf` от Unsloth (~37-40 GB).

После этого compare-table будет **полная**: 4 модели × 2 runtime (где есть) × 2 проекта.

---

*Кодо · 2026-05-26 · по запросу Alex про «глубокий анализ Ollama vs llama-server»*
