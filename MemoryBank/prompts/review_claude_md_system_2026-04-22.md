# Промпт для deep-reviewer: ревью системы CLAUDE.md для DSP-GPU

**Цель**: независимое ревью многоуровневой системы CLAUDE.md + 16 модульных правил + sync-инфраструктуры, созданной Кодо 2026-04-22.

**Контекст для ревьюера** (прочитать ДО ревью):
- `E:\DSP-GPU\MemoryBank\new_claude\README.md` — концепция от Alex.
- `E:\DSP-GPU\MemoryBank\new_claude\SYSTEM_PROMPT.md` — прототип SYSTEM_PROMPT + ответы Alex.
- `E:\DSP-GPU\MemoryBank\new_claude\CLAUDE_md_review_2026-04-21.md` — предыдущее ревью (что исправить).

**Что ревьюить** (точные пути):

1. **16 canonical правил** — `E:\DSP-GPU\MemoryBank\.claude\rules\00-15.md`.
2. **16 deployed правил** — `E:\DSP-GPU\.claude\rules\00-15.md` (должны быть идентичны canonical).
3. **Sync-инфраструктура** — `E:\DSP-GPU\MemoryBank\sync_rules.py`, `MemoryBank\hooks\pre-commit`, `MemoryBank\README_sync_rules.md`.
4. **Корневой CLAUDE.md** — `E:\DSP-GPU\CLAUDE.md`.
5. **Global CLAUDE.md** — `C:\Users\user\.claude\CLAUDE.md`.
6. **Per-repo CLAUDE.md** — `E:\DSP-GPU\{core,spectrum,stats,signal_generators,heterodyne,linalg,radar,strategies,DSP}\CLAUDE.md` (9 штук).

**Чеклист ревью** (применить mcp__sequential-thinking, минимум 5 thoughts):

### A. Соответствие требованиям Alex (из SYSTEM_PROMPT.md и переписки)
- [ ] Все файлы ≤ 100 строк (договор Alex «компактней»).
- [ ] Нет абсолютных Windows-путей (`E:\...`) в документации правил и per-repo (allowed только в global Windows CLAUDE.md и в этом ревью-файле).
- [ ] Канонич. имя модуля — **`spectrum`**, нигде не `fft_func`/`fft_processor`.
- [ ] Явно зафиксирован запрет pytest навсегда (включая будущие проекты).
- [ ] Workflow новой задачи: Context7 → URL → sequential-thinking → GitHub — явно в `00-new-task-workflow.md`.
- [ ] C++ style: ООП, SOLID, GRASP, GoF — в `14-cpp-style.md`.
- [ ] C++ тесты в том же стиле: `15-cpp-testing.md` (ООП, header-only `.hpp`, `all_test.hpp`, БЕЗ GoogleTest).
- [ ] Main не вызывает тесты напрямую — только через `all_test.hpp` каждого модуля.

### B. Техническая корректность
- [ ] `GPUProfiler` помечен как `@deprecated` — указано в 06-profiling + в корневом CLAUDE.md.
- [ ] `ConsoleOutput::Level::ERRLEVEL` (не `ERROR`) — проверка в 07.
- [ ] `find_package` lowercase (`hip`, `hipfft`, `rocprim`, `rocblas`, `rocsolver`) — в 12 и 09.
- [ ] Path-scoped frontmatter (`paths:`) корректен YAML, пути `**/*.ext` — где уместно.
- [ ] `04-testing-python.md` указывает `DSP/Python/{module}/test_*.py` (не `Python_test/`).
- [ ] `13-optimization-docs.md` ссылается на актуальные пути `@MemoryBank/.claude/specs/*.md` (6 файлов: Ref03, GPU_Profiling, ROCm_HIP_Optimization, ROCm_Optimization_Cheatsheet, ZeroCopy, Mermaid).
- [ ] Не плодятся новые сущности: правила не дублируют друг друга (e.g. path-scoped в 04 + абсолют в корневом не конфликтуют).

### C. Консистентность между уровнями
- [ ] Корневой CLAUDE.md ссылается на `.claude/rules/XX-name.md` — все ссылки актуальны (16 файлов).
- [ ] Global CLAUDE.md не дублирует project-specific детали (OK: общий SYSTEM_PROMPT + тон).
- [ ] Per-repo CLAUDE.md все 9 (core, spectrum, stats, signal_generators, heterodyne, linalg, radar, strategies, DSP) — существуют.
- [ ] Per-repo не противоречат корневым правилам и друг другу (зависимости: core ← spectrum ← stats ← ...).
- [ ] Граф зависимостей в 10-modules.md совпадает с per-repo файлами.

### D. Sync-инфраструктура
- [ ] `sync_rules.py` — синтаксически корректный Python (без launch) — grep по импортам/кавычкам.
- [ ] Обрабатывает три действия: NEW / UPD / DEL.
- [ ] `--check` режим для pre-commit verify — возвращает exit 1 при drift.
- [ ] `pre-commit` hook умеет Windows (`python`) + Debian (`python3`).
- [ ] README_sync_rules.md — полная инструкция (установка, перенос в новый проект, диагностика).

### E. Безопасность
- [ ] Нет упоминаний токенов, паролей, ключей в любом из ревью-файлов.
- [ ] Не было прочтений `.vscode/mcp.json`, `.env`, `secrets/` (только упомянутые в 03-worktree-safety).
- [ ] Нет путей типа `.claude/worktrees/*/` в качестве места записи.

### F. Стиль и тон
- [ ] Русский язык корректен.
- [ ] Эмодзи использованы по делу (не украшательство).
- [ ] Нет «воды» и льстивых оборотов.
- [ ] Код-блоки с правильной подсветкой (```cpp, ```python, ```bash).

## Формат ответа ревьюера

```
# Review: CLAUDE.md System (2026-04-22)

## Verdict: PASS | FAIL | PASS-WITH-FIXES

## Critical (must fix before merge)
1. ... путь:строка — что не так, как починить
2. ...

## Warnings (nice to have)
1. ...

## Notes (observation / future work)
1. ...

## Summary
- Files reviewed: N
- Critical: N
- Warnings: N
- Notes: N
```

**Сохранить отчёт в**: `E:\DSP-GPU\MemoryBank\feedback\review_claude_md_system_2026-04-22.md`.
