#!/usr/bin/env python3
import dbus
from gi.repository import GLib
from dbus.mainloop.glib import DBusGMainLoop
import subprocess, sys, os, signal, uuid

width = int(os.environ.get("STREAM_WIDTH", "1920"))
height = int(os.environ.get("STREAM_HEIGHT", "1080"))
fps = int(os.environ.get("STREAM_FPS", "60"))

uid = os.getuid()
if 'XDG_RUNTIME_DIR' not in os.environ:
    runtime_dir = f"/run/user/{uid}"
    if os.path.exists(runtime_dir):
        os.environ['XDG_RUNTIME_DIR'] = runtime_dir
if 'DBUS_SESSION_BUS_ADDRESS' not in os.environ:
    uid_bus = f"/run/user/{uid}/bus"
    if os.path.exists(uid_bus):
        os.environ['DBUS_SESSION_BUS_ADDRESS'] = f"unix:path={uid_bus}"
if 'WAYLAND_DISPLAY' not in os.environ and os.path.exists(f"/run/user/{uid}/wayland-0"):
    os.environ['WAYLAND_DISPLAY'] = "wayland-0"
if 'DISPLAY' not in os.environ and os.path.exists("/tmp/.X11-unix/X0"):
    os.environ['DISPLAY'] = ":0"

DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
loop = GLib.MainLoop()

sender = bus.get_unique_name().replace(":", "").replace(".", "_")

desktop = bus.get_object('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop')
screencast = dbus.Interface(desktop, 'org.freedesktop.portal.ScreenCast')

session_obj = None
gst_proc = None

def cleanup(*args):
    global gst_proc
    if gst_proc:
        try:
            gst_proc.terminate()
            gst_proc.wait(timeout=2)
        except Exception:
            try:
                gst_proc.kill()
            except Exception:
                pass
    if loop.is_running():
        loop.quit()
    sys.exit(0)

signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

TOKEN_FILE = os.path.expanduser("~/.config/intellistar-screencast-token.txt")

def make_request(method, handle_token, options, callback):
    req_path = f"/org/freedesktop/portal/desktop/request/{sender}/{handle_token}"
    bus.add_signal_receiver(callback, signal_name='Response', dbus_interface='org.freedesktop.portal.Request', path=req_path)
    options['handle_token'] = handle_token
    return method(options)

def on_start(response, results):
    global gst_proc
    if response == 0:
        streams = results.get('streams', [])
        restore_token = results.get('restore_token')
        if restore_token:
            try:
                os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
                with open(TOKEN_FILE, 'w') as f:
                    f.write(str(restore_token))
                sys.stderr.write(f"Portal: saved restore token to {TOKEN_FILE}\n")
            except Exception as e:
                sys.stderr.write(f"Portal: warning saving restore token: {e}\n")
        if not streams:
            sys.stderr.write("Portal: no streams returned\n")
            cleanup()
            return
        node_id = streams[0][0]
        sys.stderr.write(f"Portal: authorized screen node {node_id}\n")
        
        # Open PipeWire remote FD
        try:
            fd_handle = screencast.OpenPipeWireRemote(session_obj, {})
            fd = fd_handle.take()
            sys.stderr.write(f"Portal: opened PipeWire remote FD {fd}\n")
            
            gst_cmd = [
                'gst-launch-1.0', '-q',
                'pipewiresrc', f'fd={fd}', f'path={node_id}', 'do-timestamp=true', 'keepalive-time=1000',
                '!', 'videoconvert',
                '!', 'videoscale', 'method=0',
                '!', 'videorate',
                '!', f'video/x-raw,format=BGRx,width={width},height={height},framerate={fps}/1',
                '!', 'fdsink', 'fd=1', 'sync=false'
            ]
            sys.stderr.write(f"Starting GStreamer: {' '.join(gst_cmd)}\n")
            sys.stderr.flush()
            gst_proc = subprocess.Popen(gst_cmd, stdout=sys.stdout, stderr=sys.stderr, pass_fds=[fd])
            gst_proc.wait()
        except Exception as e:
            sys.stderr.write(f"Portal GStreamer error: {e}\n")
        finally:
            cleanup()
    else:
        sys.stderr.write(f"Portal: user cancelled or denied sharing (response {response})\n")
        cleanup()

def on_select(response, results):
    if response == 0:
        token = f"iptv_start_{uuid.uuid4().hex[:8]}"
        sys.stderr.write("Portal: SelectSources approved. Requesting Start session...\n")
        sys.stderr.flush()
        try:
            subprocess.run(['notify-send', '-u', 'normal', '-t', '10000', 'IntelliStar Broadcast', 'Click "Share" on the Screen Sharing dialog to start capture!'], check=False)
        except Exception:
            pass
        make_request(lambda opt: screencast.Start(session_obj, '', opt), token, {}, on_start)
    else:
        sys.stderr.write(f"Portal: SelectSources denied ({response})\n")
        sys.stderr.flush()
        cleanup()

def on_create(response, results):
    global session_obj
    if response == 0:
        session_obj = results['session_handle']
        sys.stderr.write(f"Portal: session created ({session_obj}). Selecting sources...\n")
        sys.stderr.flush()
        select_opts = {
            'types': dbus.UInt32(1), # Monitor
            'multiple': False,
            'persist_mode': dbus.UInt32(2), # Persist until explicitly revoked
        }
        if os.path.exists(TOKEN_FILE):
            try:
                with open(TOKEN_FILE, 'r') as f:
                    tok = f.read().strip()
                    if tok:
                        select_opts['restore_token'] = tok
                        sys.stderr.write(f"Portal: using restore token from {TOKEN_FILE}\n")
                        sys.stderr.flush()
            except Exception as e:
                pass
        token = f"iptv_sel_{uuid.uuid4().hex[:8]}"
        make_request(lambda opt: screencast.SelectSources(session_obj, opt), token, select_opts, on_select)
    else:
        sys.stderr.write(f"Portal: CreateSession failed ({response})\n")
        sys.stderr.flush()
        cleanup()

session_token = f"iptv_sess_{uuid.uuid4().hex[:8]}"
create_token = f"iptv_create_{uuid.uuid4().hex[:8]}"
sys.stderr.write("Portal: initiating ScreenCast session...\n")
sys.stderr.flush()
make_request(screencast.CreateSession, create_token, {'session_handle_token': session_token}, on_create)

loop.run()
