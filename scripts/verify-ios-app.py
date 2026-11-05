#!/usr/bin/env python3
"""Run on macOS after a Device build; no signing credentials required."""
import json
import plistlib
import subprocess
import sys
from pathlib import Path

app = Path(sys.argv[1]).resolve()
with (app / 'Info.plist').open('rb') as stream:
    info = plistlib.load(stream)
assert info['CFBundleIdentifier'] == 'io.github.ganzzis.split', info
assert tuple(map(int, info['MinimumOSVersion'].split('.'))) >= (16, 0), info
binary = app / info['CFBundleExecutable']
archs = subprocess.check_output(['lipo', '-archs', str(binary)], text=True).split()
assert 'arm64' in archs and 'x86_64' not in archs, archs
for name in ['index.html', 'native.js', 'native.css', 'core.js', 'history.js', 'items-core.js', 'script.js', 'reports.js', 'share-ui.js', 'pwa.js', 'icons/icon-192.png']:
    assert (app / 'public' / name).is_file(), name
config = json.loads((app / 'capacitor.config.json').read_text())
assert config['appId'] == info['CFBundleIdentifier']
assert not config.get('server', {}).get('url')
assert (app / 'PrivacyInfo.xcprivacy').is_file()
# SPM may link Capacitor statically; a Frameworks/Capacitor.framework is not required then.
symbols = ''
for image in [binary, *app.glob('*.debug.dylib')]:
    symbols += subprocess.check_output(['nm', '-a', str(image)], text=True, stderr=subprocess.DEVNULL)
assert 'Capacitor' in symbols and 'SplitDocuments' in symbols, 'Native bridge symbols missing'
links = subprocess.check_output(['otool', '-L', str(binary)], text=True)
for line in links.splitlines()[1:]:
    library = line.strip().split(' (')[0]
    if library.startswith('@rpath/') and '.framework/' in library:
        assert (app / 'Frameworks' / library.removeprefix('@rpath/')).is_file(), library
print('Verified: ARM64 device app, bundle ID, iOS 16+, local resources, privacy manifest, Capacitor/document plugin linkage')
print(links)
