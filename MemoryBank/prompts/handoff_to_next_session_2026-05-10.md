# Handoff to next session — 2026-05-10 → 11.05

> **От:** Кодо main #1 (старшая) → **К:** следующей сессии Кодо main
> **Контекст:** сестра ушла (мало контекста), я подобрала её треки. Теперь я одна. Прочитай это **первым** перед `MASTER_INDEX.md`.

---

## 🎯 ГДЕ МЫ СЕЙЧАС (2026-05-10 вечер)

### Phase B QLoRA на RX 9070 — стартует 12.05.26 (через 2 дня)

**Готово полностью:**
- ✅ `dataset_v4_2026-05-11.jsonl` = **5885 пар** (cap=15, **+438% от baseline = 5.38x**)
- ✅ `dataset_v4_train.jsonl` = 5071, `dataset_v4_val.jsonl` = 814 (seed=42, ratio 13.8%)
- ✅ Все anti-galлюцинационные источники подключены
- ✅ Smoke 2080 Ti **PASSED** (10.05 утро): train_loss 2.51→1.49, eval_loss 1.909, gap −0.25 (НЕ overfit)

**Что осталось до Phase B 12.05:**
1. **Push** все commits (10-11 терминалов) — ждёт OK Alex'a
2. (Опц) Smoke 2080 Ti на v4 — pipeline check, 5-10 мин
3. Сам Phase B 12.05 — Alex запускает на RX 9070

---

## ⚠️ КРИТИЧНО — что я делала за день и что нельзя сломать

### 1. Patterns.md × 9 ✅
- 9 файлов в `<repo>/Doc/Patterns.md` (8 C++ + DSP)
- 112 entries из канонiчных `<repo>/.rag/_RAG.md tags:`
- Brief'ы из 3-уровневого fallback (key_classes → DB → header)
- Подхватываются автоматически `collect_doc_deep.py` (или `collect_patterns_md.py`) → попадают в dataset
- **Не перегенерировать без OK** — Alex ревьюшил core, OK дал

### 2. _RAG.md tags синхронизированы с CLAUDE.md ✅
- 8 файлов CLAUDE.md секция `## 🏷️ RAG теги` ↔ `_RAG.md tags:` 1-в-1
- Скрипт `C:/finetune-env/sync_claude_md_tags.py` — idempotent, можно перезапускать
- **Не править вручную** — повторный запуск sync синхронизирует автоматически

### 3. Сестрины 3 трека закрыты мной ✅
- `collect_inheritance.py` — Test-фильтры добавлены (`_is_test_path` + `_is_test_name`)
- `collect_negative_pairs.py` — FAKE_PREFIXES расширен 10→30, +2 typo (`typo_double`/`typo_case`), limit 80→160
- `collect_namespace_correction.py` — **NEW**, 3 типа пар (A legacy_to_canonical / B repo_to_namespace / C wrong_namespace_correction)

### 4. Critical Fixes от deep-reviewer ✅
- 3 ложных Singleton удалены из core (`GPUManager`, `MemoryManager`, `ModuleRegistry` — у них нет `GetInstance()`)
- 8 CLAUDE.md синхронизированы с _RAG.md (раньше были рассинхрон)
- Если deep-reviewer ещё нужен — отчёт уже отдан

---

## 🚨 ЧТО НЕ ДЕЛАТЬ

- ❌ **Не перегенерировать Patterns.md** без явного OK Alex'a (он принял текущую версию)
- ❌ **Не пушить** без триггерной фразы Alex'a («запушим всё» / «обнови репо») — см. правило `16-github-sync.md`
- ❌ **Не править CMake** без явного OK (`12-cmake-build.md`)
- ❌ **Не менять cap mid-clean** в `build_dataset_v3.py` (сейчас 15 — кто-то поменял с 30, не знаю кто)
- ❌ **Не трогать `dataset_v3_final_2026-05-10.jsonl`** — это snapshot 6067 пар от прошлой сессии Alex'a, защита от правок
- ❌ **Не запускать pytest** (`04-testing-python.md`)
- ❌ **Не писать в `.claude/worktrees/*/`** (`03-worktree-safety.md`)

---

## 📋 Готовые commit-блоки для push (когда Alex даст OK)

### Терминал 2 — finetune-env (Windows)

```bat
cd C:\finetune-env
git add gen_patterns_drafts.py analyze_patterns_coverage.py patch_rag_tags.py sync_claude_md_tags.py collect_inheritance.py collect_negative_pairs.py collect_namespace_correction.py build_dataset_v3.py dataset_v3.jsonl dataset_v4_2026-05-11.jsonl dataset_v4_train.jsonl dataset_v4_val.jsonl dataset_inheritance.jsonl dataset_negative_pairs.jsonl dataset_namespace_correction.jsonl
git commit -m "DS_PATTERNS_MD + V4_CLEANUP_FINAL: dataset_v4 = 5885 (+438% baseline = 5.38x); +T1.1/P0/T2 sister tracks closed by main"
git push origin main
```

### Терминал N — каждый из 9 саб-репо (по одному блоку)

**core** (особый — есть `Doc/Patterns.md` + `.rag/_RAG.md` + `CLAUDE.md`):
```bat
cd e:\DSP-GPU\core
git add Doc/Patterns.md .rag/_RAG.md CLAUDE.md
git commit -m "DS_PATTERNS_MD: Doc/Patterns.md (24 entries) + _RAG.md tags +20/-1+REMOVE 3 false Singleton + CLAUDE.md sync"
git push origin main
```

**spectrum/stats/signal_generators/heterodyne/linalg/radar/strategies** (по тому же шаблону):
```bat
cd e:\DSP-GPU\<repo>
git add Doc/Patterns.md .rag/_RAG.md CLAUDE.md
git commit -m "DS_PATTERNS_MD: Doc/Patterns.md (N entries) + _RAG.md tags + CLAUDE.md sync"
git push origin main
```

**DSP** (новое):
```bat
cd e:\DSP-GPU\DSP
git add Doc/Patterns.md .rag/_RAG.md
git commit -m "DS_PATTERNS_MD: NEW DSP/.rag/_RAG.md + Doc/Patterns.md (26 entries: Strategy 19 + Factory 4 + TM 1 + Composite 2)"
git push origin main
```

### Терминал 1 — workspace

```bat
cd e:\DSP-GPU
git add MemoryBank/tasks/TASK_RAG_dataset_patterns_md_2026-05-10.md MemoryBank/tasks/IN_PROGRESS.md MemoryBank/sessions/2026-05-10.md MemoryBank/prompts/sister_patterns_md_p0_fixes_2026-05-10.md MemoryBank/prompts/handoff_to_next_session_2026-05-10.md
git commit -m "DS_PATTERNS_MD + V4_CLEANUP DoD: TASK file + IN_PROGRESS + session log + handoff"
git push origin main
```

**Итого: 11 commit'ов** (1 finetune-env + 9 саб-репо + 1 workspace).

---

## 🗺️ Карта файлов по теме (если что-то нужно найти)

```
e:/DSP-GPU/
├── MemoryBank/
│   ├── tasks/
│   │   ├── IN_PROGRESS.md                     ← статус всех тасков
│   │   ├── TASK_DATASET_v4_cleanup_2026-05-10.md  ← родительский P0 таск
│   │   └── TASK_RAG_dataset_patterns_md_2026-05-10.md ← мой подтаск
│   ├── sessions/2026-05-10.md                 ← подробный лог дня
│   ├── prompts/
│   │   ├── handoff_to_next_session_2026-05-10.md  ← ЭТОТ ФАЙЛ
│   │   ├── sister_patterns_md_p0_fixes_2026-05-10.md
│   │   ├── sister_inheritance_test_filter_2026-05-10.md
│   │   └── sister_namespace_correction_2026-05-10.md
│   └── specs/LLM_and_RAG/
│       └── smoke_2080ti_2026-05-10_PASSED.md  ← root-cause анализ smoke 2080 Ti
└── <repo>/
    ├── .rag/_RAG.md                            ← canonical tags + key_classes
    ├── Doc/Patterns.md                         ← мой draft (10.05 вечер)
    └── CLAUDE.md                               ← секция `## 🏷️ RAG теги` синхронизирована

C:/finetune-env/  (отдельный git-репо!)
├── gen_patterns_drafts.py        # генератор Patterns.md
├── analyze_patterns_coverage.py  # gap анализ tags vs БД
├── patch_rag_tags.py             # patcher _RAG.md (idempotent)
├── sync_claude_md_tags.py        # sync CLAUDE.md ↔ _RAG.md
├── collect_inheritance.py        # T1.1 (Test-фильтр)
├── collect_negative_pairs.py     # P0 (418 пар)
├── collect_namespace_correction.py # T2 (130 пар)
├── build_dataset_v3.py           # +namespace_correction в SOURCES
├── dataset_v3.jsonl              # 5885 пар (после rebuild)
├── dataset_v4_2026-05-11.jsonl   # snapshot
├── dataset_v4_train.jsonl        # 5071
└── dataset_v4_val.jsonl          # 814
```

---

## 🔧 Быстрые команды (если нужно перезапустить что-то)

```powershell
# Все скрипты требуют DSP_ASST_PG_PASSWORD = 1
$env:DSP_ASST_PG_PASSWORD = "1"

# Перегенерация Patterns.md из обновлённых _RAG.md tags
& "C:/finetune-env/.venv/Scripts/python.exe" "C:/finetune-env/gen_patterns_drafts.py"

# Перезапуск sister треков
& "C:/finetune-env/.venv/Scripts/python.exe" "C:/finetune-env/collect_inheritance.py"
& "C:/finetune-env/.venv/Scripts/python.exe" "C:/finetune-env/collect_negative_pairs.py"
& "C:/finetune-env/.venv/Scripts/python.exe" "C:/finetune-env/collect_namespace_correction.py"

# Rebuild dataset_v3 + snapshot v4 + split
& "C:/finetune-env/.venv/Scripts/python.exe" "C:/finetune-env/build_dataset_v3.py"
cp "C:/finetune-env/dataset_v3.jsonl" "C:/finetune-env/dataset_v4_2026-05-11.jsonl"
& "C:/finetune-env/.venv/Scripts/python.exe" "C:/finetune-env/prepare_phase_b.py" `
  --src "C:/finetune-env/dataset_v4_2026-05-11.jsonl" `
  --train-out "C:/finetune-env/dataset_v4_train.jsonl" `
  --val-out "C:/finetune-env/dataset_v4_val.jsonl"
```

---

## 📞 Для связи с Alex'ом

- Триггер «запушим всё» → выдать готовые commit-блоки выше (после переспроса)
- Триггер «покажи статус» → `MASTER_INDEX.md` + `IN_PROGRESS.md` + этот файл
- Триггер «что сделали сегодня?» → `MemoryBank/sessions/2026-05-10.md`
- Если что-то непонятно → **ОДИН** короткий вопрос с A/B/C

---

*Создано: 2026-05-10 вечер · Кодо main #1 (последняя сессия) → Кодо next.*
