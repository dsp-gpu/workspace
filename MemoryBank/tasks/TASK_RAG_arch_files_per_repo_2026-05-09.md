# TASK_RAG_arch_files_per_repo — полные C2/C3/C4 файлы внутри 9 репо

> **Создан:** 2026-05-09 вечер · **Тип:** доработка `RAG_CLAUDE_C4` (та была минимальной — только inline блок в CLAUDE.md без отдельных архитектурных файлов)
> **Приоритет:** 🟠 P1 — улучшает контекст QLoRA + sparse retrieval
> **Effort:** ~3-4 ч · **Зависимости:** RAG_CLAUDE_C4 ✅ (inline блок), RAG_MAN ✅

---

## 🎯 Цель (что хотел Alex)

В `RAG_CLAUDE_C4` я ограничилась **placeholder'ом** в `<repo>/CLAUDE.md`:
```
- C2 Container: namespace из top key_classes (см. .rag/_RAG.md)
- C3 Component: key_classes в .rag/_RAG.md (top по test_params)
- C4 Code: ScopedHipEvent · ProfilingFacade · ROCmBackend
```

Этого мало. **Alex хочет:**
1. Создать **отдельные C2/C3/C4 файлы** внутри каждого репо в `<repo>/.rag/arch/`
2. Реальное содержимое — диаграммы / namespace tree / class relationships из БД
3. Прокинуть ссылки в `<repo>/.rag/_RAG.md` (поле `architecture_files`)
4. Добавить **теги для попадания в dataset** — новый шаблон в `collect_more_dataset.py`

---

## 📂 9 репо (8 C++ + 1 DSP мета)

| # | Репо | Тип | C4 семантика |
|---|------|-----|---|
| 1 | core | C++ infrastructure | namespace `drv_gpu_lib::` + Backend Bridge / RAII / Singleton |
| 2 | spectrum | C++ compute | namespace `fft_processor::` / `filters::` / `lch_farrow::` |
| 3 | stats | C++ compute | namespace `statistics::` |
| 4 | signal_generators | C++ compute | namespace `signal_gen::` + Factory |
| 5 | heterodyne | C++ compute | namespace `heterodyne::` |
| 6 | linalg | C++ compute | namespaces `vector_algebra::`, `capon::` |
| 7 | radar | C++ application | namespaces `range_angle::`, `fm_correlator::` |
| 8 | strategies | C++ strategy | `IPipelineStep` + `PipelineBuilder` |
| 9 | **DSP** | **Python meta** | **спец-шаблон**: 8 Python модулей (`dsp_core`, `dsp_spectrum`, ...) как обёртки C++ через pybind11 |

> ⚠️ **DSP отличается** — у него нет своих C++ классов, есть Python integration layer.
> Включаем чтобы дать модели cross-language context.
>
> **workspace/MemoryBank** — НЕ включаем как отдельный репо: общий C4 уже живёт
> в `MemoryBank/.architecture/DSP-GPU_Design_C4_Full.md`.

---

## 📐 Структура файлов (на каждый репо)

```
<repo>/
├── .rag/
│   ├── _RAG.md                    ← поле architecture_files: [C2.md, C3.md, C4.md]
│   └── arch/                      ← НОВАЯ директория
│       ├── C2_container.md        ← namespace tree, public modules, dependencies
│       ├── C3_component.md        ← key classes + взаимосвязи (interfaces, наследование)
│       └── C4_code.md             ← реальные классы с ролями + паттерны GoF
```

### C++ репо (8 шт): шаблон содержимого

**`C2_container.md`** (~30-50 строк):
- YAML frontmatter с tags для RAG (`#level:c2 #repo:X`)
- **Namespace tree:** `drv_gpu_lib::backends::ROCmBackend`, `drv_gpu_lib::services::profiling::ProfilingFacade`, ...
- **Public modules:** `include/<repo>/{backends, common, config, ...}`
- **Dependencies (depends_on):** какие другие репо использует (`core` для всех)
- **Used by:** какие репо его используют (берём из `repo_metadata.json`)

**`C3_component.md`** (~50-100 строк):
- YAML frontmatter с tags (`#level:c3 #repo:X`)
- **Key classes** (top-10 по `test_params_rows`): класс + brief + методы (top-5)
- **Interfaces:** `IBackend`, `IGpuOperation`, `IPipelineStep` — наследники
- **Cross-class relationships:** через `rag_dsp.deps` (если G1 graph DONE) или ручная разметка

**`C4_code.md`** (~50-80 строк):
- YAML frontmatter с tags (`#level:c4 #repo:X`)
- **Реальные классы с ролями GoF/SOLID паттернов:**
  - `ScopedHipEvent` (RAII)
  - `ProfilingFacade` (Singleton + Facade)
  - `ROCmBackend` (Bridge)
  - и т.д.
- **HIP-ядра (если есть):** `kernels/rocm/*.hip` — список + назначение

### DSP мета-репо: спец-шаблон

**`C2_container.md`** для DSP:
- Python пакеты: `dsp_core`, `dsp_spectrum`, `dsp_stats`, ... (8 шт)
- Каждый — обёртка соответствующего C++ репо через pybind11
- Структура: `Python/<module>/`, `Doc/Modules/<module>/`, `Examples/<module>/`

**`C3_component.md`** для DSP:
- Кросс-репо integration: какие C++ классы экспортированы (из `pybind` симвоlов)
- Common utilities: `Python/common/`, `Python/integration/`, `Python/libs/`
- Test infrastructure: `DSP/Python/{module}/test_*.py` через `common.runner.TestRunner`

**`C4_code.md`** для DSP:
- Конкретные Python файлы: `dsp_<module>_module.cpp` (pybind), `py_<class>.hpp` (биндинги)
- Примеры: `Examples/<module>/*.py`
- Doc: `Doc/Python/<module>_api.md`

---

## 🏷️ RAG-теги в каждом arch-файле (для dataset)

```yaml
---
schema_version: 1
repo: spectrum
arch_level: c2  # или c3 / c4
tags:
  - "#level:c2"
  - "#repo:spectrum"
  - "#namespace:fft_processor"
  - "#layer:compute"
description: "C2 Container — namespace tree и зависимости spectrum."
---

# Container Diagram — spectrum

(содержимое markdown)
```

Эти YAML-frontmatter'ы **проиндексируются** в `rag_dsp.doc_blocks` (нужно расширить
indexer в Phase B+) И будут попадать в dataset через новый шаблон.

---

## 📋 Подэтапы

### 1. `generate_arch_files.py` (~1.5 ч)

Скрипт `c:/finetune-env/generate_arch_files.py`:

```python
def generate_for_repo(repo: str, dry_run: bool = False) -> dict:
    """
    1. Читает <repo>/.rag/_RAG.md → key_classes, modules
    2. Запрашивает rag_dsp.symbols → namespaces, методы, наследование
    3. Заполняет 3 шаблона (C2/C3/C4) c YAML-frontmatter тегами
    4. Записывает в <repo>/.rag/arch/{C2,C3,C4}.md
    5. Обновляет <repo>/.rag/_RAG.md → architecture_files: [...]
    """
```

CLI:
```
python generate_arch_files.py --repo core --dry-run
python generate_arch_files.py --all
python generate_arch_files.py --repo DSP --special  # для DSP мета-репо
```

### 2. Обновить `<repo>/.rag/_RAG.md` поле `architecture_files` (~15 мин)

```yaml
architecture_files:
  - .rag/arch/C2_container.md
  - .rag/arch/C3_component.md
  - .rag/arch/C4_code.md
```

### 3. Новый шаблон в `collect_more_dataset.py` (~30 мин)

`collect_arch_levels()` — для каждого arch-файла:
- instruction: «Опиши <C2 Container | C3 Component | C4 Code> для репо <X>»
- input: YAML frontmatter (repo, arch_level, tags)
- output: содержимое markdown части файла

**Прирост:** 9 репо × 3 уровня = **27 пар** уникального architecture-контекста.

### 4. Прогон + ручной аудит (~30 мин)

Для каждого репо проверить:
- Файлы созданы (3/3)
- YAML frontmatter валиден
- Нет TODO / placeholder'ов в C2/C3/C4
- DSP спец-шаблон применился

### 5. Ингест в БД (опц. ~30 мин)

`dsp-asst index extras --repo X --rag-arch` — добавить arch-файлы как `doc_blocks`
(concept='arch_c2'/'arch_c3'/'arch_c4') в `rag_dsp.doc_blocks` чтобы они попали
в hybrid retrieval. Можно сделать в Phase B+ если время.

---

## ✅ DoD

- [ ] 9 × 3 = **27 файлов** созданы в `<repo>/.rag/arch/{C2,C3,C4}.md`
- [ ] Каждый файл содержит реальное содержимое (не placeholder), валидный YAML
- [ ] DSP мета-репо использует спец-шаблон (Python integration вместо C++ namespace)
- [ ] `<repo>/.rag/_RAG.md` поле `architecture_files: [...]` заполнено
- [ ] `collect_more_dataset.py` имеет шаблон `arch_levels` (27 пар в dataset)
- [ ] dataset_v3.jsonl pересобран — 27 новых уникальных пар
- [ ] (опц.) doc_blocks с concept='arch_*' проиндексированы в БД

---

## ⚠️ Не забыть

- **DSP мета-репо** не имеет `.rag/_RAG.md` (RAG_MAN пропустил его). Нужно либо
  сначала запустить generate_rag_manifest.py для DSP, либо использовать
  `Python/` структуру напрямую без _RAG.md.
- **G1 graph** (TASK_RAG_graph_extension) ещё не закрыт. Без него C3 cross-class
  relationships придётся писать **руками или эвристикой** (по include / parent_id).
- **`<repo>/.rag/arch/`** — новая директория. Убедиться что не конфликтует с другими
  скриптами (RAG_MAN читает только `_RAG.md`).

---

## Артефакты

| Файл | Что |
|------|-----|
| `c:/finetune-env/generate_arch_files.py` | НОВЫЙ — генератор C2/C3/C4 для 9 репо |
| `<repo>/.rag/arch/C2_container.md` × 9 | НОВЫЙ |
| `<repo>/.rag/arch/C3_component.md` × 9 | НОВЫЙ |
| `<repo>/.rag/arch/C4_code.md` × 9 | НОВЫЙ |
| `<repo>/.rag/_RAG.md` | UPDATE — поле `architecture_files` |
| `c:/finetune-env/collect_more_dataset.py` | UPDATE — `+collect_arch_levels()` |
| `c:/finetune-env/dataset_arch_levels.jsonl` | НОВЫЙ — 27 пар |

---

## Связано

- Источник: `RAG_CLAUDE_C4` (✅ inline minimum) + замечание Alex 9.05 вечер
- Полный C4 (читать как референс): `MemoryBank/.architecture/DSP-GPU_Design_C4_Full.md`
- Зависимость: `RAG_MAN ✅` (для C++ репо), но **DSP не имеет _RAG.md** — fallback на `Python/` структуру
- Phase B QLoRA: 27 пар architecture-контекста улучшит обучение модели на cross-level понимании

---

*Maintained by: Кодо main · 2026-05-09 вечер · TASK draft перед реализацией*
