/* DIGIYLYFE — OREILLE JOBS
   Le pro ou demandeur parle. DIGIY formule.
   L’humain valide. JOBS range.
   Rien n’est confirmé automatiquement : ni emploi, ni salaire, ni rendez-vous, ni engagement.
*/
(function(){
  'use strict';
  var VERSION='oreille-jobs-v1-20260524';
  var GUIDE='Bienvenue dans Oreille JOBS DIGIYLYFE. Ici, on peut préparer une mission, une candidature, un profil, une relance, un message WhatsApp, une note de bureau ou un match entre mission et profil. DIGIY aide à préciser le métier, le lieu, la durée, le salaire ou budget proposé, le téléphone, les compétences, l’urgence et la prochaine action. Mais JOBS ne confirme jamais seul un emploi, un salaire, un rendez-vous, une candidature, une promesse ou un engagement. L’humain vérifie, modifie et valide. L’Oreille prépare. DIGIY formule. JOBS range. Le terrain garde la main.';
  var TEMPLATES=[
    '📣 Nouvelle mission — métier · lieu · durée · budget · contact.',
    '🧍 Profil candidat — nom · téléphone · métier · expérience · zone.',
    '🤝 Match à vérifier — mission · profil · disponibilité · prochaine action.',
    '📲 Message WhatsApp — remercier · reformuler · demander les infos manquantes.',
    '📅 Rendez-vous — personne · lieu · date · heure · motif.',
    '💰 Salaire / budget — montant · durée · conditions · à confirmer.',
    '📥 Note bureau — candidature · appel · relance · statut.',
    '⚠️ Brouillon — garder la trace sans promettre emploi, salaire ou rendez-vous.'
  ];
  function ready(fn){document.readyState==='loading'?document.addEventListener('DOMContentLoaded',fn):fn();}
  function core(){return window.DigiyOreilleMetier||null;}
  function norm(v){var c=core();return c&&c.normalizeText?c.normalizeText(v):String(v||'').replace(/\s+/g,' ').trim();}
  function low(v){return norm(v).toLowerCase();}
  function field(text,labels){var clean=norm(text);for(var i=0;i<labels.length;i++){var label=labels[i];var re=new RegExp('(?:^|[\\s;,.|—-])'+label+'\\s*[:\\-]?\\s*([^;|\\n]+?)(?=\\s+(?:mission|métier|metier|poste|profil|candidat|nom|tel|tél|telephone|téléphone|zone|lieu|adresse|durée|duree|date|heure|salaire|budget|montant|expérience|experience|compétence|competence|disponibilité|disponibilite|contact|message|statut|rdv|rendez-vous)\\s*[:\\-]|$)','i');var m=clean.match(re);if(m&&m[1])return norm(m[1]);}return '';}
  function phone(text){var clean=norm(text);var e=clean.match(/(?:tel|tél|telephone|téléphone|phone|whatsapp|wa|contact)\s*[:\-]?\s*((?:\+?\d[\d\s().-]{6,}\d))/i);if(e&&e[1])return norm(e[1]);var any=clean.match(/(?:\+?\d[\d\s().-]{7,}\d)/);return any?norm(any[0]):'';}
  function job(text){var x=field(text,['métier','metier','poste','mission','travail','job']);if(x)return x;var t=low(text);var jobs=['chauffeur','serveur','serveuse','ménage','menage','cuisinier','cuisinière','plombier','électricien','electricien','maçon','macon','peintre','vendeur','vendeuse','gardien','sécurité','securite','livreur','guide','artisan','commercial'];for(var i=0;i<jobs.length;i++){if(t.indexOf(jobs[i])!==-1)return jobs[i];}return '';}
  function name(text){var x=field(text,['nom','candidat','profil','personne']);if(x)return x;var m=norm(text).match(/\b(?:candidat|profil|nom|monsieur|madame|m\.|mme)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{1,45})/i);return m?norm(m[1]).replace(/\b(?:tel|métier|metier|zone|mission|poste|salaire|budget)\b.*$/i,'').trim():'';}
  function money(text){var x=field(text,['salaire','budget','montant','prix']);if(x)return x;var m=norm(text).match(/\b(\d[\d\s.,]*)\s*(fcfa|f\s*cfa|xof|cfa|€|eur|euro|euros|f)\b/i);return m?norm(m[1]+' '+(m[2]||'')):'';}
  function intent(text){var t=low(text);if(/mission|publier|poste|cherche quelqu|besoin/.test(t))return 'mission à préparer';if(/candidat|profil|cv|expérience|experience/.test(t))return 'profil candidat';if(/match|rapprocher|compatible|disponible/.test(t))return 'match à vérifier';if(/message|whatsapp|sms|répondre|repondre/.test(t))return 'message client';if(/rdv|rendez-vous|date|heure|entretien/.test(t))return 'rendez-vous à proposer';if(/salaire|budget|montant|payer|paiement/.test(t))return 'salaire / budget à vérifier';if(/bureau|relance|appel|statut|candidature/.test(t))return 'note bureau';return 'brouillon JOBS';}
  function draft(text){var clean=norm(text);return{module:'JOBS',original:clean,intent:intent(clean),job:job(clean),candidate_name:name(clean),phone:phone(clean),place:field(clean,['lieu','adresse','zone','quartier','ville']),duration:field(clean,['durée','duree','contrat','période','periode']),date:field(clean,['date','jour','rendez-vous','rdv']),time:field(clean,['heure']),money:money(clean),experience:field(clean,['expérience','experience','compétence','competence','niveau']),availability:field(clean,['disponibilité','disponibilite','dispo']),status:field(clean,['statut','état','etat'])};}
  function missing(d){var miss=[];if(!d.job)miss.push('métier / mission');if(!d.phone&&/contact|tel|téléphone|telephone|whatsapp|candidat|profil/.test(low(d.original)))miss.push('téléphone');if(!d.place&&/lieu|zone|adresse|ville|mission/.test(low(d.original)))miss.push('lieu / zone');if(!d.money&&/salaire|budget|montant|payer/.test(low(d.original)))miss.push('salaire / budget');return miss;}
  function line(label,value){return value?'\n- '+label+' : '+value:'';}
  function formulate(text){var clean=norm(text);if(!clean)return 'JOBS · Note vide : préciser la mission ou le profil avant validation.';var d=draft(clean),miss=missing(d);var out='JOBS · '+d.intent.toUpperCase()+'\nBrouillon préparé à partir de : '+clean+line('Métier / mission',d.job)+line('Profil / nom',d.candidate_name)+line('Téléphone',d.phone)+line('Lieu / zone',d.place)+line('Durée',d.duration)+line('Date',d.date)+line('Heure',d.time)+line('Salaire / budget',d.money)+line('Expérience / compétences',d.experience)+line('Disponibilité',d.availability)+line('Statut',d.status);if(miss.length)out+='\nÀ compléter avant validation : '+miss.join(', ')+'.';out+='\nÀ vérifier par l’humain avant envoi ou rangement. Aucun emploi, salaire, rendez-vous, candidature, match ou engagement n’est confirmé automatiquement.';return out;}
  function extra(text){return{jobs_draft:draft(text),status:'draft',warning:'Brouillon JOBS : validation humaine obligatoire avant emploi, salaire, rendez-vous, candidature, match ou engagement.'};}
  ready(function(){var c=core();var target=document.querySelector('#digiy-oreille-jobs')||document.querySelector('#digiy-oreille-metier')||document.querySelector('[data-digiy-oreille]');if(!c||!target){console.warn('[DIGIY JOBS] Core ou cible Oreille manquant.');return;}var instance=c.mount({module:'JOBS',title:'Oreille JOBS',subtitle:'Mission · profil · candidature · match · rendez-vous · message.',storagePrefix:'DIGIY_OREILLE_METIER',target:target,guideText:GUIDE,templates:TEMPLATES,formulate:formulate,buildSaveExtra:extra});window.DIGIY_OREILLE_JOBS={version:VERSION,instance:instance,buildDraft:draft,formulate:formulate,missingFields:missing};});
})();