#!/usr/bin/env python3
"""
update_dsp.py  —  автоматическое обновление DSP-зависимостей в LocalProject

Что делает:
  1. Читает deps_state.json  (текущее состояние: тег + SHA + дата каждого репо)
  2. Для каждого включённого репо спрашивает SMI100/mirrors/ о всех тегах
  3. Выбирает последний по SemVer  (v1.10.0 > v1.9.0 — надёжно)
  4. Санитарная проверка дат: если новый тег СТАРШЕ записанного — ⚠️  тревога
  5. Если версия новее  → git checkout нового тега в deps/{repo}
  6. Обновляет deps_state.json + делает git commit
  Всё в параллельных потоках  — локальная сеть быстрая, ждать нечего.

Запуск:
  python update_dsp.py             # обновить всё включённое
  python update_dsp.py --dry-run   # только показать что изменится
  python update_dsp.py --repo core # только один репо
"""

import argparse
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
from pathlib import Path

# ══════════════════════════════════════════════════════════════════════════════
#  КОНФИГУРАЦИЯ — правь здесь
# ══════════════════════════════════════════════════════════════════════════════

DEPS_DIR   = Path("deps")           # submodule checkouts (локально)
STATE_FILE = Path("deps_state.json")  # файл состояния — коммитится в git

# Репозитории: True = включено, False = выключено
REPOS: dict[str, bool] = {
    "core":              True,
    "spectrum":          True,
    "stats":             True,
    "linalg":            True,
    "radar":             False,
    "signal_generators": False,
    "heterodyne":        False,
    "strategies":        False,
}

# ⚠️  Тревога: если новый тег старше текущего состояния на больше N дней
DATE_WARN_DAYS = 1

# ══════════════════════════════════════════════════════════════════════════════
#  УТИЛИТЫ
# ══════════════════════════════════════════════════════════════════════════════

def run(cmd: list, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)

def git(*args, cwd: Path | None = None) -> tuple[int, str]:
    r = run(["git", *args], cwd=cwd)
    return r.returncode, r.stdout.strip()

def parse_semver(tag: str) -> tuple[int, int, int]:
    """'v1.2.3' → (1, 2, 3).  Нераспознанный тег → (0, 0, 0)."""
    m = re.match(r"v?(\d+)\.(\d+)\.(\d+)", tag.strip())
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else (0, 0, 0)

def parse_date(s: str) -> date | None:
    """'2026-04-15' или '2026-04-15T10:00:00...' → date объект."""
    try:
        return date.fromisoformat(s[:10])
    except (ValueError, TypeError):
        return None

# ══════════════════════════════════════════════════════════════════════════════
#  ЛОГИКА ОДНОГО РЕПО
# ══════════════════════════════════════════════════════════════════════════════

def get_tags_from_remote(repo_dir: Path) -> list[tuple[str, date | None]]:
    """
    Тянет теги с remote (SMI100) и возвращает [(tag, date), ...] сортированный
    по SemVer ascending.  Последний элемент = самый новый.
    """
    # Обновляем remote refs без checkout
    run(["git", "fetch", "--tags", "--prune", "--quiet"], cwd=repo_dir)

    # for-each-ref с version:refname сортирует SemVer правильно (v1.10 > v1.9)
    _, raw = git(
        "for-each-ref",
        "--sort=version:refname",
        "--format=%(refname:short)|%(creatordate:short)",
        "refs/tags",
        cwd=repo_dir,
    )
    result = []
    for line in raw.splitlines():
        parts = line.split("|", 1)
        if len(parts) == 2:
            tag = parts[0].strip()
            d   = parse_date(parts[1].strip())
            if parse_semver(tag) > (0, 0, 0):     # только валидные semver теги
                result.append((tag, d))
    return result   # уже отсортировано git-ом по версии ascending


def process_repo(repo: str, state: dict, dry_run: bool) -> dict:
    """
    Проверяет и (если нужно) обновляет один репо.
    Возвращает результат: status = ok | updated | error | warn
    """
    repo_dir = DEPS_DIR / repo

    if not repo_dir.exists():
        return {"status": "error", "repo": repo,
                "msg": f"директория {repo_dir} не найдена"}

    # ── Получаем теги с SMI100 ────────────────────────────────────────────
    try:
        tags = get_tags_from_remote(repo_dir)
    except Exception as e:
        return {"status": "error", "repo": repo, "msg": str(e)}

    if not tags:
        return {"status": "error", "repo": repo, "msg": "нет SemVer-тегов на remote"}

    latest_tag, latest_date = tags[-1]   # самый новый по SemVer
    current = state.get(repo, {})
    current_tag  = current.get("tag", "v0.0.0")
    current_date = parse_date(current.get("date"))

    # ── Санитарная проверка дат ────────────────────────────────────────────
    warnings = []
    if current_date and latest_date:
        delta = (current_date - latest_date).days
        if delta > DATE_WARN_DAYS:
            warnings.append(
                f"⚠️  ТРЕВОГА: новый тег {latest_tag} ({latest_date}) "
                f"СТАРШЕ текущего состояния ({current_date}) на {delta} дн. "
                f"Возможен бардак: рассогласование часов или перезапись тега!"
            )

    # ── Сравнение версий ──────────────────────────────────────────────────
    if parse_semver(latest_tag) <= parse_semver(current_tag):
        return {"status": "ok", "repo": repo, "tag": current_tag,
                "warnings": warnings}

    # ── Обновление ────────────────────────────────────────────────────────
    if dry_run:
        return {"status": "would_update", "repo": repo,
                "old_tag": current_tag, "new_tag": latest_tag,
                "new_date": str(latest_date), "warnings": warnings}

    rc, err = run(["git", "checkout", latest_tag], cwd=repo_dir).returncode, ""
    if rc != 0:
        res = run(["git", "checkout", latest_tag], cwd=repo_dir)
        return {"status": "error", "repo": repo,
                "msg": f"checkout {latest_tag} failed:\n{res.stderr}"}

    _, sha = git("rev-parse", "--short", "HEAD", cwd=repo_dir)

    return {
        "status":   "updated",
        "repo":     repo,
        "old_tag":  current_tag,
        "new_tag":  latest_tag,
        "new_date": str(latest_date) if latest_date else "unknown",
        "new_sha":  sha,
        "warnings": warnings,
    }

# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="DSP dependency updater")
    parser.add_argument("--dry-run", action="store_true",
                        help="Только показать что изменится, ничего не трогать")
    parser.add_argument("--repo", metavar="NAME",
                        help="Обновить только один конкретный репо")
    args = parser.parse_args()

    print("=" * 62)
    print("  DSP Dependency Updater")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
          + ("  [DRY RUN]" if args.dry_run else ""))
    print("=" * 62)

    # Загружаем состояние
    state: dict = {}
    if STATE_FILE.exists():
        with open(STATE_FILE, encoding="utf-8") as f:
            state = json.load(f).get("repos", {})

    # Выбираем репо для обработки
    if args.repo:
        if args.repo not in REPOS:
            print(f"❌ Неизвестный репо: {args.repo}")
            sys.exit(1)
        enabled = [args.repo]
    else:
        enabled = [r for r, on in REPOS.items() if on]

    print(f"\nПроверяем: {', '.join(enabled)}\n")

    # ── Параллельная обработка ────────────────────────────────────────────
    results: list[dict] = []
    workers = min(len(enabled), 8)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(process_repo, repo, state, args.dry_run): repo
            for repo in enabled
        }
        for future in as_completed(futures):
            results.append(future.result())

    # Восстанавливаем порядок вывода (потоки завершаются произвольно)
    results.sort(key=lambda r: r["repo"])

    # ── Вывод результатов ─────────────────────────────────────────────────
    updated  = []
    errors   = []
    all_warns = []

    for r in results:
        # Печатаем предупреждения дат
        for w in r.get("warnings", []):
            print(f"  {w}")
            all_warns.append(w)

        s = r["status"]
        repo = r["repo"]

        if s == "updated":
            print(f"  ✅ {repo:<22} {r['old_tag']:>8} → {r['new_tag']:<8}  sha:{r['new_sha']}")
            updated.append(r)
            state[repo] = {
                "tag":  r["new_tag"],
                "sha":  r["new_sha"],
                "date": r["new_date"],
            }
        elif s == "would_update":
            print(f"  🔍 {repo:<22} {r['old_tag']:>8} → {r['new_tag']:<8}  [dry-run]")
            updated.append(r)
        elif s == "ok":
            print(f"  ✔  {repo:<22} {r['tag']:<8}  актуально")
        elif s == "error":
            print(f"  ❌ {repo:<22} ОШИБКА: {r['msg']}")
            errors.append(r)

    print()

    # ── Сохраняем state + коммит ──────────────────────────────────────────
    if updated and not args.dry_run:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "updated": datetime.now(timezone.utc).isoformat(),
                "repos":   state,
            }, f, indent=2, ensure_ascii=False)

        # git add
        add_paths = [str(DEPS_DIR / r["repo"]) for r in updated] + [str(STATE_FILE)]
        run(["git", "add"] + add_paths)

        bump = ", ".join(f"{r['repo']} {r['old_tag']}→{r['new_tag']}" for r in updated)
        rc, _ = run(["git", "commit", "-m", f"bump: {bump}"]).returncode, ""
        run(["git", "commit", "-m", f"bump: {bump}"])

        print(f"  💾 deps_state.json обновлён + коммит создан")
        print(f"\n  Следующий шаг:")
        print(f"  cmake --preset from-submodules && cmake --build build")

    elif not updated and not errors:
        print("  Все зависимости актуальны. Обновлений нет.")

    # ── Итог ─────────────────────────────────────────────────────────────
    if all_warns:
        print(f"\n  ⚠️  Предупреждений по датам: {len(all_warns)} — проверь теги на SMI100!")
    if errors:
        print(f"\n  ❌ Ошибок: {len(errors)} — проверь доступность SMI100")
        sys.exit(1)

    print()


if __name__ == "__main__":
    main()
