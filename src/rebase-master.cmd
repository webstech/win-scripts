@echo off
@rem rebase master from upstream/master.
@rem If the current branch is not master and it has no changes,
@rem switch to master, rebase and switch back.

setlocal enabledelayedexpansion

FOR /F "usebackq" %%i IN (`git branch --show-current`) DO set br=%%i
if /I .%br% neq .master (
	@rem can't use git status -s |find /c " "
	FOR /F "usebackq" %%i IN (`git status -s`) DO set ch=%%i
 	if /I .!ch! neq . (
		echo Current branch %br% is not master and contains changes.
		goto :EOF
	)
	git checkout master
)

git pull -r upstream master

if /I .%br% neq .master (
	git checkout %br%
)
