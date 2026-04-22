# 📦 new_claude — Предложение новой структуры CLAUDE.md для DSP-GPU

> **Автор**: Кодо (AI Assistant)
> **Дата**: 2026-04-21
> **Статус**: ⏳ черновик, ждёт ревью Alex
> **НЕ применён** в рабочее дерево (`E:\DSP-GPU\CLAUDE.md` и `.claude/rules/` не тронуты).

---

## 🎯 Зачем эта папка

Alex попросил: **«ТОЛЬКО не правь! опять всё испортишь! предложи правильную структуру»**.

Здесь лежит **полный черновик** новой модульной структуры `CLAUDE.md` для проекта **DSP-GPU**:
- главный файл `CLAUDE.md` сокращён до ~110 строк (рекомендация Anthropic ≤ 200),
- все детали вынесены в **13 отдельных файлов** `.claude/rules/*.md`,
- каждое правило — один файл по одной теме (легко править, легко ссылаться).

---

## 📁 Структура папки

```
E:\DSP-GPU\MemoryBank\new_claude\
├── README.md                        ← ты читаешь этот файл
├── CLAUDE.md                        ← главный файл (черновик, ~110 строк)
└── .claude\
    └── rules\
        ├── 01-user-profile.md       ← кто Alex, кто Кодо
        ├── 02-workflow.md           ← начало/работа/конец сессии
        ├── 03-worktree-safety.md    ← 🚨 не писать в .claude/worktrees/
        ├── 04-testing-python.md     ← 🚫 pytest FORBIDDEN
        ├── 05-architecture-ref03.md ← 6-слойная модель GPU-операций
        ├── 06-profiling.md          ← ProfilingFacade v2 (GPUProfiler DEPRECATED)
        ├── 07-console-output.md     ← ConsoleOutput singleton (мультиGPU-safe)
        ├── 08-logging.md            ← Logger + plog (per-GPU logs)
        ├── 09-rocm-only.md          ← только ROCm 7.2+, никакого OpenCL
        ├── 10-modules.md            ← 10 репо DSP-GPU
        ├── 11-python-bindings.md    ← pybind11 policy
        ├── 12-cmake-build.md        ← сборка на Debian
        └── 13-optimization-docs.md  ← ссылки на гайды по HIP/ROCm
```

---

## 🔄 Как применить (когда Alex одобрит)

1. Сравнить `new_claude\CLAUDE.md` с текущим `E:\DSP-GPU\CLAUDE.md`.
2. Если OK → заменить корневой `CLAUDE.md` на черновик.
3. Скопировать `.claude\rules\*.md` из `new_claude\.claude\rules\` в `E:\DSP-GPU\.claude\rules\`.
4. Закоммитить как «rewrite CLAUDE.md + add modular rules (new_claude branch)».
5. Папку `MemoryBank\new_claude\` можно удалить или оставить как исторический снапшот.

---

## 📝 Почему модульная структура

**Источник**: официальная документация Claude Code + Anthropic best practices.

| Принцип | Пояснение |
|---------|-----------|
| ≤ 200 строк | Главный `CLAUDE.md` грузится в контекст каждой сессии — чем короче, тем больше места под работу. |
| Progressive Disclosure | Детали грузятся только когда нужны (через `@import` или ручное чтение). |
| One file — one rule | Править одну тему, не трогая соседние правила. |
| Stable references | Ссылки `@.claude/rules/06-profiling.md` можно давать из агентов и тасков. |

---

## ❓ 6 вопросов к Alex (на ревью)

1. Согласен ли на ≤ 110 строк в `CLAUDE.md` + imports?
2. Путь `.claude/rules/*.md` (Anthropic-style) ОК, или класть в `Doc_Addition/claude_rules/`?
3. Ref03 (единая архитектура) — описание переносить в DSP-GPU/Doc, или ссылаться на legacy GPUWorkLib?
4. `BACKLOG.md` / `COMPLETED.md` — убрать из CLAUDE.md (в DSP-GPU их пока нет)?
5. Имя FFT-модуля: `fft_func` или `fft_processor`? (в разных местах по-разному)
6. Когда одобришь — применить одним коммитом или поэтапно?

---

*Любые вопросы / правки — пиши, Кодо переделает.*
