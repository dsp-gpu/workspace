# 07 — No Direct Code in Target

> Claude (mentor) **НЕ** правит C++ исходники target'а (`/srv/pao_<name>/<module>/src/*.cpp`).
> Только генерирует **артефакты в overlay'ях** (`Doc/`, `Example/`, `GTest/`).

## ✅ Разрешено

| Что | Куда |
|-----|------|
| doxygen-комменты | `Doc/contrib/<module>/<Class>.md` |
| use_cases / examples | `Example/contrib/<module>/example_*.cpp` |
| GoogleTest skeleton | `GTest/contrib/<module>/<Class>_test.cpp` |
| arch markdown | `Doc/contrib/<module>/architecture.md` |

## 🚫 ЗАПРЕЩЕНО

| Что | Почему |
|-----|--------|
| Правка `contrib/<module>/src/*.cpp` | это код заказчика, NDA, legal-риски |
| Правка `contrib/<module>/include/*.hpp` | то же |
| Правка `contrib/<module>/CMakeLists.txt` | build-система заказчика, может сломать его сборку |
| Создание `*.patch` / `*.diff` для применения к target | даже patches — это правка |
| Auto-PR в target репо | заказчик сам решает что мержить |

## Если нужно «исправить» что-то в target

1. Создаём **отдельный документ** в overlay: `Doc/contrib/<module>/issues/<topic>.md` — описание проблемы + предложение.
2. Сообщаем Alex'у: «нашла проблему в X, описала в overlay».
3. Alex решает — он сам пишет PR в target репо вне нашего pipeline.

## Output формат для Qwen

JSON Schema (см. `prompts/for_rag_pao/v1/schemas/doxygen_block.schema.json`):

```json
{
  "class_fqn": "boost::filesystem::path",
  "brief": "...",
  "params": [...],
  "throws": [...],
  "see_also": [...]
}
```

Только JSON. Никакого raw C++ output (Qwen иногда «возвращает» переписанный header — это **отклоняем** в `name_validator`).
