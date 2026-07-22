(() => {
  "use strict";

  const MODULE = "JOBS";
  let sb = null;

  const normSlug = (value) => String(value || "")
    .trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  function client() {
    if (sb) return sb;
    if (!window.supabase?.createClient) throw new Error("Supabase indisponible.");
    sb = window.supabase.createClient(
      window.DIGIY_SUPABASE_URL,
      window.DIGIY_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
    return sb;
  }

  async function context() {
    if (!window.DIGIY_GUARD?.ready) throw new Error("Garde JOBS absent.");
    const session = await window.DIGIY_GUARD.ready({ redirect: true });
    const slug = normSlug(session?.slug || "");
    if (!session?.access_ok || !slug) throw new Error("Session JOBS invalide.");
    return { ...session, slug };
  }

  async function rpc(name, payload) {
    const { data, error } = await client().rpc(name, payload || {});
    if (error) throw new Error(error.message || `${name} indisponible`);
    return data;
  }

  async function loadOffers() {
    const ctx = await context();
    const data = await rpc("digiy_jobs_pro_offers_by_slug", { p_slug: ctx.slug });
    return { context: ctx, rows: Array.isArray(data) ? data : [] };
  }

  async function loadCandidates() {
    const ctx = await context();
    const data = await rpc("digiy_jobs_pro_candidates_by_slug", { p_slug: ctx.slug });
    return { context: ctx, rows: Array.isArray(data) ? data : [] };
  }

  async function loadAll() {
    const [offers, candidates] = await Promise.all([loadOffers(), loadCandidates()]);
    return { context: offers.context, offers: offers.rows, candidates: candidates.rows };
  }

  async function publishOffer(payload) {
    const ctx = await context();
    const data = await rpc("digiy_jobs_pro_insert_offer", {
      p_slug: ctx.slug,
      p_payload: { ...(payload || {}), contact_phone: ctx.phone || "" }
    });
    return { context: ctx, row: Array.isArray(data) ? data[0] : data };
  }

  async function updateCandidateStatus(candidateId, status) {
    const ctx = await context();
    const data = await rpc("digiy_jobs_pro_update_candidate_status", {
      p_slug: ctx.slug,
      p_candidate_id: candidateId,
      p_status: status
    });
    return { context: ctx, row: Array.isArray(data) ? data[0] : data };
  }

  window.DIGIY_JOBS_SECURE_API = {
    MODULE,
    context,
    loadOffers,
    loadCandidates,
    loadAll,
    publishOffer,
    updateCandidateStatus
  };
})();
