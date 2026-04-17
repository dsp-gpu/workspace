# 🚧 IN PROGRESS — GPUProfiler v2 Rewrite + Фаза 4: Linux GPU тестирование

**Последнее обновление**: 2026-04-17 (профайлер-таски)
**Готовность**: 8 репо собраны, готовы к миграции профайлера
**Координатор**: `workflow-coordinator` (при необходимости)

---

## 🆕 2026-04-17 — GPUProfiler v2 rewrite (НОВЫЙ поток)

**Спека**: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md`
**Ревью**: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16_REVIEW.md` (Round 3 — все закрыто)
**Индекс**: `MemoryBank/tasks/TASK_Profiler_v2_INDEX.md`

### Подробные таски (исполнитель — следующая сессия Кодо)

| Phase | TASK file | Status |
|-------|-----------|:------:|
| A | `TASK_Profiler_v2_PhaseA_BranchRemoveOpenCL.md` | ⬜ READY |
| B1 | `TASK_Profiler_v2_PhaseB1_ProfilingRecord.md` | ⬜ READY |
| B2 | `TASK_Profiler_v2_PhaseB2_ProfileStore.md` | ⬜ READY |
| B3 | `TASK_Profiler_v2_PhaseB3_ProfileAnalyzer.md` | ⬜ READY |
| B4 | `TASK_Profiler_v2_PhaseB4_ReportPrinter.md` | ⬜ READY |
| C | `TASK_Profiler_v2_PhaseC_Exporters.md` | ⬜ READY |
| D | `TASK_Profiler_v2_PhaseD_CrossRepo.md` | ⬜ READY |
| E | `TASK_Profiler_v2_PhaseE_Polish.md` | ⬜ READY |

**Effort**: 28-40 часов total | **Ветка**: `new_profiler` | **Radar**: исключён

### Начало работы
1. Прочитать `TASK_Profiler_v2_INDEX.md` (overview + ключевые решения)
2. Выполнить `TASK_Profiler_v2_PhaseA_BranchRemoveOpenCL.md` (2-3ч)
3. После каждой Phase — сообщить Alex + дождаться OK на push/tag

---

---

## ✅ Ночная сессия 2026-04-15 — огромный результат

**8 репо пересобраны, 21+ коммит, ~22500 строк мусора удалено**:

| Репо | Главное | Commits |
|------|---------|---------|
| **core** | ScopedHipEvent — generic RAII утилита | 1 |
| **spectrum** | 38 утечек закрыто + shim удалён + read-only helper | 4 |
| **stats** | CMake→spectrum (SNR_05 разблокирован) | 2 |
| **signal_generators** | compile error fix + ScopedHipEvent | 1 |
| **heterodyne** | 13 пар утечек + kernels в правильное место | 3 |
| **linalg** | Полная миграция AMD (-13953 строк) | 1 |
| **radar** | Полная миграция AMD (-3828 строк) | 2 |
| **strategies** | Миграция + A3c CreateWithFlags (-4599 строк) | 1 |
| **DSP** (meta) | stats→spectrum guard | 1 |
| **workspace** | CLAUDE.md + агенты + MemoryBank | 6 |

---

## 🎯 ЗАВТРА УТРОМ — сборка на Linux GPU

### Быстрый старт (копипаст в chat)
См. [prompts/2026-04-16_continue_core_spectrum.md](../prompts/2026-04-16_continue_core_spectrum.md)

### Ручная команда
```bash
cd /home/alex/DSP-GPU
for repo in core spectrum stats signal_generators heterodyne linalg radar strategies; do
  cd $repo
  cmake -S . -B build --preset debian-local-dev
  cmake --build build --parallel 32 2>&1 | tee /tmp/${repo}_build.log
  (cd build && ctest --output-on-failure 2>&1 | tee /tmp/${repo}_tests.log)
  cd ..
done
```

---

## 📋 Что проверить завтра (по приоритету)

### 🔴 Критично
1. **core** — собирается чисто? (generic)
2. **spectrum** — 4 файла с ScopedHipEvent собираются? `MakeROCmDataFromEvents` больше не destroy
3. **stats** — build с spectrum работает? SNR_05 линкуется?
4. **radar** — самая большая миграция, может всплыть missed #include
5. **strategies** — A3c (sync events с `ScopedHipEvent.get()` в `hipStreamWaitEvent`)

### 🟠 Важно
6. **signal_generators** — compile error fixed? (`&ev_k_s` → `ev_k_s.Create()`)
7. **heterodyne** — 13 пар событий корректно работают
8. **linalg** — после WIP-миграции сестрёнки, сборка чистая?

### 🟡 Проверки утечек
9. `rocm-smi`: hipEvent_t не накапливаются после 1000 прогонов профилируемых методов
10. Smoke SNR в stats — `ComputeSnrDb` возвращает разумные значения

---

## 📝 Git tags (после OK Alex)

```bash
# v0.2.0 — ночная сессия миграции
for repo in core spectrum stats signal_generators heterodyne linalg radar strategies; do
  cd /home/alex/DSP-GPU/$repo
  git tag -a v0.2.0 -m "Ночная сессия 2026-04-15: AMD-стандарт + ScopedHipEvent RAII"
  # git push --tags — ТОЛЬКО после явного OK Alex!
  cd ..
done
```

---

## ⏸ Отложенные задачи (не блокируют завтра)

| # | Задача | Почему отложено |
|---|--------|-----------------|
| 1 | `linalg/tests/` — ScopedHipEvent в 3 файлах | Кастомные паттерны (`t_start`, `EventGuard8`) |
| 2 | Глубокое ревью core (backends/, services/, logger/) | Сестрёнкины правки проверены, но core целиком не анализировался |
| 3 | Doxygen документация (8 репо) | Фаза 5, после успешной сборки |
| 4 | Git tag v0.2.0 | После OK Alex |

---

## 🔗 Сопутствующие документы

- [MASTER_INDEX.md](../MASTER_INDEX.md) — полная навигация
- [changelog/2026-04-15_*.md](../changelog/) — 3 файла подробностей
- [specs/*_2026-04-15.md](../specs/) — 4 ревью-файла
- [prompts/](../prompts/) — готовые промпты для новых сессий

---

*Created: 2026-04-14 | Updated: 2026-04-15 (night) | Maintained by: Кодо*
