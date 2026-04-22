# Review: CLAUDE.md System (2026-04-22)

## Verdict: PASS-WITH-FIXES

Ревьюер: deep-reviewer (Opus 4.7, 1M context).
Дата: 2026-04-22.
Область: 16 canonical правил + 16 deployed + sync-инфра + корневой CLAUDE.md + global CLAUDE.md + 9 per-repo CLAUDE.md.

Метод: чеклист A-F из промпта, 7 «thoughts» (sequential-thinking MCP в окружении недоступен, чеклист пройден методически с верификацией через Read/Grep/Bash).

---

## Critical (must fix before merge)

Нет.

Явных блокеров (утечки секретов, битый Python, расхождение canonical↔deployed, пропущенный per-repo, запрещённый `pytest`/`std::cout`/`GPUProfiler` в продовом смысле) — **не найдено**.

---

## Warnings (nice to have)

### W1. 5 файлов правил превышают 100 строк (договор «компактней»)

Чеклист A прямо требует «все файлы ≤ 100 строк». Фактические длины:

| Файл | Строк |
|------|-------|
| `MemoryBank/.claude/rules/15-cpp-testing.md` | 148 |
| `MemoryBank/.claude/rules/12-cmake-build.md` | 119 |
| `MemoryBank/.claude/rules/06-profiling.md` | 111 |
| `MemoryBank/.claude/rules/11-python-bindings.md` | 109 |
| `MemoryBank/.claude/rules/09-rocm-only.md` | 101 |

Предложение: вынести в `MemoryBank/.claude/specs/` подробные примеры (шаблон `test_*.hpp`, полный CMakeLists, GPUReportInfo пример), а в правилах оставить ссылку `@MemoryBank/.claude/specs/...` и короткий API. Приоритеты: 15 (148→~80), 12 (119→~90), 06 (111→~85).

### W2. Абсолютный Windows-путь в `03-worktree-safety.md:36`

```
3. Для DSP-GPU: `E:\DSP-GPU\` (Windows) или `/home/alex/DSP-GPU/` (Debian).
```

Чеклист A запрещает `E:\...` в документации правил (разрешено только в global Windows CLAUDE.md и в этом ревью-файле). Контекстно оправдано (парой с Debian-путём), но формально нарушает правило. Рекомендация: заменить на `<repo root>` или `$(git rev-parse --show-toplevel)` пример, либо зафиксировать исключение в корневом CLAUDE.md.

### W3. `Python_test/**` в frontmatter `04-testing-python.md:5`

```yaml
paths:
  - "**/*.py"
  - "**/Python/**"
  - "**/Python_test/**"
```

Согласно тому же правилу (строка 76) каноничный путь — `DSP/Python/{module}/test_*.py`. `Python_test/` это legacy-каталог из старого GPUWorkLib. Правило грузится при редактировании файлов по этому пути, но упоминание в frontmatter легко читается как «разрешённая альтернатива». Рекомендация: удалить строку 5 или оставить с комментарием `# legacy path (GPUWorkLib)`.

---

## Notes (observation / future work)

### N1. `fft_processor.hpp` в примере `15-cpp-testing.md:52,82`

```cpp
#include "test_fft_processor.hpp"
...
#include <dsp/spectrum/fft_processor.hpp>
```

`10-modules.md:25` помечает `fft_processor` как legacy-имя. Формально это имя header для класса `FFTProcessor`, совместимо с snake_case. Но для внешнего читателя выглядит как противоречие. Вариант — имя header `spectrum_fft.hpp` или `fft.hpp`. Решить Alex.

### N2. Корневой `CLAUDE.md` не ссылается напрямую на `13-optimization-docs.md`

Правило с `paths:` для `.hip`/`kernels/**` грузится автоматически, но в корневом файле нет ссылки в таблице или в секции «Архитектура & Сборка». Мелочь — не блокер.

### N3. Правило `09-rocm-only.md` не упомянуто в корневом явно, только в «3 критических правилах» (пункт 3)

Там ссылка `.claude/rules/09-rocm-only.md` есть. OK, но для симметрии с 06/07/08 можно добавить строку в таблицу «Единые точки».

### N4. `sync_rules.py --check` работает корректно

Прогнано локально: `files: canonical=16 deployed=16`, `In sync — nothing to do`. Все 16 canonical↔deployed бит-в-бит идентичны (проверено `diff -q` по всем 16 парам). Инфраструктура готова к продакшну.

### N5. `pre-commit` hook — проверка на Windows с Git Bash

`if command -v python3` → на Windows Git Bash под MSYS2 `python3` может резолвиться в MSYS2 Python без numpy (что предупреждает сам `04-testing-python.md:86`). Для sync_rules.py numpy не нужен, так что не проблема, но стоит протестировать хук на Windows-боксе Alex.

---

## Проверка по чеклисту A-F

### A. Соответствие требованиям Alex

- [~] Все файлы ≤ 100 строк — **5 нарушений** (W1).
- [~] Нет абсолютных Windows-путей в правилах — **1 случай** (W2).
- [x] Каноничное имя `spectrum`, legacy `fft_func`/`fft_processor` не используются как активные (только в таблице legacy и header filename).
- [x] Запрет pytest навсегда (04-testing-python.md:10).
- [x] Workflow Context7 → URL → seq → GitHub в 00-new-task-workflow.md.
- [x] C++ style ООП/SOLID/GRASP/GoF в 14-cpp-style.md.
- [x] C++ тесты ООП header-only без GoogleTest в 15-cpp-testing.md.
- [x] Main не вызывает тесты напрямую (15-cpp-testing.md:117-127 + DSP/CLAUDE.md:28).

### B. Техническая корректность

- [x] `GPUProfiler @deprecated` в 06 (строки 11-13) и корневом (строка 46).
- [x] `ConsoleOutput::Level::ERRLEVEL` (не `ERROR`) — 07:32,39,52.
- [x] `find_package` lowercase в 09 и 12.
- [x] Path-scoped frontmatter корректен в 04,06,07,08,11,12,13,14,15.
- [~] `04-testing-python.md` указывает верный путь `DSP/Python/{module}/test_*.py` (строка 76), но frontmatter также включает `Python_test/**` (W3).
- [x] Все 6 спеков из `13-optimization-docs.md` существуют в `MemoryBank/.claude/specs/`.
- [x] Правила не дублируют друг друга.

### C. Консистентность между уровнями

- [x] Корневой CLAUDE.md ссылается на 00-08, 11, 12, 14, 15 напрямую (13 из 16). 09, 10, 13 — косвенно (N2, N3).
- [x] Global CLAUDE.md общий (SYSTEM_PROMPT + тон), не дублирует project-specific.
- [x] 9 per-repo CLAUDE.md существуют.
- [x] Per-repo не противоречат корневым и друг другу.
- [x] Граф зависимостей в `10-modules.md` совпадает с per-repo: core ← spectrum ← stats → signal_generators → heterodyne → linalg → radar → strategies → DSP.

### D. Sync-инфраструктура

- [x] `sync_rules.py` — синтаксически корректный (`python -c 'ast.parse(...)'` OK), только stdlib.
- [x] NEW/UPD/DEL — строки 79, 83.
- [x] `--check` exit 1 при drift — строка 128.
- [x] `pre-commit` с fallback `python3`/`python` — строки 15-22.
- [x] `README_sync_rules.md` содержит установку, workflow, перенос в новый проект, диагностику.

### E. Безопасность

- [x] Нет упоминаний токенов/паролей/ключей (grep по `token|secret|password|_KEY|_TOKEN` — 0 matches).
- [x] `.vscode/mcp.json`, `.env`, `secrets/` упомянуты только как запреты в `03-worktree-safety.md`.
- [x] Нет путей `.claude/worktrees/*/` как мест записи.

### F. Стиль и тон

- [x] Русский корректен.
- [x] Эмодзи по делу, не украшательство.
- [x] Нет воды и льстивых оборотов.
- [x] Код-блоки с правильной подсветкой (cpp/python/bash/cmake/json).

---

## Summary

- Files reviewed: **44**
  - 16 canonical rules
  - 16 deployed rules (bit-identical, verified `diff -q`)
  - 3 sync-инфра (`sync_rules.py`, `hooks/pre-commit`, `README_sync_rules.md`)
  - 1 корневой `CLAUDE.md`
  - 1 global `CLAUDE.md`
  - 9 per-repo `CLAUDE.md`
- Critical: **0**
- Warnings: **3**
- Notes: **5**

**Ключевой вывод**: система технически здоровая, sync работает, безопасность соблюдена, структура логичная, пер-репо файлы согласованы с 10-modules.md. Основное несоответствие — 5 файлов правил превышают 100 строк (договор «компактней»). Рекомендуется сократить 15/12/06/11/09 выносом подробных примеров в `MemoryBank/.claude/specs/` и оставлением в правилах только API + ссылок. После этого — clean PASS.

Вторичные правки (W2, W3, N1-N5) — косметика; могут быть приняты в текущем виде с фиксацией «принято как есть» в корневом CLAUDE.md.
