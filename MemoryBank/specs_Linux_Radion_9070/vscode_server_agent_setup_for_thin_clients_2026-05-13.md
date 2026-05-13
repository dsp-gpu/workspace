# 🚀 Подключение VS Code к серверному AI-агенту (для тонких клиентов)

> **Контекст:** инструкция для подключения **других машин** (без локального GPU) к серверу Alex'а с Ollama.
> **Сервер:** `10.10.4.105:11434` (6 моделей: qwen3.6:27b/35b/35b-a3b-q8_0, qwen2.5-coder:14b, qwen3:32b, nomic-embed-text)
> **Конфиг:** thin-client получает 4 модели Server. На рабочей машине Alex'а — дополнительно 3 локальные через свой Ollama.
>
> **Использование:**
> - Тонкий клиент копирует config ниже → меняет ничего → подключается.
> - Алекс на работе/дома использует **расширенный** config с локальной частью (см. `~/.continue/config.yaml`).
>
> **Файл-исходник:** `VSCode_Server_Agent_Setup.md` (присланный 2026-05-13).

---

## Что получит тонкий клиент

VS Code с агентом Qwen 3.6, работающим на удалённом сервере `10.10.4.105`. На клиентской машине — только VS Code + Continue extension, никаких моделей.

**Требования:**
- Любой Linux/Mac/Windows с сетевым доступом к `10.10.4.105:11434`
- VS Code 1.117.0+
- Continue extension (Ctrl+Shift+X → "Continue")

---

## Шаги (15-30 минут)

1. Проверить доступ к серверу: `curl http://10.10.4.105:11434/api/tags` → должен вернуть JSON со списком моделей.
2. Установить VS Code: `sudo apt install code` (Debian/Ubuntu) или `.deb` с code.visualstudio.com.
3. Установить Continue: `code --install-extension Continue.continue`.
4. Создать `~/.continue/config.yaml` (см. ниже).
5. Запустить VS Code → Continue → выбрать **Qwen 3.6 (35B) Server**.

---

## config.yaml для тонкого клиента (4 server-модели)

```yaml
name: Qwen Server Agent
version: 1.0.0
schema: v1
models:
  - name: Qwen 3.6 (35B) Server
    provider: ollama
    model: qwen3.6:35b
    apiBase: http://10.10.4.105:11434
    roles:
      - chat
      - edit
      - apply
    capabilities:
      - tool_use
    defaultCompletionOptions:
      contextLength: 32768
      temperature: 0.3
      maxTokens: 8192

  - name: Qwen 3.6 (27B Autocomplete) Server
    provider: ollama
    model: qwen3.6:27b
    apiBase: http://10.10.4.105:11434
    roles:
      - autocomplete

  - name: Qwen2.5-Coder 14B Server
    provider: ollama
    model: qwen2.5-coder:14b
    apiBase: http://10.10.4.105:11434
    roles:
      - autocomplete

  - name: Qwen3 32B Server
    provider: ollama
    model: qwen3:32b
    apiBase: http://10.10.4.105:11434
    roles:
      - chat
      - edit
      - apply

context:
  - provider: code
  - provider: docs
  - provider: diff
  - provider: terminal
  - provider: folder
  - provider: codebase
  - provider: problems

prompts:
  - name: explain
    description: Объяснить код
    prompt: "Объясни что делает этот код, пошагово."
  - name: test
    description: Сгенерировать тесты
    prompt: "Напиши подробные unit-тесты для этого кода."
  - name: refactor
    description: Рефакторинг
    prompt: "Отрефактори код для лучшей читаемости и поддержки."
  - name: doc
    description: Добавить документацию
    prompt: "Добавь подробные docstring/комментарии к коду."

rules:
  - "Отвечай на русском"
  - "Следуй стилю существующего кода"
  - "При неуверенности — задавай уточняющие вопросы"
```

---

## Какая модель для чего

| Модель | Для чего использовать |
|--------|----------------------|
| **Qwen 3.6 (35B) Server** ⭐ | Основная — лучшее качество ответов, агент, сложные задачи |
| **Qwen 3.6 (27B Autocomplete)** | Tab-подсказки во время написания кода |
| **Qwen2.5-Coder 14B** | Альтернатива для автокомплита (быстрее, легче) |
| **Qwen3 32B** | Альтернативный агент если основной занят |

---

## Хоткеи и режимы

| Действие | Сочетание |
|----------|:---------:|
| Открыть чат | `Ctrl+L` |
| Открыть чат с выделенным кодом | `Ctrl+L` (с выделением) |
| Правка кода inline | `Ctrl+I` |
| Принять автокомплит | `Tab` |
| Отклонить автокомплит | `Esc` |
| Настройки Continue | `Ctrl+Shift+P` → **Continue: Open Config File** |
| Включить/выключить autocomplete | `Ctrl+Shift+P` → **Continue: Toggle Autocomplete** |

### Контекст через `@`
- `@codebase` — поиск по всему проекту
- `@file` — конкретный файл
- `@folder` — папка
- `@terminal` — последний вывод терминала
- `@problems` — текущие ошибки в коде
- `@diff` — текущие git-изменения

### Готовые промпты через `/`
- `/explain` — объяснить код
- `/test` — написать тесты
- `/refactor` — отрефакторить
- `/doc` — добавить документацию

### Режим Agent
В Continue панели переключатель **Chat / Agent** → выбрать Agent. Модель сама читает файлы, делает многошаговые задачи.

---

## Troubleshooting

| Проблема | Решение |
|---|---|
| `curl http://10.10.4.105:11434/api/tags` → `Connection refused` | Нет сетевого доступа. Проверить `ping 10.10.4.105`, VPN/маршрут. |
| Continue не видит модель | Проверить `~/.continue/config.yaml` — `apiBase: http://10.10.4.105:11434`. |
| Очень медленные ответы | Сервер занят. Подождать или сменить на **Qwen2.5-Coder 14B**. |
| Автокомплит не появляется | `Ctrl+Shift+P` → **Continue: Toggle Autocomplete Enabled**. Конфликт с Copilot? Отключить Copilot. |
| `rate limit` | Сервер не справляется. Подождать 30с и повторить. |

---

## 🆚 Отличие от рабочей машины Alex'а

Рабочая машина Alex'а (Debian + RX 9070 + Ollama локально) имеет **расширенный** config — те же 4 server-модели + дополнительно:

```yaml
# Дополнительные LOCAL модели на машине Alex'а (не нужны тонким клиентам!)
- name: Qwen 3.6 (35B)
  provider: ollama
  model: qwen3.6:35b
  apiBase: http://localhost:11434
  roles: [chat, edit, apply]
  capabilities: [tool_use]

- name: Qwen 3.6 (27B Autocomplete)
  provider: ollama
  model: qwen3.6:27b
  apiBase: http://localhost:11434
  roles: [autocomplete]

- name: Qwen 3.6 (35B Q8 MoE)
  provider: ollama
  model: qwen3.6:35b-a3b-q8_0
  apiBase: http://localhost:11434
  roles: [chat, edit, apply]
  capabilities: [tool_use]

- name: bge-m3 (local)
  provider: openai
  model: bge-m3
  apiBase: http://localhost:8765/v1
  apiKey: dummy
  roles: [embed]
```

→ Итого на машине Alex'а: **3 local Ollama + 4 server + 1 local embed = 8 моделей**.

Тонким клиентам **локальные не нужны** — у них нет GPU и Ollama не установлен.

---

*Сохранил: Кодо · 2026-05-13 на основе оригинального `VSCode_Server_Agent_Setup.md` присланного Alex'ом. Использовать как рабочий образец для подключения новых машин к серверу.*
