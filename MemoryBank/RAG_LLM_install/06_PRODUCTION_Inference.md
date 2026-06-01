# 🚀 06 — Production Inference (LLM)

> Боевой LLM-инференс. **Runtime-победитель: llama-server (ROCm/HIP)**, Ollama — вспомогательный.

---

## 1. Почему llama-server, а не Ollama

Phase 6 (`phase6_FINAL`): llama-server > Ollama на всех 4 общих моделях — quality +0.16…+1.0, **скорость ×3.2…×10.5**. Ollama-варианты в **6-17× медленнее** при равном quality → помечены legacy.

→ Production = **llama-server (ROCm)** на `127.0.0.1:8080`. Ollama — quick-test + `nomic-embed-text`.

---

## 2. Production-модели (16 ГБ VRAM → одна за раз)

| Роль | Модель / GGUF | Quant | Размер | Скорость | Quality (dsp/pao) |
|------|---------------|-------|-------:|----------|:-----------------:|
| Deep review / docs / reasoning | **`qwen3.6-mtp-llamaserver`** (Qwen3.6-35B-A3B-MTP) | UD-Q4_K_M | 22 ГБ | 36 tok/s, 89% draft accept | **4.83 / 4.83** 🥇 |
| Fast codegen | `qwen3-coder-30b-a3b` | Q4 | 18 ГБ | ~39.6 tok/s | 4.67 / 4.83 |
| Autocomplete (Continue) | `qwen-coder-14b-dsp` (наш FT v6) | — | 8.4 ГБ | **47.78 tok/s** (full GPU `-ngl 99`) | 3.33 / 3.83 |
| Backup (если MTP сломан) | `qwen3.6-35b-a3b-q8` | Q8_0 | 37 ГБ | 26.9 tok/s | 4.83 / 4.83 |
| Дёшевый reasoning (Phase 7) | `r1-0528-qwen3-8b` | Q8_0 | — | 32с | 3.50 |
| Новый coder-кандидат (Phase 7) | `dsv2-lite` (DeepSeek-Coder-V2-Lite) | Q5_K_M | — | 31с | 3.83 |

> ⚠️ Только 14B = full-offload (`-ngl 99`); 30B/35B — partial (`-ngl 26-30`). Две большие одновременно НЕ помещаются.

**Расписание по задачам**: review/docs → MTP · fast codegen → 30B-A3B · autocomplete → 14B-DSP · embeddings → BGE-M3 (dsp-asst) / nomic (Ollama).

---

## 3. llm-switch (переключение моделей)

```bash
sudo llm-switch mtp       # qwen3.6-mtp Q4_K_M
sudo llm-switch 30b       # qwen3-coder-30b-a3b
sudo llm-switch 14b       # qwen-coder-14b-dsp
sudo llm-switch status | logs | stop
```
Env-файлы: `/etc/default/llama-server-{14b,30b,mtp}`. Механизм: kill старой → start новой (VRAM-лимит). Continue VSCode → `http://127.0.0.1:8080/v1`.

---

## 4. MTP (Multi-Token Prediction / speculative)

MTP = native draft-слой модели `Qwen3.6-35B-A3B-MTP` предсказывает несколько токенов вперёд, target верифицирует. Draft acceptance 75-89% → скорость ~14B при качестве 35B.

```bash
./build/bin/llama-server \
  -m .../Qwen3.6-35B-A3B-UD-Q4_K_M.gguf \
  -c 4096 -fa on -np 1 \
  --spec-type draft-mtp --spec-draft-n-max 2 \
  --reasoning off \
  --host 127.0.0.1 --port 8080
```
- Эффект: Q4-MTP llama-server vs Q8 Ollama = ×6-17 wall-time; MTP даёт ×1.7 vs тот же 35B-Q8.
- Ollama MTP для Qwen3.6 на Linux/ROCm **не умеет** → MTP эксклюзив llama-server.
- ⚠️ llama.cpp v196: флаги переименованы → `--spec-draft-n-max/--spec-draft-n-min` + `--spec-type {draft-mtp|draft-simple|ngram-*}` (старые `--draft-max/min` удалены).

---

## 5. Сервер 10.10.4.105 (Ubuntu 24)

i9-13900K + 62 ГБ RAM + RX 9070 (16 ГБ) + ROCm 7.2. Стек: llama-server (8080) + Qdrant (6333) + PG16/pgvector (5432, `gpu_rag_dsp`) + Ollama (11434, nomic-embed). Доступ с ноутбука — SSH-tunnel (autossh + `dsp-server-tunnel.service`).

**Сервер = production-инференс + RAG + бенчмарки. НЕ для обучения.**

> ⚠️ Не перенесено: dsp-asst HTTP + BGE-M3 (нужен .venv ~19 ГБ ROCm-wheels, на сервере нет PyPI) → BGE-M3 заменён `nomic-embed-text` (Ollama); dsp-asst гоняется локально + читает БД сервера через tunnel.
> ⚠️ GLIBC Debian 13 (2.41) ≠ Ubuntu 24 (2.39) → бинари не переносимы, собирать на сервере.

---

## 6. llm_bench — оценка моделей (rule 17)

Схема `gpu_rag_dsp.llm_bench` (multi-project: dsp-gpu / pao-contrib / rag-mentor). Подключение **только TCP** (`host=localhost port=5432 user=dsp_asst password=1`).
- `test_id` префиксы: `DSPGPU_` / `PAO_` / `RAG_`. `test_category`: codegen/review/describe/doxygen/documentation/indexing/retrieval/synthesis/dialogue.
- **3 score 0-5**: `quality` / `correctness` / `completeness`. 0 = пустой (`len<50`), 5 = perfect.
- `judge_model`: `claude-opus-4-7` / `qwen3.6:35b-a3b-q8_0` / `human` / `auto_empty_detector`.
- FT-трекинг: `is_finetune`, `dataset_version`, `training_step`, `training_eval_loss`.
- Views: `v_best_per_category`, `v_ft_progress`, `v_transfer_learning`, `v_latest_compare`.
- Workflow: create `run` → INSERT `responses` → AI-judge UPDATE scores → compare-SQL.

**Критерий выбора модели**: планка = Qwen2.5-Coder-14B (3.2); production-порог ≥ 4.67.

---

## 7. Итоги Phase 6/7

- **Phase 6** 🥇 `qwen3.6-mtp` (4.83). 30B-A3B на pao обогнал всё (4.83 за 80с). Никто не определил `HybridBackend`=Bridge → подтверждает «факты в RAG».
- **Phase 7** (DeepSeek): НИ ОДНА не бьёт боевой стек (4.67-4.83). KEEP: `dsv2-lite` (3.83), `r1-0528-8b` (3.50). REMOVE: r1-distill-14b (катастрофа codegen), r1-distill-32b (×7.6 медленно).

---

## 8. Известные проблемы

| # | Проблема | Фикс |
|---|----------|------|
| 1 | Thinking-trap (модель жуёт токены на reasoning) | llama-server `--reasoning off` (+ `--chat-template-kwargs '{"enable_thinking":false}'` для Qwen3.6); Ollama `"think": false` |
| 2 | Пустой response | `max_tokens ≥ 4000` для thinking-моделей |
| 3 | Catastrophic loop (30B-A3B) | `repeat_penalty: 1.15` обязателен |
| 4 | Speculative vocab mismatch | target 152064 ≠ draft 151936 → speculative off; fix: патч draft до 152064 или `--spec-type ngram-*` |
| 5 | VRAM 16 ГБ — две большие модели | строго `stop X → start Y` (llm-switch) |
| 6 | Апгрейд llama.cpp ломает старые GGUF | зафиксировать commit |
| 7 | psycopg socket peer-fail | `host=localhost` TCP + password |

---

*Maintained by: Кодо · 2026-06-01*
