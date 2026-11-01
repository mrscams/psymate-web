# Contrat d'API PsyMate (copie pour le frontend)

`openapi.yaml` est la copie du contrat OpenAPI 3 généré par `psymate-api` (springdoc) à partir des contrôleurs.
Il décrit **toutes** les routes `/api/**` et `/api/public/**` du backend V1 : 86 chemins, 99 opérations, 142 schémas.

- Source de vérité : `psymate-api/contract/openapi.yaml` sur `main` (commit `adaec30`, backend V1 complet).
- Le champ `info.version` vaut `0.6.0` : c'est le **dernier tag posé**, pas un numéro de version du fichier.
  Les tags `contract-vX.Y.Z` du dépôt API marquent les jalons de contenu attendus par le frontend :

| Tag | Couvre | Écrans web concernés |
| --- | --- | --- |
| `contract-v0.2.0` | auth (register, login, 2FA, mot de passe), confirmation d'e-mail, préférences, dossier professionnel | M0-07, M1-15, M1-16 |
| `contract-v0.3.0` | patients (CRUD, versions, drapeaux, tags), entrées, séances | M1-06, M1-07, M1-08 |
| `contract-v0.4.0` | liens, graphe | M2-04, M2-05, M2-06 |
| `contract-v0.5.0` | timeline, résumé mensuel | M3-02, M3-03, M3-04 |
| `contract-v0.6.0` | recherche plein texte, vue d'ensemble (projection + récit) | M4-04, M4-05, M4-07, M4-08 |
| `contract-v0.7.0` | annuaire public, profil public, formulaire de contact | M5-04, M5-05 |
| `contract-v0.8.0` / `0.8.1` | administration (validation, comptes, journal, recours, vocabulaire), admin bootstrap, export | M7-07 |

Conventions du backend (voir `psymate-api/CLAUDE.md`) : JSON camelCase, erreurs RFC 9457 `application/problem+json` avec `code` et `errors[{field, code, message}]`, pagination par curseur (`nextCursor`) sauf annuaire public et recherche (page), dates UTC ISO 8601, session par cookie HttpOnly (`POST /api/auth/login`), `authorType` présent en lecture seulement.

## Lire le contrat

- `docs/api-reference.md` : rendu Markdown par tag (généré depuis ce fichier, pour lecture humaine ou par un agent).
- Swagger UI local : lancer l'API (`make up && make run` dans `psymate-api`, Swagger activé par `--springdoc.swagger-ui.enabled=true`) puis http://localhost:8080/swagger-ui/index.html.

## Mettre à jour

```bash
cp ../psymate-api/contract/openapi.yaml contract/openapi.yaml
```

puis regénérer `docs/api-reference.md` (script `tools/api-reference.py`, voir ce dossier). Ne jamais éditer `openapi.yaml` à la main : il est regénéré côté API et vérifié par sa CI.
