# 08 · CI и целостность vendor/

> **Кто это читает**: техлид LP-команды, DevOps / SRE настраивающий CI, архитектор.
> **Цель**: обеспечить что в `main`/`master` LP_x **никогда** не попадает сломанное состояние `vendor/`.

---

## 🎯 Зачем защищать vendor/

Цикл обновления `vendor/` автоматизирован (`cmake configure` → `update_dsp.py`). Это означает:

- 🤖 Любой разработчик при `cmake configure` может **обновить** `vendor/` (SMI100 выдала новую версию)
- 🧑 После этого разработчик **вручную коммитит** `git add vendor/` + `git commit`
- ⚠️ Никто не мешает закоммитить **не протестированную** версию

**Риск**: разработчик обновил vendor/, не тестировал (или тесты красные, но закоммитил), pushed в `main` → все члены команды на следующий pull получают **сломанный** `vendor/`. Релиз клиенту — сломанный.

**Защита**: **CI на внутреннем git-сервере LP** — каждый push в `main` проходит build+test. Красный = push отклоняется.

---

## 🛡 Трёхуровневая защита

Решение Alex (2026-04-19): команда > 10 → делаем **все три** уровня.

### Уровень 1 — Protected branches + MR (обязательно)

На внутреннем git-сервере команды (Gitea / GitLab / Bitbucket / etc):

- `main` / `master` защищены: прямой push запрещён
- Изменения — только через Merge Request / Pull Request
- Merge требует:
  - ✅ Хотя бы одного аппрува от другого разработчика
  - ✅ Зелёного CI-пайплайна

Даже если разработчик «хочет быстро закоммитить» — система заставит пройти через MR.

### Уровень 2 — CI pipeline (обязательно)

На каждый push в feature-ветку / MR → CI runner:
- clean build (`rm -rf build && cmake --preset zone2`)
- ctest
- если красный → MR помечается «failed» → merge недоступен

При тегировании (git tag `LP_x-vX.Y.Z`) → дополнительный release-gate stage:
- проверка что `vendor/` = свежее состояние SMI100 (не отстал)
- проверка что нет uncommitted pin-ов без reason

### Уровень 3 — Pre-commit hook (опционально, на стороне разработчика)

Для разработчиков, которые хотят ловить проблемы **до** push (экономить время CI):
- Скрипт `.git/hooks/pre-commit` проверяет что build+test проходят
- Если красный — `git commit` отклоняется локально

---

## ⚙️ CI pipeline — пример `.gitlab-ci.yml`

```yaml
# .gitlab-ci.yml (в корне LP_x)
# Адаптируй под свой CI: Jenkins / Gitea Actions / Bitbucket Pipelines
# Логика идентична.

stages:
  - verify
  - build
  - test
  - release-gate

image: rocm/dev-ubuntu-22.04:latest  # или свой Docker-image с ROCm + CMake + Python

# ── STAGE 1: verify ──────────────────────────────────────────────────────
# Быстрая проверка — формат файлов, синтаксис

check_format:
  stage: verify
  script:
    - python3 scripts/update_dsp.py --status
    - python3 scripts/update_dsp.py --mode lp-refresh --dry-run --no-network
    # dry-run без сети — убедиться что скрипт не сломан

check_deps_state:
  stage: verify
  script:
    # deps_state.json должен быть валидным JSON v2
    - python3 -c "import json; d=json.load(open('deps_state.json')); assert d['schema_version']==2"

# ── STAGE 2: build ───────────────────────────────────────────────────────

build_release:
  stage: build
  script:
    - rm -rf build
    - cmake --preset zone2-offline   # ❗ offline — в CI сеть к SMI100 может быть недоступна
    - cmake --build build -j$(nproc)
  artifacts:
    paths: [build/]
    expire_in: 1 day

# ── STAGE 3: test ────────────────────────────────────────────────────────

test_unit:
  stage: test
  needs: [build_release]
  script:
    - ctest --test-dir build --output-on-failure -E "integration"
  artifacts:
    when: on_failure
    paths: [build/Testing/]

test_integration:
  stage: test
  needs: [build_release]
  script:
    - ctest --test-dir build --output-on-failure -R "integration"

# ── STAGE 4: release-gate (только на tag) ────────────────────────────────

release_gate:
  stage: release-gate
  needs: [test_unit, test_integration]
  only:
    - tags       # запускается только когда git tag LP_x-v*.*.* пушится
  script:
    # Проверка: vendor/ синхронизирован с SMI100 (не отстал)
    - python3 scripts/update_dsp.py --mode lp-refresh --dry-run --fail-if-drift
    # Проверка: нет забытых pin без reason
    - python3 scripts/update_dsp.py --status --fail-if-stale-pin
    - echo "✅ Release gate passed — можно отдавать клиенту"
```

---

## 🔒 Protected branches — настройка

### GitLab

Settings → Repository → Protected branches:
- Branch: `main`
- Allowed to merge: `Maintainers`
- Allowed to push: `No one` (прямой push запрещён)
- Code owner approval required: ✅
- CI/CD pipeline must succeed: ✅

Settings → Repository → Protected tags:
- Tag: `LP_x-v*`
- Allowed to create: `Maintainers`

### Gitea

Repo Settings → Branches → Branch Protection:
- Protect this branch: ✅
- Branch: `main`
- Enable Push: disable
- Require pull requests: ✅
- Require status checks: ✅ → `build_release`, `test_unit`, `test_integration`
- Require code review approvals: ≥ 1

### Другие (Jenkins / BitBucket / etc)

Логика идентична — ищи «branch protection» / «PR rules».

---

## 🪝 Pre-commit hook (опционально)

Шаблон: `scripts/hooks/pre-commit` в репо LP_x.

```bash
#!/usr/bin/env bash
# Pre-commit hook — локальная защита перед commit
# Устанавливается: cp scripts/hooks/pre-commit .git/hooks/ && chmod +x .git/hooks/pre-commit

set -e

# Проверяем что меняется — стоит ли вообще запускать тесты
changed=$(git diff --cached --name-only)
needs_check=false

if echo "$changed" | grep -qE '^(vendor/|deps_state\.json|src/|include/|CMakeLists\.txt|cmake/)'; then
    needs_check=true
fi

if [ "$needs_check" = false ]; then
    exit 0   # мелкие правки (документация, README) — не проверяем
fi

echo "🔍 pre-commit: изменения требуют проверки сборки"

# Инкрементальный билд (не clean — для скорости)
if [ ! -d build ]; then
    cmake --preset zone2-offline
fi

cmake --build build -j$(nproc) 2>&1 | tail -20 || {
    echo ""
    echo "❌ Сборка провалилась — commit отменён."
    echo "   Запусти вручную: cmake --build build"
    echo "   Если нужно запушить несмотря на это: git commit --no-verify"
    exit 1
}

ctest --test-dir build --output-on-failure -j$(nproc) || {
    echo ""
    echo "❌ Тесты красные — commit отменён."
    echo "   Запусти вручную: ctest --test-dir build"
    echo "   Если нужно запушить несмотря на это: git commit --no-verify"
    exit 1
}

echo "✅ pre-commit: сборка + тесты зелёные"
```

Установка для разработчика:
```bash
cd ~/LP_x
cp scripts/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**Важно**:
- Hook опциональный — каждый разработчик сам выбирает
- Можно обойти через `git commit --no-verify` если очень надо
- Не заменяет CI — это дополнительный барьер, не основной

---

## 📊 Таблица «размер команды → что нужно»

| Команда | Protected branches | CI | Pre-commit |
|---------|:-:|:-:|:-:|
| 1-3 чел. | рекомендуем | можно позже | опц. |
| 4-10 чел. | обязательно | рекомендуем | опц. |
| **> 10 чел. (наш случай)** | **обязательно** | **обязательно** | **опц. для желающих** |

Наш проект — > 10 чел., так что **делаем все три уровня сразу**.

---

## 🤖 Автоматизация коммита vendor/ через CI

**Проблема**: разработчик обновил vendor/ через cmake configure, но забыл закоммитить → другие получат конфликт.

**Решение**: CI на master-ветке автоматически коммитит `vendor/` после успешного пайплайна.

```yaml
# Дополнительный stage после test_unit
auto_commit_vendor:
  stage: release-gate
  needs: [test_unit, test_integration]
  only:
    - main          # только на main ветке
  before_script:
    - git config user.email "ci@lp-team.local"
    - git config user.name  "LP CI Bot"
  script:
    # Проверяем что есть что коммитить
    - git diff --quiet vendor/ deps_state.json || {
        git add vendor/ deps_state.json ;
        git commit -m "chore(ci): auto-sync vendor/ ($(date -Iseconds))" ;
        git push origin HEAD:main ;
      }
```

⚠️ Нюанс: чтобы CI мог пушить в защищённый `main` — нужен специальный «CI user» с правами `Maintainer` + SSH ключ у CI runner-а. Подробности в доке вашей CI-системы.

---

## 🚨 Типовые нарушения и как их избежать

### Нарушение 1: прямой push в main с красным CI

**Запрет**: protected branches должны полностью запрещать direct push.

**Симптом**: несмотря на protected branches, кто-то смог запушить. Значит не все admin-ы в CI зашиты правильно.

**Решение**: аудит `.gitlab-ci.yml` / settings protected branches, не исключать Maintainers.

---

### Нарушение 2: `--no-verify` bypass pre-commit

Разработчик в спешке: `git commit --no-verify -m "wip"`, потом pushed в MR.

**Защита**: CI на сервере всё равно перепроверит. Pre-commit — удобство, не основная защита.

---

### Нарушение 3: CI прошёл, но `deps_state.json` не синк с `vendor/`

Редкий случай: `deps_state.json` говорит `core v1.2.0`, но в `vendor/core/` фактически v1.1.0 (кто-то сделал частичный коммит).

**Защита**:
```yaml
# в stage verify
check_vendor_consistency:
  stage: verify
  script:
    - python3 scripts/update_dsp.py --mode verify
    # скрипт проверяет: для каждого модуля — SHA в deps_state.json == SHA в vendor/<mod>/.git/HEAD
```

---

## ✅ Чеклист настройки защиты

### Minimum (команда любого размера)

- [ ] `main` protected, прямой push запрещён
- [ ] Merge только через MR/PR
- [ ] CI build+test настроен, красный = merge блокируется

### Recommended (> 5 чел.)

- [ ] Release-gate stage на tag-ах
- [ ] auto_commit_vendor на main
- [ ] CI user с SSH-ключом настроен

### Advanced (> 10 чел., наш случай)

- [ ] Pre-commit hook шаблон в `scripts/hooks/`
- [ ] CI на каждую feature-ветку (не только на main)
- [ ] Отдельный CI для `--dry-run` smoke test еженощно
- [ ] Monitoring: уведомление в Slack / TG при двух красных CI подряд
- [ ] Аудит protected branches раз в квартал

---

## 🧭 Дальше

- [04_Zone2_LP_Workflow.md](04_Zone2_LP_Workflow.md) — общий workflow LP
- [05_Refresh_Mechanics.md](05_Refresh_Mechanics.md) — механика refresh
- [09_Scripts_Reference.md](09_Scripts_Reference.md) — скрипты (включая hook)
- [11_Troubleshooting.md](11_Troubleshooting.md) — «у меня CI красный и я не понимаю почему»

---

*08_CI_And_Integrity.md · 2026-04-19 · Кодо + Alex*
