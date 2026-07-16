/* DIGIY PRO JOB — garde strict PIN 8 h */
(() => {
  "use strict";

  const MODULE = "JOBS";
  const MAX_AGE = 8 * 60 * 60 * 1000;
  const CLOCK_SKEW = 60 * 1000;
  const PIN_URL = "./pin.html";
  const HOME_URL = "./accueil.html";
  const CARNET_URL = "https://digiy-carnet-pro.digiylyfe.com/pin.html";
  const API_URL = String(window.DIGIY_SUPABASE_URL || "").replace(/\/$/, "");
  const API_KEY = String(window.DIGIY_SUPABASE_ANON_KEY || window.DIGIY_SUPABASE_ANON || "");

  const SESSION_KEYS = [
    "DIGIY_JOBS_PIN_SESSION",
    "DIGIY_JOBS_SESSION",
    "DIGIY_JOBS_ACCESS",
    "digiy_jobs_session",
    "digiy_jobs_guard_session",
    "digiy_guard_jobs_session"
  ];

  const LEGACY_KEYS = [
    "DIGIY_MASTER_PIN_SESSION",
    "DIGIY_PIN_SESSION",
    "DIGIY_ACCESS",
    "DIGIY_SESSION",
    "digiy_session",
    "digiy_phone",
    "digiy_last_phone",
    "DIGIY_PHONE",
    "DIGIY_LAST_PHONE"
  ];

  const JOB_PHONE_KEYS = [
    "digiy_jobs_phone",
    "digiy_jobs_last_phone",
    "DIGIY_JOBS_HUB_PHONE"
  ];

  const JOB_SLUG_KEYS = [
    "digiy_jobs_slug",
    "digiy_jobs_last_slug"
  ];

  const SENSITIVE_QUERY_KEYS = [
    "slug","phone","tel","p_phone","owner_phone","pin","code","token",
    "session","access","module","from","return","redirect","v"
  ];

  const state = {
    module: MODULE,
    slug: "",
    phone: "",
    owner_id: null,
    access: false,
    access_ok: false,
    pin_session_ok: false,
    preview: true,
    ready_flag: false,
    verified_at: null,
    validated_at: null,
    expires_at: null,
    error: null,
    source: "boot",
    pin_url: PIN_URL,
    pay_url: CARNET_URL
  };

  let pending = null;

  function isPinPage() {
    return /\/?pin\.html$/i.test(String(location.pathname || ""));
  }

  function hidePage() {
    if (isPinPage()) return;
    try { document.documentElement.style.visibility = "hidden"; } catch (_) {}
  }

  function showPage() {
    try { document.documentElement.style.visibility = ""; } catch (_) {}
  }

  function normPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 9 && /^[37]/.test(digits)) return "221" + digits;
    return digits;
  }

  function normSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .replace(/-+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "");
  }

  function normPin(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 4);
  }

  function parseTime(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value < 100000000000 ? value * 1000 : value;
    }
    const text = String(value).trim();
    if (/^\d+$/.test(text)) {
      const n = Number(text);
      return Number.isFinite(n) ? (n < 100000000000 ? n * 1000 : n) : 0;
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function safeJson(raw) {
    try { return JSON.parse(raw || "null"); } catch (_) { return null; }
  }

  function get(storage, key) {
    try { return storage.getItem(key) || ""; } catch (_) { return ""; }
  }

  function set(storage, key, value) {
    try { storage.setItem(key, value); } catch (_) {}
  }

  function remove(storage, key) {
    try { storage.removeItem(key); } catch (_) {}
  }

  function removeBoth(key) {
    remove(sessionStorage, key);
    remove(localStorage, key);
  }

  function cleanUrl() {
    try {
      const url = new URL(location.href);
      let changed = false;
      SENSITIVE_QUERY_KEYS.forEach((key) => {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      });
      if (changed) history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    } catch (_) {}
  }

  function headers() {
    return {
      apikey: API_KEY,
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  }

  async function rpc(name, body) {
    if (!API_URL || !API_KEY) return { ok: false, data: null };
    try {
      const response = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body || {})
      });
      return { ok: response.ok, data: await response.json().catch(() => null) };
    } catch (_) {
      return { ok: false, data: null };
    }
  }

  async function tableGet(table, params) {
    if (!API_URL || !API_KEY) return { ok: false, data: null };
    try {
      const query = new URLSearchParams(params || {});
      const response = await fetch(`${API_URL}/rest/v1/${table}?${query.toString()}`, {
        headers: headers()
      });
      return { ok: response.ok, data: await response.json().catch(() => null) };
    } catch (_) {
      return { ok: false, data: null };
    }
  }

  function truthy(data) {
    const row = Array.isArray(data) ? data[0] : data;
    if (row === true || row === 1) return true;
    if (typeof row === "string") {
      const value = row.trim().toLowerCase();
      if (["true","t","1","ok","yes"].includes(value)) return true;
      if (value.startsWith("(")) {
        const first = value.slice(1).split(",")[0].replace(/^"|"$/g, "").trim();
        return ["true","t","1","ok","yes"].includes(first);
      }
      return false;
    }
    return !!(row && typeof row === "object" && (
      row.ok === true || row.access === true || row.access_ok === true ||
      row.has_access === true || row.valid === true || row.allowed === true ||
      row.active === true
    ));
  }

  function parsePinResult(data, fallbackPhone) {
    const row = Array.isArray(data) ? data[0] : data;
    if (row === true || row === 1) return { ok: true, phone: fallbackPhone };
    if (typeof row === "string") {
      const text = row.trim();
      if (["true","t","1","ok","yes"].includes(text.toLowerCase())) {
        return { ok: true, phone: fallbackPhone };
      }
      if (text.startsWith("(") && text.endsWith(")")) {
        const parts = text.slice(1, -1).split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        if (["true","t","1","ok","yes"].includes(String(parts[0] || "").toLowerCase())) {
          const returnedModule = String(parts[1] || "").toUpperCase();
          if (returnedModule && returnedModule !== MODULE) return null;
          return { ok: true, phone: normPhone(parts[2] || fallbackPhone) };
        }
      }
      return null;
    }
    if (!row || typeof row !== "object" || !truthy(row)) return null;
    const returnedModule = String(row.module || row.module_code || MODULE).trim().toUpperCase();
    if (returnedModule && returnedModule !== MODULE) return null;
    return {
      ok: true,
      phone: normPhone(row.phone || row.p_phone || fallbackPhone),
      slug: normSlug(row.slug || row.identifiant || row.owner_slug || ""),
      owner_id: row.owner_id || null,
      session_token: String(row.session_token || "")
    };
  }

  function strictSession(value) {
    if (!value || typeof value !== "object") return null;
    if (String(value.module || "").trim().toUpperCase() !== MODULE) return null;

    const phone = normPhone(value.phone || "");
    if (phone.length < 9) return null;

    if (value.access !== true || value.access_ok !== true || value.pin_session_ok !== true) return null;

    const verifiedAt = parseTime(value.verified_at) || parseTime(value.validated_at) || parseTime(value.ts);
    const expiresAt = parseTime(value.expires_at || value.expiresAt);
    const now = Date.now();

    if (!verifiedAt || !expiresAt) return null;
    if (verifiedAt > now + CLOCK_SKEW) return null;
    if (now - verifiedAt > MAX_AGE) return null;
    if (expiresAt <= now || expiresAt < verifiedAt) return null;
    if (expiresAt - verifiedAt > MAX_AGE + CLOCK_SKEW) return null;

    return {
      module: MODULE,
      slug: normSlug(value.slug || ""),
      phone,
      owner_id: value.owner_id || null,
      session_token: String(value.session_token || ""),
      access: true,
      access_ok: true,
      ok: true,
      pin_session_ok: true,
      verified: true,
      verified_at: verifiedAt,
      validated_at: new Date(verifiedAt).toISOString(),
      expires_at: expiresAt,
      source: String(value.source || "strict_session")
    };
  }

  function readSession() {
    for (const key of SESSION_KEYS) {
      for (const raw of [get(sessionStorage, key), get(localStorage, key)]) {
        const session = strictSession(safeJson(raw));
        if (session) return session;
      }
    }
    return null;
  }

  function saveSession(value) {
    const now = Date.now();
    const verifiedAt = parseTime(value?.verified_at || value?.validated_at) || now;
    const requestedExpiry = parseTime(value?.expires_at);
    const expiresAt = Math.min(
      requestedExpiry > verifiedAt ? requestedExpiry : verifiedAt + MAX_AGE,
      verifiedAt + MAX_AGE
    );

    const session = strictSession({
      module: MODULE,
      slug: normSlug(value?.slug || state.slug || ""),
      phone: normPhone(value?.phone || state.phone || ""),
      owner_id: value?.owner_id || null,
      session_token: value?.session_token || "",
      access: true,
      access_ok: true,
      pin_session_ok: true,
      verified_at: verifiedAt,
      expires_at: expiresAt,
      source: value?.source || "pin.html"
    });

    if (!session) throw new Error("Session JOBS invalide.");

    const raw = JSON.stringify(session);
    SESSION_KEYS.forEach((key) => {
      set(sessionStorage, key, raw);
      set(localStorage, key, raw);
    });

    JOB_PHONE_KEYS.forEach((key) => {
      set(sessionStorage, key, session.phone);
      remove(localStorage, key);
    });

    JOB_SLUG_KEYS.forEach((key) => {
      if (session.slug) set(sessionStorage, key, session.slug);
      remove(localStorage, key);
    });

    window.DIGIY_JOBS_HUB_PHONE = session.phone;
    cleanUrl();
    return session;
  }

  function clearSession() {
    SESSION_KEYS.forEach(removeBoth);
    JOB_PHONE_KEYS.forEach(removeBoth);
    JOB_SLUG_KEYS.forEach(removeBoth);
    LEGACY_KEYS.forEach(removeBoth);
    try {
      delete window.DIGIY_ACCESS;
      delete window.DIGIY_JOBS_HUB_PHONE;
    } catch (_) {}
  }

  async function resolveSubByPhone(phone) {
    const clean = normPhone(phone);
    if (!clean) return null;
    for (const moduleCode of [MODULE, MODULE.toLowerCase()]) {
      const result = await tableGet("digiy_subscriptions_public", {
        select: "phone,slug,module",
        phone: `eq.${clean}`,
        module: `eq.${moduleCode}`,
        limit: "1"
      });
      if (result.ok && Array.isArray(result.data) && result.data[0]) {
        return {
          phone: normPhone(result.data[0].phone),
          slug: normSlug(result.data[0].slug),
          module: String(result.data[0].module || MODULE).toUpperCase()
        };
      }
    }
    return null;
  }

  async function resolveSubBySlug(slug) {
    const clean = normSlug(slug);
    if (!clean) return null;
    for (const moduleCode of [MODULE, MODULE.toLowerCase()]) {
      const result = await tableGet("digiy_subscriptions_public", {
        select: "phone,slug,module",
        slug: `eq.${clean}`,
        module: `eq.${moduleCode}`,
        limit: "1"
      });
      if (result.ok && Array.isArray(result.data) && result.data[0]) {
        return {
          phone: normPhone(result.data[0].phone),
          slug: normSlug(result.data[0].slug),
          module: String(result.data[0].module || MODULE).toUpperCase()
        };
      }
    }
    return null;
  }

  async function checkAccessFromAbos(phone) {
    const clean = normPhone(phone);
    if (!clean) return false;
    for (const moduleCode of [MODULE, MODULE.toLowerCase()]) {
      const result = await rpc("digiy_has_module_access_from_abos", {
        p_phone: clean,
        p_module: moduleCode
      });
      if (result.ok && truthy(result.data)) return true;
    }
    return false;
  }

  async function checkAccessLegacy(phone) {
    const clean = normPhone(phone);
    if (!clean) return false;
    for (const moduleCode of [MODULE, MODULE.toLowerCase()]) {
      const result = await rpc("digiy_has_access", {
        p_phone: clean,
        p_module: moduleCode
      });
      if (result.ok && truthy(result.data)) return true;
    }
    return false;
  }

  async function checkAccess(phone) {
    return await checkAccessFromAbos(phone) || await checkAccessLegacy(phone);
  }

  async function loginWithPin(phone, pin) {
    const cleanPhone = normPhone(phone);
    const cleanPin = normPin(pin);
    if (cleanPhone.length < 9) return { ok: false, error: "Numéro incomplet." };
    if (cleanPin.length !== 4) return { ok: false, error: "Code à 4 chiffres requis." };

    let auth = null;
    for (const moduleCode of [MODULE, MODULE.toLowerCase()]) {
      const result = await rpc("digiy_verify_pin", {
        p_phone: cleanPhone,
        p_module: moduleCode,
        p_pin: cleanPin
      });
      if (!result.ok) continue;
      auth = parsePinResult(result.data, cleanPhone);
      if (auth?.ok) break;
    }

    if (!auth?.ok) return { ok: false, error: "Code incorrect ou accès non reconnu." };

    const finalPhone = normPhone(auth.phone || cleanPhone);
    if (!await checkAccess(finalPhone)) {
      return { ok: false, error: "Accès PRO JOB inactif." };
    }

    let finalSlug = normSlug(auth.slug || "");
    if (!finalSlug) finalSlug = normSlug((await resolveSubByPhone(finalPhone))?.slug || "");

    const session = saveSession({
      slug: finalSlug,
      phone: finalPhone,
      owner_id: auth.owner_id || null,
      session_token: auth.session_token || "",
      verified_at: Date.now(),
      expires_at: Date.now() + MAX_AGE,
      source: "pin.html"
    });

    apply(session, "pin_login");
    return {
      ok: true,
      slug: session.slug,
      phone: session.phone,
      owner_id: session.owner_id,
      expires_at: session.expires_at
    };
  }

  function apply(session, source) {
    Object.assign(state, session, {
      access: true,
      access_ok: true,
      pin_session_ok: true,
      preview: false,
      ready_flag: true,
      error: null,
      source: source || session.source || "session",
      pin_url: PIN_URL,
      pay_url: CARNET_URL
    });
    window.DIGIY_ACCESS = { ...state };
    showPage();
    return { ...state };
  }

  function deny(message, redirect = true) {
    clearSession();
    Object.assign(state, {
      slug: "",
      phone: "",
      owner_id: null,
      access: false,
      access_ok: false,
      pin_session_ok: false,
      preview: true,
      ready_flag: true,
      verified_at: null,
      validated_at: null,
      expires_at: null,
      error: message || "Session absente ou expirée.",
      source: "denied"
    });
    if (isPinPage() || redirect === false) {
      showPage();
      return { ...state };
    }
    location.replace(PIN_URL);
    return { ...state };
  }

  async function check(options = {}) {
    cleanUrl();
    LEGACY_KEYS.forEach(removeBoth);

    const session = readSession();
    if (!session) return deny("Session absente ou expirée.", options.redirect !== false);
    if (!await checkAccess(session.phone)) return deny("Accès PRO JOB inactif.", options.redirect !== false);

    return apply(saveSession({ ...session, source: "strict_refresh" }), "strict_session");
  }

  function ready(options = {}) {
    if (!isPinPage()) hidePage();
    if (state.ready_flag && state.access_ok) return Promise.resolve({ ...state });
    if (!pending) pending = check(options).finally(() => { pending = null; });
    return pending;
  }

  function logout() {
    clearSession();
    location.replace(PIN_URL);
  }

  window.DIGIY_GUARD = {
    VERSION: "jobs-guard-strict-pin8h-20260716",
    state,
    ready,
    refresh(options = {}) {
      state.ready_flag = false;
      state.error = null;
      pending = null;
      return ready(options);
    },
    getSession() { return { ...state }; },
    getSlug() { return normSlug(state.slug); },
    getPhone() { return normPhone(state.phone); },
    getOwnerId() { return state.owner_id || null; },
    getModule() { return MODULE; },
    isAuthenticated() { return !!state.access_ok && parseTime(state.expires_at) > Date.now(); },
    saveSession,
    clearSession,
    clearAll: clearSession,
    loginWithPin,
    logout,
    buildPinUrl() { return PIN_URL; },
    goPin() { location.replace(PIN_URL); },
    buildPayUrl() { return CARNET_URL; },
    goPay() { location.href = CARNET_URL; },
    cleanUrl,
    resolveSubBySlug,
    resolveSubByPhone,
    checkAccess,
    checkAccessFromAbos,
    checkAccessLegacy,
    getSb() { return null; }
  };

  cleanUrl();
  LEGACY_KEYS.forEach(removeBoth);
  if (isPinPage()) showPage();
  else ready({ redirect: true }).catch(() => deny("Erreur de contrôle d’accès.", true));
})();
