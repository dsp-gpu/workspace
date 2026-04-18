# Аудит путей и ссылок GPUWorkLib — 2026-04-18

> Статус: 📝 На ревью Alex

---

## 1. Абсолютные пути (исключая CMake & Doxygen)

### 🔴 Живые / функциональные (надо фиксить)

| Файл | Строка | Что сейчас | Проблема | Решение Alex |
|------|--------|-----------|---------|-------------|
| `.claude/settings.local.json` | 10,61,72,83 | `/home/alex/C++/GPUWorkLib/.claude/hooks/*` | Хуки живые — сломаются если home != alex | |
| `scripts/migration.py` | 38 | `GPUWORKLIB = Path("/home/alex/C++/GPUWorkLib")` | Жёсткий хардкод | |
| `scripts/build_all_docs.sh` | 10 | `DSP_ROOT="/home/alex/DSP-GPU"` | Сломается если home != alex | |
| `.vscode/settings.json` | 2 | `/home/alex/DSP-GPU/DSP` | cmake.sourceDirectory | |
| `~!Doc/Сoordinator/How_to_run.md` | 4 | `/home/alex/DSP-GPU/.claude/agents/` | Живая документация | |

## от Alex 
-- Хуки живые  нужно настроить на этот проект если они будут относительные и заработают в debian то править и передавать через github
-- Миграцию совершили  поэтому давай подумаеи и что не нужно уберкм
 `scripts/migration.py` | 38 | `GPUWORKLIB = Path("/home/alex/C++/GPUWorkLib")` | Жёсткий хардкод | |
| `scripts/build_all_docs.sh` | 10 | `DSP_ROOT="/home/alex/DSP-GPU"` | Сломается если home != alex | |
-- | `.vscode/settings.json` | 2 | `/home/alex/DSP-GPU/DSP` | cmake.sourceDirectory | |
 - мы на windows не собираем это наверно можно оставить
-- `~!Doc/Сoordinator/How_to_run.md` | 4 | `/home/alex/DSP-GPU/.claude/agents/` | Живая документация | |
 - если сделать относительную будет работать?

### 🟡 MemoryBank/tasks — команды с абсолютными путями (используются агентами в Фазе 4)

Все файлы `TASK_KernelCache_v2_Phase*.md` содержат десятки `cd E:/DSP-GPU/core` и
`export FETCHCONTENT_SOURCE_DIR_DSP_CORE=E:/DSP-GPU/core`.

> **Фаза 4 ещё не запущена** — переписывать сейчас или перед запуском на Debian?

| Файл | Решение Alex |
|------|-------------|
| `MemoryBank/tasks/TASK_KernelCache_v2_PhaseA_CoreNewApi.md` | |
| `MemoryBank/tasks/TASK_KernelCache_v2_PhaseB_CriticalFixes.md` | |
| `MemoryBank/tasks/TASK_KernelCache_v2_PhaseC_LinalgStrategies.md` | |
| `MemoryBank/tasks/TASK_KernelCache_v2_PhaseD_Cleanup.md` | |
| `MemoryBank/tasks/TASK_KernelCache_v2_PhaseE_Polish.md` | |
## от Alex 
 -- оставии завтра соберем и удалим лишнее

### 🟢 Допустимо как есть (примеры/описания)

| Файл | Причина |
|------|---------|
| `CLAUDE.md` (строки 19, 164, 174-176) | Явно описывает Windows vs Debian — контекст |
| `MemoryBank/MASTER_INDEX.md` | Историческая документация |
| `MemoryBank/specs/review_*.md` | Зафиксированные ревью — не переписываем |
| `MemoryBank/changelog/` | Неизменяемая история |

---

## 2. Ссылки на GPUWorkLib

### ✅ Оставить (GPUWorkLib — источник тестов, эталон)

| Файл | Статус | Примечание |
|------|--------|-----------|
| `.claude/agents/test-agent.md` | ✅ | Уже **относительный** путь `../C++/GPUWorkLib/` |
| `.claude/agents/python-binder.md` | ✅ | Относительный `../C++/GPUWorkLib/Python_test/` |
| `.claude/agents/doc-agent.md` | ✅ | Явная пометка "эта фаза завершена, не ходить" |
| `~!Doc/~Разобрать/` | ✅ | Исторический архив |
## от Alex 
 -- 
| `.claude/agents/test-agent.md` | ✅ | Уже **относительный** путь `../C++/GPUWorkLib/` |
| `.claude/agents/python-binder.md` | ✅ | Относительный `../C++/GPUWorkLib/Python_test/` |
- в этом проектк агенты болжны быть такие же что бы не ходить в другие проекты нужно исправить
-- | `.claude/agents/doc-agent.md` | ✅ | Явная пометка "эта фаза завершена, не ходить" |
 - не понял если агент пишет документацию он пиет в этом проекте и в дркгом козда мы его перенесем! - разобраться
--| `~!Doc/~Разобрать/` | ✅ | Исторический архив |
-  покажи где не правильные ссылки - у нас вся документация/описания/прочее должны быть в этом проекте 


### ⚠️ Обсудить / обновить

| Файл | Проблема | Решение Alex |
|------|---------|-------------|
| `.claude/settings.local.json` (строки 10,27,28,61,72,83) | Хуки `on_stop.sh / pre_bash.sh / post_write.sh` из GPUWorkLib — перенести в DSP-GPU или оставить общими? | |
| `scripts/migration.py` | `GPUWORKLIB = Path("/home/alex/C++/GPUWorkLib")` → `Path.home() / "C++" / "GPUWorkLib"` или env var? | |
| `.cursor/skills/run-gpu-tests/SKILL.md` | Весь скилл про старый GPUWorkLib.exe — не DSP-GPU | |
## от Alex - выше написал 

### ❌ Уже не актуальны (можно удалить/переписать)

| Файл | Проблема | Решение Alex |
|------|---------|-------------|
| `scripts/run_agent_tests.sh` | Запускает GPUWorkLib.exe — не DSP-GPU бинарники | |
| `scripts/run_agent_tests.py` | То же самое | |
| `scripts/check_profiling.sh` | Заголовок `GPUWorkLib: ...`, логика под монолит | |
| `scripts/check_profiling.py` | То же самое | |
## от Alex - обсудить каждый и переписать если под нас не подходит удалим
---

## 3. Предлагаемые правки в CLAUDE.md

```diff
## 🗂️ Структура workspace

-E:\DSP-GPU\                       ← корень workspace, git: github.com/dsp-gpu/workspace
+{workspace}/                      ← корень workspace, git: github.com/dsp-gpu/workspace
## от Alex - разверни не понял

## 📋 Рабочий процесс (workflow)

### Базовый каталог с кодом
-- **Windows**: `E:\C++\GPUWorkLib\` — старый монолит (работающий, не трогаем)
-- **Debian**: `.../C++/GPUWorkLib/` — Linux версия
-- **Новый проект**: `E:\DSP-GPU\` — этот workspace (модульный)
+- **GPUWorkLib**: `~/C++/GPUWorkLib/` — старый монолит-эталон (не трогаем!)
+- **Новый workspace**: `~/DSP-GPU/` (Windows: `E:\DSP-GPU\`) — этот workspace
## от Alex  - да

## 🏗️ CMake-соглашения
### Пресеты (local-dev)
-CMakePresets.json с `FETCHCONTENT_SOURCE_DIR_DSP*` → локальные папки `E:/DSP-GPU/`:
+CMakePresets.json с `FETCHCONTENT_SOURCE_DIR_DSP*` → локальные папки `~/DSP-GPU/`:
```
## от Alex  - да

> ⚠️ CMake пресеты (CMakePresets.json) — отдельный вопрос, там `E:/DSP-GPU/` в реальных значениях. Не трогаем без согласования.

---

## 4. Открытые вопросы (ответы Alex)

1. **Хуки settings.local.json** — `pre_bash.sh / post_write.sh / on_stop.sh` из GPUWorkLib:
   > Перенести хуки в DSP-GPU или оставить в GPUWorkLib (общие для двух проектов)?

2. **TASK_KernelCache_v2_Phase*.md** — пути `E:/DSP-GPU/core`:
   > Переписывать сейчас под Debian или когда будем запускать Фазу 4?

3. **scripts/run_agent_tests.sh/.py** — удалить или переписать под DSP-GPU?

4. **CLAUDE.md** — применяем предложенный diff выше?

---

## 5. Анализ Кодо — по ответам Alex

### 🔴 Хуки

Хуки на Windows **не нашлись** (файлы отсутствуют — существуют только на Debian в GPUWorkLib).

**Предлагаю:**
1. Создать `.claude/hooks/` в корне DSP-GPU
2. Скопировать туда `on_stop.sh / pre_bash.sh / post_write.sh`
3. В `settings.local.json` заменить пути:
   ```diff
   -"bash /home/alex/C++/GPUWorkLib/.claude/hooks/on_stop.sh"
   +"bash .claude/hooks/on_stop.sh"
   ```
   Claude Code запускает хуки из корня проекта → относительный путь сработает на любом Debian.

> ⏳ Делаем на Debian (нужны исходники хуков). Alex — **OK?**

---

### 🗑️ Что удалить — предложения Кодо

| Файл | Причина | Решение Alex |
|------|---------|-------------|
| `scripts/migration.py` | Запускал агентов для миграции GPUWorkLib→DSP-GPU. Миграция завершена — скрипт мёртвый. | |
| `scripts/run_agent_tests.sh` | Запускает `GPUWorkLib.exe` (монолитный бинарник). В DSP-GPU такого нет. | |
| `scripts/run_agent_tests.py` | Все пути на `Python_test/drvgpu`, `Python_test/fft_func` — монолитная структура GPUWorkLib. | |
| `scripts/check_profiling.py` | Ищет папку `modules/` — монолитная структура. В DSP-GPU нет `modules/`, каждый репо отдельно. | |
| `scripts/check_profiling.sh` | Просто вызывает check_profiling.py — удалять вместе. | |

---

### ✏️ Что поправить (конкретные правки)

**`scripts/build_all_docs.sh` строка 10** — нужный скрипт! Doxygen builder для всех 9 репо. Одна правка:
```diff
-DSP_ROOT="/home/alex/DSP-GPU"
+DSP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
```
Станет относительным, заработает из любого home.

**`~!Doc/Сoordinator/How_to_run.md` строка 4** — текст, не выполняется. Просто заменить:
```diff
-**Файл агента**: `/home/alex/DSP-GPU/.claude/agents/workflow-coordinator.md`
+**Файл агента**: `.claude/agents/workflow-coordinator.md`
```

---

### ❓ Спорные вопросы — требуют ответа Alex

**1. test-agent.md / python-binder.md** — ты написал "агенты не должны ходить в другие проекты".
Сейчас они используют `../C++/GPUWorkLib/` как источник тестов.
Но Фаза 2 (копирование кода) ✅ завершена — тесты **уже есть** в `{repo}/tests/`.
→ **Предлагаю**: переписать раздел "Источник тестов" — агент читает из `{repo}/tests/` напрямую, не из GPUWorkLib.
**Alex — OK?**

**2. doc-agent.md** — ты написал "не понял".
Объяснение: doc-agent пишет только в `{repo}/Doc/` внутри DSP-GPU.
Строчка "GPUWorkLib больше не источник" = первичный импорт документации уже сделан в фазе доки-миграции.
У GPUWorkLib есть **свои** отдельные агенты в `/home/alex/C++/GPUWorkLib/.claude/agents/` — они независимы.
→ **Ничего менять не надо.** Всё ок.

**3. CLAUDE.md строка `{workspace}/`** — ты написал "разверни не понял".
Пояснение: я предлагал убрать хардкод `E:\DSP-GPU\` из схемы дерева папок. Вместо этого проще:
```diff
-E:\DSP-GPU\                       ← корень workspace
+~/DSP-GPU/  (Windows: E:\DSP-GPU\) ← корень workspace
```
**Alex — OK?**

---

### 📋 Итого — жду OK на каждый пункт

| # | Действие | Статус |
|---|---------|--------|
| 1 | Удалить 5 скриптов (migration.py, run_agent_tests.sh/.py, check_profiling.sh/.py) | |
| 2 | Пофиксить `scripts/build_all_docs.sh` строка 10 (1 правка) | |
| 3 | Пофиксить `~!Doc/Сoordinator/How_to_run.md` строка 4 | |
| 4 | Переписать test-agent.md / python-binder.md (убрать GPUWorkLib пути) | |
| 5 | Применить diff CLAUDE.md (workflow + CMake секции) — ты написал "да" | |
| 6 | Перенести хуки в `.claude/hooks/` — на Debian | |


## от Alex

### ❓ Спорные вопросы — требуют ответа Alex

**1. test-agent.md / python-binder.md** — ты написал "агенты не должны ходить в другие проекты".
Сейчас они используют `../C++/GPUWorkLib/` как источник тестов.
Но Фаза 2 (копирование кода) ✅ завершена — тесты **уже есть** в `{repo}/tests/`.
→ **Предлагаю**: переписать раздел "Источник тестов" — агент читает из `{repo}/tests/` напрямую, не из GPUWorkLib.
**Alex — OK   **

**2. doc-agent.md** — ты написал "не понял".
Объяснение: doc-agent пишет только в `{repo}/Doc/` внутри DSP-GPU.
Строчка "GPUWorkLib больше не источник" = первичный импорт документации уже сделан в фазе доки-миграции.
У GPUWorkLib есть **свои** отдельные агенты в `/home/alex/C++/GPUWorkLib/.claude/agents/` — они независимы.
→ **Ничего менять не надо.** Всё ок.
**Alex — OK   **

**3. CLAUDE.md строка `{workspace}/`** — ты написал "разверни не понял".
Пояснение: я предлагал убрать хардкод `E:\DSP-GPU\` из схемы дерева папок. Вместо этого проще:
```diff
-E:\DSP-GPU\                       ← корень workspace
+~/DSP-GPU/  (Windows: E:\DSP-GPU\) ← корень workspace
```
**Alex — OK**

---

### 📋 Итого — жду OK на каждый пункт

| # | Действие | Статус |
|---|---------|--------|
| 1 | Удалить 5 скриптов (migration.py, run_agent_tests.sh/.py, check_profiling.sh/.py) | |
| 2 | Пофиксить `scripts/build_all_docs.sh` строка 10 (1 правка) | |
| 3 | Пофиксить `~!Doc/Сoordinator/How_to_run.md` строка 4 | |
| 4 | Переписать test-agent.md / python-binder.md (убрать GPUWorkLib пути) | |
| 5 | Применить diff CLAUDE.md (workflow + CMake секции) — ты написал "да" | |
| 6 | Перенести хуки в `.claude/hooks/` — на Debian | |
Все -да
- п6. Перенести хуки в  - сделай сейчас исправь все что можно пометь в MemoryBank как задачу для теста/настройки в понедельник под debian

