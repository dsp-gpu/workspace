# 02 — Workflow (сессия: начало → работа → конец)

## 📖 В начале сессии

1. Прочитать `MemoryBank/MASTER_INDEX.md` — статус проекта.
2. Прочитать `MemoryBank/tasks/IN_PROGRESS.md` — что сейчас в работе.
3. Посмотреть последнюю `MemoryBank/sessions/YYYY-MM-DD.md`.
4. Новая тема → применить `00-new-task-workflow.md` (Context7 → URL → seq → GitHub).

## 💻 Во время работы

- **Одна задача = один тематический файл** `MemoryBank/tasks/TASK_<topic>_<phase>.md`.
- `MemoryBank/tasks/IN_PROGRESS.md` — короткий указатель на активный TASK-файл (1-5 строк).
- Исследования / спеки / ревью / аудиты → `MemoryBank/specs/{topic}_YYYY-MM-DD.md`.
- Архитектурные документы → `MemoryBank/.architecture/`.
- Материалы для агентов → `MemoryBank/.agent/`.
- Промпты для subagents → `MemoryBank/prompts/`.
- Обратная связь / ревью-отчёты → `MemoryBank/feedback/`.
- Изменение публичного API → обновить `{repo}/Doc/` + `DSP/Doc/Python/{module}_api.md`.

## 📝 В конце сессии

1. Короткое резюме → `MemoryBank/sessions/YYYY-MM-DD.md`.
2. Обновить `MemoryBank/changelog/YYYY-MM.md` (одна строчка).
3. Завершённые фазы таска — пометить ✅ DONE внутри TASK-файла.
4. Временные черновики — **удалить** (принцип чистоты).

## 🎯 Приоритеты (в порядке убывания)

1. ✅ **Работоспособность** — главное, чтобы работало.
2. 🎯 **Корректность** — сверка с эталоном (SciPy / NumPy / MATLAB).
3. ⚡ **Производительность** — GPU должен быть быстрее CPU.
4. 📝 **Документация** — после стабилизации API.
5. 🧹 **Очистка** — удалить промежуточные файлы.

## 🚫 Запреты процесса

- Не делать git push/tag без явного OK от Alex.
- Не менять CMake-файлы без явного OK (см. `12-cmake-build.md`).
- Не писать в `.claude/worktrees/*/` (см. `03-worktree-safety.md`).

## 🗣️ Команды Alex

| Команда | Действие |
|---------|---------|
| «Покажи статус» | `MASTER_INDEX.md` + `tasks/IN_PROGRESS.md` |
| «Добавь задачу: ...» | создать/обновить `tasks/TASK_<topic>_<phase>.md` |
| «Запиши в спеку: ...» | `specs/{topic}_YYYY-MM-DD.md` |
| «Сохрани исследование» | `specs/` или `.claude/specs/` если про Кодо |
| «Что сделали сегодня?» | создать `sessions/YYYY-MM-DD.md` |
