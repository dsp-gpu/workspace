"""
DSP-GPU Agent Team — multi-agent pipeline через Claude API.

Оркестратор + специализированные субагенты работают параллельно:
  - cmake_agent    → проверяет/исправляет cmake/version.cmake во всех репо
  - audit_agent    → аудирует соответствие структуры эталону linalg
  - doc_agent      → проверяет документацию
  - sync_agent     → проверяет git-состояние и согласованность репо

Использование:
    python scripts/agent_team.py --task cmake      # только cmake агент
    python scripts/agent_team.py --task audit      # только аудит
    python scripts/agent_team.py --task all        # все агенты параллельно
    python scripts/agent_team.py --task sync       # проверка состояния репо
    python scripts/agent_team.py --repo linalg --task audit  # конкретный репо

Требования:
    pip install anthropic
    export ANTHROPIC_API_KEY=...
"""

import anthropic
import argparse
import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional

# ── Конфиг ──────────────────────────────────────────────────────────────────

ROOT = Path(__file__).parent.parent
REPOS = ["core", "spectrum", "stats", "signal_generators",
         "heterodyne", "linalg", "radar", "strategies", "DSP"]

MODULE_PREFIXES = {
    "core":              "DSPCORE",
    "spectrum":          "DSPSPECTRUM",
    "stats":             "DSPSTATS",
    "signal_generators": "DSPSIGNAL",
    "heterodyne":        "DSPHETERO",
    "linalg":            "DSPLINALG",
    "radar":             "DSPRADAR",
    "strategies":        "DSPSTRAT",
}

MODEL = "claude-sonnet-4-6"

# ── Helpers ──────────────────────────────────────────────────────────────────

def read_file(path: Path) -> str:
    """Читает файл, возвращает содержимое или сообщение об ошибке."""
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return f"[FILE NOT FOUND: {path}]"
    except Exception as e:
        return f"[ERROR reading {path}: {e}]"


def run_cmd(cmd: str, cwd: Path = ROOT) -> str:
    """Выполняет shell команду, возвращает stdout."""
    try:
        result = subprocess.run(
            cmd, shell=True, cwd=cwd,
            capture_output=True, text=True, timeout=30
        )
        return result.stdout + (f"\nSTDERR: {result.stderr}" if result.stderr else "")
    except subprocess.TimeoutExpired:
        return "[TIMEOUT]"
    except Exception as e:
        return f"[ERROR: {e}]"


def collect_repo_context(repo: str) -> str:
    """Собирает контекст репо для агента (cmake + structure)."""
    repo_path = ROOT / repo
    parts = [f"=== Репо: {repo} ({repo_path}) ===\n"]

    # CMakeLists.txt
    cmake_main = read_file(repo_path / "CMakeLists.txt")
    parts.append(f"--- CMakeLists.txt ---\n{cmake_main[:3000]}\n")

    # version.cmake
    version_cmake = read_file(repo_path / "cmake" / "version.cmake")
    parts.append(f"--- cmake/version.cmake ---\n{version_cmake[:3000]}\n")

    # Структура директорий
    structure = run_cmd(f"find {repo_path} -maxdepth 2 -not -path '*/build/*' -not -path '*/.git/*' | head -40")
    parts.append(f"--- Структура ---\n{structure}\n")

    return "\n".join(parts)


def load_review_doc() -> str:
    """Загружает ревью-документ cmake."""
    review_path = ROOT / "MemoryBank" / "specs" / "cmake_git_aware_build_REVIEW.md"
    return read_file(review_path)


# ── Агенты ───────────────────────────────────────────────────────────────────

class DspAgent:
    """Базовый агент DSP-GPU."""

    def __init__(self, name: str, client: anthropic.Anthropic):
        self.name = name
        self.client = client

    def run(self, prompt: str, system: str, max_tokens: int = 4096) -> str:
        """Выполняет запрос к Claude API с prompt caching."""
        print(f"  [{self.name}] Запрос к Claude...", flush=True)

        response = self.client.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            system=[
                {
                    "type": "text",
                    "text": system,
                    "cache_control": {"type": "ephemeral"},  # prompt caching
                }
            ],
            messages=[{"role": "user", "content": prompt}],
        )

        result = response.content[0].text
        # Показать использование кэша
        usage = response.usage
        cached = getattr(usage, "cache_read_input_tokens", 0)
        total = usage.input_tokens
        print(f"  [{self.name}] Готово. Токены: {total} input ({cached} cached), {usage.output_tokens} output")
        return result


class CmakeAgent(DspAgent):
    """Проверяет и описывает проблемы в cmake/version.cmake."""

    SYSTEM = """Ты — CMake-эксперт для проекта DSP-GPU (ROCm/HIP, Linux).
Анализируй cmake/version.cmake и CMakeLists.txt на наличие известных проблем:
1. BUILD_TIMESTAMP в version.h (ломает zero-rebuild)
2. Отсутствие namespace @MODULE_PREFIX@ в макросах version.h
3. Include guard #ifndef PROJECT_VERSION_H (конфликт при 8 модулях)
4. Uppercase find_package (сломает Linux сборку)
5. Отсутствие dependency guards

Отвечай структурированно: для каждой проблемы — статус (✅ ок / ❌ найдено), файл:строка, исправление.
"""

    def analyze_repo(self, repo: str) -> dict:
        context = collect_repo_context(repo)
        review = load_review_doc()

        prompt = f"""Проанализируй cmake конфигурацию репо `{repo}`.

MODULE_PREFIX для этого репо: {MODULE_PREFIXES.get(repo, 'DSP' + repo.upper()[:8])}

{context}

Ревью-документ с описанием проблем:
{review[:4000]}

Дай краткий отчёт: что найдено, что ok, что нужно исправить.
"""
        result = self.run(prompt, self.SYSTEM)
        return {"repo": repo, "agent": "cmake", "result": result}

    def analyze_all(self, repos: list[str]) -> list[dict]:
        return [self.analyze_repo(r) for r in repos]


class AuditAgent(DspAgent):
    """Аудирует структуру репо на соответствие эталону linalg."""

    SYSTEM = """Ты — архитектор проекта DSP-GPU (ROCm/HIP, Linux, модульная архитектура).
Аудируй репо на соответствие стандарту:
- include/ с публичным API (.hpp)
- src/ с реализацией
- kernels/ с .hip/.cl ядрами (НЕ inline)
- python/ с pybind11 биндингами (dsp_*_module.cpp + py_*_rocm.hpp)
- tests/ с CMakeLists.txt
- cmake/version.cmake

Эталон: репо linalg (vector_algebra). Отвечай таблицей: компонент → статус → детали.
"""

    def audit_repo(self, repo: str, linalg_context: str) -> dict:
        context = collect_repo_context(repo)

        # Дополнительно — список файлов
        repo_path = ROOT / repo
        py_files = run_cmd(f"ls {repo_path}/python/ 2>/dev/null")
        test_files = run_cmd(f"ls {repo_path}/tests/ 2>/dev/null")
        kernel_files = run_cmd(f"find {repo_path}/kernels/ -name '*.hip' -o -name '*.cl' 2>/dev/null | head -20")

        prompt = f"""Аудит репо `{repo}`.

{context}

Python bindings: {py_files}
Tests: {test_files}
Kernels: {kernel_files}

Для сравнения — эталон (linalg):
{linalg_context[:2000]}

Дай таблицу статуса и список задач для доведения до Production-ready.
"""
        result = self.run(prompt, self.SYSTEM)
        return {"repo": repo, "agent": "audit", "result": result}

    def audit_repos(self, repos: list[str]) -> list[dict]:
        # Собрать контекст эталона один раз
        linalg_ctx = collect_repo_context("linalg")
        return [self.audit_repo(r, linalg_ctx) for r in repos if r != "linalg"]


class SyncAgent(DspAgent):
    """Проверяет git-состояние и согласованность всех 10 репо."""

    SYSTEM = """Ты — DevOps-инженер проекта DSP-GPU.
Анализируй состояние git репозиториев и согласованность конфигурации.
Ищи: uncommitted changes, расхождения в версиях, пропущенные файлы.
Отвечай таблицей для каждого репо + приоритизированным списком действий.
"""

    def run_sync(self) -> dict:
        # Собрать git-статусы всех репо
        git_statuses = []
        for repo in [".", *REPOS]:
            name = "workspace" if repo == "." else repo
            status = run_cmd(f"git -C {ROOT / repo if repo != '.' else ROOT} status --short 2>/dev/null")
            branch = run_cmd(f"git -C {ROOT / repo if repo != '.' else ROOT} rev-parse --abbrev-ref HEAD 2>/dev/null").strip()
            last_commit = run_cmd(f"git -C {ROOT / repo if repo != '.' else ROOT} log --oneline -1 2>/dev/null").strip()
            git_statuses.append(f"  {name}: branch={branch}, last={last_commit}, changes={status.strip() or 'clean'}")

        git_info = "\n".join(git_statuses)

        # Проверить cmake согласованность
        cmake_check = run_cmd(
            f"grep -rn 'find_package(HIP\\|find_package(ROCm\\|find_package(ROCM' "
            f"{ROOT}/core {ROOT}/spectrum {ROOT}/stats {ROOT}/signal_generators "
            f"{ROOT}/heterodyne {ROOT}/linalg {ROOT}/radar {ROOT}/strategies 2>/dev/null | head -20"
        )

        # version.cmake наличие
        version_check = "\n".join([
            f"  {repo}: {'✅' if (ROOT / repo / 'cmake' / 'version.cmake').exists() else '❌ MISSING'}"
            for repo in REPOS if repo != "DSP"
        ])

        prompt = f"""Проверь состояние всех 10 репо DSP-GPU.

Git состояние:
{git_info}

Uppercase find_package (должно быть пусто!):
{cmake_check or '(пусто — хорошо)'}

version.cmake наличие:
{version_check}

Структура зависимостей:
core → spectrum, stats, signal_generators, heterodyne, linalg, radar, strategies → DSP

Дай:
1. Сводную таблицу статусов
2. Критические проблемы
3. Рекомендованный план действий
"""
        result = self.run(prompt, self.SYSTEM, max_tokens=2048)
        return {"agent": "sync", "result": result}


# ── Orchestrator ─────────────────────────────────────────────────────────────

class Orchestrator:
    """Запускает агентов и собирает результаты."""

    def __init__(self):
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            print("ERROR: ANTHROPIC_API_KEY не установлен!")
            sys.exit(1)
        self.client = anthropic.Anthropic(api_key=api_key)

    def save_report(self, results: list[dict], task: str):
        """Сохраняет отчёт в MemoryBank."""
        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M")
        report_dir = ROOT / "MemoryBank" / "agent_reports"
        report_dir.mkdir(parents=True, exist_ok=True)
        report_path = report_dir / f"agent_team_{task}_{timestamp}.md"

        lines = [
            f"# Agent Team Report: {task}",
            f"> Дата: {datetime.now().strftime('%Y-%m-%d %H:%M')} | Модель: {MODEL}\n",
        ]

        for r in results:
            repo_label = r.get("repo", "all")
            agent_label = r.get("agent", "unknown")
            lines.append(f"## [{agent_label}] {repo_label}\n")
            lines.append(r["result"])
            lines.append("\n---\n")

        report_path.write_text("\n".join(lines), encoding="utf-8")
        print(f"\nОтчёт сохранён: {report_path}")
        return report_path

    def run_cmake(self, repos: Optional[list[str]] = None):
        print("\n🔧 CMAKE AGENT — проверка cmake конфигурации")
        agent = CmakeAgent("cmake", self.client)
        target_repos = repos or list(MODULE_PREFIXES.keys())
        return agent.analyze_all(target_repos)

    def run_audit(self, repos: Optional[list[str]] = None):
        print("\n🔍 AUDIT AGENT — аудит структуры репо")
        agent = AuditAgent("audit", self.client)
        target_repos = repos or [r for r in REPOS if r not in ("DSP",)]
        return agent.audit_repos(target_repos)

    def run_sync(self):
        print("\n🔄 SYNC AGENT — проверка git + согласованности")
        agent = SyncAgent("sync", self.client)
        return [agent.run_sync()]

    def run_all(self, repos: Optional[list[str]] = None):
        """Запускает всех агентов последовательно (async не нужен — API rate limits)."""
        all_results = []

        print("\n" + "="*60)
        print("  DSP-GPU Agent Team — полный прогон")
        print("="*60)

        # sync сначала — быстро и не тратит много токенов
        all_results += self.run_sync()
        all_results += self.run_cmake(repos)
        all_results += self.run_audit(repos)

        return all_results


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="DSP-GPU Agent Team — автоматизированный анализ репо через Claude API"
    )
    parser.add_argument(
        "--task",
        choices=["cmake", "audit", "sync", "all"],
        default="sync",
        help="Задача для агента (default: sync)",
    )
    parser.add_argument(
        "--repo",
        nargs="+",
        choices=REPOS,
        help="Конкретные репо (по умолчанию — все)",
    )
    parser.add_argument(
        "--no-save",
        action="store_true",
        help="Не сохранять отчёт в MemoryBank",
    )
    args = parser.parse_args()

    orch = Orchestrator()
    results = []

    if args.task == "cmake":
        results = orch.run_cmake(args.repo)
    elif args.task == "audit":
        results = orch.run_audit(args.repo)
    elif args.task == "sync":
        results = orch.run_sync()
    elif args.task == "all":
        results = orch.run_all(args.repo)

    # Вывести результаты
    print("\n" + "="*60)
    for r in results:
        label = f"[{r.get('agent', '?')}] {r.get('repo', 'all')}"
        print(f"\n{'─'*60}")
        print(f"  {label}")
        print('─'*60)
        print(r["result"])

    # Сохранить отчёт
    if not args.no_save and results:
        orch.save_report(results, args.task)


if __name__ == "__main__":
    main()
