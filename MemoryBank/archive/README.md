# MemoryBank/archive/

Архив — сюда складываем черновики и прототипы, которые больше не актуальны, но история ценна.

## Содержимое

| Папка | Дата | Что внутри |
|-------|------|-----------|
| `new_claude_2026-04-21/` | 2026-04-21 | Прототип многоуровневой CLAUDE.md системы от Alex. Финальная версия перенесена в `MemoryBank/.claude/rules/` + корневой `CLAUDE.md` + global `~/.claude/CLAUDE.md` + per-repo `{repo}/CLAUDE.md`. Сам прототип оставлен как история решений (CLAUDE_md_review_2026-04-21.md содержит ревью предыдущей версии, SYSTEM_PROMPT.md — исходный текст жёсткого режима). |
| `kernel_cache_v2_2026-04-27/` | 2026-04-27 | Завершённые TASK-файлы миграции на KernelCache v2 (INDEX + HANDOFF + Phases A-E, 7 файлов). Все фазы смержены в `main` 5 репо, deep review + 12 fixes + Phase E1 wire выполнены 2026-04-27. Активные остатки (документация + git + опц. acceptance) → `MemoryBank/tasks/TASK_KernelCache_v2_Closeout_2026-04-27.md`. Спека остаётся в `MemoryBank/specs/KernelCache_v2_Proposal_2026-04-16.md` (источник истины, не план). |

## Политика

- Архив **в git**, не удалять без согласования с Alex.
- Новые архивные папки: `{topic}_YYYY-MM-DD/`.
