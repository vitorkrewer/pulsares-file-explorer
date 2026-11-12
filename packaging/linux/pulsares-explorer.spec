# Spec RPM (Fedora / RHEL / openSUSE) — empacota o binário pré-compilado pelo Wails.
# Uso: rpmbuild -bb pulsares-explorer.spec --define "pkg_version 1.2.0" --define "payload_dir /caminho/linux-payload"

%global debug_package %{nil}
%global _build_id_links none
%global __strip /bin/true

Name:           pulsares-explorer
Version:        %{pkg_version}
Release:        1
Summary:        Fast file explorer with tabs, terminal, Studio Editor and DB Studio
License:        MIT
URL:            https://github.com/vitorkrewer/pulsares-file-explorer
BuildArch:      x86_64
AutoReqProv:    no
Requires:       (gtk3 or libgtk-3-0)
Requires:       (webkit2gtk4.1 or libwebkit2gtk-4_1-0)

%description
Pulsares Explorer is a fast, lightweight and cross-platform desktop file explorer
with tabs, dual pane, integrated terminal, Pulsares Studio Editor and Pulsares DB Studio.

%install
mkdir -p %{buildroot}
cp -a %{payload_dir}/. %{buildroot}/

%files
%license /usr/share/licenses/pulsares-explorer/LICENSE
/usr/bin/pulsares-explorer
/usr/share/applications/io.github.vitorkrewer.PulsaresExplorer.desktop
/usr/share/metainfo/io.github.vitorkrewer.PulsaresExplorer.metainfo.xml
/usr/share/icons/hicolor/512x512/apps/io.github.vitorkrewer.PulsaresExplorer.png
/usr/share/icons/hicolor/512x512/apps/io.github.vitorkrewer.PulsaresExplorer.Studio.png
/usr/share/icons/hicolor/512x512/apps/io.github.vitorkrewer.PulsaresExplorer.DBStudio.png
/usr/share/pixmaps/pulsares-explorer.png

