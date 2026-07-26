# COPR-Paket

`pdf-form-editor.spec` baut den PDF Form Editor aus dem GitHub-Release-Tarball.

## Warum ein Repository?

Discover und GNOME Software zeigen Anwendungsname und Entwickler aus den
AppStream-Daten (`/usr/share/metainfo/com.kushgene.pdf-form-editor.metainfo.xml`).
Diese Daten werden nur ausgewertet, wenn das Paket aus einer Quelle mit
AppStream-Index stammt. Bei einer direkt heruntergeladenen `.rpm`-Datei zeigt
Discover stattdessen den Dateinamen und "Unbekannter Autor" – das ist eine
Eigenschaft von Discovers `LocalFilePKResource`, keine fehlende Metainformation
im Paket.

## Wichtig: Netzwerkzugriff

Der Build lädt Abhängigkeiten über `npm ci` und `cargo`. COPR-Builder sind
standardmäßig netzwerkisoliert, daher muss der Netzwerkzugriff aktiviert sein –
sonst schlägt `%build` fehl.

## Projekt anlegen

```bash
copr-cli create pdf-form-editor \
  --chroot fedora-42-x86_64 \
  --chroot fedora-43-x86_64 \
  --enable-net on \
  --description "Desktop editor for PDF form fields (AcroForm)"
```

## Build auslösen

Aus dem Repository-Wurzelverzeichnis, nachdem der Tag `vX.Y.Z` gepusht und das
GitHub-Release veröffentlicht wurde (der Spec lädt `Source0` von dort):

```bash
copr-cli build pdf-form-editor packaging/copr/pdf-form-editor.spec
```

Alternativ als SCM-Quelle, damit COPR bei jedem Tag selbst baut:

```bash
copr-cli add-package-scm pdf-form-editor \
  --name pdf-form-editor \
  --clone-url https://github.com/KushGene/pdf-editor.git \
  --commit main \
  --subdir packaging/copr \
  --spec pdf-form-editor.spec \
  --type git \
  --method make_srpm
```

## Installation durch Nutzer

```bash
sudo dnf copr enable kushgene/pdf-form-editor
sudo dnf install pdf-form-editor
```

## Lokaler Testbau

```bash
git archive --format=tar.gz --prefix="pdf-editor-0.2.0/" -o ~/rpmbuild/SOURCES/pdf-form-editor-0.2.0.tar.gz HEAD
rpmbuild -bb packaging/copr/pdf-form-editor.spec
```

## Versionspflege

`scripts/release.sh` hebt `Version:` im Spec zusammen mit `package.json`,
`tauri.conf.json` und `Cargo.toml` an. Der `%changelog`-Eintrag muss von Hand
ergänzt werden.
