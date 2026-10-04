@echo off
rem Builds every version and runs its tests (Windows cmd, g++ on PATH).
setlocal enabledelayedexpansion
cd /d "%~dp0"
set FAIL=0
for %%v in (v0 v1 v2 v3 v4 v5 v6 v7 v8 v9 v10 v11 v12 v13 v14) do (
    echo ================ %%v
    for %%f in (%%v\*.cpp) do (
        g++ -std=c++20 -O0 -g -Wall -Wextra -pthread -Icommon %%f -o %%v\%%~nf.exe || set FAIL=1
    )
    %%v\tests.exe || set FAIL=1
)
if !FAIL!==0 (echo ALL VERSIONS OK) else (echo SOMETHING FAILED)
exit /b !FAIL!
