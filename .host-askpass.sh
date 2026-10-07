#!/bin/sh

prompt="$*"

if command -v zenity >/dev/null 2>&1; then
    exec zenity --password --title="Authentication Required" --text="${prompt:-Password:}"
fi

if command -v kdialog >/dev/null 2>&1; then
    exec kdialog --title "Authentication Required" --password "${prompt:-Password:}"
fi

exit 1