@echo off
setlocal
set dir=%1
if .%1 neq . goto :gotdir
:getdir
set /p dir=Please enter directory name or quit
if /I .%dir% equ .quit goto :EOF
if .%dir% equ . goto :getdir

:gotdir
if .%dir% equ ..\ set dir=
if .%dir% equ .. set dir=
git init %dir%
if .%dir% neq . pushd %dir%

@FOR /F "usebackq" %%i IN (`npm get init.license`) DO @set l=%%i
@FOR /F "usebackq delims==" %%i IN (`npm get init.author.name`) DO @set a=%%i
@FOR /F "usebackq" %%i IN (`npm get init.author.email`) DO @set e=%%i
call npx license %l% -o "%a%">LICENSE
call npx gitignore node
call npx covgen "%e%"
call npm init -y
git add -A
git commit -m "Initial commit"
if .%dir% neq . popd