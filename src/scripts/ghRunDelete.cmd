@echo off
@rem Clean up old github actions runs.
@rem status can be success, failure, startup_failure
@rem sample query:
@rem gh api repos/webstech/gitout/actions/runs -X GET -F status=failure-F created=:^>=2022-10-24

setlocal
SET this=%~n0
set runstatus=success

rem
rem Loop through switches
rem

:setprm
if /I .%1==. goto doit
if /I %1==/repo goto parmRepo
if /I %1==--repo goto parmRepo
if /I %1==-r goto parmRepo

if /I %1==/status goto parmStatus
if /I %1==--status goto parmStatus
if /I %1==-s goto parmStatus

if /I %1==/date goto parmDate
if /I %1==--date goto parmDate
if /I %1==-d goto parmDate

if /I %1==/older goto parmOlder
if /I %1==--older goto parmOlder
if /I %1==-o goto parmOlder

if /I %1==/? goto help
if /I %1==--help goto help
if /I %1==-? goto help

if /I %1==/t goto trace
if /I %1==-t goto trace

echo Unknown parameter: %1
echo.
goto help

@rem -------------------
:parmRepo
shift
if .%1 neq . set target_repo=%1
goto nxtprm

@rem -------------------
:parmStatus
shift
if .%1 equ . goto nxtprm
set statusFilter=-F status^^^=%1
@rem if .%1 neq . set runstatus=%1
goto nxtprm

@rem -------------------
:parmDate
echo %2
shift
if .%1 equ . goto nxtprm
set dateFilter=-F created=:%1
@rem if .%1 neq . set runstatus=%1
goto nxtprm

@rem -------------------
:parmOlder
echo %2
shift
if .%1 equ . goto nxtprm
set dateFilter=-F "created=:<%1"
@rem if .%1 neq . set runstatus=%1
goto nxtprm

@rem -------------------
:trace
echo on
goto nxtprm

rem -------------------
rem end of loop

:nxtprm
shift
goto setprm

rem ----------------------
rem all done with switches
rem

:doit
if .%target_repo% equ . goto :help
set repo=repos/webstech/%target_repo%
echo Cleaning up %repo%/actions/runs?status=%runstatus%

for /f "usebackq" %%i in (
    `gh api %repo%/actions/runs -X GET %statusFilter% %dateFilter% -q ".workflow_runs[]|.id" --paginate`
) do ( echo deleting %%i && echo gh api -X DELETE %repo%/actions/runs/%%i )

goto :EOF

for /f "usebackq" %%i in (
    `gh api "%repo%/actions/runs?status=%runstatus%&created_at<2022-11-01"  -q ".workflow_runs[]|.id" --paginate`
) do ( echo deleting %%i && gh api -X DELETE %repo%/actions/runs/%%i )

:help
@echo Running: %this% %*
@echo %this% (--repo ^| /repo ^| -r) ^<repository-name^> [(--status ^| /status ^| -s) ^<status^>] [(--older ^| /older ^| -o) ^<date^>]
@echo.
@echo where
@echo --repo the name of the repo to be cleaned up.
@echo.
@echo --status filter.  Only runs with the specified status will be deleted.
@echo.
@echo --older date filter.  Format is yyyy-mm-dd and runs prior to this date will be deleted.
@echo.
@echo --date filter.  THIS DOES NOT WORK.  This needs to be escaped with ^^ if it includes the ^< or ^> characters.
@echo   See https://docs.github.com/en/search-github/getting-started-with-searching-on-github/understanding-the-search-syntax#query-for-dates
@echo   for formats of the date filter.
goto :EOF
