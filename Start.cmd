@echo off
setlocal
set "STUDY_APP=%~dp0app\win-unpacked\StudyDesk.exe"
if not exist "%STUDY_APP%" (
  echo StudyDesk.exe was not found. Keep Start.cmd next to the app folder.
  pause
  exit /b 1
)
start "" /D "%~dp0app\win-unpacked" "%STUDY_APP%"
exit /b 0
