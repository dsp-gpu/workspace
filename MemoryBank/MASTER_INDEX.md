# 🗂️ DSP-GPU — MemoryBank MASTER INDEX

> **Workspace**: `E:\DSP-GPU\`
> **Organization**: `github.com/dsp-gpu`
> **Исходный проект**: `E:\C++\GPUWorkLib\` (монолит, не трогаем!)
> **Последнее обновление**: 2026-04-12

---

## 🚦 Статус: Миграция GPUWorkLib → dsp-gpu

| Фаза | Описание | Статус |
|------|----------|--------|
| [Фаза 0](tasks/TASK_ModArch_Phase0_Audit.md) | Аудит зависимостей | ✅ DONE |
| [Фаза 1](tasks/TASK_ModArch_Phase1_Skeleton.md) | CMake-скелеты 9 репо | ✅ DONE + pushed |
| [Фаза 2](tasks/TASK_ModArch_Phase2_Copy.md) | Копирование кода | ✅ DONE (все запушены) |
| [Фаза 3](tasks/TASK_ModArch_Phase3_CMake.md) | CMake-адаптация под новую структуру | ✅ DONE (target_sources заполнены, tests/CMakeLists.txt созданы) |
| [Фаза 3b](tasks/TASK_ModArch_Phase3b_Python.md) | Python bindings (8 pyd) | ✅ DONE (dsp_*_module.cpp + CMakeLists.txt + gpuworklib shim) |
| [Фаза 4](tasks/TASK_ModArch_Phase4_Test.md) | Тестирование на GPU (Linux) | ⬜ BACKLOG |

---

## 🔑 Первое что нужно сделать

### 1. Настроить GitHub токен для org `dsp-gpu`

Создать PAT на `github.com` → Settings → Developer settings → Tokens (classic):
- ✅ `repo` (полный блок)
- ✅ `write:org`

Вставить токен в `.vscode/mcp.json`:
```
"GITHUB_PERSONAL_ACCESS_TOKEN": "__REPLACE_WITH_DSP_GPU_ORG_TOKEN__"
```

### 2. Запушить все 9 репо (коммиты готовы локально!)

```bash
cd E:/DSP-GPU
for r in core spectrum stats signal_generators heterodyne linalg radar strategies; do
  cd $r && git push -u origin main && cd ..
done
cd DSP && git push -u origin main
```

---

## 📁 Структура workspace

```
E:\DSP-GPU\
├── 📄 CLAUDE.md              ← конфиг Кодо (AI assistant)
├── 📄 DSP-GPU.code-workspace ← открывать этот файл в VSCode!
├── 📁 MemoryBank/            ← этот каталог (не в git)
├── 📁 .vscode/               ← VSCode + MCP настройки
├── 📁 .claude/               ← Claude Code настройки
│
├── 📦 core/              ← DrvGPU
├── 📦 spectrum/          ← FFT + filters + lch_farrow
├── 📦 stats/             ← statistics
├── 📦 signal_generators/ ← CW/LFM/Noise/Script
├── 📦 heterodyne/        ← Dechirp/NCO/Mix
├── 📦 linalg/            ← vector_algebra + capon
├── 📦 radar/             ← range_angle + fm_correlator
├── 📦 strategies/        ← pipelines
└── 📦 DSP/               ← мета-репо
```

---

## 📚 Спецификации

| Документ | Описание |
|----------|----------|
| [modular_architecture_plan.md](specs/modular_architecture_plan.md) | Полный план архитектуры |
| [modular_architecture_plan_REVIEW_v2.md](specs/modular_architecture_plan_REVIEW_v2.md) | Последнее ревью v2 |
| [TASK_Modular_Architecture_INDEX.md](tasks/TASK_Modular_Architecture_INDEX.md) | Индекс всех задач |

---

## ⚠️ Важные ссылки

- **Рабочий код**: `E:\C++\GPUWorkLib\` (Windows) / `.../C++/GPUWorkLib/` (Debian)
- **GitHub org**: `github.com/dsp-gpu`
- **Новый workspace**: `E:\DSP-GPU\` (этот каталог)

---

*Created: 2026-04-12 | Maintained by: Кодо (AI Assistant)*
