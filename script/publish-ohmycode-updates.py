#!/usr/bin/env python3
"""Verify and publish a matching pair of OhMyCode Dev installers and update manifests."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import uuid

import yaml

def checksum(path):
    digest = hashlib.sha512()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return base64.b64encode(digest.digest()).decode()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--ubuntu", type=Path, required=True)
parser.add_argument("--windows", type=Path, required=True)
parser.add_argument("--server", default="root@82.202.171.13")
parser.add_argument("--check-only", action="store_true")
parser.add_argument("--notes", required=True, help="Public release description (no credentials or supplier details)")
args = parser.parse_args()
assert re.fullmatch(r"[a-zA-Z0-9_.@-]+", args.server), "Invalid SSH destination"
files = {}
versions = []
for folder, manifest_name, suffix in [(args.ubuntu, "latest-linux.yml", "-linux-amd64.deb"), (args.windows, "latest.yml", "-win-x64.exe")]:
    manifest = folder / manifest_name
    data = yaml.safe_load(manifest.read_text())
    version = data["version"]
    assert re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+-ohmycode\.[0-9]+", version), "Expected an OhMyCode Dev version"
    versions.append(version)
    assert len(data["files"]) == 1, "Expected one x64 installer per platform"
    entry = data["files"][0]
    name = entry["url"]
    assert name == f"ohmycode-dev-{version}{suffix}", "Unexpected installer URL"
    installer = folder / name
    digest = checksum(installer)
    assert digest == entry["sha512"], f"Installer checksum mismatch: {name}"
    assert installer.stat().st_size == entry["size"], f"Installer size mismatch: {name}"
    files[name] = installer
    files[manifest_name] = manifest
    blockmap = folder / (name + ".blockmap")
    if blockmap.exists():
        files[blockmap.name] = blockmap
assert versions[0] == versions[1], "Windows and Ubuntu must have the same version"
print(f"Verified Windows and Ubuntu update manifests: {versions[0]}", flush=True)
if args.check_only:
    raise SystemExit()

# Payloads are verified again on the server; manifests are switched only after both arrive.
staging = "/tmp/ohmycode-update-" + uuid.uuid4().hex
subprocess.run(["ssh", args.server, "mkdir", "-p", staging], check=True)
with tempfile.TemporaryDirectory(prefix="ohmycode-publish-") as tmp:
    plan = Path(tmp) / "plan.json"
    plan.write_text(json.dumps({"version": versions[0], "notes": args.notes, "files": {
        name: {"sha512": checksum(path), "size": path.stat().st_size}
        for name, path in files.items()
    }}))
    subprocess.run(["scp", *map(str, files.values()), str(plan), f"{args.server}:{staging}/"], check=True)
    remote = r"""
from pathlib import Path
import base64,hashlib,json,os,re,sys
def checksum(path):
    digest = hashlib.sha512()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return base64.b64encode(digest.digest()).decode()

staging = Path(sys.argv[1])
plan = json.loads((staging / 'plan.json').read_text())
root = Path('/opt/ohmylama/backend/uploads/ohmycode-updates')
feed = root / 'dev'
feed.mkdir(parents=True, exist_ok=True)
for manifest_name in ['latest.yml', 'latest-linux.yml']:
    previous = feed / manifest_name
    if previous.exists():
        match = re.search(r'^version: ([^\n]+)', previous.read_text(), re.MULTILINE)
        assert match, 'Existing update manifest is invalid'
        assert tuple(map(int, re.findall(r'\d+', plan['version']))) >= tuple(map(int, re.findall(r'\d+', match.group(1)))), 'Refusing to roll back the published feed'
for name, expected in plan['files'].items():
    assert Path(name).name == name, 'Unsafe asset name'
    path = staging / name
    assert path.stat().st_size == expected['size'], name
    assert checksum(path) == expected['sha512'], name
    if name not in ['latest.yml', 'latest-linux.yml'] and (feed / name).exists():
        assert checksum(feed / name) == expected['sha512'], 'Published installer is immutable; bump version'
for name in plan['files']:
    if name not in ['latest.yml', 'latest-linux.yml']:
        os.replace(staging / name, feed / name)
notes_path = root / 'changelog.json'
notes = json.loads(notes_path.read_text()) if notes_path.exists() else []
if not any(note.get('tag') == plan['version'] for note in notes):
    notes.insert(0, {'tag': plan['version'], 'name': 'OhMyCode ' + plan['version'], 'highlights': [{'source': 'desktop', 'title': 'Обновления OhMyCode', 'description': plan['notes']}]})
    next_notes = root / 'changelog.next.json'
    next_notes.write_text(json.dumps(notes, ensure_ascii=False, indent=2) + '\n')
    os.replace(next_notes, notes_path)
for name in ['latest.yml', 'latest-linux.yml']:
    os.replace(staging / name, feed / name)
(staging / 'plan.json').unlink()
staging.rmdir()
print('Published OhMyCode Dev feed:', plan['version'])
"""
    subprocess.run(["ssh", args.server, "python3", "-", shlex.quote(staging)], input=remote, text=True, check=True)
