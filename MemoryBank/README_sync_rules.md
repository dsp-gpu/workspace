# MemoryBank/sync_rules.py — как это работает

## Зачем

Claude Code читает правила из стандартного пути `<repo>/.claude/rules/*.md`.
А у нас canonical лежит в `MemoryBank/.claude/rules/` (чтобы копировать в новые проекты целым блоком).

Скрипт — мост между ними.

## Быстрый старт

```bash
# синк вручную:
python3 MemoryBank/sync_rules.py

# проверить нет ли расхождений (dry-run, exit 1 при drift):
python3 MemoryBank/sync_rules.py --check

# полный пересбор:
python3 MemoryBank/sync_rules.py --clean
```

## Что делает

1. Смотрит `MemoryBank/.claude/rules/*.md` (canonical).
2. Смотрит `.claude/rules/*.md` (deployed).
3. Показывает расхождения: NEW / UPD / DEL.
4. Без `--check` → применяет их (copy, update, delete).
5. С `--check` → ничего не трогает, но exit 1 если drift.

## Авто-запуск через git pre-commit hook

Файл `.git/hooks/pre-commit` (в каждом репо где правится `MemoryBank/`):

```bash
#!/usr/bin/env bash
set -e

# Если тронуты canonical правила — синкать и подставлять в коммит
if git diff --cached --name-only | grep -qE '^MemoryBank/\.claude/rules/.*\.md$'; then
    echo "[pre-commit] Rules changed → running sync_rules.py"
    python3 MemoryBank/sync_rules.py
    git add .claude/rules/
fi
```

Установка (одноразово, в корне репо):

```bash
cp MemoryBank/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

(На Windows Git for Windows выполнит bash-скрипт через mingw-bash.)

## Workflow для Alex

1. Правишь файл в `MemoryBank/.claude/rules/XX-foo.md`.
2. `git add MemoryBank/.claude/rules/XX-foo.md`.
3. `git commit -m "rules: update XX"` → hook сам синкает в `.claude/rules/` и добавляет в коммит.
4. Готово, **забыть невозможно**.

## Перенос в новый проект

1. `cp -r DSP-GPU/MemoryBank/ NewProject/MemoryBank/`
2. `cd NewProject && python3 MemoryBank/sync_rules.py`
3. `cp MemoryBank/hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`
4. `.claude/rules/` наполняется из canonical — готово.

## Диагностика

| Симптом | Причина | Решение |
|---------|---------|---------|
| `canonical dir not found` | неправильная структура | Проверить путь `MemoryBank/.claude/rules/` |
| hook не срабатывает | не `chmod +x` | `chmod +x .git/hooks/pre-commit` |
| Windows / Git Bash: hook "not found" | Git for Windows проблемы с shebang | Убедиться что Python в PATH |
| `--check` в CI падает | кто-то правил `.claude/rules/` напрямую | Запустить `python3 MemoryBank/sync_rules.py` и закоммитить |
