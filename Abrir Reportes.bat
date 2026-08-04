@echo off
rem Abre Reportes en el navegador. Deja una ventana minimizada haciendo de
rem servidor local: cerrala cuando termines de usar la app.
start "Reportes" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
