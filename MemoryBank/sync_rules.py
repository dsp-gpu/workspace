#!/usr/bin/env python3
"""
sync_rules.py — синхронизация canonical правил Кодо в .claude/rules/.

Canonical:   MemoryBank/.claude/rules/*.md        ← источник истины (редактируем здесь)
Deployed:    .claude/rules/*.md                    ← куда Claude Code читает нативно

Запуск:
    python3 MemoryBank/sync_rules.py            # синк (default)
    python3 MemoryBank/sync_rules.py --check    # dry-run (CI / pre-commit verify)
    python3 MemoryBank/sync_rules.py --clean    # удалить deployed перед копированием

Зачем:
    Claude Code читает правила из <repo>/.claude/rules/*.md (стандарт).
    Но canonical у нас в MemoryBank/ — чтобы копировать в новые проекты целым блоком.
    Этот скрипт — мост. Запускается из pre-commit hook автоматически.

Поведение:
    - Копирует файлы .md из CANONICAL в DEPLOYED (с сохранением структуры).
    - Удаляет из DEPLOYED файлы, которых нет в CANONICAL (anti-drift).
    - --check возвращает exit code 1 если есть расхождения (не копирует).

Dependencies: только stdlib (чтобы работало в pre-commit hook без установки).
"""
from __future__ import annotations

import argparse
import filecmp
import shutil
import sys
from pathlib import Path

# --------------------------------------------------------------------------
# Пути (относительно корня git-репо)
# --------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent           # .../MemoryBank/
REPO_ROOT = SCRIPT_DIR.parent                          # .../DSP-GPU/
CANONICAL_DIR = SCRIPT_DIR / ".claude" / "rules"       # canonical (источник)
DEPLOYED_DIR = REPO_ROOT / ".claude" / "rules"         # deployed (куда Claude читает)


# --------------------------------------------------------------------------
# Операции
# --------------------------------------------------------------------------

def collect_md(root: Path) -> dict[str, Path]:
    """Собрать карту {relpath: abspath} для всех .md под root."""
    if not root.exists():
        return {}
    return {
        str(p.relative_to(root)).replace("\\", "/"): p
        for p in root.rglob("*.md")
        if p.is_file()
    }


def diff(canonical: dict[str, Path], deployed: dict[str, Path]) -> tuple[list[str], list[str], list[str]]:
    """Вернуть (to_copy, to_update, to_delete) списки relpath."""
    to_copy = sorted(set(canonical) - set(deployed))
    to_delete = sorted(set(deployed) - set(canonical))
    to_update = sorted(
        rp for rp in set(canonical) & set(deployed)
        if not filecmp.cmp(canonical[rp], deployed[rp], shallow=False)
    )
    return to_copy, to_update, to_delete


def do_sync(canonical: dict[str, Path], deployed: dict[str, Path],
            to_copy: list[str], to_update: list[str], to_delete: list[str]) -> None:
    """Применить изменения к DEPLOYED_DIR."""
    DEPLOYED_DIR.mkdir(parents=True, exist_ok=True)

    for rp in to_copy + to_update:
        src = canonical[rp]
        dst = DEPLOYED_DIR / rp
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        action = "NEW " if rp in to_copy else "UPD "
        print(f"  {action} {rp}")

    for rp in to_delete:
        (DEPLOYED_DIR / rp).unlink(missing_ok=True)
        print(f"  DEL  {rp}")


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Sync canonical Codo rules to .claude/rules/")
    parser.add_argument("--check", action="store_true",
                        help="Dry-run: exit 1 if drift detected (for pre-commit verify)")
    parser.add_argument("--clean", action="store_true",
                        help="Delete DEPLOYED_DIR first, then full copy")
    args = parser.parse_args()

    if not CANONICAL_DIR.exists():
        print(f"[sync_rules] ERROR: canonical dir not found: {CANONICAL_DIR}", file=sys.stderr)
        return 2

    if args.clean and not args.check and DEPLOYED_DIR.exists():
        shutil.rmtree(DEPLOYED_DIR)
        print(f"[sync_rules] Cleaned: {DEPLOYED_DIR}")

    canonical = collect_md(CANONICAL_DIR)
    deployed = collect_md(DEPLOYED_DIR)

    to_copy, to_update, to_delete = diff(canonical, deployed)
    total = len(to_copy) + len(to_update) + len(to_delete)

    print(f"[sync_rules] canonical: {CANONICAL_DIR.relative_to(REPO_ROOT)}")
    print(f"[sync_rules] deployed:  {DEPLOYED_DIR.relative_to(REPO_ROOT)}")
    print(f"[sync_rules] files: canonical={len(canonical)}  deployed={len(deployed)}")

    if total == 0:
        print("[sync_rules] In sync — nothing to do.")
        return 0

    print(f"[sync_rules] Drift: +{len(to_copy)} new, ~{len(to_update)} updated, -{len(to_delete)} removed")

    if args.check:
        for rp in to_copy:   print(f"  MISSING  {rp}")
        for rp in to_update: print(f"  DRIFT    {rp}")
        for rp in to_delete: print(f"  EXTRA    {rp}")
        print("[sync_rules] --check: FAIL (drift detected). Run without --check to fix.")
        return 1

    do_sync(canonical, deployed, to_copy, to_update, to_delete)
    print(f"[sync_rules] Done: {total} change(s) applied.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
