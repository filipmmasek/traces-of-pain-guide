#!/usr/bin/env python3
"""Copy the guide website into the Android app (assets/site) with a manifest of git blob ids.

Run from anywhere inside the repo. The app compares these ids with GitHub's to download only
changed files later. Keep EXCLUDE in step with SiteStore.included() in the app.
"""
import json
import os
import shutil
import subprocess

EXCLUDE_PREFIX = ("android/",)
EXCLUDE = {"README.md", "wrangler.jsonc", "CNAME", "admin.html", "admin.js", "admin.css"}


def hidden(path):
    """Hosting settings such as .github/, .nojekyll and .assetsignore: GitHub Pages does not serve them."""
    return path.startswith(".") or "/." in path

root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
assets = os.path.join(root, "android", "app", "src", "main", "assets")
site = os.path.join(assets, "site")
shutil.rmtree(site, ignore_errors=True)
os.makedirs(site)

out = subprocess.check_output(["git", "-C", root, "ls-files", "-s", "-z"], text=True)
files = {}
for entry in out.split("\0"):
    if not entry:
        continue
    meta, path = entry.split("\t", 1)
    mode, sha, _stage = meta.split()
    if mode.startswith("120") or path.startswith(EXCLUDE_PREFIX) or hidden(path) or path in EXCLUDE:
        continue
    files[path] = sha
    dest = os.path.join(site, path)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copyfile(os.path.join(root, path), dest)

commit = subprocess.check_output(["git", "-C", root, "rev-parse", "HEAD"], text=True).strip()
date = subprocess.check_output(["git", "-C", root, "show", "-s", "--format=%cI", "HEAD"], text=True).strip()
# GitHub's API gives UTC dates like 2026-11-08T17:06:22Z; use the same form.
date = subprocess.check_output(["date", "-u", "-d", date, "+%Y-%m-%dT%H:%M:%SZ"], text=True).strip()
with open(os.path.join(assets, "site-manifest.json"), "w") as f:
    json.dump({"commit": commit, "date": date, "files": files}, f)
print(f"Bundled {len(files)} files from {commit[:7]} ({date})")
