"""
DSP-GPU Migration Orchestrator

Запускает команду агентов поэтапно для миграции GPUWorkLib → DSP-GPU.

Этапы:
  fix   → fix-agent:   исправить структуру include/, src/, #include пути
  build → build-agent: cmake configure + build
  test  → test-agent:  C++ тесты + Python тесты
  doc   → doc-agent:   документация + git commit + push + тег

Использование:
  python scripts/migration.py --stage fix   --repo core
  python scripts/migration.py --stage build --repo core
  python scripts/migration.py --stage test  --repo core
  python scripts/migration.py --stage doc   --repo core
  python scripts/migration.py --stage all   --repo core   # все этапы для core
  python scripts/migration.py --stage build              # все репо в правильном порядке
  python scripts/migration.py --status                   # показать текущий статус

Требования:
  pip install anthropic
  export ANTHROPIC_API_KEY=...
"""

import anthropic
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# ── Конфиг ──────────────────────────────────────────────────────────────────

ROOT        = Path(__file__).parent.parent
GPUWORKLIB  = Path("/home/alex/C++/GPUWorkLib")
DSP_PYTHON  = ROOT / "DSP" / "Python"
MODEL       = "claude-sonnet-4-6"

# Порядок сборки (по зависимостям — нельзя менять!)
BUILD_ORDER = [
    "core",
    "spectrum",
    "stats",
    "signal_generators",
    "linalg",
    "heterodyne",
    "radar",
    "strategies",
    "DSP",
]

# Маппинг репо → исходные модули в GPUWorkLib
REPO_TO_SOURCE = {
    "core":              ["DrvGPU"],
    "spectrum":          ["fft_func", "filters", "lch_farrow"],
    "stats":             ["statistics"],
    "signal_generators": ["signal_generators"],
    "heterodyne":        ["heterodyne"],
    "linalg":            ["vector_algebra", "capon"],
    "radar":             ["range_angle", "fm_correlator"],
    "strategies":        ["strategies"],
    "DSP":               [],
}

# Файл статуса миграции
STATUS_FILE = ROOT / "MemoryBank" / "agent_reports" / "migration_status.json"

# ── Status tracking ───────────────────────────────────────────────────────────

def load_status() -> dict:
    if STATUS_FILE.exists():
        return json.loads(STATUS_FILE.read_text())
    return {repo: {"fix": None, "build": None, "test": None, "doc": None}
            for repo in BUILD_ORDER}

def save_status(status: dict):
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATUS_FILE.write_text(json.dumps(status, indent=2))

def print_status(status: dict):
    print("\n=== Статус миграции DSP-GPU ===")
    print(f"{'Репо':<20} {'fix':<8} {'build':<8} {'test':<8} {'doc':<8}")
    print("─" * 55)
    icons = {None: "⬜", "ok": "✅", "fail": "❌", "skip": "⏭️"}
    for repo in BUILD_ORDER:
        s = status.get(repo, {})
        print(f"{repo:<20} "
              f"{icons.get(s.get('fix')):<8} "
              f"{icons.get(s.get('build')):<8} "
              f"{icons.get(s.get('test')):<8} "
              f"{icons.get(s.get('doc')):<8}")
    print()

# ── Context builders ──────────────────────────────────────────────────────────

def repo_context(repo: str) -> str:
    """Собирает контекст репо для агента."""
    repo_path = ROOT / repo
    parts = [f"# Репо: {repo}\nПуть: {repo_path}\n"]

    # Структура include
    result = subprocess.run(
        f"find {repo_path}/include -maxdepth 4 -type d 2>/dev/null | head -20",
        shell=True, capture_output=True, text=True
    )
    parts.append(f"## include/ структура:\n{result.stdout or '(пусто)'}\n")

    # Структура src
    result = subprocess.run(
        f"find {repo_path}/src -maxdepth 3 -name '*.cpp' 2>/dev/null | head -15",
        shell=True, capture_output=True, text=True
    )
    parts.append(f"## src/ файлы:\n{result.stdout or '(пусто)'}\n")

    # CMakeLists.txt (первые 60 строк)
    cmake_path = repo_path / "CMakeLists.txt"
    if cmake_path.exists():
        content = cmake_path.read_text()[:2500]
        parts.append(f"## CMakeLists.txt (начало):\n```cmake\n{content}\n```\n")

    # Python bindings
    result = subprocess.run(
        f"ls {repo_path}/python/ 2>/dev/null",
        shell=True, capture_output=True, text=True
    )
    parts.append(f"## python/ файлы:\n{result.stdout or '(пусто)'}\n")

    # tests
    result = subprocess.run(
        f"ls {repo_path}/tests/ 2>/dev/null",
        shell=True, capture_output=True, text=True
    )
    parts.append(f"## tests/ файлы:\n{result.stdout or '(пусто)'}\n")

    return "\n".join(parts)


def gpuworklib_context(repo: str) -> str:
    """Контекст из GPUWorkLib для данного репо."""
    sources = REPO_TO_SOURCE.get(repo, [])
    if not sources:
        return "(нет источника в GPUWorkLib)"

    parts = [f"# Исходники в GPUWorkLib для {repo}\n"]
    for module in sources:
        mod_path = GPUWORKLIB / "modules" / module
        if not mod_path.exists():
            # Попробовать другие места
            parts.append(f"## {module}: НЕ НАЙДЕН в {mod_path}\n")
            continue

        result = subprocess.run(
            f"find {mod_path} -maxdepth 2 -type f | grep -v '.o$' | head -20",
            shell=True, capture_output=True, text=True
        )
        parts.append(f"## {module}/:\n{result.stdout}\n")

        # Тесты
        test_path = mod_path / "tests"
        if test_path.exists():
            result = subprocess.run(
                f"ls {test_path}/",
                shell=True, capture_output=True, text=True
            )
            parts.append(f"## {module}/tests/:\n{result.stdout}\n")

        # Python тест
        py_test = GPUWORKLIB / "Python_test" / module
        if py_test.exists():
            result = subprocess.run(f"ls {py_test}/", shell=True, capture_output=True, text=True)
            parts.append(f"## Python_test/{module}/:\n{result.stdout}\n")

        # Документация
        doc_path = GPUWORKLIB / "Doc" / "Modules" / module
        if doc_path.exists():
            result = subprocess.run(f"ls {doc_path}/", shell=True, capture_output=True, text=True)
            parts.append(f"## Doc/Modules/{module}/:\n{result.stdout}\n")

    return "\n".join(parts)


def agent_instructions(stage: str) -> str:
    """Загружает системный промпт агента из .claude/agents/."""
    agent_file = ROOT / ".claude" / "agents" / f"{stage}-agent.md"
    if agent_file.exists():
        content = agent_file.read_text()
        # Убрать frontmatter (--- ... ---)
        if content.startswith("---"):
            end = content.index("---", 3)
            return content[end+3:].strip()
    return f"Ты — {stage}-инженер проекта DSP-GPU."


# ── Agent runner ──────────────────────────────────────────────────────────────

class MigrationAgent:
    def __init__(self, client: anthropic.Anthropic):
        self.client = client

    def run(self, stage: str, repo: str, extra_context: str = "") -> tuple[bool, str]:
        """Запускает агента для stage+repo. Возвращает (success, result_text)."""

        system = agent_instructions(stage)
        ctx_repo = repo_context(repo)
        ctx_source = gpuworklib_context(repo)

        prompt = f"""Задача: {stage} для репо `{repo}`.

Действуй поэтапно. После каждого шага кратко отчитайся что сделано.

## Текущее состояние репо:
{ctx_repo}

## Источник в GPUWorkLib:
{ctx_source}

{extra_context}

Начинай!
"""

        print(f"\n[{stage.upper()}] {repo} → запрос к Claude...", flush=True)

        response = self.client.messages.create(
            model=MODEL,
            max_tokens=8096,
            system=[{
                "type": "text",
                "text": system,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": prompt}],
        )

        result = response.content[0].text
        usage = response.usage
        cached = getattr(usage, "cache_read_input_tokens", 0)
        print(f"[{stage.upper()}] {repo} → "
              f"input: {usage.input_tokens} ({cached} cached), "
              f"output: {usage.output_tokens}")

        # Простая эвристика успеха — ищем ❌ или ERROR в ответе
        success = "❌" not in result and "ERROR" not in result.upper()[:200]
        return success, result

    def save_report(self, stage: str, repo: str, result: str):
        reports_dir = ROOT / "MemoryBank" / "agent_reports"
        reports_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y-%m-%d_%H-%M")
        path = reports_dir / f"migration_{stage}_{repo}_{ts}.md"
        path.write_text(
            f"# Migration {stage}: {repo}\n> {ts}\n\n{result}",
            encoding="utf-8"
        )
        return path


# ── Orchestrator ──────────────────────────────────────────────────────────────

class Orchestrator:
    STAGES = ["fix", "build", "test", "doc"]

    def __init__(self):
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            print("ERROR: ANTHROPIC_API_KEY не установлен!")
            sys.exit(1)
        self.client  = anthropic.Anthropic(api_key=api_key)
        self.agent   = MigrationAgent(self.client)
        self.status  = load_status()

    def run_stage(self, stage: str, repo: str) -> bool:
        """Запускает один этап для одного репо с паузой для подтверждения."""

        print(f"\n{'='*60}")
        print(f"  Этап: {stage.upper()}   Репо: {repo}")
        print(f"{'='*60}")

        # Показать текущий статус
        s = self.status.get(repo, {})
        if s.get(stage) == "ok":
            answer = input(f"  [{stage}] {repo} уже выполнен (✅). Повторить? [y/N]: ").strip().lower()
            if answer != "y":
                print("  Пропускаем.")
                return True

        # Пауза перед выполнением
        answer = input(f"\n  Запустить [{stage}] для {repo}? [Y/n]: ").strip().lower()
        if answer == "n":
            print("  Пропущено по запросу.")
            self.status.setdefault(repo, {})[stage] = "skip"
            save_status(self.status)
            return True

        # Запустить агента
        success, result = self.agent.run(stage, repo)

        # Показать результат
        print("\n" + "─"*60)
        print(result)
        print("─"*60)

        # Сохранить отчёт
        report_path = self.agent.save_report(stage, repo, result)
        print(f"\nОтчёт: {report_path}")

        # Обновить статус
        self.status.setdefault(repo, {})[stage] = "ok" if success else "fail"
        save_status(self.status)

        # Пауза после — пользователь проверяет
        if stage in ("fix", "build"):
            input("\n  Проверьте результат. Нажмите Enter для продолжения...")

        return success

    def run_all_stages(self, repo: str):
        """Все этапы для одного репо."""
        for stage in self.STAGES:
            ok = self.run_stage(stage, repo)
            if not ok:
                print(f"\n❌ Этап {stage} провалился для {repo}. Останавливаемся.")
                break

    def run_stage_all_repos(self, stage: str, repos: list[str]):
        """Один этап для всех указанных репо в правильном порядке."""
        ordered = [r for r in BUILD_ORDER if r in repos]
        for repo in ordered:
            ok = self.run_stage(stage, repo)
            if not ok and stage == "build":
                print(f"\n❌ Сборка {repo} провалилась. Дальнейшие репо зависят от него.")
                answer = input("  Продолжить несмотря на ошибку? [y/N]: ").strip().lower()
                if answer != "y":
                    break


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="DSP-GPU Migration Orchestrator — поэтапная миграция через Claude API"
    )
    parser.add_argument(
        "--stage",
        choices=["fix", "build", "test", "doc", "all"],
        help="Этап миграции",
    )
    parser.add_argument(
        "--repo",
        nargs="+",
        choices=BUILD_ORDER,
        help="Репо (по умолчанию — все в правильном порядке)",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Показать текущий статус миграции",
    )
    args = parser.parse_args()

    orch = Orchestrator()

    if args.status or (not args.stage):
        print_status(orch.status)
        return

    repos = args.repo or BUILD_ORDER

    if args.stage == "all":
        # Все этапы для каждого репо поочерёдно
        for repo in [r for r in BUILD_ORDER if r in repos]:
            orch.run_all_stages(repo)
    else:
        orch.run_stage_all_repos(args.stage, repos)

    # Финальный статус
    print("\n")
    print_status(orch.status)


if __name__ == "__main__":
    main()
