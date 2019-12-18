@echo off
@rem Update stock quotes by scraping from the web.
@rem The quotes can be used in vlookup in spreadsheets.
@rem Quotes from tmxmoney are scraped based on specific data format.
@rem Quotes from ? are just the data.
@rem The intention is to make spreadsheets more responsive with this command
@rem scheduled to run once a day.

@rem This is an exercise in cmd that may be better in javascript.

@rem Initial run with /init option.  The git config must be updated with the
@rem sources, symbols and filters associated with each source.
@rem git config --add quote.sources "tsx iex"
@rem git config --add tsx.url https://web.tmxmoney.com/quote.php?qm_symbol=$SYM$
@rem git config --add iex.url https://cloud.iexapis.com/stable/stock/$SYM$/quote/latestPrice?token=pk_feeddeadbeef
@rem git config --add iex.filter /.*/
@rem git config --add iex.quotes "aapl hd txn vlo"
@rem git config --add tdn.quotes "1428"
@rem git config --add tdn.url https://www.tdstructurednotes.com/snp/noteDetails.action?noteId=$SYM$
@rem git config --add tdn.filter /^[ \t]+[0-9.]+[ \t\f\r]*$/

setlocal enabledelayedexpansion

@rem defaults
for /f "tokens=3* delims= " %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v "Personal"') do (set mydocuments=%%a)
set target_dir="!mydocuments!\My Money Docs\quotes"

rem
rem Loop through switches
rem

:setprm
if /I .%1==. goto doit
if /I %1==/dir goto parmDir
if /I %1==--dir goto parmDir

if /I %1==/init goto parmInit
if /I %1==--init goto parmInit
if /I %1==-i goto parmInit

if /I %1==/g goto parmFilter
if /I %1==--filter goto parmFilter
if /I %1==-f goto parmFilter

if /I %1==/? goto help
if /I %1==--help goto help
if /I %1==-? goto help

if /I %1==/t goto trace
if /I %1==-t goto trace

echo Unknown parameter: %1
echo.
goto help

@rem -------------------
:parmDir
shift
if .%1 neq . set target_dir=%~f1
goto nxtprm

@rem -------------------
:parmInit
set init=true
goto nxtprm

@rem -------------------
:parmFilter
shift
if .%1 neq . set filter=%1 %filter%
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
if /%init% equ /true goto :init

@rem if not exist %target_dir% call :init

pushd %target_dir%
if exist quotes.csv del quotes.csv
for /F "usebackq delims=" %%i in (`git config --get quote.sources`) do @set qsources=%%i
if .%filter% equ . set filter=%qsources%

@rem Process each source
FOR  %%i IN ( %qsources% ) DO (
	set type=%%i
	set FN=!type!.csv
	set ff=!filter:%%i=!
	if "!ff!" neq "%filter%" (

		for /F "usebackq delims=" %%j in (`git config --get !type!.url`) do @set url=%%j
		for /F "usebackq delims=" %%j in (`git config --get !type!.filter`) do @set filter=%%j
		for /F "usebackq delims=" %%j in (`git config --get !type!.quotes`) do @set quotes=%%j

		echo.
		echo Processing !type!: !quotes!
		echo.
		if exist !FN! del !FN!

		@rem Process each stock
		FOR  %%i IN ( !quotes! ) DO (
			set stock=%%i
			@rem set FN=%target_dir%\!type!_!stock:.=_!.csv
			@rem @echo Updating !FN!

			@rem if exist !FN!.bak del !FN!.bak
			@rem Need filename for rename
			@rem FOR  %%i IN (!FN!) do set bfn=%%~nxi
			@rem if exist !FN! ren !FN! !bfn!.bak
			call set uri=!url:$SYM$=%%i!

			@rem curl -s !uri!|awk "!filter! { match($0,/[0-9.]+/); print strftime(""%%y-%%m-%%d;%%H:%%M:%%S;"") ""%%i;"" substr($0,RSTART,RLENGTH)}" >!FN!
			curl -s !uri!|awk "!filter! { match($0,/[0-9.]+/); print ""%%i,"" substr($0,RSTART,RLENGTH)}" >>!FN!

			@rem if file not found or empty, no quote was obtained so collect failures
			if not exist !FN! (
				set fail=!fail! %%i
			) else (
				FOR  %%x IN (!FN!) do set sz=%%~zx
				if .!sz! equ .0 set fail=!fail! %%i
			)

			@rem if exist !FN!.bak ( type !FN!.bak >>!FN! && del !FN!.bak )
		)
		if exist !type!.csv (
			@rem mysqlimport  --fields-terminated-by=, -c 'symbol,price' --local -u loadquotes --skip-password !type!.csv
			"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqlimport"  --fields-terminated-by=, -c symbol,price --local -u loadquotes --skip-password quotes !type!.csv
		)
	)

	if exist !type!.csv type !type!.csv >>quotes.csv
)

if exist quotes.csv sort quotes.csv /o quotes.csv

popd
@if ".%fail%" equ "." (
	echo Quotes updated at %date% %time%
) else (
	@rem Whine about failed updates
	@echo Updates were not obtained for the following at %date% %time%:
	@FOR  %%i IN ( !fail! ) DO (
		@echo    %%i
	)
	exit /b 8
)
goto :EOF

		rem curl -s !uri!|awk "!filter! { match($0,/[0-9.]+/); print strftime(""%%y-%%m-%%d;%%H:%%M:%%S;"") ""%%i;"" substr($0,RSTART,RLENGTH)}" >!FN!
		rem curl -s https://web.tmxmoney.com/quote.php?qm_symbol=%%i|awk "/\$.*span.*span/ { match($0,/[0-9.]+/); print strftime(""%%y-%%m-%%d;%%H:%%M:%%S;"") ""%%i;"" substr($0,RSTART,RLENGTH)}" >!FN!
		rem awk "/\$.*span.*span/ { match($0,/[0-9.]+/); print strftime(""%%y-%%m-%%d;%%H:%%M:%%S;"") substr($0,RSTART,RLENGTH)}" ~/ry.txt >!FN!
set quotes=ry fxc fxc.wt cif843 sot.un pby.un gmp.pr.c rpd100 cif843 gmp srt.un nbc2729 sls8701 sls9101 sls8601 enb ahp1705
echo Processing %quotes%

@rem Process each stock
@FOR  %%i IN ( %quotes% ) DO (
	set stock=%%i
	set FN=%target_dir%\tmx_!stock:.=_!.csv
	@echo updating !FN!

	if exist !FN!.bak del !FN!.bak
	@rem Need filename for rename
	FOR  %%i IN (!FN!) do set bfn=%%~nxi
	if exist !FN! ren !FN! !bfn!.bak
	curl -s https://web.tmxmoney.com/quote.php?qm_symbol=%%i|awk "/\$.*span.*span/ { match($0,/[0-9.]+/); print strftime(""%%y-%%m-%%d;%%H:%%M:%%S;"") ""%%i;"" substr($0,RSTART,RLENGTH)}" >!FN!
	rem awk "/\$.*span.*span/ { match($0,/[0-9.]+/); print strftime(""%%y-%%m-%%d;%%H:%%M:%%S;"") substr($0,RSTART,RLENGTH)}" ~/ry.txt >!FN!

	@rem if file not found or empty, no quote was obtained so collect fails
	if not exist !FN! ( set fail=!fail! %%i
	) else (
		FOR  %%x IN (!FN!) do set sz=%%~zx
		if .sz equ .0 set fail=!fail! %%x
	)

	if exist !FN!.bak ( type !FN!.bak >>!FN! && del !FN!.bak )
)

@if .!fail! equ . (
	echo Quotes updated at %date% %time%
) else (
	@rem Whine about failed updates
	@echo Updates were not obtained for the following at %date% %time%:
	@FOR  %%i IN ( !fail! ) DO (
		@echo    %%i
	)
	exit /b 8
)

goto :EOF

@rem create dir and init git
:init
if not exist %target_dir% mkdir %target_dir%
pushd %target_dir%
git init
popd

if 1 equ 0 (
@FOR  /f "tokens=1-2" %%i IN ( %target_dir%\..\quotes.txt ) DO (
	if /i %%i neq source (
		set stock=%%j
		touch %target_dir%\%%i_!stock:.=_!.csv
	)
)
)
goto :EOF

:help
@echo %0 [--dir dir] [--init] [--filter group]
@echo.
@echo where
@echo dir is the directory where the information is to be saved
@echo.
@echo --init perform basic initialization.  This will init a git repo.  The config must
@echo        be updated to set the groups, symbols and filters.
@echo.
@echo group is a specific group to be updated
goto :EOF

:severl flavours of noise
echo hi there|awk '/t(.*)r/ { print strftime("%y-%m-%d;%H:%M:%S;") $1 }'
rem expecting:
rem 19-12-04;16:58:47;hi

rem echo hi there|awk 'match($0,/t(.*)r/) { print strftime("%y-%m-%d;%H:%M:%S;") substr($0,RSTART+1,RLENGTH-2) }'
rem 19-12-04;22:28:18;he

curl -s https://web.tmxmoney.com/quote.php?qm_symbol=ry|grep /\$.*span.*span/

	curl -s https://web.tmxmoney.com/quote.php?qm_symbol=ry|awk 'match($0,/\$ +.*?span>(.*)./span) { print strftime("%y-%m-%d;%H:%M:%S;") substr($0,RSTART+1,RLENGTH-2) }'
curl -s https://web.tmxmoney.com/quote.php?qm_symbol=ry|awk 'match($0,/\$ +.*?span>(.*)./span) { print strftime("%y-%m-%d;%H:%M:%S;") substr($0,RSTART+1,RLENGTH-2) }'
curl -s https://web.tmxmoney.com/quote.php?qm_symbol=ry|awk '/\$ +.*?span.(.*)./span)/ { match($0,/[:digit:]+/); print strftime("%y-%m-%d;%H:%M:%S;") substr($0,RSTART,RLENGTH) }'
awk '/\$.*span.*span/ { match($0,/[0-9.]+/); print strftime("%y-%m-%d;%H:%M:%S;") substr($0,RSTART,RLENGTH)}'