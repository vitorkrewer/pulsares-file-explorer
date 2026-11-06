/**
 * Pulsares Explorer — GitHub Pages Interactive Logic
 * - OS Auto-detection & Dynamic Primary Download Button
 * - GitHub Releases API Integration
 * - Interactive Mockup Switcher
 * - Live UX Copy Demonstration
 */

document.addEventListener('DOMContentLoaded', () => {
  const REPO = 'vitorkrewer/pulsares-file-explorer';
  const REPO_URL = `https://github.com/${REPO}`;
  const BASE_RELEASE_URL = `${REPO_URL}/releases/latest/download`;

  const DOWNLOADS = {
    windows: {
      name: 'Windows (x64)',
      icon: '🪟',
      filename: 'Pulsares-Explorer-Windows-x64.exe',
      url: `${BASE_RELEASE_URL}/Pulsares-Explorer-Windows-x64.exe`,
      sub: 'Executável Portátil .exe • x64',
      cardId: 'cardWindows',
    },
    linux: {
      name: 'Linux (AppImage)',
      icon: '🐧',
      filename: 'Pulsares-Explorer-Linux-x64.AppImage',
      url: `${BASE_RELEASE_URL}/Pulsares-Explorer-Linux-x64.AppImage`,
      sub: 'Universal .AppImage • x64',
      cardId: 'cardLinux',
    },
    mac: {
      name: 'macOS Universal',
      icon: '🍎',
      filename: 'Pulsares-Explorer-macOS-universal.zip',
      url: `${BASE_RELEASE_URL}/Pulsares-Explorer-macOS-universal.zip`,
      sub: 'Binário Universal (Apple Silicon & Intel)',
      cardId: 'cardMac',
    },
  };

  // 1. Detect User's Operating System
  function detectOS() {
    const ua = navigator.userAgent || '';
    const platform = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();

    if (/win/i.test(platform) || /windows/i.test(ua)) {
      return 'windows';
    }
    if (/mac/i.test(platform) || /macintosh|mac os x/i.test(ua)) {
      return 'mac';
    }
    if (/linux/i.test(platform) || /linux|x11/i.test(ua)) {
      return 'linux';
    }
    return 'windows'; // fallback padrão
  }

  const detectedOS = detectOS();
  const primaryData = DOWNLOADS[detectedOS];

  // 2. Configure Primary CTA Download Button
  const primaryBtn = document.getElementById('primaryDownloadBtn');
  const primaryLabel = document.getElementById('primaryDownloadLabel');
  const primarySub = document.getElementById('primaryDownloadSub');
  const primaryIcon = document.getElementById('primaryOsIcon');

  if (primaryBtn && primaryData) {
    primaryBtn.href = primaryData.url;
    primaryLabel.textContent = `Baixar para ${primaryData.name}`;
    primarySub.textContent = primaryData.sub;
    primaryIcon.textContent = primaryData.icon;

    // Destaca o card do sistema detectado na grade de downloads
    const targetCard = document.getElementById(primaryData.cardId);
    if (targetCard) {
      targetCard.classList.add('card-highlight');
    }
  }

  // 3. Fetch Latest Release Data from GitHub API
  async function fetchLatestRelease() {
    try {
      const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });

      if (!response.ok) return;
      const release = await response.json();
      const tagName = release.tag_name || 'v1.1.0';

      const releaseBadge = document.getElementById('latestReleaseBadge');
      if (releaseBadge) {
        releaseBadge.textContent = `Versão ${tagName} Disponível • SSH/SFTP & DB Studio`;
      }

      if (primarySub) {
        primarySub.textContent = `${primaryData.sub} • ${tagName}`;
      }
    } catch {
      // Ignora erro e mantém os links diretos para /releases/latest/download
    }
  }

  void fetchLatestRelease();

  // 4. Interactive Window Mockup Tab Switching
  const mockTabs = document.querySelectorAll('.mock-tab');
  const mockViews = document.querySelectorAll('.mock-view-content');
  const mockCurrentPath = document.getElementById('mockCurrentPath');

  const PATH_BY_TAB = {
    explorer: '~/projects/backend-service',
    sftp: 'sftp://192.168.1.150/var/www/production',
    editor: '~/projects/backend-service/main.go',
    dbstudio: '~/projects/backend-service/analytics.sqlite3',
    terminal: 'PS C:\\Users\\Vitor\\projects\\backend-service',
  };

  mockTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetViewId = `view-${tab.dataset.tab}`;

      mockTabs.forEach((t) => t.classList.remove('active'));
      mockViews.forEach((v) => v.classList.remove('active'));

      tab.classList.add('active');
      const targetView = document.getElementById(targetViewId);
      if (targetView) {
        targetView.classList.add('active');
      }

      if (mockCurrentPath && PATH_BY_TAB[tab.dataset.tab]) {
        mockCurrentPath.textContent = PATH_BY_TAB[tab.dataset.tab];
      }
    });
  });

  // 5. Interactive Copy Path Button Feedback Simulation
  const mockCopyBtn = document.getElementById('mockCopyBtn');
  if (mockCopyBtn) {
    mockCopyBtn.addEventListener('click', () => {
      const originalText = mockCopyBtn.textContent;
      mockCopyBtn.textContent = '✓';
      mockCopyBtn.style.color = '#10b981';

      if (navigator.clipboard) {
        void navigator.clipboard.writeText('/home/vitor/projects/backend-service');
      }

      setTimeout(() => {
        mockCopyBtn.textContent = originalText;
        mockCopyBtn.style.color = '';
      }, 1600);
    });
  }
});
