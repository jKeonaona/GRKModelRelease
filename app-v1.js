/* ---------- WildPx Model Release — PWA Kiosk Mode with Offline Saving Fix ---------- */
function toast(kind, msg) {
  const banner = document.getElementById('banner');
  if (!banner) return;
  banner.className = kind;
  banner.textContent = msg || (kind === 'ok' ? 'Saved' : 'Error');
  banner.style.display = 'block';
  setTimeout(() => { banner.style.display = 'none'; }, kind === 'ok' ? 3000 : 4500);
}
const ok = (m) => toast('ok', m);
const err = (m) => toast('err', m);

function debounce(fn, ms) {
  let t;
  const debounced = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  debounced._cancel = () => clearTimeout(t);
  return debounced;
}

if (window.__WILDPX_LOCK__) { /* no-op */ }
else {
  window.__WILDPX_LOCK__ = true;

  // Register service worker for offline support
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker registered:', reg))
        .catch(e => console.error('Service Worker registration failed:', e));
    });
  }

  // IndexedDB setup
  const DB_NAME = 'WildPxDB';
  const STORE_NAME = 'formEntries';
  let db;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
      };
      request.onsuccess = (event) => {
        db = event.target.result;
        console.log('IndexedDB opened successfully');
        resolve(db);
      };
      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async function getAllFromDB() {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        console.log('IndexedDB getAll:', request.result.length, 'entries');
        resolve(request.result);
      };
      request.onerror = () => {
        console.error('IndexedDB getAll error:', request.error);
        reject(request.error);
      };
    });
  }

  async function setAllToDB(entries) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      entries.forEach(entry => store.add(entry));
      transaction.oncomplete = () => {
        console.log('IndexedDB setAll: saved', entries.length, 'entries');
        resolve();
      };
      transaction.onerror = () => {
        console.error('IndexedDB setAll error:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  async function getAll() {
    try {
      const lsData = localStorage.getItem('formEntries');
      if (lsData) {
        const data = JSON.parse(lsData) || [];
        console.log('localStorage get:', data.length, 'entries');
        return data;
      }
    } catch (e) {
      console.error('localStorage get failed:', e);
    }
    try {
      return await getAllFromDB();
    } catch (e) {
      console.error('IndexedDB get failed:', e);
      return [];
    }
  }

  async function setAll(entries) {
    // Prioritize IndexedDB for iPad PWA
    try {
      await setAllToDB(entries);
      try {
        localStorage.setItem('formEntries', JSON.stringify(entries));
        console.log('localStorage set:', entries.length, 'entries');
      } catch (lsError) {
        console.warn('localStorage set failed, using IndexedDB only:', lsError);
      }
      updateSavedCount();
      return true;
    } catch (dbError) {
      console.error('IndexedDB set failed:', dbError);
      try {
        localStorage.setItem('formEntries', JSON.stringify(entries));
        console.log('localStorage set:', entries.length, 'entries');
        updateSavedCount();
        return true;
      } catch (lsError) {
        console.error('localStorage set failed:', lsError);
        return false;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('releaseForm');
    const savedCountEl = document.getElementById('savedCount');
    const ageSelect = document.getElementById('ageCheck');
    const guardianSection = document.getElementById('guardianSection');
    const childrenSection = document.getElementById('childrenSection');
    const signatureCanvas = document.getElementById('signatureCanvas');
    const signatureData = document.getElementById('signatureData');
    const signatureLabelEl = document.getElementById('signatureLabel');
    const signatureDateInp = form?.querySelector('input[name="signatureDate"]');
    const clearBtn = document.getElementById('clearSigBtn');
    const headIn = form?.elements?.['headshot'] ?? null;
    const exportAllBtn = document.getElementById('exportAllBtn');
    const exportClearBtn = document.getElementById('exportClearBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const printPdfBtn = document.getElementById('printPdfBtn');
    const logo = document.querySelector('.logo');
    const adminBar = document.getElementById('adminBar');

    if (!form) { err('Form element #releaseForm not found.'); return; }
    if (!signatureCanvas) { err('Signature canvas #signatureCanvas not found.'); return; }
    if (!window.SignaturePad) { err('SignaturePad library is missing.'); return; }

    function updateSavedCount() {
      getAll().then(entries => {
        if (savedCountEl) savedCountEl.textContent = 'Saved: ' + entries.length;
      });
    }
    updateSavedCount();

    function setTodayIfBlank() {
      if (signatureDateInp && !signatureDateInp.value) {
        signatureDateInp.value = new Date().toISOString().slice(0, 10);
      }
    }
    setTodayIfBlank();

    let headshotDataURL = '';
    if (headIn) {
      headIn.addEventListener('change', (ev) => {
        const f = ev.target?.files?.[0];
        if (!f) { headshotDataURL = ''; return; }
        const r = new FileReader();
        r.onload = () => {
          headshotDataURL = String(r.result || '');
          console.log('Headshot loaded, size:', headshotDataURL.length, 'bytes');
        };
        r.onerror = () => {
          headshotDataURL = '';
          console.error('Headshot read error');
        };
        r.readAsDataURL(f);
      });
    }

    signatureCanvas.style.touchAction = 'none';
    signatureCanvas.style.userSelect = 'none';
    signatureCanvas.style.position = 'relative';
    signatureCanvas.style.zIndex = '1000';
    if (!signatureCanvas.style.height) signatureCanvas.style.height = '150px';
    const pad = new window.SignaturePad(signatureCanvas, {
      penColor: '#000',
      minWidth: 0.5,
      maxWidth: 2.5,
      throttle: 16,
      dotSize: 1,
      velocityFilterWeight: 0.7
    });
    pad.onEnd = () => {
      updateClearState();
      console.log('Signature drawn, size:', pad.toDataURL('image/jpeg', 0.7).length, 'bytes');
    };

    ['touchstart', 'touchmove', 'touchend'].forEach(event => {
      signatureCanvas.addEventListener(event, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (event === 'touchend') {
          scheduleResize();
        }
      }, { passive: false });
    });
    ['pointerdown', 'pointermove', 'pointerup'].forEach(event => {
      signatureCanvas.addEventListener(event, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (event === 'pointerup') {
          scheduleResize();
        }
      }, { passive: false });
    });

    let lastCssW = 0;
    function resizeCanvasPreserve(canvas, padInst) {
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.floor(rect.width);
      if (!cssW) return;
      if (cssW === lastCssW && padInst && !padInst.isEmpty()) return;
      lastCssW = cssW;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const cssH = Math.floor(parseFloat(getComputedStyle(canvas).height) || 150);
      canvas.width = Math.floor(cssW * ratio);
      canvas.height = Math.floor(cssH * ratio);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      padInst.clear();
      const data = padInst && !padInst.isEmpty() ? padInst.toData() : null;
      if (data && data.length) padInst.fromData(data);
    }
    function updateClearState() { if (clearBtn) clearBtn.disabled = pad.isEmpty(); }
    function scheduleResize() { resizeCanvasPreserve(signatureCanvas, pad); }

    requestAnimationFrame(scheduleResize);
    clearBtn?.addEventListener('click', (e) => {
      if (pad.isEmpty()) return;
      e.preventDefault();
      if (confirm('Clear signature?')) { pad.clear(); updateClearState(); }
    });

    const onResizeDebounced = debounce(scheduleResize, 100);
    window.addEventListener('resize', onResizeDebounced);
    window.addEventListener('orientationchange', () => setTimeout(scheduleResize, 300));
    window.addEventListener('pageshow', () => scheduleResize(), { once: true });

    function isMinor() { return String(ageSelect?.value || '').trim().toLowerCase() === 'no'; }
    function updateMinorUI() {
      const minor = isMinor();
      console.log('updateMinorUI called, minor:', minor);
      if (guardianSection) guardianSection.style.display = minor ? 'block' : 'none';
      if (childrenSection) childrenSection.style.display = minor ? 'block' : 'none';
      const gName = form.elements['guardianName'];
      const gRel = form.elements['guardianRelationship'];
      if (gName) gName.required = minor;
      if (gRel) gRel.required = minor;
      if (signatureLabelEl) signatureLabelEl.textContent = minor ? 'Parent/Guardian Signature:' : 'Model Signature:';
      requestAnimationFrame(scheduleResize);
      form.style.display = 'none';
      form.offsetHeight; // Trigger reflow
      form.style.display = '';
    }
    ageSelect?.addEventListener('change', updateMinorUI);
    ageSelect?.addEventListener('input', updateMinorUI);
    ageSelect?.addEventListener('touchend', updateMinorUI, { passive: false });
    updateMinorUI();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = (form.elements['fullName']?.value || '').trim();
      if (!fullName) { err('Please enter the model’s full name.'); return; }
      if (!ageSelect?.value) { err('Please select Yes/No for age.'); return; }
      const minor = isMinor();
      const gName = form.elements['guardianName']?.value?.trim() || '';
      const gRel = form.elements['guardianRelationship']?.value?.trim() || '';
      if (minor && (!gName || !gRel)) { err('Please provide guardian name and relationship.'); return; }
      if (pad.isEmpty()) { err(minor ? 'Please have the Parent/Guardian sign.' : 'Please sign as the model.'); return; }
      setTodayIfBlank();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      data.timestamp = new Date().toISOString();
      const sigPNG = pad.toDataURL('image/jpeg', 0.7); // Compress signature
      data.modelSignature = sigPNG;
      data.guardianSignature = minor ? sigPNG : '';
      if (signatureData) signatureData.value = sigPNG;
      if (typeof headshotDataURL === 'string' && headshotDataURL.startsWith('data:image/')) {
        // Compress headshot if needed
        if (headshotDataURL.length > 1_000_000) { // >1MB
          const img = new Image();
          img.src = headshotDataURL;
          await new Promise(resolve => { img.onload = resolve; });
          const canvas = document.createElement('canvas');
          canvas.width = img.width * 0.5;
          canvas.height = img.height * 0.5;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          headshotDataURL = canvas.toDataURL('image/jpeg', 0.7);
        }
        data.headshot = headshotDataURL;
      } else {
        if ('headshot' in data) delete data.headshot;
      }
      console.log('Form data:', data);
      const all = await getAll();
      console.log('Current entries:', all.length);
      all.push(data);
      const saved = await setAll(all);
      if (!saved) {
        err('Could not save locally. Storage may be disabled or full.');
        // Optional: Clear form even on save failure (uncomment if desired)
        // const holdAge = ageSelect.value;
        // form.reset();
        // ageSelect.value = holdAge;
        // pad.clear();
        // headshotDataURL = '';
        // if (headIn) headIn.value = '';
        // updateMinorUI();
        // updateClearState();
        // window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const holdAge = ageSelect.value;
      form.reset();
      ageSelect.value = holdAge;
      pad.clear();
      headshotDataURL = '';
      if (headIn) headIn.value = '';
      updateMinorUI();
      updateClearState();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      console.log('Form cleared, saved entries:', all.length);
      ok('Saved locally. Total: ' + all.length);
    }, { capture: true });

    (function setupTripleTap() {
      if (!logo || !adminBar) return;
      logo.style.pointerEvents = 'auto';
      logo.style.touchAction = 'none';
      logo.style.zIndex = '1000';
      const REQUIRED_TAPS = 3;
      const WINDOW_MS = 1200;
      let taps = 0, firstAt = 0, timer = null, lastTouch = 0;
      function reset() {
        taps = 0;
        firstAt = 0;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }
      function toggle() {
        adminBar.style.display = (adminBar.style.display === 'none' || !adminBar.style.display) ? 'flex' : 'none';
        adminBar.offsetHeight; // Trigger reflow
      }
      function handleTap(isTouch) {
        const now = Date.now();
        if (isTouch) lastTouch = now;
        if (!firstAt || (now - firstAt) > WINDOW_MS) {
          firstAt = now;
          taps = 1;
          if (timer) clearTimeout(timer);
          timer = setTimeout(reset, WINDOW_MS + 100);
          console.log(`Tap ${taps}/3 started at ${now}`);
        } else {
          taps++;
          console.log(`Tap ${taps}/3 at ${now}`);
        }
        if (taps >= REQUIRED_TAPS) {
          if (timer) clearTimeout(timer);
          reset();
          toggle();
          console.log('Admin bar toggled');
        }
      }
      ['touchstart', 'touchend'].forEach(event => {
        logo.addEventListener(event, (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (event === 'touchend') handleTap(true);
        }, { passive: false });
      });
      logo.addEventListener('click', (ev) => {
        if (Date.now() - lastTouch < 700) return;
        ev.preventDefault();
        ev.stopPropagation();
        handleTap(false);
      }, { passive: false });
    })();

    function downloadJSON(filename, obj) {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 500);
    }
    function toCSV(rows) {
      if (!rows.length) return '';
      const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))))
        .filter(h => !['modelSignature', 'guardianSignature', 'headshot'].includes(h));
      const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [headers.join(',')].concat(rows.map(r => headers.map(h => esc(r[h])).join(',')));
      return lines.join('\n');
    }
    exportAllBtn?.addEventListener('click', async () => {
      const entries = await getAll();
      if (!entries.length) { err('No saved forms to export.'); return; }
      const bundle = { exported_at: new Date().toISOString(), count: entries.length, entries };
      const fn = 'wildpx_releases_' + new Date().toISOString().slice(0, 10) + '_n' + entries.length + '.json';
      downloadJSON(fn, bundle);
      ok('Exported ' + entries.length + ' forms.');
    });
    exportClearBtn?.addEventListener('click', async () => {
      const entries = await getAll();
      if (!entries.length) { err('Nothing to export.'); return; }
      if (!confirm('Export all forms and then clear them from this device?')) return;
      const bundle = { exported_at: new Date().toISOString(), count: entries.length, entries };
      const fn = 'wildpx_releases_' + new Date().toISOString().slice(0, 10) + '_n' + entries.length + '.json';
      downloadJSON(fn, bundle);
      try {
        localStorage.removeItem('formEntries');
        if (db) {
          const transaction = db.transaction([STORE_NAME], 'readwrite');
          transaction.objectStore(STORE_NAME).clear();
        }
        updateSavedCount();
        ok('Exported and cleared.');
      } catch (e) {
        console.error('Clear storage failed:', e);
        err('Could not clear storage.');
      }
    });
    exportCsvBtn?.addEventListener('click', async () => {
      const entries = await getAll();
      if (!entries.length) { err('No saved forms to export.'); return; }
      const csv = toCSV(entries);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wildpx_releases_' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 500);
      ok('Exported CSV.');
    });
    printPdfBtn?.addEventListener('click', () => { window.print(); });

    window.addEventListener('unload', () => {
      window.removeEventListener('resize', onResizeDebounced);
      onResizeDebounced._cancel?.();
    });
  });
}
