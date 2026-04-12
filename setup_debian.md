# 🚀 DSP-GPU — Setup на Debian (новая машина)

> Это инструкция для разработчика на Debian/ROCm (Radeon 9070 / gfx1201).
> Выполнять по порядку.

---

## Шаг 1 — Системные зависимости

```bash
sudo apt update
sudo apt install -y cmake ninja-build git python3-pip nodejs npm

# Python пакеты
pip3 install pybind11 numpy

# uvx (для MCP серверов)
pip3 install uv
```

---

## Шаг 2 — Проверить ROCm

```bash
rocm-smi --version        # должно быть 7.2+
rocm-smi --showproductname  # Radeon RX 9070 / gfx1201
```

Если ROCm не установлен → [официальная инструкция AMD](https://rocm.docs.amd.com/en/latest/deploy/linux/quick_start.html)

---

## Шаг 3 — Клонировать workspace

```bash
mkdir ~/dsp-gpu && cd ~/dsp-gpu

# Главный workspace (CLAUDE.md, MemoryBank, настройки)
git clone https://github.com/dsp-gpu/workspace .

# Все 9 репо с кодом
git clone https://github.com/dsp-gpu/core
git clone https://github.com/dsp-gpu/spectrum
git clone https://github.com/dsp-gpu/stats
git clone https://github.com/dsp-gpu/signal_generators
git clone https://github.com/dsp-gpu/heterodyne
git clone https://github.com/dsp-gpu/linalg
git clone https://github.com/dsp-gpu/radar
git clone https://github.com/dsp-gpu/strategies
git clone https://github.com/dsp-gpu/DSP
```

---

## Шаг 4 — Настроить MCP (для Claude Code)

```bash
# Скопировать пример конфига
cp ~/dsp-gpu/.vscode/mcp.example.json ~/dsp-gpu/.vscode/mcp.json
```

Открыть `~/dsp-gpu/.vscode/mcp.json` и заменить все `__REPLACE_*__`:

| Placeholder | Что вставить |
|-------------|-------------|
| `__REPLACE_WITH_DSP_GPU_ORG_TOKEN__` | GitHub PAT (получить от Алекса) |
| `__REPLACE_WITH_PATH_TO_supermemory-mcp.js__` | `~/.claude/supermemory-mcp.js` (скопировать у Алекса) |
| `__REPLACE_WITH_SUPERMEMORY_API_KEY__` | API ключ SuperMemory (получить у Алекса) |
| `__REPLACE_WITH_WOLFRAM_API_KEY__` | API ключ Wolfram (получить у Алекса) |
| `__REPLACE_WITH_WORKSPACE_PATH__` | `/home/YOUR_USERNAME/dsp-gpu` |
| `__REPLACE_WITH_DSP_REPO_PATH__` | `/home/YOUR_USERNAME/dsp-gpu/DSP` |

---

## Шаг 5 — Установить Claude Code

```bash
# Установить через npm
npm install -g @anthropic-ai/claude-code

# Проверить
claude --version
```

---

## Шаг 6 — Открыть workspace в VSCode

```bash
code ~/dsp-gpu/DSP-GPU.code-workspace
```

> VSCode автоматически предложит установить расширения. Согласиться.

---

## Шаг 7 — Сборка всех репо

```bash
bash ~/dsp-gpu/DSP/scripts/build_all_debian.sh
```

Ожидаемый результат — все 8 репо собраны без ошибок.

---

## Шаг 8 — Запуск тестов на GPU

```bash
# Core
~/dsp-gpu/core/build/test_core_main

# Spectrum
~/dsp-gpu/spectrum/build/test_spectrum_main
```

Если тесты проходят — установка завершена! ✅

---

## Структура после установки

```
~/dsp-gpu/               ← workspace (этот репо)
├── CLAUDE.md             ← конфиг Claude Code AI
├── MemoryBank/           ← история задач и сессий
├── .vscode/
│   ├── mcp.json          ← твой локальный (с токенами, не в git!)
│   └── mcp.example.json  ← шаблон (в git)
├── .claude/
│   └── settings.json     ← разрешения Claude Code
│
├── core/                 ← отдельный git-репо
├── spectrum/             ← отдельный git-репо
├── stats/                ← отдельный git-репо
├── ...
└── DSP/                  ← мета-репо
```

---

## Типичные проблемы

| Проблема | Решение |
|----------|---------|
| `find_package(hip) FAILED` | `export CMAKE_PREFIX_PATH=/opt/rocm` |
| `hipfft not found` | `sudo apt install hipfft-dev` |
| `rocprim not found` | `sudo apt install rocprim-dev` |
| `claude: command not found` | `npm install -g @anthropic-ai/claude-code` |
| MCP GitHub ошибка 401 | Заменить токен в `mcp.json` |

---

*Создан: 2026-04-12 | Кодо (AI Assistant) для проекта DSP-GPU*
