# TASK_RAG_remaining_work — что осталось доделать по RAG / Phase B

> **Создан:** 2026-05-13 после полного bringup RAG на Debian + RX 9070.
> **Контекст:** в текущей сессии (2026-05-13) подняли весь RAG-стек, наполнили БД 19,961 row, настроили systemd autostart. Зафиксировать что осталось.
> **Maintainer:** Кодо (Codo)
> **Связано:**
> - `MemoryBank/specs_Linux_Radion_9070/rag_stack_cheatsheet_2026-05-13.md` — команды
> - `MemoryBank/specs_Linux_Radion_9070/rag_stack_boot_architecture_2026-05-13.md` — boot архитектура
> - `MemoryBank/sessions/2026-05-13.md` — летопись дня

---

## 📊 Текущее состояние (2026-05-13 вечер)

### ✅ Что работает в production
- Все 5 сервисов autostart + linger=yes (PG/Qdrant/Ollama/embed/dsp-asst)
- 19,961 row в `rag_dsp.*` (15 таблиц)
- BGE-M3 + reranker на RX 9070 (GPU 80-87%, ~0.3 s/batch)
- MCP конфиг в `DSP-GPU/.claude/settings.json` готов

### ⚠️ Что не доделано / отложено

---

## 🥇 Приоритет P0 (нужно сделать в ближайшую сессию)

### F1. Phase B QLoRA Training
- **Файл:** `TASK_FINETUNE_phase_B_2026-05-12.md`
- **Effort:** 3-4 ч (само обучение на 9070)
- **Что:** запуск `run_full_qwen3_r16_9070.sh` на dataset_v4 (5885 пар, train 5071 / val 814).
  Параметры: LoRA r=16, bf16, 3 epoch, ~5300 train, ~800 val.
- **Зависимости:** ✅ dataset_v4 готов, ✅ Qwen3-8B в `offline-pack/1_models/qwen3-8b/`.
- **DoD:**
  - [ ] Checkpoint в `finetune-env/phase_b_2026-05-XX/`
  - [ ] `ollama create qwen3-8b-dsp -f Modelfile.template` → модель работает
  - [ ] B1 inference compare 6 вопросов → spec в `MemoryBank/specs/LLM_and_RAG/inference_compare_*.md`
- **Risk:** OOM (если bf16 не помещается → перейти на 4bit через bitsandbytes — но bitsandbytes отсутствует в offline-pack, нужно докачать ~80 MB)
- **Pre-flight:**
  ```bash
  cd /home/alex/finetune-env && source .venv/bin/activate
  python preflight_smoke_check.py
  # ожидаемо: ALL CHECKS PASSED
  ```

### P1. Python тесты — 6 FAIL'ов на gfx1201
- **Файл:** `TASK_python_migration_phase_B_FAILS_2026-05-04.md`
- **Effort:** 2-3 ч
- **Что:** 6 FAIL'ов из 50 t_*.py (43 PASS / 1 SKIP / 6 FAIL):
  - `heterodyne/t_heterodyne.py` — полный провал (1×4F)
  - 3 numerical mismatches (radar/spectrum)
  - 1 API mismatch ai_pipeline
  - 1 linalg capon
- **Зависимости:** уже на Debian + RX 9070, namespace migration ✅
- **DoD:** все 50 → PASS

### Git commit + sync (всё что сделано 13.05)
- **Effort:** 30 мин
- **Что:**
  1. `cd /home/alex/finetune-env && git add -A && git commit -m "..."`
     - cli/main.py — 5 `--root` defaults + `repo_root` cross-platform
     - retrieval/embedder.py — env DSP_ASST_BGE_M3_PATH + auto-cuda
     - ingest_test_tags.py — env DSP_GPU_ROOT
     - migrate_pgvector_to_qdrant.py — новый
     - re_ingest_all.sh — новый (bash аналог PS скрипта)
  2. `cd /home/alex/DSP-GPU && git add MemoryBank/ .claude/ && git commit -m "..."`
     - settings.json + .bak-2026-05-13 (опционально не коммитить backup)
     - sessions/2026-05-13.md (продолжение)
     - tasks/IN_PROGRESS.md (обновить)
     - specs_Linux_Radion_9070/{cheatsheet, boot_architecture}_2026-05-13.md
     - этот TASK файл

### MemoryBank session 2026-05-13 (продолжение)
- **Effort:** 15 мин
- **Что:** дополнить `sessions/2026-05-13.md` секцией «RAG bringup вечер»:
  - Bringup 5 сервисов
  - 19,961 row в БД
  - Patches в finetune-env (5 файлов)
  - systemd-units + linger=yes
  - 8 фаз bringup (BD, SQL, HF stubs, venv, build, embeddings, extras, re_ingest, test_tags)

---

## 🥈 Приоритет P1 (на этой неделе)

### V2. Validators rollout (linalg pilot → 7 модулей)
- **Файл:** `TASK_validators_linalg_pilot_2026-05-04.md`
- **Effort:** 3-4 ч
- **Что:** раскатить `gpu_test_utils::ScalarAbsError` на остальные 7 модулей (linalg уже сделан в acceptance v12). Spectrum, stats, heterodyne, signal_generators, radar, strategies, core.
- **DoD:** 0 ручных `if (err >= TOL) throw` во всех `{repo}/tests/`.

### O1. OpenCL legacy classes removal
- **Файл:** `TASK_remove_opencl_legacy_classes_2026-05-08.md`
- **Effort:** 2-4 ч
- **Что:** 5 legacy OpenCL .hpp классов → миграция на `*_rocm.hpp`. Дома неактивно. На Debian после namespace migration — самое время.

---

## 🥉 Приоритет P2 (RAG improvements)

### CTX3. Hybrid upgrade (BM25 + HyDE)
- **Файл:** `TASK_RAG_hybrid_upgrade_2026-05-08.md`
- **Effort:** ~3.5 ч (HyDE часть)
- **Статус:** BM25 sparse ✅ (видим `S-rank` в query). HyDE — частично, нужно доделать.
- **HyDE = Hypothetical Document Embeddings:**
  1. LLM генерирует «гипотетический» документ-ответ на query
  2. Этот документ embeded → используется для поиска вместо raw query
  3. Профит: семантика «как ответ выглядит» вместо «что искал»

### CTX5. Context Pack (orchestrator)
- **Файл:** `TASK_RAG_context_pack_2026-05-08.md`
- **Effort:** ~2 ч
- **Что:** orchestrator который собирает готовый bundle для LLM (search + rerank + dedup + cache).

### QdrantStore implementation (Phase 2.5)
- **Код:** `retrieval/vector_store.py:190` — `NotImplementedError`
- **Effort:** ~4 ч
- **Что:** реализовать `upsert/search/count` для Qdrant. Тогда заработает `stage 2_work_local` (Qdrant как primary vector store).
- **Зачем:** сейчас pgvector работает отлично, миграция опциональна. Но stack.json уже описывает `2_work_local` → нужно завершить.

### EV (E3+E4). Eval extension
- **Файл:** `TASK_RAG_eval_extension_2026-05-08.md`
- **Effort:** ~2.5 ч
- **Статус:** E1 + E2 ✅. E3 + E4 ждут `_RAG.md` манифест (уже сделан).

---

## 🥉 Приоритет P3 (после Phase B)

### AR. Agentic Loop (CRAG + Self-RAG)
- **Файл:** `TASK_RAG_agentic_loop_2026-05-08.md`
- **Зависимости:** Phase B модель должна быть готова
- **Что:** замкнутый цикл «question → retrieve → critique → re-retrieve → answer» с feedback loop.

### GR. Graph Extension G1-G5
- **Файл:** `TASK_RAG_graph_extension_2026-05-08.md`
- **Effort:** ~9 ч
- **Что:** граф symbols/blocks/use_cases с rebuild через `rag_logs`.

### CTX6. Code Embeddings (Nomic-Embed-Code)
- **Файл:** `TASK_RAG_code_embeddings_2026-05-08.md`
- **Effort:** ~5-6 ч
- **Что:** dedicated embedder для кода (отдельный от BGE-M3 для текста). Должно улучшить точность поиска C++ методов.

### CTX7. Late Chunking BGE-M3 (deferred)
- **Файл:** `TASK_RAG_late_chunking_2026-05-08.md`
- **Статус:** ⏸️ **deferred 12.05.26**
- **Блокер:** требует `transformers==4.46.0`, в venv у нас 5.8.1. Нужен отдельный venv или downgrade.

### CTX8. Telemetry (popularity boost)
- **Файл:** `TASK_RAG_telemetry_2026-05-08.md`
- **Effort:** ~1 ч
- **Что:** через `TestRunner::OnTestComplete` → `rag_dsp.usage_stats` → boost популярных symbols в ranking.

---

## 🛠 Прочее не-RAG

### P2. KernelCache v2 closeout (Windows)
- **Файл:** `TASK_KernelCache_v2_Closeout_2026-04-27.md`
- **Effort:** 3-5 ч
- **Что:** MemoryBank sync + документация. **Windows**, не Debian.

### P3. Profiler v2 closeout (Win + опц. Debian)
- **Файл:** `TASK_Profiler_v2_INDEX.md`
- **Effort:** 4-30 ч
- **Что:** 3 закрывающих таска (docs, CI, Q7 roctracer).

---

## 🎯 Рекомендуемый порядок (быстрый план)

```
Сегодня вечером (13.05):
  → Git commit + MemoryBank session
  → Перезапустить Claude Code → smoke MCP-tools

Завтра / выходные:
  P0: F1 Phase B QLoRA (3-4 ч на 9070)
  P0: P1 6 Python FAILS (2-3 ч)

Следующая неделя:
  P1: V2 validators rollout (3-4 ч)
  P1: O1 OpenCL legacy (2-4 ч)
  P2: CTX3 HyDE (3.5 ч) — улучшит качество поиска
  P2: CTX5 context_pack (2 ч)

Месяц:
  P2: QdrantStore impl (4 ч) — активирует stage 2_work_local
  P3: AR agentic loop — после Phase B готов
  P3: GR graph (9 ч)
```

**Σ effort до полного closeout:** ~40-50 ч (с учётом P0+P1+P2). P3 на 100+ ч.

---

## 📝 Открытые вопросы (для обсуждения с Alex)

1. **Stage 2_work_local vs 1_home:** сейчас работаем на `1_home` (pgvector). Имплементировать QdrantStore для `2_work_local`? — или pgvector достаточно навсегда?
2. **bitsandbytes для Phase B:** нужно ли вообще, или bf16 на 24 GB VRAM 9070 хватит без 4bit quant?
3. **Backup стратегия:** что бекапить регулярно — БД, Qdrant, или весь `/home/alex/`?
4. **Late Chunking:** ждать когда транс 4.46+5.8 conflict разрулится, или второй venv делать?
5. **Continue vs Claude Code MCP:** оба нужны параллельно или одного достаточно?

---

*TASK создал: Кодо · 2026-05-13 после полного RAG bringup. Apex.*
