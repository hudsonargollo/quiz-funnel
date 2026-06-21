/* ============================================
   CRM MODULE
   Session tracking + KV sync + event logging
   ============================================ */

window.CRM = (() => {

  // ── Internal state ─────────────────────────
  let _session = null;
  // Storage is namespaced per funnel so a visitor on a different funnel is a
  // separate, isolated lead/UID (keeps the events unique key collision-free).
  const _fid = () => (window.FUNNEL && window.FUNNEL.id) ? window.FUNNEL.id : 'default';
  const SESSION_KEY = () => 'qf_session_' + _fid();
  const UID_KEY = () => 'qf_uid_' + _fid();   // stable per-funnel id
  const SYNC_DEBOUNCE = 1500; // ms
  let _syncTimer = null;

  // ── Init: load or create session ───────────
  function init() {
    // Persisted in localStorage so a returning visitor stays the same lead.
    try {
      const saved = _store().getItem(SESSION_KEY());
      if (saved) _session = JSON.parse(saved);
    } catch (e) { /* ignore */ }

    if (_session) {
      // Backfill UTM/referrer if this visit carries new attribution and we had none
      if (!_session.utmSource && _getParam('utm_source')) {
        _session.utmSource = _getParam('utm_source');
        _session.utmMedium = _getParam('utm_medium');
        _session.utmCampaign = _getParam('utm_campaign');
        _persist();
      }
      return _session;
    }

    _session = {
      userId: _stableUid(),
      email: null,
      nome: null,
      quizData: {},
      funnelState: 'quiz_started',
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      events: [],
      utmSource: _getParam('utm_source'),
      utmMedium: _getParam('utm_medium'),
      utmCampaign: _getParam('utm_campaign'),
      referrer: document.referrer || null,
      userAgent: navigator.userAgent || null,
    };
    _persist();
    return _session;
  }

  // ── Set a quiz answer ───────────────────────
  function setAnswer(key, value) {
    if (!_session) return;
    _session.quizData[key] = value;
    _session.lastUpdated = new Date().toISOString();
    _persist();
  }

  // ── Set contact info ────────────────────────
  function setContact(data) {
    if (!_session) return;
    if (data.email) _session.email = data.email.trim().toLowerCase();
    if (data.nome) _session.nome = data.nome.trim();
    _session.lastUpdated = new Date().toISOString();
    _persist();
    _scheduleSync();
  }

  // ── Track funnel state ──────────────────────
  function setState(state) {
    if (!_session) return;
    _session.funnelState = state;
    _session.lastUpdated = new Date().toISOString();
    _persist();
    _scheduleSync();
  }

  // ── Log an event ─────────────────────────────
  function track(event, props = {}) {
    if (!_session) return;
    _session.events.push({
      event,
      props,
      ts: new Date().toISOString(),
    });
    // Keep last 50 events only
    if (_session.events.length > 50) {
      _session.events = _session.events.slice(-50);
    }
    _persist();

    // Fire-and-forget sync on key events
    const keyEvents = ['lead_captured', 'checkout_initiated', 'purchase_completed', 'checkout_abandoned'];
    if (keyEvents.includes(event)) {
      _syncNow();
    }
  }

  // ── Get full session ─────────────────────────
  function getSession() {
    return _session;
  }

  // ── Get specific quiz answer ─────────────────
  function getAnswer(key) {
    return _session?.quizData?.[key];
  }

  // ── Compute IMC ──────────────────────────────
  function computeIMC() {
    if (!_session) return null;
    const pesoKg = parseFloat(_session.quizData.peso_atual);
    const alturaCm = parseFloat(_session.quizData.altura);
    if (!pesoKg || !alturaCm) return null;
    const alturaM = alturaCm / 100;
    return Math.round((pesoKg / (alturaM * alturaM)) * 10) / 10;
  }

  // ── IMC classification ───────────────────────
  function imcClass(imc) {
    if (imc < 18.5) return { label: 'Baixo Peso', color: '#60A5FA', rowIndex: 0 };
    if (imc < 25)   return { label: 'Peso Normal', color: '#34D399', rowIndex: 1 };
    if (imc < 30)   return { label: 'Pré-obesidade', color: '#FCD34D', rowIndex: 2 };
    if (imc < 35)   return { label: 'Obesidade Grau I', color: '#FB923C', rowIndex: 3 };
    if (imc < 40)   return { label: 'Obesidade Grau II', color: '#F87171', rowIndex: 4 };
    return            { label: 'Obesidade Grau III', color: '#EF4444', rowIndex: 5 };
  }

  // ── IMC needle position (% of gradient bar) ─
  function imcNeedlePercent(imc) {
    // Map IMC 15–45 to 0–100%
    const pct = ((imc - 15) / 30) * 100;
    return Math.min(95, Math.max(2, pct));
  }

  // ── Internal: persist to localStorage ───────
  function _persist() {
    try {
      _store().setItem(SESSION_KEY(), JSON.stringify(_session));
    } catch (e) { /* quota exceeded / private mode — ignore */ }
  }

  // localStorage with an in-memory fallback (private mode / blocked storage)
  let _mem = {};
  function _store() {
    try {
      const t = '__qf_t__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return localStorage;
    } catch (e) {
      return {
        getItem: k => (k in _mem ? _mem[k] : null),
        setItem: (k, v) => { _mem[k] = v; },
        removeItem: k => { delete _mem[k]; },
      };
    }
  }

  // Stable per-browser id, persisted independently of the session blob.
  function _stableUid() {
    try {
      let id = _store().getItem(UID_KEY());
      if (!id) { id = _uuid(); _store().setItem(UID_KEY(), id); }
      return id;
    } catch (e) {
      return _uuid();
    }
  }

  // ── Internal: debounced KV sync ─────────────
  function _scheduleSync() {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(_syncNow, SYNC_DEBOUNCE);
  }

  async function _syncNow() {
    if (!_session) return;
    if (window.FUNNEL && window.FUNNEL.preview) return; // builder preview — never write

    // Only sync once we have at least an email or userId
    try {
      await fetch('/api/public/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ..._session, funnelSlug: (window.FUNNEL && window.FUNNEL.slug) || undefined }),
        keepalive: true,
      });
    } catch (e) {
      // Fail silently — will retry on next key event
    }
  }

  // ── Helpers ──────────────────────────────────
  function _uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function _getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  return { init, setAnswer, setContact, setState, track, getSession, getAnswer, computeIMC, imcClass, imcNeedlePercent };
})();
