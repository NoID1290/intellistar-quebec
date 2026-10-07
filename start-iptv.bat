@echo off
setlocal

REM Optional: set STREAM_HLS_SHARE to auto-map R: when hlsDirectory points to R:/...
REM Example: set "STREAM_HLS_SHARE=\\media-server\intelli-cache"
if not defined STREAM_HLS_DIRECTORY set "STREAM_HLS_DIRECTORY=R:/intelli-cache"

set "HLS_DRIVE=R:"
if /I "%STREAM_HLS_DIRECTORY:~0,2%"=="%HLS_DRIVE%" (
	if not exist %HLS_DRIVE%\ (
		if defined STREAM_HLS_SHARE (
			echo [IPTV] Mapping %HLS_DRIVE% to %STREAM_HLS_SHARE%...
			net use %HLS_DRIVE% "%STREAM_HLS_SHARE%" /persistent:no >nul
			if errorlevel 1 (
				echo [IPTV] Failed to map %HLS_DRIVE%. Check STREAM_HLS_SHARE and network credentials.
				exit /b 1
		) else (
			echo [IPTV] %HLS_DRIVE% is not available and STREAM_HLS_SHARE is not set.
			echo [IPTV] Set STREAM_HLS_SHARE to your UNC path, then rerun this script.
			echo [IPTV] Example: set "STREAM_HLS_SHARE=\\YOUR-SERVER\YOUR-SHARE"
			exit /b 1
		)
	)
)

npm run start-iptv
