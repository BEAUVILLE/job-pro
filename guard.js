// guard.js — DIGIY JOBS PRO bureau guard blindé
// Logique : PIN d’abord -> session valide -> check accès module -> bureau
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

  // Session bureau PIN : courte durée
  const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8h

  // Clés de session acceptées
  const SESSION_KEYS = [
    "DIGIY_JOBS_PIN_SESSION",
    "DIGIY_PIN_SESSION",
    "DIGIY_ACCESS",
    "DIGIY_SESSION_JOBS",
    "digiy_jobs_session"
  ];

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
    const d = String(value || "").replace(/[^\d]/g, "");
    return d.length >= 9 ? d : "";
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

  function clearSessions() {
    for (const key of SESSION_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch (_) {}
    }
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

      if (!phone) continue;
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

    const targetKeys = [
      "DIGIY_JOBS_PIN_SESSION",
      "DIGIY_PIN_SESSION",
      "DIGIY_ACCESS",
      "DIGIY_SESSION_JOBS",
      "digiy_jobs_session"
    ];

    for (const key of targetKeys) {
      try {
        localStorage.setItem(key, JSON.stringify(session));
      } catch (_) {}
    }

    return session;
  }

  async function rpc(name, params) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(params || {})
    });

    let data = null;
    try {
      data = await r.json();
    } catch (_) {}

    return { ok: r.ok, status: r.status, data };
  }

  function parseAccessResult(res) {
    if (!res || !res.ok) return false;
    const data = res.data;

    if (data === true) return true;
    if (typeof data === "boolean") return data;
    if (data && typeof data.ok === "boolean") return data.ok;
    if (data && typeof data.has_access === "boolean") return data.has_access;
    if (data && typeof data.access === "boolean") return data.access;

    return false;
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

  const state = {
    module: MODULE_CODE,
    slug: normSlug(slugQ || stored?.slug || ""),
    phone: normPhone(phoneQ || stored?.phone || ""),
    owner_id: stored?.owner_id || null,
    access: false,
    preview: true,
    ready_flag: false,
    error: null,
    pin_url: "",
    source: stored ? "session" : "query",
    verified_at: stored?.verified_at || null
  };

  let pendingPromise = null;

  async function check() {
    const storedSession = readStoredSession();

    let slug = normSlug(slugQ || storedSession?.slug || state.slug || "");
    let phone = normPhone(phoneQ || storedSession?.phone || state.phone || "");
    let verifiedAt = Number(storedSession?.verified_at || state.verified_at || 0) || 0;

    state.slug = slug;
    state.phone = phone;
    state.verified_at = verifiedAt;
    state.pin_url = buildPinUrl({ slug, phone });
    state.error = null;

    // On ne laisse jamais le slug seul ouvrir le bureau
    if (!phone || !verifiedAt || !isRecent(verifiedAt)) {
      clearSessions();
      state.access = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Session PIN absente ou expirée.";
      goPin({ slug, phone });
      return { ...state };
    }

    // Vérification secondaire : abonnement module toujours actif
    const res = await rpc("digiy_has_access", {
      p_phone: phone,
      p_module: MODULE_CODE
    });

    const hasAccess = parseAccessResult(res);

    if (!hasAccess) {
      clearSessions();
      state.access = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = res.ok
        ? "Accès module JOBS non valide."
        : `digiy_has_access HTTP ${res.status}`;
      goPin({ slug, phone });
      return { ...state };
    }

    state.access = true;
    state.preview = false;
    state.ready_flag = true;

    saveSession({
      slug,
      phone,
      owner_id: state.owner_id,
      access: true,
      verified_at: verifiedAt || nowMs()
    });

    // Normalise l’URL si besoin
    try {
      const url = new URL(location.href);
      if (slug && (url.searchParams.get("slug") || "").trim().toLowerCase() !== slug) {
        url.searchParams.set("slug", slug);
        history.replaceState({}, "", url.toString());
      }
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
      return saveSession(payload);
    },

    clearSession() {
      clearSessions();
      state.access = false;
      state.preview = true;
      state.ready_flag = false;
    },

    goPin() {
      goPin(state);
    },

    buildPinUrl() {
      return buildPinUrl(state);
    }
  };
})();
