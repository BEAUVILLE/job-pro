/*
  DIGIYLYFE — Mémoire locale JOBS
  Module : JOBS / Mes missions
  Rôle : garder les brouillons, indices de session, missions/candidatures locales
  sans bloquer Supabase. Local robuste d'abord, Supabase ensuite.
*/
(function(){
  "use strict";

  const ROOT = "DIGIY_JOBS_MEMORY_V1";
  const LEGACY = {
    slug: ["digiy_jobs_slug", "digiy_jobs_last_slug", "JOBS_LAST_SLUG"],
    phone: ["digiy_jobs_phone", "jobs_tel", "JOBS_PHONE"],
    offers: ["digiy_jobs_offers_pro"],
    candidates: ["digiy_jobs_candidates_pro"],
    draft: ["digiy_jobs_mission_draft"]
  };

  function safeStorage(kind){
    try{
      const s = kind === "session" ? window.sessionStorage : window.localStorage;
      const k = ROOT + "_TEST";
      s.setItem(k, "1");
      s.removeItem(k);
      return s;
    }catch(_){
      return null;
    }
  }

  const local = safeStorage("local");
  const session = safeStorage("session");

  function readRaw(key){
    try{
      return (session && session.getItem(key)) || (local && local.getItem(key)) || "";
    }catch(_){ return ""; }
  }

  function writeRaw(key, value, opts){
    const target = opts && opts.session ? session : local;
    if(!target) return false;
    try{
      target.setItem(key, String(value ?? ""));
      return true;
    }catch(_){ return false; }
  }

  function removeRaw(key){
    try{ if(local) local.removeItem(key); }catch(_){}
    try{ if(session) session.removeItem(key); }catch(_){}
  }

  function readJson(key, fallback){
    const raw = readRaw(key);
    if(!raw) return fallback;
    try{
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    }catch(_){
      return fallback;
    }
  }

  function writeJson(key, value, opts){
    try{
      return writeRaw(key, JSON.stringify(value), opts);
    }catch(_){ return false; }
  }

  function normSlug(value){
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g,"-")
      .replace(/[^a-z0-9-]/g,"")
      .replace(/-+/g,"-")
      .replace(/^-|-$/g,"");
  }

  function normPhone(value){
    return String(value || "").replace(/[^\d+]/g,"").slice(0,24);
  }

  function first(keys){
    for(const key of keys){
      const v = readRaw(key);
      if(String(v || "").trim()) return String(v).trim();
    }
    return "";
  }

  function sessionHint(){
    let bridge = {};
    try{
      if(window.DIGIY_MODULE_BRIDGE && typeof window.DIGIY_MODULE_BRIDGE.getSession === "function"){
        bridge = window.DIGIY_MODULE_BRIDGE.getSession() || {};
      }
    }catch(_){}

    const slug = normSlug(
      bridge.slug ||
      bridge.workspace_slug ||
      first(LEGACY.slug)
    );

    const phone = normPhone(
      bridge.phone ||
      bridge.tel ||
      first(LEGACY.phone)
    );

    return { slug, phone, module:"JOBS" };
  }

  function rememberSession(data){
    const input = data || {};
    const slug = normSlug(input.slug || input.workspace_slug || "");
    const phone = normPhone(input.phone || input.tel || "");

    if(slug){
      writeRaw("digiy_jobs_slug", slug);
      writeRaw("digiy_jobs_last_slug", slug);
    }

    if(phone){
      writeRaw("digiy_jobs_phone", phone);
      writeRaw("jobs_tel", phone);
    }

    return sessionHint();
  }

  function saveDraft(draft){
    const payload = {
      ...(draft || {}),
      updated_at: new Date().toISOString()
    };
    writeJson("digiy_jobs_mission_draft", payload);
    writeJson(ROOT + "_draft", payload);
    return payload;
  }

  function loadDraft(){
    return readJson(ROOT + "_draft", null) || readJson("digiy_jobs_mission_draft", {});
  }

  function clearDraft(){
    removeRaw(ROOT + "_draft");
    removeRaw("digiy_jobs_mission_draft");
    return true;
  }

  function listOffers(){
    const modern = readJson(ROOT + "_offers", null);
    if(Array.isArray(modern)) return modern;
    const legacy = readJson("digiy_jobs_offers_pro", []);
    return Array.isArray(legacy) ? legacy : [];
  }

  function saveOffers(items){
    const arr = Array.isArray(items) ? items : [];
    writeJson(ROOT + "_offers", arr.slice(-250));
    writeJson("digiy_jobs_offers_pro", arr.slice(-250));
    return arr;
  }

  function addOffer(offer){
    const item = {
      id: offer?.id || ("local_offer_" + Date.now()),
      ...offer,
      local_saved_at: new Date().toISOString()
    };
    const arr = listOffers().filter(x => String(x?.id) !== String(item.id));
    arr.unshift(item);
    saveOffers(arr);
    return item;
  }

  function listCandidates(){
    const modern = readJson(ROOT + "_candidates", null);
    if(Array.isArray(modern)) return modern;
    const legacy = readJson("digiy_jobs_candidates_pro", []);
    return Array.isArray(legacy) ? legacy : [];
  }

  function saveCandidates(items){
    const arr = Array.isArray(items) ? items : [];
    writeJson(ROOT + "_candidates", arr.slice(-500));
    writeJson("digiy_jobs_candidates_pro", arr.slice(-500));
    return arr;
  }

  function upsertCandidate(candidate){
    const item = {
      id: candidate?.id || ("local_candidate_" + Date.now()),
      ...candidate,
      local_saved_at: new Date().toISOString()
    };
    const arr = listCandidates().filter(x => String(x?.id) !== String(item.id));
    arr.unshift(item);
    saveCandidates(arr);
    return item;
  }

  function notes(){
    const arr = readJson(ROOT + "_notes", []);
    return Array.isArray(arr) ? arr : [];
  }

  function addNote(text, meta){
    const note = {
      id: "jobs_note_" + Date.now(),
      text: String(text || "").trim(),
      meta: meta || {},
      created_at: new Date().toISOString()
    };
    if(!note.text) return null;
    const arr = notes();
    arr.unshift(note);
    writeJson(ROOT + "_notes", arr.slice(0,200));
    return note;
  }

  function clearLocal(){
    [
      ROOT + "_draft",
      ROOT + "_offers",
      ROOT + "_candidates",
      ROOT + "_notes",
      "digiy_jobs_mission_draft"
    ].forEach(removeRaw);
    return true;
  }

  window.DIGIY_JOBS_MEMORY = {
    version: "jobs-memory-v1-20260521",
    sessionHint,
    rememberSession,
    saveDraft,
    loadDraft,
    clearDraft,
    listOffers,
    saveOffers,
    addOffer,
    listCandidates,
    saveCandidates,
    upsertCandidate,
    notes,
    addNote,
    clearLocal
  };
})();
