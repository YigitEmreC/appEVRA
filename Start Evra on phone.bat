@echo off
rem Starts Evra in phone mode: like "Start Evra.bat", but phones on the same Wi-Fi
rem as this computer can open the app too, and use the assistant.
rem - The phone gets only the app and the demo data. Everything else in the SMART
rem   folder (the assistant's key, account data, .git) stays on this computer.
rem - The first time, Windows asks whether Python may use the network: tick
rem   "Private networks" and press Allow.
rem - Already running Evra normally? Close the "Evra server" and "Evra assistant"
rem   windows first.
setlocal EnableExtensions
set "EVRA_PHONE=1"
call "%~dp0Start Evra.bat" %*
