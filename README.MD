# DIGIY JOBS PRO

Ce module fait partie de l’écosystème **DIGIYLYFE**.

DIGIY JOBS aide à organiser les besoins de travail, publier des missions, recevoir des candidatures, trier les profils et rapprocher les bons candidats des bonnes missions.

## Philosophie DIGIY

✅ 0% commission  
✅ Paiement direct au professionnel  
✅ Souveraineté digitale africaine  
✅ Outils simples, puissants, terrain  
✅ Le public voit les opportunités  
✅ Le pro pilote les dossiers dans son coffre  

---

## Séparation du module

### Côté PUBLIC

Le public ne voit que les informations utiles pour comprendre et postuler.

Fichiers principaux :

- `index.html` → accueil public JOBS
- `mur des missions.html` → mur public des missions visibles
- `mission.html` → fiche publique d’une mission
- `postuler.html` → formulaire public de candidature

Règles côté public :

- pas de téléphone pro visible
- pas de slug affiché
- pas de données internes
- pas de lien cockpit / bureau / match
- candidature simple : nom, WhatsApp candidat, ville, métier, disponibilité, message

---

### Côté PRO

Le professionnel travaille dans un coffre sécurisé.

Fichiers principaux :

- `pin.html` → porte d’entrée sécurisée
- `guard.js` → protection des pages métier
- `cockpit.html` → tableau de bord principal
- `publier-mission.html` → proposer un poste / publier une mission
- `bureau.html` → trier les candidatures
- `match.html` → rapprocher candidat et mission
- `qr.html` → générer un QR public propre

Règles côté PRO :

- entrée via PIN
- session locale 8h
- navigation interne sans répéter le PIN
- pas de `phone`, `tel`, `owner_phone` ou slug sensible dans les URLs visibles
- les données candidat restent dans le coffre
- le téléphone candidat peut être utilisé seulement pour WhatsApp / suivi bureau

---

## Accès sécurisé

- Entrée via `pin.html`
- Authentification : identifiant interne + PIN
- Vérification Supabase RPC : `digiy_verify_access` ou rail équivalent du module
- Session stockée localement pendant 8h
- `guard.js` protège les pages métier

---

## Parcours public

```text
Mur des missions
→ Fiche mission
→ Postuler
Le candidat voit une mission, lit les détails, puis envoie sa candidature.

Parcours professionnel
Mon espace
→ Proposer un poste
→ Bureau
→ Match
→ Suivi

Le professionnel publie une mission, reçoit les candidatures, trie les profils, puis rapproche les bons candidats des bons besoins.

Doctrine sécurité
PUBLIC = vitrine propre
PRO = coffre sécurisé
RPC publique = pont contrôlé
Ne jamais exposer côté public :
téléphone pro
owner_phone
owner_id
slug sensible
code interne
données privées
Les liens publics doivent rester propres :
mission.html?id=...
postuler.html?offer=...
mur des missions.html
Signature DIGIY JOBS

Le public voit les opportunités.
Le pro pilote les personnes.
Le bureau trie.
Le match rapproche.
Le terrain garde la main.
