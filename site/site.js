/**
 * Pulsares Explorer — Layout compartilhado (cabeçalho, rodapé, menu hambúrguer) e i18n.
 * O texto-base das páginas está em pt-BR; os demais idiomas ficam em i18n/<codigo>.js
 * e são carregados sob demanda. Idioma padrão para locales não suportados: inglês.
 */
(function () {
  const REPO_URL = 'https://github.com/vitorkrewer/pulsares-file-explorer';
  const STORAGE_KEY = 'pulsares-site-lang';
  const BASE_LANG = 'pt-BR';
  const FALLBACK_LANG = 'en';

  const LANGS = [
    { code: 'pt-BR', label: 'Português (Brasil)' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'de', label: 'Deutsch' },
    { code: 'fr', label: 'Français' },
    { code: 'it', label: 'Italiano' },
    { code: 'ja', label: '日本語' },
    { code: 'zh-CN', label: '简体中文' },
    { code: 'tr', label: 'Türkçe' },
    { code: 'sv', label: 'Svenska' },
  ];

  // Textos usados apenas via JavaScript (versão em pt-BR).
  const PT_EXTRA = {
    'dl.for': 'Baixar para {os}',
    'dl.detected': 'Seu sistema detectado',
  };

  window.PULSARES_I18N = window.PULSARES_I18N || {};
  let currentLang = BASE_LANG;

  function isSupported(code) {
    return LANGS.some((l) => l.code === code);
  }

  function detectLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && isSupported(saved)) return saved;
    } catch {
      /* armazenamento indisponível */
    }
    const candidates = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (const raw of candidates) {
      const lc = String(raw).toLowerCase();
      const exact = LANGS.find((l) => l.code.toLowerCase() === lc);
      if (exact) return exact.code;
      const prefix = lc.split('-')[0];
      if (prefix === 'pt') return 'pt-BR';
      if (prefix === 'zh') return 'zh-CN';
      const byPrefix = LANGS.find((l) => l.code.toLowerCase() === prefix);
      if (byPrefix) return byPrefix.code;
    }
    return FALLBACK_LANG;
  }

  function buildLayout() {
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const link = (href, key, text) => {
      const active = path === href ? ' nav-link-active' : '';
      return `<a href="${href}" class="nav-link${active}" data-i18n="${key}">${text}</a>`;
    };
    const options = LANGS.map((l) => `<option value="${l.code}">${l.label}</option>`).join('');

    const headerHost = document.getElementById('site-header');
    if (headerHost) {
      headerHost.innerHTML = `
      <header class="header" id="siteHeader">
        <div class="container header-container">
          <a href="index.html" class="brand">
            <img src="appicon.png" alt="Pulsares Explorer" class="brand-logo" width="34" height="34" />
            <span class="brand-text">Pulsares <span class="accent-text">Explorer</span></span>
          </a>
          <button type="button" class="nav-toggle" id="navToggle" aria-expanded="false" aria-controls="navPanel" data-i18n-aria="nav.menu" aria-label="Abrir menu">
            <span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span>
          </button>
          <div class="nav-panel" id="navPanel">
            <nav class="nav-menu" aria-label="Principal">
              ${link('recursos.html', 'nav.features', 'Recursos')}
              ${link('screenshots.html', 'nav.screenshots', 'Capturas')}
              ${link('seguranca.html', 'nav.security', 'Segurança')}
              ${link('atalhos.html', 'nav.shortcuts', 'Atalhos')}
            </nav>
            <div class="header-actions">
              <select class="lang-select" id="langSelect" aria-label="Idioma / Language">${options}</select>
              <a href="downloads.html" class="btn btn-primary btn-sm" data-i18n="nav.download">Baixar Agora</a>
            </div>
          </div>
        </div>
      </header>`;
    }

    const footerHost = document.getElementById('site-footer');
    if (footerHost) {
      footerHost.innerHTML = `
      <footer class="footer">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-col footer-col-brand">
              <a href="index.html" class="footer-brand">
                <img src="appicon.png" alt="Pulsares Explorer" width="30" height="30" />
                <span>Pulsares Explorer</span>
              </a>
              <p class="footer-tagline" data-i18n="footer.tagline">Explorador de arquivos multiplataforma com ferramentas para desenvolvedores.</p>
            </div>
            <div class="footer-col">
              <h4 class="footer-heading" data-i18n="footer.product">Produto</h4>
              <a href="recursos.html" data-i18n="nav.features">Recursos</a>
              <a href="recursos.html#suite" data-i18n="footer.suite">Suíte para desenvolvedores</a>
              <a href="screenshots.html" data-i18n="nav.screenshots">Capturas</a>
              <a href="downloads.html" data-i18n="footer.downloads">Downloads</a>
            </div>
            <div class="footer-col">
              <h4 class="footer-heading" data-i18n="footer.explore">Explorar</h4>
              <a href="seguranca.html" data-i18n="nav.security">Segurança</a>
              <a href="atalhos.html" data-i18n="nav.shortcuts">Atalhos</a>
              <a href="novidades.html" data-i18n="footer.news">Novidades</a>
              <a href="${REPO_URL}/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer" data-i18n="footer.changelog">Changelog completo</a>
            </div>
            <div class="footer-col">
              <h4 class="footer-heading" data-i18n="footer.project">Projeto</h4>
              <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer" data-i18n="footer.repo">Repositório no GitHub</a>
              <a href="${REPO_URL}/releases" target="_blank" rel="noopener noreferrer" data-i18n="footer.releases">Releases</a>
              <a href="${REPO_URL}/releases/latest/download/SHA256SUMS.txt" target="_blank" rel="noopener noreferrer" data-i18n="footer.checksums">SHA256SUMS</a>
              <a href="${REPO_URL}/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" data-i18n="footer.license">Licença MIT</a>
            </div>
          </div>
          <div class="footer-bottom" data-i18n="footer.copy">Desenvolvido por Vitor Krewer. Código aberto sob licença MIT.</div>
        </div>
      </footer>`;
    }
  }

  const SHOTS = [
    { file: 'shot-1-explorer-light.png', key: 'g1', pt: 'Explorador de arquivos com árvore de pastas (tema claro)' },
    { file: 'shot-2-explorer-dark.png', key: 'g2', pt: 'O mesmo explorador no tema escuro' },
    { file: 'shot-5-ermap.jpg', key: 'g5', pt: 'Mapa ER interativo com MiniMap e exportação SVG' },
    { file: 'shot-8-studio-preview.jpg', key: 'g8', pt: 'Prévia web em tempo real ao lado do código' },
    { file: 'shot-3-context-db.png', key: 'g3', pt: 'Menu de contexto com ações para banco de dados SQLite' },
    { file: 'shot-4-dbstudio.jpg', key: 'g4', pt: 'Pulsares DB Studio: navegue por tabelas e dados' },
    { file: 'shot-6-context-folder.jpg', key: 'g6', pt: 'Menu de contexto da pasta: abrir no Studio Editor e terminal' },
    { file: 'shot-7-studio.jpg', key: 'g7', pt: 'Pulsares Studio Editor com árvore de projeto' },
  ];

  function buildGallery() {
    const host = document.getElementById('gallery');
    if (!host) return;
    const limit = parseInt(host.dataset.limit || String(SHOTS.length), 10);
    const items = SHOTS.slice(0, limit);
    host.innerHTML = items
      .map(
        (s, i) => `
      <figure class="gallery-item">
        <button type="button" class="gallery-thumb" data-index="${i}" aria-label="${s.pt}">
          <img src="img/${s.file}" alt="${s.pt}" loading="lazy" />
        </button>
        <figcaption data-i18n="${s.key}">${s.pt}</figcaption>
      </figure>`
      )
      .join('');

    const box = document.createElement('div');
    box.className = 'lightbox';
    box.hidden = true;
    box.innerHTML = '<button type="button" class="lightbox-close" data-i18n-aria="gal.close" aria-label="Fechar">×</button><img alt="" /><p class="lightbox-caption"></p>';
    document.body.appendChild(box);
    const img = box.querySelector('img');
    const cap = box.querySelector('.lightbox-caption');
    const close = () => {
      box.hidden = true;
    };
    host.querySelectorAll('.gallery-thumb').forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = items[Number(btn.dataset.index)];
        img.src = `img/${s.file}`;
        const figcaption = btn.parentElement.querySelector('figcaption');
        img.alt = cap.textContent = figcaption ? figcaption.textContent : s.pt;
        box.hidden = false;
      });
    });
    box.addEventListener('click', (e) => {
      if (e.target !== img) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  function dictFor(code) {
    return code === BASE_LANG ? null : window.PULSARES_I18N[code] || null;
  }

  function t(key, vars) {
    const dict = dictFor(currentLang);
    let text = (dict && dict[key]) || PT_EXTRA[key] || key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        text = text.replace(`{${k}}`, vars[k]);
      });
    }
    return text;
  }

  function apply(code) {
    currentLang = code;
    const dict = dictFor(code);

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      if (el.dataset.pt === undefined) el.dataset.pt = el.innerHTML;
      const value = dict ? dict[el.dataset.i18n] : undefined;
      el.innerHTML = value !== undefined ? value : el.dataset.pt;
    });

    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      if (el.dataset.ptAria === undefined) el.dataset.ptAria = el.getAttribute('aria-label') || '';
      const value = dict ? dict[el.dataset.i18nAria] : undefined;
      el.setAttribute('aria-label', value !== undefined ? value : el.dataset.ptAria);
    });

    document.documentElement.lang = code;
    const select = document.getElementById('langSelect');
    if (select) select.value = code;

    const titleSource = document.querySelector('[data-title-source]');
    if (titleSource) {
      document.title = `${titleSource.textContent.replace(/<[^>]+>/g, '').trim()} — Pulsares Explorer`;
    }

    document.dispatchEvent(new CustomEvent('pulsares:lang', { detail: { lang: code } }));
  }

  function setLang(code, persist) {
    if (!isSupported(code)) code = FALLBACK_LANG;
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, code);
      } catch {
        /* ignora */
      }
    }
    if (code === BASE_LANG || window.PULSARES_I18N[code]) {
      apply(code);
      return;
    }
    const script = document.createElement('script');
    script.src = `i18n/${code}.js`;
    script.onload = () => apply(code);
    script.onerror = () => apply(BASE_LANG);
    document.head.appendChild(script);
  }

  function setupMenu() {
    const header = document.getElementById('siteHeader');
    const toggle = document.getElementById('navToggle');
    if (!header || !toggle) return;

    const close = () => {
      header.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', () => {
      const open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    header.querySelectorAll('.nav-panel a').forEach((a) => a.addEventListener('click', close));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 960) close();
    });
  }

  window.PulsaresI18n = { t, getLang: () => currentLang, LANGS };

  document.addEventListener('DOMContentLoaded', () => {
    buildLayout();
    buildGallery();
    setupMenu();
    const select = document.getElementById('langSelect');
    if (select) select.addEventListener('change', () => setLang(select.value, true));
    setLang(detectLang(), false);
  });
})();

