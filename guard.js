/* guard.js — DIGIY BUILD / MES SERVICES
   Doctrine :
   - URL visible propre : jamais de phone, tel, slug sensible ou return sale
   - session locale personnelle 8h
   - téléphone + slug restent dans le coffre local/session, pas dans la barre d’adresse
   - si session valide : navigation interne directe
   - si session absente/expirée : retour pin.html propre
   - Rail ABOS : digiy_has_module_access_from_abos(phone, "BUILD") d'abord
   - Secours transition : digiy_has_access(phone, "BUILD")
*/
(() => {
  "use strict";

  const CFG = {
    SUPABASE_URL:
      window.DIGIY_SUPABASE_URL ||
      "https://wesqmwjjtsefyjnluosj.supabase.co",

    SUPABASE_ANON_KEY:
      window.DIGIY_SUPABASE_ANON ||
      window.DIGIY_SUPABASE_ANON_KEY ||
      "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3",

    MODULE_CODE: String(window.DIGIY_MODULE || "BUILD").trim().toUpperCase(),
    MODULE_CODE_LOWER: String(window.DIGIY_MODULE || "BUILD").trim().toLowerCase(),

    SESSION_MAX_AGE_MS: 8 * 60 * 60 * 1000,

    PIN_PATH: window.DIGIY_LOGIN_URL || "./pin.html",
    PAY_URL: window.DIGIY_PAY_URL || "https://commencer-a-payer.digiylyfe.com/",

    RPC: {
      VERIFY_PIN: "digiy_verify_pin",
      HAS_MODULE_ACCESS_FROM_ABOS: "digiy_has_module_access_from_abos",
      HAS_ACCESS_LEGACY: "digiy_has_access"
    },

    TABLES: {
      SUBSCRIPTIONS_PUBLIC: "digiy_subscriptions_public"
    }
  };

  const MODULE = CFG.MODULE_CODE;
  const MODULE_LOWER = CFG.MODULE_CODE_LOWER;
  const MODULE_PREFIX = `digiy_${MODULE_LOWER}`;

  const MODULE_ALIASES = Array.from(new Set([
    MODULE,
    MODULE_LOWER,
    "BUILD",
    "build",
    "BUILD_PRO",
    "build_pro",
    "MES_SERVICES",
    "mes_services",
    "SERVICES",
    "services"
  ]));

  const STORAGE = {
    SESSION_KEYS: [
      `DIGIY_${MODULE}_PIN_SESSION`,
      `DIGIY_${MODULE}_SESSION`,
      `DIGIY_${MODULE}_ACCESS`,
      "DIGIY_MASTER_PIN_SESSION",
      "DIGIY_PIN_SESSION",
      "DIGIY_ACCESS",
      `${MODULE_PREFIX}_session`
    ],
    SLUG_KEY: `${MODULE_PREFIX}_slug`,
    PHONE_KEY: `${MODULE_PREFIX}_phone`,
    LAST_SLUG_KEY: `${MODULE_PREFIX}_last_slug`,
    LAST_PHONE_KEY: `${MODULE_PREFIX}_last_phone`,
    HUB_PHONE_KEY: `DIGIY_${MODULE}_HUB_PHONE`
  };

  const CLEAN_QUERY_KEYS = [
    "slug",
    "phone",
    "tel",
    "build_tel",
    "module",
    "from",
    "return",
    "v",
    "owner_phone",
    "p_phone",
    "pin",
    "code",
    "token",
    "session",
    "access"
  ];

  let pendingPromise = null;

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
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

  function normPhone(value) {
    const digits = String(value || "").replace(/[^\d]/g, "");
    if (!digits) return "";
    if (digits.startsWith("221") && digits.length === 12) return digits;
    if (digits.length === 9 && /^[37]/.test(digits)) return "221" + digits;
    return digits;
  }

  function normPin(value) {
    return String(value || "").trim().replace(/\s+/g, "");
  }

  function upper(value) {
    return String(value || "").trim().toUpperCase();
  }

  function nowMs() {
    return Date.now();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function parseTime(value) {
    if (value === null || value === undefined || value === "") return 0;

    if (typeof value === "number" && Number.isFinite(value)) {
      return value > 0 && value < 100000000000 ? value * 1000 : value;
    }

    const str = String(value).trim();
    if (!str) return 0;

    if (/^\d+$/.test(str)) {
      const n = Number(str);
      if (!Number.isFinite(n) || n <= 0) return 0;
      return n < 100000000000 ? n * 1000 : n;
    }

    const d = Date.parse(str);
    return Number.isFinite(d) ? d : 0;
  }

  function isRecent(ts) {
    const n = parseTime(ts);
    if (!n) return false;
    const age = nowMs() - n;
    return age >= 0 && age <= CFG.SESSION_MAX_AGE_MS;
  }

  function isSensitiveSlug(slug) {
    return /\d{7,}/.test(String(slug || ""));
  }

  function canExposeSlug(slug) {
    const clean = normSlug(slug);
    return !!clean && !isSensitiveSlug(clean);
  }

  function isLoginPage() {
    const path = String(location.pathname || "").toLowerCase();
    return path.endsWith("/pin.html") || path.endsWith("pin.html");
  }

  function isPublicEntryPage() {
    const path = String(location.pathname || "").toLowerCase();
    return path.endsWith("/") || path.endsWith("/index.html") || path.endsWith("index.html");
  }

  function hidePage() {
    try {
      document.documentElement.style.visibility = "hidden";
    } catch (_) {}
  }

  function showPage() {
    try {
      document.documentElement.style.visibility = "";
    } catch (_) {}
  }

  function jsonHeaders() {
    return {
      apikey: CFG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  }

  function getHeaders() {
    return {
      apikey: CFG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}`,
      Accept: "application/json"
    };
  }

  async function rpc(name, body) {
    const res = await fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(body || {})
    });

    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }

  async function tableGet(table, paramsObj) {
    const params = new URLSearchParams(paramsObj || {});
    const res = await fetch(`${CFG.SUPABASE_URL}/rest/v1/${table}?${params.toString()}`, {
      method: "GET",
      headers: getHeaders()
    });

    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }

  function boolFromRpcData(data) {
    const raw = Array.isArray(data) ? data[0] : data;

    if (raw === true) return true;
    if (raw === 1) return true;

    if (typeof raw === "string") {
      const txt = raw.trim().toLowerCase();

      if (txt === "true" || txt === "t" || txt === "1" || txt === "yes" || txt === "ok") {
        return true;
      }

      if (txt.startsWith("(")) {
        const first = txt.replace(/^\(/, "").split(",")[0];
        const token = String(first || "").trim().replace(/^"|"$/g, "").toLowerCase();
        if (token === "t" || token === "true" || token === "1") return true;
      }

      return false;
    }

    if (raw && typeof raw === "object") {
      if (raw.ok === true) return true;
      if (raw.access === true) return true;
      if (raw.access_ok === true) return true;
      if (raw.has_access === true) return true;
      if (raw.allowed === true) return true;
      if (raw.active === true) return true;
      if (raw.is_active === true) return true;
      if (raw.subscribed === true) return true;
      if (raw.valid === true) return true;

      const vals = Object.values(raw);
      if (vals.some((v) => v === true || v === 1 || v === "t" || v === "true")) {
        return true;
      }
    }

    return false;
  }

  async function tryRpcBoolean(name, payloads) {
    for (const body of payloads) {
      try {
        const res = await rpc(name, body);
        if (!res.ok) continue;
        if (boolFromRpcData(res.data)) return true;
      } catch (_) {}
    }

    return false;
  }

  function readSessionStorage(key) {
    try {
      return sessionStorage.getItem(key) || "";
    } catch (_) {
      return "";
    }
  }

  function readLocalStorage(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch (_) {
      return "";
    }
  }

  function writeSessionStorage(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (_) {}
  }

  function writeLocalStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  }

  function removeSessionStorage(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (_) {}
  }

  function removeLocalStorage(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }

  function removeBoth(key) {
    removeSessionStorage(key);
    removeLocalStorage(key);
  }

  function saveSlugOnly(slug) {
    const clean = normSlug(slug);
    if (!clean) return;

    writeSessionStorage(STORAGE.SLUG_KEY, clean);
    writeSessionStorage(STORAGE.LAST_SLUG_KEY, clean);

    if (canExposeSlug(clean)) {
      writeLocalStorage(STORAGE.SLUG_KEY, clean);
      writeLocalStorage(STORAGE.LAST_SLUG_KEY, clean);
    } else {
      removeLocalStorage(STORAGE.SLUG_KEY);
      removeLocalStorage(STORAGE.LAST_SLUG_KEY);
    }
  }

  function savePhoneOnly(phone) {
    const clean = normPhone(phone);
    if (!clean) return;

    writeSessionStorage(STORAGE.PHONE_KEY, clean);
    writeSessionStorage(STORAGE.LAST_PHONE_KEY, clean);
    writeSessionStorage(STORAGE.HUB_PHONE_KEY, clean);

    removeLocalStorage(STORAGE.PHONE_KEY);
    removeLocalStorage(STORAGE.LAST_PHONE_KEY);
    removeLocalStorage(STORAGE.HUB_PHONE_KEY);

    window[STORAGE.HUB_PHONE_KEY] = clean;
  }

  function readSavedSlug() {
    const candidate =
      readSessionStorage(STORAGE.SLUG_KEY) ||
      readSessionStorage(STORAGE.LAST_SLUG_KEY) ||
      readLocalStorage(STORAGE.SLUG_KEY) ||
      readLocalStorage(STORAGE.LAST_SLUG_KEY) ||
      "";

    const clean = normSlug(candidate);

    if (clean && isSensitiveSlug(clean)) {
      removeLocalStorage(STORAGE.SLUG_KEY);
      removeLocalStorage(STORAGE.LAST_SLUG_KEY);
    }

    return clean;
  }

  function readSavedPhone() {
    return normPhone(
      readSessionStorage(STORAGE.PHONE_KEY) ||
      readSessionStorage(STORAGE.LAST_PHONE_KEY) ||
      readSessionStorage(STORAGE.HUB_PHONE_KEY) ||
      window[STORAGE.HUB_PHONE_KEY] ||
      ""
    );
  }

  function readUrlContext() {
    try {
      const url = new URL(location.href);

      return {
        slug: normSlug(url.searchParams.get("slug") || ""),
        phone: normPhone(
          url.searchParams.get("phone") ||
          url.searchParams.get("tel") ||
          url.searchParams.get("build_tel") ||
          url.searchParams.get("owner_phone") ||
          url.searchParams.get("p_phone") ||
          ""
        )
      };
    } catch (_) {
      return { slug: "", phone: "" };
    }
  }

  function cleanVisibleUrl() {
    try {
      const url = new URL(location.href);

      const incomingSlug = normSlug(url.searchParams.get("slug") || "");
      const incomingPhone = normPhone(
        url.searchParams.get("phone") ||
        url.searchParams.get("tel") ||
        url.searchParams.get("build_tel") ||
        url.searchParams.get("owner_phone") ||
        url.searchParams.get("p_phone") ||
        ""
      );

      if (incomingSlug) saveSlugOnly(incomingSlug);
      if (incomingPhone) savePhoneOnly(incomingPhone);

      let changed = false;

      CLEAN_QUERY_KEYS.forEach((key) => {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      });

      const slug = normSlug(url.searchParams.get("slug") || "");
      if (slug && isSensitiveSlug(slug)) {
        url.searchParams.delete("slug");
        changed = true;
      }

      if (changed) {
        history.replaceState({}, document.title, url.pathname + url.search + url.hash);
      }
    } catch (_) {}
  }

  function cleanInternalUrl(raw, fallback = "./dashboard-pro.html") {
    const input = String(raw || "").trim() || fallback;

    try {
      const url = new URL(input, location.href);

      CLEAN_QUERY_KEYS.forEach((key) => {
        url.searchParams.delete(key);
      });

      const slug = normSlug(url.searchParams.get("slug") || "");
      if (slug && isSensitiveSlug(slug)) {
        url.searchParams.delete("slug");
      }

      if (url.origin === location.origin) {
        const file = url.pathname.split("/").pop() || "dashboard-pro.html";
        return `./${file}${url.search || ""}${url.hash || ""}`;
      }

      return url.toString();
    } catch (_) {
      return fallback;
    }
  }

  function clearSessionsOnly() {
    for (const key of STORAGE.SESSION_KEYS) {
      removeBoth(key);
    }
  }

  function clearAllLocalState() {
    clearSessionsOnly();

    removeBoth(STORAGE.SLUG_KEY);
    removeBoth(STORAGE.PHONE_KEY);
    removeBoth(STORAGE.LAST_SLUG_KEY);
    removeBoth(STORAGE.LAST_PHONE_KEY);
    removeBoth(STORAGE.HUB_PHONE_KEY);

    try {
      delete window[STORAGE.HUB_PHONE_KEY];
      delete window.DIGIY_ACCESS;
    } catch (_) {}
  }

  function readStoredSession() {
    for (const key of STORAGE.SESSION_KEYS) {
      let parsed = safeJsonParse(readSessionStorage(key));
      if (!parsed) parsed = safeJsonParse(readLocalStorage(key));

      if (!parsed || typeof parsed !== "object") continue;

      const moduleName = upper(parsed.module || parsed.module_code || "");
      const slug = normSlug(parsed.slug || "");
      const phone = normPhone(parsed.phone || "");
      const owner_id = parsed.owner_id || null;

      const access =
        parsed.access === true ||
        parsed.access_ok === true ||
        parsed.ok === true ||
        parsed.has_access === true ||
        parsed.pin_session_ok === true;

      const verifiedAt =
        parseTime(parsed.verified_at) ||
        parseTime(parsed.validated_at_ms) ||
        parseTime(parsed.ts) ||
        parseTime(parsed.created_at) ||
        0;

      const expiresAt = parseTime(parsed.expires_at || parsed.expiresAt || 0);
      const validatedAtIso = parsed.validated_at || null;

      const ageOk =
        (expiresAt && nowMs() < expiresAt) ||
        (verifiedAt && isRecent(verifiedAt)) ||
        (validatedAtIso && isRecent(validatedAtIso));

      if (!slug && !phone) continue;
      if (moduleName && moduleName !== MODULE) continue;
      if (!ageOk) continue;
      if (!access) continue;

      return {
        key,
        slug,
        phone,
        owner_id,
        module: MODULE,
        access: true,
        access_ok: true,
        pin_session_ok: true,
        verified_at: verifiedAt || nowMs(),
        validated_at: validatedAtIso || new Date(verifiedAt || nowMs()).toISOString(),
        expires_at: expiresAt || (nowMs() + CFG.SESSION_MAX_AGE_MS)
      };
    }

    return null;
  }

  function buildPinUrl() {
    return cleanInternalUrl(CFG.PIN_PATH, "./pin.html");
  }

  function goPin() {
    if (isLoginPage()) {
      showPage();
      return;
    }

    location.replace(buildPinUrl());
  }

  function buildPayUrl() {
    const url = new URL(CFG.PAY_URL);
    url.searchParams.set("module", MODULE);
    url.searchParams.set("return", cleanInternalUrl(location.href, "./dashboard-pro.html"));
    return url.toString();
  }

  function goPay() {
    location.replace(buildPayUrl());
  }

  const stored = readStoredSession();
  const savedSlug = readSavedSlug();
  const savedPhone = readSavedPhone();

  const state = {
    module: MODULE,
    slug: normSlug(stored?.slug || savedSlug || ""),
    phone: normPhone(stored?.phone || savedPhone || ""),
    owner_id: stored?.owner_id || null,
    access: false,
    access_ok: false,
    pin_session_ok: false,
    preview: true,
    ready_flag: false,
    error: null,
    source: stored ? "session" : (savedSlug || savedPhone) ? "storage" : "none",
    verified_at: stored?.verified_at || null,
    validated_at: stored?.validated_at || null,
    expires_at: stored?.expires_at || null,
    pin_url: buildPinUrl(),
    pay_url: buildPayUrl()
  };

  function saveSession(payload = {}) {
    const verifiedAtMs = parseTime(payload.verified_at || payload.validated_at_ms || 0) || nowMs();

    const expiresAtMs =
      parseTime(payload.expires_at || payload.expiresAt || 0) ||
      verifiedAtMs + CFG.SESSION_MAX_AGE_MS;

    const validatedAtIso =
      payload.validated_at ||
      (verifiedAtMs ? new Date(verifiedAtMs).toISOString() : nowIso());

    const session = {
      slug: normSlug(payload.slug || state.slug || ""),
      phone: normPhone(payload.phone || state.phone || ""),
      owner_id: payload.owner_id || state.owner_id || null,
      module: MODULE,
      access: !!payload.access,
      access_ok: !!payload.access,
      ok: !!payload.access,
      pin_session_ok: !!payload.access,
      verified_at: verifiedAtMs,
      validated_at: validatedAtIso,
      expires_at: expiresAtMs,
      ts: nowMs()
    };

    const raw = JSON.stringify(session);

    for (const key of STORAGE.SESSION_KEYS) {
      writeSessionStorage(key, raw);
      writeLocalStorage(key, raw);
    }

    if (session.slug) saveSlugOnly(session.slug);
    if (session.phone) savePhoneOnly(session.phone);

    try {
      window.DIGIY_ACCESS = Object.assign({}, window.DIGIY_ACCESS || {}, session);
    } catch (_) {}

    cleanVisibleUrl();

    return session;
  }

  async function resolveSubBySlug(slug) {
    const s = normSlug(slug);
    if (!s) return null;

    const tries = [
      { select: "phone,slug,module", slug: `eq.${s}`, module: `eq.${MODULE}`, limit: "1" },
      { select: "phone,slug,module", slug: `eq.${s}`, module: `eq.${MODULE_LOWER}`, limit: "1" },
      { select: "phone,slug,module", slug: `eq.${s}`, limit: "1" }
    ];

    for (const params of tries) {
      const res = await tableGet(CFG.TABLES.SUBSCRIPTIONS_PUBLIC, params);

      if (!res.ok || !Array.isArray(res.data) || !res.data[0]) continue;

      return {
        slug: normSlug(res.data[0].slug),
        phone: normPhone(res.data[0].phone),
        module: upper(res.data[0].module || MODULE)
      };
    }

    return null;
  }

  async function resolveSubByPhone(phone) {
    const p = normPhone(phone);
    if (!p) return null;

    const tries = [
      { select: "phone,slug,module", phone: `eq.${p}`, module: `eq.${MODULE}`, limit: "1" },
      { select: "phone,slug,module", phone: `eq.${p}`, module: `eq.${MODULE_LOWER}`, limit: "1" },
      { select: "phone,slug,module", phone: `eq.${p}`, limit: "1" }
    ];

    for (const params of tries) {
      const res = await tableGet(CFG.TABLES.SUBSCRIPTIONS_PUBLIC, params);

      if (!res.ok || !Array.isArray(res.data) || !res.data[0]) continue;

      return {
        slug: normSlug(res.data[0].slug),
        phone: normPhone(res.data[0].phone),
        module: upper(res.data[0].module || MODULE)
      };
    }

    return null;
  }

  function buildAccessPayloads(phone) {
    const p = normPhone(phone);
    const payloads = [];

    MODULE_ALIASES.forEach((moduleCode) => {
      payloads.push({ p_phone: p, p_module: moduleCode });
      payloads.push({ phone: p, module: moduleCode });
      payloads.push({ input_phone: p, input_module: moduleCode });
    });

    return payloads;
  }

  async function checkAccessFromAbos(phone) {
    const p = normPhone(phone);
    if (!p) return false;

    return tryRpcBoolean(
      CFG.RPC.HAS_MODULE_ACCESS_FROM_ABOS,
      buildAccessPayloads(p)
    );
  }

  async function checkAccessLegacy(phone) {
    const p = normPhone(phone);
    if (!p) return false;

    return tryRpcBoolean(
      CFG.RPC.HAS_ACCESS_LEGACY,
      buildAccessPayloads(p)
    );
  }

  async function checkAccess(phone) {
    const p = normPhone(phone);
    if (!p) return false;

    const abosOk = await checkAccessFromAbos(p);
    if (abosOk) return true;

    const legacyOk = await checkAccessLegacy(p);
    if (legacyOk) return true;

    return false;
  }

  function parseVerifyPinPayload(data, fallbackPhone = "") {
    const raw = Array.isArray(data) ? data[0] : data;

    if (!raw) return null;

    if (typeof raw === "object" && !Array.isArray(raw)) {
      if (
        raw.ok === true ||
        raw.ok === "t" ||
        raw.ok === "true" ||
        raw.access_ok === true ||
        raw.valid === true
      ) {
        return {
          ok: true,
          phone: normPhone(raw.phone || raw.p_phone || fallbackPhone || ""),
          module: upper(raw.module || raw.p_module || MODULE),
          owner_id: raw.owner_id || null,
          slug: normSlug(raw.slug || raw.owner_slug || "")
        };
      }

      const vals = Object.values(raw);

      if (vals.length >= 3) {
        const okLike =
          vals[0] === true ||
          vals[0] === "t" ||
          vals[0] === "true" ||
          vals[0] === 1;

        if (okLike) {
          return {
            ok: true,
            module: upper(vals[1] || MODULE),
            phone: normPhone(vals[2] || fallbackPhone || ""),
            owner_id: vals[4] || null,
            slug: ""
          };
        }
      }
    }

    if (typeof raw === "string") {
      const txt = raw.trim();

      if (txt.startsWith("(") && txt.endsWith(")")) {
        const tupleHead = txt.match(/^\(([^,]+),([^,]+),([^,]+),?(.*)\)$/);

        if (tupleHead) {
          const okToken = String(tupleHead[1] || "").trim().replace(/^"|"$/g, "");
          const modToken = String(tupleHead[2] || "").trim().replace(/^"|"$/g, "");
          const phoneToken = String(tupleHead[3] || "").trim().replace(/^"|"$/g, "");

          const okLike = okToken === "t" || okToken === "true" || okToken === "1";

          if (okLike) {
            return {
              ok: true,
              module: upper(modToken || MODULE),
              phone: normPhone(phoneToken || fallbackPhone || ""),
              owner_id: null,
              slug: ""
            };
          }
        }
      }
    }

    return null;
  }

  async function attemptPinLoginRPCs(phone, pin) {
    const ph = normPhone(phone);
    const p = normPin(pin);

    if (!p || !ph) return null;

    const tries = [
      { p_phone: ph, p_module: MODULE, p_pin: p },
      { p_phone: ph, p_module: MODULE_LOWER, p_pin: p }
    ];

    for (const body of tries) {
      const res = await rpc(CFG.RPC.VERIFY_PIN, body);

      if (!res.ok) continue;

      const parsed = parseVerifyPinPayload(res.data, ph);
      if (!parsed?.ok) continue;

      return {
        ok: true,
        slug: normSlug(parsed.slug || ""),
        phone: normPhone(parsed.phone || ph),
        owner_id: parsed.owner_id || null
      };
    }

    return null;
  }

  cleanVisibleUrl();

  async function loginWithPin(phoneOrSlug, pin) {
    const p = normPin(pin);
    let phone = normPhone(phoneOrSlug || state.phone || readSavedPhone() || "");
    let slug = normSlug(state.slug || readSavedSlug() || "");

    if (!p) return { ok: false, error: "Code manquant." };

    if (!phone && phoneOrSlug) {
      const maybeSlug = normSlug(phoneOrSlug);
      if (maybeSlug) {
        const sub = await resolveSubBySlug(maybeSlug);
        phone = normPhone(sub?.phone || "");
        slug = normSlug(sub?.slug || maybeSlug || slug || "");
      }
    }

    if (!phone && slug) {
      const sub = await resolveSubBySlug(slug);
      phone = normPhone(sub?.phone || "");
    }

    if (!phone) return { ok: false, error: "Téléphone manquant." };

    const auth = await attemptPinLoginRPCs(phone, p);
    if (!auth?.ok) return { ok: false, error: "Accès non reconnu." };

    const finalPhone = normPhone(auth.phone || phone);
    let finalSlug = normSlug(auth.slug || slug || "");

    if (!finalSlug && finalPhone) {
      const sub = await resolveSubByPhone(finalPhone);
      finalSlug = normSlug(sub?.slug || "");
    }

    if (!finalSlug && finalPhone) finalSlug = `${MODULE_LOWER}-${finalPhone}`;

    const accessOk = await checkAccess(finalPhone);
    if (!accessOk) return { ok: false, error: "Accès BUILD / Mes services inactif." };

    const saved = saveSession({
      slug: finalSlug,
      phone: finalPhone,
      owner_id: auth.owner_id || null,
      access: true,
      verified_at: nowMs(),
      validated_at: nowIso()
    });

    state.slug = saved.slug;
    state.phone = saved.phone;
    state.owner_id = saved.owner_id;
    state.access = true;
    state.access_ok = true;
    state.pin_session_ok = true;
    state.preview = false;
    state.ready_flag = true;
    state.error = null;
    state.verified_at = saved.verified_at;
    state.validated_at = saved.validated_at;
    state.expires_at = saved.expires_at;
    state.pin_url = buildPinUrl();
    state.pay_url = buildPayUrl();

    showPage();

    return {
      ok: true,
      slug: saved.slug,
      phone: saved.phone,
      owner_id: saved.owner_id || null
    };
  }

  function logout() {
    clearAllLocalState();

    state.slug = "";
    state.phone = "";
    state.owner_id = null;
    state.access = false;
    state.access_ok = false;
    state.pin_session_ok = false;
    state.preview = true;
    state.ready_flag = false;
    state.error = null;
    state.verified_at = null;
    state.validated_at = null;
    state.expires_at = null;
    state.pin_url = buildPinUrl();
    state.pay_url = buildPayUrl();

    showPage();
    goPin();
  }

  async function check(options = {}) {
    const opts = Object.assign(
      {
        redirect: true,
        preserve_validation: true
      },
      options || {}
    );

    cleanVisibleUrl();

    const storedSession = readStoredSession();
    let slug = normSlug(storedSession?.slug || state.slug || readSavedSlug() || "");
    let phone = normPhone(storedSession?.phone || state.phone || readSavedPhone() || "");
    let owner_id = storedSession?.owner_id || state.owner_id || null;
    let verifiedAt = parseTime(storedSession?.verified_at || state.verified_at || 0) || 0;
    let expiresAt = parseTime(storedSession?.expires_at || state.expires_at || 0) || 0;
    let validatedAt = storedSession?.validated_at || state.validated_at || null;

    state.slug = slug;
    state.phone = phone;
    state.owner_id = owner_id;
    state.verified_at = verifiedAt;
    state.validated_at = validatedAt;
    state.expires_at = expiresAt;
    state.pin_url = buildPinUrl();
    state.pay_url = buildPayUrl();
    state.error = null;

    if (slug) saveSlugOnly(slug);
    if (phone) savePhoneOnly(phone);

    if (slug && !phone) {
      const sub = await resolveSubBySlug(slug);
      if (sub?.phone) {
        phone = normPhone(sub.phone);
        state.phone = phone;
        savePhoneOnly(phone);
      }
    }

    if (phone && !slug) {
      const sub = await resolveSubByPhone(phone);
      if (sub?.slug) {
        slug = normSlug(sub.slug);
        state.slug = slug;
        saveSlugOnly(slug);
      }
    }

    const freshSession =
      (expiresAt && nowMs() < expiresAt) ||
      (!!verifiedAt && isRecent(verifiedAt)) ||
      (!!validatedAt && isRecent(validatedAt));

    if (!freshSession) {
      if (!opts.preserve_validation) clearSessionsOnly();
      else {
        clearSessionsOnly();
        if (slug) saveSlugOnly(slug);
        if (phone) savePhoneOnly(phone);
      }

      state.access = false;
      state.access_ok = false;
      state.pin_session_ok = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Session absente ou expirée.";
      state.pin_url = buildPinUrl();
      state.pay_url = buildPayUrl();

      showPage();

      if (opts.redirect !== false && !isLoginPage()) {
        goPin();
      }

      return { ...state };
    }

    state.access = true;
    state.access_ok = true;
    state.pin_session_ok = true;
    state.preview = false;
    state.ready_flag = true;
    state.error = null;

    const saved = saveSession({
      slug,
      phone,
      owner_id,
      access: true,
      verified_at: verifiedAt || nowMs(),
      expires_at: expiresAt || (nowMs() + CFG.SESSION_MAX_AGE_MS),
      validated_at: validatedAt || nowIso()
    });

    state.slug = saved.slug;
    state.phone = saved.phone;
    state.owner_id = saved.owner_id;
    state.verified_at = saved.verified_at;
    state.validated_at = saved.validated_at;
    state.expires_at = saved.expires_at;
    state.pin_url = buildPinUrl();
    state.pay_url = buildPayUrl();

    showPage();

    return { ...state };
  }

  function ready(options = {}) {
    const opts = Object.assign(
      {
        redirect: true,
        preserve_validation: true
      },
      options || {}
    );

    if (opts.redirect !== false && !isLoginPage() && !isPublicEntryPage()) {
      hidePage();
    }

    if (state.ready_flag) {
      showPage();
      return Promise.resolve({ ...state });
    }

    if (!pendingPromise) {
      pendingPromise = check(opts).finally(() => {
        pendingPromise = null;
      });
    }

    return pendingPromise;
  }

  window.DIGIY_GUARD = {
    VERSION: "build-guard-abos-central-v1-20260522",
    state,
    ready,

    async refresh(options = {}) {
      state.ready_flag = false;
      state.error = null;
      pendingPromise = null;
      return ready(options);
    },

    getSession() {
      return { ...state };
    },

    getSlug() {
      return normSlug(state.slug || "");
    },

    getPhone() {
      return normPhone(state.phone || "");
    },

    getOwnerId() {
      return state.owner_id || null;
    },

    getModule() {
      return MODULE;
    },

    isAuthenticated() {
      return !!state.access_ok;
    },

    saveSession(payload = {}) {
      const saved = saveSession(payload);

      state.slug = saved.slug;
      state.phone = saved.phone;
      state.owner_id = saved.owner_id || null;
      state.access = !!saved.access;
      state.access_ok = !!saved.access;
      state.pin_session_ok = !!saved.access;
      state.preview = !saved.access;
      state.verified_at = saved.verified_at;
      state.validated_at = saved.validated_at;
      state.expires_at = saved.expires_at;
      state.ready_flag = true;
      state.error = null;
      state.pin_url = buildPinUrl();
      state.pay_url = buildPayUrl();

      return saved;
    },

    clearSession() {
      clearSessionsOnly();
      state.access = false;
      state.access_ok = false;
      state.pin_session_ok = false;
      state.preview = true;
      state.ready_flag = false;
      state.error = null;
    },

    clearAll() {
      clearAllLocalState();
      state.access = false;
      state.access_ok = false;
      state.pin_session_ok = false;
      state.preview = true;
      state.ready_flag = false;
      state.error = null;
      state.slug = "";
      state.phone = "";
      state.owner_id = null;
      state.verified_at = null;
      state.validated_at = null;
      state.expires_at = null;
    },

    loginWithPin,
    logout,

    buildPinUrl() {
      return buildPinUrl();
    },

    goPin() {
      goPin();
    },

    buildPayUrl() {
      return buildPayUrl();
    },

    goPay() {
      goPay();
    },

    cleanUrl() {
      cleanVisibleUrl();
      return true;
    },

    async resolveSubBySlug(slug) {
      return resolveSubBySlug(slug);
    },

    async resolveSubByPhone(phone) {
      return resolveSubByPhone(phone);
    },

    async checkAccess(phone) {
      return checkAccess(phone || state.phone || "");
    },

    async checkAccessFromAbos(phone) {
      return checkAccessFromAbos(phone || state.phone || "");
    },

    async checkAccessLegacy(phone) {
      return checkAccessLegacy(phone || state.phone || "");
    }
  };

  if (isPublicEntryPage() || isLoginPage()) {
    ready({ redirect: false }).catch(() => showPage());
  } else {
    ready({ redirect: true }).catch(() => showPage());
  }
})();
