@echo off
rem  Registro de Horas - abre la app en http://localhost:8123/
rem  Doble clic aqui (o en el acceso directo del escritorio). La ventana negra
rem  aparece un segundo y se va; el servidor sigue atras, sin ventana.
rem  Que hace falta esto y como se instala la app: ver README.md
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0servidor-local.ps1"
