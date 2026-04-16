@echo off
rem curl "https://wise.com/rates/live?source=USD&target=CAD" -s

setlocal
set shares=18000
set currency1=USD
set currency2=CAD
:c extract price from result and separate dollars and cents for math
FOR /F "usebackq delims=:, tokens=6" %%i IN (`curl "https://wise.com/rates/live?source=%currency1%&target=%currency2%" -s`) DO set price=%%i
FOR /F "usebackq delims=. tokens=1" %%i IN ('%price%') DO set dollars=%%i
FOR /F "usebackq delims=. tokens=2" %%i IN ('%price%') DO set cents=%%i

:c determine divisor for extra dollars
set /a divi=%cents%/10000
if %cents% LSS 10    set divi=10
if %cents% LSS 100   set divi=100
if %cents% LSS 1000  set divi=1000
if %cents% LSS 10000 set divi=10000
if %cents% GEQ 10000 set divi=100000

set /a tdol=%dollars%*%shares%
set /a tcen=%cents%*%shares%
set /a plusdol=%tcen%/%divi%
set /a minuscent=%tcen%-(%plusdol%*%divi%)
set /a totdol=%tdol%+%plusdol%

echo Wise says $%shares% %currency1% converts to $%totdol%.%minuscent:~0,2% %currency2% at %price% on %date% %time:~0,-3%.
endlocal
