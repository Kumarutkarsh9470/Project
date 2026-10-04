@echo off
rem Build and run one program from one version:  run v2 tiny [args...]
rem Uses -O2 by default; set OPT=-O0 to explore races.
setlocal
if "%OPT%"=="" set OPT=-O2
set V=%1
set P=%2
shift & shift
pushd %~dp0%V%
g++ -std=c++20 %OPT% -g -pthread -I../common %P%.cpp -o %P%.exe || (popd & exit /b 1)
%P%.exe %1 %2 %3 %4
popd
