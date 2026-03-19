// guard.js — DIGIY JOBS PRO soft guard (slug-first, no auto-redirect, session-aware)
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
  const PAY_URL = "https://commencer-a-payer.digiylyfe.com/";

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

  function normPhone(p) {
    const d = String(p || "").replace(/[^\d]/g, "");
    return d.length >= 9 ? d : "";
  }

  function normSlug(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function upper(v) {
    return String(v || "").trim().toUpperCase();
  }

  function readStoredSession() {
    const keys = ["DIGIY_ACCESS", "DIGIY_SESSION_JOBS", "digiy_jobs_session"];

    for (const key of keys) {
      const parsed = safeJsonParse(localStorage.getItem(key));
      if (!parsed || typeof parsed !== "object") continue;

      const moduleName = upper(parsed.module || MODULE_CODE);
      if (moduleName && moduleName !== MODULE_CODE) continue;

      const slug = normSlug(parsed.slug);
      const phone = normPhone(parsed.phone);

      if (slug || phone) {
        return {
          slug,
          phone,
          owner_id: parsed.owner_id || null,
          module: MODULE_CODE,
          ts: Number(parsed.ts || Date.now())
        };
      }
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
      ts: Date.now()
    };

    try {
      localStorage.setItem("DIGIY_ACCESS", JSON.stringify(session));
    } catch (_) {}

    try {
      localStorage.setItem("DIGIY_SESSION_JOBS", JSON.stringify(session));
    } catch (_) {}

    try {
      localStorage.setItem("digiy_jobs_session", JSON.stringify(session));
    } catch (_) {}

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

  async function resolvePhoneFromSlug(slug) {
    const s = normSlug(slug);
    if (!s) return "";

    const url =
      `${SUPABASE_URL}/rest/v1/digiy_subscriptions_public` +
      `?select=phone,slug,module&slug=eq.${encodeURIComponent(s)}&limit=1`;

    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    let arr = [];
    try {
      arr = await r.json();
    } catch (_) {}

    if (!r.ok || !Array.isArray(arr) || !arr[0]?.phone) return "";

    const row = arr[0] || {};
    const rowModule = upper(row.module || "");
    if (rowModule && rowModule !== MODULE_CODE) return "";

    return String(row.phone || "");
  }

  function buildPayUrl(input = {}) {
    const u = new URL(PAY_URL);

    const phone = normPhone(input.phone || "");
    const slug = normSlug(input.slug || "");

    u.searchParams.set("module", MODULE_CODE);

    if (phone) u.searchParams.set("phone", phone);
    if (slug) u.searchParams.set("slug", slug);

    u.searchParams.set("return", location.href);
    return u.toString();
  }

  function goPay(session = {}) {
    location.href = buildPayUrl(session);
  }

  const stored = readStoredSession();

  const state = {
    module: MODULE_CODE,
    slug: normSlug(slugQ || stored?.slug || ""),
    phone: normPhone(phoneQ || stored?.phone || ""),
    owner_id: stored?.owner_id || null,
    access: false,
    resolved_from_slug: false,
    ready_flag: false,
    error: null,
    pay_url: "",
    source: stored ? "session" : "query"
  };

  let pendingPromise = null;

  async function check() {
    let slug = normSlug(slugQ || state.slug || stored?.slug || "");
    let phone = normPhone(phoneQ || state.phone || stored?.phone || "");

    if (!phone && slug) {
      const resolved = await resolvePhoneFromSlug(slug);
      phone = normPhone(resolved);
      if (phone) state.resolved_from_slug = true;
    }

    state.slug = slug;
    state.phone = phone;
    state.pay_url = buildPayUrl({ phone, slug });
    state.error = null;

    if (slug) {
      try {
        const url = new URL(location.href);
        if ((url.searchParams.get("slug") || "").trim().toLowerCase() !== slug) {
          url.searchParams.set("slug", slug);
          history.replaceState({}, "", url.toString());
        }
      } catch (_) {}
    }

    if (!phone) {
      state.access = false;
      state.ready_flag = true;
      return { ...state };
    }

    const res = await rpc("digiy_has_access", {
      p_phone: phone,
      p_module: MODULE_CODE
    });

    state.access = parseAccessResult(res);
    state.ready_flag = true;

    if (!res.ok) {
      state.error = `digiy_has_access HTTP ${res.status}`;
    }

    if (state.access) {
      saveSession({
        slug: state.slug,
        phone: state.phone,
        owner_id: state.owner_id,
        access: true
      });
    }

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

    goPay() {
      goPay(state);
    },

    buildPayUrl() {
      return buildPayUrl(state);
    }
  };
})();
