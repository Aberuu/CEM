// Utilitas UI bersama: sinkronisasi bahasa ID/EN, navigasi keyboard, kartu event, dan status data.

window.PortalKampus = window.PortalKampus || {};

(function () {
  var CONFIG = window.PortalKampus.CONFIG;
  var svc = window.PortalKampus.calendarService;

  function getCurrentLang() {
    var enRadio = document.getElementById('lang-en');
    if (enRadio && enRadio.checked) {
      return 'en';
    }
    return 'id';
  }

  function t(key) {
    var lang = getCurrentLang();
    var dict = CONFIG.i18n[lang] || CONFIG.i18n.id;
    return dict[key] || CONFIG.i18n.id[key] || key;
  }

  function applyStoredLanguage() {
    var radioBa = document.getElementById('lang-ba');
    var radioEn = document.getElementById('lang-en');
    if (!radioBa || !radioEn) {
      return;
    }

    try {
      var saved = window.localStorage.getItem(CONFIG.storageKeys.lang);
      if (saved === 'en') {
        radioEn.checked = true;
        document.documentElement.lang = 'en';
      } else if (saved === 'id') {
        radioBa.checked = true;
        document.documentElement.lang = 'id';
      }
    } catch (err) {
      // Abaikan jika localStorage diblokir oleh pengaturan privasi browser.
    }

    function handleLangChange() {
      var activeLang = radioEn.checked ? 'en' : 'id';
      document.documentElement.lang = activeLang;
      try {
        window.localStorage.setItem(CONFIG.storageKeys.lang, activeLang);
      } catch (err) {
        // Abaikan kegagalan penyimpanan lokal.
      }
      window.dispatchEvent(new CustomEvent('portal:langchange', { detail: { lang: activeLang } }));
    }

    radioBa.addEventListener('change', handleLangChange);
    radioEn.addEventListener('change', handleLangChange);
  }

  function setupMobileDrawerAccessibility() {
    var toggle = document.getElementById('nav-drawer-toggle');
    var burger = document.querySelector('.hamburger-btn');
    var drawer = document.querySelector('.mobile-drawer');
    if (!toggle || !burger || !drawer) {
      return;
    }

    function syncExpanded() {
      burger.setAttribute('aria-expanded', toggle.checked ? 'true' : 'false');
    }

    toggle.addEventListener('change', syncExpanded);
    syncExpanded();

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.checked) {
        toggle.checked = false;
        syncExpanded();
        burger.focus();
      }
    });

    drawer.addEventListener('click', function (event) {
      if (event.target && event.target.closest('a')) {
        toggle.checked = false;
        syncExpanded();
      }
    });
  }

  function getStatusMeta(status) {
    if (status === 'closed') {
      return { className: 'badge--closed', label: t('statusClosed') };
    }
    if (status === 'soon') {
      return { className: 'badge--soon', label: t('statusSoon') };
    }
    return { className: 'badge--open', label: t('statusOpen') };
  }

  function getEventTitle(event, lang) {
    if (lang === 'en' && event.titleEn) {
      return event.titleEn;
    }
    return event.title || 'Event Kampus';
  }

  function getEventDescription(event, lang) {
    if (lang === 'en' && event.descriptionEn) {
      return event.descriptionEn;
    }
    return event.description || '';
  }

  function getDetailHref(event) {
    return 'event-detail.html?id=' + encodeURIComponent(event.id);
  }

  // Satu komponen kartu event terpusat agar halaman Beranda, Daftar Event, dan Pratinjau Admin selalu konsisten.
  function renderEventCard(event, options) {
    var opts = options || {};
    var lang = opts.lang || getCurrentLang();
    var catMeta = svc.getCategoryMeta(event.category);
    var catLabel = lang === 'en' ? catMeta.labelEn : catMeta.labelId;
    var statusMeta = getStatusMeta(event.status);
    var title = getEventTitle(event, lang);
    var dateText = svc.formatDisplayDate(event, lang);
    var locationText = event.location || t('locationTba');
    var detailHref = opts.previewOnly ? '#pratinjau-kartu' : getDetailHref(event);
    var animClass = opts.animClass ? ' ' + opts.animClass : '';
    var fallbackPoster = catMeta.defaultPoster;

    return (
      '<article class="event-card' + animClass + '" data-cat="' + svc.escapeHtml(event.category) + '">' +
        '<div class="event-card__media">' +
          '<img src="' + svc.escapeHtml(event.poster) + '" width="720" height="910" ' +
          'alt="' + svc.escapeHtml(event.posterAlt || title) + '" loading="lazy" decoding="async" ' +
          'data-fallback="' + svc.escapeHtml(fallbackPoster) + '">' +
        '</div>' +
        '<div class="event-card__body">' +
          '<div class="event-card__meta">' +
            '<span class="badge badge--cat">' + svc.escapeHtml(catLabel) + '</span>' +
            '<span class="badge ' + statusMeta.className + '">' + svc.escapeHtml(statusMeta.label) + '</span>' +
          '</div>' +
          '<h3 class="event-card__title">' + svc.escapeHtml(title) + '</h3>' +
          '<div class="event-card__info">' +
            '<span>' + svc.escapeHtml(dateText) + '</span>' +
            '<span>' + svc.escapeHtml(locationText) + '</span>' +
          '</div>' +
          '<div class="event-card__cta">' +
            '<a class="btn btn-outline" href="' + svc.escapeHtml(detailHref) + '"' + (opts.previewOnly ? ' tabindex="-1" aria-disabled="true"' : '') + '>' +
              svc.escapeHtml(t('viewDetails')) +
            '</a>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function attachImageFallbacks(root) {
    if (!root) {
      return;
    }
    var images = root.querySelectorAll('img[data-fallback]');
    images.forEach(function (img) {
      img.addEventListener('error', function handleImgError() {
        var fallback = img.getAttribute('data-fallback');
        if (fallback && img.getAttribute('src') !== fallback) {
          img.setAttribute('src', fallback);
        }
      }, { once: true });
    });
  }

  function renderStatusState(container, config) {
    if (!container) {
      return;
    }
    var type = config.type || 'empty';
    var role = type === 'error' ? 'alert' : 'status';
    var actionHtml = '';
    if (config.actionLabel && typeof config.onAction === 'function') {
      actionHtml = '<button class="btn btn-outline ui-state__btn" type="button">' + svc.escapeHtml(config.actionLabel) + '</button>';
    } else if (config.actionLabel && config.actionHref) {
      actionHtml = '<a class="btn btn-outline ui-state__btn" href="' + svc.escapeHtml(config.actionHref) + '">' + svc.escapeHtml(config.actionLabel) + '</a>';
    }

    container.innerHTML =
      '<div class="ui-state ui-state--' + svc.escapeHtml(type) + '" role="' + role + '" aria-live="polite">' +
        '<p class="ui-state__title">' + svc.escapeHtml(config.title || '') + '</p>' +
        (config.message ? '<p class="ui-state__desc">' + svc.escapeHtml(config.message) + '</p>' : '') +
        actionHtml +
      '</div>';

    if (config.actionLabel && typeof config.onAction === 'function') {
      var btn = container.querySelector('.ui-state__btn');
      if (btn) {
        btn.addEventListener('click', config.onAction);
      }
    }
  }

  function renderSourceNotice(container, source, errorMessage, onRetry) {
    if (!container) {
      return;
    }
    var lang = getCurrentLang();
    var text = '';
    var variant = 'info';

    if (source === 'google') {
      text = t('modeLive');
      variant = 'live';
    } else if (source === 'fallback-error') {
      text = t('modeError') + (errorMessage ? ' (' + errorMessage + ')' : '');
      variant = 'warn';
    } else {
      text = t('modeFallback');
      variant = 'info';
    }

    var adminHrefText = lang === 'en' ? 'Open Admin & Setup' : 'Buka Panduan Setup';
    var retryText = t('retry');

    container.innerHTML =
      '<div class="mode-banner mode-banner--' + variant + '" role="status" aria-live="polite">' +
        '<span>' + svc.escapeHtml(text) + '</span>' +
        '<div class="mode-banner__actions">' +
          (typeof onRetry === 'function'
            ? '<button class="btn btn-outline btn-compact" type="button" data-action="retry">' + svc.escapeHtml(retryText) + '</button>'
            : '') +
          '<a class="btn btn-outline btn-compact" href="admin.html#setup-gcal">' + svc.escapeHtml(adminHrefText) + '</a>' +
        '</div>' +
      '</div>';

    if (typeof onRetry === 'function') {
      var retryBtn = container.querySelector('[data-action="retry"]');
      if (retryBtn) {
        retryBtn.addEventListener('click', onRetry);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyStoredLanguage();
    setupMobileDrawerAccessibility();
  });

  window.PortalKampus.ui = {
    getCurrentLang: getCurrentLang,
    t: t,
    getStatusMeta: getStatusMeta,
    getEventTitle: getEventTitle,
    getEventDescription: getEventDescription,
    getDetailHref: getDetailHref,
    renderEventCard: renderEventCard,
    attachImageFallbacks: attachImageFallbacks,
    renderStatusState: renderStatusState,
    renderSourceNotice: renderSourceNotice
  };
})();
