# Сценарии работы: workflow + тиражирование

> **Статус**: ✅ BASE v1.0  
> **Дата**: 2026-04-18 | **Основа**: `1_`, `2_`, `3_`

---

## 📝 Уточнение: кто управляет обновлением

> **Вопрос**: "Нужно обновлять workspace при смене тега — это минус?"

Нет. Это **осознанный контрольный шаг**. Алгоритм такой:

```
Alex делает изменения в DSP-GPU
   → сам решает когда это "готово"
   → делает git tag v1.1.0 + git push
   → СОЗНАТЕЛЬНО идёт на SMI100 и запускает sync
   → только после этого Project 2 может получить обновление
```

Никакой автоматики без ведома Alex — всё под контролем. Это **плюс**, а не минус.
В таблице варианта 2 это будет исправлено в финальном документе.

---

## 🔄 Сценарий 1: Alex работает на своём ПК (подключён к внутренней сети)

**Ситуация**: Alex разрабатывает на рабочем компьютере, SMI100 — сервер в той же сети.

```
ШАГ 1 — Разработка (на ПК Alex):
  Правишь код в E:\DSP-GPU\core\ (или spectrum, linalg...)
  Тестируешь локально
  git commit -m "feat: ..."
  git tag v1.1.0
  git push origin main --tags    ← уходит на github.com/dsp-gpu

ШАГ 2 — Обновление зеркала (с ПК Alex, по локальной сети):
  # ПК Alex видит и GitHub, и SMI100 — он мост между зонами
  # Запускаем скрипт push_to_smi100.sh прямо с ПК:
  ./push_to_smi100.sh --tag v1.1.0
    → git push git@smi100.local:mirrors/core.git v1.1.0
    → git push git@smi100.local:mirrors/spectrum.git v1.1.0
    → (только если TAG изменился — иначе git сам пропустит, zero работы)

ШАГ 3 — Project 2 получает обновление (на машинах LocalProject):
  cd LocalProject0
  git submodule update --remote deps/core   ← подтягивает новый тег
  git commit -m "bump: dsp v1.1.0"
  cmake --preset from-submodules            ← пересборка только изменившихся
  cmake --build build
```

**Итого**: 3 шага, каждый осознанный. Никакой магии.

---

## 🔄 Сценарий 2: Alex физически на сервере SMI100

**Ситуация**: Alex за консолью SMI100 — сервер без выхода в интернет.

```
ШАГ 1 — Сначала с ПК (пока был доступ к GitHub):
  На ПК Alex запустил push_to_smi100.sh → SMI100 уже обновлён до v1.1.0

ШАГ 2 — Прямо на SMI100 (только локальные операции):
  # SMI100 не лезет в интернет — только работаем с тем что уже есть
  git -C /srv/smi100/mirrors/core.git log --oneline -5
    → видим что v1.1.0 уже здесь (пришёл с ПК Alex)

ШАГ 3 — Проверка сборки (только в Варианте 2, если есть workspace):
  cd /srv/smi100/workspace/core
  git checkout v1.1.0          ← переключаемся на новый тег (локально)
  cmake --preset local-check
  cmake --build build
  echo "Сборка OK — готово для Project 2"

ШАГ 4 — Project 2 сам вытягивает при следующем build:
  (ничего делать не нужно — submodule + stamp механизм сделает сам)
```

---

## 🔄 Сценарий 3: Патч из Project 2 → обратно в DSP-GPU

**Ситуация**: кто-то в зоне 2 нашёл баг и хочет передать правку в Project 0.

```
ШАГ 1 — Разработчик в Project 2 создаёт ветку:
  cd LocalProject0
  cd deps/core                      ← это submodule → mirrors/core.git
  git checkout -b fix/issue-42
  # ... правит код ...
  git commit -m "fix: ..."
  git push origin fix/issue-42      ← уходит в SMI100/mirrors/core.git

ШАГ 2 — Alex на SMI100 видит ветку:
  git -C /srv/smi100/mirrors/core.git branch -r
    → origin/fix/issue-42

ШАГ 3 — Alex пробрасывает в DSP-GPU (на ПК или с SMI100):
  cd E:\DSP-GPU\core
  git remote add smi100 git@smi100.local:mirrors/core.git
  git fetch smi100 fix/issue-42
  git checkout fix/issue-42
  # ревью, тест
  git push origin fix/issue-42      ← уходит на github.com/dsp-gpu
  # → создаётся PR в DSP-GPU → ревью → merge → новый тег
```

**Ключевой момент**: патч идёт через Alex — он контрольная точка.
Прямого доступа из Project 2 в github.com нет. Всё через SMI100.

---

## 📦 Вариант 6 — Тиражирование (1×SMI100 → N×LocalProject)

**Описание**: один SMI100 обслуживает несколько независимых Project 2.
Каждый LocalProject имеет свой набор включённых модулей и свою GPU.

```
                    SMI100
                   /mirrors/
                  ┌──────────────────────────┐
                  │ core.git @ v1.1.0        │
                  │ spectrum.git @ v1.1.0    │
                  │ linalg.git @ v1.1.0      │
                  │ radar.git @ v1.0.0       │
                  └──────┬───────────────────┘
                         │  git clone / submodule update
          ┌──────────────┼──────────────┬──────────────┐
          ▼              ▼              ▼              ▼
   LocalProject_A  LocalProject_B  LocalProject_C  LocalProject_D
   core+spectrum   core+linalg     core+radar      все 8 модулей
   gpu: gfx1100    gpu: gfx906     gpu: opencl     gpu: gfx1201
   team: DSP       team: Linalg    team: Radar     team: Integration
```

**Каждый проект независим**:
- свой `CMakePresets.json` с нужными `USE_DSP_*` переключателями
- своя GPU конфигурация
- своя история коммитов (когда какой тег взяли)
- свои патчи (ветки) — все идут через SMI100 → Alex → DSP-GPU

**Обновление тега для всех сразу** (Alex запускает с ПК):
```bash
./push_to_smi100.sh --tag v1.2.0
# с ПК Alex → git push → SMI100/mirrors/*.git по локальной сети
# mirrors/core.git обновлён — все N проектов увидят при следующем
# git submodule update или cmake reconfigure
```

**Каждый проект обновляется в своём темпе**:
```
LocalProject_A: взял v1.2.0 сразу
LocalProject_B: пока на v1.1.0 (идёт тест)
LocalProject_C: на v1.0.0 (стабильный продакшн)
```

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| Один SMI100 = единая точка доставки | SMI100 — единая точка отказа |
| Каждый проект выбирает свой темп обновления | При N проектах больше submodule update операций |
| GPU конфиг полностью локален для каждого | Патчи из N проектов — все идут через Alex |
| Один sync_mirrors.sh обновляет всех | — |
| Экономия места (bare mirrors шарятся) | — |

---

## 🗂️ Итоговая картина — все сценарии вместе

```
[github.com/dsp-gpu]
      ▲   ▲
 push │   │ push (патч из 2)
      │   │
[Alex ПК / DSP-GPU] ──git push──▶ [SMI100]
   (мост: GitHub + локальная сеть)  (только локальная сеть)
                               │
                    ┌──────────┼──────────┬──────────┐
                    ▼          ▼          ▼          ▼
               [LP_A]      [LP_B]     [LP_C]     [LP_D]
               core+spec   core+lin   core+rad   all
               gfx1100     gfx906     opencl     gfx1201

Патч:  LP_X → (branch) → SMI100 → Alex → github.com/dsp-gpu → новый тег
```

**Правила три**:
1. Alex — единственный кто пишет в github.com/dsp-gpu
2. Alex — единственный кто запускает sync на SMI100
3. LocalProject_N — только читают из SMI100, пишут только ветки-патчи

---

*Created: 2026-04-18 | Version: BASE v1.0 | Author: Кодо + Alex*
