// guard.js — DIGIY JOBS PRO soft guard (slug-first, no auto-redirect)
(() => {
  "use strict";

  const SUPABASE_URL = "https://wesqmwjjtsefyjnluosj.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3Ftd2pqdHNlZnlqbmx1b3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzg4ODIsImV4cCI6MjA4MDc1NDg4Mn0.dZfYOc2iL2_wRYL3zExZFsFSBK6AbMeOid2LrIjcTdA";

  // IMPORTANT
  const MODULE_CODE = "JOBS";

  const PAY_URL = "https://commencer-a-payer.digiylyfe.com/";

  const qs = new URLSearchParams(location.search);
  const slugQ = (qs.get("slug") || "").trim();
  const phoneQ = (qs.get("phone") || "").trim();

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

  async function rpc(name, params) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(params)
    });

    let data = null;
    try {
      data = await r.json();
    } catch (_) {}

    return { ok: r.ok, status: r.status, data };
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
    return String(arr[0].phone || "");
  }

  function buildPayUrl({ phone, slug }) {
    const u = new URL(PAY_URL);
    u.searchParams.set("module", MODULE_CODE);

    const p = normPhone(phone);
    const s = normSlug(slug);

    if (p) u.searchParams.set("phone", p);
    if (s) u.searchParams.set("slug", s);

    u.searchParams.set("return", location.href);
    return u.toString();
  }

  function goPay(session = {}) {
    location.href = buildPayUrl(session);
  }

  const state = {
    module: MODULE_CODE,
    slug: normSlug(slugQ),
    phone: normPhone(phoneQ),
    access: false,
    resolved_from_slug: false,
    ready_flag: false,
    error: null,
    pay_url: ""
  };

  async function check() {
    let slug = normSlug(slugQ);
    let phone = normPhone(phoneQ);

    if (!phone && slug) {
      const resolved = await resolvePhoneFromSlug(slug);
      phone = normPhone(resolved);
      if (phone) state.resolved_from_slug = true;
    }

    state.slug = slug;
    state.phone = phone;
    state.pay_url = buildPayUrl({ phone, slug });

    if (!phone) {
      state.access = false;
      state.ready_flag = true;
      return { ...state };
    }

    const res = await rpc("digiy_has_access", {
      p_phone: phone,
      p_module: MODULE_CODE
    });

    state.access = res.ok && res.data === true;
    state.ready_flag = true;

    if (!res.ok) {
      state.error = `digiy_has_access HTTP ${res.status}`;
    }

    return { ...state };
  }

  window.DIGIY_GUARD = {
    state,
    async ready() {
      if (state.ready_flag) return { ...state };
      return check();
    },
    async refresh() {
      state.ready_flag = false;
      state.error = null;
      return check();
    },
    getSession() {
      return { ...state };
    },
    goPay() {
      goPay(state);
    },
    buildPayUrl() {
      return buildPayUrl(state);
    }
  };
})();
