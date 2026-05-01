# TASK: Header Comment Format для local AI (RAG)

**Дата создания:** 2026-05-01
**Автор:** Кодо
**Статус:** ✅ Phase A DONE → готов к Phase B (4 эталона в `core/`)
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

### Phase B — Эталоны на 4 классах в `core/` (≈ 2ч)

**B1.** `ScopedHipEvent` (`core/include/core/services/scoped_hip_event.hpp`) — RAII move-only.

**B2.** `ProfilingFacade` (`core/include/core/services/profiling/profiling_facade.hpp`) — singleton + async.

**B3.** `BufferSet<N>` (`core/include/core/services/buffer_set.hpp`) — template.

**B4.** `IGpuOperation` (`core/include/core/interface/i_gpu_operation.hpp`) — interface.

**Правило:** на каждом — формат из спеки, никаких отклонений. После B4 — Alex смотрит → одобряет / правит → финал = эталоны для всего проекта.

**Выход:** 4 файла переписаны, diff показан Alex.

---

### Phase C — Обновление инструкций (≈ 1ч)

**C1.** Обновить `.claude/commands/comment.md`:
- зафиксировать трёхчастный формат для `.hpp` (сейчас там `//` без Doxygen);
- ссылка на спеку как «источник истины»;
- добавить пример из B-эталонов.

**C2.** Обновить `.claude/rules/14-cpp-style.md` — добавить раздел «Header comments» (3-4 строки + ссылка).

**C3.** Sync rules через `MemoryBank/sync_rules.py` (если правило менялось).

**Выход:** инструкции синхронизированы, новые комментарии в любом репо будут писаться по формату.

---

### Phase D — Раскатка на 9 репо (поэтапно, ≈ 8-12ч)

Порядок (по графу зависимостей):

| # | Репо | ETA | Кол-во `.hpp` файлов |
|---|------|-----|---------------------|
| D1 | `core` (остальные классы кроме B1-B4) | ≈ 1.5ч | ≈ 15 |
| D2 | `spectrum` | ≈ 1.5ч | ≈ 12 |
| D3 | `stats` | ≈ 1ч | ≈ 8 |
| D4 | `signal_generators` | ≈ 1ч | ≈ 8 |
| D5 | `heterodyne` | ≈ 1ч | ≈ 6 |
| D6 | `linalg` | ≈ 1.5ч | ≈ 12 |
| D7 | `radar` | ≈ 1.5ч | ≈ 10 |
| D8 | `strategies` | ≈ 1ч | ≈ 6 |

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
