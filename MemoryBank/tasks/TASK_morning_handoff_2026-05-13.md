# TASK — Утренний handoff 13.05: запуск всего что подготовлено

> **Создано**: 2026-05-12 ночью (после полной сессии миграции).
> **Статус**: ⬜ TODO — выполнить утром 13.05 на рабочем Debian.
> **Effort**: 1.5-3 часа (если всё зелёное), до 6 часов (если разбор багов миграции).
> **Платформа**: Debian + RX 9070 (gfx1201) + ROCm 7.2 runtime (уже стоит).

---

## 🎯 Цель утра

Закрыть три параллельных трека, подготовленных вечером 12.05:
1. **ROCm devkit** установить из offline-pack (без интернета)
2. **Namespace migration 7 модулей** — проверить на сборке + тестах
3. **Continue embedding server** (опц.) — поднять локальный bge-m3 на 8765

Если 1+2 зелёные → день успешный, можно идти дальше по архитектуре.

---

## ✅ Что уже сделано вечером 12.05 (в origin/main, нужно только `git pull`)

### 1. Миграция namespace (7/7 модулей в DSP-GPU)
30 коммитов в 7 репо + 9 коммитов в workspace. Детали:
- Полный список и инструкция тестирования → **`MemoryBank/tasks/TASK_namespace_migration_debian_acceptance_2026-05-12.md`**
- Спека плана (для spectrum, рецепт) → `MemoryBank/specs/namespace_migration_spectrum_plan_2026-05-12.md`
- Триггерный таск → `MemoryBank/.future/TASK_namespace_migration_legacy_to_dsp.md` (статус DONE 7/7)

| Репо | Было | Стало |
|------|------|-------|
| spectrum | fft_processor / filters / lch_farrow | dsp::spectrum |
| stats | statistics / snr_estimator / gpu_sort / snr_defaults | dsp::stats (+ nested) |
| strategies | strategies | dsp::strategies |
| signal_generators | signal_gen | dsp::signal_generators |
| linalg | vector_algebra / capon / matrix_ops | dsp::linalg |
| radar | range_angle + drv_gpu_lib (fm_correlator) | dsp::radar |
| heterodyne | drv_gpu_lib (целиком) | dsp::heterodyne |

⚠️ **core не трогали** — `drv_gpu_lib::*` остаётся в core по правилу 10-modules.md.

### 2. Скрипты автоматизации (`scripts/debian_deploy/` в workspace)
- `install_rocm_devkit.sh` — apt install 76 .deb из offline-pack + smoke
- `acceptance_namespace_migration.sh` — авто-чеклист сборки + ctest + Python для 7 репо
- `embed_server.py` + `embed.service` — bge-m3 ONNX FastAPI + systemd
- `README.md` — порядок действий + грабли

### 3. Offline-pack (на флешке/SSD, нужно примонтировать)
- ROCm devkit `.deb`: **76 файлов / 3.7 GB** в `7_dop_files/lib_deb/`
  Источник: WSL2 Ubuntu 24.04 noble, скачано через apt-get install --download-only
- `onnxruntime` + `numpy` wheels для cp312/manylinux_2_28_x86_64
- bge-m3 ONNX модель `1_models/bge-m3/onnx/` + tokenizer.json

Связанные таски:
- `MemoryBank/tasks/TASK_install_rocm_hip_sdk_debian_2026-05-12.md` (что качали)
- `MemoryBank/tasks/TASK_continue_embedding_setup.md` (план embedding)

---

## 🚀 Порядок действий утром

### Шаг 0 — Pre-flight (5 мин)

```bash
# 1. Подключить SSD с offline-pack (если ещё нет)
lsblk
sudo mkdir -p /mnt/ssd
sudo mount /dev/sdb1 /mnt/ssd   # или ntfs-3g если NTFS
ls /mnt/ssd/offline-debian-pack/   # должны быть 1_models, 3_python_wheels, 7_dop_files

# 2. Скопировать offline-pack на локальный диск (быстрее apt из локального FS)
sudo cp -r /mnt/ssd/offline-debian-pack /home/alex/
sudo chown -R alex:alex /home/alex/offline-debian-pack

# 3. git pull всех 10 репо
cd /home/alex/DSP-GPU
git pull --ff-only
for r in core spectrum stats strategies signal_generators heterodyne linalg radar DSP; do
  git -C $r pull --ff-only
done

# 4. Сверка: должны быть видны новые коммиты миграции
git -C spectrum log --oneline -5   # ожидаем f7a9a26 / fb56ef3 / 00ace9c / 675fa1e
git -C stats log --oneline -5
# ... и т.д. для всех 7 мигрированных репо
```

**Acceptance**: 10 репо подтянуты, видны коммиты вчерашней миграции.

---

### Шаг 1 — ROCm devkit install (~5-10 мин)

```bash
cd /home/alex/DSP-GPU/scripts/debian_deploy
chmod +x install_rocm_devkit.sh
bash install_rocm_devkit.sh
```

**Acceptance**: 9/9 PASS в smoke check. `which hipcc` → `/opt/rocm-7.2.0/bin/hipcc`.

**Если упало**:
- `apt: dependency problems` → `sudo apt-get install -f -y`
- `gfx1201 not detected` → `sudo usermod -aG render,video $USER` + перелогин
- Подробности → внутри `install_rocm_devkit.sh` (лог `/tmp/rocm_devkit_install.log`)

---

### Шаг 2 — Acceptance namespace migration (~1-2 ч)

```bash
cd /home/alex/DSP-GPU
bash scripts/debian_deploy/acceptance_namespace_migration.sh
```

Что проверяется:
- **A. Build** всех 7 репо по порядку зависимостей (core → spectrum/stats → strategies/sig_gen/heterodyne/linalg → radar)
- **B. C++ ctest** для каждого
- **C. Python smoke**: import 8 `dsp_*` модулей
- **D. Python integration**: `t_signal_to_spectrum.py`, `t_hybrid_backend.py`

**Acceptance**: 0 FAIL (SKIP допустим если GPU не виден).

**Если упало**:
| Ошибка | Где смотреть | Решение |
|--------|-------------|---------|
| `'fft_processor' has not been declared` | компиляция | пропущен FQN replace — `grep -r 'fft_processor::' <repo>/` |
| `'spectrum/X.hpp': No such file` | компиляция | пропущен `#include <spectrum/...>` → `<dsp/spectrum/...>` |
| `'IBackend' was not declared` в heterodyne | компиляция .cpp | проверить `using namespace ::drv_gpu_lib;` после `namespace dsp::heterodyne {` |
| Python `ImportError: dsp_X` | загрузка .so | `.so` не собран или не в `DSP/Python/libs/` (Auto-deploy POST_BUILD) |

**Полный список граблей + rollback план** → `MemoryBank/tasks/TASK_namespace_migration_debian_acceptance_2026-05-12.md`

**При зелёном результате**:
1. Закрыть `.future/TASK_namespace_migration_legacy_to_dsp.md` (переместить в `changelog/` или удалить)
2. Опц. поставить тег `v0.X.0-namespace-migration` на 7 репо (release-manager агент)
3. Записать в `MemoryBank/sessions/2026-05-13.md` "namespace migration acceptance PASSED"

---

### Шаг 3 (опц.) — Embed server для Continue (~1 ч)

Если время есть и хочется ускорить индексацию `@codebase`.

```bash
# 1. Установить Python wheels (одно из 3-х доступных мест в offline-pack)
pip install --no-index --find-links /home/alex/offline-debian-pack/3_python_wheels \
    onnxruntime fastapi uvicorn tokenizers

# 2. Скопировать скрипт + service
mkdir -p ~/.continue ~/.config/systemd/user
cp /home/alex/DSP-GPU/scripts/debian_deploy/embed_server.py ~/.continue/
cp /home/alex/DSP-GPU/scripts/debian_deploy/embed.service ~/.config/systemd/user/

# 3. Standalone smoke (без systemd)
python3 ~/.continue/embed_server.py &
sleep 8
curl -s http://localhost:8765/health
curl -s -X POST http://localhost:8765/v1/embeddings \
    -H 'content-type: application/json' \
    -d '{"model":"bge-m3","input":["hello","привет"]}' | head -c 200
kill %1

# 4. Включить через systemd
systemctl --user daemon-reload
systemctl --user enable --now embed.service
systemctl --user status embed.service

# 5. Добавить в ~/.continue/config.yaml:
#   models:
#     - name: bge-m3 (local)
#       provider: openai
#       model: bge-m3
#       apiBase: http://localhost:8765/v1
#       apiKey: dummy
#       roles: [embed]
```

**Acceptance**: `dim: 1024` в ответе на тестовый запрос, Continue индексирует через локальный сервер.

Подробности — в `scripts/debian_deploy/README.md`.

---

## 📋 Чеклист "что не забыть"

- [ ] SSD/флешка с offline-pack принесена на работу
- [ ] SSH ключи доступны (для git pull github)
- [ ] `git pull` всех 10 репо
- [ ] ROCm runtime (rocminfo) уже стоит — НЕ путать с devkit
- [ ] Перед install_rocm_devkit.sh — проверить что `/home/alex/offline-debian-pack/7_dop_files/lib_deb/` содержит ~76 .deb
- [ ] После Шаг 2 PASS — обновить MemoryBank (sessions + changelog + закрыть .future таск)

---

## 🗂️ Связанные файлы (полная карта)

### TASK файлы (что и зачем)
- `tasks/TASK_morning_handoff_2026-05-13.md` ← **этот файл, точка входа**
- `tasks/TASK_install_rocm_hip_sdk_debian_2026-05-12.md` — детальный план ROCm install
- `tasks/TASK_continue_embedding_setup.md` — детальный план embed server
- `tasks/TASK_namespace_migration_debian_acceptance_2026-05-12.md` — чеклист тестирования миграции
- `.future/TASK_namespace_migration_legacy_to_dsp.md` — исходный таск миграции (теперь IN_PROGRESS → DONE после Шаг 2)

### Спеки
- `specs/namespace_migration_spectrum_plan_2026-05-12.md` — рецепт миграции (spectrum как пилот)
- `specs_Linux_Radion_9070/INSTALL_DEBIAN_offline_2026-05-10.md` — общая инструкция offline-install
- `specs_Linux_Radion_9070/offline_pack_download_list_2026-05-10.md` — что в offline-pack

### Скрипты (рабочие инструменты)
- `scripts/debian_deploy/install_rocm_devkit.sh` — Шаг 1
- `scripts/debian_deploy/acceptance_namespace_migration.sh` — Шаг 2
- `scripts/debian_deploy/embed_server.py` + `embed.service` — Шаг 3
- `scripts/debian_deploy/README.md` — handoff внутри scripts/

---

## 🏁 Что в конце дня (когда всё зелёное)

1. `MemoryBank/sessions/2026-05-13.md` — что закрыли
2. `MemoryBank/changelog/2026-05.md` — одна строка
3. `.future/TASK_namespace_migration_legacy_to_dsp.md` → переместить в `changelog/` (закрыт)
4. Этот TASK файл (`TASK_morning_handoff_2026-05-13.md`) → пометить ✅ DONE и/или удалить
5. Опц. тег `v0.X.0-namespace-migration` на 7 репо

---

*Created: 2026-05-12 ~23:00 (Windows session конец). Кодо записала чтобы Alex не забыл утром после сна. Спокойной ночи 🌙*
