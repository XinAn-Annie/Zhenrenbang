@echo off
title SkillS 本地启动器
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0启动SkillS本地版.ps1"
if errorlevel 1 pause
