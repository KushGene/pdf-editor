#!/usr/bin/env bash
#
# Release-Skript: hebt die Version in package.json, src-tauri/tauri.conf.json
# und src-tauri/Cargo.toml synchron an, committet, taggt mit vX.Y.Z und pusht.
# Der Tag-Push startet den GitHub-Actions-Workflow (.github/workflows/release.yml),
# der die Installer (.exe/.msi, .rpm, .AppImage, .dmg) baut und ein Draft-Release anlegt.
#
# Verwendung:
#   npm run release patch    # 0.1.0 -> 0.1.1
#   npm run release minor    # 0.1.0 -> 0.2.0
#   npm run release major    # 0.1.0 -> 1.0.0
#   npm run release 1.2.3    # exakte Version
set -euo pipefail
cd "$(dirname "$0")/.."

BUMP="${1:-}"
if [ -z "$BUMP" ]; then
  echo "Verwendung: npm run release <patch|minor|major|X.Y.Z>" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Fehler: Arbeitsverzeichnis ist nicht sauber. Bitte erst committen oder stashen." >&2
  git status --short >&2
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "Fehler: Releases nur vom main-Branch (aktuell: $BRANCH)." >&2
  exit 1
fi

git pull --ff-only origin main

CURRENT=$(node -p "require('./package.json').version")
case "$BUMP" in
  patch|minor|major)
    NEW=$(node -e "
      const [maj, min, pat] = '$CURRENT'.split('.').map(Number);
      const out = { major: [maj + 1, 0, 0], minor: [maj, min + 1, 0], patch: [maj, min, pat + 1] };
      console.log(out['$BUMP'].join('.'));
    ")
    ;;
  *)
    NEW="$BUMP"
    ;;
esac

if ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Fehler: ungültige Version '$NEW' (erwartet X.Y.Z)." >&2
  exit 1
fi

if git rev-parse "v$NEW" >/dev/null 2>&1; then
  echo "Fehler: Tag v$NEW existiert bereits." >&2
  exit 1
fi

echo "Release v$NEW (vorher v$CURRENT)"

# 1. package.json
npm pkg set version="$NEW"

# 2. tauri.conf.json
node -e "
  const fs = require('fs');
  const p = 'src-tauri/tauri.conf.json';
  const conf = JSON.parse(fs.readFileSync(p, 'utf8'));
  conf.version = '$NEW';
  fs.writeFileSync(p, JSON.stringify(conf, null, 2) + '\n');
"

# 3. Cargo.toml (erste version-Zeile = [package].version)
sed -i "0,/^version = \".*\"/s//version = \"$NEW\"/" src-tauri/Cargo.toml

# 4. Cargo.lock nachziehen
cargo update --quiet --workspace --manifest-path src-tauri/Cargo.toml

git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(release): v$NEW"
git tag -a "v$NEW" -m "v$NEW"
git push origin main --follow-tags

echo ""
echo "v$NEW gepusht. Der Build-Workflow läuft jetzt:"
echo "  https://github.com/KushGene/pdf-editor/actions"
echo "Das Release wird als Entwurf angelegt – nach dem Build hier veröffentlichen:"
echo "  https://github.com/KushGene/pdf-editor/releases"
