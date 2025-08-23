/* ---------- WildPx Model Release — Simplified PWA Fix for jsPDF and Signatures ---------- */
function toast(kind, msg) {
  const banner = document.getElementById('banner');
  if (banner) {
    banner.className = kind;
    banner.textContent = msg || (kind === 'ok' ? 'Saved' : 'Error');
    banner.style.display = 'block';
    setTimeout(() => { banner.style.display = 'none'; }, kind === 'ok' ? 3000 : 4500);
  }
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

  // Service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker registered:', reg))
        .catch(e => console.error('Service Worker registration failed:', e));
    });
  }

  // In-memory storage
  let memoryStore = [];

  // Storage functions
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
    console.log('Using memory store:', memoryStore.length, 'entries');
    return memoryStore;
  }

  async function setAll(entries) {
    try {
      localStorage.setItem('formEntries', JSON.stringify(entries));
      console.log('localStorage set:', entries.length, 'entries');
      memoryStore = entries;
      return true;
    } catch (e) {
      console.error('localStorage set failed:', e);
      memoryStore = entries;
      console.log('Saved to memory store:', entries.length, 'entries');
      return true;
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
    const headIn = form?.elements?.['headshot'];
    const exportAllBtn = document.getElementById('exportAllBtn');
    const exportClearBtn = document.getElementById('exportClearBtn');
    const printPdfBtn = document.getElementById('printPdfBtn');
    const logo = document.querySelector('.logo');
    const adminBar = document.getElementById('adminBar');

    if (!form) { err('Form element #releaseForm not found.'); return; }
    if (!signatureCanvas) { err('Signature canvas #signatureCanvas not found.'); return; }
    if (!window.SignaturePad) { err('SignaturePad library is missing.'); return; }
    if (!window.jspdf) {
      console.warn('jsPDF library not loaded; PDF export disabled.');
      if (printPdfBtn) printPdfBtn.disabled = true;
    }

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
        r.onerror = () => { headshotDataURL = ''; console.error('Headshot read error'); };
        r.readAsDataURL(f);
      });
    }

    // Signature Canvas Setup
    signatureCanvas.style.touchAction = 'none';
    signatureCanvas.style.pointerEvents = 'auto';
    signatureCanvas.style.position = 'relative';
    signatureCanvas.style.zIndex = '1000';
    signatureCanvas.style.height = '150px';
    signatureCanvas.style.width = '100%';
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
      console.log('Signature drawn, size:', pad.toDataURL('image/jpeg', 0.5).length, 'bytes');
    };

    // Enhanced touch/pointer events
    ['touchstart', 'touchmove', 'touchend', 'mousedown', 'mousemove', 'mouseup', 'pointerdown', 'pointermove', 'pointerup'].forEach(event => {
      signatureCanvas.addEventListener(event, (e) => {
        console.log(`Canvas ${event} at (${e.clientX}, ${e.clientY})`);
      }, { passive: true });
    });

    let lastCssW = 0;
    function resizeCanvasPreserve(canvas, padInst) {
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.floor(rect.width);
      if (!cssW || cssW === lastCssW) return;
      lastCssW = cssW;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const cssH = 150;
      canvas.width = Math.floor(cssW * ratio);
      canvas.height = Math.floor(cssH * ratio);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      padInst.clear();
      const data = padInst && !padInst.isEmpty() ? padInst.toData() : null;
      if (data && data.length) padInst.fromData(data);
      console.log('Canvas resized:', cssW, cssH);
    }
    function updateClearState() { if (clearBtn) clearBtn.disabled = pad.isEmpty(); }
    function scheduleResize() { resizeCanvasPreserve(signatureCanvas, pad); }

    requestAnimationFrame(scheduleResize);
    setInterval(scheduleResize, 1000); // Force redraw for Guided Access
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
      if (guardianSection) guardianSection.style.display = minor ? '' : 'none';
      if (childrenSection) childrenSection.style.display = minor ? '' : 'none';
      const gName = form.elements['guardianName'];
      const gRel = form.elements['guardianRelationship'];
      if (gName) gName.required = minor;
      if (gRel) gRel.required = minor;
      if (signatureLabelEl) signatureLabelEl.textContent = minor ? 'Parent/Guardian Signature:' : 'Model Signature:';
      form.style.display = 'none';
      form.offsetHeight;
      form.style.display = '';
      console.log('Minor UI updated:', guardianSection?.style.display);
    }
    if (ageSelect) {
      ['change', 'input', 'touchend', 'click'].forEach(event => {
        ageSelect.addEventListener(event, (e) => {
          console.log(`Age select ${event}`);
          updateMinorUI();
        }, { passive: true });
      });
      updateMinorUI();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('Form submit triggered at:', new Date().toISOString());
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
      const sigPNG = pad.toDataURL('image/jpeg', 0.5);
      data.modelSignature = sigPNG;
      data.guardianSignature = minor ? sigPNG : '';
      if (signatureData) signatureData.value = sigPNG;
      if (typeof headshotDataURL === 'string' && headshotDataURL.startsWith('data:image/')) {
        if (headshotDataURL.length > 100_000) {
          const img = new Image();
          img.src = headshotDataURL;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width * 0.2;
            canvas.height = img.height * 0.2;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            headshotDataURL = canvas.toDataURL('image/jpeg', 0.5);
            data.headshot = headshotDataURL;
          };
        } else {
          data.headshot = headshotDataURL;
        }
      } else {
        if ('headshot' in data) delete data.headshot;
      }
      console.log('Form data:', { ...data, modelSignature: '[Signature Data]', headshot: data.headshot ? '[Headshot Data]' : '' });
      const all = await getAll();
      all.push(data);
      const saved = await setAll(all);
      if (!saved) {
        err('Could not save locally. Saved to temporary storage.');
      }
      const holdAge = ageSelect.value;
      form.reset();
      form.querySelectorAll('input:not([type="hidden"]), select').forEach(el => {
        if (el !== ageSelect) el.value = '';
      });
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
      const WINDOW_MS = 3000;
      let taps = 0, firstAt = 0, timer = null;
      function reset() {
        taps = 0;
        firstAt = 0;
        if (timer) clearTimeout(timer);
        timer = null;
      }
      function toggle() {
        adminBar.style.display = (adminBar.style.display === 'none' || !adminBar.style.display) ? 'flex' : 'none';
        console.log('Admin bar toggled:', adminBar.style.display);
      }
      function handleTap() {
        const now = Date.now();
        if (!firstAt || (now - firstAt) > WINDOW_MS) {
          firstAt = now;
          taps = 1;
          if (timer) clearTimeout(timer);
          timer = setTimeout(reset, WINDOW_MS + 100);
          console.log(`Tap ${taps}/3 at ${now}`);
        } else {
          taps++;
          console.log(`Tap ${taps}/3 at ${now}`);
        }
        if (taps >= REQUIRED_TAPS) {
          if (timer) clearTimeout(timer);
          reset();
          toggle();
        }
      }
      ['touchend', 'click'].forEach(event => {
        logo.addEventListener(event, (e) => {
          console.log(`Logo ${event}`);
          handleTap();
        }, { passive: true });
      });
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

    function generatePDF(entry) {
      if (!window.jspdf) {
        err('PDF export unavailable; jsPDF library not loaded.');
        return null;
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFontSize(12);
      doc.text('Photo Release', 10, 10);
      doc.text(`Name: ${entry.fullName}`, 10, 20);
      doc.text(`Over 18: ${entry.ageCheck}`, 10, 30);
      if (entry.guardianName) doc.text(`Guardian: ${entry.guardianName} (${entry.guardianRelationship})`, 10, 40);
      doc.text(`Date: ${entry.signatureDate}`, 10, 50);
      doc.addImage(entry.modelSignature, 'JPEG', 10, 60, 50, 25);
      if (entry.headshot) doc.addImage(entry.headshot, 'JPEG', 10, 90, 50, 50);
      return doc;
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
        memoryStore = [];
        updateSavedCount();
        ok('Exported and cleared.');
      } catch (e) {
        console.error('Clear storage failed:', e);
        err('Could not clear storage.');
      }
    });

    printPdfBtn?.addEventListener('click', async () => {
      if (!window.jspdf) {
        err('PDF export unavailable; jsPDF library not loaded.');
        return;
      }
      const entries = await getAll();
      if (!entries.length) { err('No saved forms to print.'); return; }
      for (const entry of entries) {
        const doc = generatePDF(entry);
        if (doc) {
          const blob = doc.output('blob');
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `release_${entry.timestamp}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 500);
        }
      }
      ok('PDFs generated.');
    });

    window.addEventListener('unload', () => {
      window.removeEventListener('resize', onResizeDebounced);
      onResizeDebounced._cancel?.();
    });
  });
}
