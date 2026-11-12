/**
 * Pulsares Explorer — Lógica interativa das páginas
 * - Detecção de SO e botão de download principal
 * - Versão mais recente via API do GitHub Releases
 * - Alternância das abas da demonstração
 */

document.addEventListener('DOMContentLoaded', () => {
  const REPO = 'vitorkrewer/pulsares-file-explorer';
  const BASE_RELEASE_URL = `https://github.com/${REPO}/releases/latest/download`;
  const i18n = () => window.PulsaresI18n;
  const tr = (key, vars) => (i18n() ? i18n().t(key, vars) : key);

  const ICONS = {
    windows: `<svg class="svg-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.551H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.951-1.801"/></svg>`,
    linux: `<svg class="svg-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12.002 0c-2.4 0-4.35 1.95-4.35 4.35 0 .45.075.9.225 1.35C4.502 7.05 2.252 10.35 2.252 14.4c0 3.3 1.5 5.85 3.9 7.05-.3-.9-.45-1.95-.45-3 0-1.65.6-3.15 1.65-4.2-.15-.45-.3-.9-.3-1.35 0-1.65 1.35-3 3-3s3 1.35 3 3c0 .45-.15.9-.3 1.35 1.05 1.05 1.65 2.55 1.65 4.2 0 1.05-.15 2.1-.45 3 2.4-1.2 3.9-3.75 3.9-7.05 0-4.05-2.25-7.35-5.625-8.7.15-.45.225-.9.225-1.35 0-2.4-1.95-4.35-4.25-4.35z"/></svg>`,
    mac: `<svg class="svg-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.4c.67-.82 1.12-1.96.99-3.1-.97.04-2.15.65-2.85 1.46-.61.71-1.15 1.87-1.01 2.98 1.09.08 2.2-.52 2.87-1.34z"/></svg>`,
    check: `<svg class="svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    copy: `<svg class="svg-icon copy-icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  };

  // file: formato preferido; fallback: usado enquanto a release mais recente ainda não contém o formato preferido
  const DOWNLOADS = {
    windows: { name: 'Windows (x64)', icon: ICONS.windows, file: 'Pulsares-Explorer-Windows-x64-Setup.exe', fallback: 'Pulsares-Explorer-Windows-x64.exe', sub: 'Setup .exe • x64', fallbackSub: '.exe • x64', cardId: 'cardWindows' },
    linux: { name: 'Linux (AppImage)', icon: ICONS.linux, file: 'Pulsares-Explorer-Linux-x64.AppImage', fallback: 'Pulsares-Explorer-Linux-x64.AppImage', sub: '.AppImage • x64', fallbackSub: '.AppImage • x64', cardId: 'cardLinux' },
    mac: { name: 'macOS Universal', icon: ICONS.mac, file: 'Pulsares-Explorer-macOS-universal.dmg', fallback: 'Pulsares-Explorer-macOS-universal.zip', sub: '.dmg • Apple Silicon & Intel', fallbackSub: '.zip • Apple Silicon & Intel', cardId: 'cardMac' },
  };

  function detectOS() {
    const ua = navigator.userAgent || '';
    const platform = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
    if (/win/i.test(platform) || /windows/i.test(ua)) return 'windows';
    if (/mac/i.test(platform) || /macintosh|mac os x/i.test(ua)) return 'mac';
    if (/linux/i.test(platform) || /linux|x11/i.test(ua)) return 'linux';
    return 'windows';
  }

  const primaryData = DOWNLOADS[detectOS()];
  let latestTag = 'v1.2.0';
  let primarySubText = primaryData.sub;

  const primaryBtn = document.getElementById('primaryDownloadBtn');
  const primaryLabel = document.getElementById('primaryDownloadLabel');
  const primarySub = document.getElementById('primaryDownloadSub');
  const primaryIcon = document.getElementById('primaryOsIcon');
  const versionEl = document.getElementById('latestVersion');
  const detectedCard = document.getElementById(primaryData.cardId);
  const assetLinks = document.querySelectorAll('[data-asset]');

  function renderDynamicTexts() {
    if (primaryLabel) primaryLabel.textContent = tr('dl.for', { os: primaryData.name });
    if (primarySub) primarySub.textContent = `${primarySubText} • ${latestTag}`;
    if (versionEl) versionEl.textContent = latestTag;
    if (detectedCard) detectedCard.setAttribute('data-label', tr('dl.detected'));
    document.querySelectorAll('.download-file-btn.is-pending').forEach((el) => {
      el.setAttribute('data-pending-label', tr('dl.pending'));
    });
  }

  // Links de download: cada elemento com data-asset aponta para o arquivo na release mais recente
  assetLinks.forEach((el) => {
    el.href = `${BASE_RELEASE_URL}/${el.dataset.asset}`;
  });

  if (primaryBtn) {
    primaryBtn.href = `${BASE_RELEASE_URL}/${primaryData.file}`;
    if (primaryIcon) primaryIcon.innerHTML = primaryData.icon;
  }
  if (detectedCard) detectedCard.classList.add('card-highlight');

  renderDynamicTexts();
  document.addEventListener('pulsares:lang', renderDynamicTexts);

  function applyReleaseAssets(release) {
    const names = new Set((release.assets || []).map((a) => a.name));
    if (names.size === 0) return;

    // Botão principal: usa o instalador quando publicado; senão, o formato anterior
    if (primaryBtn && !names.has(primaryData.file) && names.has(primaryData.fallback)) {
      primaryBtn.href = `${BASE_RELEASE_URL}/${primaryData.fallback}`;
      primarySubText = primaryData.fallbackSub;
    }

    // Arquivos ainda não presentes na release mais recente são sinalizados como "em breve"
    assetLinks.forEach((el) => {
      if (names.has(el.dataset.asset)) return;
      el.classList.add('is-pending');
      el.href = release.html_url || `https://github.com/${REPO}/releases`;
    });
  }

  if (primaryBtn || versionEl || assetLinks.length) {
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github.v3+json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((release) => {
        if (release && release.tag_name) {
          latestTag = release.tag_name;
          applyReleaseAssets(release);
          renderDynamicTexts();
        }
      })
      .catch(() => {
        /* mantém a versão e os links estáticos */
      });
  }

  // Abas da demonstração interativa
  const mockTabs = document.querySelectorAll('.mock-tab');
  const mockViews = document.querySelectorAll('.mock-view-content');
  const mockCurrentPath = document.getElementById('mockCurrentPath');
  const mockAppWindowName = document.getElementById('mockAppWindowName');
  const mockWindowBadge = document.getElementById('mockWindowBadge');

  const META_BY_TAB = {
    explorer: { appName: 'Pulsares Explorer', path: '~/projects/backend-service', badge: 'ACTIVITY BAR + FLYOUT' },
    editor: { appName: 'Pulsares Studio Editor', path: '~/projects/web-dashboard/index.html', badge: 'LIVE WEB PREVIEW' },
    dbstudio: { appName: 'Pulsares DB Studio', path: '~/projects/backend-service/analytics.sqlite3', badge: 'ER MAP + SQL CONSOLE' },
    dbcreator: { appName: 'Pulsares DB Studio', path: '~/datasets/clientes-2026.csv → clientes.db', badge: 'BULK WAL IMPORT' },
    sftp: { appName: 'Pulsares Explorer', path: 'sftp://192.168.1.150/var/www/production', badge: 'TOFU SHA-256' },
    terminal: { appName: 'Pulsares Explorer', path: 'C:\\Users\\Vitor\\projects\\backend-service\\internal\\database', badge: 'FOLLOW-UP' },
  };

  mockTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const key = tab.dataset.tab;
      mockTabs.forEach((x) => x.classList.remove('active'));
      mockViews.forEach((v) => v.classList.remove('active'));
      tab.classList.add('active');
      const view = document.getElementById(`view-${key}`);
      if (view) view.classList.add('active');
      const meta = META_BY_TAB[key];
      if (meta) {
        if (mockAppWindowName) mockAppWindowName.textContent = meta.appName;
        if (mockCurrentPath) mockCurrentPath.textContent = meta.path;
        if (mockWindowBadge) mockWindowBadge.textContent = meta.badge;
      }
    });
  });

  const mockCopyBtn = document.getElementById('mockCopyBtn');
  if (mockCopyBtn) {
    mockCopyBtn.addEventListener('click', () => {
      mockCopyBtn.innerHTML = ICONS.check;
      if (navigator.clipboard) void navigator.clipboard.writeText('/home/vitor/projects/backend-service');
      setTimeout(() => {
        mockCopyBtn.innerHTML = ICONS.copy;
      }, 1600);
    });
  }
});
