# GPU Targeting: архитектура и взаимодействие между зонами

> **Статус**: ✅ BASE v1.0  
> **Дата**: 2026-04-18 | **Основа**: `1_MultiProject_Architecture.md`, `2_Variants_Analysis.md`

---

## 🖥️ Исходная ситуация

```
ЗОНА 0 — DSP-GPU       AMD Radeon 9070 / ROCm 7.2 / gfx1201
ЗОНА 1 — SMI100        ?? (другая карта или вообще без GPU — сервер)
ЗОНА 2 — LocalProject  ?? (другая карта: старый AMD / NVIDIA / Intel)
```

**Текущее состояние DSP-GPU**:
- `main` ветка → Linux / ROCm / HIP / hipFFT
- Разные машины — разные поколения AMD GPU (gfx1201, gfx1100, gfx906...)

**Проблема**: при передаче кода через SMI100 в LocalProject целевой GPU отличается.
Нужен механизм выбора архитектуры без изменения исходного кода.

---

## 🗺️ Что меняется от GPU к GPU

```
GPU_BACKEND   HIP (AMD ROCm) | CPU (сервер без GPU)
GPU_ARCH      gfx1201 | gfx1100 | gfx906 | gfx900 | auto
ROCM_VERSION  7.2 | 6.x | 5.x
```

Это три независимых оси. Их комбинации задаются один раз в CMakePresets.json.

---

## 🎛️ Механизм: GPU-ось в CMakePresets.json

Добавляется как hidden-пресеты, которые наследуются в финальных:

```jsonc
{
  "version": 6,
  "configurePresets": [

    // ── GPU hidden presets ─────────────────────────────────────────
    {
      "name": "gpu-amd-rdna4",
      "hidden": true,
      "cacheVariables": {
        "GPU_BACKEND":  "HIP",
        "GPU_ARCH":     "gfx1201",
        "ROCM_VERSION": "7.2"
      }
    },
    {
      "name": "gpu-amd-rdna3",
      "hidden": true,
      "cacheVariables": {
        "GPU_BACKEND":  "HIP",
        "GPU_ARCH":     "gfx1100",
        "ROCM_VERSION": "6.2"
      }
    },
    {
      "name": "gpu-amd-legacy",
      "hidden": true,
      "cacheVariables": {
        "GPU_BACKEND":  "HIP",
        "GPU_ARCH":     "gfx906",
        "ROCM_VERSION": "5.7"
      }
    },
    {
      "name": "gpu-cpu-only",
      "hidden": true,
      "cacheVariables": {
        "GPU_BACKEND": "CPU",
        "GPU_ARCH":    "none"
      }
    },

    // ── Итоговые пресеты = deps-пресет × gpu-пресет ───────────────
    {
      "name": "full-rdna4",
      "displayName": "Все зависимости — Radeon RX 9070 (gfx1201)",
      "inherits": ["full", "gpu-amd-rdna4"]
    },
    {
      "name": "full-cpu",
      "displayName": "Все зависимости — только CPU (нет GPU)",
      "inherits": ["full", "gpu-cpu-only"]
    }
  ]
}
```

`GPU_BACKEND` / `GPU_ARCH` пробрасываются в FetchContent через `CMAKE_CACHE_ARGS` →
каждый модуль (core, spectrum...) получает их автоматически при сборке.

---

## 📊 Анализ по вариантам

---

### Вариант 1 — BASE (bare mirrors + submodules)

**Как GPU проходит через архитектуру**:
```
Project 2: cmake --preset minimal-opencl
    └─ GPU_BACKEND=OPENCL пробрасывается в FetchContent
    └─ dsp_core, dsp_linalg собираются с OPENCL флагами
    └─ SMI100 не участвует в сборке вообще
```

**Ветки**: bare mirror хранит ветку `main` (HIP/ROCm).
GPU_ARCH задаётся локально в пресете под конкретную машину:
```

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| GPU выбирается на стороне Project 2 | SMI100 не знает что сдeлает Project 2 |
| SMI100 ничего не собирает — GPU не нужен | bare mirror хранит обе ветки (2× место) |
| Пресет = 1 строка для смены GPU | Первая сборка — Project 2 нужна сеть до SMI100 |
| Можно комбинировать dep-пресет × gpu-пресет | — |

---

### Вариант 2 — Full workspace (SMI100 собирает)

**Как GPU проходит через архитектуру**:
```
SMI100:     cmake --preset deploy-stats-spectrum + gpu-amd-rdna3
                └─ собирает ПОД СВОЮ карту (gfx1100)
                └─ Python примеры работают на карте SMI100

Project 2:  cmake --preset minimal-opencl
                └─ собирает ПОД СВОЮ карту (OPENCL auto)
                └─ НЕЗАВИСИМО от того что собрал SMI100
```

**Важно**: SMI100 и Project 2 собирают **независимо** под разные GPU.
Бинарники с SMI100 в Project 2 НЕ попадают — только исходники.

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| SMI100 проверяет сборку под свой GPU | SMI100 нужен GPU (или CPU-only режим) |
| Project 2 независимо выбирает свой GPU | Два независимых build toolchain |
| Python примеры тестируются на SMI100 | GPU конфиг SMI100 ≠ GPU конфиг Project 2 |
| Ошибки сборки видны до попадания в 2 | Если SMI100 без GPU — нужен cpu-only пресет |

**Случай: SMI100 без GPU** (обычный сервер):
```jsonc
{ "name": "deploy-ci", "inherits": ["mirror-full", "gpu-cpu-only"] }
```
Собирается без GPU — только проверяется компиляция кода, не исполнение ядер.

---

### Вариант 3 — Dist из workspace

**Как GPU проходит через архитектуру**:
```
SMI100:     собирает workspace (под свой GPU) → build_dist.sh
                └─ в dist-repo попадают ИСХОДНИКИ (не бинарники)
                └─ GPU config НЕ зашивается в dist

Project 2:  git clone dsp-dist → cmake --preset ...-opencl
                └─ собирает под свой GPU по исходникам
```

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| dist-repo GPU-нейтральный (исходники) | Нужен Вариант 2 как основа |
| Project 2 выбирает GPU свободно | Дублирование: workspace + dist |
| — | build_dist.sh не учитывает GPU ветки (нужна логика выбора) |
| — | Если dist собран с HIP-кодом, Project 2 с OpenCL не соберёт |

**Проблема веток**: dist-repo должен содержать правильную ветку под GPU.
Либо держать в dist и `main/` и `nvidia/` — либо собирать два dist-репо.

---

### Вариант 4 — Копии папок ❌

**GPU-взаимодействие**: отсутствует как концепция.
Копируются файлы, никакой информации о том под какой GPU они собирались.
Project 2 сам разбирается. Патч обратно в 0 — вручную.

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| — | GPU контекст полностью теряется |
| — | Нет гарантии что скопированы нужные ветки |

---

### Вариант 5 — Dist из bare mirrors ✅

**Как GPU проходит через архитектуру**:
```
SMI100:     bare mirrors хранят main + nvidia ветки
            build_dist.sh — параметр BRANCH задаёт какую ветку паковать

            ./build_dist.sh --branch main   → dist-hip-v1.0.0.git   (ROCm)
            ./build_dist.sh --branch nvidia → dist-ocl-v1.0.0.git  (OpenCL)

Project 2:  выбирает нужный dist:
            git clone git@smi100.local:dist/dsp-hip-v1.0.0.git
            или
            git clone git@smi100.local:dist/dsp-ocl-v1.0.0.git
            cmake --preset from-dist-rdna3
```

Две dist-repo — одна под каждую ветку. Или одна с подпапками:
```
dsp-dist/
├── hip/       ← из ветки main
│   ├── core/
│   └── ...
└── opencl/    ← из ветки nvidia
    ├── core/
    └── ...
```

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| GPU выбор = выбор dist-репо или подпапки | dist удваивается (hip + opencl) |
| SMI100 без GPU (не собирает, только пакует) | build_dist.sh сложнее (логика веток) |
| Project 2: один clone → cmake → готово | Тег dist-v1.0.0-hip, dist-v1.0.0-ocl — версии |
| Версионирование: тег dist включает GPU суффикс | — |
| Нет зависимости от toolchain на SMI100 | — |

---

## 🗂️ Сравнение: где живёт GPU конфиг

```
Вариант  │ SMI100 знает GPU?  │ Project 2 выбирает GPU?  │ Сборка на SMI100
─────────┼────────────────────┼──────────────────────────┼─────────────────
1        │ Нет                │ Да (пресет)               │ Нет
2        │ Да (свой пресет)   │ Да (свой пресет)          │ Да (свой GPU)
3        │ Да (через 2)       │ Частично (ветка в dist)   │ Да (свой GPU)
4        │ Нет (копирует всё) │ Самостоятельно            │ Нет
5        │ Да (выбор ветки)   │ Да (выбор dist)           │ Нет
```

---

## 🎯 Вывод

**Самое чистое решение**:

- GPU конфиг живёт **только в CMakePresets.json** (на каждой машине свой)
- Исходный код и зеркала **GPU-нейтральны** (содержат обе ветки)
- Ветка (`main` vs `nvidia`) = единственное что зависит от GPU-платформы
- `GPU_ARCH` (gfx1201, gfx1100...) = детали, задаются локально

```
Для dev-команды (Вариант 1):
  cmake --preset full-rdna4      ← каждый под свою карту

Для SMI100 без GPU (Вариант 2, сборка только для проверки):
  cmake --preset mirror-full + gpu-cpu-only

Для конечного пользователя (Вариант 5):
  git clone dsp-dist-hip  или  dsp-dist-ocl
  cmake --preset from-dist-rdna3
```

---

*Created: 2026-04-18 | Version: BASE v1.0 | Author: Кодо + Alex*
