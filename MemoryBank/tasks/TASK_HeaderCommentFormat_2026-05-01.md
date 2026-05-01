# TASK: Header Comment Format для local AI (RAG)

**Дата создания:** 2026-05-01
**Автор:** Кодо
**Статус:** 🔄 Phase D9 IN PROGRESS (2026-05-02) — tests/*.hpp шапки; после → Phase E
**План-источник:** [`MemoryBank/specs/Header_Comment_Format_Plan_2026-05-01.md`](../specs/Header_Comment_Format_Plan_2026-05-01.md)
**Связанный план:** [`MemoryBank/specs/LLM_and_RAG/00_Master_Plan_2026-04-30.md`](../specs/LLM_and_RAG/00_Master_Plan_2026-04-30.md)

---

## 🎯 Цель

Зафиксировать единый формат header-комментов **`human → doxygen → object`** для всех `.hpp` файлов 9 репо DSP-GPU, чтобы локальный AI-индексер `dsp-asst` мог:

- разделять «семантику» (для embedding) и «структуру» (для метаданных);
- надёжно строить JSON-сводки по промпту `001_index_class_summary.md`;
- давать точные RAG-ответы со ссылкой на `file_path:line_number`.

---

## 📋 Подфазы

### Phase A — Финализация формата ✅ DONE (2026-05-01)

**A1.** ✅ Все 5 вопросов утверждены Alex'ом:
- Q1 (язык): русский.
- Q2 (история): ровно 2 записи — `Создан: <дата>` + `Изменён: <дата>`.
- Q3 (.cpp): только смысловой блок + section dividers, без дублирования doxygen.
- Q4 (inline): не комментировать тривиальное; писать только когда код сам не объясняет *почему*.
- Q5 (раскатка): поэтапно по репо.

**A2.** ✅ Пути эталонов:
- `BufferSet<N>` → `core/include/core/services/buffer_set.hpp`
- `IGpuOperation` → `core/include/core/interface/i_gpu_operation.hpp`

**A3.** ✅ Спека обновлена, статус «утверждено Alex».

**Выход:** утверждённая спека `Header_Comment_Format_Plan_2026-05-01.md` ✅.

---

### Phase B — Эталоны на 4 классах в `core/` ✅ DONE (2026-05-01)

**B1.** `ScopedHipEvent` (`core/include/core/services/scoped_hip_event.hpp`) — RAII move-only.

**B2.** `ProfilingFacade` (`core/include/core/services/profiling/profiling_facade.hpp`) — singleton + async.

**B3.** `BufferSet<N>` (`core/include/core/services/buffer_set.hpp`) — template.

**B4.** `IGpuOperation` (`core/include/core/interface/i_gpu_operation.hpp`) — interface.

**Правило:** на каждом — формат из спеки, никаких отклонений. После B4 — Alex смотрит → одобряет / правит → финал = эталоны для всего проекта.

**Выход:** 4 файла переписаны, diff показан Alex.

---

### Phase C — Обновление инструкций ✅ DONE (2026-05-01)

`.claude/commands/comment.md` переписан под новый формат (workspace commit `b513f5a`).
`.claude/rules/14-cpp-style.md` — раздел будет добавлен отдельно (не блокирует Phase D/E).

### Phase C-old (план — для истории)

**C1.** Обновить `.claude/commands/comment.md`:
- зафиксировать трёхчастный формат для `.hpp` (сейчас там `//` без Doxygen);
- ссылка на спеку как «источник истины»;
- добавить пример из B-эталонов.

**C2.** Обновить `.claude/rules/14-cpp-style.md` — добавить раздел «Header comments» (3-4 строки + ссылка).

**C3.** Sync rules через `MemoryBank/sync_rules.py` (если правило менялось).

**Выход:** инструкции синхронизированы, новые комментарии в любом репо будут писаться по формату.

---

### Phase D — Раскатка на 8 репо ✅ DONE (2026-05-01)

Все публичные `.hpp` (без `tests/` и `python/`) в 8 модулях обработаны и запушены.

| # | Репо | Файлов | Commit |
|---|------|--------|--------|
| D1 | `core` (включая 4 эталона из B) | **69** | `b624522` |
| D2 | `spectrum` | **45** | `651d544` |
| D3 | `stats` | **14** | `6e58523` |
| D4 | `signal_generators` | **29** | `11c3441` |
| D5 | `heterodyne` | **5** | `de80184` |
| D6 | `linalg` | **16** | `f584712` |
| D7 | `radar` | **13** | `338fef8` |
| D8 | `strategies` | **23** | `3be3b1c` |
| | **ИТОГО** | **214** | |

Все 10 репо синхронизированы с GitHub (`origin/main`).

---

### Phase D9 — tests/*.hpp шапки (⏳ СЛЕДУЮЩИЙ СЕАНС 2026-05-02)

**Что:** добавить шапки `// ====` во все `tests/*.hpp` у которых их нет (~80 файлов в 8 репо).

**Сделано сегодня (partial):**
- `core/tests/all_test.hpp` — шапка добавлена ✅

**Осталось:**
| Репо | Файлов без шапки |
|------|-----------------|
| `core/tests/` | 8: `example_external_context_usage.hpp`, `single_gpu.hpp`, `test_compile_key.hpp`, `test_kernel_cache_service.hpp`, `test_profiling_conversions.hpp`, `test_quality_gates.hpp`, `test_services.hpp`, `test_storage_services.hpp` |
| `spectrum/tests/` | 19 файлов |
| `stats/tests/` | 8 файлов |
| `signal_generators/tests/` | 5 файлов |
| `heterodyne/tests/` | 6 файлов |
| `linalg/tests/` | 10 файлов |
| `radar/tests/` | 9 файлов |
| `strategies/tests/` | 15 файлов |

**Команда для проверки (bash):**
```bash
for f in core/tests/*.hpp spectrum/tests/*.hpp stats/tests/*.hpp signal_generators/tests/*.hpp heterodyne/tests/*.hpp linalg/tests/*.hpp radar/tests/*.hpp strategies/tests/*.hpp; do
  [ -f "$f" ] && first=$(head -5 "$f" | grep -c "// ===="); [ "$first" -eq "0" ] && echo "NO_HEADER: $f"
done
```

**Формат шапки** — из спеки + эталон `core/tests/test_profiling_facade.hpp`.
**После завершения** → коммит по каждому репо → затем Phase E (dsp-asst проверка).

---

### Phase D-old (план — для истории)

**Кол-во .hpp** — оценка, уточнить через `Glob` в начале каждого подэтапа.

**Правило:**
- один репо = один git commit;
- не трогаем `.cpp` (только если `.cpp` содержит публичный API без `.hpp` — редкий случай);
- НЕ меняем сам код, только комменты.

**Выход:** 9 репо с унифицированными шапками, готовы к индексации `dsp-asst`.

---

### Phase E — Проверка через indexer (≈ 1ч, на Windows)

**E1.** Запустить промпт `001_index_class_summary.md` на 4 эталонах из B → убедиться, что JSON корректен.

**E2.** Запустить на 5-10 случайных классах из D → проверить fail-rate.

**E3.** Если fail-rate > 10% — вернуться в Phase A (правка формата).

**Выход:** confirmed «формат пригоден для local AI», feedback в `MemoryBank/feedback/`.

---

## 🔗 Связи

- **Не блокирует:** Python tests migration (`TASK_python_migration_phase_*`).
- **Блокирует:** запуск `dsp-asst` Stage 1 (см. Master Plan §3) — если хотим хорошее качество retrieval с самого начала.
- **Парный апдейт:** после Phase D — обновить `module-doc-writer.md` агента: при сверке Full.md с кодом — теперь надёжный источник из шапок.

---

## 🚫 Не входит

- Python docstrings (отдельная спека, после Phase E).
- Doxyfile / HTML генерация (`doxygen-maintainer`).
- Сами Doc/Full.md / Quick.md (`module-doc-writer`).
- Изменения архитектуры или кода — **только комменты**.

---

## 📊 Оценка

| Фаза | Время | Платформа |
|------|-------|-----------|
| A | 1ч | Windows (обсуждение) |
| B | 2ч | Windows |
| C | 1ч | Windows |
| D | 8-12ч | Windows (поэтапно, можно за 2-3 сессии) |
| E | 1ч | Windows + Ollama Qwen3 8B |
| **Итого** | **13-17ч** | Windows |

GPU не требуется — это документация, не код.

---

## 🎬 Сейчас

Phase A ✅ DONE — спека утверждена Alex'ом по всем 5 вопросам.

**Следующий шаг:** Phase B — 4 эталона в `core/`:
1. `ScopedHipEvent` — `core/include/core/services/scoped_hip_event.hpp` (RAII move-only)
2. `ProfilingFacade` — `core/include/core/services/profiling/profiling_facade.hpp` (singleton + async)
3. `BufferSet<N>` — `core/include/core/services/buffer_set.hpp` (template)
4. `IGpuOperation` — `core/include/core/interface/i_gpu_operation.hpp` (interface)

Жду OK Alex на старт Phase B.
