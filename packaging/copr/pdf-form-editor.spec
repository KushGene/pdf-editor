# Rust release builds carry no debug info, so the debuginfo extraction would
# fail on an empty debugsource package.
%global debug_package %{nil}

%global appid com.kushgene.pdf-form-editor
%global desktop_id PDF-Form-Editor.desktop

Name:           pdf-form-editor
Version:        0.2.0
Release:        1%{?dist}
Summary:        Desktop editor for PDF form fields

License:        MIT
URL:            https://github.com/KushGene/pdf-editor
Source0:        %{url}/archive/refs/tags/v%{version}.tar.gz#/%{name}-%{version}.tar.gz

ExclusiveArch:  x86_64 aarch64

BuildRequires:  cargo
BuildRequires:  rust
BuildRequires:  nodejs
BuildRequires:  npm
BuildRequires:  gcc
BuildRequires:  pkgconfig(gtk+-3.0)
BuildRequires:  pkgconfig(webkit2gtk-4.1)
BuildRequires:  pkgconfig(javascriptcoregtk-4.1)
BuildRequires:  pkgconfig(libsoup-3.0)
BuildRequires:  pkgconfig(dbus-1)
BuildRequires:  desktop-file-utils
BuildRequires:  appstream

%description
PDF Form Editor lets you open PDF files, fill in and edit AcroForm fields,
add signatures and images, and export the result — all in a lightweight
desktop app built with Tauri.

The runtime dependencies (GTK 3 and WebKitGTK) are picked up automatically
from the linked shared libraries.

%prep
%autosetup -n pdf-editor-%{version}

%build
# Both npm and cargo download their dependencies, so the COPR project needs
# "Enable internet access during the build" (copr-cli ... --enable-net on).
npm ci
npm run build

# tauri-build embeds ../dist at compile time, so the frontend must exist first.
cargo build --release --locked --manifest-path src-tauri/Cargo.toml

# The desktop entry is a Handlebars template that the Tauri bundler fills in;
# do the same substitution here so both packaging paths stay in sync.
sed \
    -e 's|{{exec}}|%{name}|g' \
    -e 's|{{icon}}|%{name}|g' \
    -e 's|{{comment}}|%{summary}|g' \
    -e 's|{{categories}}|Office;|g' \
    src-tauri/linux/desktop-template.desktop > %{desktop_id}

%install
install -Dpm0755 src-tauri/target/release/%{name} %{buildroot}%{_bindir}/%{name}

desktop-file-install --dir=%{buildroot}%{_datadir}/applications %{desktop_id}

install -Dpm0644 src-tauri/linux/%{appid}.metainfo.xml \
    %{buildroot}%{_metainfodir}/%{appid}.metainfo.xml

install -Dpm0644 src-tauri/icons/32x32.png \
    %{buildroot}%{_datadir}/icons/hicolor/32x32/apps/%{name}.png
install -Dpm0644 src-tauri/icons/128x128.png \
    %{buildroot}%{_datadir}/icons/hicolor/128x128/apps/%{name}.png
install -Dpm0644 src-tauri/icons/128x128@2x.png \
    %{buildroot}%{_datadir}/icons/hicolor/256x256/apps/%{name}.png
install -Dpm0644 src-tauri/icons/icon.png \
    %{buildroot}%{_datadir}/icons/hicolor/512x512/apps/%{name}.png

%check
desktop-file-validate %{buildroot}%{_datadir}/applications/%{desktop_id}
appstreamcli validate --no-net %{buildroot}%{_metainfodir}/%{appid}.metainfo.xml

%files
%license LICENSE
%doc README.md
%{_bindir}/%{name}
%{_datadir}/applications/%{desktop_id}
%{_metainfodir}/%{appid}.metainfo.xml
%{_datadir}/icons/hicolor/*/apps/%{name}.png

%changelog
* Sun Jul 26 2026 KushGene <kushgene@posteo.de> - 0.2.0-1
- Initial COPR package
