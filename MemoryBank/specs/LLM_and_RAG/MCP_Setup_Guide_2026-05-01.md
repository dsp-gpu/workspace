# MCP-сервер dsp-asst — подключение к Claude Code и Continue

> **Версия:** 1.0 · **Создан:** 2026-05-01
> **Что это:** MCP-сервер позволяет Claude Code (Кодо) и Continue (в VSCode)
> ходить в наш RAG как в обычный tool. Из чата пишешь «найди класс X» — ответ
> придёт через наш умный гибридный поиск.

---

## 1. Архитектура

```
┌────────────────────┐         ┌────────────────────┐         ┌────────────────────┐
│  Continue / Кодо   │ stdio   │  dsp-asst mcp      │  HTTP   │  dsp-asst serve    │
│  (форкает процесс) ├────────>│  (тонкий клиент)   ├────────>│  BGE-M3 + reranker │
│                    │         │                    │         │  + Postgres        │
└────────────────────┘         └────────────────────┘         └────────────────────┘
                                  ↑                              ↑
                           старт ~50 ms                  warmup один раз ~15 c
```

**Главное:** HTTP-сервер `dsp-asst serve` должен быть **запущен заранее**, иначе MCP-tool'ы вернут ошибку «не могу подключиться».

---

## 2. Подключение к Claude Code (Кодо)

### 2.1. Глобально (для всех проектов)

Добавь блок в `C:\Users\user\.claude\settings.json` (или там где у тебя глобальный config Claude Code):

```json
{
  "mcpServers": {
    "dsp-asst": {
      "command": "dsp-asst",
      "args": ["mcp"],
      "env": {
        "DSP_ASST_PG_PASSWORD": "1",
        "DSP_ASST_OFFLINE_HF": "1"
      }
    }
  }
}
```

> Если `dsp-asst` не находится в PATH — укажи полный путь:
> `"command": "C:\\finetune-env\\.venv\\Scripts\\dsp-asst.exe"`

### 2.2. Per-project

Создай `.mcp.json` в корне проекта (например `E:\DSP-GPU\.mcp.json`):

```json
{
  "mcpServers": {
    "dsp-asst": {
      "command": "dsp-asst",
      "args": ["mcp"]
    }
  }
}
```

### 2.3. Проверка в Claude Code

```
/mcp
```

Должен показать `dsp-asst — connected` со списком 5 tools (`dsp_search`, `dsp_find`, `dsp_show_symbol`, `dsp_health`, `dsp_repos`).

В чате попробуй:
> найди класс ScopedHipEvent в проекте

Кодо вызовет `dsp_search` или `dsp_find` и вернёт результат.

---

## 3. Подключение к Continue в VSCode

В `~/.continue/config.yaml` добавь блок:

```yaml
mcpServers:
  - name: dsp-asst
    command: dsp-asst
    args:
      - mcp
    env:
      DSP_ASST_PG_PASSWORD: "1"
      DSP_ASST_OFFLINE_HF: "1"
```

Перезагрузи Continue (значок в статусбаре или `Ctrl+Shift+P → Continue: Reload`).

В чате Continue:
> найди где используется ProfilingFacade::BatchRecord

---

## 4. Workflow на dev-машине

Каждый раз при старте работы:

1. **Окно №1** (PyCharm Terminal):
   ```powershell
   dsp-asst serve
   ```
   Жди `Application startup complete`.

2. **VSCode / Claude Code** — MCP-сервер автоматически подключится при первом tool call.

3. **Окно №2** (для отладки) — обычные `dsp-asst query "..."`.

---

## 5. Tools — что доступно агенту

### `dsp_search(text, top_k=5, repo=None, kind=None, use_rerank=True)`

Главный tool. Семантический поиск.

**Примеры использования агентом:**
- Запрос пользователя «как считать SNR» → `dsp_search(text="signal to noise ratio estimation")`
- «найди FFT класс в spectrum» → `dsp_search(text="FFT class", repo=["spectrum"], kind=["class"])`

### `dsp_find(name, kind=None, limit=20)`

Substr/trgm поиск по имени. Без эмбеддингов, быстрее.

**Примеры:**
- «где определён ScopedHipEvent» → `dsp_find(name="ScopedHipEvent", kind=["class"])`
- «методы класса с именем содержащим Profiling» → `dsp_find(name="Profiling", kind=["method"])`

### `dsp_show_symbol(symbol_id)`

Полный профиль символа: doxygen, file, lines, attributes (constexpr, virtual, override).

**Использование:** после `dsp_search` или `dsp_find` агент берёт `symbol_id` и просит детали.

### `dsp_health()`

Статус сервера, версии расширений, число эмбеддингов. Для отладки.

### `dsp_repos()`

Список 10 репо проекта + namespaces + слой + зависимости + паттерны. Полезно агенту чтобы знать какие фильтры применить.

---

## 6. Если что-то сломалось

### Tool возвращает «не могу подключиться»

Запусти в отдельном окне:
```powershell
dsp-asst serve
```

### MCP не появляется в `/mcp` Claude Code

```powershell
dsp-asst mcp
```
Должно повиснуть в ожидании stdio (это норма). Если падает с ошибкой — скинь stderr.

### dsp-asst не находится в PATH

В `.mcp.json` укажи полный путь:
```json
"command": "C:\\finetune-env\\.venv\\Scripts\\dsp-asst.exe"
```

---

*Конец гайда. После настройки можно использовать прямо в чате VSCode/Claude Code.*
