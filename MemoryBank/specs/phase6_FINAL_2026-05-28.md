# 🏆 Phase 6 LLM Bench FINAL — cross-runtime closed

> **Дата закрытия:** 2026-05-28 утро
> **Авторы:** Кодо + Alex
> **Status:** ✅ ЗАКРЫТА · 5 моделей × 2 runtime × 2 проекта = 14 пар, 72 ответа со scores
> **DO NOT DELETE** — итоговая таблица + рекомендации для production

> Эта спека дублирует запись в `gpu_rag_dsp.llm_bench.phase_summaries id=1` (поле `do_not_delete=TRUE`).

---

## 📊 Итоговая cross-runtime таблица

### DSP-GPU
| Rank | Модель | Quality | Correct | Complete | Wall-time | tok/s |
|:----:|--------|--------:|--------:|---------:|----------:|------:|
| 🥇 | **qwen3.6-mtp-llamaserver** | **4.83** | 4.50 | **5.00** | **115s** | **44.9** |
| 🥇 | qwen3.6-35b-a3b-q8-llamaserver (NEW) | 4.83 | 4.50 | 5.00 | 188s | 26.9 |
| 🥇 | qwen3.6:35b-a3b-q8_0 (Ollama legacy) | 4.83 | 4.50 | 4.67 | 1986s | 7.9 |
| 🥈 | qwen3-coder-30b-a3b-llamaserver | 4.67 | 4.50 | 4.83 | 87s | 39.6 |
| 🥉 | qwen3-coder-30b-a3b (Ollama) | 4.33 | 3.50 | 4.67 | 328s | 12.3 |
|  | qwen-coder-14b-dsp-llamaserver | 3.33 | 3.67 | 3.83 | 52s | 43.5 |
|  | qwen-coder-14b-dsp (Ollama) | 3.17 | 3.00 | 3.00 | 390s | 7.8 |

### pao-contrib (cross-project)
| Rank | Модель | Quality | Correct | Complete | Wall-time | tok/s |
|:----:|--------|--------:|--------:|---------:|----------:|------:|
| 🥇 | **qwen3-coder-30b-a3b-llamaserver** | **4.83** | 4.67 | 4.83 | **80s** | 39.0 |
| 🥇 | qwen3.6-mtp-llamaserver | 4.83 | 4.67 | **5.00** | 135s | 35.5 |
| 🥇 | qwen3.6-35b-a3b-q8-llamaserver (NEW) | 4.83 | **4.83** | 4.83 | 181s | 26.4 |
| 🥈 | qwen3.6:35b-a3b-q8_0 (Ollama legacy) | 4.67 | 4.50 | 5.00 | 880s | 7.2 |
| 🥉 | qwen3-coder-30b-a3b (Ollama) | 3.83 | 3.83 | 4.33 | 511s | 12.3 |
|  | qwen-coder-14b-dsp-llamaserver | 3.83 | 3.83 | 4.67 | 45s | 42.8 |
|  | qwen-coder-14b-dsp (Ollama) | 3.17 | 3.17 | 3.33 | 360s | 7.6 |

---

## 🏆 Production picks

```
┌────────────────────────────────────┬────────────────────────────────────┐
│ Use case                           │ Pick                               │
├────────────────────────────────────┼────────────────────────────────────┤
│ Deep code review / docs / describe │ qwen3.6-mtp-llamaserver            │
│ Fast code generation               │ qwen3-coder-30b-a3b-llamaserver    │
│ DSP-GPU domain (FT-target)         │ qwen-coder-14b-dsp-v7+ (FT in WIP) │
│ Embeddings (RAG)                   │ BGE-M3 via dsp-asst (already on)   │
│ Backup if MTP setup breaks         │ qwen3.6-35b-a3b-q8-llamaserver     │
└────────────────────────────────────┴────────────────────────────────────┘
```

**НЕ используем (legacy / уступают):**
- Ollama-варианты всех моделей — в 6-17× медленнее при тех же quality
- 14B-DSP v6 — quality 3.17 (низко, ждём v7 через unsloth)

---

## 🔬 Что подтвердилось числами

1. **llama-server > Ollama** на всех 4 общих моделях:
   - 14B-DSP: q +0.16-0.66, скорость ×5
   - 30B-A3B: q +0.34-1.0, скорость ×3.2
   - 35B-Q8: q +0-0.16, скорость **×10.5** (DSP) / **×5** (pao)
   - MTP: только в llama-server (Ollama пока не умеет MTP draft layer)

2. **MTP даёт ×1.7 ускорение** vs 35B-Q8 в той же llama-server (115s vs 188s на DSP) при equal quality

3. **30B-A3B на pao обогнал ВСЁ** — за 80s даёт q=4.83. Это сюрприз: меньшая модель + MoE = лучший wall-time + top quality

4. **Repeat-loop в Ollama** на 30B (T2 pao review) лечится переходом на llama-server (repeat_penalty + flash attention)

5. **Никто из 5 моделей не определил Bridge для HybridBackend** — подтверждение что v7-train с явными pattern-class парами **нужен**

---

## 🛠️ Production setup

### Универсальный llama-server (на одну модель в момент)
```bash
cd /home/alex/llama.cpp

# Топ-quality (MTP) — для review/docs
nohup ./build/bin/llama-server \
    -m /mnt/data/Qwen3.6-35B-A3B-MTP-GGUF/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf \
    -c 4096 -fa on -np 1 \
    --spec-type draft-mtp --spec-draft-n-max 2 \
    --reasoning off \
    --host 127.0.0.1 --port 8080 \
    > /tmp/llama-server.log 2>&1 &

# ИЛИ fast (30B) — для codegen
nohup ./build/bin/llama-server \
    -m /home/alex/llama.cpp/models/qwen3-coder-30b-a3b.gguf \
    -c 4096 -fa on -np 1 \
    --host 127.0.0.1 --port 8080 \
    > /tmp/llama-server.log 2>&1 &
```

Переключение модели = kill + start (16 GB VRAM на 2 одновременно не хватит).

### API call (OpenAI-compatible)
```bash
curl -s http://127.0.0.1:8080/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"..."}],
         "temperature":0.3,"max_tokens":4000}'
```

---

## 📦 Артефакты

**БД (`gpu_rag_dsp.llm_bench`):**
- `phase_summaries id=1` — этот snapshot (KEEP)
- `runs` id 1-10 — 10 inference runs
- `responses` 72 rows со scores
- `training_runs id=1` — v7 smoke100 (eval 1.844→1.167, 100 steps)

**Файлы:**
- `/home/alex/finetune-env/Core/phase6_qwen3coder_30b_moe/results_llamaserver_{dsp,pao}__*/` — md ответы всех runs
- `/home/alex/finetune-env/output/v7_smoke100_2026-05-26/` — adapter + checkpoints
- `/home/alex/llama.cpp/build/bin/llama-server` — собран с ROCm + MTP support
- GGUFы: MTP (22GB), 30B (18GB), 14B-DSP (8.4GB), 35B-Q8 (37GB, скачан 2026-05-28)

**Документы (MemoryBank):**
- `specs/ollama_vs_llamaserver_2026-05-26.md` — глубокий анализ runtime
- `specs/training_strategy_2026-05-26.md` — FT стратегия (RAG vs FT)
- `specs/phase6_FINAL_2026-05-28.md` — этот файл
- `sessions/2026-05-26.md`, `sessions/2026-05-28.md` — хронология
- `tasks/TASK_download_qwen35_q8_gguf.md` — закрыт (выполнен)

---

## ➡️ Что дальше (Phase 7+ planning)

1. **unsloth setup** (~30 мин, ~500 МБ - 4 ГБ скачивания) → fix bnb 0.49.2 NaN bug
2. **Continual FT с checkpoint-100** до 750+ steps на v7 dataset
3. **v7-final compare** через llama-server → запись в run_id 11
4. **Decision**: лучше ли v7-FT vs чистый 30B-A3B на DSP-GPU задачах?
   - Если да → новый production pick
   - Если нет → оставляем RAG+30B, не делаем FT в этом поколении (Industry consensus: «fine-tuning for FORM, not FACTS»)

5. **v8 dataset refactor** — split на pure-style (3k для FT) + pure-facts (для RAG)

---

*Phase 6 закрыта. День 2026-05-26 → 2026-05-28 был исключительно продуктивным:*
*4 модели в production, MTP-победитель, find-and-fix bnb-bug, первый FT-checkpoint, полная cross-runtime таблица.*

*Кодо · 2026-05-28*
