# Header Comment Format — план для local AI (RAG)

> **Дата:** 2026-05-01 · **Автор:** Кодо · **Статус:** ✅ утверждено Alex (Q1–Q5 закрыты), готово к Phase B
> **Связанные:** [`LLM_and_RAG/00_Master_Plan_2026-04-30.md`](LLM_and_RAG/00_Master_Plan_2026-04-30.md), [`LLM_and_RAG/prompts/001_index_class_summary.md`](LLM_and_RAG/prompts/001_index_class_summary.md)
> **Парный таск:** [`tasks/TASK_HeaderCommentFormat_2026-05-01.md`](../tasks/TASK_HeaderCommentFormat_2026-05-01.md)

---

## 1. Зачем

Локальный AI-ассистент `dsp-asst` (Master Plan, Stage 1) индексирует:

- классы / структуры / функции через **tree-sitter** + **clangd**;
- doxygen-блоки → метаданные (purpose, params, returns);
- свободный текст над объектом → **embedding для RAG retrieval**.

Сейчас в проекте 3 разных подхода к header-комментам:

1. `core/services/scoped_hip_event.hpp` — всё в одном `@file` блоке (human + doxygen смешаны).
2. `command_queue_pool.hpp` (эталон `comment.md`) — только `//` без Doxygen.
3. Новые файлы — без шапки вообще или только `@brief`.

Indexer'у трудно: где «семантика для embedding», а где «структура для метаданных»?

**Цель** — единый формат `human → doxygen → object` для всех публичных классов / методов / функций в `.hpp` файлах 9 репо.

---

## 2. Формат (предлагаемый)

### 2.1. Для класса/структуры в `.hpp`

```cpp
// ============================================================================
// [Имя] — [роль в одну строку]
//
// ЧТО:    [что делает, 1-3 строки человеческим языком]
// ЗАЧЕМ:  [какую проблему решает в pipeline ЦОС / GPU инфраструктуре]
// ПОЧЕМУ: [ключевые архитектурные решения — RAII / move-only / singleton /
//         per-GPU / async и т.д.]
//
// Использование:
//   [короткий пример вызова — 3-7 строк]
//
// История (опционально):
//   - YYYY-MM-DD: создан в {repo}
//   - YYYY-MM-DD: изменение API
// ============================================================================

/**
 * @class ClassName
 * @brief Одна строка — для @ref / для tooltip в IDE.
 *
 * @note Move-only / Thread-safe / Requires ENABLE_ROCM / ...
 * @see RelatedClass
 * @deprecated [если нужно — версия + замена]
 */
class ClassName {
    ...
};
```

### 2.2. Для метода в `.hpp`

```cpp
    // ЗАЧЕМ + ловушки для caller'а:
    // [ownership, порядок вызовов, единицы измерения, edge cases]

    /**
     * @brief Одна строка — что делает.
     * @param x  что это, допустимые значения
     * @return   что возвращает
     * @throws std::runtime_error если ...
     */
    ReturnType Method(Param x);
```

### 2.3. Для метода в `.cpp`

То же что в `.hpp` (если в `.hpp` уже есть doxygen — в `.cpp` не дублировать `@param`/`@return`, оставить только смысловой `//` блок над impl + section dividers `═════`).

### 2.4. Для свободной функции / namespace-утилиты

```cpp
// ЗАЧЕМ функция нужна + откуда вызывается + почему именно так

/**
 * @brief Что делает (одна строка).
 * @param ...
 * @return ...
 */
ReturnType free_function(...);
```

---

## 3. Эталоны (что выберем как «золотой стандарт»)

Кандидаты — реальные классы из core, представляющие 4 типа сущностей:

| # | Класс | Тип | Файл |
|---|-------|-----|------|
| 1 | `ScopedHipEvent` | RAII move-only | `core/include/core/services/scoped_hip_event.hpp` |
| 2 | `ProfilingFacade` | Singleton + async | `core/include/core/services/profiling/profiling_facade.hpp` |
| 3 | `BufferSet<N>` | Template | `core/include/core/services/buffer_set.hpp` |
| 4 | `IGpuOperation` | Interface | `core/include/core/interface/i_gpu_operation.hpp` |

После применения формата на этих 4 — Alex проверяет → формат финализируется → раскатываем на 9 репо.

---

## 4. Связь с `001_index_class_summary.md`

Промпт индексера ждёт от модели JSON с полями:
`name, namespace, kind, purpose, patterns, public_methods[], depends_on[], throws[], is_deprecated`.

Наш формат покрывает каждое поле:

| Поле JSON | Откуда берётся |
|-----------|---------------|
| `purpose` | строка «[Имя] — [роль]» в шапке |
| `patterns` | строка «ПОЧЕМУ:» (RAII / Singleton / Factory) |
| `public_methods[].doxygen` | `@brief` метода |
| `throws` | `@throws` тегов |
| `is_deprecated` | `@deprecated` тегов |
| `depends_on` | clangd, не комменты |

Embedding для RAG («что делает класс, зачем») — берётся из секции `// ЧТО / ЗАЧЕМ / ПОЧЕМУ` (между `═══` и Doxygen).

---

## 5. Что меняем в инфраструктуре

| Артефакт | Действие |
|----------|---------|
| `.claude/commands/comment.md` | обновить — зафиксировать трёхчастный формат для `.hpp`, ссылка на эту спеку |
| `.claude/rules/14-cpp-style.md` | добавить раздел «Header comments format» со ссылкой |
| `.claude/agents/module-doc-writer.md` | дополнить: при апдейте `Full.md` — сверять с шапками классов |
| Новый агент `header-commenter` | **НЕ создаём** — `comment.md` достаточно (правило: не плодить сущности) |
| Эталоны | 4 класса в `core/` — переписать первыми, по ним рассказывать модели в `001_index_class_summary.md` |

---

## 6. Открытые вопросы (для Alex)

1. **Язык шапки** — русский (как `scoped_hip_event.hpp`) или английский (для GitHub-видимости / совместимости с western Doxygen toolchain)?
   → ✅ **Alex: русский** (как в `OUTPUT_LANGUAGE = Russian` Doxyfile).

2. **История изменений** в шапке — оставлять (как сейчас в `scoped_hip_event.hpp:26-29`) или вынести в `git log` only?
   → ✅ **Alex: ровно 2 записи — создан + последняя редакция**. Без списка milestones, без промежуточных правок.
   → **Формат**:
   ```cpp
   // История:
   //   - Создан:    2026-04-14 (автор: Кодо)
   //   - Изменён:   2026-04-15 (перенос в core, namespace drv_gpu_lib)
   ```
   → **Правило**: при каждом изменении — обновляем строку «Изменён» (дата + одно предложение что поменяли). Промежуточные правки и опечатки — только `git log <file>`, в шапку не попадают.

3. **`.cpp` файлы** — дублировать doxygen или только `// смысловой` + section dividers?
   → ✅ **Alex: только смысловой** (doxygen один раз в `.hpp`).

4. **Inline-комменты в теле функций** — где ставить, где не надо?
   → **Правило**: комментировать только там, где код **сам не объясняет** *почему* именно так сделано — порядок, единицы, magic numbers, ловушки.

   ❌ **НЕ комментировать** (очевидно из кода):
   ```cpp
   int n = data.size();           // размер data  ← тривиально, шум
   for (int i = 0; i < n; ++i) {  // цикл по i    ← шум
       result[i] = data[i] * 2;   // умножаем на 2 ← шум
   }
   ```

   ✅ **Комментировать** (порядок / единицы / ловушки / магия):
   ```cpp
   // ROCm освобождаем ПЕРВЫМ — намеренный порядок!
   // ZeroCopyBridge импортирует cl_mem в HIP: если сначала разрушить OpenCL —
   // HIP получит dangling pointer → use-after-free в драйвере.
   rocm_->Cleanup();
   opencl_->Cleanup();

   // delay_us — МИКРОСЕКУНДЫ (не секунды!): API контракт со стороны Python.
   float tau_sec = delay_us * 1e-6f;

   // 256 threads/block — оптимум для warp=64 на RDNA4:
   // < 256 → idle threads, > 256 → register spill.
   constexpr int kBlockSize = 256;

   // hipfftExecC2C может бросить — события уже созданы выше через ScopedHipEvent,
   // RAII освободит при stack unwind. НЕ ставить голый hipEventDestroy.
   hipfftExecC2C(plan, in, out, HIPFFT_FORWARD);
   ```

   **Критерий «надо ли комментить»**: если убрать коммент — поймёт ли senior через 3 месяца **почему** так? Если да → не пишем. Если нет (порядок важен / единицы скрыты / ловушка с GPU драйвером) → пишем 1-3 строки.
   → ✅ **Alex: «не комментировать тривиальное — да»**.

5. **Раскатка** — сразу на все 9 репо или поэтапно (core → spectrum → остальные)?
   → ✅ **Alex: поэтапно** (чтобы корректировать формат по ходу).


---

## 7. Не входит в эту работу

- Изменение самого кода (не комменты).
- Doxyfile / Doxygen-генерация — это `doxygen-maintainer`.
- Markdown-доки `Doc/Full.md` / `Doc/Quick.md` — это `module-doc-writer`.
- Python docstrings — отдельный формат (Google-style?), сделаем отдельной спекой.

---

*Готово к обсуждению. После OK Alex — переносим в `tasks/TASK_HeaderCommentFormat_2026-05-01.md` (уже создан-черновик).*
