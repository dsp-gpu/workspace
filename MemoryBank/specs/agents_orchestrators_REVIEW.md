# Code Review: Агенты-оркестрастры DSP-GPU

**Дата**: 2026-04-14
**Автор**: Кодо (AI Assistant)
**Статус**: ✅ Все правки выполнены (17/17 проблем закрыто)

---

## 📋 Что было проверено

11 агентов из двух источников:

**User-level** (`~/.claude/agents/`) — были глобальными, **перенесены локально**:
- `module-writer`, `python-binder`, `module-tester`

**Project-level** (`/home/alex/DSP-GPU/.claude/agents/`):
- Write-агенты: `build-agent`, `fix-agent`, `test-agent`, `cmake-fixer`, `doc-agent`, `doxygen-maintainer`
- Read-only: `gpu-optimizer`, `module-auditor`, `module-doc-writer`, `benchmark-analyzer`, `repo-sync`
- Новый: `workflow-coordinator`

---

## 🔴 Критические проблемы — ВСЕ ЗАКРЫТЫ (4/4)

### 1. ❌→✅ `python-binder` нарушал запрет pytest
**Было**: `pytest Python_test/... -v` в шаблоне.
**Стало**: `python3 test_module.py` + exit code. Добавлены ссылки на эталоны в `/home/alex/C++/GPUWorkLib/Python_test/` как «отлаженные библиотеки».

### 2. ❌→✅ `cmake-fixer` без согласования с Alex
**Стало**: Огромный ASCII-бокс 🚨 в шапке + обязательный **Шаг 0: DIFF-preview → ждать OK → только потом Edit**.

### 3. ❌→✅ `doc-agent` автопушил в main и ставил теги
**Стало**: `git add` + `git commit` — автономно (локально). `git push` / `git tag` / `git push --tags` — **только после явного OK от Alex**. Шаги 7-8 переписаны.

### 4. ❌→✅ `fix-agent` ломал git-историю через `cp -r + rm -rf`
**Стало**: `git mv` / `git rm -rf`. История `git log --follow` и `git blame` сохраняется.

---

## 🟡 Важные замечания — ВСЕ ЗАКРЫТЫ (7/7)

| # | Проблема | Решение |
|---|----------|---------|
| 5 | Противоречивый Console API | Унифицирован: `drv_gpu_lib::ConsoleOutput::GetInstance().Print(gpu_id, "Module", msg)` во всех агентах. Проверен по реальному `core/include/dsp/services/console_output.hpp`. |
| 6 | `python-binder` без GIL release | Добавлен `py::call_guard<py::gil_scoped_release>()` + пример `py::array_t<std::complex<float>>` + пример параллельного Python-потока через `threading.Thread`. |1
| 7 | `module-writer` путал GPUWorkLib и DSP-GPU | Разделён на два локальных: один в `/home/alex/C++/GPUWorkLib/.claude/agents/` (с `modules/`, Ref03), другой в `/home/alex/DSP-GPU/.claude/agents/` (с репо-за-репо, эталон linalg, Ref03 скопирован в `~!Doc/Architecture/`). |
| 8 | Массовое `find`/`grep` в Bash | Во всех write-агентах добавлено правило «Glob/Grep tool вместо `find`/`grep`». |
| 9 | Сборка без preset | В обоих `module-writer` прописано жёстко: `cmake --preset debian-local-dev`. Ветки nvidia нет — только ROCm 7.2/Linux/AMD. |
| 10 | Путь логов не создан | В `build-agent`: `mkdir -p /home/alex/DSP-GPU/MemoryBank/agent_reports` перед записью. |
| 11 | Нет orchestration-агента | Создан **`workflow-coordinator.md`** — дирижёр цепочки fix→build→test→doc, сам файлы не пишет, только координирует и запрашивает OK у Alex. |

---

## 🟢 Рекомендации — ВСЕ ЗАКРЫТЫ (6/6)

| # | Тема | Решение |
|---|------|---------|
| 12 | Дубликат `module-tester` vs `test-agent` | Описания разделены: `module-tester` пишет **с нуля**, `test-agent` **копирует** из GPUWorkLib и адаптирует. |
| 13 | Слабые edge cases | В `module-tester` обновлены: `0, 1, 63, 65, 1023, 1024, 65536+` + **multi-GPU × 10 устройств**. |
| 14 | Модели | `gpu-optimizer`, `module-auditor`, `benchmark-analyzer`, `workflow-coordinator` → `opus`. Остальные → `sonnet`. |
| 15 | TodoWrite | Добавлен в tools всех write-агентов + явное правило вести план. |
| 16 | `doxygen-maintainer` — ручные вызовы | Теперь указывает на `build_docs.sh` + дан шаблон. Создан master `scripts/build_all_docs.sh` который обходит все 9 репо. |
| 17 | Защита секретов | Блок `🔒 Защита секретов` (не читать `.vscode/mcp.json`, `.env`, `secrets/`, не логировать env) добавлен во **все** агенты DSP-GPU. |

---

## 📦 Реестр изменений (артефакты)

### Удалено
- `~/.claude/agents/module-writer.md`
- `~/.claude/agents/python-binder.md`
- `~/.claude/agents/module-tester.md`

### Создано локально (GPUWorkLib)
- `/home/alex/C++/GPUWorkLib/.claude/agents/module-writer.md`
- `/home/alex/C++/GPUWorkLib/.claude/agents/python-binder.md`
- `/home/alex/C++/GPUWorkLib/.claude/agents/module-tester.md`

### Создано локально (DSP-GPU)
- `/home/alex/DSP-GPU/.claude/agents/module-writer.md`
- `/home/alex/DSP-GPU/.claude/agents/python-binder.md`
- `/home/alex/DSP-GPU/.claude/agents/module-tester.md`
- `/home/alex/DSP-GPU/.claude/agents/workflow-coordinator.md` ⭐ новый

### Отредактировано (DSP-GPU, project-level)
- `cmake-fixer.md` — 🚨 ASCII-бокс + Шаг 0 DIFF-preview
- `fix-agent.md` — `git mv` + бокс CMake + секреты
- `doc-agent.md` — без автопуш/tag + Шаги 7-8 переписаны
- `build-agent.md` — `mkdir -p` + бокс CMake + Glob/Grep
- `test-agent.md` — pytest-бокс + секреты
- `gpu-optimizer.md` — `model: opus` + секреты + Console API
- `module-auditor.md` — `model: opus` + секреты + Console API
- `benchmark-analyzer.md` — `model: opus` + секреты
- `module-doc-writer.md` — секреты
- `repo-sync.md` — секреты
- `doxygen-maintainer.md` — секреты + `build_docs.sh`

### Скопировано (архитектурные доки)
- `/home/alex/DSP-GPU/~!Doc/Architecture/Ref03_Unified_Architecture.md`
- `/home/alex/DSP-GPU/~!Doc/Architecture/strategies_test_architecture.md`
- `/home/alex/DSP-GPU/~!Doc/Architecture/antenna_processor_pipeline.md`

### Скрипты
- `/home/alex/DSP-GPU/scripts/build_all_docs.sh` — master-скрипт Doxygen (executable)

---

## 🏗️ Новая архитектура цепочки

```
┌─────────────────────────────────────────────────────────┐
│  workflow-coordinator (opus)                            │
│  — оркестратор, сам файлов не трогает                  │
│  — запрашивает OK у Alex на критичных шагах            │
└──────────┬──────────────────────────────────────────────┘
           │ запускает через Agent tool
           ▼
  ┌────────────┐   ┌─────────────┐   ┌────────────┐   ┌───────────┐
  │ fix-agent  │─→│ build-agent │─→│ test-agent │─→│ doc-agent │
  │ (sonnet)   │   │ (sonnet)    │   │ (sonnet)   │   │ (sonnet)  │
  │ git mv     │   │ --preset    │   │ +Python    │   │ +git      │
  │ CMake 🚨   │   │ CMake 🚨    │   │ без pytest │   │ push⏸/tag⏸│
  └────────────┘   └─────────────┘   └────────────┘   └───────────┘

  Параллельные:
  cmake-fixer (sonnet) — CMake правки с 🚨 DIFF-preview и OK
  repo-sync (sonnet)   — консистентность 10 репо
  doxygen-maintainer (sonnet) — через build_docs.sh

  Read-only аналитика (opus):
  gpu-optimizer • module-auditor • benchmark-analyzer
```

---

## 📊 Стандарты (все закрыты)

| Категория | Статус |
|-----------|--------|
| CLAUDE.md pytest-запрет | ✅ все агенты соблюдают |
| CLAUDE.md CMake-запрет | ✅ 🚨 боксы + Шаг 0 везде где есть Edit CMake |
| CLAUDE.md теги неизменны | ✅ `doc-agent` ждёт OK на push/tag |
| lowercase `find_package` | ✅ |
| Пресеты `local-dev` | ✅ обязательны в обоих `module-writer` |
| `GPUProfiler.SetGPUInfo()` | ✅ |
| ConsoleOutput API | ✅ единый вариант `drv_gpu_lib::ConsoleOutput::GetInstance().Print(...)` |
| Glob/Grep over find/grep | ✅ правило добавлено |
| `git mv` вместо `cp+rm` | ✅ |
| Precondition checks | ✅ через `workflow-coordinator` |
| Защита секретов | ✅ во всех 10 агентах |

---

## 🔜 Что осталось (вне текущей задачи)

1. Создать `Doxyfile` в 8 репо (кроме DSP) — задача `doxygen-maintainer` когда будет запущен
2. Создать локальные `build_docs.sh` в каждом репо после появления Doxyfile (шаблон в `doxygen-maintainer.md`)
3. Проверить старые копии агентов в `/home/alex/C++/GPUWorkLib/.claude/agents/` (benchmark-analyzer, doxygen-maintainer, gpu-optimizer, module-auditor, module-doc-writer) — они там были до правок, возможно устарели относительно DSP-GPU

---

## 📝 Коммит (на утверждение Alex)

```bash
cd /home/alex/DSP-GPU
git add .claude/ MemoryBank/ scripts/ '~!Doc/Architecture/'
git commit -m "agents: рефакторинг по ревью — 17 правок (pytest, CMake, git mv, secrets, models, coordinator)"
# push — ТОЛЬКО после OK от Alex
```

Плюс в `/home/alex/C++/GPUWorkLib/`:
```bash
cd /home/alex/C++/GPUWorkLib
git add .claude/agents/module-writer.md .claude/agents/python-binder.md .claude/agents/module-tester.md
git commit -m "agents: локальные копии module-writer/python-binder/module-tester (перенос из user-level)"
```

---

*Выполнено: 2026-04-14 | Кодо (AI Assistant)*
