# DSP-GPU · Распределённая сборка через SMI100

> **Единая точка входа** в документацию по распределённой сборке DSP-GPU
> **Версия**: 2026-04-19 · этап 1 — декомпозиция завершена

---

## 🗺 Карта местности в одной картинке

```
         ┌────────── ИНТЕРНЕТ ──────────┐
         │  github.com/dsp-gpu/*        │  ← Zone 0 публичная разработка
         │  (10 репо, public)           │
         └──────────────┬───────────────┘
                        │  🧑‍🔧 promote_to_smi100.sh (ВРУЧНУЮ Alex-ом)
                        ▼
         ┌─── ПК Alex (E:\DSP-GPU\) ───┐
         │  _release_git/smi100_*.git  │  ← release-only bare
         │  (в .gitignore workspace)   │
         └──────────────┬──────────────┘
                        │  🌐 git push по ЛОКАЛЬНОЙ СЕТИ
                        ▼
         ┌──────── SMI100 (Debian) ─────┐  ← Zone 1 транзит
         │  /srv/smi100/smi100_*.git    │    (или тест: E:\SMI100\)
         │  /srv/smi100/incoming/LP_X/  │
         └──────────────┬───────────────┘
                        │  🔄 cmake configure → update_dsp.py --mode lp-refresh
                        │  📤 патчи push в incoming/LP_X/ (редко)
                        ▼
         ┌─── Zone 2 — N × LocalProject ───┐
         │  LP_A, LP_B, …, LP_N            │
         │  vendor/ в git → self-contained │
         └─────────────────────────────────┘
```

---

## 📚 Оглавление документации

| # | Файл | Что внутри | Сколько читать |
|---|------|-----------|----------------|
| — | [README.md](README.md) | Эта страница — карта + навигация | 3 мин |
| 00 | [Glossary.md](00_Glossary.md) | Словарь терминов (git, bare, FetchContent, vendored, pin, ...) — для инженера и «чайника» | 15 мин |
| 01 | [Zones_Overview.md](01_Zones_Overview.md) | Три зоны + потоки данных (code / patch / transfer) | 10 мин |
| 02 | [Zone0_Alex_Setup.md](02_Zone0_Alex_Setup.md) | ПК Alex: layout, `_release_git/`, promotions.log.json | 15 мин |
| 03 | [Zone1_SMI100_Setup.md](03_Zone1_SMI100_Setup.md) | SMI100: layout, SSH, incoming/LP_X/, backup | 20 мин |
| 04 | [Zone2_LP_Workflow.md](04_Zone2_LP_Workflow.md) | LocalProject: vendor/, dev-overlays/, 5 правил | 20 мин |
| 05 | [Refresh_Mechanics.md](05_Refresh_Mechanics.md) | Как vendor/ обновляется: A vs B, Pin, цикл configure→build | 25 мин |
| 06 | [Patch_Flow.md](06_Patch_Flow.md) | Как правки из LP возвращаются в public | 15 мин |
| 07 | [Transfer_To_Offline_PC.md](07_Transfer_To_Offline_PC.md) | Перенос LP на флешку / изолированный ПК | 10 мин |
| 08 | [CI_And_Integrity.md](08_CI_And_Integrity.md) | CI + pre-commit + protected branches | 15 мин |
| 09 | [Scripts_Reference.md](09_Scripts_Reference.md) | Справочник скриптов: Synopsis / Usage / Examples | 20 мин |
| 10 | [Decisions_Log.md](10_Decisions_Log.md) | История решений + Migration guide | 15 мин |
| 11 | [Troubleshooting.md](11_Troubleshooting.md) | Частые проблемы и решения | по запросу |
| 12 | [Security_Model.md](12_Security_Model.md) | Роли, SSH-ключи, guardrails | 10 мин |

**Итого полное прочтение**: ~3 часа. Первый заход — достаточно README + 01 + твоя роль (см. ниже).

---

## 👥 Кто ты → что читать

| Роль читателя | Маршрут |
|---------------|---------|
| Первый раз про DSP-GPU distribution | [01_Zones_Overview.md](01_Zones_Overview.md) → [00_Glossary.md](00_Glossary.md) |
| Новичок в LP-команде | [01_Zones_Overview.md](01_Zones_Overview.md) → [04_Zone2_LP_Workflow.md](04_Zone2_LP_Workflow.md) → [05_Refresh_Mechanics.md](05_Refresh_Mechanics.md) |
| Настраиваю SMI100 | [03_Zone1_SMI100_Setup.md](03_Zone1_SMI100_Setup.md) → [12_Security_Model.md](12_Security_Model.md) |
| Alex, делаю промотирование | [02_Zone0_Alex_Setup.md](02_Zone0_Alex_Setup.md) → [09_Scripts_Reference.md](09_Scripts_Reference.md#promote_to_smi100sh) |
| Нашёл баг в модуле, хочу патчить | [06_Patch_Flow.md](06_Patch_Flow.md) |
| Клиент просит перенести на изолированный ПК | [07_Transfer_To_Offline_PC.md](07_Transfer_To_Offline_PC.md) |
| Настраиваю CI у LP-команды | [08_CI_And_Integrity.md](08_CI_And_Integrity.md) |
| «Почему выбрали именно так?» | [10_Decisions_Log.md](10_Decisions_Log.md) + [../Variants_Report_2026-04-18.md](../Variants_Report_2026-04-18.md) |
| Что-то сломалось | [11_Troubleshooting.md](11_Troubleshooting.md) |

---

## 🔑 Три ключевых слова

| Термин | Одной строкой |
|--------|---------------|
| **Zone 0** | Публичный GitHub + ПК Alex — здесь рождается код. |
| **Zone 1** | SMI100 — «склад» проверенных релизов, раздаёт по LAN. Нет интернета. |
| **Zone 2** | LocalProject (LP) — потребители, собирают из LAN, не знают про интернет. В `vendor/` всегда лежит самодостаточный комплект исходников. |

---

## 📦 Как собрать PDF / DOCX / LaTeX (когда понадобится)

Документация написана в pandoc-совместимом markdown. Для конверсии:

```bash
# Установить pandoc (Windows):  choco install pandoc  ИЛИ  scoop install pandoc
# Для PDF дополнительно: MiKTeX (Windows) ИЛИ TeX Live

# DOCX:
pandoc README.md 00_Glossary.md 01_*.md 02_*.md 03_*.md 04_*.md \
       05_*.md 06_*.md 07_*.md 08_*.md 09_*.md 10_*.md 11_*.md 12_*.md \
       --toc --number-sections \
       -o Distributed_Modules_Guide.docx

# LaTeX-исходник:
pandoc README.md 00_*.md 01_*.md ... 12_*.md \
       --toc --number-sections \
       -o Distributed_Modules_Guide.tex

# PDF (нужен xelatex):
pandoc README.md 00_*.md ... 12_*.md \
       --toc --number-sections --pdf-engine=xelatex \
       -V mainfont="DejaVu Sans" \
       -o Distributed_Modules_Guide.pdf
```

LaTeX-версия подготовлена вручную — см. [Distributed_Modules_Guide.tex](Distributed_Modules_Guide.tex) (для Overleaf: upload `.tex` → Download PDF).

---

## 🏛 Связанные документы (вне папки Doc/)

- `../Variants_Report_2026-04-18.md` — каталог V1-V11 с разбором +/−
- `../Review_VariantA_Kodo_2026-04-18.md` — детальный разбор V7A
- `../1_…6_*.md` — исходные обсуждения вариантов
- `../Primer.md`, `../Git_ALL.md` — CMake/Git справочники
- `../../MemoryBank/specs/cmake_git_distribution_spec_2026-04-18.md` — spec V8
- `../../MemoryBank/specs/cmake_git_aware_build.md` v2 — Layer 1/2 (в проде)

---

*Maintained by: Кодо + Alex · последнее обновление: 2026-04-19*
