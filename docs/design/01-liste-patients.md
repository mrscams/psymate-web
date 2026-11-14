# Écran 1 · Liste des patients

> Spécification pour agents (frontend-feature-dev). Maquette : `01-liste-patients.html` / `.png`. Palette : Nordique (voir `Etude-couleurs-Nordique.md`). Document B, écran 1 ; flow 1 « ouvrir le bon patient en moins de 3 secondes ».
>
> Mis à jour le 14 novembre 2026 (UX-S7) : la page suit la proposition `propositions-2026-11/01-liste-patients.html` et ses décisions du 14 novembre 2026 (voir « Note UX-S7 » en fin de fiche) ; dix patients par page avec « Précédent / Suivant » au lieu d'« Afficher plus », colonne « Dernière séance » réduite à la date.
>
> Mis à jour le 11 novembre 2026 (UX-F1, audit UX du 9 novembre) : source des colonnes précisée (le contrat de la liste ne porte ni séance, ni ressentis, ni situations : synthèse `overview` par patient) ; colonne « Prochaine séance » retirée (agenda hors V1, G Q25) ; maquette HTML corrigée.

## Objectif
Le praticien connecté retrouve un patient par la recherche ou en balayant la liste, repère ceux qui demandent attention (drapeau « à surveiller », séance en cours) et ouvre la vue d'ensemble en un clic.

## Route & module
- Route Angular : `/patients` (feature `patients`, lazy, standalone components).
- API : `GET /api/patients?q=&archived=&tag=&sort=name|created|updated&cursor=&limit=` (module backend `patients`, pagination curseur, RFC 9457 en erreur). `PatientDto` ne porte que l'identité, les drapeaux, les tags et les dates de création et de modification.
- Résumé de chaque ligne (dernière séance, émotions dominantes, situations actives, brouillons) : `GET /api/patients/{id}/overview?window=30d`, une synthèse par patient, lue après la liste sans la retarder (le contrat n'a pas de liste enrichie).
- Store : `PatientsListStore` (@ngrx/signals) : `query`, `filters`, `sort`, `items`, `nextCursor`, `loading`.

## Structure de l'écran (de haut en bas)
1. **Barre d'application** (partagée) : logo + « Patients » (actif), recherche globale `/`, bascule FR/EN, avatar.
2. **En-tête de page** : titre « Patients », compteur (`N patients suivis`), bouton primaire **« Nouveau patient »** (ouvre le formulaire de création en modale).
3. **Barre d'outils** : champ de recherche (nom, initiales, tags ; `pg_trgm` + `unaccent` côté API), filtres par puces : *Tous · À surveiller · Séance en cours · Inactifs > 90 j*, tri (*Dernière séance ↓* par défaut, *Nom A→Z*, *Date de création*).
4. **Table** (colonnes) :
   | Colonne | Contenu | Note |
   |---|---|---|
   | Patient | avatar initiales + nom affiché + âge | nom = `display_name` ; pas de nom complet si pseudonymisé |
   | Statut | puce : `à surveiller` (ambre), `séance en cours` (vert), vide | drapeau porté par `patient.flag` |
   | Dernière séance | date relative + modalité (cabinet / visio / contact) | `overview.recentSessions[0]` |
   | Émotions dominantes 30 j | 3 pastilles de famille | `overview.emotions` ; peut être vide (« pas encore de ressenti ») |
   | Situations actives | nombre · première situation | `overview.activeSituations` |
   | Tags | 2 premiers tags + `+n` | |
   | Action | icône `→` « Ouvrir » (aria-label) | toute la ligne est cliquable (`<a>` englobant) |
5. **Pied de table** : « n patients affichés » et « ‹ Précédent · Suivant › » (curseur, dix par page, UX-S7) ; jamais de pagination numérotée ni de total.
6. **État vide** : illustration simple + « Aucun patient ne correspond » + bouton *Effacer les filtres*.

## Interactions
- Clic ligne → `/patients/:id` (vue d'ensemble).
- `/` focalise la recherche ; `Entrée` ouvre le 1er résultat ; `Échap` vide la recherche.
- Recherche debounce 250 ms, min 2 caractères, surlignage des correspondances (`--search-highlight`).
- Filtre « séance en cours » : `session.ended_at IS NULL` pour le praticien courant.
- Tri persistant par praticien (localStorage, clé `patients.sort`).

## Tokens à utiliser (extraits)
- fond page `--surface-ground #EEF1F6`, cartes/table `--surface-raised #FFFFFF`, bordures `--border-subtle #D6DCE6`.
- Primaire `--primary #3A63C2`, survol `#2C4C99`, teinte `#E3EAF8`.
- Drapeau « à surveiller » `--flag #B8862E` sur `#FBF1DC` ; « séance en cours » `--success #1E6B45` sur `#E4F2EA`.
- Sparkline : trait `--feeling #8B7BD6` (ressentis uniquement), aire `#ECE8F8`.
- Texte secondaire `#5A6679` (contraste ≥ 4.5:1 sur blanc), désactivé `#8A94A6` uniquement ≥ 24 px ou décoratif.
- Police : Inter (UI), JetBrains Mono (dates/heures, identifiants).

## Accessibilité
- Table réelle `<table>` avec `<th scope="col">`, tri annoncé via `aria-sort`.
- Ligne cliquable = `<a>` sur le nom + `tabindex` cohérent ; pas de `div onClick`.
- Puces de filtre = `<button aria-pressed>`.
- Cibles ≥ 44 px ; focus visible (`outline 2px #3A63C2 offset 2px`).

## Critères d'acceptation
- [ ] Recherche « mar » trouve « Marie D. » et « Omar B. » (trigram + sans accent).
- [ ] Filtre « À surveiller » ne montre que les patients `flag = watch`.
- [ ] 500 patients : première page < 300 ms (Testcontainers, seed `seed-perf`).
- [ ] Aucune couleur codée en dur hors tokens (`eslint no-hardcoded-color`).
- [ ] Test Playwright : ouvrir un patient depuis la recherche au clavier uniquement.

## Écarts avec la maquette
- **Colonne « Prochaine » (UX-F1)** : aucune séance planifiée n'existe au contrat et l'agenda est hors V1 (G Q25) ; la colonne et le tri « Prochaine séance, puis dernière » sont retirés. **Maquette corrigée** ; le tri propose « Dernière séance », « Flags d'abord » (calculés sur les résumés) et les tris du contrat (`name`, `updated`, `created`). L'ancienne mention « V1 : champ manuel » de cette fiche est abandonnée : `PatientDto` n'a pas ce champ.
- **Source des colonnes (UX-F1)** : `GET /api/patients` ne renvoie ni dernière séance, ni émotions, ni situations ; ces colonnes viennent de la synthèse `overview` de chaque ligne (contrat). Une liste enrichie côté API reste souhaitable (à proposer en tâche API).
- **Au-delà des premiers patients (UX-F1, comportement livré par UX-B1, à confirmer)** : le web lit la synthèse pour les 20 premières lignes seulement ; au-delà de 20 patients ou d'une page, le tri retombe sur « Dernière modification », les filtres « Aujourd'hui » et « Brouillons » sont désactivés avec une explication et les comptes partiels (« n séances aujourd'hui ») sont masqués. Non dessiné dans la maquette (qui montre 6 patients sur 24).
- « 24 suivis actifs · 3 séances aujourd'hui », compteurs des filtres, noms et pastilles : valeurs fictives, **ignorer**.

## Note UX-S7 (14 novembre 2026)
Décisions du 14 novembre 2026, qui corrigent la proposition 01 et font foi :
1. **Dix patients par page** (`limit=10`), pied « ‹ Précédent · Suivant › » : « Suivant » suit `nextCursor` et empile le curseur courant, « Précédent » dépile ; les deux se grisent en bout ; ni numéros ni total. Tout changement de recherche, de filtre (filtres rapides compris), de tri ou du mode archivés revient à la première page et vide la pile ; après un archivage ou une restauration, la page affichée est relue (et recule d'une page si elle s'est vidée). Remplace « Afficher plus » (point 5 ci-dessus).
2. **Dernière séance : la date seule** (« 5 nov. », année si autre que l'année en cours), puce « en cours · n min » si une séance est ouverte, « — » sans séance ; ni modalité ni durée relative.
3. **Archivés** : « Afficher les archivés » lit `GET /api/patients?archived=true` (titre « Patients archivés », bouton « Revenir aux actifs ») ; archivage `DELETE /api/patients/{id}` depuis le menu de la ligne (nom à retaper, comme la fiche), restauration `POST …/restore`.
4. **Aucun chiffre que le serveur ne sert pas** : pas de sous-titre « 24 suivis actifs · 3 séances aujourd'hui », filtres rapides sans compte, bande « Aujourd'hui » sans compteur ; le tri « Dernière séance » s'applique à la page affichée (le serveur trie par nom, création, modification).

Ce qui est livré : en pleine largeur (`data.contentWidth: 'full'`, marges 20 / 24 / 40 px, 16 px sous 600 px) ; bande « Aujourd'hui » (séance ouverte : « Reprendre » ; clôturée aujourd'hui : « Compte rendu » si le compte rendu est vide, sinon « Ouvrir ») ; rangée filtre · Tous / Aujourd'hui / À surveiller / Brouillons · « Trier par » Nom (défaut), Création, Modification, Dernière séance (`patients.sort`) ; colonnes Patient · Dernière séance · Depuis la séance · Ressentis · 30 j · Situations · Attention, actions au survol et au focus (✎ Fiche, … Ouvrir, Fiche, Exporter, Archiver / Restaurer) ; sous 600 px une carte par patient. Chaque patient de la page reçoit sa projection (dix `GET /overview` en parallèle, mises en cache par patient et version de fiche le temps de la visite).

Écarts constatés (maquette ↔ contrat) :
- **Filtre « par nom ou tag »** : `q` ne porte que sur le nom affiché ; « #sommeil » dans le champ part en paramètre `tag`. Le menu « Tags ▾ » disparaît (absent de la maquette).
- **Filtres rapides et tri « Dernière séance »** : appliqués à la page affichée ; quand la liste a plusieurs pages et que l'un d'eux est actif, le pied le dit (« Filtre et tri appliqués à cette page »).
- **« Depuis la séance »** : nombre d'entrées de `sinceLastSession.entries` (20 au plus au contrat, « 20+ » au plafond) et ressenti le plus intense parmi elles, intensité lue dans `feelings.points` (fenêtre de 30 jours) ; sans séance clôturée, le contrat renvoie les 20 dernières entrées.
- **Courbe « Ressentis · 30 j »** : `trend.points.averageIntensity` (moyenne glissante sur 7 jours, un point par jour), jours sans ressenti sautés ; en pointillés sous 3 ressentis ; émotion dominante et flèche ↑ ↓ = d'après `emotions.top[0].delta`.
- **« compte rendu à écrire »** : séance la plus récente clôturée (`closedAt`) avec un compte rendu vide ; la séance d'accueil (non clôturée) n'en déclenche pas. « sans séance depuis 35 j » de la maquette n'est pas repris (règle non servie par le contrat, maquette : « later contract »).
- **Séance ouverte** : `drafts.openSession` (la séance d'accueil a `closedAt` nul sans être ouverte).
- **Cache des projections** : la liste ne porte pas `clinical_rev` ; la clé est le patient et `currentVersion` de sa fiche, et le cache est vidé à chaque arrivée sur la liste et après chaque écriture.
- **Mobile** : comme la maquette `.phone`, ni « Brouillons » ni tri sous 600 px, « Nouveau patient » en barre basse.
- **Tirets et textes pâles** : `text-secondary` au lieu de `text-disabled` de la maquette (contraste AA) ; « séance » en `success` sur `success-bg` (teinte `session-tint` absente des tokens, comme UX-S3).

## Hors périmètre V1
Tri par score IA, colonnes personnalisables, export CSV.
