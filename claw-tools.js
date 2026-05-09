// claw-tools.js — DIGIY JOBS / v3 sécurité URL propre
// Doctrine : le pro clique plus qu’il n’écrit.
// DIGIY formule pour lui, le terrain valide avec sa vérité.
//
// Règle importante : ce helper ne remet jamais phone, tel ou slug dans l’URL visible.
// Le contexte reste dans le coffre local + session guard 8h.

(() => {
  "use strict";

  const CFG = {
    MODULE: "JOBS",
    MODULE_LOWER: "jobs",

    PATHS: {
      home: "./index.html",
      wall: "./mur%20des%20missions.html",
      pin: "./pin.html",
      cockpit: "./cockpit.html",
      bureau: "./bureau.html",
      match: "./match.html",
      mission: "./publier-mission.html",
      publish: "./publier-mission.html",
      qr: "./qr.html"
    },

    TABLES: {
      OFFERS: "digiy_jobs_offers_pro",
      CANDIDATES: "digiy_jobs_candidates_pro",
      SUBSCRIPTIONS_PUBLIC: "digiy_subscriptions_public"
    },

    SELECT: {
      OFFERS:
        "id,slug,title,sector,city,country,contract_type,pay,status,description,requirements,has_housing,has_family_welcome,employer_name,contact_phone,published_at,created_at",
      CANDIDATES:
        "id,offer_id,slug,full_name,phone,job_title,city,country,trade,years_experience,availability,message,status,source,created_at,updated_at"
    },

    STATUSES: ["new", "review", "shortlist", "call", "accepted", "rejected"],

    STATUS_LABELS: {
      new: "Nouveau",
      review: "En revue",
      shortlist: "Shortlist",
      call: "À appeler",
      accepted: "Accepté",
      rejected: "Refusé"
    },

    STATUS_BADGE_CLASS: {
      accepted: "green",
      rejected: "red",
      call: "blue",
      shortlist: "orange",
      review: "gold",
      new: ""
    },

    STORAGE_KEYS: {
      SESSION_LIST: [
        "DIGIY_JOBS_PIN_SESSION",
        "DIGIY_JOBS_SESSION",
        "DIGIY_JOBS_ACCESS",
        "DIGIY_PIN_SESSION",
        "DIGIY_ACCESS",
        "DIGIY_SESSION_JOBS",
        "digiy_jobs_session"
      ],
      SLUG: "digiy_jobs_slug",
      PHONE: "digiy_jobs_phone",
      LAST_SLUG: "digiy_jobs_last_slug"
    },

    DB_SLUG_COLUMN: "slug",

    SUPABASE_URL:
      window.DIGIY_SUPABASE_URL ||
      "https://wesqmwjjtsefyjnluosj.supabase.co",

    SUPABASE_ANON_KEY:
      window.DIGIY_SUPABASE_ANON ||
      window.DIGIY_SUPABASE_ANON_KEY ||
      "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3"
  };

  const SENSITIVE_QUERY_KEYS = [
    "slug",
    "phone",
    "tel",
    "jobs_tel",
    "owner_phone",
    "contact_phone",
    "module",
    "return",
    "from"
  ];

  const CACHE = { sb: null };

  function normSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function normPhone(value) {
    const raw = String(value || "").trim();
    const cleaned = raw.replace(/[^\d+]/g, "");
    const digits = cleaned.replace(/[^\d]/g, "");
    if (!digits) return "";
    return cleaned.startsWith("+") ? `+${digits}` : digits;
  }

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function asError(message, extra = {}) {
    return { ok: false, error: String(message || "Erreur."), ...extra };
  }

  function saveSlug(slug) {
    const clean = normSlug(slug);
    if (!clean) return;

    try {
      localStorage.setItem(CFG.STORAGE_KEYS.SLUG, clean);
      localStorage.setItem(CFG.STORAGE_KEYS.LAST_SLUG, clean);
      sessionStorage.setItem(CFG.STORAGE_KEYS.SLUG, clean);
      sessionStorage.setItem(CFG.STORAGE_KEYS.LAST_SLUG, clean);
    } catch (_) {}
  }

  function savePhone(phone) {
    const clean = normPhone(phone);
    if (!clean) return;

    try {
      localStorage.setItem(CFG.STORAGE_KEYS.PHONE, clean);
      sessionStorage.setItem(CFG.STORAGE_KEYS.PHONE, clean);
    } catch (_) {}
  }

  function readStoredSlug() {
    try {
      return normSlug(
        sessionStorage.getItem(CFG.STORAGE_KEYS.SLUG) ||
        sessionStorage.getItem(CFG.STORAGE_KEYS.LAST_SLUG) ||
        localStorage.getItem(CFG.STORAGE_KEYS.SLUG) ||
        localStorage.getItem(CFG.STORAGE_KEYS.LAST_SLUG) ||
        ""
      );
    } catch (_) {
      return "";
    }
  }

  function readStoredPhone() {
    try {
      return normPhone(
        sessionStorage.getItem(CFG.STORAGE_KEYS.PHONE) ||
        localStorage.getItem(CFG.STORAGE_KEYS.PHONE) ||
        ""
      );
    } catch (_) {
      return "";
    }
  }

  function cleanVisibleUrlAndKeepContext() {
    try {
      const url = new URL(location.href);

      const incomingSlug = normSlug(url.searchParams.get("slug") || "");
      const incomingPhone = normPhone(
        url.searchParams.get("phone") ||
        url.searchParams.get("tel") ||
        url.searchParams.get("jobs_tel") ||
        ""
      );

      if (incomingSlug) saveSlug(incomingSlug);
      if (incomingPhone) savePhone(incomingPhone);

      let changed = false;

      SENSITIVE_QUERY_KEYS.forEach((key) => {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      });

      if (changed) {
        history.replaceState({}, document.title, url.pathname + url.search + url.hash);
      }
    } catch (_) {}
  }

  function cleanInternalUrl(pathname, fallback = "./cockpit.html") {
    const raw = String(pathname || fallback).trim() || fallback;

    try {
      const url = new URL(raw, location.href);

      SENSITIVE_QUERY_KEYS.forEach((key) => {
        url.searchParams.delete(key);
      });

      if (url.origin === location.origin) {
        const file = url.pathname.split("/").pop() || "cockpit.html";
        return `./${file}${url.search || ""}${url.hash || ""}`;
      }

      return url.toString();
    } catch (_) {
      return fallback;
    }
  }

  function guard() {
    return window.DIGIY_GUARD || null;
  }

  function getSession() {
    const g = guard();

    if (g && typeof g.getSession === "function") {
      return g.getSession();
    }

    for (const key of CFG.STORAGE_KEYS.SESSION_LIST) {
      try {
        const parsed =
          safeJsonParse(localStorage.getItem(key)) ||
          safeJsonParse(sessionStorage.getItem(key));

        if (!parsed || typeof parsed !== "object") continue;

        const moduleName = String(parsed.module || parsed.module_code || "")
          .trim()
          .toUpperCase();

        if (moduleName && moduleName !== CFG.MODULE) continue;

        return parsed;
      } catch (_) {}
    }

    return null;
  }

  function isAuthenticated() {
    const g = guard();

    if (g && typeof g.isAuthenticated === "function") {
      return !!g.isAuthenticated();
    }

    const s = getSession();

    return !!(s?.access || s?.access_ok || s?.ok || s?.has_access) && !s?.preview;
  }

  function activeSlug() {
    const s = getSession();
    return normSlug(s?.slug || readStoredSlug() || "");
  }

  function activePhone() {
    const s = getSession();
    return normPhone(s?.phone || readStoredPhone() || "");
  }

  function withIdentity(pathname) {
    return cleanInternalUrl(pathname, "./cockpit.html");
  }

  function getSupabaseClient() {
    if (CACHE.sb) return CACHE.sb;

    if (window.sb && typeof window.sb.from === "function") {
      CACHE.sb = window.sb;
      return CACHE.sb;
    }

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      return null;
    }

    CACHE.sb = window.supabase.createClient(
      CFG.SUPABASE_URL,
      CFG.SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    return CACHE.sb;
  }

  async function getContext() {
    cleanVisibleUrlAndKeepContext();

    const g = guard();
    let state = null;

    if (g && typeof g.getSession === "function") {
      state = g.getSession();
    }

    if (g && typeof g.ready === "function" && !state?.ready_flag) {
      try {
        state = await g.ready();
      } catch (_) {}
    }

    state = state || {};

    const slug = normSlug(state.slug || activeSlug() || "");
    const phone = normPhone(state.phone || activePhone() || "");

    if (slug) saveSlug(slug);
    if (phone) savePhone(phone);

    return {
      ok: true,
      module: String(state.module || CFG.MODULE).toUpperCase(),
      slug,
      phone,
      owner_id: state.owner_id || null,
      access_ok: !!(state.access_ok || state.access || state.ok || state.has_access),
      preview: typeof state.preview === "boolean" ? !!state.preview : !isAuthenticated(),
      source: state.source || (g ? "guard" : "storage"),
      pin_url: cleanInternalUrl(state.pin_url || CFG.PATHS.pin, CFG.PATHS.pin),
      pay_url: state.pay_url || null
    };
  }

  async function requireContext(opts = {}) {
    const ctx = await getContext();

    if (!ctx.ok) return ctx;

    if (!ctx.slug && !opts.allowWithoutSlug) {
      return asError("Repère JOBS manquant.", { context: ctx });
    }

    return ctx;
  }

  async function requireReadAccess() {
    const ctx = await requireContext();

    if (!ctx.ok) return ctx;

    if (ctx.preview || !ctx.access_ok) {
      return asError("Accès JOBS requis pour lire les candidatures.", {
        context: ctx,
        code: "access_required"
      });
    }

    return ctx;
  }

  async function requireWriteAccess() {
    const ctx = await requireContext();

    if (!ctx.ok) return ctx;

    if (ctx.preview || !ctx.access_ok) {
      return asError("Accès JOBS requis pour modifier les candidatures.", {
        context: ctx,
        code: "access_required"
      });
    }

    return ctx;
  }

  function dedupeById(rows = []) {
    const seen = new Set();
    const out = [];

    for (const row of rows || []) {
      const id = row?.id ? String(row.id) : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    }

    return out;
  }

  function sortByCreatedDesc(rows = []) {
    return [...(rows || [])].sort((a, b) => {
      const da = new Date(a?.created_at || 0).getTime();
      const db = new Date(b?.created_at || 0).getTime();
      return db - da;
    });
  }

  async function loadOffers(payload = {}) {
    const ctx = await requireContext();

    if (!ctx.ok) return ctx;

    const targetSlug = normSlug(payload.slug || ctx.slug || "");

    if (!targetSlug) {
      return asError("Repère JOBS manquant.", { context: ctx });
    }

    const sb = getSupabaseClient();

    if (!sb) {
      return asError("Supabase indisponible.", { context: ctx });
    }

    const { data, error } = await sb
      .from(CFG.TABLES.OFFERS)
      .select(CFG.SELECT.OFFERS)
      .eq(CFG.DB_SLUG_COLUMN, targetSlug)
      .eq("status", "active")
      .order("published_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return asError(`load_offers: ${error.message || "requête impossible"}`, {
        context: ctx
      });
    }

    const rows = Array.isArray(data) ? data : [];

    return {
      ok: true,
      tool: "load_offers",
      context: { ...ctx, slug: targetSlug },
      count: rows.length,
      rows,
      first: rows[0] || null
    };
  }

  async function loadCandidates(payload = {}) {
    const ctx = await requireReadAccess();

    if (!ctx.ok) return ctx;

    const targetSlug = normSlug(payload.slug || ctx.slug || "");

    if (!targetSlug) {
      return asError("Repère JOBS manquant.", { context: ctx });
    }

    const sb = getSupabaseClient();

    if (!sb) {
      return asError("Supabase indisponible.", { context: ctx });
    }

    const rows = [];

    const bySlug = await sb
      .from(CFG.TABLES.CANDIDATES)
      .select(CFG.SELECT.CANDIDATES)
      .eq(CFG.DB_SLUG_COLUMN, targetSlug)
      .order("created_at", { ascending: false });

    if (bySlug.error) {
      return asError(`load_candidates (slug): ${bySlug.error.message || "requête impossible"}`, {
        context: ctx
      });
    }

    rows.push(...(Array.isArray(bySlug.data) ? bySlug.data : []));

    const offersRes = await loadOffers({ slug: targetSlug });

    if (!offersRes.ok) {
      return asError("Impossible de charger les missions avant les candidatures.", {
        context: ctx,
        cause: offersRes.error || "offers_failed"
      });
    }

    const offerIds = (offersRes.rows || [])
      .map((offer) => offer.id)
      .filter(Boolean);

    if (offerIds.length) {
      const byOffers = await sb
        .from(CFG.TABLES.CANDIDATES)
        .select(CFG.SELECT.CANDIDATES)
        .in("offer_id", offerIds)
        .order("created_at", { ascending: false });

      if (byOffers.error) {
        return asError(`load_candidates (offers): ${byOffers.error.message || "requête impossible"}`, {
          context: ctx
        });
      }

      rows.push(...(Array.isArray(byOffers.data) ? byOffers.data : []));
    }

    const cleanRows = sortByCreatedDesc(dedupeById(rows));

    return {
      ok: true,
      tool: "load_candidates",
      context: { ...ctx, slug: targetSlug },
      count: cleanRows.length,
      rows: cleanRows,
      first: cleanRows[0] || null
    };
  }

  async function updateCandidateStatus(payload = {}) {
    const ctx = await requireWriteAccess();

    if (!ctx.ok) return ctx;

    const id = String(payload.id || "").trim();
    const status = String(payload.status || "").trim().toLowerCase();

    if (!id) {
      return asError("Candidate id manquant.", { context: ctx });
    }

    if (!status) {
      return asError("Statut manquant.", { context: ctx });
    }

    const allowed = new Set(CFG.STATUSES);

    if (!allowed.has(status)) {
      return asError(`Statut non autorisé: ${status}`, {
        context: ctx,
        allowed: [...allowed]
      });
    }

    const sb = getSupabaseClient();

    if (!sb) {
      return asError("Supabase indisponible.", { context: ctx });
    }

    const { error } = await sb
      .from(CFG.TABLES.CANDIDATES)
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      return asError(`update_candidate_status: ${error.message || "mise à jour impossible"}`, {
        context: ctx
      });
    }

    return {
      ok: true,
      tool: "update_candidate_status",
      context: ctx,
      id,
      status
    };
  }

  function navigate(pathname, mode = "href") {
    const url = cleanInternalUrl(pathname, CFG.PATHS.cockpit);

    if (mode === "replace") {
      location.replace(url);
    } else {
      location.href = url;
    }

    return { ok: true, url };
  }

  async function openBureau() {
    const ctx = await requireContext();
    if (!ctx.ok) return ctx;
    return navigate(CFG.PATHS.bureau);
  }

  async function openMatch() {
    const ctx = await requireContext();
    if (!ctx.ok) return ctx;
    return navigate(CFG.PATHS.match);
  }

  async function openQr() {
    const ctx = await requireContext();
    if (!ctx.ok) return ctx;
    return navigate(CFG.PATHS.qr);
  }

  async function openPin() {
    const g = guard();

    if (g && typeof g.goPin === "function") {
      g.goPin();
      return { ok: true, tool: "open_pin" };
    }

    return navigate(CFG.PATHS.pin, "replace");
  }

  async function refreshContext() {
    const g = guard();

    if (!g || typeof g.refresh !== "function") {
      return asError("Refresh guard indisponible.");
    }

    const state = await g.refresh();

    return {
      ok: true,
      tool: "refresh_context",
      context: {
        module: String(state?.module || CFG.MODULE).toUpperCase(),
        slug: normSlug(state?.slug || ""),
        phone: normPhone(state?.phone || ""),
        owner_id: state?.owner_id || null,
        access_ok: !!(state?.access_ok || state?.access),
        preview: !!state?.preview,
        source: state?.source || "guard"
      }
    };
  }

  function buildUrl(page) {
    return cleanInternalUrl(CFG.PATHS[page] || page, CFG.PATHS.cockpit);
  }

  function groupByStatus(candidates = []) {
    const result = {};

    CFG.STATUSES.forEach((status) => {
      result[status] = [];
    });

    (candidates || []).forEach((candidate) => {
      const status = String(candidate.status || "new").toLowerCase();

      if (result[status]) {
        result[status].push(candidate);
      } else {
        result[status] = [candidate];
      }
    });

    return result;
  }

  function computeStats(offers = [], candidates = []) {
    const all = Array.isArray(candidates) ? candidates : [];

    const count = (status) =>
      all.filter((item) => String(item.status || "new").toLowerCase() === status).length;

    return {
      offers: (offers || []).length,
      total: all.length,
      new: count("new"),
      review: count("review"),
      shortlist: count("shortlist"),
      call: count("call"),
      accepted: count("accepted"),
      rejected: count("rejected")
    };
  }

  function filterCandidates(candidates = [], offers = [], filters = {}) {
    const q = String(filters.q || "").toLowerCase().trim();
    const status = String(filters.status || "").toLowerCase().trim();
    const offerId = String(filters.offerId || "").trim();
    const offerMap = new Map((offers || []).map((offer) => [offer.id, offer]));

    return (candidates || []).filter((candidate) => {
      const offer = offerMap.get(candidate.offer_id) || null;

      const hay = [
        candidate.full_name,
        candidate.phone,
        candidate.job_title,
        candidate.trade,
        candidate.city,
        candidate.country,
        candidate.years_experience,
        candidate.availability,
        candidate.message,
        candidate.source,
        candidate.status,
        offer?.title || ""
      ]
        .join(" ")
        .toLowerCase();

      if (q && !hay.includes(q)) return false;
      if (status && String(candidate.status || "new").toLowerCase() !== status) return false;
      if (offerId && String(candidate.offer_id || "") !== offerId) return false;

      return true;
    });
  }

  function listTools() {
    return [
      {
        name: "get_context",
        description: "Retourne le contexte réel du module JOBS."
      },
      {
        name: "open_bureau",
        description: "Ouvre bureau.html sans exposer d’identifiant dans l’URL."
      },
      {
        name: "open_match",
        description: "Ouvre match.html sans exposer d’identifiant dans l’URL."
      },
      {
        name: "open_qr",
        description: "Ouvre qr.html sans exposer d’identifiant dans l’URL."
      },
      {
        name: "load_offers",
        description: "Charge les missions actives du pro."
      },
      {
        name: "load_candidates",
        description: "Charge les candidatures liées au repère gardé dans le coffre."
      },
      {
        name: "update_candidate_status",
        description: "Met à jour le statut d’un candidat."
      },
      {
        name: "open_pin",
        description: "Renvoie vers l’entrée PIN si la session est cassée."
      },
      {
        name: "refresh_context",
        description: "Redemande l’état réel au guard."
      }
    ];
  }

  const tools = {
    get_context: { run: getContext },
    open_bureau: { run: openBureau },
    open_match: { run: openMatch },
    open_qr: { run: openQr },
    load_offers: { run: loadOffers },
    load_candidates: { run: loadCandidates },
    update_candidate_status: { run: updateCandidateStatus },
    open_pin: { run: openPin },
    refresh_context: { run: refreshContext }
  };

  async function runAction(name, payload = {}) {
    const key = String(name || "").trim().toLowerCase();
    const tool = tools[key];

    if (!tool || typeof tool.run !== "function") {
      return asError(`Tool inconnu: ${name}`);
    }

    try {
      return await tool.run(payload);
    } catch (err) {
      return asError(err?.message || `Erreur pendant ${name}`);
    }
  }

  async function ready() {
    const ctx = await getContext();

    return {
      ok: true,
      module: CFG.MODULE,
      context: ctx.ok ? ctx : null,
      tools: listTools()
    };
  }

  function snapshotSyncFromSession() {
    const session = getSession();

    return {
      guard_loaded: !!guard(),
      authenticated: isAuthenticated(),
      slug: activeSlug(),
      phone: activePhone(),
      owner_id: session?.owner_id || null,
      preview: session?.preview ?? !isAuthenticated(),
      source: session?.source || "none",
      error: session?.error || null,
      verified_at_ms: session?.verified_at || null,
      validated_at_iso: session?.validated_at || null,
      supabase_url: CFG.SUPABASE_URL,
      module: CFG.MODULE
    };
  }

  async function snapshot() {
    const ctx = await getContext();
    const base = snapshotSyncFromSession();

    return {
      ...base,
      slug: ctx.slug || base.slug || "",
      phone: ctx.phone || base.phone || "",
      owner_id: ctx.owner_id || base.owner_id || null,
      preview: typeof ctx.preview === "boolean" ? ctx.preview : base.preview,
      source: ctx.source || base.source,
      access_ok: !!ctx.access_ok
    };
  }

  async function fetchAll(input = {}) {
    const slug =
      typeof input === "string"
        ? normSlug(input)
        : normSlug(input?.slug || "");

    const offers = await runAction("load_offers", slug ? { slug } : {});

    if (!offers?.ok) {
      return {
        ok: false,
        offers: [],
        candidates: [],
        error: offers?.error || "offers_failed"
      };
    }

    const candidates = await runAction("load_candidates", slug ? { slug } : {});

    if (!candidates?.ok) {
      return {
        ok: false,
        offers: offers.rows || [],
        candidates: [],
        error: candidates?.error || "candidates_failed"
      };
    }

    return {
      ok: true,
      offers: offers.rows || [],
      candidates: candidates.rows || []
    };
  }

  async function setCandidateStatus(id, status) {
    return await runAction("update_candidate_status", { id, status });
  }

  async function goTo(target) {
    const map = {
      bureau: "open_bureau",
      match: "open_match",
      qr: "open_qr",
      pin: "open_pin"
    };

    const action = map[String(target || "").toLowerCase()];

    if (!action) {
      return asError(`Navigation inconnue: ${target}`);
    }

    return await runAction(action);
  }

  const api = {
    MODULE: CFG.MODULE,
    MODULE_LOWER: CFG.MODULE_LOWER,

    TABLES: CFG.TABLES,
    SELECT: CFG.SELECT,
    STATUSES: CFG.STATUSES,
    STATUS_LABELS: CFG.STATUS_LABELS,
    STATUS_BADGE_CLASS: CFG.STATUS_BADGE_CLASS,
    PATHS: CFG.PATHS,
    STORAGE_KEYS: CFG.STORAGE_KEYS,

    normSlug,
    normPhone,

    guard,
    getSession,
    isAuthenticated,
    activeSlug,
    activePhone,
    withIdentity,
    buildUrl,

    ready,
    getContext,
    listTools,
    runAction,
    tools,

    groupByStatus,
    computeStats,
    filterCandidates,

    snapshot,
    fetchAll,
    setCandidateStatus,
    goTo
  };

  cleanVisibleUrlAndKeepContext();

  window.DIGIY_CLAW_JOBS = api;
  window.CLAW_JOBS = api;

  console.info(
    "[DIGIY_CLAW_JOBS] v3 sécurité URL propre — slug actif coffre :",
    api.activeSlug() || "(aucun)"
  );
})();
