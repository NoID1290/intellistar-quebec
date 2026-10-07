@echo off
setlocal
echo ==========================================================================
echo  IntelliSTAR Live Stream -^> VLC Player Launcher
echo ==========================================================================

set PORT=7070
set PLAYLIST=index.m3u8
set STREAM_URL=http://localhost:%PORT%/stream/%PLAYLIST%

if not "%~1"=="" (
    set STREAM_URL=%~1
)

echo Target Stream URL: %STREAM_URL%
echo ==========================================================================

rem Check common VLC install locations on Windows
set "VLC_PATH="
if exist "%ProgramFiles%\VideoLAN\VLC\vlc.exe" set "VLC_PATH=%ProgramFiles%\VideoLAN\VLC\vlc.exe"
if exist "%ProgramFiles(x86)%\VideoLAN\VLC\vlc.exe" set "VLC_PATH=%ProgramFiles(x86)%\VideoLAN\VLC\vlc.exe"

if "%VLC_PATH%"=="" (
    where vlc >nul 2>&1
    if not errorlevel 1 (
        set "VLC_PATH=vlc"
    )
)

if "%VLC_PATH%"=="" (
    echo [ERROR] VLC Media Player was not found in standard install paths.
    echo Please install VLC from https://www.videolan.org/vlc/
    echo Or open this stream URL manually in VLC:
    echo   %STREAM_URL%
    pause
    exit /b 1
)

echo Launching VLC in fullscreen with low-latency live streaming options...
start "" "%VLC_PATH%" --fullscreen --network-caching=1000 --clock-jitter=0 --clock-synchro=0 --no-video-title-show --input-repeat=65535 --no-play-and-exit "%STREAM_URL%"
endlocal

