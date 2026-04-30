# TASK: Pybind C++ review (perspective, заготовка)

**Создано**: 2026-04-30
**Статус**: 📌 perspective (заготовка — наполняется в Phase B 2026-05-03+)
**Триггер реактивации**: Phase B (Debian) выявил > 5 pybind issues, или критичный класс не работает на gfx1201

---

## 🎯 Зачем

После Phase B Python migration на Debian возможны находки:
- Какой-то pybind класс не экспортирует нужный метод
- Сигнатура отличается от документированной
- Класс падает на gfx1201 (RDNA4)
- Закомментированный `#include "py_*.hpp"` нужно расконсервировать

Этот файл — **сборник** таких находок. Если их **мало (1-2)** — фиксим точечно. Если **много (> 5)** — поднимаем в активный таск.

---

## 📝 Issues (заполняется в Phase B)

| # | Repo | Class/Method | Issue | Severity | Fix |
|---|------|--------------|-------|----------|-----|
|   |      |              |       |          |     |

(Шаблон строки: `1 | spectrum | FFTProcessorROCm | process_complex падает на N=...` etc.)

---

## 🔗 Связано

- Phase A migration: миграция тестов на новый pybind API → если тест падает не из-за миграции, а из-за самого pybind — сюда
- `MemoryBank/specs/python/migration_plan_2026-04-29.md` §«API Reference» (или `api_reference_2026-04-30.md` после выноса)
- `.future/TASK_script_dsl_rocm.md` — отдельная перспектива (ScriptGenerator runtime DSL)

---

## 🚦 Когда брать в работу

- ✅ Если в Phase B накоплено > 5 issues
- ✅ Если найден критичный класс который блокирует > 30% тестов
- ❌ НЕ брать «для полноты» — приоритет у Phase B running, не у pybind tweaking
