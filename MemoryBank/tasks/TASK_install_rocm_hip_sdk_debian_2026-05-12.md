# TASK — Установить ROCm HIP SDK на Debian (рабочая машина)

> **Создано**: 2026-05-12
> **Статус**: ⬜ TODO (требует sudo)
> **Платформа**: Debian Linux + ROCm 7.2 + AMD Radeon RX 9070 (gfx1201)
> **Блокирует**: сборку DSP-GPU из исходников + `S1 T6` ([TASK_Stats_Review](TASK_Stats_Review_2026-04-15.md)) + Phase B `P1` ([TASK_python_migration_phase_B_FAILS](TASK_python_migration_phase_B_FAILS_2026-05-04.md))

---

## Контекст

На рабочей машине (`/home/alex/DSP-GPU`) установлен **только ROCm runtime** — достаточно чтобы запускать прекомпилированные `.so` в `DSP/Python/libs/`, но **не хватает** для пересборки из исходников.

### ✅ Уже стоит (runtime)
```
rocm-core       7.2.0.70200-43~24.04
hsa-rocr        1.18.0.70200-43~24.04     ← HSA Runtime
rocm-smi-lib    7.8.0.70200-43~24.04
rocminfo        1.0.0.70200-43~24.04
```

### ❌ Не стоит (devkit — для сборки)
```
hipcc                ← компилятор HIP (.hip → объекты)
hip-runtime-amd      ← HIP runtime headers + .so
rocm-llvm            ← LLVM fork от AMD (clang для gfx1201)
rocm-cmake           ← CMake-модули для find_package(hip)
hipfft / rocblas / rocsolver / rocprim / rocrand  ← libs DSP-GPU зависит
```

Каталог `/opt/rocm-7.2.0/lib/cmake/hip/` отсутствует → `find_package(hip REQUIRED)` падает.

---

## APT-репо уже настроены

Файл `/etc/apt/sources.list.d/*rocm*`:
```
deb [arch=amd64 signed-by=/etc/apt/keyrings/rocm.gpg]
    https://repo.radeon.com/rocm/apt/7.2 noble main
deb [arch=amd64,i386 signed-by=/etc/apt/keyrings/rocm.gpg]
    https://repo.radeon.com/graphics/7.2/ubuntu noble main
```

Все нужные пакеты есть в индексе (`apt-cache search hipcc` находит).

---

## Команда установки (дома, под sudo)

### Вариант 1 — meta-пакет (всё одной командой, ~3-5 ГБ)
```bash
sudo apt update
sudo apt install rocm-hip-sdk
```

`rocm-hip-sdk` тянет:
- hipcc + hip-runtime-amd + rocm-llvm
- rocm-cmake + rocm-core (уже стоит)
- hipfft, rocblas, rocsolver, rocprim, rocrand, rocsparse, miopen...

### Вариант 2 — минимально нужное для DSP-GPU (~1.5-2 ГБ)
```bash
sudo apt update
sudo apt install -y \
    hipcc \
    hip-runtime-amd \
    rocm-cmake \
    rocm-llvm \
    hipfft-dev \
    rocblas-dev \
    rocsolver-dev \
    rocprim-dev \
    rocrand-dev
```

> 🎯 **Рекомендую Вариант 1** — DSP-GPU модули зависят от большинства этих библиотек, лучше поставить всё разом, не догонять по одному при сборке.

---

## Проверка после установки

```bash
# 1. hipcc нашёлся
which hipcc                  # ожидаемо: /opt/rocm-7.2.0/bin/hipcc
hipcc --version              # должно показать AMD clang + HIP version

# 2. CMake находит HIP
ls /opt/rocm-7.2.0/lib/cmake/hip/hip-config.cmake   # должен существовать

# 3. GPU виден
rocminfo | grep -A2 "Marketing Name"                # должен показать RX 9070 + gfx1201

# 4. Тестовая сборка одного модуля
cd /home/alex/DSP-GPU/core
cmake -S . -B build --preset debian-local-dev
cmake --build build --parallel 8
# Ожидаемо: 0 errors, .so/.a в build/

# 5. Запуск C++ теста
cd build && ctest --output-on-failure
```

---

## Что делать после установки

Разблокируются:
1. **`S1 T6`** — `Build + ctest stats on Debian GPU` ([TASK_Stats_Review_2026-04-15.md](TASK_Stats_Review_2026-04-15.md))
2. **`P1`** — Phase B FAILS разбор для тестов с пересборкой `.so` ([TASK_python_migration_phase_B_FAILS_2026-05-04.md](TASK_python_migration_phase_B_FAILS_2026-05-04.md))
3. **Все** C++ работы из MemoryBank/tasks где требуется hipcc

---

## Возможные грабли

| Грабли | Решение |
|--------|---------|
| `E: Unable to locate package rocm-hip-sdk` | `sudo apt update` (репо изменилось) |
| Конфликт версий ROCm 7.2 vs 7.x | проверить `apt policy rocm-core` — должна быть `7.2.0.70200-43~24.04` |
| `ERROR: GPU not detected` после install | `sudo usermod -aG render,video $USER` + relogin |
| hipcc собирает но `Cannot find offload-arch=gfx1201` | устаревший LLVM, поставить `rocm-llvm` явно |
| `/opt/rocm` symlink сломан | `sudo update-alternatives --config rocm` → выбрать `/opt/rocm-7.2.0` |

---

## Acceptance

- [ ] `which hipcc` находит компилятор
- [ ] `hip-config.cmake` существует
- [ ] `cmake --preset debian-local-dev` проходит на одном модуле (core)
- [ ] `ctest` запускается (тесты могут падать — это уже отдельная история)

---

*Created: 2026-05-12 by Кодо. Нужно ставить дома, когда есть время на ~3-5 ГБ скачивание.*
