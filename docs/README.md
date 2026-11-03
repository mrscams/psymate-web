# docs/ — documents de référence pour les agents du frontend `psymate-web`

Copie, le 2 novembre 2026, des documents de `psymate-api/docs/` dont un agent frontend a besoin. **La source de vérité reste `psymate-api/docs/`** : quand un document y change, on le recopie ici (jamais l'inverse ; ne pas éditer ces copies). Les documents propres au backend (D orchestration, F runbook backend, `ops/`, `handbook/`, `progress/`) ne sont pas copiés.

## Ordre de lecture pour une tâche `web / <feature>`

1. `G-decisions.md` — les décisions tranchées ; **G l'emporte sur tout autre document**, fiche design comprise.
2. La fiche de l'écran dans `design/NN-ecran.md` (+ `.html` / `.png` du même nom) — route, API, structure, règles, tokens, critères d'acceptation.
3. `B-ux.md` — B2 (carte des écrans, navigation, raccourcis), B3 (flux), B4 (spécifications des écrans 1–10), B5 (barre de commande), B7 (design system, i18n, accessibilité), B8 (compte, vérification, admin), B9 (ce que les écrans laissent possible pour le compagnon : `authorType` en lecture, jamais dessiné en V1).
4. `C-plan.md` — la ligne de la tâche (C2 ou C6, colonnes « Quoi construire » et « Critères d'acceptation »), C3 (structure du dépôt `psymate-web`, conventions), C4 (prompt type, boucle de revue).
5. `Etude-couleurs-Nordique.md` — tokens CSS, thème Material M3, mode sombre et « contraste doux », règle `no-hardcoded-color`, test de contraste (§4, §6, §7, §8).
6. `contract/openapi.yaml` — **le contrat réel** (tag `contract-v0.9.0`, 86 chemins) ; lecture humaine dans `api-reference.md`. Voir `contract/README.md`.
7. Au besoin : `A-architecture.md` (A2 cas d'usage et exigences, A4.5–A4.6 émotions et tags, A5 exemples JSON, A6 cibles de latence, A10 compte et administration, A11 réserve compagnon) et `E-modele-donnees.md` (E5.2 les 29 émotions et leurs familles, E5.3 matrice des types de liens).

## Contenu

| Fichier | Rôle pour le web |
| --- | --- |
| `00-contexte.md` | Résumé du projet et des décisions ; à lire par toute nouvelle session |
| `G-decisions.md` | Questions tranchées Q1–Q32 ; autorité sur A, B, C, E et les fiches |
| `B-ux.md` | Document principal du frontend : écrans, flux, navigation, design system |
| `C-plan.md` | Tâches `web` (M0-06, M0-07, M1-06…M1-09, M1-15, M1-16, M2-04…M2-06, M3-02…M3-04, M4-04, M4-05, M4-07, M4-08, M5-04, M5-05, M6-01…M6-04, M7-03, M7-04, M7-07), structure, conventions, prompts |
| `Etude-couleurs-Nordique.md` | Palette retenue, tokens, thème Angular Material, accessibilité |
| `A-architecture.md` | Référence fonctionnelle (UC, F, ADR) et sémantique des données servies par l'API |
| `E-modele-donnees.md` | Vocabulaires livrés (émotions, familles, types d'entrées, matrice des liens) |
| `design/README.md` | Index des 27 fiches, parcours praticien, conventions communes, prompt type frontend |
| `design/NN-*.md` + `.html` + `.png` | Une fiche par écran, sa maquette Nordique et sa capture ; `02b` est la vue simple « Récit » de la fiche `02` |
| `contract/openapi.yaml`, `contract/README.md` | Copie du contrat OpenAPI au tag épinglé ; le README donne la table tags → écrans et la procédure de mise à jour |
| `api-reference.md`, `api.html` | Rendu lisible du contrat `contract/openapi.yaml` (généré par `tools/api-reference.mjs`, ne pas éditer) |
| `couverture-ecrans.md` | Quels écrans V1 ont une fiche et une maquette, lesquels manquent, et si cela peut attendre |

Hors V1, conservées pour plus tard : `design/15-agenda.md`, `15b-nouveau-rendez-vous.md` (G Q25), `23-admin-signalements.md` (V1.1, G Q26). Rien de ces trois fiches ne s'implémente.

## Écarts entre les fiches design et le contrat réel

Les fiches ont été écrites avant le backend. **Quand une fiche et `contract/openapi.yaml` se contredisent, le contrat l'emporte** ; l'agent le signale dans sa PR. Écarts déjà relevés :

| Fiche | Ce qu'elle écrit | Ce que le contrat expose |
| --- | --- | --- |
| 06 Éditeur de lien | `POST /api/patients/{id}/links` | `POST /api/entries/{id}/links`, `GET /api/entries/{id}/links`, `PATCH` / `DELETE /api/links/{id}` |
| 10 Mon profil public | `PATCH /api/me/profile`, `PATCH …/publish {published}` | `PUT /api/me/profile`, `POST …/profile/publish`, `POST …/profile/unpublish`, `POST` / `DELETE …/profile/photo` |
| 14 Préférences | délai de correction sans version « 5 min » | 1 h 15 (`versioning.grace-period = 75m`, G Q31) |
| 16 Fiche patient | `POST /api/patients/{id}/archive` | `DELETE /api/patients/{id}` (archivage, `archived_at`) et `POST /api/patients/{id}/restore` |
| 26 Mot de passe oublié | `POST /api/auth/password/forgot`, `GET /api/auth/password/reset/{token}` | `POST /api/auth/password-reset/request`, `POST /api/auth/password-reset/confirm` |
| 11 Connexion | `423` + `Retry-After` après 5 échecs | idem, plus `202 {otpRequired}` quand la 2FA est active (`OtpRequiredResponse`), puis `POST /api/me/2fa/verify` |

Avant de coder un appel, vérifier le chemin, la méthode et les codes d'erreur dans `api-reference.md` plutôt que dans la fiche.

## Ce qui n'existe pas encore côté web

- **Document H** (`H-runbook-agents-frontend.md`) : le mode opératoire du frontend, équivalent de `F-runbook-agents-backend.md` côté API — préparation du dépôt, lots alignés sur les tags de contrat, un prompt par écran. À écrire avant de lancer le premier agent frontend.
- `CLAUDE.md`, `.claude/settings.json`, `.claude/agents/frontend-feature-dev.md` et `reviewer.md` du dépôt web (tâche M0-08, volet web ; C4 décrit le plan).
- Les fiches manquantes sont écrites (00, 03, 05, 08, 18, 19, 28, 29 ; voir `couverture-ecrans.md`) ; les écarts avec le contrat qu'elles ont révélés sont les tâches API **M10** et les tâches web **M1-17**, **M6-06** de `C-plan.md` C9. Le contrat à épingler est `contract-v0.11.0` (M10-01 à M10-06 fusionnées le 3 novembre 2026 ; seule M10-07, V1.1, reste à faire) ; `contract/openapi.yaml` et `api-reference.md` sont à ce tag.
- Une décision à ajouter dans G avant M0-06 : le scaffold actuel est en Angular 21 / npm, le plan C fixe Angular 22 / pnpm.
