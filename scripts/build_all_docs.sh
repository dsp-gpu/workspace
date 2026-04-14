#!/usr/bin/env bash
# Master script: build Doxygen docs for all 9 repos of DSP-GPU.
# Order: core → модули → DSP мета (TAGFILES cross-ссылки).
# Если в репо нет Doxyfile — пропускаем без ошибки.
#
# Usage: bash /home/alex/DSP-GPU/scripts/build_all_docs.sh

set -euo pipefail

DSP_ROOT="/home/alex/DSP-GPU"
REPOS=(core spectrum stats signal_generators heterodyne linalg radar strategies DSP)

echo "=== DSP-GPU Doxygen build ==="
echo "Root: $DSP_ROOT"
echo

built=0
skipped=0
failed=0

for repo in "${REPOS[@]}"; do
    doxy_dir="$DSP_ROOT/$repo/Doc/Doxygen"
    doxyfile="$doxy_dir/Doxyfile"

    if [ ! -f "$doxyfile" ]; then
        echo "[SKIP] $repo: no Doxyfile at $doxy_dir"
        skipped=$((skipped + 1))
        continue
    fi

    echo "[BUILD] $repo ..."
    if (cd "$doxy_dir" && doxygen Doxyfile > /dev/null 2>&1); then
        echo "[OK]    $repo → $doxy_dir/html/index.html"
        built=$((built + 1))
    else
        echo "[FAIL]  $repo — см. warnings"
        failed=$((failed + 1))
    fi
done

echo
echo "=== Summary ==="
echo "Built:   $built"
echo "Skipped: $skipped (Doxyfile отсутствует)"
echo "Failed:  $failed"

[ "$failed" -eq 0 ] || exit 1
