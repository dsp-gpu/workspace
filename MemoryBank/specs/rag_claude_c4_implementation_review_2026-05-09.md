# Deep Review: реализация RAG_CLAUDE_C4 — 2026-05-09

> **Ревьюер:** Кодо main
> **TASK:** `MemoryBank/tasks/TASK_RAG_claude_md_c4_tags_2026-05-09.md`
> **Реализация:** `c:/finetune-env/{update_rag_tags_and_claude_md.py, collect_claude_md.py}`
> **Статус:** ✅ **PASS-WITH-NOTES** — 4/5 DoD выполнено, 1 пункт (sparse BM25 smoke) отложен.

---

## TL;DR

**Что сделано:**
- 8/8 `<repo>/.rag/_RAG.md` обновлены — поле `tags:` заполнено auto-inferred тегами (**66 total**).
- 8/8 `<repo>/CLAUDE.md` содержат C4-блок (вставлен ПЕРЕД `## 🔗 Правила`, idempotent через маркеры).
- 8 пар `claude_md_section` в `dataset_claude_md_section.jsonl` для расширения dataset_v3.

**Что отложено:** sparse BM25 smoke (требует reindex Qdrant — отдельная задача, не блокирующая).

## A. Алгоритм tag inference

| Категория | Источник | Пример |
|-----------|----------|--------|
| `#layer:<L>` | `LAYER_MAP[repo]` (hardcoded) | `#layer:infrastructure`, `#layer:strategy`, `#layer:application` |
| `#repo:<repo>` | имя | `#repo:core` |
| `#namespace:<NS>` | top-3 префиксов FQN из key_classes | `#namespace:drv_gpu_lib`, `#namespace:dsp::spectrum` |
| `#pattern:<Type>:<Class>` | regex на ClassName (max 8) | `#pattern:RAII:ScopedHipEvent`, `#pattern:Bridge:ROCmBackend` |

**Pattern regex (порядок важен):**
- `Scoped|Guard` → RAII
- `Facade` → Facade
- `Manager` → Singleton (heuristic, может ошибаться)
- `Backend` → Bridge
- `Strategy|Step` → Strategy
- `Factory|Builder` → Factory
- `Listener|Observer|Subscriber` → Observer
- `Buffer|Pool` → Resource
- `Processor|Pipeline` → Pipeline

## B. Результаты по 8 репо

| Repo | Tags | C4 inserted | Layer |
|------|-----:|:-----------:|-------|
| core | 11 | ✅ | infrastructure |
| spectrum | 10 | ✅ | compute |
| stats | 7 | ✅ | compute |
| signal_generators | 4 | ✅ | compute |
| heterodyne | 7 | ✅ | compute |
| linalg | 7 | ✅ | compute |
| radar | 7 | ✅ | application |
| strategies | 13 | ✅ | strategy |
| **Total** | **66** | **8/8** | |

## C. Idempotency

- ✅ `update_rag_tags_and_claude_md.py` — replace `tags: []` или multiline `tags: ...` через regex.
- ✅ CLAUDE.md inject — через маркеры `<!-- BEGIN/END: RAG_CLAUDE_C4 (auto) -->`. Повторный запуск **заменяет** блок, не дублирует.
- ✅ Anchor-strategy: блок ставится ПЕРЕД `## 🔗 Правила`. Если этого раздела нет — append в конец (graceful fallback).
- ✅ Сохранена структура файлов: `<repo>/CLAUDE.md` остаётся компактным (правило 10-modules.md).

## D. Ложно-позитивы pattern detection

| Класс | Detected | Реально | Severity |
|-------|----------|---------|---------:|
| `BatchManager` | Singleton | stateless utility | 🟡 minor (heuristic) |
| `MemoryManager` | Singleton | возможно Facade | 🟡 minor |
| `GPUManager` | Singleton | вероятно verified Singleton | 🟢 OK |

**Mitigation:** для критичных классов — ручная правка `<repo>/.rag/_RAG.md`. Для retrieval это не блокер: BM25 ищет по тегам как ключевым словам, ложно-Singleton-теги дают только лишние совпадения, не блокируют корректные.

## E. Жёсткие правила (соблюдены)

- ✅ `pytest` — не релевантно (Python script).
- ✅ CMake не трогала.
- ✅ Worktree: запись в `c:/finetune-env/` + `e:/DSP-GPU/<repo>/{CLAUDE.md, .rag/_RAG.md}`.
- ✅ git push не делала.
- ✅ Не плодила сущности: 1 update-скрипт + 1 collect-скрипт; no new dependency.
- ✅ Backup: idempotent через маркеры — повторный запуск перезаписывает безопасно.

## F. DoD-чек по TASK

- [x] `_RAG.md` поле `tags: [...]` заполнено для 8 репо — **66 тегов** ✅
- [x] `<repo>/CLAUDE.md` содержит блок «Архитектура C4 (компактно)» + «RAG теги» — **8/8** ✅
- [x] Каждый блок ≤ 15 строк — **~12 строк** (марker + 4 C4 + tags + space) ✅
- [ ] sparse BM25 smoke — `dsp_search("Singleton в core")` находит core в top-3 — **отложено** (нужен reindex `_RAG.md` в Qdrant + tsvector)
- [x] +8 пар `claude_md_section` шаблона в `dataset_claude_md_section.jsonl` — **8 pairs готовы** ✅

**Итого:** 4/5 DoD ✅. Sparse BM25 smoke не сделан в этой сессии — требует отдельной задачи: reindex `_RAG.md` doc_blocks с новым `tags` полем в Qdrant + обновление tsvector.

## G. Эффект на dataset_v3

`dataset_claude_md_section.jsonl` (8 pairs) добавлен в SOURCES `build_dataset_v3.py`. После
финального rebuild (когда RAG_ENRICH_TG закончит фоновый прогон) ожидаем dataset_v3:
- было: 2213 пар
- ожидается: ~2213 + 8 = ~2221 (8 новых пар, мин-clean не должен резать т.к. unique классы)

## H. Артефакты

| Файл | Что |
|------|-----|
| `c:/finetune-env/update_rag_tags_and_claude_md.py` | NEW · ~250 строк, infer_tags + update _RAG.md + inject CLAUDE.md |
| `c:/finetune-env/collect_claude_md.py` | NEW · ~80 строк, claude_md_section шаблон |
| `c:/finetune-env/dataset_claude_md_section.jsonl` | NEW · 8 пар |
| `c:/finetune-env/build_dataset_v3.py` | UPDATE · SOURCES +1 (claude_md_section) |
| `e:/DSP-GPU/{8 repo}/.rag/_RAG.md` | UPDATE · поле `tags:` |
| `e:/DSP-GPU/{8 repo}/CLAUDE.md` | UPDATE · добавлен C4-блок перед `## 🔗 Правила` |
| Этот review | NEW |

## I. Action items для следующих сессий (Phase B+)

| # | Action | Приоритет |
|---|--------|-----------|
| 1 | Sparse BM25 smoke: reindex `_RAG.md` doc_blocks с новым `tags` → smoke 3 запросов | 🟡 medium (Phase B+) |
| 2 | Ручная правка ложно-Singleton: BatchManager / MemoryManager → точный pattern | 🟢 low |
| 3 | Расширить LAYER_MAP при добавлении новых репо | 🟢 low |
| 4 | Добавить детектор `Listener|Subscriber|Observer` — сейчас в pattern есть, но не сработал ни разу | 🟢 info |

---

*Maintained by: Кодо main · 2026-05-09 утро · self-review реализации RAG_CLAUDE_C4*
