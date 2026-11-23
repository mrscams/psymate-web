# Couverture des écrans V1 par les fiches design

2 novembre 2026 · Comparaison entre les écrans que la documentation demande (carte des écrans B2/B8, flux B3, tâches `web` de C2/C6, contrat d'API) et les fiches livrées dans `design/` (24 fiches `.md`, chacune avec son `.html` et son `.png`). Pour chaque manque : ce qui existe déjà pour le remplacer, la tâche qui en a besoin, et si cela peut attendre.

## 1. Ce qui est couvert

| N° | Écran | Fiche | Maquette | Tâches web | Arabe (`/ar/`, `e2e/arabe/*.spec.ts`, M16) |
| --- | --- | --- | --- | --- | --- |
| 01 | Liste des patients | `01-liste-patients.md` | html + png | M1-06 | `arabe/patients` (vide, pleine, filtrée, archivés, 390 px) ; `arabe/parcours` (liste vide après connexion) |
| 02 | Vue d'ensemble complète | `02-vue-ensemble-patient.md` | html + png | M4-05 | `arabe/overview` (complète au bureau, une colonne au téléphone, dossier vide ; clair et sombre) ; `arabe/parcours` (après saisie, projection relue) |
| 02b | Vue d'ensemble simple « Récit » | même fiche (section vue simple) | `02b-vue-ensemble-simple.html` + png | M4-07 | — (vue simple retirée par UX-S6) |
| 04 | Graphe | `04-graphe-patient.md` | html + png | M2-06 | `arabe/graph` (de droite à gauche, de haut en bas, détail, liste équivalente) |
| 06 | Éditeur de lien (panneau) | `06-editeur-de-lien.md` | html + png | M2-04 | `arabe/graph` (éditeur ouvert, non enregistré) ; `arabe/parcours` (lien enregistré par `?link=`, relu par l'API) |
| 07 | Recherche dans le dossier | `07-recherche-dossier.md` | html + png | M4-04, M4-08 | `arabe/search` (résultats, aperçu, aucun résultat, mot arabe) ; `arabe/parcours` (/ depuis la timeline) |
| 09 | Fiche publique d'un praticien | `09-fiche-publique-praticien.md` | html + png | M5-05 | `arabe/public` (fiche, formulaire de contact non envoyé) ; `arabe/parcours` (fiche ouverte depuis l'annuaire) |
| 10 | Mon profil public | `10-mon-profil-public.md` | html + png | M5-04 | `arabe/account` (profil public) |
| 11 | Connexion (avec bloc OTP) | `11-connexion.md` | html + png | M0-07, M1-15 | `arabe/auth` (bureau, téléphone, bloc code 2FA) ; `arabe/parcours` (connexion effective en /ar/, reconnexion qui revient en /ar/) |
| 12 | Inscription | `12-inscription.md` | html + png | M0-07, M1-15 | `arabe/auth` |
| 13 | Dossier professionnel | `13-dossier-professionnel.md` | html + png | M1-15 | `arabe/account` (dossier professionnel) |
| 14 | Préférences | `14-preferences-praticien.md` | html + png | M1-16 | `arabe/account` (segments, plages horaires, thème au clavier) ; `arabe/parcours` (choix de langue fr → ar → fr, en ; reconnexion) |
| 15 | Agenda | `15-agenda.md` | html + png | hors plan C : rendu livré le 15 novembre 2026 (PR #86, G Q25 amendée), API jalon M11 de psymate-api | `arabe/agenda` (semaine, jour, mois, liste, détail, demandes en ligne) |
| 15b | Nouveau rendez-vous (panneau) | `15b-nouveau-rendez-vous.md` | html + png | idem ; soumission avec l'API | `arabe/agenda` (panneau, récurrence, chevauchement ; rendez-vous non enregistré) |
| 16 | Fiche patient (création, modification, archivage) | `16-fiche-patient.md` | html + png | M1-06 | `arabe/patients` (création, modification ; l'archivage seulement par l'API) ; `arabe/parcours` (création par N et Ctrl+Entrée) |
| 17 | Émotions personnalisées | `17-emotions-personnalisees.md` | html + png | M1-09 | `arabe/account` (vocabulaire : émotions, journal des fusions, tags) |
| 20 | Admin · Validation des praticiens | `20-admin-validation-praticiens.md` | html + png | M7-07 | `arabe/admin` **(admin)** (file, dossier et visionneuse) |
| 21 | Admin · Praticiens | `21-admin-praticiens.md` | html + png | M7-07 | `arabe/admin` **(admin)** |
| 22 | Admin · Journal | `22-admin-journal.md` | html + png | M7-07 | `arabe/admin` **(admin)** |
| 24 | Comment ça marche | `24-comment-ca-marche.md` | html + png | M5-05 | `arabe/public` (bureau, téléphone) ; `arabe/public` « arabe proposé » (alternatives et liens de langue) |
| 25 | Confirmation d'e-mail | `25-confirmation-email.md` | html + png | M0-07, M1-15 | `arabe/auth` (en attente, lien expiré) |
| 26 | Mot de passe oublié | `26-mot-de-passe-oublie.md` | html + png | M0-07 | `arabe/auth` (mot de passe oublié, nouveau mot de passe, lien expiré) |
| 27 | Compte suspendu / refusé | `27-compte-suspendu.md` | html + png | M1-15 (état), M7-07 (recours) | `arabe/auth` (compte suspendu) ; recours : `arabe/admin` **(admin)** |
| 30 | Profil 360 (quatrième onglet du dossier, panneau « Ajouter au profil ») | `30-profil-360.md` | html (png après livraison) | hors plan C2 : C11, M13-04 à M13-07 (plan `J-plan-profil-360-web.md`, G Q52 à Q57) ; API jalon M13 de psymate-api, `contract-v0.14.0` ; onglet et squelette posés par M13-05, lecture M13-06 (PR #98), écriture M13-07 (bouton « Ajouter au profil » et panneau : ajouter, modifier, retirer) : **écran livré** le 18 novembre 2026 (capture `.png` à produire, J5) | `arabe/profile360` (vide, quatre rubriques, panneau en création et en modification, 390 px) ; `arabe/parcours` (information ajoutée, relue) |
| 31 | Prise de rendez-vous publique (créneaux, coordonnées, écran d'attente) | `31-prise-de-rendez-vous-publique.md` | html + png (Fluent 2, une vue par état ; autres captures dans `captures-m14-09/`) | hors plan C2 : C12, **M14-12** (plan `K-plan-prise-de-rendez-vous.md`, G Q60 à Q63) ; API jalon M14 de psymate-api, `contract-v0.15.0` ; fiche et maquette écrites le 22 novembre 2026 (M14-09), **écran livré le 22 novembre 2026** (M14-12, PR #109) | `arabe/public` (créneaux ou « aucun créneau », coordonnées ; aucune demande envoyée, donc pas d'écran d'attente) |
| 32 | Rendez-vous par lien (vérification de l'e-mail, gestion, annulation) | `32-rendez-vous-par-lien.md` | html + png (Fluent 2, une vue par réponse de l'API) | C12, **M14-13** ; **écran livré le 22 novembre 2026** (M14-13, PR #112) | non couvert en /ar/ |
| 09, 14, 15 | Compléments M14 : bouton « Prendre rendez-vous » ; section « Prise de rendez-vous en ligne » des préférences ; demandes en ligne dans l'agenda | sections « (M14) » des fiches 09, 14 et 15 | 09 : vue « Fiche du praticien » de la maquette 31 ; 14 : `propositions-2026-11/14-preferences-prise-de-rendez-vous.html` ; 15 : `propositions-2026-11/15-agenda-demandes-en-ligne.html` (captures dans `captures-m14-09/`) | C12 : M14-12 (09), M14-11 (14), M14-14 puis M14-15 (15) ; **livrés le 22 novembre 2026** (PR #109, #108, #110, #113) | `arabe/public` (créneaux), `arabe/account` (section de prise de rendez-vous), `arabe/agenda` (demandes en ligne) |

Colonne « Arabe » (M16-29, 23 novembre 2026) : la spec de `e2e/arabe/` qui ouvre l'écran en `/ar/` (`<html dir="rtl">`, aucun défilement horizontal, axe-core sans violation, rendu mesuré). **(admin)** : ignoré sans `PSYMATE_E2E_ADMIN_*`, donc jamais joué en CI. Les écrans hors de ce tableau sont au §5.

Hors V1, fiche conservée mais rien à implémenter : 23 Signalements (V1.1, G Q26). L'agenda (15, 15b), hors V1 à l'origine (G Q25), est entré en V1 le 15 novembre 2026 : écrans rendus sur données de démonstration, API en cours, synchronisation Google toujours hors V1.

## 2. Ce qui manque

Classé par urgence : **bloquant** = une tâche d'un lot proche ne peut pas démarrer sans ; **avant son lot** = à produire avant la tâche concernée, mais rien ne presse ; **peut attendre** = fin de V1.

| Écran manquant | Ce qui existe déjà | Tâche(s) web | Verdict |
| --- | --- | --- | --- |
| **5 Éditeur d'entrée** (panneau six types, précision temporelle, curseur d'intensité, séance présélectionnée, brouillon, « Plus » replié, création d'émotion custom en ligne) | B4 écran 5 (tableau des 7 zones), B5 (barre de commande, rail « Lié à »), maquette en ancienne palette dans `UI/Patient en séance · gris-bleu lavande` (export de canevas, pas encore en `.html` autonome) | M1-08 (lot 2), puis M2-05, M6-02 | **Bloquant.** C'est l'écran central du produit, la saisie en séance. B4 est assez précis pour écrire la fiche sans nouvelle maquette ; une maquette Nordique est souhaitable mais la fiche suffit pour lancer M1-08. |
| **Historique des versions** (panneau, entrées et fiche patient) | B2 (panneau V), B4 écran 5 zone 7, fiche 16 (« 3 versions »), API `GET /api/entries/{id}/versions`, `GET /api/patients/{id}/versions` | M1-08 (critère « corriger et voir 2 versions »), M1-06 | **Bloquant** avec la fiche 5 : une section de la fiche 5 et de la fiche 16 suffit (liste des versions, diff champ par champ, `grace-period` 1 h 15 affichée). |
| **Composants partagés** : barre d'application, en-tête patient permanent (nom, âge, drapeaux, séance courante, Démarrer / Clôturer, barre de capture), navigation Mon compte, layout public, barre admin, panneau latéral `role="dialog"`, composant « état vide / chargement / erreur » | Dispersés dans les fiches 01/02/04/07/06/16 (en-tête), 10/13/14/17 (Mon compte), 09/11/12/24–27 (public), 20–22 (admin) ; B2 « En-tête patient permanent » ; `design/README.md` « Conventions communes » | M1-07 (lot 2) les pose une fois pour tous | **Bloquant** pour M1-07 : pas une maquette à dessiner, mais une fiche `00-composants-partages.md` à extraire des fiches existantes, sinon chaque agent réinvente l'en-tête et les états. |
| **Compte et sécurité** (Mon compte) : activer / désactiver la 2FA (QR + secret, vérification, codes de secours, régénération), changer le mot de passe, changer l'e-mail, déconnecter les autres sessions, dernière connexion | Fiche 14 section 5 : un résumé avec un lien « Tout voir » vers une page qui n'a ni fiche ni tâche ; API complète : `/api/me/2fa/enable`, `/verify`, `/disable`, `/recovery-codes/regenerate`, `/api/auth/password/change`, `/api/auth/email/change` + `/confirm`, `/api/auth/sessions/revoke-others`, `/api/auth/me` | **Aucune tâche web** ; M1-15 ne couvre que le bloc OTP de la connexion | **Bloquant avant M7-07, à faire dès le lot 1.** Sans cet écran, aucun administrateur ne peut entrer : `make admin` (M7-08, G Q5) impose le changement de mot de passe puis la 2FA au premier login. Proposer une fiche 18 et une tâche `M1-17 web / account-security` à la suite de M1-15. |
| **3 Timeline** (axe vertical, cartes par type, bandes de situations, zoom, virtual scroll, modes chronologique / par séance, filtres, vue décennie) | B4 écran 3, A6 ; maquette **Nordique** dans `UI/Timeline · mode chronologique · palette Nordique` (export de canevas ; le README design dit « canevas existant, à ajouter au pack ») | M3-02, M3-03, M3-04 (lot 3) | **Avant son lot.** Fiche à écrire depuis B4 + html/png à exporter de la maquette existante. Rien ne bloque les lots 0–2. |
| **8 Annuaire public** (recherche, filtres, tri, liste / carte) | B4 écran 8, B3 flux 7 ; maquette en ancienne palette dans `UI/Annuaire public · gris-bleu lavande` (export de canevas) | M5-05 (lot 3) | **Avant son lot.** La fiche 09 fixe déjà le layout public ; la fiche 8 décrit la liste et les filtres (contrat : `GET /api/public/directory`, pagination par page). |
| **Données et export** (Mon compte) : exporter un patient (PDF / Markdown), exporter tout le compte | Fiche 27 ne couvre que le compte suspendu ; API `GET /api/patients/{id}/export`, `POST /api/me/export`, `GET …/{jobId}`, `…/file` (M6-05) | **Aucune tâche web** (M6-05 est `api / clinical` seulement) | **Peut attendre** (lot 5), mais il faut une tâche : un bouton « Exporter » dans la fiche 16 ou l'en-tête patient, et une page Mon compte › Données. Proposer `M6-06 web / account-data`. |
| **Admin · Vocabulaire de l'annuaire** (liste fermée des spécialités et publics, activer / désactiver) | Fiche 21 mentionne l'onglet ; `design/README.md` « encore à maquetter » ; API `GET/POST/PATCH /api/admin/vocabulary/directory` (M1-14b, G Q15) | M7-07 (lot 5) | **Peut attendre.** Petite liste CRUD ; fiche courte à écrire avant M7-07, pas de maquette indispensable. |
| **Planche d'états vides / chargement / erreur** | C5 « chaque écran a ses trois états », B3 flux 1 (état vide première connexion) | M6-03 (lot 5) pour la revue de tous les écrans | **Peut attendre** comme planche ; mais le **composant** « état » doit être dans la fiche composants partagés dès le lot 2, sinon M6-03 refait tous les écrans. |
| **Page d'aide des raccourcis, onboarding (patient DEMO, premier message)** | B3 flux 1, M7-03 ; `N` `/` `L` `1` `2` `3` `Échap` `M` listés en B2 | M7-03 (lot 6) | **Peut attendre.** |
| **Barre de commande et rail « Lié à »** | B5 complet (grammaire, aperçu, exemples), `UI/Patient en séance` | M6-01, M6-02, M2-05 | **Peut attendre** (lot 5) ; à décrire dans la fiche 5, l'en-tête (M1-07) réserve la place. |
| **Premier login administrateur** (mot de passe à usage unique → changement obligatoire → 2FA forcée) | G Q5, M7-08 ; `POST /api/auth/password/change` | M7-07 | Couvert par la fiche « Compte et sécurité » ci-dessus + une redirection forcée ; à noter dans cette fiche. |
| **Déclinaison mobile** | B7 (tablette, cible 44 px) ; `design/README.md` « encore à maquetter » | — | **Après V1.** |

## 3. Ce que cela change pour le document H

1. **Avant le lot 2** (M1-06, M1-07, M1-08, M1-09) : écrire `00-composants-partages.md` et `05-editeur-entree.md` (avec l'historique des versions et la place de la barre de commande). Une maquette Nordique de l'écran 5 est un plus, pas un préalable.
2. **Lot 1** : ajouter `M1-17 Compte et sécurité` (fiche 18 à écrire) après M1-15 ; c'est aussi ce qui permet de tester la 2FA de la connexion de bout en bout.
3. **Avant le lot 3** : fiches 3 (timeline) et 8 (annuaire), html/png exportés des maquettes de `UI/` (la timeline est déjà en Nordique ; l'annuaire et la saisie en séance sont à repasser en Nordique, cf. `00-contexte.md` « Maquettes »).
4. **Lot 5** : ajouter `M6-06 Données et export` et une fiche courte « Admin › Vocabulaire ».
5. **Lot 6** : rien à maquetter avant ; M7-03 et M7-04 s'appuient sur B3 et B7.

## 4. État au 2 novembre 2026 (soir)

Les sept écrans manquants ont maintenant leur **fiche `.md` et leur maquette `.html`** dans `design/` : 03 Timeline, 05 Éditeur d'entrée (avec l'historique des versions), 08 Annuaire public, 18 Compte et sécurité, 19 Données et export, 28 Admin · Vocabulaire, 29 Planche d'états. Chaque fiche a une section « Écarts avec la maquette » qui dit ce que l'agent suit et ce qu'il ignore. La fiche `00-composants-partages.md` est écrite ; les tâches web **M1-17** et **M6-06** et la série API **M10** sont dans `C-plan.md` C9. Pas de `.png` pour ces fiches (décision du 2 novembre : la maquette `.html` suffit).

**3 novembre 2026** : M10-01 à M10-06 sont fusionnées (PR #73 à #81), tags `contract-v0.10.0` puis `contract-v0.11.0` posés ; seule M10-07 (filtre `specialty` admin, V1.1) reste. Les lignes « Suite proposée » ci-dessous sont donc réalisées, sauf la dernière et les deux « Rien en V1 ». Le web épingle `contract-v0.11.0`.

Écarts avec le contrat découverts en écrivant les fiches, devenus les tâches **M10-01 à M10-07** (C9 ; aucune ne bloque les lots 0–2, M10-01 à M10-05 avant le lot 3 web, tag `contract-v0.10.0`) :

| Écart | Conséquence web en V1 | Suite proposée |
| --- | --- | --- |
| `GET /api/vocabulary/directory` exige une session praticien | Les pages publiques (08) ne peuvent pas charger les libellés de la liste fermée | Endpoint public `GET /api/public/directory/vocabulary` (M10-01, fait : même contenu que l'existant, sans session, 60/min/IP) ; l'endpoint praticien est conservé |
| `GET /api/public/directory` n'a pas de paramètre `specialties` (seulement `q`, `city`, `lat/lng/radiusKm`, `professions`, `modalities`, `audiences`, `languages`, `accepting`, `sort`, `page`) | Pas de filtre ni de facette par spécialité dans l'annuaire ; le sélecteur envoie le code dans `q` | Ajouter `specialties` et sa facette (M5-02 bis) |
| Aucun endpoint ne liste les sessions actives ni la dernière connexion | Plus d'écart : `GET /api/me/security` et `POST /api/me/sessions/{id}/revoke` (M10-06, contrat `v0.11.0`, avancée en V1 le 3 novembre 2026) donnent la liste des sessions et la connexion précédente ; la ville reste absente (`city` toujours `null`) | Fait (M10-06) |
| `POST /api/auth/email/change` ne couvre qu'un compte `email_pending` | Bouton « Modifier l'e-mail » masqué pour un compte confirmé | Étendre l'endpoint (confirmation sur la nouvelle adresse) |
| Pas de restauration d'une version d'entrée (`POST /api/entries/{id}/restore` = désarchivage) | Historique des versions en lecture seule | Rien en V1 ; à décider en V1.1 |
| Export du compte : pas de mot de passe d'archive, pas de liste des jobs, pas de progression | Un seul job visible, états queued / running / done / failed / 410 | Rien en V1 |
| 409 `VOCABULARY_IN_USE` ne renvoie qu'un compteur | Pas de liste nominative des profils concernés ; lien vers Praticiens | Filtre par spécialité sur `GET /api/admin/practitioners` en V1.1 |
| `MeResponse` n'expose ni `role`, ni `twoFactorEnabled`, ni « changement de mot de passe requis » | L'état « première connexion admin » est déclenché par les 403 `PASSWORD_CHANGE_REQUIRED` / `TWO_FACTOR_REQUIRED` | Exposer ces trois champs dans `GET /api/auth/me` pour éviter un aller-retour |
| Module `patients` : `errors[]` sans `code` de champ (seulement `field`, `message`) | Les messages 422 viennent du serveur tels quels | Harmoniser avec les autres modules (`FieldProblem` avec `code`) |

Les trois maquettes de `UI/` (Timeline, Patient en séance, Annuaire) ne sont pas copiées dans `design/` : ce sont des exports de canevas (`Main.dc.html` + scripts de l'outil de maquettage), pas des `.html` statiques autonomes comme les autres fiches. Il faut en tirer un `.html` autonome et un `.png` au moment d'écrire la fiche. Aucun de ces fichiers n'est du code du projet : `psymate-web` est en Angular.

## 5. Version arabe (jalon M16, ouverture le 23 novembre 2026)

`/ar/` est proposé par les sélecteurs de langue depuis M16-29 (G Q80), **sans relecture arabophone du glossaire ni des traductions** (décision de l'utilisateur, à faire après coup). Écrans du §4, absents du tableau du §1 :

| N° | Écran | Arabe (`/ar/`) |
| --- | --- | --- |
| 03 | Timeline | `arabe/timeline` (chronologique, par séance, filtres, décennie de gauche à droite ; bureau et téléphone) ; `arabe/parcours` (entrées saisies dans le parcours) |
| 05 | Éditeur d'entrée et historique des versions | `arabe/entries` (six types, curseur d'intensité, erreur, versions) ; bloc de saisie : `arabe/capture` ; `arabe/parcours` (événement, ressenti lié, note saisis dans le bloc) |
| 08 | Annuaire public | `arabe/public` (résultats, filtres ouverts, aucun résultat) ; `arabe/parcours` (premier praticien ouvert) |
| 18 | Compte et sécurité | `arabe/account` (2FA, secret, codes de secours) ; première connexion : `arabe/auth` |
| 19 | Données et export | `arabe/account` |
| 28 | Admin · Vocabulaire | `arabe/admin` **(admin)** ; libellé arabe d'une spécialité : `arabe/libelles-catalogue` **(admin)** |
| 29 | Planche d'états | `arabe/socle` (`/_demo`, coquilles publique, praticien et d'administration, panneau latéral, confirmation) |
| 00 | Dossier patient (en-tête, onglet Séance, clôture, aide des raccourcis) | `arabe/patient-shell` ; champs de saisie : `arabe/champs` |

Ce qui n'est pas couvert en `/ar/` : la vue simple (02b, retirée), le rendez-vous par lien (32), l'écran d'attente de la prise de rendez-vous (31, aucune demande envoyée par `arabe/public`), l'enregistrement d'un rendez-vous de l'agenda (15b), l'archivage d'un patient par l'écran (16). Les tests **(admin)** n'ont jamais été joués. Les e2e arabes tournent en CI contre l'API réelle ; M16-29 n'a pas pu jouer `arabe/parcours` en local (pas d'API sur le poste).
