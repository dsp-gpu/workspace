# `prompts_override/` — per-target правки промптов

> **Базовые промпты** живут в **rag-mentor** (`MemoryBank/prompts/for_rag_pao/v1/001_*.md` ... `012_*.md`).
> Синхронизируются в rag-pao через git bare remote (`/srv/git-remotes/rag-pao.git`).
>
> **Здесь** — только **override'ы** если для конкретного target нужен другой промпт (другие doxygen-теги, другой стиль, особые fewshot).

## Когда override нужен

| Случай | Override |
|--------|----------|
| Заказчик использует НЕ стандартный doxygen (например, своё `@signature` вместо `@param`) | `001_doxygen_simple_class.override.md` |
| Стиль тестов отличается (Catch2 вместо GoogleTest) | `005_gtest_skeleton_basic.override.md` |
| Особые fewshot (только из этого target) | `fewshot/L3_<target>__<Class>.json` |

## Naming

```
prompts_override/
├── <NNN>_<topic>.override.md     ← заменяет/дополняет базовый
├── fewshot/                      ← target-specific fewshot
└── README.md
```

При orchestrator-загрузке `prompt_builder` сначала ищет в `prompts_override/`, потом в базовом `MemoryBank/prompts/v1/`.

## Если override не нужен

Каталог остаётся **пустым** (только этот README + `.gitkeep`).
