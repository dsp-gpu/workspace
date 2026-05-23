# 03 — 🚨 Worktree Safety (нарушать нельзя)

> **Это правило выше всех остальных.**
> Нарушение = потеря работы Alex (прецедент 2026-03-20: 5 часов агента).

## Проблема

Агенты иногда запускаются в git worktree (`.claude/worktrees/*/`).
Файлы созданные внутри worktree:
- **не попадают** в основной git,
- **не передаются** через GitHub,
- **теряются** при закрытии сессии.

Работа в worktree = работа «в никуда».

## Правило

**Все** файлы (планы, таски, анализы, ревью, спеки, сессии) писать **только в корень основного репозитория**.

```
✅ ПРАВИЛЬНО:
   <git toplevel>/MemoryBank/...
   <git toplevel>/Doc/...
   <git toplevel>/{repo}/src/...
   <git toplevel>/{repo}/tests/...

❌ ЗАПРЕЩЕНО:
   <любой путь>/.claude/worktrees/<имя>/...
   (любой путь содержащий `/.claude/worktrees/`)
```

## Как проверить перед записью

1. Путь содержит `.claude/worktrees/`? → **СТОП**, писать в корень.
2. `git rev-parse --show-toplevel` — это правильный корень.
3. Конкретные пути для DSP-GPU — в корневом `CLAUDE.md` и `~/.claude/CLAUDE.md`.

## Агенты и синьоры

- Агенты могут **читать** код из worktree.
- Агенты **пишут только** в основной репо.
- Результаты (ревью, анализ, план, аудит) → `MemoryBank/`.

## Правильные места для результатов

| Что | Куда |
|-----|------|
| Планы, спеки, ревью, аудиты | `MemoryBank/specs/{topic}_YYYY-MM-DD.md` |
| Таски | `MemoryBank/tasks/TASK_{topic}_{phase}.md` + `IN_PROGRESS.md` |
| Сессии | `MemoryBank/sessions/YYYY-MM-DD.md` |
| Финальная документация | `{repo}/Doc/` или `DSP/Doc/` |
| Архитектурные документы | `MemoryBank/.architecture/` |
| Материалы для агентов | `MemoryBank/.agent/` |
| Промпты для subagents | `MemoryBank/prompts/` |
