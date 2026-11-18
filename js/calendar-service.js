// Layanan pengambilan dan pemrosesan jadwal dari Google Calendar API v3 serta fallback lokal.
// Junior developer dapat mengubah format tag deskripsi atau aturan status di file ini.

window.PortalKampus = window.PortalKampus || {};

(function () {
  var CONFIG = window.PortalKampus.CONFIG;

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Izinkan hanya URL http(s), mailto, atau path relatif aset agar aman dari skrip berbahaya di deskripsi kalender.
  function sanitizeUrl(rawUrl) {
    var trimmed = String(rawUrl || '').trim();
    if (!trimmed) {
      return '';
    }
    if (/^(https?:|mailto:)/i.test(trimmed)) {
      return trimmed;
    }
    if (/^(assets\/|event-[a-z0-9-]+\.html)/i.test(trimmed)) {
      return trimmed;
    }
    return '';
  }

  // Google Calendar terkadang membungkus deskripsi dengan tag HTML (<br>, <p>, <a>).
  function stripHtmlTags(rawText) {
    var text = String(rawText || '');
    if (!text) {
      return '';
    }
    var withNewlines = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n');

    if (typeof DOMParser !== 'undefined') {
      var doc = new DOMParser().parseFromString(withNewlines, 'text/html');
      return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    }
    return withNewlines.replace(/<[^>]+>/g, '').trim();
  }

  function getCategoryMeta(rawCategory) {
    var needle = String(rawCategory || '').trim().toLowerCase();
    var list = CONFIG.categories || [];
    for (var i = 0; i < list.length; i++) {
      var cat = list[i];
      if (
        cat.id === needle ||
        cat.labelId.toLowerCase() === needle ||
        cat.labelEn.toLowerCase() === needle
      ) {
        return cat;
      }
    }
    return list[list.length - 1] || {
      id: 'umum',
      labelId: 'Agenda Kampus',
      labelEn: 'Campus Event',
      defaultPoster: 'assets/img/fti-campus-640.jpg',
      defaultPosterAlt: 'Kegiatan resmi kampus'
    };
  }

  // Membaca tag metadata opsional di deskripsi Google Calendar (misal: "Kategori: Seminar").
  function parseDescriptionTags(rawDescription) {
    var cleanText = stripHtmlTags(rawDescription);
    var lines = cleanText.split(/\r?\n/);
    var bodyLines = [];
    var tags = {
      kategori: '',
      status: '',
      poster: '',
      daftar: '',
      biaya: '',
      kontak: '',
      rundown: []
    };

    var inRundownBlock = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) {
        if (inRundownBlock) {
          inRundownBlock = false;
        }
        continue;
      }

      var tagMatch = line.match(/^(Kategori|Category|Status|Poster|Daftar|Register|Biaya|Fee|Kontak|Contact|Rundown)\s*:\s*(.*)$/i);
      if (tagMatch) {
        var key = tagMatch[1].toLowerCase();
        var value = tagMatch[2].trim();
        inRundownBlock = key === 'rundown';

        if (key === 'kategori' || key === 'category') {
          tags.kategori = value;
        } else if (key === 'status') {
          tags.status = value;
        } else if (key === 'poster') {
          tags.poster = sanitizeUrl(value);
        } else if (key === 'daftar' || key === 'register') {
          tags.daftar = sanitizeUrl(value);
        } else if (key === 'biaya' || key === 'fee') {
          tags.biaya = value;
        } else if (key === 'kontak' || key === 'contact') {
          tags.kontak = value;
        } else if (key === 'rundown' && value) {
          parseRundownInline(value, tags.rundown);
        }
        continue;
      }

      if (inRundownBlock) {
        var cleanedRow = line.replace(/^[-*]\s*/, '');
        parseRundownInline(cleanedRow, tags.rundown);
        continue;
      }

      bodyLines.push(line);
    }

    return {
      description: bodyLines.join('\n').trim(),
      tags: tags
    };
  }

  function parseRundownInline(rawText, targetArray) {
    var items = String(rawText || '').split(';');
    for (var i = 0; i < items.length; i++) {
      var entry = items[i].trim();
      if (!entry) {
        continue;
      }
      var parts = entry.split('|');
      if (parts.length >= 2) {
        targetArray.push({
          time: parts[0].trim(),
          activity: parts.slice(1).join('|').trim()
        });
      } else {
        targetArray.push({
          time: 'Sesi ' + (targetArray.length + 1),
          activity: entry
        });
      }
    }
  }

  function resolveEventStatus(explicitStatus, startIso, endIso) {
    var now = Date.now();
    var endMs = new Date(endIso || startIso).getTime();
    var startMs = new Date(startIso).getTime();

    var normalized = String(explicitStatus || '').trim().toLowerCase();
    if (normalized === 'selesai' || normalized === 'closed' || normalized === 'tutup') {
      return 'closed';
    }
    if (normalized === 'segera' || normalized === 'segera hadir' || normalized === 'soon') {
      return endMs < now ? 'closed' : 'soon';
    }
    if (normalized === 'buka' || normalized === 'dibuka' || normalized === 'pendaftaran dibuka' || normalized === 'open') {
      return endMs < now ? 'closed' : 'open';
    }

    if (!Number.isNaN(endMs) && endMs < now) {
      return 'closed';
    }
    if (!Number.isNaN(startMs)) {
      var daysUntil = (startMs - now) / (1000 * 60 * 60 * 24);
      return daysUntil > 21 ? 'soon' : 'open';
    }
    return 'open';
  }

  function toLocalDateKey(dateInput) {
    var match = String(dateInput || '').match(/^(\d{4}-\d{2}-\d{2})$/);
    if (match) {
      return match[1];
    }
    var date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function formatDisplayDate(event, lang) {
    var locale = lang === 'en' ? 'en-US' : 'id-ID';
    var start = new Date(event.startIso);
    if (Number.isNaN(start.getTime())) {
      return '';
    }
    var datePart = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(start);

    if (event.isAllDay) {
      var dict = CONFIG.i18n[lang] || CONFIG.i18n.id;
      return datePart + ' · ' + dict.allDayLabel;
    }

    var startTime = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(start);

    return datePart + ' · ' + startTime + ' WIB';
  }

  function formatDisplayDateRange(event, lang) {
    var locale = lang === 'en' ? 'en-US' : 'id-ID';
    var start = new Date(event.startIso);
    var end = new Date(event.endIso || event.startIso);
    if (Number.isNaN(start.getTime())) {
      return '';
    }
    var fullDate = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(start);

    if (event.isAllDay) {
      var dict = CONFIG.i18n[lang] || CONFIG.i18n.id;
      return fullDate + ' (' + dict.allDayLabel + ')';
    }

    var fmt = new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return fullDate + ' · ' + fmt.format(start) + ' - ' + fmt.format(end) + ' WIB';
  }

  function normalizeEventObject(raw) {
    var catMeta = getCategoryMeta(raw.category);
    var status = resolveEventStatus(raw.status, raw.startIso, raw.endIso);
    var copy = Object.assign({}, raw, {
      category: catMeta.id,
      status: status,
      poster: raw.poster || catMeta.defaultPoster,
      posterAlt: raw.posterAlt || (raw.title ? 'Poster ' + raw.title : catMeta.defaultPosterAlt),
      dateKey: toLocalDateKey(raw.startIso)
    });
    copy.displayDate = formatDisplayDate(copy, 'id');
    return copy;
  }

  function mapGoogleItemToEvent(item) {
    var isAllDay = Boolean(item.start && item.start.date && !item.start.dateTime);
    var startIso = isAllDay ? item.start.date + 'T00:00:00+07:00' : item.start.dateTime;
    var endIso = isAllDay
      ? (item.end && item.end.date ? item.end.date : item.start.date) + 'T00:00:00+07:00'
      : (item.end && item.end.dateTime ? item.end.dateTime : startIso);

    var parsed = parseDescriptionTags(item.description || '');
    var tags = parsed.tags;
    var catMeta = getCategoryMeta(tags.kategori);

    return normalizeEventObject({
      id: item.id,
      title: item.summary || 'Agenda Kampus',
      titleEn: item.summary || 'Campus Event',
      category: catMeta.id,
      status: tags.status,
      startIso: startIso,
      endIso: endIso,
      isAllDay: isAllDay,
      location: item.location || '',
      description: parsed.description || 'Agenda resmi dari Google Calendar Portal Event Kampus.',
      descriptionEn: parsed.description || 'Official event imported from Campus Google Calendar.',
      rawDescription: parsed.description,
      poster: tags.poster || catMeta.defaultPoster,
      explicitPoster: tags.poster,
      posterAlt: (item.summary || 'Event Kampus') + ' poster',
      fee: tags.biaya || CONFIG.defaultFee.id,
      explicitFee: tags.biaya,
      contact: tags.kontak || CONFIG.defaultContactEmail,
      explicitContact: tags.kontak,
      daftarUrl: tags.daftar || '',
      rundown: tags.rundown,
      legacyUrl: '',
      staticIcsUrl: '',
      htmlLink: sanitizeUrl(item.htmlLink || '')
    });
  }

  function isGoogleConfigured() {
    var gc = CONFIG.googleCalendar || {};
    var id = String(gc.calendarId || '').trim();
    var key = String(gc.apiKey || '').trim();
    return Boolean(
      id &&
      key &&
      id.indexOf('ISI_') === -1 &&
      key.indexOf('ISI_') === -1
    );
  }

  var authState = {
    accessToken: '',
    expiresAt: 0,
    tokenClient: null
  };

  function isOAuthConfigured() {
    var gc = CONFIG.googleCalendar || {};
    var clientId = String(gc.oauthClientId || '').trim();
    return Boolean(clientId && clientId.indexOf('ISI_') === -1);
  }

  function canUseOAuthProtocol() {
    var proto = window.location && window.location.protocol;
    return proto === 'http:' || proto === 'https:';
  }

  function hasValidAdminToken() {
    return Boolean(authState.accessToken && Date.now() < authState.expiresAt - 15000);
  }

  function getAdminAuthStatus() {
    return {
      configured: isOAuthConfigured(),
      protocolSupported: canUseOAuthProtocol(),
      signedIn: hasValidAdminToken(),
      expiresAt: authState.expiresAt
    };
  }

  function clearCache() {
    try {
      window.sessionStorage.removeItem(CONFIG.storageKeys.eventsCache);
    } catch (err) {
      // Abaikan jika sessionStorage tidak tersedia.
    }
  }

  function requestAdminToken(options) {
    var opts = options || {};
    return new Promise(function (resolve, reject) {
      if (!canUseOAuthProtocol()) {
        reject(new Error('Login Google OAuth membutuhkan protokol http:// atau https:// (bukan file://).'));
        return;
      }
      if (!isOAuthConfigured()) {
        reject(new Error('oauthClientId di js/config.js belum diisi.'));
        return;
      }
      if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
        reject(new Error('Skrip Google Identity Services belum termuat. Periksa koneksi internet Anda.'));
        return;
      }

      var gc = CONFIG.googleCalendar;
      var settled = false;
      function finishReject(message) {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error(message));
      }

      authState.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: gc.oauthClientId.trim(),
        scope: 'https://www.googleapis.com/auth/calendar.events',
        callback: function (resp) {
          if (settled) {
            return;
          }
          if (resp && resp.error) {
            finishReject(resp.error_description || resp.error);
            return;
          }
          if (!resp || !resp.access_token) {
            finishReject('Token akses Google tidak diterima.');
            return;
          }
          settled = true;
          var ttlSeconds = Number(resp.expires_in) || 3500;
          authState.accessToken = resp.access_token;
          authState.expiresAt = Date.now() + ttlSeconds * 1000;
          resolve(getAdminAuthStatus());
        },
        error_callback: function (err) {
          var reason = err && (err.message || err.type) ? (err.message || err.type) : 'Popup login ditutup atau diblokir browser.';
          finishReject(reason);
        }
      });

      // Paksa pemilih akun Google muncul agar admin bebas memilih atau mengganti akun yang berbeda.
      authState.tokenClient.requestAccessToken({
        prompt: opts.silent ? '' : 'select_account'
      });
    });
  }

  function signOutAdmin() {
    var token = authState.accessToken;
    authState.accessToken = '';
    authState.expiresAt = 0;
    if (token && window.google && window.google.accounts && window.google.accounts.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(token, function () {});
      } catch (err) {
        // Abaikan jika pencabutan token gagal saat offline.
      }
    }
  }

  function getFallbackEvents() {
    var list = window.PortalKampus.FALLBACK_EVENTS || [];
    return list.map(normalizeEventObject).sort(function (a, b) {
      return new Date(a.startIso).getTime() - new Date(b.startIso).getTime();
    });
  }

  function readCachedGoogleEvents() {
    try {
      var raw = window.sessionStorage.getItem(CONFIG.storageKeys.eventsCache);
      if (!raw) {
        return null;
      }
      var parsed = JSON.parse(raw);
      var maxAgeMs = (CONFIG.googleCalendar.cacheMinutes || 5) * 60 * 1000;
      if (Date.now() - parsed.savedAt > maxAgeMs) {
        return null;
      }
      return parsed.events || null;
    } catch (err) {
      return null;
    }
  }

  function writeCachedGoogleEvents(events) {
    try {
      window.sessionStorage.setItem(
        CONFIG.storageKeys.eventsCache,
        JSON.stringify({ savedAt: Date.now(), events: events })
      );
    } catch (err) {
      // Abaikan jika mode privasi browser membatasi sessionStorage.
    }
  }

  async function fetchGoogleEvents(options) {
    var opts = options || {};
    if (!opts.forceRefresh) {
      var cached = readCachedGoogleEvents();
      if (cached) {
        return cached.map(normalizeEventObject);
      }
    }

    var gc = CONFIG.googleCalendar;
    var endpoint =
      'https://www.googleapis.com/calendar/v3/calendars/' +
      encodeURIComponent(gc.calendarId.trim()) +
      '/events';

    var params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(gc.maxResults || 100)
    });
    if (gc.apiKey && gc.apiKey.trim()) {
      params.set('key', gc.apiKey.trim());
    }

    var headers = {};
    if (hasValidAdminToken()) {
      headers.Authorization = 'Bearer ' + authState.accessToken;
    }

    var response = await window.fetch(endpoint + '?' + params.toString(), { headers: headers });
    if (!response.ok) {
      var apiMsg = '';
      try {
        var errJson = await response.json();
        apiMsg = errJson && errJson.error && errJson.error.message ? ': ' + errJson.error.message : '';
      } catch (parseErr) {
        apiMsg = '';
      }
      throw new Error('Google Calendar API HTTP ' + response.status + apiMsg);
    }

    var payload = await response.json();
    var items = Array.isArray(payload.items) ? payload.items : [];
    var events = items
      .filter(function (item) {
        return item && item.status !== 'cancelled' && (item.start && (item.start.dateTime || item.start.date));
      })
      .map(mapGoogleItemToEvent)
      .sort(function (a, b) {
        return new Date(a.startIso).getTime() - new Date(b.startIso).getTime();
      });

    writeCachedGoogleEvents(events);
    return events;
  }

  function addDaysToYmd(ymd, deltaDays) {
    var parts = String(ymd || '').split('-');
    var dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    dt.setDate(dt.getDate() + deltaDays);
    return (
      dt.getFullYear() +
      '-' +
      String(dt.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(dt.getDate()).padStart(2, '0')
    );
  }

  function buildGoogleEventPayload(input) {
    var tz = (CONFIG.googleCalendar && CONFIG.googleCalendar.timeZone) || 'Asia/Jakarta';
    var payload = {
      summary: input.title,
      location: input.location || '',
      description: input.formattedDetails || input.description || ''
    };

    if (input.isAllDay) {
      payload.start = { date: input.startDate };
      payload.end = { date: addDaysToYmd(input.endDate || input.startDate, 1) };
    } else {
      payload.start = { dateTime: input.startIso, timeZone: tz };
      payload.end = { dateTime: input.endIso, timeZone: tz };
    }
    return payload;
  }

  async function mutateGoogleEvent(method, pathSuffix, bodyPayload) {
    if (!hasValidAdminToken()) {
      throw new Error('Sesi login admin Google OAuth tidak aktif atau sudah habis.');
    }
    var gc = CONFIG.googleCalendar;
    var calendarId = String(gc.calendarId || '').trim();
    if (!calendarId) {
      throw new Error('calendarId belum diisi di js/config.js.');
    }

    var endpoint =
      'https://www.googleapis.com/calendar/v3/calendars/' +
      encodeURIComponent(calendarId) +
      '/events' +
      (pathSuffix || '');

    var fetchOptions = {
      method: method,
      headers: {
        Authorization: 'Bearer ' + authState.accessToken,
        'Content-Type': 'application/json'
      }
    };
    if (bodyPayload) {
      fetchOptions.body = JSON.stringify(bodyPayload);
    }

    var response = await window.fetch(endpoint, fetchOptions);
    if (!response.ok) {
      var apiMsg = '';
      try {
        var errJson = await response.json();
        apiMsg = errJson && errJson.error && errJson.error.message ? ': ' + errJson.error.message : '';
      } catch (parseErr) {
        apiMsg = '';
      }
      throw new Error('Google Calendar Write HTTP ' + response.status + apiMsg);
    }

    clearCache();
    if (response.status === 204 || method === 'DELETE') {
      return null;
    }
    var savedItem = await response.json();
    return mapGoogleItemToEvent(savedItem);
  }

  function createGoogleEvent(eventInput) {
    return mutateGoogleEvent('POST', '', buildGoogleEventPayload(eventInput));
  }

  function updateGoogleEvent(eventId, eventInput) {
    return mutateGoogleEvent('PATCH', '/' + encodeURIComponent(eventId), buildGoogleEventPayload(eventInput));
  }

  function deleteGoogleEvent(eventId) {
    return mutateGoogleEvent('DELETE', '/' + encodeURIComponent(eventId), null);
  }

  function findOverlappingEvents(events, candidateStartIso, candidateEndIso, isAllDay, excludeId) {
    if (!Array.isArray(events) || isAllDay) {
      return [];
    }
    var candStart = new Date(candidateStartIso).getTime();
    var candEnd = new Date(candidateEndIso).getTime();
    if (Number.isNaN(candStart) || Number.isNaN(candEnd) || candEnd <= candStart) {
      return [];
    }

    return events.filter(function (ev) {
      if (!ev || ev.isAllDay || (excludeId && String(ev.id) === String(excludeId))) {
        return false;
      }
      var evStart = new Date(ev.startIso).getTime();
      var evEnd = new Date(ev.endIso || ev.startIso).getTime();
      if (Number.isNaN(evStart) || Number.isNaN(evEnd)) {
        return false;
      }
      return candStart < evEnd && evStart < candEnd;
    });
  }

  async function getEvents(options) {
    if (!isGoogleConfigured() && !hasValidAdminToken()) {
      return {
        events: getFallbackEvents(),
        source: 'fallback',
        errorMessage: ''
      };
    }

    try {
      var liveEvents = await fetchGoogleEvents(options);
      return {
        events: liveEvents,
        source: 'google',
        errorMessage: ''
      };
    } catch (err) {
      return {
        events: getFallbackEvents(),
        source: 'fallback-error',
        errorMessage: err && err.message ? err.message : 'Network error'
      };
    }
  }

  async function getEventById(id) {
    var result = await getEvents();
    var match = null;
    for (var i = 0; i < result.events.length; i++) {
      if (String(result.events[i].id) === String(id)) {
        match = result.events[i];
        break;
      }
    }
    return {
      event: match,
      source: result.source,
      errorMessage: result.errorMessage
    };
  }

  window.PortalKampus.calendarService = {
    escapeHtml: escapeHtml,
    sanitizeUrl: sanitizeUrl,
    getCategoryMeta: getCategoryMeta,
    parseDescriptionTags: parseDescriptionTags,
    formatDisplayDate: formatDisplayDate,
    formatDisplayDateRange: formatDisplayDateRange,
    toLocalDateKey: toLocalDateKey,
    isGoogleConfigured: isGoogleConfigured,
    isOAuthConfigured: isOAuthConfigured,
    canUseOAuthProtocol: canUseOAuthProtocol,
    getAdminAuthStatus: getAdminAuthStatus,
    requestAdminToken: requestAdminToken,
    signOutAdmin: signOutAdmin,
    clearCache: clearCache,
    createGoogleEvent: createGoogleEvent,
    updateGoogleEvent: updateGoogleEvent,
    deleteGoogleEvent: deleteGoogleEvent,
    findOverlappingEvents: findOverlappingEvents,
    getEvents: getEvents,
    getEventById: getEventById
  };
})();
