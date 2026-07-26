#!/usr/bin/env bash
#
# Ergänzt die von Tauri gebauten RPM-Pakete um Metadaten, die der
# tauri-bundler nicht schreiben kann: Vendor, Packager und Group.
# Ohne Vendor-/Packager-Tag zeigen RPM-Frontends "unknown vendor" an
# (siehe crates/tauri-bundler/src/bundle/linux/rpm.rs – dort werden diese
# Tags nicht gesetzt, und es gibt keine Konfigurationsoption dafür).
#
# Das Paket wird dazu entpackt und aus einem generierten Spec neu gebaut.
# Alle übrigen Header-Werte (Name, Version, Summary, Requires, ...) werden
# aus dem Originalpaket übernommen, damit nichts verloren geht.
#
# Verwendung: scripts/patch-rpm-metadata.sh <verzeichnis-mit-rpms>
# Voraussetzungen: rpm, rpmbuild, rpm2cpio, cpio
set -euo pipefail

VENDOR="KushGene"
PACKAGER="KushGene <kushgene@posteo.de>"
GROUP="Applications/Publishing"

BUNDLE_DIR="${1:-}"
if [ -z "$BUNDLE_DIR" ] || [ ! -d "$BUNDLE_DIR" ]; then
  echo "Fehler: Verzeichnis mit RPM-Paketen angeben." >&2
  exit 1
fi

for tool in rpm rpmbuild rpm2cpio cpio; do
  command -v "$tool" >/dev/null || { echo "Fehler: '$tool' nicht gefunden." >&2; exit 1; }
done

# Gibt je nicht-leerer Zeile eine Spec-Zeile "<Tag>: <Wert>" aus.
emit_tag() {
  local tag="$1" values="$2" line
  while IFS= read -r line; do
    [ -z "${line// }" ] && continue
    [ "$line" = "(none)" ] && continue
    echo "$tag: $line"
  done <<< "$values"
}

shopt -s nullglob
RPMS=("$BUNDLE_DIR"/*.rpm)
if [ ${#RPMS[@]} -eq 0 ]; then
  echo "Fehler: keine .rpm-Datei in '$BUNDLE_DIR' gefunden." >&2
  exit 1
fi

for rpm_rel in "${RPMS[@]}"; do
  rpm_file=$(readlink -f "$rpm_rel")
  echo "== Patche $(basename "$rpm_file")"

  workdir=$(mktemp -d)
  buildroot="$workdir/buildroot"
  mkdir -p "$buildroot" "$workdir/topdir"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

  # rpm2cpio meldet je nach rpm-Version auch bei vollstaendiger Ausgabe einen
  # Fehlercode; deshalb wird das Ergebnis unten anhand der Dateiliste geprueft.
  ( cd "$buildroot" && rpm2cpio "$rpm_file" | cpio --quiet -idm ) || true

  while IFS= read -r entry; do
    [ -e "$buildroot$entry" ] || { echo "Fehler: '$entry' wurde nicht entpackt." >&2; exit 1; }
  done < <(rpm -qpl --nosignature "$rpm_file")

  q() { rpm -qp --nosignature --queryformat "$1" "$rpm_file"; }
  name=$(q '%{NAME}')
  version=$(q '%{VERSION}')
  release=$(q '%{RELEASE}')
  epoch=$(q '%{EPOCH}')
  summary=$(q '%{SUMMARY}')
  license=$(q '%{LICENSE}')
  url=$(q '%{URL}')
  arch=$(q '%{ARCH}')
  [ "$epoch" = "(none)" ] && epoch=0

  spec="$workdir/topdir/SPECS/$name.spec"
  {
    # Kein Debuginfo-Subpaket, kein Strippen/Neu-Komprimieren der Payload und
    # keine automatische Abhängigkeitsermittlung: Die Requires stammen 1:1 aus
    # dem Originalpaket, sonst würden hier die Sonamen des Build-Hosts landen.
    echo '%global debug_package %{nil}'
    echo '%global __os_install_post %{nil}'
    echo '%global __brp_check_rpaths %{nil}'
    echo 'AutoReqProv: no'
    echo "Name: $name"
    echo "Version: $version"
    echo "Release: $release"
    echo "Epoch: $epoch"
    echo "Summary: $summary"
    echo "License: $license"
    echo "Vendor: $VENDOR"
    echo "Packager: $PACKAGER"
    echo "Group: $GROUP"
    [ "$url" != "(none)" ] && echo "URL: $url"
    echo "BuildArch: $arch"

    # rpmlib()-Requires und die Selbst-Provides erzeugt rpmbuild selbst neu.
    emit_tag Requires "$(rpm -qp --nosignature --requires "$rpm_file" | grep -v '^rpmlib(' || true)"
    emit_tag Provides "$(rpm -qp --nosignature --provides "$rpm_file" | grep -Ev "^$name(\(|[[:space:]]+=)" || true)"
    emit_tag Conflicts "$(rpm -qp --nosignature --conflicts "$rpm_file")"
    emit_tag Obsoletes "$(rpm -qp --nosignature --obsoletes "$rpm_file")"

    echo
    echo '%description'
    rpm -qp --nosignature --queryformat '%{DESCRIPTION}\n' "$rpm_file"
    echo
    echo '%files'
    echo '%defattr(-,root,root,-)'
    rpm -qp --nosignature --queryformat '[%{FILEMODES:perms} %{FILENAMES}\n]' "$rpm_file" \
      | while read -r mode path; do
          case "$mode" in
            d*) echo "%dir \"$path\"" ;;
            *)  echo "\"$path\"" ;;
          esac
        done
  } > "$spec"

  rpmbuild -bb \
    --define "_topdir $workdir/topdir" \
    --define "_rpmdir $workdir/out" \
    --define "_build_id_links none" \
    --buildroot "$buildroot" \
    "$spec" > "$workdir/rpmbuild.log" 2>&1 || {
      echo "Fehler: rpmbuild fehlgeschlagen." >&2
      cat "$workdir/rpmbuild.log" >&2
      exit 1
    }

  rebuilt=$(find "$workdir/out" -name '*.rpm' -type f | head -n 1)
  if [ -z "$rebuilt" ]; then
    echo "Fehler: kein neues Paket erzeugt." >&2
    cat "$workdir/rpmbuild.log" >&2
    exit 1
  fi

  # Dateiname des Originals beibehalten (rpmbuild benennt nach %{NAME}),
  # damit die Artefaktpfade des Workflows weiterhin stimmen.
  mv -f "$rebuilt" "$rpm_file"
  rm -rf "$workdir"

  actual_vendor=$(rpm -qp --nosignature --queryformat '%{VENDOR}' "$rpm_file")
  actual_packager=$(rpm -qp --nosignature --queryformat '%{PACKAGER}' "$rpm_file")
  if [ "$actual_vendor" != "$VENDOR" ] || [ "$actual_packager" != "$PACKAGER" ]; then
    echo "Fehler: Vendor/Packager wurden nicht gesetzt (Vendor='$actual_vendor', Packager='$actual_packager')." >&2
    exit 1
  fi

  rpm -qip --nosignature "$rpm_file"
  echo "== OK: $(basename "$rpm_file")"
done
