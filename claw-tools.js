// claw-tools.js — DIGIY JOBS / CLAW bridge léger
// Doctrine : on n'invente pas un nouveau backend.
// On emballe le rail réel déjà posé : guard + cockpit + tables JOBS.
(() => {
  "use strict";

  const CFG = {
    MODULE: "JOBS",
    MODULE_LOWER: "jobs",

    PATHS: {
      cockpit: "./cockpit.html",
      bureau: "./bureau.html",
      match: "./match.html",
      qr: "./qr.html",
      pin: "./pin.html"
    },

    TABLES: {
      OFFERS: "digiy_jobs_offers_pro",
      CANDIDATES: "digiy_jobs_candidates_pro"
    },

    DB_SLUG_COLUMN: window.DIGIY_JOBS_DB_SLUG_COLUMN || "slug",

    SUPABASE_URL:
      window.DIGIY_SUPABASE_URL ||
      "https://wesqmwjjtsefyjnluosj.supabase.co",

    SUPABASE_ANON_KEY:
      window.DIGIY_SUPABASE_ANON ||
      window.DIGIY_SUPABASE_ANON_KEY ||
      "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3"
  };

  const CACHE = {
    sb: null
  };

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

  function asError(message, extra = {}) {
    return { ok: false, error: String(message || "Erreur."), ...extra };
  }

  function withIdentity(pathname, ctx = {}) {
    const url = new URL(pathname, location.href);

    const slug = normSlug(ctx.slug || "");
    const phone = normPhone(ctx.phone || "");

    if (slug) url.searchParams.set("slug", slug);
    if (phone) url.searchParams.set("phone", phone);

    return url.toString();
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
      CFG.SUPABASE_ANON_KEY
    );

    return CACHE.sb;
  }

  async function getContext() {
    const guard = window.DIGIY_GUARD;

    if (!guard || typeof guard.ready !== "function") {
      return asError("DIGIY_GUARD manquant.");
    }

    const session = await guard.ready();
    const state =
      (guard && typeof guard.getSession === "function" ? guard.getSession() : null) ||
      session ||
      {};

    return {
      ok: true,
      module: String(state.module || CFG.MODULE).toUpperCase(),
      slug: normSlug(state.slug || ""),
      phone: normPhone(state.phone || ""),
      owner_id: state.owner_id || null,
      access_ok: !!(state.access_ok || state.access),
      preview: !!state.preview,
      source: state.source || "guard",
      pin_url:
        state.pin_url ||
        (guard && typeof guard.buildPinUrl === "function"
          ? guard.buildPinUrl()
          : withIdentity(CFG.PATHS.pin, state)),
      pay_url: state.pay_url || null
    };
  }

  async function requireContext(opts = {}) {
    const ctx = await getContext();
    if (!ctx.ok) return ctx;

    if (!ctx.slug && !opts.allowWithoutSlug) {
      return asError("Slug JOBS manquant.", { context: ctx });
    }

    return ctx;
  }

  async function requireAccess(opts = {}) {
    const ctx = await requireContext(opts);
    if (!ctx.ok) return ctx;

    if (!ctx.access_ok || ctx.preview) {
      return asError("Accès JOBS non actif.", { context: ctx, code: "access_required" });
    }

    return ctx;
  }

  function navigate(pathname, ctx = {}, mode = "href") {
    const url = withIdentity(pathname, ctx);

    if (mode === "replace") {
      location.replace(url);
    } else {
      location.href = url;
    }

    return { ok: true, url };
  }

  function dedupeById(rows = []) {
    const seen = new Set();
    const out = [];

    for (const row of rows) {
      const id = row && row.id ? String(row.id) : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(row);
    }

    return out;
  }

  function sortByCreatedDesc(rows = []) {
    return [...rows].sort((a, b) => {
      const da = new Date(a?.created_at || 0).getTime();
      const db = new Date(b?.created_at || 0).getTime();
      return db - da;
    });
  }

  async function loadOffers(payload = {}) {
    const ctx = await requireContext();
    if (!ctx.ok) return ctx;

    const sb = getSupabaseClient();
    if (!sb) return asError("Supabase indisponible.", { context: ctx });

    const { data, error } = await sb
      .from(CFG.TABLES.OFFERS)
      .select(
        "id,slug,title,sector,city,country,contract_type,pay,status,description,requirements,has_housing,has_family_welcome,employer_name,contact_phone,published_at,created_at"
      )
      .eq(CFG.DB_SLUG_COLUMN, ctx.slug)
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
      context: ctx,
      count: rows.length,
      rows,
      first: rows[0] || null
    };
  }

  async function loadCandidates(payload = {}) {
    const ctx = await requireAccess();
    if (!ctx.ok) return ctx;

    const sb = getSupabaseClient();
    if (!sb) return asError("Supabase indisponible.", { context: ctx });

    const rows = [];

    const bySlug = await sb
      .from(CFG.TABLES.CANDIDATES)
      .select(
        "id,offer_id,slug,full_name,phone,job_title,city,country,trade,years_experience,availability,message,status,source,created_at,updated_at"
      )
      .eq(CFG.DB_SLUG_COLUMN, ctx.slug)
      .order("created_at", { ascending: false });

    if (bySlug.error) {
      return asError(`load_candidates (slug): ${bySlug.error.message || "requête impossible"}`, {
        context: ctx
      });
    }

    rows.push(...(Array.isArray(bySlug.data) ? bySlug.data : []));

    const offersRes = await loadOffers();
    if (!offersRes.ok) {
      return asError("Impossible de charger les offres avant les candidatures.", {
        context: ctx,
        cause: offersRes.error || "offers_failed"
      });
    }

    const offerIds = (offersRes.rows || []).map((o) => o.id).filter(Boolean);

    if (offerIds.length) {
      const byOffers = await sb
        .from(CFG.TABLES.CANDIDATES)
        .select(
          "id,offer_id,slug,full_name,phone,job_title,city,country,trade,years_experience,availability,message,status,source,created_at,updated_at"
        )
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
      context: ctx,
      count: cleanRows.length,
      rows: cleanRows,
      first: cleanRows[0] || null
    };
  }

  async function updateCandidateStatus(payload = {}) {
    const ctx = await requireAccess();
    if (!ctx.ok) return ctx;

    const id = String(payload.id || "").trim();
    const status = String(payload.status || "").trim().toLowerCase();

    if (!id) return asError("Candidate id manquant.", { context: ctx });
    if (!status) return asError("Status manquant.", { context: ctx });

    const allowed = new Set([
      "new",
      "review",
      "shortlist",
      "call",
      "accepted",
      "rejected"
    ]);

    if (!allowed.has(status)) {
      return asError(`Statut non autorisé: ${status}`, {
        context: ctx,
        allowed: [...allowed]
      });
    }

    const sb = getSupabaseClient();
    if (!sb) return asError("Supabase indisponible.", { context: ctx });

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

  async function openBureau() {
    const ctx = await requireContext();
    if (!ctx.ok) return ctx;
    return navigate(CFG.PATHS.bureau, ctx);
  }

  async function openMatch() {
    const ctx = await requireContext();
    if (!ctx.ok) return ctx;
    return navigate(CFG.PATHS.match, ctx);
  }

  async function openQr() {
    const ctx = await requireContext();
    if (!ctx.ok) return ctx;
    return navigate(CFG.PATHS.qr, ctx);
  }

  async function openPin() {
    const ctx = await getContext();
    const guard = window.DIGIY_GUARD;

    if (guard && typeof guard.goPin === "function") {
      guard.goPin({ slug: ctx.slug || "", phone: ctx.phone || "" });
      return { ok: true, tool: "open_pin" };
    }

    return navigate(CFG.PATHS.pin, ctx, "replace");
  }

  async function refreshContext() {
    const guard = window.DIGIY_GUARD;

    if (!guard || typeof guard.refresh !== "function") {
      return asError("refresh guard indisponible.");
    }

    const state = await guard.refresh();
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

  const tools = {
    get_context: {
      description: "Retourne le contexte réel du module JOBS.",
      run: getContext
    },

    open_bureau: {
      description: "Ouvre bureau.html avec le slug actif.",
      run: openBureau
    },

    open_match: {
      description: "Ouvre match.html avec le slug actif.",
      run: openMatch
    },

    open_qr: {
      description: "Ouvre qr.html avec le slug actif.",
      run: openQr
    },

    load_offers: {
      description: "Charge les missions actives du pro depuis digiy_jobs_offers_pro.",
      run: loadOffers
    },

    load_candidates: {
      description: "Charge les candidatures réelles liées au slug et aux offres.",
      run: loadCandidates
    },

    update_candidate_status: {
      description: "Met à jour le statut d'un candidat.",
      run: updateCandidateStatus
    },

    open_pin: {
      description: "Renvoie vers l’entrée PIN si la session est cassée.",
      run: openPin
    },

    refresh_context: {
      description: "Redemande l’état réel au guard.",
      run: refreshContext
    }
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

  function listTools() {
    return Object.entries(tools).map(([name, spec]) => ({
      name,
      description: spec.description
    }));
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

  window.DIGIY_CLAW_JOBS = {
    ready,
    getContext,
    listTools,
    runAction,
    tools
  };
})();
