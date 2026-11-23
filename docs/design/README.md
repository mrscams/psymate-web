# docs/design — maquettes Nordique pour les agents

Mis à jour le 29 octobre 2026 : renommages et décisions de docs/G-decisions.md (PsyMate, psymate-web ; agenda hors V1, signalements V1.1, tâche M1-14b). Quand une fiche et G se contredisent, G l'emporte.

Mis à jour le 11 novembre 2026 (UX-F1, après l'audit UX du 9 novembre) : les maquettes `.html`, qui n'existaient que dans la copie `docs/design` de psymate-web, sont versionnées ici ; les écarts voulus entre l'écran et la maquette (décisions G, contrat, fiche 00) y sont reportés, chaque maquette modifiée porte en tête un commentaire `UX-F1` et sa fiche le détaille dans « Écarts avec la maquette ». Les `.png` restent dans psymate-web et ne sont pas régénérés : ceux des écrans 01, 02, 02b, 06, 07, 11, 12, 14, 16, 17, 20, 21, 22, 25, 26 et 27 ne reflètent plus la maquette `.html`, qui fait foi.

Mis à jour le 15 novembre 2026 : l'agenda (fiches 15, 15b) entre en V1 (G Q25 amendée). Les écrans sont rendus sur FullCalendar 6 à l'identique des maquettes (PR #86), sur des données de démonstration ; l'API suit (jalon M11 de psymate-api, module `agenda`) ; la synchronisation Google reste hors V1. Les écarts sont dans la fiche 15, « Écarts avec la maquette ».

Mis à jour le 18 novembre 2026 : fiche 30 « Profil 360 » (quatrième onglet du dossier, feature `profile360`, API jalon M13 de psymate-api, contrat `contract-v0.14.0`) ; décisions G Q52 à Q57, plan `docs/J-plan-profil-360-web.md`.

Mis à jour le 22 novembre 2026 (M14-09) : prise de rendez-vous en ligne (jalon M14, G Q60 à Q66, plan `docs/K-plan-prise-de-rendez-vous.md`, contrat `contract-v0.15.0`) : fiches 31 et 32 avec leurs maquettes, sections « M14 » des fiches 09, 14 et 15, et deux maquettes de complément dans `propositions-2026-11/`. Ces quatre maquettes sont dessinées avec l'habillage Fluent 2 (valeurs embarquées dans chaque fichier, thèmes clair et sombre, sans police ni ressource externe) et montrent une vue par état : la barre sombre du haut choisit la vue et le thème, elle ne fait pas partie de l'écran. Captures : `captures-m14-09/`.

Chaque écran est livré en trois fichiers du même nom :

| Fichier | Usage par l'agent |
|---|---|
| `NN-ecran.md` | **Lire en premier.** Objectif, route, API, structure, règles, tokens, accessibilité, critères d'acceptation. C'est la source de vérité fonctionnelle. |
| `NN-ecran.html` | Maquette statique autonome (ouvrir dans un navigateur ; Google Fonts Inter + JetBrains Mono). Référence de mise en page et de contenu exemple. **Ne pas copier-coller dans Angular** : reproduire la structure avec Angular Material M3 + tokens SCSS. Le nom d'application affiché est **PsyMate** même si une maquette montre encore « Suivi ». |
| `NN-ecran.png` | Capture 1440 px de large, pour comparaison visuelle rapide et revue. |

## Écrans livrés

| N° | Écran | Doc B | Module(s) backend | Feature Angular |
|---|---|---|---|---|
| 01 | Liste des patients | écran 1 | `patients`, `search` | `patients` |
| 02 | Vue d'ensemble patient · **complète** | écran 2 | `overview`, `clinical`, `events` | `patient-overview` |
| 02b | Vue d'ensemble patient · **simple « Récit »** (défaut) | écran 2 | idem | `patient-overview` |
| 04 | Graphe patient | écran 4 | `linking`, `clinical` | `patient-graph` |
| 07 | Recherche dans le dossier | écran 7 | `search` | `patient-search` |
| 09 | Fiche publique d'un praticien | écran 9 | `directory` | `public-directory` |
| 10 | Mon profil public (affichage + modification) | écran 10 | `directory`, `identity` | `account-profile` |
| 11 | Connexion | — | `identity` | `auth` |
| 12 | Inscription (profession, téléphone, adresse) | — | `identity` | `auth` |
| 13 | Dossier professionnel (justificatifs, vérification) | — | `identity.verification` | `account-verification` |
| 14 | Préférences praticien | — | `identity`, `vocabulary` | `account-preferences` |
| 15 | Agenda (détail à droite) | — | `agenda` (psymate-api M11, en cours ; Google hors V1) — **en V1 depuis le 15 novembre 2026 (G Q25 amendée)**, rendu livré sur données de démonstration (PR #86) | `agenda` |
| 20 | Admin · Validation des praticiens | — | `identity.admin` (M1-14) | `admin` |
| 06 | Éditeur de lien (panneau sur le graphe) | écran 6 | `linking` | `patient-graph` |
| 15b | Panneau « Nouveau rendez-vous » (récurrence, aperçu Google, conflits) | — | `agenda` (M11) — **en V1 (G Q25 amendée)**, panneau rendu, soumission avec l'API | `agenda` |
| 16 | Fiche patient (création + modification, drapeaux, tags, archivage) | — | `patients` | `patient-form` |
| 17 | Émotions personnalisées (ajout, fusion ; promotion en V2) | — | `vocabulary` | `account-emotions` |
| 21 | Admin · Praticiens (tous les comptes, suspendre / réactiver) | — | `identity.admin` (M1-14b) | `admin` |
| 22 | Admin · Journal (décisions, accès documents, sécurité ; append-only) | — | `identity.admin` (M1-14b, vue `admin_journal_v`) | `admin` |
| 23 | Admin · Signalements de l'annuaire | — | `directory`, `identity.admin` — **V1.1 (G Q26)** | `admin` (plus tard) |
| 24 | Comment ça marche (page publique) | — | `directory` (statique) | `public-pages` |
| 25 | Confirmation d'e-mail (en attente + lien expiré) | — | `identity` | `auth` |
| 26 | Mot de passe oublié (demande + nouveau mot de passe) | — | `identity` | `auth` |
| 27 | Compte suspendu / refusé (lecture seule, export, recours) | — | `identity`, `identity.verification` (recours : M1-14b ; export : M6-05) | `auth` |

Ajoutés le 2 novembre 2026 (maquettes HTML écrites à la main depuis B, C et le contrat, `.png` à produire) :

| N° | Écran | Doc B | Module(s) backend | Feature Angular |
|---|---|---|---|---|
| 03 | Timeline (chronologique, par séance, vue décennie) | écran 3 | `clinical` (M3-01) | `patient-timeline` |
| 05 | Éditeur d'entrée (panneau six types, historique des versions, place de la barre de commande) | écran 5, B5 | `clinical` (M1-05), `vocabulary` | `entries` |
| 08 | Annuaire public (résultats, filtres, aucun résultat) | écran 8 | `directory` (M5-02) | `public-directory` |
| 18 | Compte et sécurité (2FA, mot de passe, e-mail, sessions ; premier login admin) | — | `identity` (M1-11, M7-08) — tâche web **M1-17** à ajouter | `account-security` |
| 19 | Données et export (export patient, export du compte) | — | `clinical` (M6-05) — tâche web **M6-06** à ajouter | `account-data` |
| 28 | Admin · Vocabulaire de l'annuaire (liste fermée, désactivation) | — | `identity.admin` (M1-14b, G Q15) | `admin` |
| 29 | Planche d'états : vide, chargement, erreurs, notifications, aide des raccourcis | flux 1, B7 | — (composant partagé `shared/ui/state`) | `shared` |

| 00 | Composants partagés (barre d'application, en-tête patient, navigation Mon compte, layout public, barre admin, panneau latéral, composant « état ») — pas de maquette propre | B2, B7 | — | `shared`, `core` (M1-07, M0-07, M7-07) |

Ajouté le 18 novembre 2026 (maquette `.html` validée par l'utilisateur, `.png` à produire une fois l'écran livré) :

| N° | Écran | Doc B | Module(s) backend | Feature Angular |
|---|---|---|---|---|
| 30 | Profil 360 (quatrième onglet du dossier, touche `4` ; panneau « Ajouter au profil ») | — | `patients` (psymate-api M13, `contract-v0.14.0`, routes `/api/patients/{id}/profile-items`) | `profile360` (M13-04 à M13-07, C11) |

Ajoutés le 22 novembre 2026 (M14-09 ; maquettes `.html` en Fluent 2, publiées avec la PR : l'utilisateur peut les corriger après coup, les tâches d'écran les suivent à la lettre) :

| N° | Écran | Doc B | Module(s) backend | Feature Angular |
|---|---|---|---|---|
| 31 | Prise de rendez-vous publique (créneaux, coordonnées, « Consultez votre boîte mail ») | — | `agenda` (psymate-api M14, `contract-v0.15.0`, routes `/api/public/booking/practitioners/…`) | `public` (M14-12, C12) |
| 32 | Rendez-vous par lien (vérification de l'e-mail, gestion et annulation) | — | `agenda` (M14, routes `/api/public/booking/requests/verify`, `/manage`, `/manage/cancel`) | `public` (M14-13, C12) |
| 09, 14, 15 | Compléments M14 : bouton « Prendre rendez-vous » (09) ; section « Prise de rendez-vous en ligne » des préférences (14, maquette `propositions-2026-11/14-preferences-prise-de-rendez-vous.html`) ; demandes en ligne dans l'agenda (15, maquette `propositions-2026-11/15-agenda-demandes-en-ligne.html`) | — | `agenda`, `identity` (préférences `booking.*`) | `public` (M14-12), `account` (M14-11), `agenda` (M14-14, M14-15) |

Ajoutés le 23 novembre 2026 (M16-07, version arabe, G14) : `arabe.md`, règles d'habillage de droite à gauche valables pour toutes les fiches en `/ar/` ; `arabe-glossaire.md`, termes métier proposés en arabe, non relus ; `arabe/polices.html`, comparaison des polices (IBM Plex Sans Arabic retenue, G Q71). Aucune fiche d'écran n'est ajoutée : chaque écran garde sa fiche, retournée selon `arabe.md`.

Encore à faire : déclinaison mobile (après V1). Les sept fiches du 2 novembre n'ont pas de `.png` (la maquette `.html` suffit). Les écarts avec le contrat relevés par ces fiches sont les tâches **M10** de `C-plan.md` C9. Les anciens canevas de `UI/` (timeline, saisie en séance, annuaire) sont remplacés par 03, 05 et 08.

## Parcours praticien (décision du 25 oct.)
`12 Inscription` (ouverte à tous, G Q21) → e-mail confirmé → `13 Dossier professionnel` (accès à l'outil clinique **ouvert** dès cette étape) → `20 Validation admin` → `approved` → `10 Profil public` peut être publié → `09 Fiche publique` visible. Étape e-mail : `25 Confirmation`. Refus ou suspension : `27 Compte suspendu` (lecture seule + recours), piloté depuis `21 Praticiens` ; signalements d'une fiche : `23` (V1.1). États et verrous : tableau dans `13-dossier-professionnel.md`.

## Conventions communes
- Palette et tokens : `Etude-couleurs-Nordique.md`. Aucune couleur en dur (`eslint no-hardcoded-color`).
- Éléments partagés : barre d'application ; en-tête patient (01/02/04/07/06/16/30) ; navigation « Mon compte » (10/14/13/17) ; layout public (09/11/12/24/25/26/27/31/32) ; barre admin (20/21/22/23) ; panneau latéral `role="dialog"` (06/15b/15/30). À implémenter une fois dans `shared/ui/*`.
- Formes par type d'entrée : note rectangle, événement losange, situation barre, ressenti cercle, séance carré arrondi, médicament capsule.
- Le lavande `#8B7BD6` est réservé aux ressentis ; les couleurs de familles d'émotions servent uniquement aux courbes et pastilles de famille.
- Préférences par compte (`practitioner.preferences` JSONB) : une seule source de vérité pour les bascules présentes sur plusieurs écrans (`14-preferences-praticien.md`).
- Textes : français d'abord (G Q23) ; les fichiers de traduction EN peuvent suivre sans bloquer une tâche. Arabe (G14) : propriétés logiques seulement, `dir="auto"` sur le contenu saisi, termes du glossaire (`arabe.md`, `arabe-glossaire.md`). Pas de pied de page « numéros d'urgence » sur les pages publiques (G Q20) ; les trois pages de prise de rendez-vous (fiches 31 et 32) portent, dans leur contenu, la mention d'urgence de G Q63.
- Textes et exemples (Marie D., Claire Moreau, Dr Lenoir…) sont des données de seed fictives ; `[TARIF]`, `[TÉLÉPHONE]`, `[E-MAIL]` sont des champs à renseigner.

## Prompt type pour un agent frontend
```
Implémente l'écran décrit dans docs/design/10-mon-profil-public.md (dépôt psymate-web).
Référence visuelle : docs/design/10-mon-profil-public.html (et .png).
Contrat API : openapi/openapi.yaml au tag épinglé dans CONTRACT_TAG (GET/PUT /api/me/profile).
Décisions : docs/G-decisions.md l'emporte sur la fiche en cas de contradiction.
Contraintes : Angular 22 standalone (zoneless, Signal Forms), Material 22 (M3), @ngrx/signals, tokens de docs/design/Etude-couleurs-Nordique.md,
tests Vitest + un scénario Playwright par critère d'acceptation du .md.
Ne modifie pas les composants partagés sans ouvrir une tâche séparée.
```
