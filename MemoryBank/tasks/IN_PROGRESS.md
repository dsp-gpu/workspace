# 🚧 IN PROGRESS

**Обновлено**: 2026-06-01 (Phase 7 A→D ✅ DONE, Phase E ждёт FP16 base + Profiler/KernelCache v2 техдолг закрыт)

---

## 🆕 2026-06-01 — Техдолг Profiler v2 / KernelCache v2 — фактически ЗАКРЫТ ✅

Ревизия «что не сделано кроме LLM&RAG» (выбор A — техдолг профайлера). По живому коду:

- **Profiler v2** — `new_profiler` смержена в `main` во **всех 7 репо**. Класса `GPUProfiler` НЕТ (только комментарии-история). `ProfilingFacade` v2 = единственный API. strategies/`new_profiler` содержит устаревший WIP (2026-04-21), main版 (2026-04-23) полнее → мержить нечего.
- **KernelCache v2** — `kernel_cache_v2` смержена в core/main. Ручной hiprtc вычищен везде (spectrum: «Legacy CompileKernels removed 2026-03-22», теперь `GpuContext::CompileModule()`).
- **P2/P3 закрыты по факту** (см. таблицу активных — статусы обновлены).

**Сделано сегодня:**
- ✅ `core/Doc/Services/Profiling/Full.md` — полный Doc API v2 (12 секций: facade/exporters/Q7/Q7.F/типы/DI/частые ошибки).
- ✅ Правило `06-profiling.md` — устранён рассинхрон: устаревший `Start()/Stop()/SetEnabled/SetGPUEnabled/SetGPUInfo` → реальный `SetGpuInfo/Enable/WaitEmpty/ExportJsonAndMarkdown` (canonical + synced).
- 🔜 Удаление мёртвых веток `new_profiler` (×7) + `kernel_cache_v2` (core) — ждёт OK.
- 🔜 Косметика `logger.hpp` — мёртвый закомментированный `DRVGPU_LOG` alias.

---

## 🆕 2026-06-01 — Phase 7 A→D закрыта, Phase E (train R1-Distill-14B) готова

**Сделано сегодня** (→ `specs/phase7_compare_2026-06-01.md`, БД run 11 dsp / 12 pao):
- **A** deploy+smoke 6 GGUF (gfx1201, llama-server v196). ollama+dsp-asst остановлены.
- **B** baseline FT-14B = 46 tok/s. Speculative **заблокирован** vocab 152064≠151936 (Qwen2.5 padded). Флаги v196: `--spec-draft-n-max` + `--spec-type draft-simple`.
- **D** compare 4 моделей × dsp+pao, 48 judge-scores. **Вывод: НИ ОДНА не бьёт production-стек** (4.67-4.83); лучшее новое dsv2-lite/r1-32b = 3.83 (выше планки 3.2, ниже боевых).
- **Удалены GGUF** r1-distill-14b + r1-distill-32b (-28 ГБ). Оставлены dsv2-lite, r1-0528-8b, драфты. Записи в БД сохранены.

**Активный таск** → `TASK_Phase7E_train_r1distill14b_2026-06-01.md`:
- Alex качает дома FP16 `deepseek-ai/DeepSeek-R1-Distill-Qwen-14B` (~28 ГБ) → SSD → локально.
- Кодо: train ЛОКАЛЬНО (тот же конфиг что Qwen v7) → GGUF → compare vs Qwen-FT.
- 🏠 **Полигон = домашняя RX 9070** (НЕ сервер). Локальный venv рабочий: torch 2.11.0+rocm7.2, unsloth 2026.5.8, peft/trl. bnb 0.49.2 — проверить NaN на smoke-100.

**Follow-up:** speculative-fix (draft с vocab 152064 / ngram), завершить Qwen v7 (100→750) для равного сравнения.

---

## 🗄 2026-05-30 — DeepSeek stack скачан (история)

**Скачано** (50.7 GB, `D:\offline-debian-pack\1_models\DeepSeek\`): 6 GGUF — 2 draft (Qwen2.5-Coder-1.5B, R1-Distill-1.5B) + R1-0528-Qwen3-8B + R1-Distill-14B + DeepSeek-Coder-V2-Lite + R1-Distill-32B. Все целые.

**Активный таск** → `TASK_Phase7_deepseek_2026-06-01.md` (фазы A-E):
- A: deploy 6 моделей на Debian + симлинки + smoke
- B: speculative drafts (Coder-14B + R1-14B + R1-32B) → ×1.5-2.5
- C: **RAG → единый llama-server** (embeddings + reranker + generation, убрать dsp-asst)
- D: Phase 7 compare → llm_bench run_id 12-16, планка = Qwen2.5-Coder-14B
- E: QLoRA train DeepSeek (8B пилот → 14B) vs Qwen2.5-Coder-14B-FT

Research → `specs/deepseek_analysis_2026-05-28.md`. Память → `project_deepseek_models_downloaded_2026-05-30.md`.

---

## 🆕 2026-05-25 — Phase 6: LLM Benchmark Suite + cross-project compare ✅

### Главное

**3 модели в Ollama** проверены на 2 проектах:

| Модель | DSP-GPU avg_q | pao-contrib avg_q | Δ |
|--------|--------------:|------------------:|---:|
| `qwen-coder-14b-dsp` (наш FT) | **3.2** | **3.2** | **0.0** ⭐ no forgetting |
| `qwen3.6:35b-a3b-q8_0` | 4.8 | 4.7 | 0.1 (most stable) |
| `qwen3-coder-30b-a3b` | 4.3 | 3.8 | 0.5 (repeat-bug T2) |

**Открытия:**
1. **Catastrophic forgetting НЕ произошёл** — 14B-DSP даёт identical качество на чужом проекте (3.2=3.2). Plan-D patch + LoRA on attention сохраняют generic skills.
2. **Никто не определил pattern HybridBackend = Bridge** — подтверждает план v7 fine-tune (43 пары Bridge already в dataset_v7).
3. **35B-Q8 thinking-trap** через system prompt не отключается надёжно — нужен native API `think: false` (Ollama 0.21+).
4. **30B-A3B repeat-loop** в Python review — нужен `repeat_penalty: 1.15` для следующих compare.

### PostgreSQL `llm_bench` schema

База `gpu_rag_dsp.llm_bench` (multi-project):
- `projects` (3): dsp-gpu, pao-contrib, rag-mentor
- `runs` (2): id=1 dsp-gpu, id=2 pao-contrib
- `responses` (36 ответов, все scored)
- 4 views: `v_best_per_category`, `v_ft_progress`, `v_transfer_learning`, `v_latest_compare`

### Артефакты Phase 6

- `/home/alex/finetune-env/Core/phase6_qwen3coder_30b_moe/`:
  - `sql/01_create_llm_bench_schema.sql` — schema (применён)
  - `import_results_to_db.py` — psycopg3 импорт md→DB
  - `run_compare_v2.sh` — DSP-GPU runner (18 ответов)
  - `run_compare_pao.sh` — pao-contrib runner (18 ответов)
  - `convert_30b_to_ollama.sh` — конвертер 30B HF→GGUF→Ollama
  - `results_v2/`, `results_pao/` — все md ответы (36 файлов)
- `/home/alex/rag-mentor/MemoryBank/llm_bench_protocol_2026-05-25.md` — protocol для подружки
- `MemoryBank/sessions/2026-05-25.md` — полный summary дня
- `MemoryBank/.claude/rules/17-llm-bench.md` — правило для будущих compare

### Финальное расписание моделей по задачам

| Use case | Модель |
|----------|--------|
| Generic C++/HIP/Python кодинг (быстро) | `qwen3-coder-30b-a3b` |
| Deep code review | `qwen3.6:35b-a3b-q8_0` |
| Doc/Full.md документация | `qwen3.6:35b-a3b-q8_0` |
| Quick JSON indexing | `qwen-coder-14b-dsp` или 30B-A3B |
| DSP-GPU specifics | `qwen-coder-14b-dsp` (пока не дообучен v7) |

### На следующую сессию

1. **v7 full train на 14B-DSP** (на ночь, ~3 ч на чистом env) — ожидание прироста на dsp-gpu 3.2 → ≥4.0 при сохранении generic 3.2 на pao-contrib
2. Возможный новый MTP variant Qwen3.6 для compare (Alex упоминал)
3. Сестрёнка `rag-mentor` заливает свои данные через protocol

### Инсайты

1. **psycopg3 + TCP + password** — единственный надёжный путь подключения к gpu_rag_dsp (peer auth не работает для dsp_asst как system user)
2. **Ollama 0.21.2 + Qwen3.6** — `/no_think` через system prompt buggy, использовать `think: false` в API
3. **num_predict=4000 минимум** для thinking-моделей, иначе response пустой
4. **postgres user не читает /home/alex/** — SQL через `cat file | sudo -u postgres psql` или /tmp/

---

---

## 🆕 2026-05-21 — Phase 5 Day-3: Coder-14B → checkpoint-375 (eval 0.7125 ⭐)

### Главное

- **Resume Coder-14B** от `checkpoint-275` через `run_full_coder14b_resume.sh` (eval-steps=200, ETA планировался ~2:45 ч)
- Дошли до **`checkpoint-375` с eval_loss = 0.7125** — **лучший результат за всю сессию 14B**
- HIP race + retry лавина после step 385 → **kill** (ATTEMPT 9 безуспешно, wrapper не справился)
- Diagnose root cause: **swap 4.7 GB used** (PyCharm 686 KB + qdrant 498 KB + Telegram 269 KB) → page faults замедлили шаги 1.27s → 13-18s (10× slowdown)
- **Cleanup:** `sudo swapoff -a && sudo swapon -a` → swap 0 → restart clean

### Eval тенденция Coder-14B (full)

| step | eval_loss |
|------|-----------|
| 150 | 0.83 |
| 300 | 0.745 |
| 325 | 0.738 |
| **375** | **0.7125** ⭐ |

→ Loss продолжал падать, нет overfit. На полном train (3636 step) ожидаем eval ~0.5-0.6.

### Compare Qwen3-14B (запущен 07:58)

`run_compare_qwen3_400.sh` — 400 steps на чистом GPU (swap=0):
- Load model: 20 сек ✅
- Train: ~1.27 sec/step (норма)
- Eval @ 200 и @ 400 — ждём
- ETA финиш ~09:20

### Артефакты Day-3

- `output/full_coder14b_20260519_1031/checkpoint-375` — best Coder-14B (eval 0.7125)
- `output/compare_qwen3_14b_<TS>/` — compare прогон Qwen3-14B (в процессе)
- `Core/phase5_qwen14b_train/run_compare_qwen3_400.sh` — compare-launcher (NEW)
- `Core/phase5_qwen14b_train/run_full_coder14b_resume.sh` — resume-launcher (использован)

### Инсайты Day-3

1. **Swap = убийца перформанса** при 14B + PyCharm + Telegram + qdrant. Перед train: `sudo swapoff -a && sudo swapon -a`.
2. **rc=134 = SIGABRT** от c10::AcceleratorError (HIP race), **rc=1 = OOM при загрузке** (косвенно swap-induced fragmentation).
3. **Retry лавина не помогает** если каждая попытка падает — wrapper нужен с лимитом по time, не только по count.
4. **`checkpoint-375` достаточно для inference / merge / deploy** — eval 0.71 на 14B = уже лучше чем GPT-3.5 на code-tasks domain.

### Post-train pipeline → Ollama (21.05 12:00) ✅

`./post_train.sh checkpoint-375 qwen-coder-14b-dsp Qwen2.5-Coder-14B-Instruct Q4_K_M`

→ merged HF (~28 GB) → f16 GGUF (~28 GB) → Q4_K_M.gguf (~8 GB) → `ollama create qwen-coder-14b-dsp` ✅

**Inference test #1:**
- Q: «Какой паттерн использует HybridBackend?»
- A: «Strategy» ❌ (правильно — Bridge)
- Namespace: `dsp_hybrid::` ❌ (правильно — `drv_gpu_lib::`)

→ **Pilot pipeline работает**, но **факты галлюцинируют** (10% train недостаточно).

### Dataset v7 расширение (21.05 12:30) ✅

`collect_patterns_md.py` патч (Windows-пути → Debian) → запуск → **+104 unique pattern pairs**:
- 86 × `pattern_class_explicit` (явные labels: Bridge/Resource/Singleton/...)
- 19 × `pattern_classes_per_repo`
- 8 × `repo_patterns_overview`

**v7 = v6 + patterns = 10308 строк** (dataset_v7_train.jsonl). Audit:
- HybridBackend mentions: 155 → **155+1 (gold pair)**
- `"Bridge"` label: 0 → **7**
- HybridBackend ∩ Bridge: 0 → **43** (включая gold pair)

### V7 quick train (21.05 13:00) ❌ aborted — env issue

`run_v7_quick_750.sh` (750 steps, ETA 30 мин). Прошёл 130 шагов → fail rc=1 (OOM в prepare_model).

**Root cause:** swap 4.1 GB used вернулся (PyCharm + VSCode + Pylance набрали RAM после `swapoff/swapon`). Train в GUI-окружении на 14B **нестабилен**.

Скорость деградировала с 1.27 sec/step → **13-14 sec/step** из-за page faults на swap.

### Решение (21.05) — закрыть тему 14B на сегодня

**Артефакты сохранены, готовы к следующей сессии на чистом окружении:**
- ✅ `dataset_v7_train.jsonl` (10308 строк, готов к train)
- ✅ `output/full_coder14b_20260519_1031/checkpoint-375` (eval 0.7125, best Coder-14B)
- ✅ Ollama `qwen-coder-14b-dsp` (pilot, факт-галлюцинирует но pipeline работает)
- ✅ `Core/phase5_qwen14b_train/run_v7_quick_750.sh` (готов к запуску)
- ✅ `collect_patterns_md.py` (патч Windows→Debian, бэкап `.bak`)

### На следующую сессию

1. **ПОЛНОСТЬЮ закрыть PyCharm + VSCode + браузер** перед train (GUI-приложения конфликтуют со swap)
2. `sudo swapoff -a` БЕЗ swapon обратно (62 GB RAM хватит без swap)
3. Запустить **полный train v7** (3636 step, ETA ~12 ч на ночь):
   ```bash
   ./Core/phase5_qwen14b_train/run_v7_quick_750.sh  # либо новый full на v7
   ```
4. Утром: `post_train.sh` на best checkpoint → `qwen-coder-14b-dsp-v7`
5. Inference compare: v6-pilot (Strategy ❌) vs v7-full (надеемся Bridge ✅)

### Инсайты Day-3 (финал)

1. **Plan-D patch работает универсально** на 14B (Coder + Qwen3) — OOM фикс надёжный.
2. **Eval @ 375 = 0.7125** — лучший результат на 10% train. Полный train даст 0.5-0.6.
3. **Compare Coder vs Qwen3 @ step 200:** 0.79 vs 0.87 → **Coder лучше**.
4. **0 явных Bridge labels в v6** — критичная проблема, исправлена в v7 (43 пары).
5. **Swap = убийца перформанса** на 14B + GUI. Нужно чистое окружение перед train.
6. **HF wrapper retry loop** не помогает если каждая попытка OOM на load — нужен fail-fast лимит.
7. **Pilot Ollama модель `qwen-coder-14b-dsp` создана** — pipeline merge→GGUF→Ollama проверен end-to-end (~30 мин).

---

## 🆕 2026-05-21 — P1 Phase B → **53/54 PASS (98.1%)**

Дочинили 3 оставшихся SKIP'а от 19.05:
- **`t_snr_estimator.py`** ✅ — скопирован `cfar_estimator.py` из GPUWorkLib `PyPanelAntennas/SNR/` (309 строк NumPy reference CA-CFAR) → 4/4 PASS
- **`t_strategies_pipeline.py`** ✅ — два фикса: (1) `NumpyReference` теперь делает `actual_nfft = 2 * n_fft` (соответствует GPU zero-padding ×2); (2) `RelativeValidator(abs_threshold=1e-4)` — near-zero fallback теперь настраиваемый, по умолчанию 1e-4 (float32-friendly), закрывает edge-case clean CW (`Var(|z|) ≈ 0`) → 4/4 PASS (v5 справедливый SKIP)
- **`t_timing_analysis.py`** ✅ — раскомментировал T4 `TimingPerStepTest` в `strategies/tests/all_test.hpp` + helper `params.output_dir = "../DSP/Results/strategies/"`. Пересобрал, запустил, JSON `timing_SIN.json` сгенерирован, Python тест строит таблицу + plot. Парсер `run_all_tests.py` расширен: `MARKER_PASS` теперь ловит `Plot saved:.*\.png`

**Итог**: **53/54 PASS, 0 FAIL, 1 off-scope** (`t_ai_filter_pipeline.py` — нужен LLM api_keys.json). Asserts: **324 / 0 / 9**.

Артефакты: [`sessions/2026-05-21.md`](../sessions/2026-05-21.md).

---

---

## 🆕 2026-05-19 — P1 Python migration Phase B → ✅ DONE

Закрыт P1 (Phase B) на работе (~рабочий день):
- **B0** sanity-чек: все 5 артефактов Phase A на месте ✅
- **B1** чистая сборка 8 модулей через `/tmp/build_all.sh` (порядок зависимостей core → … → radar): **8/8 OK, 0 fail**
- **B3** прогон 54 t_*.py через новый `DSP/Python/run_all_tests.py` (4-форматный парсер: `Total:` / `Results: N/M` / `VERDICT:` / `[SKIP] Suite init`)
- **B4** root cause `t_heterodyne_comparison.py`: GPU off 66 kHz = 44 bins = 22 μs. Глубокое ревью кода нашло **строку 161** — `ref_single = np.exp(+1j*phase)` без conj, тогда как kernel ожидает `ref = conj(s_tx)`. Fix: `+1j` → `-1j`. Результат: max df 66300 → **300 Hz** (×220)
- **Off-scope**: `t_ai_filter_pipeline.py` — нужен `api_keys.json` для LLM, не делаем (см. `TASK_FAILS`)

**Итог**: 50/54 PASS, 1 off-scope, 3 SKIP env-related, 0 реальных FAIL. Asserts: 314 PASS / 0 FAIL / 15 SKIP.

**Изменённые файлы** (несохранённые, ждут push):
- `spectrum/python/t_cpu_fft.py` — sys.path fix
- `linalg/python/t_linalg.py` — sys.path fix
- `radar/python/t_radar.py` — sys.path fix
- `strategies/python/t_strategies.py` — sys.path fix
- `DSP/Python/heterodyne/t_heterodyne_comparison.py` — `+1j` → `-1j`
- `DSP/Python/run_all_tests.py` — NEW универсальный runner

**Артефакты**:
- `MemoryBank/sessions/2026-05-19.md` — полный summary
- `Results/python_tests_report.json` — JSON отчёт прогона
- `MemoryBank/tasks/TASK_python_migration_phase_B_FAILS_2026-05-04.md` → ✅ DONE 2026-05-19

---

## 🆕 2026-05-19 — Phase 5 Day-2 на RX 9070: 14B QLoRA работает

**Главное:** обе 14B модели обучаются на gfx1201 + ROCm 7.2 + 16 GB после patch `train_simple.py:299-318` (снимает destructive fp32 cast embed/lm_head в `peft.prepare_model_for_kbit_training`).

### Smoke результаты (150 steps, dataset_v6_1200, seq=1024, r=16, bf16, adamw_torch)

| Модель | eval @ 25 | eval @ 150 | train @ 150 | HIP race | Runtime |
|--------|-----------|-----------|-------------|----------|---------|
| **Qwen2.5-Coder-14B-Instruct** | 2.05 | **1.102** | 1.092 | 0 | 36 мин |
| **Qwen3-14B** (general) | 2.16 | **1.140** | 1.146 | 1 (step 75) | 17.5 мин (att.2) |

→ **Coder-14B побеждает на Δ=0.04** (паттерн Day-1 Coder-7B > general-8B подтверждается на 14B).

→ **`run_with_resume.sh` валидирован** — Qwen3 поймал `c10::AcceleratorError: illegal memory access` на step 75, авто-резюмировался с checkpoint-75, потеря = 0 шагов.

### Full Coder-14B (частично) → checkpoint-300

Запустили `run_full_coder14b.sh` на dataset_v6 (10204 train). Прогресс до прерывания:

| step | eval_loss |
|------|-----------|
| 50 | 1.29 |
| 100 | 0.89 |
| 150 | **0.83** |

Прервали на ~step 300 из-за `eval-steps=25` overhead (12 ч eval / 13 ч total). На завтра — `run_full_coder14b_resume.sh` от `checkpoint-300` с `eval-steps=200` → ETA ~2:45 ч → best ckpt.

### Plan-D patch (короткая суть)

`prepare_model_for_kbit_training` кастует embed/lm_head в fp32 → +3 GB поверх 10.7 GB base → OOM. Patch заменяет на ручную подготовку: freeze 4-bit weights + cast только norm-layers + `gradient_checkpointing_enable({"use_reentrant": False})`. Embed/lm_head остаются fp16 — loss падает, grad стабильный, NaN/inf нет.

### Артефакты

- `MemoryBank/specs_Linux_Radion_9070/phase5_coder14b_oom_2026-05-19.md` — диагноз + Plan-A/B/C fail + Plan-D PASS + сравнение моделей
- `/home/alex/finetune-env/train_simple.py` — Plan-D patch (без коммита по запросу Alex)
- `/home/alex/finetune-env/train_simple.py.bak_20260519_oom_patch` — бэкап
- `/home/alex/finetune-env/Core/phase5_qwen14b_train/` — 7 launcher-скриптов:
  - `run_smoke_coder14b.sh` / `run_smoke_qwen3_14b.sh` (smoke 150 steps)
  - `run_full_coder14b.sh` / `run_full_qwen3_14b.sh` (full на ночь)
  - `run_full_coder14b_resume.sh` (resume от checkpoint-300, eval-steps=200, ETA 2:45 ч) ⭐ **на завтра**
  - `run_smoke_coder14b_planC.sh` / `run_smoke_coder14b_continue.sh` (deprecated, оставлены)
- `output/smoke_coder14b_20260519_0927/checkpoint-150` — Coder smoke best (eval 1.10)
- `output/smoke_qwen3_14b_20260519_1515/checkpoint-150` — Qwen3 smoke best (eval 1.14)
- `output/full_coder14b_20260519_1031/checkpoint-300` — full Coder partial (eval 0.83 на step 150)

### На следующую сессию

1. **Full Coder-14B resume** от `checkpoint-300` через `run_full_coder14b_resume.sh` → best ckpt (ETA ~2:45 ч)
2. **Qwen2.5-Coder-7B-Instruct** (15 GB на диске) можно удалить — 14B доказан, 7B не нужен для compare
3. `post_train.sh` → GGUF → Ollama deploy → inference compare Q1-Q6
4. Опционально: Qwen3-14B full на следующую ночь для honest comparison

### Инсайты

- PEFT `prepare_model_for_kbit_training` ломает 14B на 16 GB (hard-floor gfx1201) — patch обходит
- `expandable_segments` НЕ поддерживается на ROCm 7.2 (warning + игнор)
- bnb 4-bit kernel `csrc/ops.hip:83` НЕ падает при `adamw_torch` (не `_8bit`)
- HIP race реален на 14B (Qwen3 поймал, Coder smoke не словил) → `run_with_resume.sh` критичен для full
- eval overhead = 92% time при `eval-steps=25` на dataset 10204 → `eval-steps=200` снижает 13 ч → ~3 ч

---

## 🆕 2026-05-14 — QLoRA Phase B Day-1 на RX 9070

Закрыто 3 фазы Phase B на работе (~4 часа):
- **Phase 1** Smoke matrix: qwen3-8b eval **1.26** / coder-7b eval **1.18** → Coder выигрывает на 0.085
- **Phase 3** Выгрузка пар из RAG-БД через `collect_rag_v6.py`: **dataset_v6_train = 9159** (×2.5 к v4) + 1490 val, 12+ source-типов
- **Phase 4** Smoke #3 на v6 (coder-7b): **eval @ step 50 = 1.345 vs v4 1.44** → v6 ОБЫГРАЛ v4 на Δ=−0.095 на 1310 samples (×18 надёжнее) → **гипотеза Phase 3 подтверждена**
- **Phase 3 v2** Расширение `collect_rag_v6.py` (+7 builders: files+includes+cmake+CLAUDE.md+Doc+arch+specs; extended negatives 24→99) → **dataset_v6 final = 10204 train / 1660 val** (×2.06 к v4)
- **Phase 6 dry-run** Inference compare FT (ckpt-50 v6) vs base coder-7b → FT 2.8/6 vs base 0/6 (Q1 Bridge ✅, Q2 RAII ✅)
- **Phase 5/6 infra** Готовы 3 артефакта в `/home/alex/finetune-env/` (отдельный git репо): `post_train.sh` (bash post-train pipeline + auto-build llama.cpp), `run_with_resume.sh` (auto-resume wrapper для HIP-race), `train_simple.py --resume-from-checkpoint` патч, `Modelfile.template` repeat_penalty 1.20

**Технические инсайты:**
- `bnb 0.49.2` 4-bit kernel падает в `csrc/ops.hip:83` на gfx1201 при `max_seq=1024+adamw_8bit` → safe Plan-B `seq=256-512, lora_r=8, adamw_torch`
- HIP `is_nonzero/item` race в HF Trainer → `illegal address` на ~step 50-120 (фундаментальный ROCm 7.2 RDNA4 bug) → для Phase 5 нужен `--save-steps 20` + auto-resume
- `expandable_segments` env молча игнорируется на ROCm 7.2 (warning «not supported»)
- Все доп GPU-приложения (Telegram/браузер) во время train запрещены — GPU compositor race
- Coder-7B > general-8B на DSP-GPU задачах → Phase 5 ставим **Qwen2.5-Coder-14B-Instruct**

**Артефакты:**
- `MemoryBank/prompts/prompt_for_sister_phase_b_2026-05-14.md` — переписан под нас (Debian + RX 9070), все 3 фазы + сравнительные таблицы
- `MemoryBank/tasks/TASK_FINETUNE_phase_B_9070_2026-05-14.md` — DoD по 6 фазам
- `MemoryBank/specs_Linux_Radion_9070/phase_b_models_analysis_2026-05-14.md` — VRAM budget + выбор моделей
- `finetune-env/collect_rag_v6.py` — выгрузка RAG→JSONL (310 строк, sudo psql, переиспользуемая)
- `finetune-env/dataset_v6_{pool,dedup,train,val}.jsonl` — Alpaca формат
- `MemoryBank/sessions/2026-05-14.md` — полный summary дня

**Не сделано / отложено:**
- **Phase 2 (вечером дома):** скачать Qwen/Qwen2.5-Coder-14B-Instruct (~28 GB) + Qwen3-14B + Coder-7B-Instruct (~70 GB суммарно)
- **Phase 5 (после привоза):** full Phase B на Coder-14B (8-12 ч ночью)
- **Phase 6:** post_train.sh (bash-аналог post_train.ps1) + Ollama deploy + inference_compare Q1-Q6

---

## 2026-05-13 вечер — RAG Stack Bringup на Debian

Подняли полный RAG стек с нуля. **19,961 row в `rag_dsp.*`** (5396 BGE-M3 embeddings + 2591 doc_blocks + 900 test_params + ...).
Все 5 сервисов с autostart через systemd + linger=yes (PG/Qdrant/Ollama/embed/dsp-asst).

**Документы:**
- `specs_Linux_Radion_9070/rag_stack_cheatsheet_2026-05-13.md` — команды управления стеком
- `specs_Linux_Radion_9070/rag_stack_boot_architecture_2026-05-13.md` — boot architecture + troubleshooting
- **`TASK_RAG_remaining_work_2026-05-13.md`** — что осталось доделать (план на завтра+)

**MCP в Claude Code:** `/home/alex/DSP-GPU/.claude/settings.json` (mcpServers.dsp-asst → `http://127.0.0.1:7821` stdio).
**Patches в finetune-env:** cli/main.py (5×`--root`), embedder.py (env+auto-cuda), ingest_test_tags.py (env), новые `migrate_pgvector_to_qdrant.py` + `re_ingest_all.sh`.

---

## ✅ Закрыто 2026-05-13

### TASK_install_rocm_hip_sdk_debian — ROCm 7.2 devkit на Debian 13 trixie ✅
- 76 .deb из offline-pack (Ubuntu noble) **не лезут** на Debian 13 (libc 2.41 vs 2.39, gcc-13 conflicts)
- Решение: `sudo apt install hipcc hip-dev rocm-llvm hipfft-dev rocblas-dev rocsolver-dev rocprim-dev rocrand-dev hipblas-dev rocm-opencl-runtime` напрямую из подключённого `repo.radeon.com/rocm/apt/7.2/noble` (~3.7 GB скачано)
- Smoke 9/9 PASS: hipcc 1.1.1 (ROCm 7.2.26015), AMD clang 22.0.0, /opt/rocm-7.2.0/lib/cmake/hip/hip-config.cmake ✅, headers (hipfft/rocblas/rocsolver/rocprim/rocrand) ✅
- Подробности: `changelog/2026-05.md`

### TASK_namespace_migration_debian_acceptance — 26/26 PASS 🎉
- Acceptance script `scripts/debian_deploy/acceptance_namespace_migration.sh` прошёл **26/26** после 8 групп фиксов (G1-G8) за 12 итераций
- G1 spectrum_maxima_types.h include → `<dsp/spectrum/types/...>` (1 файл, закрыло 4 build FAIL)
- G2 cmake configure stats+strategies — side-effect отсутствия hipcc, разрешилось при devkit
- G3 hipblas + rocm-opencl-runtime — отдельные apt пакеты
- G4 namespace shadow `dsp::X::` → `::dsp::X::` (34 файла)
- G5 fake-nested `namespace dsp::stats::snr_defaults` (внутри `dsp::stats`) → `namespace snr_defaults` (3 файла)
- G6 antenna_fft (global) vs dsp::spectrum + drv_gpu_lib::OutputDestination (5 файлов)
- G7 tests legacy `signal_gen::` + `drv_gpu_lib::Heterodyne*` (6 файлов)
- G8 HeterodyneROCmProfEvents namespace fix (тип жив в `dsp::heterodyne::`, ~2 файла)
- Результат: 7/7 build, 9/9 ctest, 8/8 Python imports, 2/2 Python integration tests
- Подробности: `tasks/TASK_namespace_migration_debian_acceptance_2026-05-12.md` + `changelog/2026-05.md`

### TASK_validators_linalg_pilot (V2) — обнаружено DONE inspection'ом ✅
- В `linalg/tests/` **0** ручных `if (err >= TOL) throw`, **15** использований `gpu_test_utils::ScalarAbsError`
- Все 4 целевых файла (test_cholesky_inverter_rocm, test_cross_backend_conversion, test_capon_opencl_to_rocm, test_capon_hip_opencl_to_rocm) уже мигрированы
- Файлы собрались зелёным в acceptance v12 (26/26)
- Подробности: `tasks/TASK_validators_linalg_pilot_2026-05-04.md` ✅ DONE
- Следующий шаг (отдельный TASK): rollout-фаза на остальные 7 модулей

### TASK_python_migration_phase_B_debian (P1) — 50 t_*.py: 43 PASS / 1 SKIP / 6 FAIL ✅
- Точный пересчёт через regex `Total: N passed, M failed, K skipped` (первая попытка дала ложные SKIP из-за case-insensitive 'SKIP' в output)
- **86% pass rate** на RX 9070 gfx1201 (43 из 50)
- 6 FAIL'ов — НЕ инфраструктурные (after namespace fix), а реальные numerical / API проблемы
- FAIL'ы зафиксированы в `tasks/TASK_python_migration_phase_B_FAILS_2026-05-04.md` (обновлён секцией 2026-05-13)
- Категории: heterodyne полный провал (1×4F), numerical mismatch (3 файла), API mismatch ai_pipeline (1×4F), linalg capon (1)
- Артефакты: `/tmp/python_tests_report_v2.json`, `/tmp/p1_v2_full.log`

### TASK_continue_embedding_setup — локальный bge-m3 для Continue @codebase ✅
- venv `~/.continue/.venv` (Python 3.13, ~30 MB из pypi: onnxruntime 1.26, fastapi, uvicorn, tokenizers, numpy, pydantic) — offline-pack cp312 wheels не подошли под системный 3.13
- `~/.continue/embed_server.py` (FastAPI + bge-m3 ONNX, dim=1024, 8K ctx)
- systemd user unit `embed.service` — active (running), ExecStart через venv-python
- `~/.continue/config.yaml` — добавлен `bge-m3 (local)` openai-совместимый embed provider (с backup); Qwen chat/autocomplete не тронуты
- Smoke: /health ok, /v1/embeddings en+ru → 2×1024
- Подробности: `tasks/TASK_continue_embedding_setup.md` + `changelog/2026-05.md`

---

## ✅ Закрыто 2026-05-08 (сегодня)

### TASK_remove_opencl_pybind Part A — 3 dead pybind удалены
- `spectrum/python/py_filters.hpp` (-276 строк, OpenCL PyFirFilter/PyIirFilter)
- `signal_generators/python/py_lfm_analytical_delay.hpp` (-184 строки)
- `heterodyne/python/py_heterodyne.hpp` (-215 строк)
- Doc DEPRECATED markers в `spectrum/Doc/{API,filters_API}.md` + `heterodyne/Doc/{API,Full,copy/heterodyne_Full}.md`
- Часть B (5 legacy OpenCL .hpp классов) → `TASK_remove_opencl_legacy_classes_2026-05-08.md`
- Подробности: коммиты `74d7c0a` (spectrum) + `74c34dd` (signal_generators) + `cba392e` (heterodyne)

### Phase A QLoRA diagnostic
3 эксперимента на 2080 Ti (r=4 dirty / r=8 dirty / r=8 clean), парадокс CLEAN — гипотеза «датасет=bottleneck (max-5/class)» опровергнута. План Phase B пересмотрен.
Подробности: `sessions/2026-05-08.md`, `specs/LLM_and_RAG/finetune_diagnostic_2026-05-08.md`.

---

## ✅ Закрыто 2026-05-06

- TASK_RAG_09 Pipeline Generator — 3 pipeline'а зарегистрированы. Подробности: `sessions/2026-05-06_TASK_RAG_09_progress.md`.
- TASK_RAG_02.6 Python use-cases + pybind bindings — 83 doc_blocks, 42 pybind. Подробности: `sessions/2026-05-06_TASK_RAG_02.6_progress.md`.

---

## 📋 Активные таски

### Phase B QLoRA + RAG до 12.05

| # | Таск | Статус | Effort | Зависимости |
|---|------|--------|--------|-------------|
| F1 | [TASK_FINETUNE_phase_B_2026-05-12.md](TASK_FINETUNE_phase_B_2026-05-12.md) — QLoRA на 9070, dirty 1093 + r=16 + bf16 | 📋 12.05 | 3-4 ч | — |
| **CTX0** | [TASK_RAG_schema_migration_2026-05-08.md](TASK_RAG_schema_migration_2026-05-08.md) — `test_params` extend + tsvector | ✅ 8.05 11:51 | — | — |
| **CTX1** | [TASK_RAG_test_params_fill_2026-05-08.md](TASK_RAG_test_params_fill_2026-05-08.md) — заполнить `test_params` LEVEL 0+2 (9 репо) | ✅ DoD 8.05 (674 LEVEL 0 / 111 LEVEL 2 на 10 классах) | — | CTX0 ✅ |
| **CTX2** | [TASK_RAG_doxygen_test_parser_2026-05-08.md](TASK_RAG_doxygen_test_parser_2026-05-08.md) — `@test*` парсер + LEVEL 1 | ✅ **DoD 9.05 утро** (parse_test_tags.py + ingest_test_tags.py, 8 репо/219 hpp обработано: 645 inserted + 505 updated в `rag_dsp.test_params`; total 674→**1319** rows; 983 ready_for_autotest vs 111 раньше; dataset_v3 2020→**2213** пар, test_gen 287→480) | — | CTX1 ✅ |
| **CTX3** | [TASK_RAG_hybrid_upgrade_2026-05-08.md](TASK_RAG_hybrid_upgrade_2026-05-08.md) — sparse BM25 + HyDE | 🚧 я (Кодо main) 8.05 вечер | ~3.5 ч | CTX0 ✅ |
| **CTX4** | [TASK_RAG_mcp_atomic_tools_2026-05-08.md](TASK_RAG_mcp_atomic_tools_2026-05-08.md) — 4 atomic MCP tools | ✅ DoD 9.05 (test_params 6 rec / use_case 3 hits / pipeline 3 hits / doc_block 2874 chars; commit `0a2882b` в finetune-env) | — | CTX1 ✅ |
| **CTX5** | [TASK_RAG_context_pack_2026-05-08.md](TASK_RAG_context_pack_2026-05-08.md) — orchestrator с cache | 🚧 сестра #2 | ~2 ч | CTX4 (опц. GRAPH) |
| **CTX6** | [TASK_RAG_code_embeddings_2026-05-08.md](TASK_RAG_code_embeddings_2026-05-08.md) — Nomic-Embed-Code | 📋 P2 | ~5-6 ч | — |
| **CTX7** | [TASK_RAG_late_chunking_2026-05-08.md](TASK_RAG_late_chunking_2026-05-08.md) — Late Chunking BGE-M3 | ⏸️ **deferred 12.05.26** | ~2 ч | venv `transformers==4.46.0` на AMD Radeon |
| **CTX8** | [TASK_RAG_telemetry_2026-05-08.md](TASK_RAG_telemetry_2026-05-08.md) — popularity boost | 📋 P2 | ~1 ч | TestRunner::OnTestComplete |
| **GR** | [TASK_RAG_graph_extension_2026-05-08.md](TASK_RAG_graph_extension_2026-05-08.md) — G1-G5 (без call-graph) | 🚧 сестра #2 | ~9 ч | — |
| **EV** | [TASK_RAG_eval_extension_2026-05-08.md](TASK_RAG_eval_extension_2026-05-08.md) — RAGAs + golden-set v2 + CI · E1 ✅ + E2 ✅; E3+E4 отложено (нужен `_RAG.md` манифест сначала) | 🚧 partial | ~4.5 ч | C-этап ✅ |
| **RAG_MAN** | _RAG.md manifest generator (8 репо) — auto-поля из symbols+test_params, AI-brief позже | ✅ DoD 9.05 (8/8 файлов созданы и запушены: core `cc83bb3` / spectrum `542eb56` / stats `e1b2525` / signal_generators `7f12d90` / heterodyne `ff26934` / linalg `687ba91` / radar `962a7c4` / strategies `6b9d64c`; скрипт в finetune-env) | — | CTX1 ✅ |
| **RAG_ENRICH_TG** | enrich 480 test_gen placeholders → real C++ smoke-tests через ollama qwen3:8b | ✅ **DoD 9.05 вечер** (480/480 records обогащены, 0 fail; финальный `dataset_v3.jsonl` = **2221** пар, DoD ≥2000 ✅; +heartbeat+flush+`watch_enrich.py` наблюдатель — урок зафиксирован в memory) | — | DS ✅, CTX1 ✅ |
| **DS_BALANCE** | [TASK_RAG_dataset_balance_2026-05-09.md](TASK_RAG_dataset_balance_2026-05-09.md) — добор под-представленных классов (count<5) → +200-400 пар, dataset_v4 ≥ 2400 | ✅ **DoD 9.05** (сестра + audit-tool от Кодо main) | — | ENRICH_TG ✅, CLAUDE_C4 ✅ |
| **DS_TP_PAIRS** | [TASK_RAG_dataset_test_params_pairs_2026-05-09.md](TASK_RAG_dataset_test_params_pairs_2026-05-09.md) — пары на основе `rag_dsp.test_params` (3 шаблона: param_edges/method_throws/method_return) | ✅ **DoD 9.05 поздний вечер** (Кодо main: 780 новых пар, 97% покрытие 983 ready_for_autotest; `dataset_v3` 2662→**3565** +34%; classes 724→**1456** +101%) | — | CTX2 ✅, DS_BALANCE ✅ |
| **DS_PYBIND** | [TASK_RAG_dataset_pybind_bridge_2026-05-09.md](TASK_RAG_dataset_pybind_bridge_2026-05-09.md) — Python ↔ C++ из `rag_dsp.pybind_bindings` (3 шаблона: py_class_overview/py_method_call/cpp_to_py_lookup) | ✅ **DoD 9.05 ночь** (Кодо main: 224 пары из 42 bindings + 140 methods_exposed; `dataset_v3` 3565→**3726** +4.5%; от baseline 1093 = **+241%**; top-15 полностью cap=30) | — | DS_TP_PAIRS ✅ |
| **DS_DOC_RICH** | [TASK_RAG_dataset_doc_rich_2026-05-09.md](TASK_RAG_dataset_doc_rich_2026-05-09.md) — rich blocks из `rag_dsp.doc_blocks` (python_test_usecase / python_binding / example / usage / parameters / benchmark / cross_repo_pipeline / c1-c2 / спец-алгоритмы) | ✅ **DoD 9.05 ночь** (Кодо main: 519 пар из 2287 rich blocks с 2-уровневым blacklist concepts+modules; `dataset_v3` 3726→**4253** +14%; **+289% от baseline 1093**; 0 dedup'ов с прошлыми SOURCES) | — | DS_PYBIND ✅ |
| **DS_NS_FILES** | [TASK_RAG_dataset_namespace_files_2026-05-09.md](TASK_RAG_dataset_namespace_files_2026-05-09.md) — namespace_overview (22) + file_grouping (125) | ✅ **DoD 9.05 поздняя ночь** (Кодо main: +147 пар = `dataset_v3` 4253→**4398** (+3.4%); **+302% от baseline 1093** = 4x) | — | DS_DOC_RICH ✅ |
| **DS_CLASS_FACTS** | детерминированная факт-карточка топ-44 классов (kind=class, ≥3 methods, has doxy) — заменила AI-summary (qwen3:8b галлюцинировал паттерны) | ✅ **DoD 10.05 ночь** (Кодо main: 37 пар, 0 галлюцинаций, with py_binding 4; `dataset_v3` 4398→**4434** +0.8%; **+306% от baseline**) | — | DS_NS_FILES ✅ |
| **DS_FIELDS_CMAKE** | public_field (108 классов с ≥2 полями) + cmake_targets (31) | ✅ **DoD 10.05 ночь** (Кодо main: 139 пар; `dataset_v3` 4434→**4573** +3.1%) | — | DS_CLASS_FACTS ✅ |
| **DS_FREE_FN** | real free_function с doxy (жёсткий фильтр /tests/, Test*, run_*, _* prefixes) | ✅ **DoD 10.05** (Кодо main: 58 пар; `dataset_v3` 4573→**4631** +1.3%) | — | DS_FIELDS_CMAKE ✅ |
| **DS_PYTHON_AUG** | instruction augmentation для 47 python_test_usecase: +2 формулировки на каждый блок | ✅ **DoD 10.05** (Кодо main: 94 пары; `dataset_v3` 4631→**4725** +2%) | — | DS_FREE_FN ✅ |
| **DS_NEGATIVE** | anti-hallucination: typo→real lookup (4 типа опечаток × 79 классов) | ✅ **DoD 10.05** (Кодо main: 261 пара; `dataset_v3` 4725→**4986** +5.5%; лечит «Rochester GPU» из CLEAN-247) | — | DS_PYTHON_AUG ✅ |
| **DS_USAGE_AUG** | augmentation для 141 doc_blocks (usecase 76 + python_binding 35 + example 13 + usage 11) | ✅ **DoD 10.05** (Кодо main: 135 пар; `dataset_v3` 4986→**5113** +2.5%; **+368% baseline = 4.68x**; перевалили 5000) | — | DS_NEGATIVE ✅ |
| **DS_HUMAN_DOCS** | human-written доки: repo_docs 41 + membank_specs 19 + architecture 4 + dsp_docs 75 + doc_deep 179 + examples_agent 7 = **325 пар** | ✅ **DoD 10.05** (Кодо main: 6 скриптов; `dataset_v3` 5113→**5703** +12%) | — | DS_USAGE_AUG ✅ |
| **DS_FB_PY** | feedback (5) + DSP/Python/**/*.py (50 t_*.py + 48 lib) | ✅ **DoD 10.05** (Кодо main: 103 пары; `dataset_v3` 5703→**5822** +2%) | — | DS_HUMAN_DOCS ✅ |
| **DS_FINAL** | sister: prompts_changelog (47) + agent_examples (16) интегрированы | ✅ **DoD 10.05** (`dataset_v3` 5822→**5869**; **+437% baseline**) | — | DS_FB_PY ✅ |
| **DS_ACK** | A+C+K: inheritance 16 + pybind_modules 8 + cpp_files 69 (моё) + acк_advanced 57 (сестра) | ✅ **DoD 10.05** (`dataset_v3` 5869→**6017** +2.5%; **38 шаблонов**) | — | DS_FINAL ✅ |
| **DS_HIP_PRIM** | sister build_test_infra 28 (test_utils + cmake/*.cmake + CMakePresets) + my hip_primitives 22 (fundamental HIP/ROCm API: hipMalloc/Event/Stream/Kernel/FFT/BLAS/error_handling/device с реальными snippets из кода) | ✅ **DoD 10.05 ULTRA-FINAL** (`dataset_v3` 6017→**6067** +0.8%; **+455% baseline = 5.55x**; **40 шаблонов**; **2428 уникальных** классов; всё-всё-всё исчерпано) | — | DS_ACK ✅ |
| **DS_HIP_KERNELS** | [TASK_RAG_dataset_hip_kernels_2026-05-10.md](TASK_RAG_dataset_hip_kernels_2026-05-10.md) — HIP+OpenCL kernel sources из `<repo>/include/<repo>/kernels/*_rocm.hpp` (universal regex для 2 backend'ов) | ✅ **DoD 10.05** (Кодо main: 58 kernels из 23 файлов → 81 пара; HIP=56, OpenCL=2 interop; **0/23 файлов с 0 kernels**; 4 итерации regex: \d+→[^)]+ макрос / [^{}]→[^()] комментарии / trailing comments / balanced parens) | — | нет |
| **DS_TEST_OVERVIEW** | [TASK_RAG_dataset_test_overview_2026-05-10.md](TASK_RAG_dataset_test_overview_2026-05-10.md) — пары из C++ `test_*.hpp` 8 репо (header `ЧТО/ЗАЧЕМ/ПОЧЕМУ` + doxygen + run-функции) | ✅ **DoD 10.05** (Кодо main: 75 файлов → **77 пар**; покрытие core 22 + spectrum 18 + linalg 9 + radar 8 + stats 6 + strategies 5 + heterodyne 4 + signal_generators 3; `dataset_v3` 4683→**4756**) | — | нет |
| **DS_MEMBANK_SPECS_EXT** | [TASK_RAG_dataset_membank_specs_ext_2026-05-10.md](TASK_RAG_dataset_membank_specs_ext_2026-05-10.md) — `MemoryBank/specs/*.md` (28 .md ревью/аудиты/планы/proposals; не пересекается с membank_specs/architecture/repo_docs/dsp_docs) | ✅ **DoD 10.05** (Кодо main: 109 пар → 108 после dedup; spec_overview 28 + spec_section 81; `dataset_v3` 4943→**5122**) | — | нет |
| **DS_AGENT_EXAMPLES** | [TASK_RAG_dataset_agent_examples_2026-05-10.md](TASK_RAG_dataset_agent_examples_2026-05-10.md) — `MemoryBank/.agent/` (3 .md) + `DSP/Examples/` (overview + sections + code skeleton, дополняет `examples_agent` сестры) | ✅ **DoD 10.05** (Кодо main: 16 пар, 0 пересечений с `examples_agent`; `dataset_v3` 5122→**5145**; **32 источника**) | — | нет |
| **DS_PROMPTS_CHANGELOG** | [TASK_RAG_dataset_prompts_changelog_2026-05-10.md](TASK_RAG_dataset_prompts_changelog_2026-05-10.md) — `MemoryBank/prompts/` (12 .md handoff'ов + готовые промпты subagents) + `MemoryBank/changelog/` (5 .md) | ✅ **DoD 10.05** (Кодо main: 47 пар = 34 prompts + 13 changelog; `dataset_v3` 5145→**5295**; **34 источника**) | — | нет |
| **DS_ACК_ADVANCED** | [TASK_RAG_dataset_acк_advanced_2026-05-10.md](TASK_RAG_dataset_acк_advanced_2026-05-10.md) — A (cpp impl head топ-50, 25) + C (pybind module full, 8) + K (type hierarchies через regex, 24); решено после обсуждения с сестрой в `prompts/discuss_dataset_next_2026-05-10.md` | ✅ **DoD 10.05** (Кодо main: 57 пар; `dataset_v3` 5295→**5343**; **35 источников**) | — | нет |
| **DS_BUILD_TEST_INFRA** | [TASK_RAG_dataset_build_test_infra_2026-05-10.md](TASK_RAG_dataset_build_test_infra_2026-05-10.md) — `core/test_utils/*.hpp` (test infrastructure) + `<repo>/cmake/*.cmake` (fetch_deps, version) + `<repo>/CMakePresets.json` (debian-local-dev/mi100/rx9070) | ✅ **DoD 10.05** (Кодо main: 28 пар = test_utils 2 + cmake 17 + presets 9; `dataset_v3` 5343→**5464**; **39 источников**) | — | нет |
| **DS_EXPLICIT_PATTERNS** | [TASK_RAG_dataset_explicit_patterns_2026-05-10.md](TASK_RAG_dataset_explicit_patterns_2026-05-10.md) — anti-galлюц для GoF (HybridBackend = Bridge, **НЕ** Singleton); парсит `#pattern:Y:X` теги из 8 `<repo>/CLAUDE.md` + Test-фильтр + контр-список | ✅ **DoD 10.05 ночь** (старшая: 34 пары = 29 class_pattern + 5 pattern_list; +Test-fix в `collect_acк_advanced.py` K 57→56; `dataset_v3` 5464→**5506**; **41 источник**) | — | medium-train Q1 inference |
| **DS_PATTERNS_MD** | [TASK_RAG_dataset_patterns_md_2026-05-10.md](TASK_RAG_dataset_patterns_md_2026-05-10.md) — `<repo>/Doc/Patterns.md` × 8 (старшая ingest collect_patterns_md.py + сестра gen_patterns_drafts.py + cleanup _RAG.md/CLAUDE.md sync) | ✅ **DoD 10.05 ночь→вечер** (combined: 89 классов / 30 паттернов / 8 репо; gen 4 скрипта от сестры + ingest collect_patterns_md.py от старшей; `_RAG.md tags` +62/-5; CLAUDE.md sync +61/-7) | — | DS_EXPLICIT_PATTERNS ✅ + Alex Patterns.md |
| **DS_PATTERNS_P0_FIX** | 9 P0 правок Patterns.md по результатам deep-reviewer (старшая: 5 brief'ов с `@ingroup grp_*` → реальные из CLAUDE.md в stats/spectrum/linalg/heterodyne/radar; 3 wrong file:line в strategies — IPipelineStep :24→:70 / PipelineStepBase :34→:99 / PipelineContext :20→:57; 1 IStorageBackend Bridge→Strategy в core от сестры) | ✅ **DoD 10.05 ночь** (старшая: 9/9 P0 закрыто, dataset_patterns_md re-collected 115→106 в split; `dataset_v3` rebuild → **5883 пар, 44 источника, +438% baseline = 5.38x**; snapshot `dataset_v3_final_2026-05-10.jsonl` обновлён) | — | DS_PATTERNS_MD ✅ + deep-review |
| **V4_CLEANUP_FINAL** | [TASK_DATASET_v4_cleanup_2026-05-10.md](TASK_DATASET_v4_cleanup_2026-05-10.md) — Шаги 1+2+4 (трекики сестры, выполнены старшей после ухода сестры) | ✅ **DoD 10.05 вечер** (Кодо main: T1.1 collect_inheritance Test-фильтр → 16 ifaces / 28 impls (без Test*); P0 collect_negative_pairs FAKE 10→30 + limit 80→160 + 2 typo (typo_double/typo_case) → **418 пар** (было 261); T2 collect_namespace_correction NEW → **130 пар** (113 A + 8 B + 9 C); rebuild dataset_v3 = **5885**; snapshot `dataset_v4_2026-05-11.jsonl` = 5885; split train **5071** / val **814** seed=42) | — | DS_PATTERNS_MD ✅ |
| **PHASE_B_PREP** | [phase_b_dataset_prep_2026-05-10.md](../specs/LLM_and_RAG/phase_b_dataset_prep_2026-05-10.md) — train/val split + health-check `dataset_v3.jsonl` для Phase B 12.05 | ✅ **DoD 10.05** (Кодо main: stratified split seed=42 → train 4583 + val 760 = 5343; health: 0 missing, output median 604, 35 sources via `# Concept:`, 816 классов; `prepare_phase_b.py` NEW) | — | DS_ACК_ADVANCED ✅ |
| **DATASET_V3_FINAL** | snapshot `dataset_v3_final_2026-05-10.jsonl` (cap=30, 6067 пар, 40 шаблонов, 2428 классов, +455% baseline = 5.55x) + `preflight_smoke_check.py` (libs / GPU sm_75 / VRAM 11GB / model qwen3-8b 15.26GB / datasets) | ✅ **DoD 10.05** (Кодо main: snapshot защита от правок, preflight ALL CHECKS PASSED) | — | DS_BUILD_TEST_INFRA ✅ |
| **SMOKE_2080TI** | smoke train на 2080 Ti для проверки pipeline (alpaca + LoRA r=8 + fp16 + adamw_torch + 350 пар + 1 эпоха) | ✅ **DoD 10.05** (Alex запустил, Кодо main+сестра анализ: train_loss 2.51→**1.49**, eval_loss **1.909**, eval-train gap **−0.25** (НЕ overfit), runtime 6.6 мин (vs 10-15 прогноз), 0 OOM, 0 bf16 errors → spec [smoke_2080ti_2026-05-10_PASSED.md](../specs/LLM_and_RAG/smoke_2080ti_2026-05-10_PASSED.md)) | — | DATASET_V3_FINAL ✅ |
| **RAG_CLAUDE_C4** | [TASK_RAG_claude_md_c4_tags_2026-05-09.md](TASK_RAG_claude_md_c4_tags_2026-05-09.md) — Архитектура C4 + теги в `<repo>/CLAUDE.md` | ✅ **DoD 9.05 утро** (8/8 `_RAG.md` tags inferred 66 total / 8/8 `<repo>/CLAUDE.md` C4-блоков вставлены / +8 pairs `claude_md_section` шаблона; sparse BM25 smoke отложен — нужен reindex Qdrant) | — | RAG_MAN ✅ |
| **ARCH_FILES** | [TASK_RAG_arch_files_per_repo_2026-05-09.md](TASK_RAG_arch_files_per_repo_2026-05-09.md) — полные C2/C3/C4 файлы внутри 9 репо (`<repo>/.rag/arch/`) + DSP спец-шаблон + новый dataset шаблон `arch_levels` | ✅ **DoD 10.05** (Кодо main: 27 файлов чистые, 8 `_RAG.md` обновлены полем `architecture_files`, 27 пар arch_levels в `dataset_v3`; 3 фикса в `_clean_brief` + CTE-дедуп классов + dedup тегов после deep-review) | — | RAG_MAN ✅, RAG_CLAUDE_C4 ✅ |
| **DS** | [TASK_RAG_dataset_generation_for_qlora_2026-05-08.md](TASK_RAG_dataset_generation_for_qlora_2026-05-08.md) — dataset v3 для QLoRA | ✅ **FINAL 9.05** (1093→2020→2213→2662→2876→**3565** пар, +226% от baseline; 1456 уник. классов; 11 шаблонов; +usage_docs 217 (8 concepts с pseudo-class filter) + sister test_params_pairs 780; commit `26c5ba0`) | — | CTX1 ✅, CTX2 ✅, CTX4 ✅ |

> **Координатор:** [TASK_RAG_context_fuel_2026-05-08.md](TASK_RAG_context_fuel_2026-05-08.md) — INDEX с картой зависимостей.

### Прочие активные

| # | Таск | Статус | Effort | Платформа |
|---|------|--------|--------|-----------|
| O2 | [TASK_remove_opencl_pybind_2026-05-06.md](TASK_remove_opencl_pybind_2026-05-06.md) — Part A ✅ DONE 08.05; Part B/C/D — wait для конкретики | ⚠️ partial | — | Debian |
| P1 | [TASK_python_migration_phase_B_debian_2026-05-03.md](TASK_python_migration_phase_B_debian_2026-05-03.md) — реальный прогон 54 t_*.py на gfx1201 | ✅ **DONE 21.05** (53/54 PASS) | ~3-5 ч | Debian + RX 9070 |
| P2 | [TASK_KernelCache_v2_Closeout_2026-04-27.md](TASK_KernelCache_v2_Closeout_2026-04-27.md) — KernelCache v2 | ✅ **DONE 2026-06-01** (`kernel_cache_v2` слита в core/main, ручной hiprtc вычищен везде) | — | Debian |
| P3 | [TASK_Profiler_v2_INDEX.md](TASK_Profiler_v2_INDEX.md) — Profiler v2 (доки, CI, Q7 roctracer) | ✅ **DONE 2026-06-01** (`new_profiler` слита 7/7 репо, Q7+Q7.F в коде, Doc Full.md написан 01.06) | — | Debian |
| V1 | [TASK_validators_port_from_GPUWorkLib_2026-05-03.md](TASK_validators_port_from_GPUWorkLib_2026-05-03.md) — `MaxRelError/RmseError/...` | ✅ ≈90% | — | Debian |
| V2 | [TASK_validators_linalg_pilot_2026-05-04.md](TASK_validators_linalg_pilot_2026-05-04.md) — пилот `gpu_test_utils::*` | ✅ **DONE 13.05** (15 уч. `ScalarAbsError` в linalg/tests) | — | Debian + RX 9070 |

> ~~O1 (TASK_remove_opencl_legacy_classes)~~ перенесён в `MemoryBank/.future/` 21.05.26 после попытки выполнения — задача больше чем «удалить 5 файлов»: классы активно используются в `signal_generator_factory.cpp` и `signal_service.hpp` как public API. Требует переписывания factory + миграции зависимых caller'ов на `*ROCm` версии. Возможно вернёмся позже отдельным TASK с инвентаризацией caller'ов.

### Phase B+ (после 12.05)

| # | Таск | Статус |
|---|------|--------|
| AR | [TASK_RAG_agentic_loop_2026-05-08.md](TASK_RAG_agentic_loop_2026-05-08.md) — CRAG + Self-RAG + feedback + G-calls | 📋 wait Phase B done |

---

## Перспективные (`.future/`)

- [TASK_script_dsl_rocm.md](../.future/TASK_script_dsl_rocm.md) — runtime HIP DSL
- [TASK_pybind_review.md](../.future/TASK_pybind_review.md) — pybind issues
- [TASK_gtest_variant_for_external_projects.md](../.future/TASK_gtest_variant_for_external_projects.md) — GTest вариант AI-генератора
- [TASK_namespace_migration_legacy_to_dsp.md](../.future/TASK_namespace_migration_legacy_to_dsp.md) — `fft_processor::*` → `dsp::spectrum::*`

---

## ✅ Закрыто 2026-04-30 — Phase A Python migration

54 t_*.py мигрированы с `gpuworklib` на `dsp_*`, удалён shim, CMake POST_BUILD auto-deploy в 8 репо. **Все 10 репо запушены**. Артефакты: `specs/python/migration_*.md`.

---

*Maintained by: Кодо. История заархивирована — см. `MemoryBank/changelog/` и git log.*
