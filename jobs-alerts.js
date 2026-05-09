// jobs-alerts.js — DIGIY JOBS / chef de passe
// Rôle : lire derrière, interpréter, réduire, remonter seulement les actions utiles.
// Doctrine : moins de fatigue, plus de terrain.

(() => {
  "use strict";

  const CFG = {
    MODULE: "JOBS",
    MAX_ALERTS: 5,

    PATHS: {
      home: "./index.html",
      pin: "./pin.html",
      cockpit: "./cockpit.html",
      bureau: "./bureau.html",
      publish: "./publier-mission.html",
      match: "./match.html",
      qr: "./qr.html",
      wall: "./mur%20des%20missions.html"
    },

    SENSITIVE_KEYS: [
      "slug",
      "phone",
      "tel",
      "jobs_tel",
      "owner_phone",
      "contact_phone",
      "module",
      "return",
      "from"
    ],

    STORAGE: {
      SLUG: "digiy_jobs_slug",
      LAST_SLUG: "digiy_jobs_last_slug",
      PHONE: "digiy_jobs_phone"
    }
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

  function saveContext(slug, phone) {
    try {
      const cleanSlug = normSlug(slug);
      const cleanPhone = normPhone(phone);

      if (cleanSlug) {
        localStorage.setItem(CFG.STORAGE.SLUG, cleanSlug);
        localStorage.setItem(CFG.STORAGE.LAST_SLUG, cleanSlug);
        sessionStorage.setItem(CFG.STORAGE.SLUG, cleanSlug);
        sessionStorage.setItem(CFG.STORAGE.LAST_SLUG, cleanSlug);
      }

      if (cleanPhone) {
        localStorage.setItem(CFG.STORAGE.PHONE, cleanPhone);
        sessionStorage.setItem(CFG.STORAGE.PHONE, cleanPhone);
      }
    } catch (_) {}
  }

  function cleanVisibleUrl() {
    try {
      const url = new URL(window.location.href);

      const incomingSlug = normSlug(url.searchParams.get("slug") || "");
      const incomingPhone = normPhone(
        url.searchParams.get("phone") ||
        url.searchParams.get("tel") ||
        url.searchParams.get("jobs_tel") ||
        ""
      );

      saveContext(incomingSlug, incomingPhone);

      let changed = false;

      CFG.SENSITIVE_KEYS.forEach((key) => {
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

  function cleanInternalUrl(path, fallback = "./index.html") {
    try {
      const url = new URL(path || fallback, window.location.href);

      CFG.SENSITIVE_KEYS.forEach((key) => {
        url.searchParams.delete(key);
      });

      if (url.origin !== window.location.origin) {
        return url.toString();
      }

      const file = url.pathname.split("/").pop() || "index.html";
      return `./${file}${url.search || ""}${url.hash || ""}`;
    } catch (_) {
      return fallback;
    }
  }

  function keepLinksClean(root = document) {
    try {
      root.querySelectorAll("a[href]").forEach((link) => {
        const href = link.getAttribute("href") || "";

        if (
          !href ||
          href.startsWith("#") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:") ||
          href.startsWith("https://wa.me/")
        ) {
          return;
        }

        link.setAttribute("href", cleanInternalUrl(href, "./index.html"));
      });
    } catch (_) {}
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toTime(value) {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function ageHours(value) {
    const time = toTime(value);
    if (!time) return 0;
    return Math.max(0, (Date.now() - time) / 36e5);
  }

  function statusOf(row) {
    return String(row?.status || "new").toLowerCase().trim();
  }

  function countByStatus(rows, status) {
    return (rows || []).filter((row) => statusOf(row) === status).length;
  }

  function latestRows(rows, limit = 3) {
    return [...(rows || [])]
      .sort((a, b) => toTime(b.created_at) - toTime(a.created_at))
      .slice(0, limit);
  }

  function findOfferForCandidate(candidate, offers) {
    if (!candidate || !offers?.length) return null;

    if (candidate.offer_id) {
      const linked = offers.find((offer) => String(offer.id) === String(candidate.offer_id));
      if (linked) return linked;
    }

    return offers[0] || null;
  }

  function computeStats(offers = [], candidates = []) {
    return {
      offers: offers.length,
      candidates: candidates.length,
      new: countByStatus(candidates, "new"),
      review: countByStatus(candidates, "review"),
      shortlist: countByStatus(candidates, "shortlist"),
      call: countByStatus(candidates, "call"),
      accepted: countByStatus(candidates, "accepted"),
      rejected: countByStatus(candidates, "rejected")
    };
  }

  function makeAlert(input) {
    return {
      id: input.id || `alert-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      level: input.level || "info",
      icon: input.icon || "🔔",
      title: input.title || "Alerte DIGIY",
      text: input.text || "Une action est recommandée.",
      primaryLabel: input.primaryLabel || "Ouvrir",
      primaryHref: cleanInternalUrl(input.primaryHref || CFG.PATHS.cockpit),
      secondaryLabel: input.secondaryLabel || "",
      secondaryHref: input.secondaryHref ? cleanInternalUrl(input.secondaryHref) : "",
      reason: input.reason || "",
      priority: Number(input.priority || 50)
    };
  }

  function buildAlerts(offers = [], candidates = []) {
    const stats = computeStats(offers, candidates);
    const alerts = [];

    if (!offers.length) {
      alerts.push(makeAlert({
        id: "no-offer",
        level: "warning",
        icon: "➕",
        title: "Aucune mission active",
        text: "Crée une annonce prête pour ouvrir le terrain.",
        primaryLabel: "Créer",
        primaryHref: CFG.PATHS.publish,
        reason: "Sans mission active, les candidats ne savent pas où se placer.",
        priority: 100
      }));
    }

    if (offers.length && !candidates.length) {
      alerts.push(makeAlert({
        id: "offer-no-candidate",
        level: "warning",
        icon: "📎",
        title: "Mission sans candidature",
        text: "Fais circuler le QR ou le mur public.",
        primaryLabel: "Partager",
        primaryHref: CFG.PATHS.qr,
        secondaryLabel: "Mur public",
        secondaryHref: CFG.PATHS.wall,
        reason: "La mission existe, mais le terrain n’a pas encore répondu.",
        priority: 92
      }));
    }

    if (stats.new > 0) {
      alerts.push(makeAlert({
        id: "new-candidates",
        level: "hot",
        icon: "🆕",
        title: `${stats.new} nouvelle(s) candidature(s)`,
        text: "Lis vite avant que le contact refroidisse.",
        primaryLabel: "Traiter",
        primaryHref: CFG.PATHS.bureau,
        reason: "Un candidat récent doit être vu rapidement.",
        priority: 90
      }));
    }

    if (stats.call > 0) {
      alerts.push(makeAlert({
        id: "call-candidates",
        level: "action",
        icon: "📞",
        title: `${stats.call} profil(s) à appeler`,
        text: "Ces dossiers demandent un contact direct.",
        primaryLabel: "Appeler",
        primaryHref: CFG.PATHS.bureau,
        reason: "Le statut indique qu’un appel est attendu.",
        priority: 86
      }));
    }

    if (stats.shortlist > 0) {
      alerts.push(makeAlert({
        id: "shortlist",
        level: "info",
        icon: "⭐",
        title: `${stats.shortlist} profil(s) en sélection`,
        text: "Décide ou garde sous la main.",
        primaryLabel: "Voir",
        primaryHref: CFG.PATHS.bureau,
        secondaryLabel: "Rapprocher",
        secondaryHref: CFG.PATHS.match,
        reason: "Un profil sélectionné doit avancer vers une décision.",
        priority: 78
      }));
    }

    const oldNewCandidates = (candidates || []).filter((candidate) => {
      return statusOf(candidate) === "new" && ageHours(candidate.created_at) >= 24;
    });

    if (oldNewCandidates.length > 0) {
      alerts.push(makeAlert({
        id: "old-new-candidates",
        level: "warning",
        icon: "🕒",
        title: `${oldNewCandidates.length} dossier(s) attendent`,
        text: "Ces candidatures sont là depuis plus de 24h.",
        primaryLabel: "Décider",
        primaryHref: CFG.PATHS.bureau,
        reason: "Un dossier non traité trop longtemps perd de sa force.",
        priority: 84
      }));
    }

    const oldOffers = (offers || []).filter((offer) => {
      const related = (candidates || []).filter((candidate) => {
        return String(candidate.offer_id || "") === String(offer.id || "");
      });

      return related.length === 0 && ageHours(offer.published_at || offer.created_at) >= 72;
    });

    if (oldOffers.length > 0) {
      alerts.push(makeAlert({
        id: "old-offers",
        level: "warning",
        icon: "📣",
        title: `${oldOffers.length} mission(s) dorment`,
        text: "Relance avec le QR ou le mur public.",
        primaryLabel: "Partager",
        primaryHref: CFG.PATHS.qr,
        secondaryLabel: "Mur public",
        secondaryHref: CFG.PATHS.wall,
        reason: "Une mission sans réponse depuis plusieurs jours doit être remise en circulation.",
        priority: 82
      }));
    }

    const latest = latestRows(candidates, 1)[0];
    if (latest && stats.new === 0 && stats.call === 0 && stats.shortlist === 0) {
      const offer = findOfferForCandidate(latest, offers);

      alerts.push(makeAlert({
        id: "latest-clean",
        level: "info",
        icon: "👁️",
        title: "Dernier dossier visible",
        text: `${latest.full_name || "Un candidat"} · ${offer?.title || latest.trade || "mission à vérifier"}`,
        primaryLabel: "Ouvrir",
        primaryHref: CFG.PATHS.bureau,
        reason: "Même sans urgence, le dernier mouvement reste accessible.",
        priority: 52
      }));
    }

    if (!alerts.length) {
      alerts.push(makeAlert({
        id: "nothing-urgent",
        level: "success",
        icon: "✅",
        title: "Rien d’urgent",
        text: "Le coffre est propre. Tu peux créer, partager ou continuer le terrain.",
        primaryLabel: "Actions",
        primaryHref: CFG.PATHS.home,
        reason: "Aucune alerte forte détectée.",
        priority: 30
      }));
    }

    return alerts
      .sort((a, b) => b.priority - a.priority)
      .slice(0, CFG.MAX_ALERTS);
  }

  async function readData() {
    cleanVisibleUrl();

    const guard = window.DIGIY_GUARD || null;

    if (guard && typeof guard.ready === "function") {
      const session = await guard.ready();

      if (!session || !session.access_ok) {
        return {
          ok: false,
          code: "access_required",
          offers: [],
          candidates: [],
          stats: computeStats([], []),
          alerts: [
            makeAlert({
              id: "access-required",
              level: "warning",
              icon: "🔒",
              title: "Code demandé",
              text: "Ouvre ton accès JOBS pour lire les alertes réelles.",
              primaryLabel: "Entrer le code",
              primaryHref: CFG.PATHS.pin,
              reason: "Les données restent protégées tant que la session n’est pas ouverte.",
              priority: 100
            })
          ]
        };
      }
    }

    if (!window.DIGIY_CLAW_JOBS || typeof window.DIGIY_CLAW_JOBS.fetchAll !== "function") {
      return {
        ok: false,
        code: "helper_missing",
        offers: [],
        candidates: [],
        stats: computeStats([], []),
        alerts: [
          makeAlert({
            id: "helper-missing",
            level: "warning",
            icon: "⚠️",
            title: "Chef de passe sans cuisine",
            text: "Le fichier claw-tools.js doit être chargé avant les alertes réelles.",
            primaryLabel: "Recharger",
            primaryHref: CFG.PATHS.cockpit,
            reason: "Le chef de passe orchestre, mais ne remplace pas le helper de données.",
            priority: 100
          })
        ]
      };
    }

    const data = await window.DIGIY_CLAW_JOBS.fetchAll();

    const offers = Array.isArray(data?.offers) ? data.offers : [];
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    const stats = computeStats(offers, candidates);
    const alerts = buildAlerts(offers, candidates);

    return {
      ok: !!data?.ok,
      code: data?.ok ? "ok" : "data_warning",
      offers,
      candidates,
      stats,
      alerts,
      error: data?.error || ""
    };
  }

  function alertClass(level) {
    return {
      hot: "digiy-alert-hot",
      action: "digiy-alert-action",
      warning: "digiy-alert-warning",
      success: "digiy-alert-success",
      info: "digiy-alert-info"
    }[level] || "digiy-alert-info";
  }

  function renderAlert(alert) {
    return `
      <article class="digiy-alert ${alertClass(alert.level)}">
        <div class="digiy-alert-main">
          <div class="digiy-alert-icon">${esc(alert.icon)}</div>
          <div>
            <strong>${esc(alert.title)}</strong>
            <p>${esc(alert.text)}</p>
          </div>
        </div>

        <div class="digiy-alert-actions">
          <a class="digiy-alert-btn primary" href="${esc(alert.primaryHref)}">${esc(alert.primaryLabel)}</a>
          ${
            alert.secondaryHref
              ? `<a class="digiy-alert-btn" href="${esc(alert.secondaryHref)}">${esc(alert.secondaryLabel || "Voir")}</a>`
              : ""
          }
        </div>

        ${
          alert.reason
            ? `<details class="digiy-alert-details">
                <summary>Pourquoi ?</summary>
                <div>${esc(alert.reason)}</div>
              </details>`
            : ""
        }
      </article>
    `;
  }

  function injectBaseStyle() {
    if (document.getElementById("digiyJobsAlertsStyle")) return;

    const style = document.createElement("style");
    style.id = "digiyJobsAlertsStyle";
    style.textContent = `
      .digiy-alerts-wrap{
        display:grid;
        gap:10px;
      }

      .digiy-alert{
        border:1px solid rgba(255,255,255,.13);
        border-radius:22px;
        background:rgba(255,255,255,.055);
        padding:13px;
        display:grid;
        gap:10px;
      }

      .digiy-alert-main{
        display:flex;
        gap:10px;
        align-items:flex-start;
      }

      .digiy-alert-icon{
        width:36px;
        height:36px;
        flex:0 0 auto;
        border-radius:14px;
        display:grid;
        place-items:center;
        background:rgba(255,255,255,.08);
        font-size:18px;
      }

      .digiy-alert strong{
        display:block;
        color:#ecfff4;
        font-size:15px;
        line-height:1.15;
        font-weight:1000;
      }

      .digiy-alert p{
        margin:4px 0 0;
        color:rgba(236,255,244,.72);
        font-size:13px;
        line-height:1.4;
        font-weight:750;
      }

      .digiy-alert-actions{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      .digiy-alert-btn{
        min-height:42px;
        border-radius:15px;
        padding:10px 12px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        background:rgba(255,255,255,.08);
        color:#ecfff4;
        font-weight:950;
        border:1px solid rgba(255,255,255,.12);
      }

      .digiy-alert-btn.primary{
        background:linear-gradient(135deg,#facc15,#eab308);
        color:#151515;
        border-color:transparent;
      }

      .digiy-alert-details{
        border:1px solid rgba(255,255,255,.10);
        border-radius:18px;
        background:rgba(255,255,255,.035);
        overflow:hidden;
      }

      .digiy-alert-details summary{
        cursor:pointer;
        list-style:none;
        padding:11px 12px;
        font-weight:950;
        color:#fff4bd;
      }

      .digiy-alert-details summary::-webkit-details-marker{
        display:none;
      }

      .digiy-alert-details div{
        padding:0 12px 12px;
        color:rgba(236,255,244,.72);
        font-size:13px;
        line-height:1.45;
        font-weight:750;
      }

      .digiy-alert-hot{
        border-color:rgba(250,204,21,.28);
        background:rgba(250,204,21,.09);
      }

      .digiy-alert-action{
        border-color:rgba(34,197,94,.24);
        background:rgba(34,197,94,.08);
      }

      .digiy-alert-warning{
        border-color:rgba(250,204,21,.24);
        background:rgba(250,204,21,.08);
      }

      .digiy-alert-success{
        border-color:rgba(34,197,94,.24);
        background:rgba(34,197,94,.09);
      }

      .digiy-alert-info{
        border-color:rgba(56,189,248,.22);
        background:rgba(56,189,248,.07);
      }
    `;

    document.head.appendChild(style);
  }

  async function render(target = "#jobsAlerts", opts = {}) {
    injectBaseStyle();

    const node =
      typeof target === "string"
        ? document.querySelector(target)
        : target;

    if (!node) {
      return {
        ok: false,
        error: "Zone d’alertes introuvable.",
        alerts: []
      };
    }

    node.innerHTML = `
      <div class="digiy-alerts-wrap">
        <article class="digiy-alert digiy-alert-info">
          <div class="digiy-alert-main">
            <div class="digiy-alert-icon">🔎</div>
            <div>
              <strong>Lecture du terrain…</strong>
              <p>DIGIY prépare les alertes utiles.</p>
            </div>
          </div>
        </article>
      </div>
    `;

    try {
      const data = await readData();
      const alerts = data.alerts || [];

      node.innerHTML = `
        <div class="digiy-alerts-wrap">
          ${alerts.map(renderAlert).join("")}
        </div>
      `;

      keepLinksClean(node);

      return data;
    } catch (err) {
      console.error("[DIGIY_JOBS_ALERTS]", err);

      const fallback = makeAlert({
        id: "alerts-error",
        level: "warning",
        icon: "⚠️",
        title: "Alerte non chargée",
        text: "Recharge la page ou entre ton code.",
        primaryLabel: "Code",
        primaryHref: CFG.PATHS.pin,
        reason: "Le chef de passe n’a pas pu lire les données.",
        priority: 100
      });

      node.innerHTML = `
        <div class="digiy-alerts-wrap">
          ${renderAlert(fallback)}
        </div>
      `;

      keepLinksClean(node);

      return {
        ok: false,
        error: err?.message || "Erreur alertes.",
        alerts: [fallback]
      };
    }
  }

  async function getAlerts() {
    const data = await readData();
    return data.alerts || [];
  }

  async function getSnapshot() {
    return await readData();
  }

  function installAutoRender() {
    const target =
      document.querySelector("[data-digiy-jobs-alerts]") ||
      document.querySelector("#jobsAlerts");

    if (target) {
      render(target);
    }
  }

  const api = {
    CFG,
    cleanVisibleUrl,
    cleanInternalUrl,
    keepLinksClean,
    computeStats,
    buildAlerts,
    readData,
    getAlerts,
    getSnapshot,
    render,
    installAutoRender
  };

  cleanVisibleUrl();

  window.DIGIY_JOBS_ALERTS = api;
  window.JOBS_ALERTS = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installAutoRender);
  } else {
    installAutoRender();
  }

  console.info("[DIGIY_JOBS_ALERTS] chef de passe chargé.");
})();
