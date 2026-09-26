@echo off
setlocal
set "STUDY_SOURCE=%~dp0source"
set "STUDY_RUNTIME=%STUDY_SOURCE%\node_modules\electron\dist\electron.exe"
if not exist "%STUDY_RUNTIME%" (
  echo Dependencies are missing. Run npm ci in the source folder first.
  pause
  exit /b 1
)
start "" /D "%STUDY_SOURCE%" "%STUDY_RUNTIME%" "%STUDY_SOURCE%"
exit /b 0
