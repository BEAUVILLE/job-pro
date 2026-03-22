// guard.js — DIGIY JOBS PRO
// Doctrine : PIN une seule fois -> session locale fraîche -> navigation interne directe
// Rail d'accès/session = slug + phone
// Rail métier = candidate.id / offer_id
(() => {
  "use strict";

  const SUPABASE_URL =
    window.DIGIY_SUPABASE_URL ||
    "https://wesqmwjjtsefyjnluosj.supabase.co";

  const SUPABASE_ANON_KEY =
    window.DIGIY_SUPABASE_ANON ||
    window.DIGIY_SUPABASE_ANON_KEY ||
    "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3";

  const MODULE_CODE = String(window.DIGIY_MODULE || "JOBS").trim().toUpperCase();
  const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h

  const SESSION_KEYS = [
    "DIGIY_JOBS_PIN_SESSION",
    "DIGIY_PIN_SESSION",
    "DIGIY_ACCESS",
    "DIGIY_SESSION_JOBS",
    "digiy_jobs_session"
  ];

  const SLUG_STORAGE_KEY = "digiy_jobs_slug";
  const PHONE_STORAGE_KEY = "digiy_jobs_phone";

  const qs = new URLSearchParams(location.search);
  const slugQ = (qs.get("slug") || "").trim();
  const phoneQ = (qs.get("phone") || "").trim();

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function normPhone(value) {
    const raw = String(value || "").trim();
    const cleaned = raw.replace(/[^\d+]/g, "");
    const digits = cleaned.replace(/[^\d]/g, "");
    if (digits.length < 9) return "";
    return cleaned.startsWith("+") ? `+${digits}` : digits;
  }

  function normSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function upper(value) {
    return String(value || "").trim().toUpperCase();
  }

  function nowMs() {
    return Date.now();
  }

  function isRecent(ts) {
    const n = Number(ts || 0);
    if (!n) return false;
    return (nowMs() - n) <= SESSION_MAX_AGE_MS;
  }

  function saveSlugOnly(slug) {
    const clean = normSlug(slug);
    if (!clean) return;
    try {
      localStorage.setItem(SLUG_STORAGE_KEY, clean);
    } catch (_) {}
  }

  function savePhoneOnly(phone) {
    const clean = normPhone(phone);
    if (!clean) return;
    try {
      localStorage.setItem(PHONE_STORAGE_KEY, clean);
    } catch (_) {}
  }

  function readSavedSlug() {
    try {
      return normSlug(localStorage.getItem(SLUG_STORAGE_KEY) || "");
    } catch (_) {
      return "";
    }
  }

  function readSavedPhone() {
    try {
      return normPhone(localStorage.getItem(PHONE_STORAGE_KEY) || "");
    } catch (_) {
      return "";
    }
  }

  function clearSessionsOnly() {
    for (const key of SESSION_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch (_) {}
    }
  }

  function clearAllLocalState() {
    clearSessionsOnly();
    try { localStorage.removeItem(SLUG_STORAGE_KEY); } catch (_) {}
    try { localStorage.removeItem(PHONE_STORAGE_KEY); } catch (_) {}
  }

  function readStoredSession() {
    for (const key of SESSION_KEYS) {
      const parsed = safeJsonParse(localStorage.getItem(key));
      if (!parsed || typeof parsed !== "object") continue;

      const moduleName = upper(parsed.module || parsed.module_code || "");
      const slug = normSlug(parsed.slug || "");
      const phone = normPhone(parsed.phone || "");
      const access = !!parsed.access;
      const verifiedAt =
        Number(parsed.verified_at || parsed.ts || parsed.created_at || 0) || 0;

      if (!slug) continue;
      if (moduleName && moduleName !== MODULE_CODE) continue;
      if (!isRecent(verifiedAt)) continue;
      if (!access) continue;

      return {
        key,
        slug,
        phone,
        module: MODULE_CODE,
        owner_id: parsed.owner_id || null,
        access: true,
        verified_at: verifiedAt
      };
    }

    return null;
  }

  function saveSession(payload = {}) {
    const session = {
      slug: normSlug(payload.slug || state.slug || ""),
      phone: normPhone(payload.phone || state.phone || ""),
      owner_id: payload.owner_id || state.owner_id || null,
      module: MODULE_CODE,
      access: !!payload.access,
      verified_at: Number(payload.verified_at || nowMs()),
      ts: nowMs()
    };

    for (const key of SESSION_KEYS) {
      try {
        localStorage.setItem(key, JSON.stringify(session));
      } catch (_) {}
    }

    saveSlugOnly(session.slug);
    savePhoneOnly(session.phone);
    return session;
  }

  function buildPinUrl(input = {}) {
    const url = new URL("./pin.html", location.href);

    const slug = normSlug(input.slug || state.slug || "");
    const phone = normPhone(input.phone || state.phone || "");

    if (slug) url.searchParams.set("slug", slug);
    if (phone) url.searchParams.set("phone", phone);

    url.searchParams.set("return", location.href);
    return url.toString();
  }

  function goPin(input = {}) {
    location.replace(buildPinUrl(input));
  }

  const stored = readStoredSession();
  const savedSlug = readSavedSlug();
  const savedPhone = readSavedPhone();

  const state = {
    module: MODULE_CODE,
    slug: normSlug(slugQ || stored?.slug || savedSlug || ""),
    phone: normPhone(phoneQ || stored?.phone || savedPhone || ""),
    owner_id: stored?.owner_id || null,
    access: false,
    preview: true,
    ready_flag: false,
    error: null,
    pin_url: "",
    source: stored
      ? "session"
      : (slugQ || phoneQ)
        ? "query"
        : (savedSlug || savedPhone)
          ? "storage"
          : "none",
    verified_at: stored?.verified_at || null
  };

  let pendingPromise = null;

  async function check() {
    const storedSession = readStoredSession();
    const persistedSlug = readSavedSlug();
    const persistedPhone = readSavedPhone();

    const slug = normSlug(slugQ || storedSession?.slug || state.slug || persistedSlug || "");
    const phone = normPhone(phoneQ || storedSession?.phone || state.phone || persistedPhone || "");
    const verifiedAt = Number(storedSession?.verified_at || state.verified_at || 0) || 0;

    state.slug = slug;
    state.phone = phone;
    state.verified_at = verifiedAt;
    state.pin_url = buildPinUrl({ slug, phone });
    state.error = null;

    if (slug) saveSlugOnly(slug);
    if (phone) savePhoneOnly(phone);

    if (!slug) {
      clearSessionsOnly();
      state.access = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Slug JOBS absent.";
      goPin({ slug, phone });
      return { ...state };
    }

    // Pas de session fraîche -> retour PIN
    if (!verifiedAt || !isRecent(verifiedAt)) {
      clearSessionsOnly();
      if (slug) saveSlugOnly(slug);
      if (phone) savePhoneOnly(phone);
      state.access = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Session PIN absente ou expirée.";
      goPin({ slug, phone });
      return { ...state };
    }

    // Session fraîche = on laisse circuler
    state.access = true;
    state.preview = false;
    state.ready_flag = true;
    state.verified_at = verifiedAt || nowMs();

    saveSession({
      slug,
      phone,
      owner_id: state.owner_id,
      access: true,
      verified_at: state.verified_at
    });

    try {
      const url = new URL(location.href);
      const currentSlug = normSlug(url.searchParams.get("slug") || "");
      const currentPhone = normPhone(url.searchParams.get("phone") || "");

      if (slug && currentSlug !== slug) {
        url.searchParams.set("slug", slug);
      }

      if (phone && currentPhone !== phone) {
        url.searchParams.set("phone", phone);
      }

      history.replaceState({}, "", url.toString());
    } catch (_) {}

    return { ...state };
  }

  window.DIGIY_GUARD = {
    state,

    async ready() {
      if (state.ready_flag) return { ...state };
      if (!pendingPromise) {
        pendingPromise = check().finally(() => {
          pendingPromise = null;
        });
      }
      return pendingPromise;
    },

    async refresh() {
      state.ready_flag = false;
      state.error = null;
      pendingPromise = null;
      return this.ready();
    },

    getSession() {
      return { ...state };
    },

    saveSession(payload = {}) {
      const saved = saveSession(payload);
      state.slug = saved.slug;
      state.phone = saved.phone;
      state.owner_id = saved.owner_id || state.owner_id || null;
      state.access = !!saved.access;
      state.preview = !saved.access;
      state.verified_at = saved.verified_at;
      state.ready_flag = true;
      state.error = null;
      return saved;
    },

    clearSession() {
      clearSessionsOnly();
      state.access = false;
      state.preview = true;
      state.ready_flag = false;
      state.error = null;
    },

    clearAll() {
      clearAllLocalState();
      state.access = false;
      state.preview = true;
      state.ready_flag = false;
      state.error = null;
      state.slug = "";
      state.phone = "";
      state.owner_id = null;
      state.verified_at = null;
    },

    goPin(input = {}) {
      goPin({ ...state, ...input });
    },

    goPay(input = {}) {
      goPin({ ...state, ...input });
    },

    buildPinUrl(input = {}) {
      return buildPinUrl({ ...state, ...input });
    }
  };
})();
