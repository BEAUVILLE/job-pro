/* DIGIY OREILLE MÉTIER — JOBS / MES MISSIONS V1
   Le pro parle ou écrit court.
   DIGIY met en forme.
   Le pro valide.
   Le logiciel range.
*/
(function(){
  'use strict';

  const BUILD='oreille-metier-jobs-v1-conteneur-safe-20260519';

  let lastDraft=null;
  let recognition=null;
  let listening=false;

  const $=id=>document.getElementById(id);

  const esc=v=>String(v??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');

  const strip=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const norm=v=>strip(String(v||'').toLowerCase()).replace(/[’']/g,' ').replace(/\s+/g,' ').trim();

  const toast=m=>{
    if(typeof window.showToast==='function'){
      window.showToast(m);
      return;
    }

    try{
      const n=document.createElement('div');
      n.textContent=m;
      n.style.cssText='position:fixed;left:14px;right:14px;bottom:92px;z-index:99999;padding:13px 15px;border-radius:18px;background:#062612;color:#f0fff5;border:1px solid rgba(250,204,21,.35);font:900 15px system-ui;box-shadow:0 16px 38px rgba(0,0,0,.28);';
      document.body.appendChild(n);
      setTimeout(()=>n.remove(),2600);
    }catch(_){
      alert(m);
    }
  };

  function money(text){
    const m=String(text||'').match(/(\d[\d\s.,]*)\s*(?:f|fcfa|francs?|xof|€|eur|euro)?/i);
    return m ? Number(String(m[1]).replace(/[^\d]/g,'')) || 0 : 0;
  }

  function parseDate(text){
    const t=norm(text);
    const d=new Date();
    const iso=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;

    if(t.includes('aujourd hui')) return iso(d);

    if(t.includes('demain')){
      d.setDate(d.getDate()+1);
      return iso(d);
    }

    if(t.includes('apres demain') || t.includes('apres-demain')){
      d.setDate(d.getDate()+2);
      return iso(d);
    }

    if(t.includes('fin du mois')){
      return iso(new Date(d.getFullYear(),d.getMonth()+1,0));
    }

    const w={
      dimanche:0,
      lundi:1,
      mardi:2,
      mercredi:3,
      jeudi:4,
      vendredi:5,
      samedi:6
    };

    for(const [name,target] of Object.entries(w)){
      if(t.includes(name)){
        let add=(target-d.getDay()+7)%7;
        if(add===0) add=7;
        d.setDate(d.getDate()+add);
        return iso(d);
      }
    }

    const m=String(text||'').match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);

    if(m){
      const y=m[3]
        ? Number(String(m[3]).length===2 ? '20'+m[3] : m[3])
        : d.getFullYear();

      return iso(new Date(y,Number(m[2])-1,Number(m[1])));
    }

    return '';
  }

  function hasContact(text){
    const s=String(text||'');

    return /(?:tel|tél|telephone|téléphone|whatsapp|wa)\s*[:\-]?\s*[+0-9][0-9\s().-]{6,}/i.test(s)
      || /(?:\+?221)?\s*(7[05678])[\s.-]?(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})/.test(s);
  }

  function cleanPerson(text){
    const raw=String(text||'')
      .replace(/(?:tel|tél|telephone|téléphone|whatsapp|wa)\s*[:\-]?\s*[+0-9][0-9\s().-]{6,}/ig,' ')
      .replace(/\d[\d\s.,]*/g,' ');

    const stop=new Set(
      'jobs job mission missions candidat candidate candidature candidatures profil profils bureau veille alerte publier annonce poste travail emploi recruter recrutement appel appeler retenir selectionner sélectionner classer note rappel demain aujourd hui tel telephone téléphone whatsapp wa pay argent paiement acompte solde dette depense dépense recette'.split(' ')
    );

    for(const w of raw.replace(/[.,;:!?()]/g,' ').split(/\s+/).filter(Boolean)){
      const k=norm(w);
      if(k.length>=2 && !stop.has(k)) return w.charAt(0).toUpperCase()+w.slice(1);
    }

    return 'Profil';
  }

  function cleanMission(text){
    return String(text||'')
      .replace(/\b(jobs|job|mission|missions|publier|publie|publier mission|annonce|poste|travail|emploi|besoin|recrute|recruter|recrutement|cherche|recherche|candidat|candidate|candidature|profil|prix|salaire|montant|pay|argent|demain|aujourd hui|tel|telephone|téléphone|whatsapp|wa|fcfa|francs|f)\b/gi,' ')
      .replace(/\d+/g,' ')
      .replace(/[.,;:!?]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function cleanNeed(text){
    const mission=cleanMission(text);

    if(mission) return mission;

    const t=norm(text);

    if(/\b(serveur|serveuse)\b/.test(t)) return 'Serveur / serveuse';
    if(/\b(chauffeur|driver)\b/.test(t)) return 'Chauffeur';
    if(/\b(vendeur|vendeuse)\b/.test(t)) return 'Vendeur / vendeuse';
    if(/\b(cuisinier|cuisine|chef)\b/.test(t)) return 'Cuisine';
    if(/\b(macon|maçon|chantier|ouvrier)\b/.test(t)) return 'Chantier';
    if(/\b(menage|ménage|femme de menage|nettoyage)\b/.test(t)) return 'Ménage / nettoyage';
    if(/\b(livraison|livreur)\b/.test(t)) return 'Livraison';

    return 'Mission à préciser';
  }

  function missionType(text){
    const t=norm(text);

    if(/\b(extra|journee|journée|soir|weekend|week-end)\b/.test(t)) return 'extra';
    if(/\b(cdi|long terme|permanent)\b/.test(t)) return 'long_terme';
    if(/\b(cdd|semaine|mois|temporaire)\b/.test(t)) return 'temporaire';
    if(/\b(urgence|urgent|aujourd hui|vite)\b/.test(t)) return 'urgent';

    return 'mission';
  }

  function routeDraft(title,href,note){
    return {
      type:'route',
      title,
      href,
      note:note||''
    };
  }

  function buildPayUrl(d){
    const qs=new URLSearchParams();

    qs.set('source_module','JOBS');
    qs.set('intent','quick_note');

    if(d?.amount) qs.set('amount',String(Math.round(Number(d.amount||0))));
    if(d?.amount) qs.set('amount_xof',String(Math.round(Number(d.amount||0))));

    qs.set('scope','pro');
    qs.set('kind',d?.payKind || 'expense');
    qs.set('direction',d?.direction || 'out');
    qs.set('category',d?.category || 'jobs_note');
    qs.set('label',d?.label || 'Note JOBS');
    qs.set('note',String(d?.note || '').trim());

    return 'https://pro-pay.digiylyfe.com/admin.html?' + qs.toString();
  }

  function parsePayment(text){
    const t=norm(text);
    const amount=money(text);

    let direction='out';
    let kind='expense';
    let category='jobs_expense';
    let label='Dépense JOBS';

    if(/\b(recu|reçu|recette|paiement recu|paiement reçu|versement|acompte|solde)\b/.test(t)){
      direction='in';
      kind='sale';
      category='jobs_income';
      label='Recette JOBS';
    }

    if(/\b(dette|doit|reste)\b/.test(t)){
      direction='out';
      kind='expense';
      category='jobs_debt';
      label='Dette à suivre';
    }

    if(/\b(transport|appel|internet|affiche|communication|sponsor|boost)\b/.test(t)){
      direction='out';
      kind='expense';
      category='jobs_expense';
      label='Frais mission';
    }

    return {
      type:'payment',
      title:'💰 Préparer Mon Argent',
      href:'https://pro-pay.digiylyfe.com/admin.html',
      amount,
      date:parseDate(text),
      direction,
      payKind:kind,
      category,
      label,
      note:text
    };
  }

  function parse(text){
    const original=String(text||'').trim();
    const t=norm(original);

    if(!original) return null;

    // Routes / portes
    if(/\b(hub|menu|portes|navigation)\b/.test(t)){
      return routeDraft('🧭 Ouvrir le HUB missions','./hub.html','Retour aux pavés JOBS.');
    }

    if(/\b(session|acces|accès|nettoyer|code pin|pin|code)\b/.test(t)){
      return routeDraft('🛡️ Ouvrir ma session','./session.html','Contrôler l’accès sans afficher les identifiants.');
    }

    if(/\b(veille|alertes?|cockpit|surveille|surveillance|actions?)\b/.test(t)){
      return routeDraft('🔔 Ouvrir ma veille','./cockpit.html','Voir ce qui demande une action.');
    }

    if(/\b(bureau|candidatures?|profils?|dossiers?|appeler|retenir|selectionner|sélectionner)\b/.test(t) && !/\d/.test(t)){
      return routeDraft('📥 Ouvrir mon bureau','./bureau.html','Candidatures, appels et profils à traiter.');
    }

    if(/\b(publier|annonce|mission|nouvelle mission|créer mission|creer mission)\b/.test(t) && !/\d/.test(t)){
      return routeDraft('➕ Publier une mission','./publier-mission.html','Créer une annonce prête pour le terrain.');
    }

    if(/\b(match|matcher|rapprocher)\b/.test(t)){
      return routeDraft('🤝 Ouvrir mes matchs','./match.html','Rapprocher missions et profils.');
    }

    if(/\b(fiche|ma fiche|profil pro|photo|zone|contact|confiance|visibilite|visibilité)\b/.test(t)){
      return routeDraft('🪪 Ouvrir ma fiche pro','./fiche.html','Activité, zone, contact et confiance.');
    }

    if(/\b(qr|code qr|partager|faire circuler)\b/.test(t)){
      return routeDraft('🔳 Ouvrir mon QR','./qr.html','Faire circuler les missions.');
    }

    if(/\b(mur|public|mur public|mur des missions|cote public|côté public)\b/.test(t)){
      return routeDraft('🌍 Ouvrir le mur public','./mur%20des%20missions.html','Voir les missions côté terrain.');
    }

    // Argent / PAY
    if(/\b(pay|argent|paiement|acompte|solde|dette|depense|dépense|recette|recu|reçu|doit|frais)\b/.test(t)){
      return parsePayment(original);
    }

    // Mission à publier avec données
    if(/\b(publie|publier|mission|annonce|poste|besoin|recrute|recruter|cherche|recherche|emploi|travail)\b/.test(t)){
      return {
        type:'mission',
        title:'➕ Mission à préparer',
        need:cleanNeed(original),
        missionType:missionType(original),
        amount:money(original),
        date:parseDate(original),
        urgent:/\b(urgent|urgence|vite|aujourd hui)\b/.test(t),
        note:original
      };
    }

    // Candidat / profil
    if(/\b(candidat|candidate|candidature|profil|appeler|retenir|selectionner|sélectionner|shortlist|cv)\b/.test(t)){
      return {
        type:'candidate',
        title:'📥 Candidat à suivre',
        person:cleanPerson(original),
        contact:hasContact(original),
        date:parseDate(original),
        amount:money(original),
        action:/\b(appeler|appel)\b/.test(t) ? 'appeler' : /\b(retenir|selectionner|sélectionner|shortlist)\b/.test(t) ? 'sélectionner' : 'vérifier',
        note:original
      };
    }

    // Note
    if(/\b(note|rappel|rappelle|a faire|à faire|message|demande)\b/.test(t)){
      return {
        type:'note',
        title:'📝 Note mission',
        person:cleanPerson(original),
        contact:hasContact(original),
        date:parseDate(original),
        amount:money(original),
        note:original
      };
    }

    return {
      type:'note',
      title:'📝 Note à préciser',
      person:cleanPerson(original),
      contact:hasContact(original),
      date:parseDate(original),
      amount:money(original),
      note:original
    };
  }

  function saveDraftLocal(d){
    try{
      const key='digiy_jobs_oreille_notes';
      const list=JSON.parse(localStorage.getItem(key)||'[]');

      const row={
        id:Date.now(),
        date:new Date().toISOString(),
        type:d.type||'note',
        title:d.title||'Note mission',
        need:d.need||'',
        missionType:d.missionType||'',
        person:d.person||'',
        contact:!!d.contact,
        dueDate:d.date||'',
        amount:Number(d.amount||0),
        urgent:!!d.urgent,
        action:d.action||'',
        text:d.note||''
      };

      list.unshift(row);
      localStorage.setItem(key,JSON.stringify(list.slice(0,100)));
      localStorage.setItem('digiy_jobs_oreille_last_note',JSON.stringify(row));

      if(d.type==='mission'){
        localStorage.setItem('digiy_jobs_oreille_last_mission',JSON.stringify(row));
      }

      if(d.type==='candidate'){
        localStorage.setItem('digiy_jobs_oreille_last_candidate',JSON.stringify(row));
      }

      try{
        const legacy=JSON.parse(localStorage.getItem('digiy_jobs_notes')||'[]');
        legacy.unshift(row);
        localStorage.setItem('digiy_jobs_notes',JSON.stringify(legacy.slice(0,100)));
      }catch(_){}
    }catch(_){}
  }

  function renderDraft(d){
    const box=$('digiyJobsDraft');
    const btn=$('digiyJobsValidate');

    if(!box || !btn) return;

    lastDraft=d;
    btn.disabled=!d;

    if(!d){
      box.innerHTML='<strong>Doctrine</strong><span>Le pro parle ou écrit. DIGIY met en forme. Le pro valide. Le logiciel range.</span>';
      return;
    }

    if(d.type==='route'){
      box.innerHTML=`
        <strong>${esc(d.title)}</strong>
        <span>Chemin : ${esc(d.href)}</span>
        <em>${esc(d.note||'Valide pour ouvrir la bonne porte.')}</em>
      `;
      return;
    }

    if(d.type==='mission'){
      box.innerHTML=`
        <strong>${esc(d.title)}</strong>
        <span>Besoin : ${esc(d.need||'Mission à préciser')}</span>
        <span>Type : ${esc(d.missionType||'mission')}</span>
        <span>Date : ${esc(d.date||'à préciser')}</span>
        <span>Montant entendu : ${d.amount?esc(d.amount.toLocaleString('fr-FR'))+' F':'—'}</span>
        <span>Urgence : ${d.urgent?'oui':'non'}</span>
        <em>Valide pour garder la note mission et ouvrir Publier une mission.</em>
      `;
      return;
    }

    if(d.type==='candidate'){
      box.innerHTML=`
        <strong>${esc(d.title)}</strong>
        <span>Profil : ${esc(d.person||'Profil')}</span>
        <span>Action : ${esc(d.action||'vérifier')}</span>
        <span>Contact : ${d.contact?'renseigné':'—'}</span>
        <span>Date : ${esc(d.date||'à préciser')}</span>
        <em>Valide pour garder la note candidat et ouvrir le bureau.</em>
      `;
      return;
    }

    if(d.type==='payment'){
      box.innerHTML=`
        <strong>${esc(d.title)}</strong>
        <span>Montant entendu : ${d.amount?esc(d.amount.toLocaleString('fr-FR'))+' F':'à compléter'}</span>
        <span>Catégorie : ${esc(d.category||'jobs_note')}</span>
        <span>Trace gardée localement avant ouverture.</span>
        <em>Valide pour ouvrir Mon Argent.</em>
      `;
      return;
    }

    box.innerHTML=`
      <strong>${esc(d.title)}</strong>
      <span>Profil : ${esc(d.person||'Profil')}</span>
      <span>Contact : ${d.contact?'renseigné':'—'}</span>
      <span>Date : ${esc(d.date||'à préciser')}</span>
      <span>Montant : ${d.amount?esc(d.amount.toLocaleString('fr-FR'))+' F':'—'}</span>
      <em>Valide pour garder la note mission.</em>
    `;
  }

  function executeDraft(){
    const d=lastDraft;
    if(!d) return;

    if(d.type==='note' || d.type==='mission' || d.type==='candidate' || d.type==='payment'){
      saveDraftLocal(d);
    }

    if(d.type==='mission'){
      toast('➕ Note mission gardée. Ouverture de la page mission.');
      setTimeout(()=>{ location.href='./publier-mission.html'; },180);
      return;
    }

    if(d.type==='candidate'){
      toast('📥 Note candidat gardée. Ouverture du bureau.');
      setTimeout(()=>{ location.href='./bureau.html'; },180);
      return;
    }

    if(d.type==='payment'){
      toast('💰 Note gardée. Ouverture de Mon Argent.');
      setTimeout(()=>{ location.href=buildPayUrl(d); },180);
      return;
    }

    if(d.type==='note'){
      toast('📝 Note mission gardée dans le logiciel.');
      try{
        if(typeof window.renderNotes==='function') window.renderNotes();
        if(typeof window.showPanel==='function') window.showPanel('notes');
      }catch(_){}
      return;
    }

    if(d.href){
      toast('🧭 Porte ouverte');
      setTimeout(()=>{ location.href=d.href; },160);
      return;
    }

    toast('Geste préparé.');
  }

  function startVoice(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const btn=$('digiyJobsMic');
    const input=$('digiyJobsInput');

    if(!SR){
      toast('Voix non disponible sur ce navigateur. Écris court, ça marche aussi.');
      return;
    }

    try{
      if(recognition && listening){
        recognition.stop();
        return;
      }

      recognition=new SR();
      recognition.lang='fr-FR';
      recognition.interimResults=false;
      recognition.maxAlternatives=1;

      recognition.onstart=()=>{
        listening=true;
        if(btn) btn.textContent='🎧 J’écoute…';
      };

      recognition.onend=()=>{
        listening=false;
        if(btn) btn.textContent='🎙️ Parler';
      };

      recognition.onerror=()=>{
        listening=false;
        if(btn) btn.textContent='🎙️ Parler';
        toast('Voix non comprise. Écris la phrase courte.');
      };

      recognition.onresult=e=>{
        const said=e?.results?.[0]?.[0]?.transcript||'';

        if(input && said){
          input.value=said;
          renderDraft(parse(said));
          toast('Phrase captée. Vérifie puis valide.');
        }
      };

      recognition.start();
    }catch(_){
      toast('Micro déjà ouvert ou navigateur bloqué.');
    }
  }

  function inject(){
    if($('digiyJobsEar')) return;

    const anchor =
      document.querySelector('#jobsVoicePanel') ||
      document.querySelector('.hero') ||
      document.querySelector('.grid') ||
      document.querySelector('main') ||
      document.body;

    if(!anchor) return;

    const css=document.createElement('style');

    css.textContent=`
      .digiy-jobs-ear{
        margin:12px 0;
        padding:14px;
        border:2px solid rgba(250,204,21,.34);
        border-radius:22px;
        background:linear-gradient(160deg,rgba(255,255,255,.10),rgba(34,197,94,.08));
        box-shadow:0 14px 32px rgba(0,0,0,.24);
        display:grid;
        gap:10px;
        color:#ecfff4;
      }

      .digiy-jobs-ear summary{
        list-style:none;
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        font-weight:1000;
        color:#fff8dc;
      }

      .digiy-jobs-ear summary::-webkit-details-marker{display:none}

      .digiy-jobs-ear-title{
        font-size:19px;
        font-weight:1000;
        line-height:1.1;
      }

      .digiy-jobs-ear-sub{
        margin-top:4px;
        font-size:14.5px;
        font-weight:950;
        color:rgba(236,255,244,.78);
        line-height:1.35;
      }

      .digiy-jobs-ear-chevron{
        font-size:20px;
        color:#facc15;
        font-weight:1000;
      }

      .digiy-jobs-ear[open] .digiy-jobs-ear-chevron{
        transform:rotate(180deg);
      }

      .digiy-jobs-ear-body{
        display:grid;
        gap:10px;
        margin-top:12px;
      }

      .digiy-jobs-chips{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:8px;
      }

      .digiy-jobs-chip{
        min-height:54px;
        border-radius:16px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.07);
        color:#ecfff4;
        padding:10px 11px;
        font-size:15px;
        font-weight:1000;
        text-align:center;
        cursor:pointer;
      }

      .digiy-jobs-chip.gold{
        background:rgba(250,204,21,.13);
        border-color:rgba(250,204,21,.28);
        color:#fff1a8;
      }

      .digiy-jobs-chip.green{
        background:rgba(34,197,94,.13);
        border-color:rgba(34,197,94,.28);
        color:#bbf7d0;
      }

      .digiy-jobs-input-grid{
        display:grid;
        grid-template-columns:1fr .85fr;
        gap:10px;
        align-items:start;
      }

      .digiy-jobs-ear textarea{
        width:100%;
        min-height:98px;
        border:1px solid rgba(255,255,255,.14);
        border-radius:16px;
        padding:12px;
        font-size:18px;
        font-weight:950;
        color:#ecfff4;
        background:rgba(0,0,0,.20);
        resize:vertical;
        outline:none;
      }

      .digiy-jobs-actions{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-top:8px;
      }

      .digiy-jobs-actions button{
        min-height:44px;
        border-radius:999px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.07);
        color:#ecfff4;
        padding:9px 12px;
        font-size:15px;
        font-weight:1000;
        cursor:pointer;
      }

      .digiy-jobs-actions button.primary{
        background:#facc15;
        border-color:#eab308;
        color:#1a1200;
      }

      .digiy-jobs-actions button.ok{
        background:#22c55e;
        border-color:#16a34a;
        color:#04160e;
      }

      .digiy-jobs-actions button:disabled{
        opacity:.52;
        cursor:not-allowed;
      }

      .digiy-jobs-draft{
        min-height:98px;
        border:1px solid rgba(255,255,255,.14);
        border-radius:16px;
        background:rgba(0,0,0,.18);
        padding:12px;
        display:grid;
        gap:5px;
        font-size:15px;
        line-height:1.4;
        color:rgba(236,255,244,.78);
        font-weight:950;
      }

      .digiy-jobs-draft strong{
        color:#fff;
        font-size:18px;
        font-weight:1000;
      }

      .digiy-jobs-draft em{
        color:#fff1a8;
        font-style:normal;
        font-weight:1000;
      }

      @media(max-width:760px){
        .digiy-jobs-input-grid{grid-template-columns:1fr}
        .digiy-jobs-chips{grid-template-columns:1fr 1fr}
      }

      @media(max-width:520px){
        .digiy-jobs-ear-title{font-size:18px}
        .digiy-jobs-chip{font-size:14px;min-height:52px}
        .digiy-jobs-ear textarea{font-size:17px}
        .digiy-jobs-actions button{font-size:14.5px}
      }
    `;

    document.head.appendChild(css);

    const panel=document.createElement('details');
    panel.className='digiy-jobs-ear';
    panel.id='digiyJobsEar';
    panel.open=false;

    panel.innerHTML=`
      <summary>
        <span>
          <span class="digiy-jobs-ear-title">🎙️ Mes oreilles · Mes missions</span>
          <span class="digiy-jobs-ear-sub">Tu parles ou tu écris. DIGIY met en forme. Le pro valide.</span>
        </span>
        <span class="digiy-jobs-ear-chevron">⌄</span>
      </summary>

      <div class="digiy-jobs-ear-body">
        <div class="digiy-jobs-chips">
          <button class="digiy-jobs-chip green" type="button" data-jobs-example="Publier mission serveur demain 15000">
            ➕ Mission
          </button>

          <button class="digiy-jobs-chip" type="button" data-jobs-example="Candidat Moussa à appeler demain">
            📥 Candidat
          </button>

          <button class="digiy-jobs-chip gold" type="button" data-jobs-example="Frais communication mission 3000">
            💰 Frais
          </button>

          <button class="digiy-jobs-chip" type="button" data-jobs-example="Ouvrir ma fiche pro">
            🪪 Ma fiche
          </button>

          <button class="digiy-jobs-chip" type="button" data-jobs-example="Ouvrir mon bureau">
            📥 Bureau
          </button>

          <button class="digiy-jobs-chip gold" type="button" data-jobs-example="Note rappeler candidat demain">
            📝 Note
          </button>
        </div>

        <div class="digiy-jobs-input-grid">
          <div>
            <textarea id="digiyJobsInput" placeholder="Ex. publier mission serveur demain 15000 / candidat Moussa à appeler / frais communication 3000"></textarea>

            <div class="digiy-jobs-actions">
              <button id="digiyJobsMic" type="button">🎙️ Parler</button>
              <button class="primary" id="digiyJobsPrepare" type="button">⚡ Préparer</button>
              <button class="ok" id="digiyJobsValidate" type="button" disabled>✅ Valider</button>
              <button id="digiyJobsClear" type="button">Effacer</button>
            </div>
          </div>

          <div class="digiy-jobs-draft" id="digiyJobsDraft">
            <strong>Doctrine</strong>
            <span>Le pro parle ou écrit. DIGIY met en forme. Le pro valide. Le logiciel range.</span>
          </div>
        </div>
      </div>
    `;

    if(anchor.id==='jobsVoicePanel'){
      anchor.insertAdjacentElement('afterend',panel);
    }else if(anchor.classList?.contains('hero')){
      anchor.appendChild(panel);
    }else{
      anchor.prepend(panel);
    }

    $('digiyJobsMic')?.addEventListener('click',startVoice);

    $('digiyJobsPrepare')?.addEventListener('click',()=>{
      renderDraft(parse($('digiyJobsInput')?.value||''));
    });

    $('digiyJobsValidate')?.addEventListener('click',executeDraft);

    $('digiyJobsClear')?.addEventListener('click',()=>{
      if($('digiyJobsInput')) $('digiyJobsInput').value='';
      renderDraft(null);
    });

    panel.querySelectorAll('[data-jobs-example]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const v=btn.getAttribute('data-jobs-example')||'';
        const input=$('digiyJobsInput');

        if(input) input.value=v;

        renderDraft(parse(v));
      });
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',inject);
  }else{
    inject();
  }

  window.DIGIY_OREILLE_METIER_JOBS={
    BUILD,
    parse,
    renderDraft,
    executeDraft
  };
})();
