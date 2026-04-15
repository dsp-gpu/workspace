# 📨 Template: Continue Review

> Шаблон промпта для **продолжения** follow-up задачи из уже существующего ревью.
> Используй, когда часть плана закрыта локально, а часть ждёт железа / OK Alex.

---

## 🔧 Как использовать

1. Скопировать этот файл → `{YYYY-MM-DD}_continue_{topic}.md`
2. Заменить переменные в `{фигурных скобках}`:
   - `{DATE_YESTERDAY}` — когда была предыдущая сессия (2026-04-15)
   - `{DATE_TOMORROW}` — когда будет эта сессия (2026-04-16)
   - `{REVIEW_TOPIC}` — краткое описание ("core + spectrum follow-ups")
   - `{CHANGELOG_FILE}` — путь к changelog с итогами прошлой сессии
   - `{TASK_FILE}` — путь к детальному плану
   - `{REMAINING_TASKS}` — какие задачи остались (например "T0 + T5")
   - `{HARDWARE_NEED}` — что изменилось (например "железо теперь доступно")
   - `{WHAT_TO_DO}` — 1-2 предложения о конкретной работе сегодня
3. Сохранить, использовать как промпт

---

## 📋 Сам промпт (копипастить блок ниже)

```
Кодо, привет! Продолжаем с того места, где закончили {DATE_YESTERDAY}.

Контекст:
- В прошлой сессии ({DATE_YESTERDAY}) я сделал {REVIEW_TOPIC} — детали в:
  {CHANGELOG_FILE}
- План работ — в:
  {TASK_FILE}
- {HARDWARE_NEED}

Задача сегодня: {WHAT_TO_DO}
Остались задачи: {REMAINING_TASKS}.

Прочитай сначала:
1. MemoryBank/MASTER_INDEX.md
2. MemoryBank/tasks/IN_PROGRESS.md
3. {CHANGELOG_FILE}   ← главное, там история и готовые коммит-сообщения
4. {TASK_FILE}        ← детальный план

Потом выполни {REMAINING_TASKS} по плану. Коммит-сообщения (если нужны)
уже заготовлены в changelog — используй их.

⚠️ git push и git tag — только после моего явного OK.
⚠️ CMake не правь без спроса (если требуется — через DIFF-preview).
⚠️ Windows не поддерживается (main = Linux/ROCm).

Поехали!
```

---

## 💡 Примеры использования

- **Follow-up ревью spectrum**: заменить `{REVIEW_TOPIC}` = "ScopedHipEvent + shim cleanup"
- **Follow-up ревью linalg**: `{TASK_FILE}` = `MemoryBank/tasks/TASK_Linalg_Review.md`
- **Follow-up Doxygen**: после прогонки `doxygen-maintainer` на GPU

---

*Created: 2026-04-15 | Maintained by: Кодо*
