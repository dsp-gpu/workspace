#!/usr/bin/env bash
# build_docs.sh — собирает документацию в один DOCX (и при желании PDF/LaTeX)
# Usage:
#   bash build_docs.sh           # DOCX (по умолчанию)
#   bash build_docs.sh pdf       # PDF (нужен xelatex / MiKTeX)
#   bash build_docs.sh latex     # .tex исходник
#   bash build_docs.sh all       # DOCX + PDF + LaTeX

set -e

# ── Настройки ──────────────────────────────────────────────────────────
# Путь к pandoc. Подстрой под свою систему.
#   Если pandoc в PATH — оставь как есть:
PANDOC="${PANDOC:-pandoc}"
#   Portable pandoc на ПК Alex:
#   PANDOC="/c/Users/user/pandoc/pandoc-3.6.4/pandoc.exe"

TITLE="DSP-GPU · Распределённая сборка через SMI100"
AUTHOR="Кодо + Alex"
DATE="2026-04-19"

# Файлы в правильном порядке чтения (README → 00 → 01 → ... → 12)
FILES=(
    README.md
    00_Glossary.md
    01_Zones_Overview.md
    02_Zone0_Alex_Setup.md
    03_Zone1_SMI100_Setup.md
    04_Zone2_LP_Workflow.md
    05_Refresh_Mechanics.md
    06_Patch_Flow.md
    07_Transfer_To_Offline_PC.md
    08_CI_And_Integrity.md
    09_Scripts_Reference.md
    10_Decisions_Log.md
    11_Troubleshooting.md
    12_Security_Model.md
)

# ── Команды pandoc ─────────────────────────────────────────────────────

build_docx() {
    echo "📄 Генерирую DOCX..."
    "$PANDOC" "${FILES[@]}" \
        --toc --number-sections \
        --metadata title="$TITLE" \
        --metadata author="$AUTHOR" \
        --metadata date="$DATE" \
        -o "Distributed_Modules_Guide_${DATE}.docx"
    echo "✅ Готово: Distributed_Modules_Guide_${DATE}.docx"
}

build_pdf() {
    echo "📑 Генерирую PDF (нужен xelatex / MiKTeX)..."
    "$PANDOC" "${FILES[@]}" \
        --toc --number-sections \
        --pdf-engine=xelatex \
        --metadata title="$TITLE" \
        --metadata author="$AUTHOR" \
        --metadata date="$DATE" \
        -V mainfont="DejaVu Sans" \
        -V monofont="DejaVu Sans Mono" \
        -V geometry:margin=2cm \
        -o "Distributed_Modules_Guide_${DATE}.pdf"
    echo "✅ Готово: Distributed_Modules_Guide_${DATE}.pdf"
}

build_latex() {
    echo "📝 Генерирую LaTeX..."
    "$PANDOC" "${FILES[@]}" \
        --toc --number-sections \
        --metadata title="$TITLE" \
        --metadata author="$AUTHOR" \
        --metadata date="$DATE" \
        -o "Distributed_Modules_Guide_${DATE}.tex"
    echo "✅ Готово: Distributed_Modules_Guide_${DATE}.tex"
}

# ── Main ───────────────────────────────────────────────────────────────

TARGET="${1:-docx}"

case "$TARGET" in
    docx)   build_docx ;;
    pdf)    build_pdf ;;
    latex)  build_latex ;;
    all)    build_docx; build_latex; build_pdf ;;
    *)      echo "Usage: $0 [docx|pdf|latex|all]"; exit 1 ;;
esac
