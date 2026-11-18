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

  function extractGoogleDriveFileId(rawUrl) {
    var safeUrl = sanitizeUrl(rawUrl);
    if (!safeUrl || !/^https?:/i.test(safeUrl)) {
      return '';
    }
    try {
      var parsed = new URL(safeUrl);
      var host = parsed.hostname.toLowerCase();
      if (host !== 'drive.google.com' && host !== 'docs.google.com') {
        return '';
      }
      var pathMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (pathMatch && pathMatch[1]) {
        return pathMatch[1];
      }
      var queryId = parsed.searchParams.get('id');
      if (queryId && /^[a-zA-Z0-9_-]{10,}$/.test(queryId)) {
        return queryId;
      }
      return '';
    } catch (err) {
      return '';
    }
  }

  function isGoogleDriveUrl(rawUrl) {
    var safeUrl = sanitizeUrl(rawUrl);
    return Boolean(extractGoogleDriveFileId(safeUrl) || /^https:\/\/lh3\.googleusercontent\.com\/d\//i.test(safeUrl));
  }

  // Konversi link share Google Drive menjadi URL thumbnail langsung agar bisa dimuat di elemen <img>.
  function normalizePosterUrl(rawUrl) {
    var safeUrl = sanitizeUrl(rawUrl);
    if (!safeUrl) {
      return '';
    }
    var driveId = extractGoogleDriveFileId(safeUrl);
    if (driveId) {
      return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(driveId) + '&sz=w1200';
    }
    return safeUrl;
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
          tags.poster = normalizePosterUrl(value);
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

  function findImageAttachmentPoster(attachments) {
    if (!Array.isArray(attachments)) {
      return '';
    }
    for (var i = 0; i < attachments.length; i++) {
      var att = attachments[i];
      if (att && String(att.mimeType || '').indexOf('image/') === 0 && att.fileUrl) {
        var normalized = normalizePosterUrl(att.fileUrl);
        if (normalized) {
          return normalized;
        }
      }
    }
    return '';
  }

  function normalizeEventObject(raw) {
    var catMeta = getCategoryMeta(raw.category);
    var status = resolveEventStatus(raw.status, raw.startIso, raw.endIso);
    var copy = Object.assign({}, raw, {
      category: catMeta.id,
      status: status,
      poster: normalizePosterUrl(raw.poster) || catMeta.defaultPoster,
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
    var explicitPoster = tags.poster || findImageAttachmentPoster(item.attachments);

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
      poster: explicitPoster || catMeta.defaultPoster,
      explicitPoster: explicitPoster,
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

  var DEFAULT_SESSION_MINUTES = 30;
  var TOKEN_SAFETY_BUFFER_MS = 15000;

  var authState = {
    accessToken: '',
    expiresAt: 0,
    loggedInAt: 0,
    tokenClient: null
  };

  var pinSessionState = {
    verified: false,
    pinHash: '',
    expiresAt: 0,
    loggedInAt: 0
  };

  function getSessionMinutes() {
    var gc = CONFIG.googleCalendar || {};
    var minutes = Number(gc.oauthSessionMinutes || DEFAULT_SESSION_MINUTES);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_SESSION_MINUTES;
  }

  function getPinSessionMinutes() {
    var aa = CONFIG.adminAuth || {};
    var minutes = Number(aa.sessionMinutes || DEFAULT_SESSION_MINUTES);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_SESSION_MINUTES;
  }

  function getConfiguredPinHash() {
    var aa = CONFIG.adminAuth || {};
    return String(aa.pinHash || '').trim().toLowerCase();
  }

  function isAdminPinConfigured() {
    return /^[a-f0-9]{64}$/.test(getConfiguredPinHash());
  }

  function getAdminSessionKey() {
    return (CONFIG.storageKeys && CONFIG.storageKeys.adminSession) || 'portal_kampus_admin_session_v1';
  }

  function getAdminPinSessionKey() {
    return (CONFIG.storageKeys && CONFIG.storageKeys.adminPinSession) || 'portal_kampus_admin_pin_session_v1';
  }

  function writeLocalJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // Abaikan jika localStorage dibatasi browser.
    }
  }

  function readLocalJson(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function removeLocalKey(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      // Abaikan jika localStorage dibatasi browser.
    }
  }

  function clearPersistedAdminSession() {
    removeLocalKey(getAdminSessionKey());
  }

  function persistAdminSession() {
    writeLocalJson(getAdminSessionKey(), {
      accessToken: authState.accessToken,
      expiresAt: authState.expiresAt,
      loggedInAt: authState.loggedInAt
    });
  }

  function resetAuthStateMemory() {
    authState.accessToken = '';
    authState.expiresAt = 0;
    authState.loggedInAt = 0;
  }

  function loadAdminSession() {
    var parsed = readLocalJson(getAdminSessionKey());
    var token = parsed && typeof parsed.accessToken === 'string' ? parsed.accessToken : '';
    var expiresAt = Number(parsed && parsed.expiresAt);
    if (!token || !Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      resetAuthStateMemory();
      clearPersistedAdminSession();
      return;
    }
    authState.accessToken = token;
    authState.expiresAt = expiresAt;
    authState.loggedInAt = Number(parsed && parsed.loggedInAt) || 0;
  }

  function resetPinSessionMemory() {
    pinSessionState.verified = false;
    pinSessionState.pinHash = '';
    pinSessionState.expiresAt = 0;
    pinSessionState.loggedInAt = 0;
  }

  function loadAdminPinSession() {
    var expectedHash = getConfiguredPinHash();
    var parsed = readLocalJson(getAdminPinSessionKey());
    var expiresAt = Number(parsed && parsed.expiresAt);
    var storedHash = parsed && typeof parsed.pinHash === 'string' ? parsed.pinHash : '';
    if (
      !parsed ||
      !parsed.verified ||
      !expectedHash ||
      storedHash !== expectedHash ||
      !Number.isFinite(expiresAt) ||
      Date.now() >= expiresAt
    ) {
      resetPinSessionMemory();
      removeLocalKey(getAdminPinSessionKey());
      return;
    }
    pinSessionState.verified = true;
    pinSessionState.pinHash = storedHash;
    pinSessionState.expiresAt = expiresAt;
    pinSessionState.loggedInAt = Number(parsed.loggedInAt) || 0;
  }

  function hasValidAdminPinSession() {
    if (!pinSessionState.verified) {
      return false;
    }
    if (Date.now() >= pinSessionState.expiresAt || pinSessionState.pinHash !== getConfiguredPinHash()) {
      resetPinSessionMemory();
      removeLocalKey(getAdminPinSessionKey());
      return false;
    }
    return true;
  }

  function getAdminPinStatus() {
    var unlocked = hasValidAdminPinSession();
    return {
      configured: isAdminPinConfigured(),
      unlocked: unlocked,
      expiresAt: unlocked ? pinSessionState.expiresAt : 0,
      loggedInAt: unlocked ? pinSessionState.loggedInAt : 0,
      remainingMs: unlocked ? Math.max(0, pinSessionState.expiresAt - Date.now()) : 0,
      sessionMinutes: getPinSessionMinutes()
    };
  }

  function sha256FallbackHex(text) {
    var utf8 = unescape(encodeURIComponent(String(text || '')));
    var bytes = [];
    for (var i = 0; i < utf8.length; i++) {
      bytes.push(utf8.charCodeAt(i));
    }
    var k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var h = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) {
      bytes.push(0);
    }
    for (var hi = 3; hi >= 0; hi--) {
      bytes.push((Math.floor(bitLen / 0x100000000) >>> (hi * 8)) & 0xff);
    }
    for (var lo = 3; lo >= 0; lo--) {
      bytes.push((bitLen >>> (lo * 8)) & 0xff);
    }
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    var w = new Array(64);
    for (var offset = 0; offset < bytes.length; offset += 64) {
      for (var t = 0; t < 16; t++) {
        w[t] = (bytes[offset + t * 4] << 24) | (bytes[offset + t * 4 + 1] << 16) |
          (bytes[offset + t * 4 + 2] << 8) | bytes[offset + t * 4 + 3];
      }
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (hh + S1 + ch + k[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map(function (val) { return (val >>> 0).toString(16).padStart(8, '0'); }).join('');
  }

  async function sha256Hex(text) {
    if (window.crypto && window.crypto.subtle && typeof TextEncoder !== 'undefined') {
      var data = new TextEncoder().encode(String(text || ''));
      var hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      var bytes = Array.prototype.slice.call(new Uint8Array(hashBuffer));
      return bytes.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    return sha256FallbackHex(text);
  }

  async function verifyAdminPin(rawPin) {
    if (!isAdminPinConfigured()) {
      return { ok: false, error: 'PIN Admin belum dikonfigurasi pada Env Var ADMIN_PIN atau js/config.js.' };
    }
    var trimmed = String(rawPin || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'Masukkan PIN Admin terlebih dahulu.' };
    }
    var inputHash = await sha256Hex(trimmed);
    var expectedHash = getConfiguredPinHash();
    var diff = inputHash.length ^ expectedHash.length;
    for (var i = 0; i < inputHash.length && i < expectedHash.length; i++) {
      diff |= inputHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    }
    if (diff !== 0) {
      return { ok: false, error: 'PIN Admin tidak sesuai.' };
    }
    var now = Date.now();
    pinSessionState.verified = true;
    pinSessionState.pinHash = expectedHash;
    pinSessionState.loggedInAt = now;
    pinSessionState.expiresAt = now + getPinSessionMinutes() * 60 * 1000;
    writeLocalJson(getAdminPinSessionKey(), {
      verified: true,
      pinHash: expectedHash,
      loggedInAt: pinSessionState.loggedInAt,
      expiresAt: pinSessionState.expiresAt
    });
    return { ok: true, status: getAdminPinStatus() };
  }

  function lockAdminPanel() {
    resetPinSessionMemory();
    removeLocalKey(getAdminPinSessionKey());
  }

  loadAdminSession();
  loadAdminPinSession();

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
    if (!authState.accessToken) {
      return false;
    }
    if (Date.now() >= authState.expiresAt) {
      resetAuthStateMemory();
      clearPersistedAdminSession();
      return false;
    }
    return true;
  }

  function getAdminAuthStatus() {
    var signedIn = hasValidAdminToken();
    return {
      configured: isOAuthConfigured(),
      protocolSupported: canUseOAuthProtocol(),
      signedIn: signedIn,
      expiresAt: signedIn ? authState.expiresAt : 0,
      loggedInAt: signedIn ? authState.loggedInAt : 0,
      remainingMs: signedIn ? Math.max(0, authState.expiresAt - Date.now()) : 0,
      sessionMinutes: getSessionMinutes()
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
          // Batasi sesi lokal maksimal 30 menit setiap login agar tetap aman di localStorage.
          var maxSessionMs = getSessionMinutes() * 60 * 1000;
          var googleTtlMs = Math.max(0, (Number(resp.expires_in) || 3500) * 1000 - TOKEN_SAFETY_BUFFER_MS);
          var effectiveTtlMs = Math.min(maxSessionMs, googleTtlMs || maxSessionMs);
          var now = Date.now();
          authState.accessToken = resp.access_token;
          authState.loggedInAt = now;
          authState.expiresAt = now + effectiveTtlMs;
          persistAdminSession();
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
    resetAuthStateMemory();
    clearPersistedAdminSession();
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
      if (response.status === 401) {
        resetAuthStateMemory();
        clearPersistedAdminSession();
        throw new Error('Sesi login Google sudah habis atau dicabut. Silakan login kembali.');
      }
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
    isGoogleDriveUrl: isGoogleDriveUrl,
    normalizePosterUrl: normalizePosterUrl,
    getCategoryMeta: getCategoryMeta,
    parseDescriptionTags: parseDescriptionTags,
    formatDisplayDate: formatDisplayDate,
    formatDisplayDateRange: formatDisplayDateRange,
    toLocalDateKey: toLocalDateKey,
    isGoogleConfigured: isGoogleConfigured,
    isOAuthConfigured: isOAuthConfigured,
    canUseOAuthProtocol: canUseOAuthProtocol,
    getAdminAuthStatus: getAdminAuthStatus,
    getAdminSessionKey: getAdminSessionKey,
    reloadAdminSession: loadAdminSession,
    getAdminPinStatus: getAdminPinStatus,
    getAdminPinSessionKey: getAdminPinSessionKey,
    reloadAdminPinSession: loadAdminPinSession,
    verifyAdminPin: verifyAdminPin,
    lockAdminPanel: lockAdminPanel,
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
