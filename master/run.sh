#!/usr/bin/env bash
# Build and run one program from one version:  ./run.sh v2 tiny [args...]
# Uses -O2 by default; set OPT=-O0 to explore races:  OPT=-O0 ./run.sh v2 tiny
set -e
v=$1; prog=$2; shift 2
cd "$(dirname "$0")/$v"
${CXX:-g++} -std=c++20 ${OPT:--O2} -g -pthread -I../common "$prog.cpp" -o "$prog.exe"
"./$prog.exe" "$@"
