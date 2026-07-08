(function () {
  const pageDefaults = {
    overview: {
      title: 'Overview',
      subtitle: 'Your scan result, next routine step, product matches, and progress at a glance.',
      chip: 'Scan summary',
      primaryLabel: 'Open routine',
      primaryHref: 'routine.html'
    },
    routine: {
      title: 'Routine',
      subtitle: 'Follow the next AM or PM step without guessing what comes next.',
      chip: 'Next step ready',
      primaryLabel: 'Complete next step',
      primaryHref: '#morning-card'
    },
    recommendations: {
      title: 'Recommendations',
      subtitle: 'Review product matches that fit the current scan and routine.',
      chip: 'Match engine',
      primaryLabel: 'Add to routine',
      primaryHref: 'routine.html'
    },
    progress: {
      title: 'Progress',
      subtitle: 'Compare scan checkpoints and see what is changing over time.',
      chip: 'Photo comparison',
      primaryLabel: 'Compare photos',
      primaryHref: '#comparison-card'
    },
    profile: {
      title: 'Profile',
      subtitle: 'Keep skin type, goals, and personal details aligned with the latest scan.',
      chip: 'Skin identity',
      primaryLabel: 'Update skin profile',
      primaryHref: '#skin-card'
    },
    settings: {
      title: 'Settings',
      subtitle: 'Save reminder, privacy, and display preferences for the dashboard.',
      chip: 'Preference center',
      primaryLabel: 'Save changes',
      primaryHref: '#session-card'
    }
  };

  let isNavigating = false;

  function getPageConfig(pageOverride, dataOverride) {
    const data = dataOverride || document.body.dataset;
    const page = pageOverride || data.dashboardPage || 'overview';
    return { page, ...(pageDefaults[page] || pageDefaults.overview), ...data };
  }

  async function loadPartial(path) {
    const cacheKey = `glowth_partial_${path}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const cachedHost = document.createElement('div');
      cachedHost.innerHTML = cached;
      return cachedHost;
    }

    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Could not load ${path}`);
    }
    const host = document.createElement('div');
    const html = await response.text();
    sessionStorage.setItem(cacheKey, html);
    host.innerHTML = html;
    return host;
  }

  function applyTopbarConfig(root, config) {
    const title = root.querySelector('[data-dashboard-title]');
    const subtitle = root.querySelector('[data-dashboard-subtitle]');
    const chip = root.querySelector('[data-dashboard-chip]');
    const primary = root.querySelector('[data-dashboard-primary]');

    if (title) title.textContent = config.dashboardTitle || config.title;
    if (subtitle) subtitle.textContent = config.dashboardSubtitle || config.subtitle;
    if (chip) chip.textContent = config.dashboardChip || config.chip;
    if (primary) {
      primary.textContent = config.dashboardPrimaryLabel || config.primaryLabel;
      primary.href = config.dashboardPrimaryHref || config.primaryHref;
    }
  }

  function setActiveNav(root, page) {
    const nav = root.querySelector('.sidebar-nav');
    const links = [...root.querySelectorAll('.sidebar-nav-link')];
    const mobileNavOrder = ['overview', 'routine', 'recommendations', 'progress', 'profile'];
    const isMobileNav = window.matchMedia('(max-width: 920px)').matches;

    links.forEach((link, index) => {
      const isActive = link.dataset.nav === page;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
        const mobileIndex = mobileNavOrder.indexOf(page);
        nav?.style.setProperty('--active-index', isMobileNav ? Math.max(mobileIndex >= 0 ? mobileIndex : index, 0) : index);
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function hydrateHeaderStreak() {
    const savedStreak = localStorage.getItem('glowth_streak_days') || '';
    const streakText = savedStreak || document.getElementById('overview-metric-glow-streak')?.textContent || '7 days';
    const number = parseInt(streakText, 10) || 7;

    document.getElementById('header-streak-count')?.replaceChildren(document.createTextNode(String(number)));
    document.getElementById('header-streak-days')?.replaceChildren(document.createTextNode(`${number} days`));
    document.getElementById('header-streak-next')?.replaceChildren(document.createTextNode(`${Math.max(number + 3, 10)} days`));
  }

  function updateUserBits() {
    const name = localStorage.getItem('glowth_user_name') || 'Glowth User';
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'GU';

    document.querySelectorAll('[data-user-name]').forEach((node) => {
      node.textContent = name;
    });

    document.querySelectorAll('[data-user-avatar]').forEach((node) => {
      const savedPhoto = localStorage.getItem('glowth_user_photo');
      if (savedPhoto) {
        node.classList.add('has-photo');
        node.style.backgroundImage = `url("${savedPhoto}")`;
      } else {
        node.classList.remove('has-photo');
        node.style.backgroundImage = '';
        node.textContent = initials;
      }
    });
  }

  function wireInteractions() {
    document.querySelector('[data-dashboard-overlay]')?.addEventListener('click', () => {
      document.body.classList.remove('nav-open');
      document.querySelector('.dashboard-mobile-trigger')?.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('click', (event) => {
      const menu = document.getElementById('userMenu');
      if (menu && !menu.contains(event.target)) {
        menu.classList.remove('open');
        menu.querySelector('.user-menu-trigger')?.setAttribute('aria-expanded', 'false');
      }

      const streakWidget = document.getElementById('streakWidget');
      if (streakWidget && !streakWidget.contains(event.target)) {
        closeStreakPopover();
      }
    });

    document.querySelector('[data-streak-trigger]')?.addEventListener('click', (event) => {
      event.preventDefault();
      const trigger = event.currentTarget;
      const popover = document.querySelector('[data-streak-popover]');
      const willOpen = popover?.hasAttribute('hidden');
      if (!popover) return;

      popover.toggleAttribute('hidden', !willOpen);
      trigger.setAttribute('aria-expanded', String(willOpen));
    });

    document.querySelectorAll('.sidebar-nav-link').forEach((link, index) => {
      link.addEventListener('click', (event) => {
        const nav = link.closest('.sidebar-nav');
        const mobileNavOrder = ['overview', 'routine', 'recommendations', 'progress', 'profile'];
        const mobileIndex = mobileNavOrder.indexOf(link.dataset.nav);
        const isMobileNav = window.matchMedia('(max-width: 920px)').matches;
        nav?.style.setProperty('--active-index', isMobileNav ? Math.max(mobileIndex >= 0 ? mobileIndex : index, 0) : index);
        document.querySelectorAll('.sidebar-nav-link').forEach((item) => item.classList.remove('is-pressing'));
        link.classList.add('is-pressing');
        document.body.classList.remove('nav-open');

        if (shouldHandleDashboardNavigation(event, link)) {
          event.preventDefault();
          navigateDashboard(link.href, link.dataset.nav);
        }
      });
    });

    document.querySelectorAll('[data-toggle-switch]').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const isOn = !toggle.classList.contains('is-on');
        toggle.classList.toggle('is-on', isOn);
        toggle.setAttribute('aria-pressed', String(isOn));
        toggle.querySelector('[data-toggle-label]').textContent = isOn ? 'On' : 'Off';
      });
    });

    document.querySelectorAll('.step-complete-btn').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        button.classList.toggle('is-complete');
        button.textContent = button.classList.contains('is-complete') ? 'Completed' : 'Complete';
        button.closest('.routine-step-card')?.classList.toggle('completed', button.classList.contains('is-complete'));
      });
    });

    const photoInput = document.querySelector('[data-photo-input]');
    document.querySelector('[data-photo-trigger]')?.addEventListener('click', () => photoInput?.click());
    photoInput?.addEventListener('change', () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        localStorage.setItem('glowth_user_photo', reader.result);
        updateUserBits();
        document.querySelector('[data-photo-reset]')?.removeAttribute('hidden');
      };
      reader.readAsDataURL(file);
    });
    document.querySelector('[data-photo-reset]')?.addEventListener('click', () => {
      localStorage.removeItem('glowth_user_photo');
      updateUserBits();
    });
  }

  function closeStreakPopover() {
    document.querySelector('[data-streak-popover]')?.setAttribute('hidden', '');
    document.querySelector('[data-streak-trigger]')?.setAttribute('aria-expanded', 'false');
  }

  function shouldHandleDashboardNavigation(event, link) {
    if (event.defaultPrevented || event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (link.target && link.target !== '_self') return false;

    const targetUrl = new URL(link.href, window.location.href);
    if (targetUrl.origin !== window.location.origin) return false;
    if (!targetUrl.pathname.includes('/dashboard/')) return false;
    if (targetUrl.pathname === window.location.pathname && targetUrl.hash === window.location.hash) return false;

    return true;
  }

  async function navigateDashboard(href, fallbackPage, pushToHistory = true) {
    if (isNavigating) return;
    isNavigating = true;
    document.body.classList.add('dashboard-is-swapping');

    try {
      const response = await fetch(href, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Could not load ${href}`);

      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const targetMain = parsed.querySelector('.dashboard-main');
      if (!targetMain) throw new Error(`Dashboard content missing in ${href}`);

      const targetPage = parsed.body.dataset.dashboardPage || fallbackPage || 'overview';
      const targetData = { ...parsed.body.dataset, dashboardPage: targetPage };

      const swap = () => {
        swapDashboardMain(targetMain);
        document.body.dataset.dashboardPage = targetPage;
        document.title = parsed.title || document.title;
        if (pushToHistory) {
          history.pushState({ dashboardPage: targetPage }, '', href);
        }

        const config = getPageConfig(targetPage, targetData);
        applyTopbarConfig(document, config);
        setActiveNav(document, targetPage);
        updateUserBits();
        hydrateHeaderStreak();
      };

      if (document.startViewTransition) {
        await document.startViewTransition(swap).finished;
      } else {
        swap();
      }

      window.scrollTo({ top: 0, behavior: 'instant' });
      document.dispatchEvent(new CustomEvent('glowth:page-swapped', {
        detail: { page: targetPage, href }
      }));
    } catch (error) {
      console.warn('[Glowth] SPA navigation failed, using full load:', error);
      window.location.href = href;
    } finally {
      document.body.classList.remove('dashboard-is-swapping');
      isNavigating = false;
    }
  }

  function swapDashboardMain(targetMain) {
    const currentMain = document.querySelector('.dashboard-main');
    if (!currentMain) return;

    const currentTopbar = currentMain.querySelector('.dashboard-topbar');
    const currentFooter = currentMain.querySelector('.dashboard-footer');
    const nextContent = [...targetMain.children].filter((child) => {
      return !child.matches('[data-dashboard-header], [data-dashboard-footer]');
    });

    [...currentMain.children].forEach((child) => {
      if (child !== currentTopbar && child !== currentFooter) {
        child.remove();
      }
    });

    const insertionPoint = currentFooter || null;
    nextContent.forEach((child) => {
      currentMain.insertBefore(document.importNode(child, true), insertionPoint);
    });
  }

  async function initLayout() {
    const config = getPageConfig();
    const sidebarSlot = document.querySelector('[data-dashboard-sidebar]');
    const headerSlot = document.querySelector('[data-dashboard-header]');
    const footerSlot = document.querySelector('[data-dashboard-footer]');

    try {
      const headerPromise = loadPartial('partials/header.html');
      const footerPromise = footerSlot ? loadPartial('partials/footer.html') : Promise.resolve(null);
      const headerPartial = await headerPromise;

      if (sidebarSlot) {
        sidebarSlot.replaceWith(headerPartial.querySelector('#dashboard-sidebar-template').content.cloneNode(true));
      }
      if (headerSlot) {
        const topbar = headerPartial.querySelector('#dashboard-topbar-template').content.cloneNode(true);
        applyTopbarConfig(topbar, config);
        headerSlot.replaceWith(topbar);
      }

      if (footerSlot) {
        const footerPartial = await footerPromise;
        footerSlot.replaceWith(...footerPartial.childNodes);
      }
    } catch (error) {
      console.warn(error.message);
      document.body.classList.add('dashboard-layout-fallback');
    }

    setActiveNav(document, config.page);
    updateUserBits();
    hydrateHeaderStreak();
    wireInteractions();

    if (
      typeof initializeStreakSystem ===
      'function'
    ) {

      initializeStreakSystem();

    }

    if (
      typeof updateStreakProgress ===
      'function'
    ) {

      updateStreakProgress();

    }

    prefetchDashboardPages();
    document.dispatchEvent(new CustomEvent('glowth:layout-ready'));
  }

  function prefetchDashboardPages() {
    const links = [...document.querySelectorAll('.sidebar-nav-link[href]')]
      .map((link) => link.getAttribute('href'))
      .filter(Boolean);
    const uniqueLinks = [...new Set(links)];

    uniqueLinks.forEach((href) => {
      const prefetch = () => {
        const marker = `glowth_prefetched_${href}`;
        if (sessionStorage.getItem(marker)) return;
        fetch(href, { cache: 'force-cache' })
          .then((response) => {
            if (response.ok) sessionStorage.setItem(marker, '1');
          })
          .catch(() => {});
      };

      const node = document.createElement('link');
      node.rel = 'prefetch';
      node.href = href;
      document.head.appendChild(node);

      if ('requestIdleCallback' in window) {
        requestIdleCallback(prefetch, { timeout: 1800 });
      } else {
        setTimeout(prefetch, 700);
      }
    });
  }

  window.toggleMobileMenu = function () {
    const isOpen = document.body.classList.toggle('nav-open');
    document.querySelector('.dashboard-mobile-trigger')?.setAttribute('aria-expanded', String(isOpen));
  };

  window.toggleUserMenu = function () {
    const menu = document.getElementById('userMenu');
    if (!menu) return;
    const isOpen = !menu.classList.contains('open');
    menu.classList.toggle('open', isOpen);
    menu.querySelector('.user-menu-trigger')?.setAttribute('aria-expanded', String(isOpen));
  };

  window.addEventListener('resize', () => {
    const page = document.body.dataset.dashboardPage || 'overview';
    setActiveNav(document, page);
    if (typeof updateStreakProgress === 'function') {
      updateStreakProgress();
    }
  });
  window.addEventListener('popstate', () => {
    navigateDashboard(window.location.href, document.body.dataset.dashboardPage || 'overview', false);
  });

  if (document.querySelector('[data-dashboard-sidebar], [data-dashboard-header]')) {
    initLayout();
  } else {
    document.addEventListener('DOMContentLoaded', initLayout);
  }
})();
