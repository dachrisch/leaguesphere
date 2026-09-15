#!/usr/bin/env gjs
/* Long-lived Wayland screen recorder for the record-tutorial skill.
 *
 * Holds an org.gnome.Mutter.ScreenCast D-Bus session open (it dies with our
 * bus connection, so this process must live for the whole recording) and
 * captures the compositor's PipeWire stream via gst-launch-1.0 to .mp4.
 *
 * Usage:
 *   gjs record_wayland.js --output /tmp/<slug>.mp4 [--monitor eDP-1]
 *
 * Normally launched via start_wayland_recording.py, which writes the pidfile
 * and waits for the "recording started -> ..." readiness line below.
 */
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GLibUnix = imports.gi.GLibUnix;

const SCREENCAST_BUS = 'org.gnome.Mutter.ScreenCast';
const SCREENCAST_PATH = '/org/gnome/Mutter/ScreenCast';
const SCREENCAST_IFACE = 'org.gnome.Mutter.ScreenCast';
const SESSION_IFACE = 'org.gnome.Mutter.ScreenCast.Session';
const STREAM_IFACE = 'org.gnome.Mutter.ScreenCast.Stream';

function parseArgs(argv) {
    const out = { output: null, monitor: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--output') out.output = argv[++i];
        else if (argv[i] === '--monitor') out.monitor = argv[++i];
    }
    if (!out.output) {
        printerr('usage: record_wayland.js --output OUT.mp4 [--monitor NAME]');
        return null;
    }
    return out;
}

function busCall(dest, path, iface, method, params) {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call(dest, path, iface, method, params, null,
            Gio.DBusCallFlags.NONE, -1, null, (conn, res) => {
                try { resolve(Gio.DBus.session.call_finish(res)); }
                catch (e) { reject(e); }
            });
    });
}

async function defaultMonitor() {
    const state = await busCall('org.gnome.Mutter.DisplayConfig',
        '/org/gnome/Mutter/DisplayConfig', 'org.gnome.Mutter.DisplayConfig',
        'GetCurrentState', null);
    const monitors = state.deep_unpack()[1];
    if (!monitors.length) throw new Error('no monitors reported by DisplayConfig');
    // Monitor struct starts with a (connector, vendor, product, serial) tuple.
    let connector = monitors[0][0];
    while (Array.isArray(connector)) connector = connector[0];
    return connector;
}

const loop = new GLib.MainLoop(null, false);
let child = null;
let sessionPath = null;
let stopping = false;

function shutdown(exitCode) {
    if (stopping) return;
    stopping = true;
    const done = () => loop.quit();
    if (child) {
        try { child.send_signal(2); } catch (e) { /* already gone */ }
        child.wait_async(null, () => {
            busCall(SCREENCAST_BUS, sessionPath, SESSION_IFACE, 'Stop', null)
                .catch(() => {}).finally(done);
        });
        // Safety net: never hang the stopper longer than 20s.
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20000, () => { loop.quit(); return GLib.SOURCE_REMOVE; });
    } else {
        if (sessionPath) {
            busCall(SCREENCAST_BUS, sessionPath, SESSION_IFACE, 'Stop', null)
                .catch(() => {}).finally(done);
        } else {
            done();
        }
    }
}

async function main(args) {
    const monitor = args.monitor || await defaultMonitor();
    print(`monitor: ${monitor}`);

    const sc = await busCall(SCREENCAST_BUS, SCREENCAST_PATH, SCREENCAST_IFACE,
        'CreateSession', new GLib.Variant('(a{sv})', [{}]));
    sessionPath = sc.deep_unpack()[0];

    const st = await busCall(SCREENCAST_BUS, sessionPath, SESSION_IFACE,
        'RecordMonitor', new GLib.Variant('(sa{sv})', [monitor, {}]));
    const streamPath = st.deep_unpack()[0];

    await new Promise((resolve, reject) => {
        Gio.DBus.session.signal_subscribe(SCREENCAST_BUS, STREAM_IFACE,
            'PipeWireStreamAdded', streamPath, null, Gio.DBusSignalFlags.NONE,
            (conn, sender, path, iface, sig, params) => {
                try {
                    const node = params.deep_unpack()[0];
                    print(`pipewire node: ${node}`);
                    child = new Gio.Subprocess({ argv: ['gst-launch-1.0', '-e',
                        'pipewiresrc', `path=${node}`, '!',
                        'videoconvert', '!',
                        'x264enc', 'tune=zerolatency', 'bitrate=4096', 'speed-preset=veryfast', '!',
                        'mp4mux', '!', 'filesink', `location=${args.output}`],
                        flags: Gio.SubprocessFlags.NONE });
                    child.init(null);
                    resolve();
                } catch (e) { reject(e); }
            });
        busCall(SCREENCAST_BUS, sessionPath, SESSION_IFACE, 'Start', null).catch(reject);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 15000, () => {
            reject(new Error('timed out waiting for PipeWireStreamAdded'));
            return GLib.SOURCE_REMOVE;
        });
    });

    const fs = imports.gi.Gio.File.new_for_path(args.pidfile);
    fs.replace_contents(JSON.stringify({ backend: 'wayland', recorder_pid: 0, output: args.output }) + '\n',
        null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    // Fill in our real pid after the fact (gjs has no direct getpid; use /proc/self).
    // Readiness signal: start_wayland_recording.py waits for this line before
    // writing the pidfile, so capture never starts before the pipeline runs.
    print(`recording started -> ${args.output}`);
}

GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, 15 /* SIGTERM */, () => { shutdown(0); return GLib.SOURCE_REMOVE; });
GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, 2 /* SIGINT */, () => { shutdown(0); return GLib.SOURCE_REMOVE; });

const args = parseArgs(ARGV);
if (!args) {
    // eslint-disable-next-line no-undef
    imports.system.exit(1);
}
main(args).catch(e => { printerr('ERR: ' + e); loop.quit(); });
loop.run();
