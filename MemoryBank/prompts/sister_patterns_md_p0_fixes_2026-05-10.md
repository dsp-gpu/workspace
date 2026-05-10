# Сестрёнке: P0 правки в Patterns.md — статус после 10.05 вечер

> **От:** Кодо main #1 (старшая)
> **К:** сестрёнке #2
> **Контекст:** deep-reviewer (PASS-WITH-FIXES) выявил 2 critical в моей работе DS_PATTERNS_MD. Все закрыты. + добавлен 9-й репо (DSP).
> **Замена:** этот файл переписан 10.05 вечер — старая версия описывала состояние ДО фиксов.

---

## ✅ Что закрыто (Кодо main #1, 10.05 вечер)

### 1. DSP (9-й репо) — подключён по варианту A
- **`DSP/.rag/_RAG.md`** создан вручную (~110 строк YAML, 31 tag в `tags:`)
- **`DSP/Doc/Patterns.md`** — **26 entries** (Strategy 19 + Factory 4 + Template Method 1 + Composite 2)
- Brief'ы Python-классов автоматически из docstring'ов через 3-уровневый fallback (key_classes → DB → header)
- DSP/CLAUDE.md секции `## 🏷️ RAG теги` нет (DSP — мета-репо, не нужно)

### 2. Critical Fix #1 — 3 ложных Singleton удалены из core
deep-reviewer нашёл: `GPUManager`, `MemoryManager`, `ModuleRegistry` помечены как Singleton, но **нет `GetInstance()`** — они multi-instance per-GPU. Это именно тот тип галлюцинаций, который таск призван лечить.

- `patch_rag_tags.py` REMOVE_TAGS["core"] += 3
- `core/.rag/_RAG.md` -3 тега
- `core/Doc/Patterns.md` 27 → **24 entries**
- Сверка с каноном `.claude/rules/14-cpp-style.md` — оставлены только реальные Singleton'ы (ConsoleOutput, Logger, ServiceManager, ProfilingFacade, GPUConfig)

### 3. Critical Fix #2 — 8 `<repo>/CLAUDE.md` синхронизированы с `_RAG.md`
deep-reviewer нашёл: 4 файла CLAUDE.md (`core`, `spectrum`, `heterodyne`, `strategies`) в секции `## 🏷️ RAG теги` содержали **удалённые** теги + не содержали добавленные +62. Это значило что `collect_explicit_patterns.py` (DS_EXPLICIT_PATTERNS) при следующем прогоне втянет мусор.

- Новый скрипт **`C:/finetune-env/sync_claude_md_tags.py`** (idempotent, парсит CLAUDE.md regex'ом, не трогает другие секции)
- **+61 / -7** тегов поверх 8 файлов CLAUDE.md
- Теперь `_RAG.md tags` ↔ `CLAUDE.md ## 🏷️ RAG теги` синхронны 1-в-1

---

## 📊 Итоговое состояние всех 9 репо

| Репо | Patterns.md | _RAG.md tags | CLAUDE.md tags |
|------|------------:|-------------:|---------------:|
| core | **24** | ✅ 27 | ✅ 27 |
| spectrum | **12** | ✅ 17 | ✅ 17 |
| stats | **10** | ✅ 15 | ✅ 15 |
| signal_generators | **4** | ✅ 7 | ✅ 7 |
| heterodyne | **5** | ✅ 9 | ✅ 9 |
| linalg | **10** | ✅ 15 | ✅ 15 |
| radar | **10** | ✅ 14 | ✅ 14 |
| strategies | **11** | ✅ 16 | ✅ 16 |
| **DSP** (новое) | **26** | ✅ 31 | (нет секции — норм) |
| **Σ** | **112** | | |

---

## 🟡 P1 — что осталось (не блокирует, можно после твоего P0)

| # | Файл / класс | Что |
|---|--------------|-----|
| 1 | `spectrum/Doc/Patterns.md` `MagnitudeOp` | brief = «TODO: AI-fill» (реально нет doxygen в header'е) — Alex может вписать 1 строку |
| 2 | `core/Doc/Patterns.md` `AsyncServiceBase` | пустой brief (header fallback вернул '') — добавить «Template Method база async-сервисов с message queue + worker thread» |
| 3 | DSP/Doc/Patterns.md | если всплывут не размеченные паттерны (Adapter для Py*Processor / Composite другие) — дополнить tags в DSP/.rag/_RAG.md, перегенерить |

---

## 🚨 Что я НЕ трогала (твоё)

- ❌ Не запускала `collect_patterns_md.py` (если у тебя такой есть) — это твой collector для dataset_v4
- ❌ Не пересобирала `dataset_v3.jsonl` — это после твоего T1.1 + T2 + P0
- ❌ Не пушила ничего — Alex даст OK отдельной командой «запушим»

---

## 🔄 Что я подготовила к твоему финалу

После того как ты закроешь свои 3 трека (T1.1 + T2 + собственный P0) — нужно будет:

1. **Rebuild `dataset_v3.jsonl`** — твои новые SOURCES + мои 9 `<repo>/Doc/Patterns.md` × 112 entries автоматически попадают через `collect_doc_deep.py` (он подхватывает `Doc/*.md`)
2. **Snapshot v4** — `dataset_v4_2026-05-11.jsonl` (cap=30 как v3)
3. **Stratified split 90/10** через `prepare_phase_b.py`
4. **Smoke 2080 Ti на v4** — pipeline check

Это закрывает Шаги 1-4 родительского `TASK_DATASET_v4_cleanup_2026-05-10`.

---

## 📁 Файлы которые я изменила (handoff контекст)

**Скрипты (`C:/finetune-env/`):**
- `gen_patterns_drafts.py` — добавлен DSP в REPOS
- `patch_rag_tags.py` — REMOVE_TAGS["core"] += 3 ложных Singleton; NEW_TAGS["core"] без ModuleRegistry
- `sync_claude_md_tags.py` — **NEW**

**Репозитории:**
- `e:/DSP-GPU/DSP/.rag/_RAG.md` (NEW)
- `e:/DSP-GPU/DSP/Doc/Patterns.md` (NEW)
- `e:/DSP-GPU/<repo>/CLAUDE.md` × 8 (M, секция `## 🏷️ RAG теги` обновлена)
- `e:/DSP-GPU/core/.rag/_RAG.md` (M, -3 ложных Singleton)
- `e:/DSP-GPU/core/Doc/Patterns.md` (M, regenerate без 3 ложных Singleton)
- `e:/DSP-GPU/MemoryBank/tasks/TASK_RAG_dataset_patterns_md_2026-05-10.md` (NEW)
- `e:/DSP-GPU/MemoryBank/tasks/IN_PROGRESS.md` (M, строка DS_PATTERNS_MD)

**Commit-блоки готовы у Alex'a в чате — push после его OK.**

---

*От: Кодо main #1 (старшая) → к: сестре #2 · 10.05 вечер · после deep-review закрыто 2 critical + добавлен 9-й репо DSP*
