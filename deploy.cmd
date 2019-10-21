@echo off
setlocal enabledelayedexpansion
:: script to deploy current dir to a target dir.
:: Run with init command to set the target dir.
:: Run with install (or npm run install) to copy updated files.

if /I .%1 neq .init goto :install
rem Remove quoting - added everywhere else
set dir=%~2
if .%2 neq . goto :gotdir

:getdir
set /p dir="Please enter directory name or quit: "
if not defined dir goto :getdir

set dir=%dir:"=%
if /I "%dir%" equ "quit" goto :EOF

:gotdir
for %%i in ("%dir%") do @set fdir=%%~fi && set fattr=%%~ai
if not exist "%fdir%" ( echo Err: Directory %dir% not found && goto :EOF )
if /i "!fattr:~0,1!" neq "D" ( echo Err: %dir% is a file name && goto :EOF )

rem FOR %%I in (%fdir%) DO @( PUSHD %%I 2>NUL && ( set l=%%~fI && POPD ) || ( IF exist %%I ( echo %%I is a file name) ELSE ( echo Directory %%I not found ) ) )
rem if .%l% equ . goto :EOF

rem Save the target in the git config
git config --unset deploy.dir
git config --add deploy.dir "%fdir%"
for /F "usebackq delims=" %%i in (`git config --get deploy.dir`) do @set cdir=%%i
echo Target directory set to %cdir%
goto :EOF

:install
if /I .%1 neq .install goto :unknown
rem extract target dir from git
for /F "usebackq delims=" %%i in (`git config --get deploy.dir`) do @set dir=%%i
if "%dir%" equ "" ( echo Run init to set the target directory && goto :EOF )
rem set exfiles=%~nx0 .* *.md LICENSE package.json
rem robocopy .\src "%dir%" /s /dcopy:DAT /xf %exfiles% /xo /l /x /xd .git
robocopy .\src "%dir%" /s /dcopy:DAT /xo /x
goto :EOF

:unknown
if .%1 equ . (
	echo Required parameter missing
) else (
	echo Unknown parameter %1
)
echo Valid parameters are: init or install
