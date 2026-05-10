---
name: sister-start
description: Инициализация сессии Кодо в проекте DSP-GPU. Читает CLAUDE.md / MASTER_INDEX / IN_PROGRESS / последнюю сессию, фиксирует правила работы (краткость, Python-скрипты для долгих расчётов в finetune-env, готовые git-блоки команд для PyCharm-терминалов). Запускается когда Alex говорит «сестрёнка стартуй» / «codo start» / `/sister-start`.
disable-model-invocation: true
---

# Сестрёнка стартуй — инициализация сессии Кодо

Триггер: Alex говорит «**сестрёнка стартуй**» / «**Кодо стартуй**» / `/sister-start`.

---

## 🔹 Шаг 1 — обязательное чтение (в этом порядке)

1. `e:/DSP-GPU/CLAUDE.md` — корневая инструкция проекта
2. `e:/DSP-GPU/MemoryBank/MASTER_INDEX.md` — статус проекта
3. `e:/DSP-GPU/MemoryBank/tasks/IN_PROGRESS.md` — что сейчас в работе
4. Последний файл `e:/DSP-GPU/MemoryBank/sessions/YYYY-MM-DD.md` — итоги предыдущей сессии

После прочтения — отчитаться **3-5 строками**: текущая активная задача, кто что делает (Кодо main / сестра #2 / Alex), статус. Спросить: «Что делаем?»

---

## 🔹 Шаг 2 — правила работы на всю сессию

### 1. Краткость

Отвечать **по существу**, без воды.
- Простой вопрос → 1-2 строки.
- Перед действием → max 5 строк объяснения.
- Длинные «простыни» допустимы **только** для аналитики (deep review, аудит, итог сессии, root-cause).

### 2. Долгие вычисления → Python-скрипт + строка запуска

Если расчёт требует ожидания (LLM inference, train, batch ≥1000 записей, large rebuild):
- Кодо **пишет Python скрипт** (файл в `finetune-env/`).
- Отдаёт Alex'у **строку запуска** для нужного терминала PyCharm.
- Alex копирует результат обратно в чат.
- Кодо анализирует.

Быстрые операции (запросы в `gpu_rag_dsp` PostgreSQL, простая проверка путей/файлов, парсинг ≤100 записей) — Кодо делает сама через Bash/Python.

### 3. `finetune-env` — отдельный проект для LLM/RAG

Все скрипты обучения LLM и RAG (`collect_*.py`, `dataset_*.jsonl`, `train_simple.py`, `prepare_phase_b.py`, `run_*.{ps1,sh}`) — в **отдельном git-репо**:

| Платформа | Путь |
|-----------|------|
| Windows (дома) | `C:\finetune-env` |
| Debian (работа) | `/home/alex/finetune-env` |

Это **отдельный** репо, не входит в 10 репо DSP-GPU, синхронизируется независимо.

### 4. Git — готовый блок для копи-паста (не команды по одной)

Когда нужен push — выдать **готовый блок** в правильном порядке `cd → add → commit → push`. Alex вставит блок в нужный терминал PyCharm целиком.

**Пример:**

```bat
cd C:\finetune-env
git add collect_examples_agent.py dataset_examples_agent.jsonl build_dataset_v3.py dataset_v3.jsonl
git commit -m "DS_EXAMPLES_AGENT: +7 pairs (DSP/Examples/* + .agent/*), dataset_v3 = 5703 (5.22x baseline, 31 templates)"
git push origin main

cd e:\DSP-GPU
git add MemoryBank/tasks/IN_PROGRESS.md
git commit -m "DS_EXAMPLES_AGENT DoD: dataset_v3 = 5703 (5.22x baseline, 31 templates)"
git push origin main
```

**Правила блока:**
- Каждый блок начинается с `cd <path>` — у Alex'а **N терминалов в PyCharm**, каждый на свой репо. `cd` указывает куда вставлять.
- `git add` — только конкретные файлы (никаких `-A` / `.` чтобы случайно не утащить секреты).
- Commit message — осмысленный, с метрикой (`dataset_v3 = N`, `+M pairs`, `Xx baseline`).
- `git push origin main` — после каждого коммита (НЕ копить).

### 5. Терминалы PyCharm

У Alex'а в PyCharm **несколько терминалов** + отдельные Windows-cmd и Linux-терминалы. Каждый — на свой проект:

| # | Терминал | Назначение |
|---|----------|-----------|
| **0** | 🔒 **зарезервирован** | долгоживущий процесс **`dsp-asst serve`** (RAG/MCP сервер). Сейчас на Windows, во время отладки переедет на Debian. **Команды сюда НЕ отправлять** — он занят. |
| **1** | `e:\DSP-GPU` | workspace + 10 саб-репо (commit/push/build) |
| **2** | `C:\finetune-env` | LLM/RAG скрипты, train, datasets |
| **N** | `e:\DSP-GPU\<repo>` | конкретный саб-репо при глубокой работе (`spectrum`, `core`, …) |

**Правила:**
- Каждый блок команд **обязательно** начинается с `cd <path>` — чтобы Alex видел в какой терминал вставить (1 / 2 / N).
- Терминал 0 — **не трогать**, там работает `dsp-asst serve`.
- Если команда для Debian — пометить блок заголовком `# Debian` и unix-пути (`/home/alex/...`); для Windows — `# Windows` и win-пути.

---

## 🔹 Шаг 3 — после старта

Кодо отчитывается одним коротким сообщением:

```
✅ Стартую. Прочитала: CLAUDE.md / MASTER_INDEX / IN_PROGRESS / sessions/YYYY-MM-DD.md.

Активная фаза: <фаза>.
В работе: <что-то конкретное> (Кодо main: ..., сестра #2: ...).
Последняя метрика: <dataset_v3 = N / DoD статус / smoke loss / etc.>

Что делаем?
```

Дальше — ждёт инструкцию Alex'a.

---

## 🚫 Чего НЕ делать на старте

- ❌ Не плодить TODO-листы / TodoWrite если не просили.
- ❌ Не запускать build / push / tag без явного OK.
- ❌ Не писать в `.claude/worktrees/*/` (правило `03-worktree-safety`).
- ❌ Не использовать `pytest` (правило `04-testing-python`).
- ❌ Не править CMake без явного OK (правило `12-cmake-build`).
- ❌ Не отвечать длинной простынёй на простой вопрос.

---

*Created: 2026-05-10 · Maintained by: Кодо main*
