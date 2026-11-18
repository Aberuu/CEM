// Skrip halaman Admin (admin.html): kalender drag & drop ala Google Calendar, Quick Modal, OAuth CRUD, & form lengkap.

window.PortalKampus = window.PortalKampus || {};

(function () {
  var CONFIG = window.PortalKampus.CONFIG;
  var svc = window.PortalKampus.calendarService;
  var ics = window.PortalKampus.ics;
  var ui = window.PortalKampus.ui;
  var tl = window.PortalKampus.timelineView;

  var today = new Date();
  var state = {
    editingEventId: '',
    selectedDateKey: svc.toLocalDateKey(today),
    miniYear: today.getFullYear(),
    miniMonth: today.getMonth(),
    viewMode: window.innerWidth >= 768 ? 'week' : 'day',
    sidebarExpanded: window.innerWidth >= 900,
    hiddenCategories: {},
    activeSelection: null,
    isSaving: false,
    payload: null,
    localDrafts: loadStoredDrafts(),
    lastUndo: null,
    qmCategory: 'seminar',
    qmEditingEventId: '',
    qmBaseEvent: null
  };

  var el = {};

  function padTwo(n) {
    return String(n).padStart(2, '0');
  }

  function formatDateInput(dateObj) {
    return (
      dateObj.getFullYear() +
      '-' +
      padTwo(dateObj.getMonth() + 1) +
      '-' +
      padTwo(dateObj.getDate())
    );
  }

  function formatTimeInput(dateObj) {
    return padTwo(dateObj.getHours()) + ':' + padTwo(dateObj.getMinutes());
  }

  function loadStoredDrafts() {
    try {
      var key = CONFIG.storageKeys && CONFIG.storageKeys.adminDrafts;
      var raw = key ? window.sessionStorage.getItem(key) : '';
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function saveStoredDrafts() {
    try {
      var key = CONFIG.storageKeys && CONFIG.storageKeys.adminDrafts;
      if (key) {
        window.sessionStorage.setItem(key, JSON.stringify(state.localDrafts));
      }
    } catch (err) {
      // Abaikan jika sessionStorage dibatasi browser.
    }
  }

  function getCombinedEvents() {
    var baseList = (state.payload && Array.isArray(state.payload.events)) ? state.payload.events : [];
    var overrideByBaseId = {};
    var createdDrafts = [];

    state.localDrafts.forEach(function (draft) {
      if (draft.baseEventId) {
        overrideByBaseId[String(draft.baseEventId)] = draft;
      } else {
        createdDrafts.push(draft);
      }
    });

    var merged = baseList.map(function (ev) {
      return overrideByBaseId[String(ev.id)] || ev;
    });

    return merged.concat(createdDrafts).sort(function (a, b) {
      return new Date(a.startIso).getTime() - new Date(b.startIso).getTime();
    });
  }

  function findEventById(eventId) {
    return getCombinedEvents().find(function (ev) {
      return String(ev.id) === String(eventId);
    }) || null;
  }

  function populateSelectOptions() {
    if (el.category) {
      el.category.innerHTML = CONFIG.categories
        .map(function (cat) {
          return '<option value="' + svc.escapeHtml(cat.id) + '">' + svc.escapeHtml(cat.labelId) + '</option>';
        })
        .join('');
    }
    if (el.posterPreset) {
      var opts = ['<option value="">Otomatis sesuai kategori</option>'];
      CONFIG.presetPosters.forEach(function (preset) {
        opts.push('<option value="' + svc.escapeHtml(preset.path) + '">' + svc.escapeHtml(preset.label) + '</option>');
      });
      el.posterPreset.innerHTML = opts.join('');
    }
  }

  function setDefaultDateInputs(forceReset) {
    var base = new Date();
    base.setDate(base.getDate() + 3);
    var dateStr = formatDateInput(base);
    if (el.startDate && (forceReset || !el.startDate.value)) el.startDate.value = dateStr;
    if (el.endDate && (forceReset || !el.endDate.value)) el.endDate.value = dateStr;
    if (el.startTime && (forceReset || !el.startTime.value)) el.startTime.value = '09:00';
    if (el.endTime && (forceReset || !el.endTime.value)) el.endTime.value = '12:00';
  }

  function buildFormattedDetails(values) {
    var lines = [];
    if (values.description) {
      lines.push(values.description.trim());
      lines.push('');
    }
    lines.push('Kategori: ' + values.categoryLabel);
    if (values.statusLabel) {
      lines.push('Status: ' + values.statusLabel);
    }
    if (values.fee) {
      lines.push('Biaya: ' + values.fee.trim());
    }
    if (values.contact) {
      lines.push('Kontak: ' + values.contact.trim());
    }
    if (values.daftarUrl) {
      lines.push('Daftar: ' + values.daftarUrl.trim());
    }
    if (values.posterUrl) {
      lines.push('Poster: ' + values.posterUrl.trim());
    }
    if (values.rundownRaw) {
      var rundownRows = values.rundownRaw
        .split(/\r?\n/)
        .map(function (r) { return r.trim(); })
        .filter(Boolean);
      if (rundownRows.length > 0) {
        lines.push('Rundown:');
        rundownRows.forEach(function (row) {
          lines.push('- ' + row);
        });
      }
    }
    return lines.join('\n').trim();
  }

  // Bangun struktur data event terpadu untuk simpan ke Google Calendar, URL template, pratinjau, maupun draft lokal.
  function buildEventPayloadData(fields) {
    var catMeta = svc.getCategoryMeta(fields.categoryId || 'seminar');
    var statusValue = fields.statusValue || 'open';
    var statusLabelMap = {
      open: 'Pendaftaran Dibuka',
      soon: 'Segera Hadir',
      closed: 'Selesai'
    };
    var isAllDay = Boolean(fields.isAllDay);
    var sDate = fields.startDate || formatDateInput(new Date());
    var eDate = fields.endDate || sDate;
    var sTime = fields.startTime || '09:00';
    var eTime = fields.endTime || '10:00';
    var startIso = isAllDay ? sDate + 'T00:00:00+07:00' : sDate + 'T' + sTime + ':00+07:00';
    var endIso = isAllDay ? eDate + 'T00:00:00+07:00' : eDate + 'T' + eTime + ':00+07:00';
    var chosenPoster = fields.posterUrl || catMeta.defaultPoster;

    var values = {
      title: (fields.title || '').trim() || 'Judul Event Kampus',
      categoryId: catMeta.id,
      categoryLabel: catMeta.labelId,
      statusValue: statusValue,
      statusLabel: statusLabelMap[statusValue] || 'Pendaftaran Dibuka',
      isAllDay: isAllDay,
      startDate: sDate,
      endDate: eDate,
      startTime: sTime,
      endTime: eTime,
      startIso: startIso,
      endIso: endIso,
      location: (fields.location || '').trim(),
      description: (fields.description || '').trim(),
      fee: (fields.fee || '').trim(),
      contact: (fields.contact || '').trim(),
      daftarUrl: (fields.daftarUrl || '').trim(),
      posterUrl: fields.posterUrl || '',
      rundownRaw: (fields.rundownRaw || '').trim()
    };

    values.formattedDetails = buildFormattedDetails(values);
    values.previewEvent = {
      id: fields.eventId || 'preview-draft',
      title: values.title,
      titleEn: values.title,
      category: values.categoryId,
      status: values.statusValue,
      startIso: startIso,
      endIso: endIso,
      isAllDay: isAllDay,
      dateKey: sDate,
      location: values.location,
      description: values.description || 'Deskripsi event akan tampil di halaman detail.',
      rawDescription: values.description,
      poster: chosenPoster,
      explicitPoster: values.posterUrl,
      posterAlt: 'Pratinjau poster ' + values.title,
      fee: values.fee || CONFIG.defaultFee.id,
      explicitFee: values.fee,
      contact: values.contact || CONFIG.defaultContactEmail,
      explicitContact: values.contact,
      daftarUrl: values.daftarUrl,
      rundown: parseRundownLines(values.rundownRaw),
      rawTemplateDetails: values.formattedDetails
    };
    return values;
  }

  function parseRundownLines(rundownRaw) {
    if (!rundownRaw) {
      return [];
    }
    return rundownRaw
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean)
      .map(function (line, idx) {
        var parts = line.split('|');
        if (parts.length >= 2) {
          return { time: parts[0].trim(), activity: parts.slice(1).join('|').trim() };
        }
        return { time: 'Sesi ' + (idx + 1), activity: line };
      });
  }

  // Gunakan nilai eksplisit dari tag deskripsi jika ada agar default tampilan tidak ikut tertulis balik ke Google Calendar.
  function getExplicitField(ev, explicitKey, fallbackKey) {
    if (!ev) {
      return '';
    }
    if (ev[explicitKey] !== undefined) {
      return ev[explicitKey] || '';
    }
    return ev[fallbackKey] || '';
  }

  function buildEventPayloadFromExisting(ev, overrides) {
    var ov = overrides || {};
    var startDt = new Date(ev.startIso);
    var endDt = new Date(ev.endIso || ev.startIso);
    var origEndDate = formatDateInput(endDt);
    if (ev.isAllDay && !Number.isNaN(endDt.getTime())) {
      var inclusive = new Date(endDt.getTime());
      inclusive.setDate(inclusive.getDate() - 1);
      if (inclusive >= startDt) {
        origEndDate = formatDateInput(inclusive);
      }
    }

    var fallbackPoster = ev.poster && ev.poster.indexOf('assets/') !== 0 ? ev.poster : '';
    return buildEventPayloadData({
      eventId: ev.id,
      title: ov.title !== undefined ? ov.title : ev.title,
      categoryId: ov.categoryId !== undefined ? ov.categoryId : ev.category,
      statusValue: ov.statusValue !== undefined ? ov.statusValue : ev.status,
      isAllDay: ov.isAllDay !== undefined ? ov.isAllDay : ev.isAllDay,
      startDate: ov.startDate !== undefined ? ov.startDate : (ev.dateKey || formatDateInput(startDt)),
      endDate: ov.endDate !== undefined ? ov.endDate : origEndDate,
      startTime: ov.startTime !== undefined ? ov.startTime : formatTimeInput(startDt),
      endTime: ov.endTime !== undefined ? ov.endTime : formatTimeInput(endDt),
      location: ov.location !== undefined ? ov.location : ev.location,
      description: ov.description !== undefined ? ov.description : getExplicitField(ev, 'rawDescription', 'description'),
      fee: ov.fee !== undefined ? ov.fee : getExplicitField(ev, 'explicitFee', 'fee'),
      contact: ov.contact !== undefined ? ov.contact : getExplicitField(ev, 'explicitContact', 'contact'),
      daftarUrl: ov.daftarUrl !== undefined ? ov.daftarUrl : ev.daftarUrl,
      posterUrl: ov.posterUrl !== undefined ? ov.posterUrl : (ev.explicitPoster !== undefined ? ev.explicitPoster : fallbackPoster),
      rundownRaw: ov.rundownRaw !== undefined
        ? ov.rundownRaw
        : (Array.isArray(ev.rundown) ? ev.rundown.map(function (r) { return r.time + ' | ' + r.activity; }).join('\n') : '')
    });
  }

  function readFormState() {
    var customPoster = el.posterCustom ? el.posterCustom.value.trim() : '';
    var presetPoster = el.posterPreset ? el.posterPreset.value.trim() : '';
    return buildEventPayloadData({
      eventId: state.editingEventId,
      title: el.title ? el.title.value : '',
      categoryId: el.category ? el.category.value : 'seminar',
      statusValue: el.status ? el.status.value : 'open',
      isAllDay: Boolean(el.allDay && el.allDay.checked),
      startDate: el.startDate ? el.startDate.value : '',
      endDate: el.endDate ? el.endDate.value : '',
      startTime: el.startTime ? el.startTime.value : '09:00',
      endTime: el.endTime ? el.endTime.value : '12:00',
      location: el.location ? el.location.value : '',
      description: el.description ? el.description.value : '',
      fee: el.fee ? el.fee.value : '',
      contact: el.contact ? el.contact.value : '',
      daftarUrl: el.daftarUrl ? el.daftarUrl.value : '',
      posterUrl: customPoster || presetPoster,
      rundownRaw: el.rundown ? el.rundown.value : ''
    });
  }

  function renderOverlapWarningInto(warnEl, data, excludeId) {
    if (!warnEl) {
      return;
    }
    var conflicts = svc.findOverlappingEvents(
      getCombinedEvents(),
      data.startIso,
      data.endIso,
      data.isAllDay,
      excludeId
    );
    if (conflicts.length === 0) {
      warnEl.className = 'admin-overlap-warn';
      warnEl.innerHTML = '';
      return;
    }

    var summary = conflicts
      .map(function (ev) {
        return svc.escapeHtml(ev.title) + ' (' + svc.escapeHtml(svc.formatDisplayDate(ev, 'id')) + ')';
      })
      .join(', ');

    warnEl.className = 'admin-overlap-warn is-visible';
    warnEl.innerHTML =
      '<strong>Peringatan Overlap (' + conflicts.length + ' jadwal bentrok):</strong> ' + summary;
  }

  function syncFormModeControls() {
    var auth = svc.getAdminAuthStatus();
    var isEditing = Boolean(state.editingEventId);

    if (el.formHeading) {
      el.formHeading.textContent = isEditing ? 'Edit Jadwal Terpilih' : 'Buat & Kirim Jadwal ke Google Calendar';
    }
    if (el.editBanner) {
      if (isEditing) {
        el.editBanner.className = 'admin-edit-banner is-visible';
        el.editBanner.innerHTML =
          '<span>Sedang mengedit jadwal ID: <code>' + svc.escapeHtml(state.editingEventId) + '</code></span>' +
          '<button type="button" class="btn btn-outline btn-compact" id="adm-cancel-edit-btn">Batal Edit</button>';
        var cancelBtn = document.getElementById('adm-cancel-edit-btn');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', cancelEditMode);
        }
      } else {
        el.editBanner.className = 'admin-edit-banner';
        el.editBanner.innerHTML = '';
      }
    }

    if (el.submitBtn) {
      if (state.isSaving) {
        el.submitBtn.textContent = 'Menyimpan ke Google Calendar...';
        el.submitBtn.disabled = true;
      } else if (auth.signedIn) {
        el.submitBtn.textContent = isEditing ? 'Simpan Perubahan ke Google Calendar' : 'Simpan Langsung ke Google Calendar';
        el.submitBtn.disabled = false;
      } else {
        el.submitBtn.textContent = isEditing ? 'Buka Salinan Template Google Calendar' : 'Buka & Simpan di Google Calendar';
        el.submitBtn.disabled = false;
      }
    }

    if (el.deleteBtn) {
      el.deleteBtn.hidden = !isEditing;
      var target = isEditing ? findEventById(state.editingEventId) : null;
      var canDelete = Boolean(isEditing && ((target && target.isLocalDraft) || auth.signedIn));
      el.deleteBtn.disabled = state.isSaving || !canDelete;
      el.deleteBtn.title = !canDelete && isEditing
        ? 'Login admin Google OAuth terlebih dahulu untuk menghapus jadwal Google Calendar langsung.'
        : '';
    }
  }

  function updatePreview() {
    var data = readFormState();
    if (el.startTime && el.endTime) {
      el.startTime.disabled = data.isAllDay;
      el.endTime.disabled = data.isAllDay;
    }
    if (el.detailsOutput) {
      el.detailsOutput.value = data.formattedDetails;
    }
    if (el.cardPreview) {
      el.cardPreview.innerHTML = ui.renderEventCard(data.previewEvent, {
        lang: ui.getCurrentLang(),
        previewOnly: true
      });
      ui.attachImageFallbacks(el.cardPreview);
    }
    renderOverlapWarningInto(el.overlapWarn, data, state.editingEventId);
    syncFormModeControls();
  }

  function showActionFeedback(message, isError, fallbackHref) {
    if (!el.feedback) {
      return;
    }
    el.feedback.className = 'admin-feedback ' + (isError ? 'admin-feedback--error' : 'admin-feedback--ok');
    if (fallbackHref) {
      el.feedback.innerHTML =
        svc.escapeHtml(message) +
        ' <a class="inline-link" href="' + svc.escapeHtml(fallbackHref) + '" target="_blank" rel="noopener">Buka tautan Google Calendar</a>';
    } else {
      el.feedback.textContent = message;
    }
  }

  function showToast(message, options) {
    if (!el.toast) {
      return;
    }
    var opts = options || {};
    el.toast.hidden = false;
    el.toast.className = 'admin-toast' + (opts.isError ? ' is-error' : '');

    var actionsHtml = '';
    if (opts.undoAvailable && state.lastUndo) {
      actionsHtml += '<button type="button" class="btn btn-outline btn-compact" id="admin-toast-undo">Urungkan</button>';
    }
    if (opts.gcalHref) {
      actionsHtml += '<a class="btn btn-outline btn-compact" href="' + svc.escapeHtml(opts.gcalHref) + '" target="_blank" rel="noopener">Buka di Google Calendar</a>';
    }
    actionsHtml += '<button type="button" class="tl-icon-btn admin-toast__close" id="admin-toast-close" aria-label="Tutup notifikasi">&times;</button>';

    el.toast.innerHTML =
      '<span class="admin-toast__msg">' + svc.escapeHtml(message) + '</span>' +
      '<div class="admin-toast__actions">' + actionsHtml + '</div>';

    var undoBtn = document.getElementById('admin-toast-undo');
    if (undoBtn) {
      undoBtn.addEventListener('click', handleUndoLastAction);
    }
    var closeBtn = document.getElementById('admin-toast-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        el.toast.hidden = true;
      });
    }
  }

  function validateEventTiming(title, data) {
    if (!String(title || '').trim()) {
      return 'Isi Judul Event terlebih dahulu sebelum menyimpan.';
    }
    if (!data.startDate || !data.endDate) {
      return 'Tanggal mulai dan tanggal selesai wajib diisi.';
    }
    var startMs = new Date(data.startIso).getTime();
    var endMs = new Date(data.endIso).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
      return 'Waktu selesai tidak boleh lebih awal dari waktu mulai.';
    }
    if (!data.isAllDay && data.startDate === data.endDate && endMs === startMs) {
      return 'Jam selesai harus lebih lambat dari jam mulai.';
    }
    return '';
  }

  function applyEventToFullForm(ev) {
    if (!ev) {
      return;
    }
    state.editingEventId = ev.id;
    state.selectedDateKey = ev.dateKey || state.selectedDateKey;

    if (el.title) el.title.value = ev.title || '';
    if (el.category) el.category.value = ev.category || 'umum';
    if (el.status) el.status.value = ev.status || 'open';
    if (el.allDay) el.allDay.checked = Boolean(ev.isAllDay);
    if (el.location) el.location.value = ev.location || '';
    if (el.description) el.description.value = getExplicitField(ev, 'rawDescription', 'description');
    if (el.fee) el.fee.value = getExplicitField(ev, 'explicitFee', 'fee');
    if (el.contact) el.contact.value = getExplicitField(ev, 'explicitContact', 'contact');
    if (el.daftarUrl) el.daftarUrl.value = ev.daftarUrl || '';

    var startDt = new Date(ev.startIso);
    var endDt = new Date(ev.endIso || ev.startIso);
    if (!Number.isNaN(startDt.getTime())) {
      el.startDate.value = formatDateInput(startDt);
      el.startTime.value = formatTimeInput(startDt);
    }
    if (!Number.isNaN(endDt.getTime())) {
      if (ev.isAllDay) {
        var inclusiveEnd = new Date(endDt.getTime());
        inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
        el.endDate.value = inclusiveEnd >= startDt ? formatDateInput(inclusiveEnd) : formatDateInput(startDt);
      } else {
        el.endDate.value = formatDateInput(endDt);
        el.endTime.value = formatTimeInput(endDt);
      }
    }

    var matchedPreset = CONFIG.presetPosters.some(function (p) {
      return p.path === ev.poster;
    });
    if (matchedPreset && el.posterPreset) {
      el.posterPreset.value = ev.poster;
      if (el.posterCustom) el.posterCustom.value = '';
    } else if (el.posterCustom) {
      el.posterPreset.value = '';
      el.posterCustom.value = ev.poster || '';
    }

    if (el.rundown) {
      el.rundown.value = Array.isArray(ev.rundown)
        ? ev.rundown.map(function (r) { return r.time + ' | ' + r.activity; }).join('\n')
        : '';
    }
    updatePreview();
  }

  function loadEventIntoFullForm(eventId) {
    var ev = findEventById(eventId);
    if (!ev) {
      return;
    }
    applyEventToFullForm(ev);
    renderAdminTimeline();
    showActionFeedback('Jadwal "' + ev.title + '" dimuat ke formulir lengkap.', false);
    if (el.title) {
      el.title.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.title.focus();
    }
  }

  function cancelEditMode() {
    state.editingEventId = '';
    el.form.reset();
    setDefaultDateInputs(true);
    updatePreview();
    showActionFeedback('Mode edit dibatalkan. Formulir siap untuk membuat jadwal baru.', false);
  }

  function buildGoogleTemplateHref(data) {
    var preview = Object.assign({}, data.previewEvent);
    if (preview.isAllDay) {
      var exclusiveEnd = new Date(data.endDate + 'T00:00:00');
      exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
      preview.endIso = formatDateInput(exclusiveEnd) + 'T00:00:00+07:00';
    }
    return ics.buildGoogleCalendarAddUrl(preview);
  }

  function upsertLocalDraft(data, existingEvent) {
    var prevSnapshot = state.localDrafts.slice();
    var isExistingBase = existingEvent && !existingEvent.isLocalDraft;
    var draftId = existingEvent ? existingEvent.id : ('draft-' + Date.now());
    var draftObj = Object.assign({}, existingEvent || {}, data.previewEvent, {
      id: draftId,
      baseEventId: existingEvent ? (existingEvent.baseEventId || (isExistingBase ? existingEvent.id : '')) : '',
      isLocalDraft: true,
      dateKey: data.startDate,
      displayDate: svc.formatDisplayDate(data.previewEvent, 'id')
    });

    if (data.isAllDay) {
      var exc = new Date(data.endDate + 'T00:00:00');
      exc.setDate(exc.getDate() + 1);
      draftObj.endIso = formatDateInput(exc) + 'T00:00:00+07:00';
    }

    var idx = state.localDrafts.findIndex(function (d) {
      return String(d.id) === String(draftId);
    });
    if (idx >= 0) {
      state.localDrafts[idx] = draftObj;
    } else {
      state.localDrafts.push(draftObj);
    }
    saveStoredDrafts();

    state.lastUndo = {
      type: 'draft',
      previousDrafts: prevSnapshot
    };
    return draftObj;
  }

  function renderQuickCategoryChips() {
    if (!el.qmCatChips) {
      return;
    }
    el.qmCatChips.innerHTML = CONFIG.categories
      .map(function (cat) {
        var active = state.qmCategory === cat.id;
        return (
          '<button type="button" class="qm-cat-chip' + (active ? ' is-active' : '') + '" ' +
          'data-qm-cat="' + svc.escapeHtml(cat.id) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
            '<span class="tl-legend-swatch tl-swatch--' + svc.escapeHtml(cat.id) + '" aria-hidden="true"></span>' +
            '<span>' + svc.escapeHtml(cat.labelId) + '</span>' +
          '</button>'
        );
      })
      .join('');
  }

  function readQuickModalPayload() {
    var base = state.qmBaseEvent;
    return buildEventPayloadData({
      eventId: state.qmEditingEventId,
      title: el.qmTitle ? el.qmTitle.value : '',
      categoryId: state.qmCategory,
      statusValue: base ? base.status : 'open',
      isAllDay: Boolean(el.qmAllDay && el.qmAllDay.checked),
      startDate: el.qmStartDate ? el.qmStartDate.value : state.selectedDateKey,
      endDate: el.qmEndDate ? el.qmEndDate.value : state.selectedDateKey,
      startTime: el.qmStartTime ? el.qmStartTime.value : '09:00',
      endTime: el.qmEndTime ? el.qmEndTime.value : '10:00',
      location: el.qmLocation ? el.qmLocation.value : '',
      description: el.qmDescription ? el.qmDescription.value : '',
      fee: getExplicitField(base, 'explicitFee', 'fee'),
      contact: getExplicitField(base, 'explicitContact', 'contact'),
      daftarUrl: base ? base.daftarUrl : '',
      posterUrl: base && base.explicitPoster !== undefined
        ? base.explicitPoster
        : (base && base.poster && base.poster.indexOf('assets/') !== 0 ? base.poster : ''),
      rundownRaw: base && Array.isArray(base.rundown)
        ? base.rundown.map(function (r) { return r.time + ' | ' + r.activity; }).join('\n')
        : ''
    });
  }

  function syncQuickModalState() {
    if (!el.qmForm) {
      return;
    }
    var isAllDay = Boolean(el.qmAllDay && el.qmAllDay.checked);
    if (el.qmStartTime && el.qmEndTime) {
      el.qmStartTime.disabled = isAllDay;
      el.qmEndTime.disabled = isAllDay;
    }
    if (el.qmDurationBar) {
      el.qmDurationBar.hidden = isAllDay;
    }

    var data = readQuickModalPayload();
    renderOverlapWarningInto(el.qmOverlapWarn, data, state.qmEditingEventId);

    if (el.qmGcalLink) {
      el.qmGcalLink.href = buildGoogleTemplateHref(data);
    }

    var auth = svc.getAdminAuthStatus();
    if (el.qmSyncNote) {
      el.qmSyncNote.textContent = auth.signedIn
        ? 'Login OAuth Google aktif: perubahan langsung tersimpan ke Google Calendar.'
        : 'Mode Pratinjau Lokal (OAuth belum login): tombol Simpan mencatat draft di kalender ini; klik "Buka di Google Calendar" untuk menerbitkan.';
    }
    if (el.qmSaveBtn) {
      if (auth.signedIn) {
        el.qmSaveBtn.textContent = state.qmBaseEvent && state.qmBaseEvent.isLocalDraft
          ? 'Kirim Draft ke Google Calendar'
          : (state.qmEditingEventId ? 'Simpan Perubahan' : 'Simpan ke Google Calendar');
      } else {
        el.qmSaveBtn.textContent = state.qmEditingEventId ? 'Simpan Perubahan Draft' : 'Simpan Draft di Kalender';
      }
    }
  }

  function openQuickModalForCreate(slot) {
    if (!el.qmDialog) {
      return;
    }
    var dateKey = (slot && slot.dateKey) || state.selectedDateKey;
    var startMin = slot && typeof slot.startMin === 'number' ? slot.startMin : 9 * 60;
    var endMin = slot && typeof slot.endMin === 'number' ? slot.endMin : 10 * 60;
    var isAllDay = Boolean(slot && slot.isAllDay);

    state.selectedDateKey = dateKey;
    state.qmEditingEventId = '';
    state.qmBaseEvent = null;
    state.qmCategory = 'seminar';
    state.activeSelection = isAllDay ? null : { dateKey: dateKey, startMin: startMin, endMin: endMin };

    if (el.qmHeading) el.qmHeading.textContent = 'Buat Event Baru';
    if (el.qmDraftBadge) el.qmDraftBadge.hidden = true;
    if (el.qmDeleteBtn) el.qmDeleteBtn.hidden = true;
    if (el.qmError) {
      el.qmError.className = 'admin-feedback';
      el.qmError.textContent = '';
    }

    if (el.qmTitle) el.qmTitle.value = '';
    if (el.qmAllDay) el.qmAllDay.checked = isAllDay;
    if (el.qmStartDate) el.qmStartDate.value = dateKey;
    if (el.qmEndDate) el.qmEndDate.value = dateKey;
    if (el.qmStartTime) el.qmStartTime.value = tl.formatMinutesColon(startMin);
    if (el.qmEndTime) el.qmEndTime.value = tl.formatMinutesColon(endMin);
    if (el.qmLocation) el.qmLocation.value = '';
    if (el.qmDescription) el.qmDescription.value = '';

    renderQuickCategoryChips();
    syncQuickModalState();
    renderAdminTimeline();

    if (!el.qmDialog.open && typeof el.qmDialog.showModal === 'function') {
      el.qmDialog.showModal();
    }
    if (el.qmTitle) {
      el.qmTitle.focus();
    }
  }

  function openQuickModalForEdit(eventId) {
    var ev = findEventById(eventId);
    if (!ev || !el.qmDialog) {
      return;
    }
    state.qmEditingEventId = ev.id;
    state.qmBaseEvent = ev;
    state.qmCategory = ev.category || 'seminar';
    state.activeSelection = null;

    var startDt = new Date(ev.startIso);
    var endDt = new Date(ev.endIso || ev.startIso);
    var endDateVal = formatDateInput(endDt);
    if (ev.isAllDay && !Number.isNaN(endDt.getTime())) {
      var inclusive = new Date(endDt.getTime());
      inclusive.setDate(inclusive.getDate() - 1);
      if (inclusive >= startDt) {
        endDateVal = formatDateInput(inclusive);
      }
    }

    if (el.qmHeading) el.qmHeading.textContent = 'Edit Jadwal';
    if (el.qmDraftBadge) el.qmDraftBadge.hidden = !ev.isLocalDraft;
    if (el.qmDeleteBtn) {
      var auth = svc.getAdminAuthStatus();
      el.qmDeleteBtn.hidden = !(ev.isLocalDraft || auth.signedIn);
    }
    if (el.qmError) {
      el.qmError.className = 'admin-feedback';
      el.qmError.textContent = '';
    }

    if (el.qmTitle) el.qmTitle.value = ev.title || '';
    if (el.qmAllDay) el.qmAllDay.checked = Boolean(ev.isAllDay);
    if (el.qmStartDate) el.qmStartDate.value = formatDateInput(startDt);
    if (el.qmEndDate) el.qmEndDate.value = endDateVal;
    if (el.qmStartTime) el.qmStartTime.value = formatTimeInput(startDt);
    if (el.qmEndTime) el.qmEndTime.value = formatTimeInput(endDt);
    if (el.qmLocation) el.qmLocation.value = ev.location || '';
    if (el.qmDescription) el.qmDescription.value = getExplicitField(ev, 'rawDescription', 'description');

    renderQuickCategoryChips();
    syncQuickModalState();

    if (!el.qmDialog.open && typeof el.qmDialog.showModal === 'function') {
      el.qmDialog.showModal();
    }
    if (el.qmTitle) {
      el.qmTitle.focus();
    }
  }

  function closeQuickModal() {
    state.activeSelection = null;
    if (el.qmDialog && el.qmDialog.open) {
      el.qmDialog.close();
    }
    renderAdminTimeline();
  }

  function adjustQuickModalDuration(deltaMinutes) {
    if (!el.qmStartDate || !el.qmStartTime || !el.qmEndDate || !el.qmEndTime) {
      return;
    }
    var startMs = new Date(el.qmStartDate.value + 'T' + (el.qmStartTime.value || '09:00') + ':00').getTime();
    var endMs = new Date(el.qmEndDate.value + 'T' + (el.qmEndTime.value || '10:00') + ':00').getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return;
    }
    var nextEndMs = Math.max(startMs + 15 * 60000, endMs + deltaMinutes * 60000);
    var nextEndDt = new Date(nextEndMs);
    el.qmEndDate.value = formatDateInput(nextEndDt);
    el.qmEndTime.value = formatTimeInput(nextEndDt);
    syncQuickModalState();
  }

  async function handleQuickModalSubmit(e) {
    e.preventDefault();
    var data = readQuickModalPayload();
    var rawTitle = el.qmTitle ? el.qmTitle.value : '';
    var errMsg = validateEventTiming(rawTitle, data);
    if (errMsg) {
      if (el.qmError) {
        el.qmError.className = 'admin-feedback admin-feedback--error';
        el.qmError.textContent = errMsg;
      }
      return;
    }

    var auth = svc.getAdminAuthStatus();
    if (auth.signedIn) {
      state.isSaving = true;
      if (el.qmSaveBtn) el.qmSaveBtn.disabled = true;
      try {
        var liveTargetId = state.qmBaseEvent
          ? (state.qmBaseEvent.baseEventId || (!state.qmBaseEvent.isLocalDraft ? state.qmEditingEventId : ''))
          : '';
        if (liveTargetId) {
          await svc.updateGoogleEvent(liveTargetId, data);
          if (state.qmBaseEvent && state.qmBaseEvent.isLocalDraft) {
            removeDraftById(state.qmEditingEventId);
          }
          showToast('Perubahan "' + data.title + '" disimpan ke Google Calendar.');
        } else {
          await svc.createGoogleEvent(data);
          if (state.qmEditingEventId) {
            removeDraftById(state.qmEditingEventId);
          }
          showToast('Jadwal baru "' + data.title + '" disimpan ke Google Calendar.');
        }
        state.selectedDateKey = data.startDate;
        closeQuickModal();
        await loadConnectedSchedule(true);
      } catch (err) {
        if (el.qmError) {
          el.qmError.className = 'admin-feedback admin-feedback--error';
          el.qmError.textContent = 'Gagal menyimpan: ' + (err && err.message ? err.message : 'Error');
        }
      } finally {
        state.isSaving = false;
        if (el.qmSaveBtn) el.qmSaveBtn.disabled = false;
      }
      return;
    }

    var savedDraft = upsertLocalDraft(data, state.qmBaseEvent);
    applyEventToFullForm(savedDraft);
    state.selectedDateKey = data.startDate;
    closeQuickModal();
    renderConnectedList();
    renderAdminTimeline();
    showToast('Draft lokal "' + data.title + '" tersimpan di kalender.', {
      undoAvailable: true,
      gcalHref: buildGoogleTemplateHref(data)
    });
  }

  function removeDraftById(draftId) {
    var prev = state.localDrafts.slice();
    state.localDrafts = state.localDrafts.filter(function (d) {
      return String(d.id) !== String(draftId);
    });
    saveStoredDrafts();
    return prev;
  }

  async function handleDirectTimeChange(info, actionLabel) {
    var ev = findEventById(info.eventId);
    if (!ev) {
      return;
    }
    var newStartTime = tl.formatMinutesColon(info.startMin);
    var newEndTime = tl.formatMinutesColon(info.endMin);
    var data = buildEventPayloadFromExisting(ev, {
      startDate: info.dateKey,
      endDate: info.dateKey,
      startTime: newStartTime,
      endTime: newEndTime,
      isAllDay: false
    });

    var prevData = buildEventPayloadFromExisting(ev);
    var auth = svc.getAdminAuthStatus();
    var gcalHref = buildGoogleTemplateHref(data);
    var msg = actionLabel + ': "' + ev.title + '" -> ' + info.dateKey + ' (' + newStartTime + ' - ' + newEndTime + ').';

    if (auth.signedIn && !ev.isLocalDraft) {
      state.lastUndo = { type: 'google-update', eventId: ev.id, previousData: prevData };
      try {
        await svc.updateGoogleEvent(ev.id, data);
        await loadConnectedSchedule(true);
        showToast(msg, { undoAvailable: true });
      } catch (err) {
        showToast('Gagal memperbarui Google Calendar: ' + (err && err.message ? err.message : 'Error'), { isError: true });
      }
      return;
    }

    upsertLocalDraft(data, ev);
    if (String(state.editingEventId) === String(ev.id)) {
      applyEventToFullForm(findEventById(ev.id));
    }
    renderConnectedList();
    renderAdminTimeline();
    showToast(msg + ' (Draft Lokal)', {
      undoAvailable: true,
      gcalHref: gcalHref
    });
  }

  async function handleUndoLastAction() {
    var undo = state.lastUndo;
    if (!undo) {
      return;
    }
    state.lastUndo = null;
    if (undo.type === 'draft') {
      state.localDrafts = undo.previousDrafts || [];
      saveStoredDrafts();
      renderConnectedList();
      renderAdminTimeline();
      showToast('Perubahan draft dibatalkan.');
      return;
    }
    if (undo.type === 'google-update') {
      try {
        await svc.updateGoogleEvent(undo.eventId, undo.previousData);
        await loadConnectedSchedule(true);
        showToast('Perubahan jadwal dikembalikan ke waktu semula.');
      } catch (err) {
        showToast('Gagal membatalkan perubahan: ' + (err && err.message ? err.message : 'Error'), { isError: true });
      }
    }
  }

  function renderAdminTimeline() {
    if (!el.timelineMount || !state.payload || !tl) {
      return;
    }
    tl.setHandlers(el.timelineMount, {
      onSelectDate: function (dateKey) {
        state.selectedDateKey = dateKey;
        var dt = tl.parseYmd(dateKey);
        state.miniYear = dt.getFullYear();
        state.miniMonth = dt.getMonth();
        renderAdminTimeline();
      },
      onStepMiniMonth: function (delta) {
        var next = new Date(state.miniYear, state.miniMonth + delta, 1);
        state.miniYear = next.getFullYear();
        state.miniMonth = next.getMonth();
        renderAdminTimeline();
      },
      onStepRange: function (delta) {
        var stepDays = state.viewMode === 'week' ? delta * 7 : delta;
        var nextKey = tl.addDays(state.selectedDateKey, stepDays);
        var dt = tl.parseYmd(nextKey);
        state.selectedDateKey = nextKey;
        state.miniYear = dt.getFullYear();
        state.miniMonth = dt.getMonth();
        renderAdminTimeline();
      },
      onSelectToday: function () {
        var now = new Date();
        state.selectedDateKey = svc.toLocalDateKey(now);
        state.miniYear = now.getFullYear();
        state.miniMonth = now.getMonth();
        renderAdminTimeline();
      },
      onSwitchViewMode: function (mode) {
        state.viewMode = mode === 'day' ? 'day' : 'week';
        renderAdminTimeline();
      },
      onToggleSidebar: function (isOpen) {
        state.sidebarExpanded = Boolean(isOpen);
      },
      onToggleCategory: function (catId) {
        state.hiddenCategories[catId] = !state.hiddenCategories[catId];
        renderAdminTimeline();
      },
      onCreateButton: function () {
        openQuickModalForCreate({
          dateKey: state.selectedDateKey,
          startMin: 9 * 60,
          endMin: 10 * 60,
          isAllDay: false
        });
      },
      onQuickCreateSlot: function (slot) {
        openQuickModalForCreate(slot);
      },
      onSelectEvent: function (eventId) {
        openQuickModalForEdit(eventId);
      },
      onMoveEvent: function (info) {
        handleDirectTimeChange(info, 'Jadwal dipindahkan');
      },
      onResizeEvent: function (info) {
        handleDirectTimeChange(info, 'Durasi jadwal diubah');
      }
    });

    tl.renderTimeline(el.timelineMount, {
      events: getCombinedEvents(),
      selectedDateKey: state.selectedDateKey,
      miniYear: state.miniYear,
      miniMonth: state.miniMonth,
      viewMode: state.viewMode,
      sidebarExpanded: state.sidebarExpanded,
      hiddenCategories: state.hiddenCategories,
      activeSelection: state.activeSelection,
      mode: 'admin'
    });
  }

  function renderStatusSummary() {
    if (!el.statusSummary || !state.payload) {
      return;
    }
    var events = getCombinedEvents();
    var draftCount = state.localDrafts.length;
    var isLive = state.payload.source === 'google';
    var auth = svc.getAdminAuthStatus();

    var statusLabel = isLive
      ? 'Terhubung Live ke Google Calendar API'
      : (state.payload.source === 'fallback-error'
        ? 'Gagal Terhubung ke Google Calendar (Memakai Data Contoh Lokal)'
        : 'Mode Siap Pakai (Data Contoh Lokal)');

    var authNote = '';
    var authBtnHtml = '';
    if (!auth.protocolSupported) {
      authNote = 'Login OAuth Google butuh Live Server / GitHub Pages (http/https); mode template & draft lokal aktif.';
    } else if (!auth.configured) {
      authNote = 'OAuth Admin belum aktif: drag & quick-edit tersimpan sebagai Draft Lokal, atau klik Buka di Google Calendar untuk terbitkan.';
      authBtnHtml = '<a class="btn btn-outline btn-compact" href="#setup-gcal">Setup OAuth Client ID</a>';
    } else if (auth.signedIn) {
      authNote = 'Sesi Login Admin Google OAuth aktif (Create, Drag Move/Resize, dan Delete langsung aktif).';
      authBtnHtml =
        '<button type="button" class="btn btn-outline btn-compact" id="admin-oauth-switch-btn">Ganti Akun Google</button>' +
        '<button type="button" class="btn btn-outline btn-compact" id="admin-oauth-logout-btn">Keluar Sesi Google</button>';
    } else {
      var currentOrigin = window.location && window.location.origin ? window.location.origin : '';
      authNote = 'Klik Masuk dengan Google untuk memilih akun admin. Pastikan origin saat ini (' + currentOrigin + ') terdaftar persis di Authorized JavaScript origins Google Cloud Console.';
      authBtnHtml = '<button type="button" class="btn btn-accent btn-compact" id="admin-oauth-login-btn">Masuk dengan Google (Admin)</button>';
    }

    el.statusSummary.innerHTML =
      '<div class="admin-status-row">' +
        '<div>' +
          '<p class="admin-status-title">' + svc.escapeHtml(statusLabel) + '</p>' +
          '<p class="admin-status-meta">' +
            'Total agenda terbaca: <strong>' + events.length + '</strong> event' +
            (draftCount > 0 ? ' (' + draftCount + ' draft lokal)' : '') +
            (state.payload.errorMessage ? ' · Error: ' + svc.escapeHtml(state.payload.errorMessage) : '') +
          '</p>' +
          '<p class="admin-status-meta">' + svc.escapeHtml(authNote) + '</p>' +
        '</div>' +
        '<div class="admin-status-actions">' +
          authBtnHtml +
          (auth.signedIn && draftCount > 0
            ? '<button type="button" class="btn btn-accent btn-compact" id="admin-publish-drafts-btn">Kirim ' + draftCount + ' Draft ke Google Calendar</button>'
            : '') +
          (draftCount > 0
            ? '<button type="button" class="btn btn-outline btn-compact" id="admin-clear-drafts-btn">Bersihkan Draft Lokal</button>'
            : '') +
          '<button type="button" class="btn btn-outline btn-compact" id="admin-refresh-btn">Muat Ulang Data</button>' +
          '<a class="btn btn-outline btn-compact" href="https://calendar.google.com/" target="_blank" rel="noopener">Buka Google Calendar</a>' +
        '</div>' +
      '</div>';

    var refreshBtn = document.getElementById('admin-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        loadConnectedSchedule(true);
      });
    }

    var clearDraftsBtn = document.getElementById('admin-clear-drafts-btn');
    if (clearDraftsBtn) {
      clearDraftsBtn.addEventListener('click', function () {
        state.localDrafts = [];
        saveStoredDrafts();
        renderConnectedList();
        renderAdminTimeline();
        showToast('Semua draft lokal dihapus dari sesi ini.');
      });
    }

    var publishDraftsBtn = document.getElementById('admin-publish-drafts-btn');
    if (publishDraftsBtn) {
      publishDraftsBtn.addEventListener('click', publishAllLocalDrafts);
    }

    var loginBtn = document.getElementById('admin-oauth-login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', function () {
        handleAdminLogin();
      });
    }

    var switchBtn = document.getElementById('admin-oauth-switch-btn');
    if (switchBtn) {
      switchBtn.addEventListener('click', function () {
        handleAdminLogin();
      });
    }

    var logoutBtn = document.getElementById('admin-oauth-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        svc.signOutAdmin();
        renderStatusSummary();
        syncFormModeControls();
        renderConnectedList();
        showActionFeedback('Sesi admin Google OAuth telah ditutup.', false);
      });
    }
  }

  async function publishAllLocalDrafts() {
    if (!svc.getAdminAuthStatus().signedIn || state.localDrafts.length === 0 || state.isSaving) {
      return;
    }
    state.isSaving = true;
    var drafts = state.localDrafts.slice();
    var sentCount = 0;
    try {
      for (var i = 0; i < drafts.length; i++) {
        var draft = drafts[i];
        var payload = buildEventPayloadFromExisting(draft);
        if (draft.baseEventId) {
          await svc.updateGoogleEvent(draft.baseEventId, payload);
        } else {
          await svc.createGoogleEvent(payload);
        }
        removeDraftById(draft.id);
        sentCount += 1;
      }
      showToast(sentCount + ' draft lokal berhasil dikirim ke Google Calendar.');
      await loadConnectedSchedule(true);
    } catch (err) {
      showToast('Sebagian draft gagal dikirim (' + sentCount + ' terkirim): ' + (err && err.message ? err.message : 'Error'), { isError: true });
      renderConnectedList();
      renderAdminTimeline();
    } finally {
      state.isSaving = false;
      syncFormModeControls();
    }
  }

  async function handleAdminLogin() {
    try {
      await svc.requestAdminToken({ silent: false });
      renderStatusSummary();
      syncFormModeControls();
      var draftCount = state.localDrafts.length;
      showToast(draftCount > 0
        ? 'Login admin Google berhasil. Klik "Kirim ' + draftCount + ' Draft ke Google Calendar" di atas atau seret di kalender untuk membuat jadwal baru.'
        : 'Login admin Google berhasil. Create, Drag Move/Resize, dan Delete langsung aktif.');
      await loadConnectedSchedule(true);
    } catch (err) {
      showToast('Login Google gagal: ' + (err && err.message ? err.message : 'Dibatalkan.'), { isError: true });
    }
  }

  async function handleDeleteEvent(eventId) {
    var target = findEventById(eventId);
    var label = target ? target.title : eventId;

    if (target && target.isLocalDraft) {
      if (!window.confirm('Hapus draft lokal "' + label + '" dari pratinjau kalender?')) {
        return;
      }
      var prev = removeDraftById(eventId);
      state.lastUndo = { type: 'draft', previousDrafts: prev };
      if (state.editingEventId === eventId) {
        state.editingEventId = '';
        el.form.reset();
        setDefaultDateInputs(true);
      }
      closeQuickModal();
      renderConnectedList();
      renderAdminTimeline();
      updatePreview();
      showToast('Draft lokal "' + label + '" dihapus.', { undoAvailable: true });
      return;
    }

    if (!svc.getAdminAuthStatus().signedIn) {
      showActionFeedback('Silakan klik "Masuk dengan Google (Admin)" terlebih dahulu untuk menghapus jadwal.', true);
      return;
    }
    if (!window.confirm('Hapus jadwal "' + label + '" dari Google Calendar? Tindakan ini tidak dapat dibatalkan.')) {
      return;
    }

    state.isSaving = true;
    syncFormModeControls();
    try {
      await svc.deleteGoogleEvent(eventId);
      if (state.editingEventId === eventId) {
        state.editingEventId = '';
        el.form.reset();
        setDefaultDateInputs(true);
      }
      closeQuickModal();
      showToast('Jadwal "' + label + '" berhasil dihapus dari Google Calendar.');
      await loadConnectedSchedule(true);
    } catch (err) {
      showActionFeedback('Gagal menghapus jadwal: ' + (err && err.message ? err.message : 'Error'), true);
    } finally {
      state.isSaving = false;
      updatePreview();
    }
  }

  function renderConnectedList() {
    if (!el.connectedList || !state.payload) {
      return;
    }
    var lang = ui.getCurrentLang();
    var events = getCombinedEvents();
    var auth = svc.getAdminAuthStatus();
    renderStatusSummary();

    if (events.length === 0) {
      ui.renderStatusState(el.connectedList, {
        type: 'empty',
        title: 'Belum ada event terjadwal di kalender.',
        message: 'Seret pada kalender di atas atau klik tombol "+ Buat Event" untuk membuat jadwal pertama.'
      });
      return;
    }

    el.connectedList.innerHTML =
      '<div class="admin-event-table-wrap">' +
        '<table class="admin-event-table">' +
          '<thead><tr>' +
            '<th scope="col">Judul Event</th>' +
            '<th scope="col">Waktu</th>' +
            '<th scope="col">Kategori</th>' +
            '<th scope="col">Aksi</th>' +
          '</tr></thead>' +
          '<tbody>' +
            events.map(function (ev) {
              var catMeta = svc.getCategoryMeta(ev.category);
              var statusMeta = ui.getStatusMeta(ev.status);
              var canDelete = Boolean(ev.isLocalDraft || auth.signedIn);
              return (
                '<tr>' +
                  '<td><strong>' + svc.escapeHtml(ui.getEventTitle(ev, lang)) + '</strong>' +
                    (ev.isLocalDraft ? ' <span class="tl-tag tl-tag--draft">Draft Lokal</span>' : '') +
                    '<br><span class="table-sub">' + svc.escapeHtml(ev.location || '-') + '</span></td>' +
                  '<td>' + svc.escapeHtml(svc.formatDisplayDate(ev, lang)) + '</td>' +
                  '<td><span class="badge badge--cat">' + svc.escapeHtml(catMeta.labelId) + '</span> <span class="badge ' + statusMeta.className + '">' + svc.escapeHtml(statusMeta.label) + '</span></td>' +
                  '<td class="table-actions">' +
                    '<button type="button" class="btn btn-outline btn-compact" data-edit-id="' + svc.escapeHtml(ev.id) + '">Edit</button>' +
                    (!ev.isLocalDraft
                      ? '<a class="btn btn-outline btn-compact" href="' + svc.escapeHtml(ui.getDetailHref(ev)) + '">Detail</a>'
                      : '<a class="btn btn-outline btn-compact" href="' + svc.escapeHtml(ics.buildGoogleCalendarAddUrl(ev)) + '" target="_blank" rel="noopener">Google Calendar</a>') +
                    (canDelete
                      ? '<button type="button" class="btn btn-outline btn-compact btn-danger-outline" data-delete-id="' + svc.escapeHtml(ev.id) + '">Hapus</button>'
                      : '') +
                  '</td>' +
                '</tr>'
              );
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
  }

  async function loadConnectedSchedule(forceRefresh) {
    if (el.connectedList) {
      ui.renderStatusState(el.connectedList, {
        type: 'loading',
        title: ui.t('loadingEvents')
      });
    }
    state.payload = await svc.getEvents({ forceRefresh: Boolean(forceRefresh) });
    renderConnectedList();
    renderAdminTimeline();
    updatePreview();
  }

  function bindQuickModalEvents() {
    if (!el.qmDialog || !el.qmForm) {
      return;
    }
    if (el.qmCloseBtn) {
      el.qmCloseBtn.addEventListener('click', closeQuickModal);
    }
    el.qmDialog.addEventListener('cancel', function (e) {
      e.preventDefault();
      closeQuickModal();
    });
    el.qmDialog.addEventListener('click', function (e) {
      if (e.target !== el.qmDialog || (e.clientX === 0 && e.clientY === 0)) {
        return;
      }
      var card = el.qmDialog.querySelector('.qm-card');
      if (!card) {
        closeQuickModal();
        return;
      }
      var r = card.getBoundingClientRect();
      var insideCard = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!insideCard) {
        closeQuickModal();
      }
    });
    if (el.qmCatChips) {
      el.qmCatChips.addEventListener('click', function (e) {
        var chip = e.target.closest('button[data-qm-cat]');
        if (!chip) {
          return;
        }
        state.qmCategory = chip.getAttribute('data-qm-cat') || 'seminar';
        renderQuickCategoryChips();
        syncQuickModalState();
      });
    }
    if (el.qmDurationBar) {
      el.qmDurationBar.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-qm-dur]');
        if (!btn) {
          return;
        }
        adjustQuickModalDuration(Number(btn.getAttribute('data-qm-dur')));
      });
    }
    el.qmForm.addEventListener('input', syncQuickModalState);
    el.qmForm.addEventListener('change', syncQuickModalState);
    el.qmForm.addEventListener('submit', handleQuickModalSubmit);

    if (el.qmMoreBtn) {
      el.qmMoreBtn.addEventListener('click', function () {
        var data = readQuickModalPayload();
        var mergedPreview = Object.assign({}, state.qmBaseEvent || {}, data.previewEvent, {
          id: state.qmEditingEventId || ''
        });
        applyEventToFullForm(mergedPreview);
        state.editingEventId = state.qmEditingEventId;
        updatePreview();
        closeQuickModal();
        var section = document.getElementById('admin-full-form-section');
        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (el.title) {
          el.title.focus();
        }
      });
    }

    if (el.qmDeleteBtn) {
      el.qmDeleteBtn.addEventListener('click', function () {
        if (state.qmEditingEventId) {
          handleDeleteEvent(state.qmEditingEventId);
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    el.form = document.getElementById('admin-event-form');
    el.formHeading = document.getElementById('admin-form-heading');
    el.editBanner = document.getElementById('admin-edit-banner');
    el.overlapWarn = document.getElementById('adm-overlap-warning');
    el.title = document.getElementById('adm-title');
    el.category = document.getElementById('adm-category');
    el.status = document.getElementById('adm-status');
    el.allDay = document.getElementById('adm-allday');
    el.startDate = document.getElementById('adm-start-date');
    el.startTime = document.getElementById('adm-start-time');
    el.endDate = document.getElementById('adm-end-date');
    el.endTime = document.getElementById('adm-end-time');
    el.location = document.getElementById('adm-location');
    el.description = document.getElementById('adm-description');
    el.fee = document.getElementById('adm-fee');
    el.contact = document.getElementById('adm-contact');
    el.daftarUrl = document.getElementById('adm-daftar');
    el.posterPreset = document.getElementById('adm-poster-preset');
    el.posterCustom = document.getElementById('adm-poster-custom');
    el.rundown = document.getElementById('adm-rundown');
    el.detailsOutput = document.getElementById('adm-details-output');
    el.cardPreview = document.getElementById('adm-card-preview');
    el.feedback = document.getElementById('adm-feedback');
    el.submitBtn = document.getElementById('adm-submit-btn');
    el.deleteBtn = document.getElementById('adm-delete-btn');
    el.copyBtn = document.getElementById('adm-copy-btn');
    el.icsBtn = document.getElementById('adm-ics-btn');
    el.resetBtn = document.getElementById('adm-reset-btn');
    el.statusSummary = document.getElementById('admin-status-summary');
    el.toast = document.getElementById('admin-toast');
    el.connectedList = document.getElementById('admin-connected-list');
    el.timelineMount = document.getElementById('admin-timeline-mount');

    el.qmDialog = document.getElementById('admin-quick-modal');
    el.qmHeading = document.getElementById('qm-heading');
    el.qmDraftBadge = document.getElementById('qm-draft-badge');
    el.qmCloseBtn = document.getElementById('qm-close-btn');
    el.qmForm = document.getElementById('qm-form');
    el.qmTitle = document.getElementById('qm-title');
    el.qmCatChips = document.getElementById('qm-cat-chips');
    el.qmAllDay = document.getElementById('qm-allday');
    el.qmStartDate = document.getElementById('qm-start-date');
    el.qmStartTime = document.getElementById('qm-start-time');
    el.qmEndDate = document.getElementById('qm-end-date');
    el.qmEndTime = document.getElementById('qm-end-time');
    el.qmDurationBar = document.getElementById('qm-duration-bar');
    el.qmLocation = document.getElementById('qm-location');
    el.qmDescription = document.getElementById('qm-description');
    el.qmOverlapWarn = document.getElementById('qm-overlap-warn');
    el.qmSyncNote = document.getElementById('qm-sync-note');
    el.qmError = document.getElementById('qm-error');
    el.qmSaveBtn = document.getElementById('qm-save-btn');
    el.qmGcalLink = document.getElementById('qm-gcal-link');
    el.qmMoreBtn = document.getElementById('qm-more-btn');
    el.qmDeleteBtn = document.getElementById('qm-delete-btn');

    if (!el.form) {
      return;
    }

    populateSelectOptions();
    setDefaultDateInputs(false);
    bindQuickModalEvents();
    updatePreview();
    loadConnectedSchedule(false);

    el.form.addEventListener('input', updatePreview);
    el.form.addEventListener('change', updatePreview);

    el.form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var data = readFormState();
      var errorMsg = validateEventTiming(el.title ? el.title.value : '', data);
      if (!errorMsg && data.daftarUrl && !/^https?:\/\//i.test(data.daftarUrl)) {
        errorMsg = 'Link pendaftaran harus diawali dengan https:// atau http://.';
      }
      if (errorMsg) {
        showActionFeedback(errorMsg, true);
        return;
      }

      if (svc.getAdminAuthStatus().signedIn) {
        state.isSaving = true;
        syncFormModeControls();
        try {
          var existing = state.editingEventId ? findEventById(state.editingEventId) : null;
          if (state.editingEventId && existing && !existing.isLocalDraft) {
            await svc.updateGoogleEvent(state.editingEventId, data);
            showActionFeedback('Perubahan jadwal "' + data.title + '" berhasil disimpan ke Google Calendar.', false);
          } else {
            await svc.createGoogleEvent(data);
            if (state.editingEventId) {
              removeDraftById(state.editingEventId);
            }
            showActionFeedback('Jadwal baru "' + data.title + '" berhasil dibuat langsung di Google Calendar.', false);
          }
          state.selectedDateKey = data.startDate;
          state.editingEventId = '';
          el.form.reset();
          setDefaultDateInputs(true);
          await loadConnectedSchedule(true);
        } catch (err) {
          showActionFeedback('Gagal menyimpan ke Google Calendar: ' + (err && err.message ? err.message : 'Error'), true);
        } finally {
          state.isSaving = false;
          updatePreview();
        }
        return;
      }

      var gcalUrl = buildGoogleTemplateHref(data);
      window.open(gcalUrl, '_blank', 'noopener');
      showActionFeedback(
        'Tab Google Calendar siap dibuka. Klik tombol Save di Google Calendar (atau hubungkan OAuth Client ID agar simpan langsung tanpa tab baru).',
        false,
        gcalUrl
      );
    });

    if (el.deleteBtn) {
      el.deleteBtn.addEventListener('click', function () {
        if (state.editingEventId) {
          handleDeleteEvent(state.editingEventId);
        }
      });
    }

    if (el.connectedList) {
      el.connectedList.addEventListener('click', function (event) {
        var editBtn = event.target.closest('button[data-edit-id]');
        if (editBtn) {
          loadEventIntoFullForm(editBtn.getAttribute('data-edit-id'));
          return;
        }
        var delBtn = event.target.closest('button[data-delete-id]');
        if (delBtn) {
          handleDeleteEvent(delBtn.getAttribute('data-delete-id'));
        }
      });
    }

    if (el.copyBtn) {
      el.copyBtn.addEventListener('click', function () {
        var text = el.detailsOutput ? el.detailsOutput.value : '';
        if (!text) {
          return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            showActionFeedback('Teks deskripsi terformat berhasil disalin ke clipboard.', false);
          }).catch(function () {
            el.detailsOutput.select();
            document.execCommand('copy');
            showActionFeedback('Teks deskripsi disalin ke clipboard.', false);
          });
        } else {
          el.detailsOutput.select();
          document.execCommand('copy');
          showActionFeedback('Teks deskripsi disalin ke clipboard.', false);
        }
      });
    }

    if (el.icsBtn) {
      el.icsBtn.addEventListener('click', function () {
        var data = readFormState();
        var errorMsg = validateEventTiming(el.title ? el.title.value : '', data);
        if (errorMsg) {
          showActionFeedback(errorMsg, true);
          return;
        }
        ics.downloadEventIcs(data.previewEvent);
        showActionFeedback('Draft file .ics berhasil diunduh.', false);
      });
    }

    if (el.resetBtn) {
      el.resetBtn.addEventListener('click', function () {
        state.editingEventId = '';
        el.form.reset();
        setDefaultDateInputs(true);
        updatePreview();
        showActionFeedback('Formulir dikembalikan ke kondisi awal.', false);
      });
    }

    window.addEventListener('portal:langchange', function () {
      updatePreview();
      renderConnectedList();
      renderAdminTimeline();
    });
  });
})();
