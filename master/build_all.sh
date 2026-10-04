#!/usr/bin/env bash
# Builds every version and runs its tests. --demos also runs the demos.
# Uses $CXX if set, otherwise g++.
set -u
CXX=${CXX:-g++}
FLAGS="-std=c++20 -O0 -g -Wall -Wextra -pthread"
DEMOS=0; [ "${1:-}" = "--demos" ] && DEMOS=1
cd "$(dirname "$0")"
fail=0
for v in v0 v1 v2 v3 v4 v5 v6 v7 v8 v9 v10 v11 v12 v13 v14; do
    echo "================ $v"
    for src in "$v"/*.cpp; do
        if ! $CXX $FLAGS "$src" -o "${src%.cpp}.exe"; then
            echo "COMPILE FAILED: $src"; fail=1
        fi
    done
    if ! timeout 180 "./$v/tests.exe"; then echo "TESTS FAILED: $v"; fail=1; fi
    if [ $DEMOS = 1 ]; then
        for exe in "$v"/tiny*.exe "$v"/next_bug.exe; do
            [ -f "$exe" ] || continue
            echo "---- demo: $exe"
            timeout 10 "./$exe"; code=$?
            [ $code = 124 ] && echo "(stopped after 10 s: hung, as expected for deadlock demos)"
        done
    fi
done
[ $fail = 0 ] && echo "ALL VERSIONS OK" || echo "SOMETHING FAILED"
exit $fail
