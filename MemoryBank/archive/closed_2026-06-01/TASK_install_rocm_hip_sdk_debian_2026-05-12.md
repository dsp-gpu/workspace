# TASK — Установить ROCm HIP SDK на Debian (рабочая машина)

> **Создано**: 2026-05-12
> **Статус**: ✅ **DONE 2026-05-13** — установлено через apt из noble repo (offline-pack `.deb` не подошли к Debian 13)
> **Платформа**: Debian Linux + ROCm 7.2 + AMD Radeon RX 9070 (gfx1201)
> **Разблокировано**: сборка DSP-GPU из исходников ✅ (acceptance 26/26 PASS) + Phase B P1 ✅ (43/50 PASS)

---

## ✅ Итог 2026-05-13

**Offline-pack не подошёл к Debian 13 trixie** — `.deb` собраны на Ubuntu noble имеют libc6=2.39 / gcc-13=13.3.0 в зависимостях, а Debian 13 на libc=2.41 / gcc-14. apt отказался ставить (Reached two conflicting decisions), система не изменена.

**Решение**: установка из подключённого `repo.radeon.com/rocm/apt/7.2/noble` через apt, **без** gcc-13 toolchain:

```bash
sudo apt install -y hipcc hip-dev rocm-cmake rocm-llvm \
    hipfft hipfft-dev rocfft rocfft-dev \
    rocblas rocblas-dev rocsolver rocsolver-dev \
    rocprim-dev rocrand rocrand-dev \
    hipblas hipblas-dev rocm-opencl-runtime
```

~3.7 GB скачано (была одна обрыв сети — повторил с `--fix-missing`). AMD's `hipcc` использует **свой собственный** `rocm-llvm` (clang 22.0.0git), не системный gcc, поэтому конфликта зависимостей не возникает.

**Smoke 9/9 PASS**:
- `/opt/rocm/bin/hipcc` ✅
- HIP version 7.2.26015 / AMD clang 22.0.0git roc-7.2.0 ✅
- `/opt/rocm-7.2.0/lib/cmake/hip/hip-config.cmake` ✅
- headers (hipfft / rocblas / rocsolver / rocprim / rocrand) ✅
- `/opt/rocm-7.2.0/llvm/bin/clang` ✅
- `rocminfo | grep gfx1201` — RX 9070 виден ✅

Подробности: `changelog/2026-05.md` секция 2026-05-13.

---

## ✅ Прогресс 2026-05-12 (вечер) — Шаг 0: offline-pack собран

ROCm 7.2 devkit `.deb` пакеты скачаны на WSL2 Ubuntu 24.04 (noble) через `apt-get install --download-only` из репо `https://repo.radeon.com/rocm/apt/7.2 noble main`.

**Артефакт**: `D:\offline-debian-pack\7_dop_files\lib_deb\` (Windows) → перенести в `/home/alex/offline-debian-pack/7_dop_files/lib_deb/` на рабочем Debian.

| Параметр | Значение |
|----------|----------|
| Файлов `.deb` | **76** |
| Размер | **3.7 GB** |
| Системные libc/libstdc++ | удалены (используются debian-родные) |
| Покрытие | hipcc + hip-runtime-amd + rocm-llvm + rocm-cmake + hipfft-dev + rocblas-dev + rocsolver-dev + rocprim-dev + rocrand-dev + транзитивные deps |

**Команда установки на рабочем Debian**:
```bash
sudo apt install /home/alex/offline-debian-pack/7_dop_files/lib_deb/*.deb
# fallback:
sudo dpkg -i /home/alex/offline-debian-pack/7_dop_files/lib_deb/*.deb
sudo apt-get install -f
```

**Проверка после установки** (как в разделе "Проверка после установки" ниже).

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

*Created: 2026-05-12 by Кодо. `.deb` собраны вечером того же дня в offline-pack (3.7 GB, 76 файлов). Установка на рабочем Debian — следующий шаг.*
