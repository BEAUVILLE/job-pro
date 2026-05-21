/* DIGIYLYFE — Pont session commun
   Invisible pour le pro : garde les repères utiles côté téléphone,
   nettoie les liens sensibles affichés à l'écran,
   et expose window.DIGIY_MODULE_BRIDGE aux modules DIGIY.
*/
(function(){
  "use strict";

  const MODULE = String(window.DIGIY_MODULE || "JOBS").toUpperCase();
  const LOWER = MODULE.toLowerCase();
  const PREFIX = "DIGIY_" + MODULE + "_";

  const SENSITIVE = [
    "phone","tel","p_phone","owner_phone","subscription_phone","checkout_phone",
    "jobs_tel","jobs_phone","market_phone","business_phone","whatsapp","msisdn",
    "pin","pin4","token","session_token",
    "slug","jobs_slug","market_slug","subscription_slug","pro_slug","source_slug","owner_id",
    "module","return","redirect","redirect_url","url","from","v"
  ];

  const SLUG_KEYS = [
    "digiy_" + LOWER + "_slug",
    "digiy_" + LOWER + "_last_slug",
    LOWER + "_slug",
    "digiy_last_slug",
    PREFIX + "SLUG"
  ];

  const PHONE_KEYS = [
    "digiy_" + LOWER + "_phone",
    "digiy_" + LOWER + "_last_phone",
    LOWER + "_phone",
    LOWER + "_tel",
    "digiy_phone",
    "digiy_last_phone",
    PREFIX + "PHONE"
  ];

  const SESSION_KEYS = [
    PREFIX + "PIN_SESSION",
    PREFIX + "SESSION",
    "DIGIY_SESSION_" + MODULE,
    "DIGIY_PIN_SESSION",
    "DIGIY_ACCESS",
    "digiy_" + LOWER + "_session",
    "digiy_access",
    "digiy_session"
  ];

  function normPhone(v){
    const raw = String(v || "").trim();
    const d = raw.replace(/[^\d]/g,"");
    if(!d) return "";
    if(d.startsWith("221") && d.length === 12) return d;
    if(d.length === 9) return "221" + d;
    return d.slice(0,15);
  }

  function normSlug(v){
    return String(v || "").trim().toLowerCase()
      .replace(/\s+/g,"-")
      .replace(/[^a-z0-9-]/g,"")
      .replace(/-+/g,"-")
      .replace(/^-|-$/g,"");
  }

  function readJSON(raw){
    try{return JSON.parse(raw)}catch(_){return null}
  }

  function setBoth(k,v){
    try{sessionStorage.setItem(k,v)}catch(_){}
    try{localStorage.setItem(k,v)}catch(_){}
  }

  function first(keys){
    for(const k of keys){
      try{
        const v = sessionStorage.getItem(k) || localStorage.getItem(k) || "";
        if(v) return v;
      }catch(_){}
    }
    return "";
  }

  function writeSession(data){
    const safe = Object.assign({}, data || {}, { module: MODULE, saved_at: Date.now() });
    try{ sessionStorage.setItem(PREFIX + "SESSION", JSON.stringify(safe)); }catch(_){}
    try{ localStorage.setItem("digiy_" + LOWER + "_session", JSON.stringify(safe)); }catch(_){}

    if(safe.slug) SLUG_KEYS.forEach(k => setBoth(k, normSlug(safe.slug)));
    if(safe.phone || safe.tel) PHONE_KEYS.forEach(k => setBoth(k, normPhone(safe.phone || safe.tel)));

    return safe;
  }

  function readSession(){
    for(const k of SESSION_KEYS){
      const obj = readJSON(first([k]));
      if(obj && typeof obj === "object") return obj;
    }

    const slug = normSlug(first(SLUG_KEYS));
    const phone = normPhone(first(PHONE_KEYS));

    return { module: MODULE, slug, phone };
  }

  function captureFromUrl(){
    try{
      const u = new URL(location.href);

      const slug = normSlug(
        u.searchParams.get("slug") ||
        u.searchParams.get(LOWER + "_slug") ||
        u.searchParams.get("pro_slug") ||
        u.searchParams.get("source_slug") ||
        ""
      );

      const phone = normPhone(
        u.searchParams.get("phone") ||
        u.searchParams.get("tel") ||
        u.searchParams.get(LOWER + "_phone") ||
        u.searchParams.get(LOWER + "_tel") ||
        u.searchParams.get("owner_phone") ||
        u.searchParams.get("checkout_phone") ||
        ""
      );

      if(slug) SLUG_KEYS.forEach(k => setBoth(k, slug));
      if(phone) PHONE_KEYS.forEach(k => setBoth(k, phone));
      if(slug || phone) writeSession(Object.assign(readSession(), { slug, phone }));
    }catch(_){}
  }

  function cleanUrl(){
    try{
      const u = new URL(location.href);
      let changed = false;

      SENSITIVE.forEach(k => {
        if(u.searchParams.has(k)){
          u.searchParams.delete(k);
          changed = true;
        }
      });

      if(changed) history.replaceState({}, document.title, u.pathname + u.search + u.hash);
    }catch(_){}
  }

  function cleanLinks(){
    try{
      document.querySelectorAll("a[href]").forEach(a => {
        const href = a.getAttribute("href") || "";
        if(!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

        const u = new URL(href, location.href);
        if(u.origin !== location.origin) return;

        SENSITIVE.forEach(k => u.searchParams.delete(k));
        const file = u.pathname.split("/").pop() || "index.html";

        a.setAttribute("href","./" + file + (u.search || "") + (u.hash || ""));
      });
    }catch(_){}
  }

  function set(k,v){
    try{
      localStorage.setItem("digiy_" + LOWER + "_" + k, JSON.stringify(v));
      return true;
    }catch(_){
      return false;
    }
  }

  function get(k, fallback){
    try{
      const raw = localStorage.getItem("digiy_" + LOWER + "_" + k);
      return raw ? JSON.parse(raw) : fallback;
    }catch(_){
      return fallback;
    }
  }

  captureFromUrl();
  cleanUrl();

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", cleanLinks);
  else cleanLinks();

  window.DIGIY_MODULE_BRIDGE = {
    module: MODULE,
    readSession,
    writeSession,
    cleanUrl,
    cleanLinks,
    captureFromUrl,
    get,
    set,
    normPhone,
    normSlug
  };
})();

