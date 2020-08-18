@echo off
@rem use main for master branch if present.
@rem rebase master from upstream/master.
@rem If the current branch is not master and it has no changes,
@rem switch to master, rebase and switch back.

setlocal enabledelayedexpansion

set main=master
FOR /F "usebackq" %%i IN (`git branch -l main`) DO set main=main
FOR /F "usebackq" %%i IN (`git branch --show-current`) DO set br=%%i
if /I .%br% neq .%main% (
	@rem can't use git status -s |find /c " "
	FOR /F "usebackq" %%i IN (`git status -s`) DO set ch=%%i
 	if /I .!ch! neq . (
		echo Current branch %br% is not %main% and contains changes.
		goto :EOF
	)
	git checkout %main%
)

git pull -r upstream %main%

if /I .%br% neq .%main% (
	git checkout %br%
)
