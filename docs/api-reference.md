# Référence de l'API PsyMate

Généré depuis le contrat OpenAPI (`PsyMate API`, info.version 0.9.0). 86 chemins, 151 schémas.

Toutes les routes `/api/**` exigent une session (cookie posé par `POST /api/auth/login`), sauf celles marquées publiques dans leur description (`/api/auth/*`, `/api/public/**`, `/api/me/appeal`, `/api/me/export`). Erreurs : `application/problem+json` avec `code` et `errors[]`.

## Sommaire

- [Administration : journal](#tag-administration-journal) (1)
- [Administration : praticiens](#tag-administration-praticiens) (4)
- [Administration : vocabulaire de l'annuaire](#tag-administration-vocabulaire-de-lannuaire) (3)
- [Administration : vérifications](#tag-administration-verifications) (6)
- [Annuaire public](#tag-annuaire-public) (2)
- [Authentification](#tag-authentification) (13)
- [Chronologie](#tag-chronologie) (2)
- [Contact public](#tag-contact-public) (1)
- [Double authentification](#tag-double-authentification) (4)
- [Entrées](#tag-entrees) (6)
- [Export de compte](#tag-export-de-compte) (3)
- [Export patient](#tag-export-patient) (1)
- [Graphe](#tag-graphe) (2)
- [Liens](#tag-liens) (4)
- [Patients](#tag-patients) (10)
- [Profil annuaire](#tag-profil-annuaire) (6)
- [Préférences](#tag-preferences) (2)
- [Recherche](#tag-recherche) (1)
- [Recours](#tag-recours) (3)
- [Séances](#tag-seances) (4)
- [Tags](#tag-tags) (4)
- [Vocabulaire](#tag-vocabulaire) (3)
- [Vocabulaire de l'annuaire](#tag-vocabulaire-de-lannuaire) (1)
- [Vue d'ensemble](#tag-vue-densemble) (1)
- [Vérification du praticien](#tag-verification-du-praticien) (8)
- [Émotions personnelles](#tag-emotions-personnelles) (4)

## <a id="tag-administration-journal"></a>Administration : journal

### `GET /api/admin/journal`

**Liste le journal d'administration, du plus récent au plus ancien**

Administrateur avec 2FA. Lecture seule : décisions d'administration (kind admin.<kind>) et événements de sécurité, du plus récent au plus ancien, avec filtres cumulables kind, practitionerId, actorId, from, to. Jamais d'adresse IP, et les lignes d'audit patient (kind patient.*) sont écartées. Pagination par curseur opaque : limit 50 par défaut, bornée à 1..200 sans erreur ; nextCursor est null sur la dernière page. Aucune route d'écriture sur le journal (405).

operationId : `listAdminJournal`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `kind` | query | string | non | Type d'événement : égalité exacte ou préfixe (kind=admin retient admin et tous les admin.*). Minuscules, chiffres, points et soulignés, 64 caractères au plus, commençant par une lettre ; sinon 422 INVALID_KIND. Absent : tous les types. |
| `practitionerId` | query | string | non | Identifiant du compte concerné (UUID) ; sinon 422 INVALID_ID. Absent : tous. |
| `actorId` | query | string | non | Identifiant de l'administrateur auteur (UUID) ; sinon 422 INVALID_ID. Absent : tous. |
| `from` | query | string | non | Début de période, inclus : date-heure ISO 8601 avec fuseau, ou jour AAAA-MM-JJ (début de journée UTC). Sinon 422 INVALID_DATE. |
| `to` | query | string | non | Fin de période, incluse : date-heure ISO 8601 avec fuseau, ou jour AAAA-MM-JJ (fin de journée UTC incluse). Sinon 422 INVALID_DATE. |
| `cursor` | query | string | non | Curseur opaque (nextCursor de la page précédente, à renvoyer tel quel) ; absent pour la première page. Illisible : 422 INVALID_CURSOR. |
| `limit` | query | integer (int32) | non | Nombre maximal de lignes par page : 50 par défaut, ramené dans l'intervalle 1 à 200 sans erreur. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [JournalDto](#schema-journaldto) (*/*) | Page du journal. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : INVALID_KIND (kind), INVALID_ID (practitionerId ou actorId, UUID illisible), INVALID_DATE (from ou to), INVALID_CURSOR (cursor illisible). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-administration-praticiens"></a>Administration : praticiens

### `GET /api/admin/practitioners`

**Liste les comptes avec recherche, filtres et compteurs par statut**

Administrateur avec 2FA. Liste les comptes (praticiens et administrateurs) du plus récemment créé au plus ancien. Filtres cumulables : q (recherche dans le nom d'affichage et l'e-mail), status, role, profession. counts donne le nombre de comptes par statut (approved, under_review, needs_more, suspended, rejected) pour q, role et profession, sans le filtre status ni la pagination : il sert aux onglets. Pagination par curseur opaque : limit 50 par défaut, bornée à 1..200 sans erreur ; nextCursor est null sur la dernière page.

operationId : `listAdminPractitioners`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `q` | query | string | non | Texte recherché, sans casse, dans le nom d'affichage ou l'e-mail (correspondance sur une partie du texte) ; 100 caractères au plus après suppression des blancs de bord (422 TOO_LONG). Vide ou absent : pas de filtre. |
| `status` | query | `email_pending` \| `docs_pending` \| `under_review` \| `approved` \| `needs_more` \| `rejected` \| `suspended` \| `closed` | non | Statut de vérification : email_pending, docs_pending, under_review, approved, needs_more, rejected, suspended ou closed. Absent : tous les statuts. Autre valeur : 422 INVALID_STATUS. |
| `role` | query | `practitioner` \| `admin` | non | Rôle du compte : practitioner ou admin. Absent : tous les rôles. Autre valeur : 422 INVALID_ROLE. |
| `profession` | query | `psychologist` \| `psychiatrist` \| `coach` | non | Profession : psychologist, psychiatrist ou coach. Absent : toutes. Autre valeur : 422 INVALID_PROFESSION. |
| `cursor` | query | string | non | Curseur opaque (nextCursor de la page précédente, à renvoyer tel quel) ; absent pour la première page. Illisible : 422 INVALID_CURSOR. |
| `limit` | query | integer (int32) | non | Nombre maximal de comptes par page : 50 par défaut, ramené dans l'intervalle 1 à 200 sans erreur. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [AccountListDto](#schema-accountlistdto) (*/*) | Page de comptes et compteurs par statut. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : TOO_LONG (q, plus de 100 caractères), INVALID_STATUS (status), INVALID_ROLE (role), INVALID_PROFESSION (profession), INVALID_CURSOR (cursor illisible). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/admin/practitioners/{id}`

**Affiche le compte d'un praticien avec ses décisions et ses recours**

Administrateur avec 2FA. Renvoie l'état du compte, l'historique des décisions d'administration (du plus récent au plus ancien) et les recours déposés. Un compte administrateur peut aussi être consulté. Aucune donnée patient.

operationId : `getAdminPractitioner`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du compte. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [AccountDetailDto](#schema-accountdetaildto) (*/*) | Détail du compte. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_PRACTITIONER_NOT_FOUND : aucun compte avec cet identifiant. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/admin/practitioners/{id}/reactivate`

**Réactive un compte suspendu ou refusé avec un motif obligatoire**

Administrateur avec 2FA. Le motif (20 à 4000 caractères) est contrôlé en premier. Seuls les comptes suspended ou rejected sont réactivables. Le compte retrouve le statut qu'il avait avant sa suspension (à défaut approved s'il a déjà été approuvé, sinon docs_pending) ; un dossier refusé revient à docs_pending (il doit être redéposé). La date de suspension et la purge planifiée sont effacées. Décision reactivated et ligne admin.reactivate au journal ; e-mail au praticien envoyé de façon asynchrone après l'enregistrement.

operationId : `reactivateAdminPractitioner`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du compte à réactiver. |

Corps (`application/json`) : [ReasonRequest](#schema-reasonrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ReactivateDto](#schema-reactivatedto) (*/*) | Compte réactivé, avec son nouveau statut. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : corps absent ou JSON illisible (code propre à ce module). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_PRACTITIONER_NOT_FOUND : aucun compte avec cet identifiant. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_ACCOUNT_NOT_REACTIVABLE : le compte n'est ni suspended ni rejected. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : REQUIRED, TOO_SHORT (moins de 20 caractères), TOO_LONG (plus de 4000 caractères) sur le champ reason. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/admin/practitioners/{id}/suspend`

**Suspend un compte avec un motif obligatoire**

Administrateur avec 2FA. Le motif (20 à 4000 caractères) est contrôlé en premier. Impossible sur un compte déjà suspended, rejected ou closed, sur soi-même, ni sur le dernier administrateur actif. Effets : statut suspended, toutes les sessions révoquées, décision suspended et ligne admin.suspend au journal (le statut précédent y est conservé pour la réactivation), fiche d'annuaire publique dépubliée par événement, e-mail au praticien envoyé de façon asynchrone après l'enregistrement. Le praticien peut alors déposer un recours.

operationId : `suspendAdminPractitioner`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du compte à suspendre. |

Corps (`application/json`) : [ReasonRequest](#schema-reasonrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [SuspendDto](#schema-suspenddto) (*/*) | Compte suspendu. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : corps absent ou JSON illisible (code propre à ce module). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_PRACTITIONER_NOT_FOUND : aucun compte avec cet identifiant. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_SELF_SUSPEND : l'administrateur vise son propre compte ; ADMIN_ACCOUNT_NOT_SUSPENDABLE : le compte est déjà suspended, rejected ou closed ; ADMIN_LAST_ADMIN : la cible est le dernier administrateur actif. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : REQUIRED, TOO_SHORT (moins de 20 caractères), TOO_LONG (plus de 4000 caractères) sur le champ reason. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-administration-vocabulaire-de-lannuaire"></a>Administration : vocabulaire de l'annuaire

### `GET /api/admin/vocabulary/directory`

**Liste les spécialités et publics de l'annuaire, actifs ou non**

Admin avec double authentification active. Rend toutes les entrées, actives ou non, des deux types (par type puis rang puis libellé français) ou d'un seul avec kind ; usedByPublishedProfiles compte les fiches publiées qui utilisent le code. Liste complète, non paginée.

operationId : `listAdminDirectoryVocabulary`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `kind` | query | `specialty` \| `audience` | non | Type à lister : specialty (spécialités) ou audience (publics). Absent ou vide : les deux types. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ListDto](#schema-listdto) (*/*) | Entrées du vocabulaire (items). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : INVALID_VALUE (kind autre que specialty ou audience). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/admin/vocabulary/directory`

**Ajoute une spécialité ou un public à l'annuaire**

Admin avec double authentification active. Crée une entrée active ; le code ne change plus ensuite et ne se supprime jamais. Sans sortOrder, l'entrée prend le rang suivant celui du dernier de son type (32767 au plus). Réponse 201 avec l'entrée créée.

operationId : `createAdminDirectoryVocabulary`

Corps (`application/json`) : [CreateRequest](#schema-createrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [ItemDto](#schema-itemdto) (*/*) | Entrée créée. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | INVALID_BODY : corps JSON illisible (syntaxe ou type de champ invalide). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VOCABULARY_EXISTS : ce code existe déjà pour ce type. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : INVALID_VALUE (kind absent ou autre que specialty ou audience), REQUIRED (code, labelFr), INVALID_FORMAT (code hors du format minuscule, chiffres et underscores, 2 à 40 caractères, commençant par une lettre), TOO_LONG (labelFr, labelEn au-delà de 120 caractères), OUT_OF_RANGE (sortOrder hors de 0 à 32767). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `PATCH /api/admin/vocabulary/directory/{kind}/{code}`

**Modifie les libellés, le rang ou l'activation d'une entrée du vocabulaire**

Admin avec double authentification active. Modification partielle : un champ absent reste inchangé, labelEn vide efface le libellé anglais. Une entrée désactivée disparaît de GET /api/vocabulary/directory et ne peut plus être choisie ni publiée ; on ne peut la désactiver que si aucune fiche publiée ne l'utilise. Le code et le type ne changent pas.

operationId : `updateAdminDirectoryVocabulary`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `kind` | path | `specialty` \| `audience` | oui | Type de l'entrée : specialty (spécialité) ou audience (public). |
| `code` | path | string | oui | Code de l'entrée à modifier. |

Corps (`application/json`) : [PatchRequest](#schema-patchrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ItemDto](#schema-itemdto) (*/*) | Entrée mise à jour. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | INVALID_BODY : corps JSON illisible (syntaxe ou type de champ invalide). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VOCABULARY_NOT_FOUND : type inconnu ou code inexistant pour ce type. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VOCABULARY_IN_USE : désactivation refusée, au moins une fiche publiée utilise ce code ; le champ usedByPublishedProfiles donne leur nombre. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : REQUIRED (labelFr vide), TOO_LONG (labelFr, labelEn au-delà de 120 caractères), OUT_OF_RANGE (sortOrder hors de 0 à 32767). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-administration-verifications"></a>Administration : vérifications

### `GET /api/admin/verifications`

**Liste la file des dossiers de vérification à traiter**

Administrateur avec 2FA. Renvoie les dossiers de praticiens (jamais les administrateurs) dans l'état demandé : under_review (soumis, en attente de décision, par défaut) ou needs_more (complément demandé). Triés par date de soumission, à défaut par dernière mise à jour du compte : du plus ancien (oldest, par défaut) au plus récent (newest). overdue signale un dossier under_review en attente depuis plus de 2 jours ouvrés. Pagination par curseur opaque : limit 50 par défaut, bornée à 1..200 sans erreur ; nextCursor est null sur la dernière page.

operationId : `listAdminVerifications`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `status` | query | `under_review` \| `needs_more` | non | Statut des dossiers à lister : under_review (défaut) ou needs_more. Autre valeur : 422 INVALID_STATUS. |
| `sort` | query | `oldest` \| `newest` | non | Ordre de tri par date de soumission : oldest (défaut, du plus ancien au plus récent) ou newest. Autre valeur : 422 INVALID_SORT. |
| `cursor` | query | string | non | Curseur opaque (nextCursor de la page précédente, à renvoyer tel quel) ; absent pour la première page. Illisible : 422 INVALID_CURSOR. |
| `limit` | query | integer (int32) | non | Nombre maximal de dossiers par page : 50 par défaut, ramené dans l'intervalle 1 à 200 sans erreur. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [QueueDto](#schema-queuedto) (*/*) | Page de la file. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : INVALID_STATUS (status, autre que under_review ou needs_more), INVALID_SORT (sort, autre que oldest ou newest), INVALID_CURSOR (cursor illisible). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/admin/verifications/{practitionerId}`

**Affiche le dossier de vérification d'un praticien**

Administrateur avec 2FA. Renvoie l'identité, les coordonnées, les justificatifs non retirés par le praticien (métadonnées seulement, le contenu s'ouvre par URL signée) et l'historique des décisions, quel que soit l'état de vérification du compte. Les comptes administrateurs n'ont pas de dossier (404). Aucune donnée patient.

operationId : `getAdminVerification`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `practitionerId` | path | string (uuid) | oui | Identifiant du praticien. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [DossierDto](#schema-dossierdto) (*/*) | Dossier du praticien. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_DOSSIER_NOT_FOUND : aucun praticien avec cet identifiant, ou compte administrateur. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/admin/verifications/{practitionerId}/decision`

**Approuve, demande un complément ou refuse un dossier**

Administrateur avec 2FA. Décision append-only sur un compte en under_review ou needs_more (409 sinon) : approved passe le compte à approved, needs_more à needs_more, rejected à rejected (compte désactivé, sessions révoquées, purge du compte planifiée 30 jours plus tard). approved exige que tous les justificatifs non purgés soient conformes, sauf force=true avec une note interne. Le praticien reçoit un e-mail, envoyé de façon asynchrone après l'enregistrement ; les fichiers du dossier sont purgés 90 jours après la décision. Réponse 201 sans en-tête Location.

operationId : `decideAdminVerification`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `practitionerId` | path | string (uuid) | oui | Identifiant du praticien dont le dossier est décidé. |

Corps (`application/json`) : [DecisionRequest](#schema-decisionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [AdminDecisionDto](#schema-admindecisiondto) (*/*) | Décision enregistrée, avec le nouvel état de vérification du compte. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : corps absent ou JSON illisible (code propre à ce module). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_DOSSIER_NOT_FOUND : aucun praticien avec cet identifiant, ou compte administrateur. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_DOSSIER_NOT_REVIEWABLE : le compte n'est ni under_review ni needs_more ; ADMIN_APPROVAL_INCOMPLETE : approved sans force alors que des justificatifs ne sont pas conformes ou qu'il n'y en a aucun, la liste des identifiants à traiter est dans la propriété complémentaire pendingDocuments. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : INVALID_KIND (kind), MESSAGE_REQUIRED (messageToPractitioner, pour needs_more et rejected), TOO_LONG (messageToPractitioner ou internalNote, plus de 4000 caractères), NOTE_REQUIRED (internalNote, pour approved avec force=true), TOO_LARGE (checklist, plus de 20 000 caractères sérialisée). Contrôlé avant la recherche du compte. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `PATCH /api/admin/verifications/{practitionerId}/documents/{docId}`

**Qualifie un justificatif du dossier**

Administrateur avec 2FA. Pose l'état d'examen du justificatif : pending (à examiner), conform ou non_conform ; l'administrateur et la date de qualification sont enregistrés. Réponse 200 avec le justificatif à jour. Aucune restriction sur l'état de vérification du compte, et l'opération peut être répétée. La qualification n'envoie aucun e-mail : elle sert à la décision (approved exige que tous les justificatifs soient conformes, sauf force).

operationId : `reviewAdminDocument`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `practitionerId` | path | string (uuid) | oui | Identifiant du praticien propriétaire du justificatif. |
| `docId` | path | string (uuid) | oui | Identifiant du justificatif. |

Corps (`application/json`) : [ReviewRequest](#schema-reviewrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [AdminDocumentDto](#schema-admindocumentdto) (*/*) | Justificatif à jour. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : corps absent ou JSON illisible (code propre à ce module). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_DOCUMENT_NOT_FOUND : justificatif inexistant, retiré par le praticien ou rattaché à un autre praticien. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; code de champ : INVALID_REVIEWED_STATUS (reviewedStatus, absent ou autre que pending, conform, non_conform). Contrôlé avant la recherche du justificatif. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/admin/verifications/{practitionerId}/documents/{docId}/file`

**Sert le justificatif déchiffré et consigne l'accès**

Administrateur avec 2FA, le même que celui qui a obtenu l'URL signée : exp et sig viennent de getAdminDocumentUrl et ne sont valables que 5 minutes. Le fichier est déchiffré à la volée et servi en ligne (Content-Disposition inline, Cache-Control no-store, X-Content-Type-Options nosniff) avec son type MIME d'origine. Chaque lecture écrit une ligne dans le journal d'accès aux documents et une ligne admin.document_read dans le journal d'administration.

operationId : `getAdminDocumentFile`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `practitionerId` | path | string (uuid) | oui | Identifiant du praticien propriétaire du justificatif. |
| `docId` | path | string (uuid) | oui | Identifiant du justificatif. |
| `exp` | query | integer (int64) | non | Échéance de l'URL signée, en secondes depuis l'epoch Unix (UTC), telle que reçue dans l'url de getAdminDocumentUrl. Absent ou dépassé : 403 ADMIN_SIGNED_URL_INVALID. |
| `sig` | query | string | non | Signature de l'URL, telle que reçue dans l'url de getAdminDocumentUrl. Absente ou invalide : 403 ADMIN_SIGNED_URL_INVALID. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | string (binary) (application/pdf) | Contenu du justificatif, avec son type MIME d'origine. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_SIGNED_URL_INVALID : exp ou sig absent, signature invalide, URL expirée ou émise pour un autre administrateur. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_DOCUMENT_NOT_FOUND : justificatif inexistant, retiré par le praticien ou rattaché à un autre praticien. |
| 410 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_DOCUMENT_PURGED : le fichier a été purgé, il n'existe plus. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/admin/verifications/{practitionerId}/documents/{docId}/url`

**Émet une URL signée de 5 minutes pour ouvrir un justificatif**

Administrateur avec 2FA. Renvoie un chemin relatif vers getAdminDocumentFile, signé pour cet administrateur et ce justificatif, valable 5 minutes (expiresAt). Rien n'est journalisé à l'émission : c'est l'ouverture du fichier qui est consignée. Le justificatif doit appartenir au praticien, ne pas avoir été retiré par lui (404) ni avoir été purgé (410).

operationId : `getAdminDocumentUrl`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `practitionerId` | path | string (uuid) | oui | Identifiant du praticien propriétaire du justificatif. |
| `docId` | path | string (uuid) | oui | Identifiant du justificatif. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [AdminSignedUrlDto](#schema-adminsignedurldto) (*/*) | URL signée et son échéance. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_DOCUMENT_NOT_FOUND : justificatif inexistant, retiré par le praticien ou rattaché à un autre praticien. |
| 410 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ADMIN_DOCUMENT_PURGED : le fichier a été purgé, il n'existe plus. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-annuaire-public"></a>Annuaire public

### `GET /api/public/directory`

**Recherche les praticiens publiés de l'annuaire**

Public, sans session ; limité à 60 requêtes par minute et par IP (429 RATE_LIMITED). Ne rend que les profils publiés. Les filtres se cumulent ; pour modalities, audiences et languages une fiche est retenue si elle a au moins une des valeurs demandées. Réponse paginée par page de 20 (page, totalPages) ; au plus 500 fiches sont examinées avant pagination, total et facettes portent sur ce lot. 200 avec Cache-Control: max-age=60, public.

operationId : `searchPublicDirectory`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `q` | query | string | non | Texte libre, 100 caractères au plus : tous les mots doivent correspondre, dans le nom, les codes de spécialités (ex. anxiety), la ville ou la présentation, sans tenir compte des accents ; un nom proche est aussi retenu. Absent : pas de filtre texte. |
| `city` | query | string | non | Ville exacte, 100 caractères au plus, sans tenir compte de la casse ni des accents. Ignoré quand lat et lng sont fournis. |
| `lat` | query | number (double) | non | Latitude du point de recherche en degrés, de -90 à 90 ; va avec lng. Ne rend que les fiches dont la position est renseignée, dans radiusKm, avec distanceKm. En V1 aucune fiche n'a encore de position : un filtre lat/lng ne renvoie aucun résultat. |
| `lng` | query | number (double) | non | Longitude du point de recherche en degrés, de -180 à 180 ; va avec lat. |
| `radiusKm` | query | number (double) | non | Rayon de recherche en kilomètres autour de lat et lng, de 0 (exclu) à 1000. Défaut : 25. Sans effet quand lat et lng sont absents. |
| `professions` | query | string[] | non | Professions retenues parmi psychologist, psychiatrist, coach : valeurs séparées par des virgules ou paramètre répété, 20 au plus. Absent : toutes. |
| `modalities` | query | string[] | non | Modalités retenues parmi in_person, video, home : valeurs séparées par des virgules ou paramètre répété, 20 au plus. Absent : toutes. |
| `audiences` | query | string[] | non | Publics accueillis retenus (codes de GET /api/vocabulary/directory) : valeurs séparées par des virgules ou paramètre répété, 20 au plus. Absent : tous. |
| `languages` | query | string[] | non | Langues retenues, codes ISO 639-1 : valeurs séparées par des virgules ou paramètre répété, 20 au plus. Absent : toutes. |
| `accepting` | query | boolean | non | true pour ne garder que les praticiens qui acceptent de nouveaux patients (availability = accepting). Défaut : false. |
| `sort` | query | `relevance` \| `distance` \| `name` | non | Tri : relevance (pertinence du texte q, sinon publications les plus récentes), distance (plus proches d'abord, exige lat et lng, sinon ordre alphabétique) ou name (ordre alphabétique du nom affiché). Défaut : relevance. |
| `page` | query | integer (int32) | non | Numéro de page, à partir de 1 ; 20 résultats par page. Défaut : 1. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [SearchResult](#schema-searchresult) (*/*) | Page de résultats avec facettes. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | INVALID_PARAMETERS : errors[] {field, message} (pas de code par champ) ; champs : sort (hors relevance, distance, name), q et city (plus de 100 caractères), lat et lng (l'un sans l'autre, ou hors de -90 à 90 et -180 à 180), radiusKm (hors de 0 exclu à 1000), professions, modalities, audiences, languages (plus de 20 valeurs), page (inférieure à 1), ou tout paramètre dont la valeur n'a pas le bon type (nombre, booléen). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/public/directory/practitioners/{slug}`

**Rend la fiche publique d'un praticien publié**

Public, sans session ; limité à 60 requêtes par minute et par IP (429 RATE_LIMITED). Ne rend que les profils publiés. Téléphone, e-mail et adresse n'apparaissent que si le praticien a coché l'interrupteur correspondant, le numéro professionnel que s'il l'autorise ; les champs masqués sont null. 200 avec Cache-Control: max-age=60, public.

operationId : `getPublicPractitionerProfile`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `slug` | path | string | oui | Adresse publique (slug) du praticien, rendue par la recherche. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PublicProfile](#schema-publicprofile) (*/*) | Fiche publique du praticien. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PROFILE_NOT_FOUND : aucun profil publié avec cette adresse. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-authentification"></a>Authentification

### `POST /api/auth/email/change`

**Corrige l'adresse d'un compte non confirmé**

Public : sans session, l'appelant prouve son identité par email + password. Réponse 202 dans tous les cas (compte inconnu, mot de passe faux, compte déjà confirmé, nouvelle adresse déjà prise, limite atteinte : aucune différence visible). Seul un compte en email_pending change d'adresse ; un nouveau lien de confirmation part à la nouvelle adresse (1 changement ou renvoi par minute, 5 par jour). Les mots de passe faux comptent dans le verrou e-mail + IP du login : 5 échecs, 423 pendant 15 min.

operationId : `changeEmail`

Corps (`application/json`) : [EmailChangeRequest](#schema-emailchangerequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 202 | — | Demande acceptée ; l'adresse n'est changée que si les conditions sont réunies. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] : INVALID_FIELD (email, password ou newEmail absent, newEmail mal formé, champ trop long). |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ACCOUNT_LOCKED : verrouillage e-mail + IP après 5 mots de passe faux (15 min) ; retryAfterSeconds et en-tête Retry-After. |

### `POST /api/auth/email/confirm`

**Confirme l'adresse e-mail et ouvre une session**

Public. Consomme le jeton reçu par e-mail (usage unique, valable 24 h) : le compte passe de email_pending à docs_pending, la confirmation est journalisée et une session est ouverte (cookie SESSION HttpOnly posé dans la réponse, 12 h d'inactivité). Un jeton déjà utilisé, expiré, inconnu ou remplacé par un renvoi donne 410.

operationId : `confirmEmail`

Corps (`application/json`) : [EmailConfirmRequest](#schema-emailconfirmrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | Adresse confirmée, session ouverte (cookie SESSION). |
| 410 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TOKEN_INVALID_OR_EXPIRED : jeton inconnu, déjà utilisé, expiré ou remplacé. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] : INVALID_FIELD (token absent, vide ou de plus de 200 caractères). |

### `POST /api/auth/email/resend`

**Renvoie l'e-mail de confirmation (202 dans tous les cas)**

Public. Réponse 202 identique que le compte existe ou non, qu'il soit déjà confirmé ou non, et que la limite soit atteinte : rien ne distingue un envoi réussi d'un refus silencieux. Seul un compte en email_pending reçoit un nouvel e-mail ; chaque renvoi invalide le lien précédent. Limites : 1 renvoi par minute et 5 par jour et par compte.

operationId : `resendEmail`

Corps (`application/json`) : [EmailResendRequest](#schema-emailresendrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 202 | — | Demande acceptée ; un e-mail part seulement si le compte est à confirmer. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] : INVALID_FIELD (email absent, mal formé ou de plus de 254 caractères). |

### `POST /api/auth/login`

**Connexion par e-mail et mot de passe (code 2FA si activée)**

Public. Ouvre une session : cookie SESSION HttpOnly posé dans la réponse, valable 12 h d'inactivité, ou 30 jours avec rememberMe. Si la double authentification est active et que otp manque, réponse 202 {otpRequired: true} : renvoyer la requête avec otp (code TOTP ou code de secours). E-mail inconnu, mot de passe faux et code faux donnent la même réponse 401. Les états du compte (403) ne sont révélés qu'après un mot de passe correct. 5 échecs pour le même e-mail et la même IP : 423 pendant 15 min.

operationId : `login`

Corps (`application/json`) : [LoginRequest](#schema-loginrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [MeResponse](#schema-meresponse) (*/*) | Session ouverte ; le praticien connecté est renvoyé. |
| 202 | [OtpRequiredResponse](#schema-otprequiredresponse) (*/*) | Mot de passe correct, 2FA active et otp absent : aucune session ouverte, renvoyer la requête avec otp. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | INVALID_CREDENTIALS : e-mail inconnu, mot de passe faux ou code 2FA faux (message unique). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse non confirmée ; ACCOUNT_SUSPENDED : compte refusé (rejected), suspendu (suspended) ou clos (closed), sessions révoquées (un recours via POST /api/me/appeal n'est possible que pour un compte refusé ou suspendu, pas pour un compte clos) ; PASSWORD_CHANGE_REQUIRED : mot de passe à usage unique à remplacer d'abord via POST /api/auth/password/change. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] : INVALID_FIELD (email ou password absent ou trop long, otp de plus de 32 caractères). |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ACCOUNT_LOCKED : verrouillage après 5 échecs pour cet e-mail et cette IP (15 min) ; retryAfterSeconds et en-tête Retry-After. |

### `POST /api/auth/logout`

**Ferme la session courante**

Public : répond 204 même sans session valide (idempotent). Invalide la session serveur portée par le cookie SESSION ; les autres appareils restent connectés.

operationId : `logout`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | Session fermée (ou déjà absente). |

### `GET /api/auth/me`

**Praticien connecté (identité, profession, statut de vérification)**

Session praticien, y compris tant que l'e-mail n'est pas confirmé. Renvoie les valeurs mémorisées dans la session, sans relire la base : le statut de vérification peut être en retard, utiliser GET /api/auth/session pour l'état à jour.

operationId : `me`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [MeResponse](#schema-meresponse) (*/*) | Praticien de la session courante. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/auth/password-reset/confirm`

**Définit un nouveau mot de passe à partir du lien reçu par e-mail**

Public. Consomme le jeton (usage unique, 30 minutes). Le jeton n'est consommé que si le nouveau mot de passe respecte la politique. Succès : mot de passe remplacé, obligation de changement d'un mot de passe à usage unique levée, toutes les sessions du compte révoquées ; aucune session n'est ouverte (se connecter via POST /api/auth/login).

operationId : `confirmReset`

Corps (`application/json`) : [PasswordResetConfirmRequest](#schema-passwordresetconfirmrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | Mot de passe remplacé, sessions révoquées. |
| 410 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TOKEN_INVALID_OR_EXPIRED : jeton inconnu, déjà utilisé, expiré ou remplacé. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PASSWORD_POLICY avec errors[] sur le champ password et les codes PASSWORD_TOO_SHORT, PASSWORD_CASE, PASSWORD_COMPROMISED, PASSWORD_CONTAINS_PERSONAL_DATA ; VALIDATION_FAILED avec errors[] : INVALID_FIELD (token ou password absent ou trop long). |

### `POST /api/auth/password-reset/request`

**Demande un lien de réinitialisation du mot de passe (202 dans tous les cas)**

Public. Réponse 202 identique que l'adresse corresponde à un compte ou non : elle ne révèle jamais l'existence du compte. Si le compte existe, un e-mail contient un lien à usage unique valable 30 minutes ; une nouvelle demande invalide le lien précédent.

operationId : `requestReset`

Corps (`application/json`) : [PasswordResetRequest](#schema-passwordresetrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 202 | — | Demande acceptée ; un e-mail part seulement si le compte existe. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] : INVALID_FIELD (email absent, mal formé ou de plus de 254 caractères). |

### `POST /api/auth/password/change`

**Change le mot de passe (public : e-mail + mot de passe actuel)**

Public, sans session : email + currentPassword prouvent l'identité (+ otp si la 2FA est active ; s'il manque, 202 {otpRequired: true}). Sert notamment à remplacer le mot de passe à usage unique d'un compte de bootstrap (403 PASSWORD_CHANGE_REQUIRED au login). Les contrôles du nouveau mot de passe qui ne dépendent que de la requête (longueur, casse, mots de passe courants, e-mail, identique à l'actuel) passent avant les identifiants : ces 422 ne consomment ni code 2FA ni essai ; le contrôle du prénom et du nom (PASSWORD_CONTAINS_PERSONAL_DATA) n'a lieu qu'après, le code 2FA peut alors être consommé. Succès : toutes les sessions du compte sont révoquées, aucune n'est ouverte (se reconnecter via POST /api/auth/login). Mêmes refus 403 et même verrou 423 que le login (5 échecs, 15 min).

operationId : `changePassword`

Corps (`application/json`) : [PasswordChangeRequest](#schema-passwordchangerequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 202 | [OtpRequiredResponse](#schema-otprequiredresponse) (*/*) | Mot de passe actuel correct, 2FA active et code manquant. |
| 204 | object (*/*) | Mot de passe changé, sessions révoquées, aucune session ouverte. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | INVALID_CREDENTIALS : e-mail inconnu, mot de passe actuel faux ou code 2FA faux (message unique). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse non confirmée ; ACCOUNT_SUSPENDED : compte refusé, suspendu ou clos. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PASSWORD_POLICY avec errors[] sur le champ password et les codes PASSWORD_TOO_SHORT, PASSWORD_CASE, PASSWORD_COMPROMISED, PASSWORD_CONTAINS_PERSONAL_DATA ; VALIDATION_FAILED avec errors[] : PASSWORD_UNCHANGED (newPassword identique au mot de passe actuel), INVALID_FIELD (champ du corps absent ou trop long). |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ACCOUNT_LOCKED : verrouillage après 5 échecs pour cet e-mail et cette IP (15 min) ; retryAfterSeconds et en-tête Retry-After. |

### `POST /api/auth/register`

**Inscription d'un praticien (ouverte, sans code d'invitation)**

Public, sans session. Crée un compte au statut email_pending et envoie un e-mail de confirmation (lien valable 24 h) ; la réponse est identique que l'adresse soit déjà inscrite ou non (anti-énumération : dans ce cas l'adresse reçoit un e-mail « compte existant »). Aucune session n'est ouverte : confirmer l'adresse via POST /api/auth/email/confirm. Les consentements CGU et confidentialité (consents) sont obligatoires et consignés. Langue des e-mails : en-tête Accept-Language (anglais si préféré, français sinon).

operationId : `register`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `Accept-Language` | header | string | non | Langue des e-mails envoyés : en si la langue préférée est l'anglais, fr sinon (ou si l'en-tête est absent). |

Corps (`application/json`) : [RegisterRequest](#schema-registerrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [RegisterResponse](#schema-registerresponse) (*/*) | Inscription enregistrée (ou adresse déjà connue : réponse identique), e-mail envoyé. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : INVALID_FIELD (champ du corps absent, trop long, e-mail mal formé, profession hors liste, consents.terms ou consents.privacy différent de true), PHONE_INVALID (phone), ADDRESS_REQUIRED (address, sauf remoteOnly), REQUIRED (address.street, address.city), POSTAL_CODE_INVALID (address.postalCode) ; PASSWORD_POLICY avec errors[] sur le champ password et les codes PASSWORD_TOO_SHORT, PASSWORD_CASE, PASSWORD_COMPROMISED, PASSWORD_CONTAINS_PERSONAL_DATA. |

### `GET /api/auth/session`

**État courant de la session (statut de vérification à jour)**

Session praticien, y compris tant que l'e-mail n'est pas confirmé. Relit le compte en base : si le statut de vérification ou l'adresse e-mail ont changé depuis l'ouverture de la session (confirmation depuis un autre navigateur, décision d'un administrateur), la session est rafraîchie. emailConfirmed vaut false tant que le statut est email_pending.

operationId : `session`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [SessionResponse](#schema-sessionresponse) (*/*) | État à jour de la session. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué) ; INVALID_CREDENTIALS : le compte de la session n'existe plus. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/auth/sessions/revoke-others`

**Déconnecte tous les autres appareils (la session courante est conservée)**

Session praticien. Supprime les sessions du compte autres que celle qui porte l'appel et consigne l'opération (session_revoked). Renvoie le nombre de sessions révoquées, 0 s'il n'y en avait pas d'autre.

operationId : `revokeOtherSessions`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [RevokedSessionsResponse](#schema-revokedsessionsresponse) (*/*) | Autres sessions révoquées ; revoked = leur nombre. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/auth/signup`

**Alias déprécié de l'inscription d'un praticien**

Même contrat, mêmes codes et mêmes effets que POST /api/auth/register ; utiliser /api/auth/register.

operationId : `signup`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `Accept-Language` | header | string | non | Langue des e-mails envoyés : en si la langue préférée est l'anglais, fr sinon (ou si l'en-tête est absent). |

Corps (`application/json`) : [RegisterRequest](#schema-registerrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [RegisterResponse](#schema-registerresponse) (*/*) | Inscription enregistrée (ou adresse déjà connue : réponse identique), e-mail envoyé. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : INVALID_FIELD (champ du corps absent, trop long, e-mail mal formé, profession hors liste, consents.terms ou consents.privacy différent de true), PHONE_INVALID (phone), ADDRESS_REQUIRED (address, sauf remoteOnly), REQUIRED (address.street, address.city), POSTAL_CODE_INVALID (address.postalCode) ; PASSWORD_POLICY avec errors[] sur le champ password et les codes PASSWORD_TOO_SHORT, PASSWORD_CASE, PASSWORD_COMPROMISED, PASSWORD_CONTAINS_PERSONAL_DATA. |

## <a id="tag-chronologie"></a>Chronologie

### `GET /api/patients/{id}/timeline`

**Liste la chronologie du patient par fenêtre de dates et curseur**

Session praticien, propriétaire du patient. Entrées non archivées dont le début d'occurrence est dans [from, to[, de la plus récente à la plus ancienne. Brouillons inclus (draftsOnly=true pour eux seuls) ; entrées privées exclues sauf includePrivate=true. Dans une même liste de filtres (types, emotions, tags), un élément doit correspondre à l'une des valeurs ; les trois filtres se cumulent. Les facettes portent sur toute la fenêtre filtrée ; ongoingSituations liste les situations, terminées ou non, dont la plage chevauche la fenêtre (ongoing = true pour celles sans fin ; seuls les filtres de brouillon et de visibilité s'y appliquent). Curseur opaque : renvoyer nextCursor dans cursor, nextCursor null sur la dernière page. limit : 1 à 200, 50 par défaut.

operationId : `getTimeline`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |
| `from` | query | string (date-time) | non | Début de la fenêtre, inclus, sur le début d'occurrence : date-heure ISO 8601 UTC. Absent : sans borne. |
| `to` | query | string (date-time) | non | Fin de la fenêtre, exclue, sur le début d'occurrence : date-heure ISO 8601 UTC. Ne doit pas précéder from. Absent : sans borne. |
| `types` | query | string[] | non | Types à garder : note, event, situation, feeling, session, medication. Valeurs séparées par des virgules ou paramètre répété. Absent : tous les types. |
| `emotions` | query | string[] | non | Codes d'émotion à garder : seuls les ressentis de ces émotions sont renvoyés, les autres types sont exclus tant que ce filtre est donné. Valeurs séparées par des virgules ou paramètre répété. Absent : sans filtre. |
| `tags` | query | string[] | non | Libellés de tags à garder. Valeurs séparées par des virgules ou paramètre répété. Un libellé inconnu ne correspond à rien. Absent : sans filtre. |
| `draftsOnly` | query | boolean | non | Vrai pour ne garder que les brouillons. Défaut : faux (brouillons inclus). |
| `includePrivate` | query | boolean | non | Vrai pour inclure les entrées privées. Défaut : faux (exclues). |
| `cursor` | query | string | non | Curseur opaque de la page suivante, tel que renvoyé dans nextCursor. Absent : première page. |
| `limit` | query | integer (int32) | non | Nombre maximal d'éléments par page, de 1 à 200. Défaut : 50. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [TimelinePageDto](#schema-timelinepagedto) (*/*) | Page de chronologie avec facettes. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : identifiant du patient qui n'est pas un UUID. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : patient inexistant. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message}, une erreur par paramètre fautif : limit OUT_OF_RANGE (hors 1 à 200) ; from INVALID_TIME (from après to) ; types INVALID_VALUE (type inconnu) ; cursor INVALID_VALUE (curseur illisible) ; from, to, limit, draftsOnly, includePrivate INVALID_FORMAT (valeur illisible). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/patients/{id}/timeline/summary`

**Résume la chronologie du patient par mois ou par année**

Session praticien, propriétaire du patient. Pour chaque période UTC non vide : nombre d'entrées par type, nombre de ressentis et intensité moyenne. Entrées non archivées dont le début d'occurrence est dans [from, to[, brouillons inclus, entrées privées exclues sauf includePrivate=true. Calculé à la volée, sans pagination, de la période la plus ancienne à la plus récente.

operationId : `getTimelineSummary`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |
| `granularity` | query | `month` \| `year` | non | Granularité du résumé : month (un groupe par mois) ou year (par année). Obligatoire, en minuscules. |
| `from` | query | string (date-time) | non | Début de la fenêtre, inclus, sur le début d'occurrence : date-heure ISO 8601 UTC. Absent : sans borne. |
| `to` | query | string (date-time) | non | Fin de la fenêtre, exclue, sur le début d'occurrence : date-heure ISO 8601 UTC. Ne doit pas précéder from. Absent : sans borne. |
| `includePrivate` | query | boolean | non | Vrai pour inclure les entrées privées. Défaut : faux (exclues). |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [TimelineSummaryDto](#schema-timelinesummarydto) (*/*) | Résumé par période. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : identifiant du patient qui n'est pas un UUID. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : patient inexistant. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} : granularity INVALID_VALUE (absente, ou hors month et year) ; from INVALID_TIME (from après to) ; from, to, includePrivate INVALID_FORMAT (valeur illisible). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-contact-public"></a>Contact public

### `POST /api/public/directory/practitioners/{slug}/contact`

**Envoie un message au praticien (relayé par e-mail, non rattaché à un dossier)**

Public, sans session ; limité à 5 envois par heure et par IP (429 RATE_LIMITED avec Retry-After), en plus de 60 requêtes par minute et par IP. Répond 202 sans corps pour tout envoi bien formé, y compris un envoi ignoré en silence et sans trace : honeypot rempli, formulaire soumis en moins de 3 secondes ou dans le futur, profil inconnu ou non publié, praticien sans adresse de réception. Sinon le message est enregistré puis relayé par e-mail à l'adresse de contact du profil, à défaut à celle du compte ; un échec d'envoi ne remonte jamais au visiteur. Les demandes enregistrées sont purgées après 30 jours.

operationId : `submitContactRequest`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `slug` | path | string | oui | Adresse publique (slug) du praticien destinataire. |

Corps (`application/json`) : [SubmitContactRequest](#schema-submitcontactrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 202 | — | Accepté, ou ignoré en silence ; aucun corps. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | INVALID_BODY : corps JSON illisible (syntaxe ou type de champ invalide). |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, message} (pas de code par champ) ; champs : name, email, message (absent, vide ou trop long), email (adresse invalide), subject (plus de 200 caractères), consent (absent ou différent de true), formShownAt (absent). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : plus de 5 envois par heure depuis cette adresse IP ; en-tête Retry-After et champ retryAfterSeconds en secondes. |

## <a id="tag-double-authentification"></a>Double authentification

### `POST /api/me/2fa/disable`

**Désactive la 2FA (mot de passe et code TOTP ou de secours)**

Session praticien dont la 2FA est active, hors administrateur (la 2FA est obligatoire pour un compte admin : 409 TWO_FACTOR_REQUIRED_FOR_ADMIN, refus avant tout contrôle de code). Exige le mot de passe actuel et un code TOTP ou un code de secours non utilisé. Succès : le secret et tous les codes de secours sont retirés. 5 échecs d'affilée verrouillent les essais 15 min (423).

operationId : `disableTwoFactor`

Corps (`application/json`) : [TwoFactorDisableRequest](#schema-twofactordisablerequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | 2FA désactivée, codes de secours retirés. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TWO_FACTOR_NOT_ENABLED : la 2FA n'est pas active ; TWO_FACTOR_REQUIRED_FOR_ADMIN : un compte administrateur ne peut pas désactiver sa 2FA. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] : INVALID_PASSWORD (password), INVALID_CODE (code TOTP ou de secours incorrect), INVALID_FIELD (champ absent ou trop long). |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ACCOUNT_LOCKED : 5 échecs, essais verrouillés 15 min ; retryAfterSeconds et en-tête Retry-After. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/me/2fa/enable`

**Génère le secret TOTP (en attente) et l'URI otpauth:// du QR code**

Session praticien. Première étape d'activation : génère un secret en attente et renvoie le secret Base32 et l'URI otpauth:// du QR code, montrés une seule fois. La 2FA n'est pas active tant que POST /api/me/2fa/verify n'a pas validé un premier code ; rappeler cette route avant la vérification remplace le secret en attente.

operationId : `enableTwoFactor`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [TwoFactorEnableResponse](#schema-twofactorenableresponse) (*/*) | Secret en attente généré ; la 2FA n'est pas encore active. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TWO_FACTOR_ALREADY_ENABLED : la double authentification est déjà active. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/me/2fa/recovery-codes/regenerate`

**Remplace les codes de secours par 10 nouveaux (anciens invalidés)**

Session praticien dont la 2FA est active. Invalide tous les codes de secours existants et renvoie 10 nouveaux codes en clair, montrés une seule fois. Aucun mot de passe ni code n'est redemandé.

operationId : `regenerateRecoveryCodes`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [RecoveryCodesResponse](#schema-recoverycodesresponse) (*/*) | Nouveaux codes de secours, renvoyés une seule fois. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TWO_FACTOR_NOT_ENABLED : la 2FA n'est pas active. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/me/2fa/verify`

**Vérifie le premier code, active la 2FA et renvoie 10 codes de secours (une fois)**

Session praticien. Deuxième étape d'activation, après POST /api/me/2fa/enable : valide le code TOTP à 6 chiffres, active la 2FA et renvoie 10 codes de secours en clair, montrés une seule fois. Ce code ne pourra pas être rejoué au login dans la même fenêtre de 30 s. 5 codes faux en 15 minutes verrouillent les essais 15 min (423).

operationId : `verifyTwoFactor`

Corps (`application/json`) : [TwoFactorVerifyRequest](#schema-twofactorverifyrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [RecoveryCodesResponse](#schema-recoverycodesresponse) (*/*) | 2FA activée ; les 10 codes de secours sont renvoyés une seule fois. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TWO_FACTOR_ALREADY_ENABLED : 2FA déjà active ; TWO_FACTOR_NOT_STARTED : aucun secret en attente, appeler enable d'abord. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] : INVALID_CODE (code TOTP incorrect ou déjà utilisé), INVALID_FIELD (code absent ou de plus de 32 caractères). |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ACCOUNT_LOCKED : 5 codes faux, essais verrouillés 15 min ; retryAfterSeconds et en-tête Retry-After. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-entrees"></a>Entrées

### `GET /api/entries/{id}`

**Lit une entrée avec sa version courante, son détail et ses tags**

Session praticien, propriétaire du patient de l'entrée. Une entrée archivée reste lisible (archivedAt renseigné). Les liens ne sont pas inclus (links est null) : voir GET /api/entries/{id}/links. authorType est en lecture seule.

operationId : `getEntry`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant de l'entrée. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryDto](#schema-entrydto) (*/*) | Entrée complète. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : identifiant de l'entrée qui n'est pas un UUID. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : l'entrée appartient au dossier d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ENTRY_NOT_FOUND : entrée inexistante. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `PATCH /api/entries/{id}`

**Corrige une entrée par une nouvelle version ou en place pendant la grâce**

Session praticien, propriétaire du patient de l'entrée. Les champs absents sont inchangés ; occurred et tags sont remplacés en entier, les détails fusionnés champ par champ. Règle de grâce de 1 h 15 après la création : même auteur, entrée sans lien ni autre version, la modification est faite en place (pas de nouvelle version) ; sinon une nouvelle version est créée (reason conservé). Un changement de tags seul ou sans effet ne crée jamais de version. Une entrée archivée ne se corrige pas. authorType, submissionId et links sont refusés.

operationId : `patchEntry`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant de l'entrée. |

Corps (`application/json`) : [PatchEntryRequest](#schema-patchentryrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryDto](#schema-entrydto) (*/*) | Entrée corrigée, version courante à jour. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : identifiant de l'entrée qui n'est pas un UUID, ou corps JSON illisible. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : l'entrée appartient au dossier d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ENTRY_NOT_FOUND : entrée inexistante. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ENTRY_ARCHIVED : l'entrée est archivée, la restaurer d'abord. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message}. Codes : REQUIRED (titre d'un event ou d'une situation, texte d'une note, champ minimal du détail), OUT_OF_RANGE, INVALID_VALUE (status, visibility, occurred.precision), INVALID_FORMAT (date ou UUID illisible), INVALID_TIME (occurred.to avant occurred.from), UNKNOWN_EMOTION (feeling.emotionCode), UNKNOWN_TAG (tags[i]), UNKNOWN_FIELD (authorType ou submissionId envoyé), NOT_SUPPORTED_ON_PATCH (links envoyé), DETAIL_NOT_ALLOWED (détail d'un autre type que l'entrée). Code racine INVALID_TIME, errors[0].field = occurred : période sans libellé ou sans fin, phase de vie inconnue ou patient sans date de naissance. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `DELETE /api/entries/{id}`

**Archive une entrée sans la supprimer physiquement**

Session praticien, propriétaire du patient de l'entrée. Suppression logique : l'entrée reste lisible (archivedAt) et restaurable, mais sort de la chronologie, de l'export et des corrections. Idempotent : archiver une entrée déjà archivée renvoie aussi 204.

operationId : `archiveEntry`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant de l'entrée. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | Entrée archivée (ou déjà archivée). |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : identifiant de l'entrée qui n'est pas un UUID. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : l'entrée appartient au dossier d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ENTRY_NOT_FOUND : entrée inexistante. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/entries/{id}/restore`

**Restaure une entrée archivée**

Session praticien, propriétaire du patient de l'entrée. L'entrée redevient visible et corrigeable (archivedAt null). Idempotent : restaurer une entrée non archivée renvoie 200 sans rien changer. Sans corps de requête.

operationId : `restoreEntry`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant de l'entrée. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryDto](#schema-entrydto) (*/*) | Entrée restaurée (archivedAt null). |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : identifiant de l'entrée qui n'est pas un UUID. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : l'entrée appartient au dossier d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ENTRY_NOT_FOUND : entrée inexistante. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/entries/{id}/versions`

**Liste les versions d'une entrée, de la plus récente à la plus ancienne**

Session praticien, propriétaire du patient de l'entrée. Renvoie toutes les versions, sans pagination, y compris pour une entrée archivée. Une modification faite en place pendant la fenêtre de grâce de 1 h 15 ne crée pas de version.

operationId : `listEntryVersions`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant de l'entrée. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryVersionDto](#schema-entryversiondto)[] (*/*) | Versions de l'entrée, la plus récente en premier. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : identifiant de l'entrée qui n'est pas un UUID. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : l'entrée appartient au dossier d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ENTRY_NOT_FOUND : entrée inexistante. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/patients/{id}/entries`

**Crée une entrée clinique dans le dossier du patient**

Session praticien, propriétaire du patient. L'entrée appartient à une séance : sessionId explicite, sinon la séance courante du patient (SESSION_REQUIRED s'il n'en a aucune). Un corps de type session démarre une séance (une seule ouverte à la fois). Les liens demandés (links, 20 au plus) sont posés dans la même transaction, tout ou rien. authorType et submissionId sont en lecture seule (UNKNOWN_FIELD). Réponse 201 avec Location et liens posés dans links.

operationId : `createEntry`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |

Corps (`application/json`) : [CreateEntryRequest](#schema-createentryrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [EntryDto](#schema-entrydto) (*/*) | Entrée créée ; en-tête Location = /api/entries/{id} de la nouvelle entrée. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : identifiant du patient qui n'est pas un UUID, ou corps JSON illisible. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : le patient (ou l'entrée cible d'un lien) appartient à un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : patient inexistant. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | SESSION_ALREADY_OPEN : type session demandé alors qu'une séance est déjà ouverte pour ce patient. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message}, un par champ. Codes : REQUIRED, OUT_OF_RANGE (intensité hors 0 à 10, plus de 20 liens), INVALID_VALUE (session.modality, type, status, visibility, occurred.precision, links[i].direction), INVALID_FORMAT (date ou UUID illisible), INVALID_TIME (occurred.to avant occurred.from), UNKNOWN_EMOTION (feeling.emotionCode), UNKNOWN_TAG (tags[i]), UNKNOWN_FIELD (authorType ou submissionId envoyé), DETAIL_NOT_ALLOWED (feeling, medication ou session d'un autre type), NOT_ALLOWED_ON_CREATE (title, body, tags, links, session.durationMin sur une séance), SESSION_NOT_ALLOWED (sessionId sur une séance). Liens refusés (champ links[i].linkType ou links[i].targetId, allowedLinkTypes = liste de codes de type, ex. ["caused_by","co_occurs"], pour LINK_TYPE_NOT_ALLOWED) : ENTRY_NOT_FOUND, SELF_LINK, DIFFERENT_PATIENT, UNKNOWN_LINK_TYPE, LINK_TYPE_NOT_ALLOWED, LINK_EXISTS, ENTRY_ARCHIVED. Codes portés par le code racine, errors[0].field renseigné : SESSION_REQUIRED et SESSION_INVALID (sessionId), INVALID_TIME (occurred : période sans libellé ou sans fin, phase de vie inconnue ou patient sans date de naissance). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-export-de-compte"></a>Export de compte

### `POST /api/me/export`

**Lance l'export asynchrone de tous les patients du compte**

Public pour la chaîne de sécurité, contrôle fait par la route : compte approuvé connecté (session praticien, corps ignoré), ou compte refusé ou suspendu sans session, qui fournit {email, password, otp?} dans le corps. Un seul export en cours par compte. Réponse 202 asynchrone : jobId et statusUrl à interroger (GET /api/me/export/{jobId}), ou otpRequired sans création de job si la double authentification est active et que otp manque. Le zip (patients.md, puis un .md et un .pdf par patient) est conservé chiffré et téléchargeable 7 jours. Verrouillage de 15 minutes après 5 échecs d'authentification (423 Retry-After).

operationId : `requestAccountExport`

Corps (`application/json`) : [AccountExportRequest](#schema-accountexportrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 202 | object (application/json) | Deux corps possibles : {jobId, statusUrl} quand le job est créé ; {otpRequired: true} quand le code de double authentification manque (aucun job créé). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | INVALID_CREDENTIALS : identifiants incorrects ou code 2FA faux. |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EXPORT_IN_PROGRESS : un export de ce compte est déjà en file ou en cours ; ACCOUNT_NOT_SUSPENDED : le compte n'est ni refusé ni suspendu (approuvé, en cours de vérification ou clos) : se connecter normalement. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] : email et password REQUIRED quand il n'y a ni session ni identifiants dans le corps. |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ACCOUNT_LOCKED : 5 échecs d'identification en 15 minutes, réessayer après Retry-After. |

### `GET /api/me/export/{jobId}`

**Donne le statut d'un export de compte**

Public pour la chaîne de sécurité : praticien connecté propriétaire du job, ou porteur du paramètre token du statusUrl (compte suspendu sans session). À interroger jusqu'à ce que status vaille done ou failed. downloadUrl n'est renseigné que si le job est terminé et le lien non expiré (7 jours). Un job inconnu, d'un autre praticien ou un jeton faux donnent le même 404, pour ne rien révéler.

operationId : `getAccountExport`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `jobId` | path | string (uuid) | oui | Identifiant du job d'export. |
| `token` | query | string | non | Jeton de suivi porté par le statusUrl, pour un compte sans session. Inutile quand le praticien propriétaire du job est connecté. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ExportStatusDto](#schema-exportstatusdto) (*/*) | Statut du job d'export. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EXPORT_NOT_FOUND : job inconnu, d'un autre praticien, ou jeton token absent ou invalide. |

### `GET /api/me/export/{jobId}/file`

**Télécharge le zip d'un export de compte par son URL signée**

Public pour la chaîne de sécurité : l'autorisation est la signature (paramètres exp et sig) de la downloadUrl renvoyée par GET /api/me/export/{jobId}, valable 7 jours. Renvoie le zip déchiffré en pièce jointe (Content-Disposition attachment, nom export-psymate-AAAAMMJJ.zip). Passé l'échéance ou une fois le fichier purgé : 410.

operationId : `downloadAccountExport`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `jobId` | path | string (uuid) | oui | Identifiant du job d'export. |
| `exp` | query | string | non | Échéance du lien, en secondes depuis l'epoch UTC, telle que signée. |
| `sig` | query | string | non | Signature du lien, telle que renvoyée dans downloadUrl. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | string (binary) (application/zip) | Zip en pièce jointe : patients.md, puis un .md et un .pdf par patient. |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | SIGNED_URL_INVALID : signature ou échéance absente, falsifiée ou illisible, job inconnu ou non terminé. |
| 410 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EXPORT_EXPIRED : échéance passée ou fichier purgé. |

## <a id="tag-export-patient"></a>Export patient

### `GET /api/patients/{id}/export`

**Exporte le dossier du patient en Markdown ou en PDF**

Session praticien, propriétaire du patient. Le fichier est généré à la volée et renvoyé en pièce jointe (Content-Disposition attachment, nom export-nom-AAAAMMJJ.md ou .pdf). Il contient les séances et les entrées en ordre chronologique, avec le texte de leur version courante. Les entrées privées et archivées n'en sortent jamais, et un lien vers une entrée non exportée est omis. Langue du document : Accept-Language (français par défaut). Le PDF est au thème clair. Aucune pagination.

operationId : `exportPatient`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |
| `format` | query | `md` \| `pdf` | non | Format du fichier : md (Markdown, text/markdown) ou pdf (application/pdf). Obligatoire ; la casse est ignorée. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | string (binary) (application/pdf) | Fichier en pièce jointe : text/markdown (md) ou application/pdf (pdf). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : patient inexistant. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] : format INVALID_VALUE (paramètre absent, vide ou différent de md et pdf). La propriété du patient est vérifiée avant le format. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |
| 500 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EXPORT_FAILED : génération du PDF impossible. |

## <a id="tag-graphe"></a>Graphe

### `GET /api/patients/{id}/graph`

**Rend le graphe de liens autour d'une entrée ou, sans racine, du dossier du patient**

Session praticien propriétaire du patient. Seuls les liens acceptés et les entrées non archivées du patient figurent dans le graphe. Avec root : voisinage de cette entrée à depth sauts ; sans root : les entrées les plus liées du patient, toutes à distance 1. La racine est toujours rendue, même hors de la période from/to. Au-delà de 150 nœuds, les nœuds de degré 1 d'un même type reliés au même voisin sont regroupés en super-nœuds (à développer par POST /api/patients/{id}/graph/expand), puis les nœuds les plus éloignés sont retirés ; truncated vaut alors true. Réponse non paginée.

operationId : `getPatientGraph`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |
| `root` | query | string (uuid) | non | Entrée racine du voisinage. Absent : les entrées les plus liées du patient (150 au plus), toutes à distance 1. |
| `depth` | query | integer (int32) | non | Nombre de sauts depuis la racine, de 1 à 3, défaut 2 (422 OUT_OF_RANGE sinon, même sans root) ; ignoré pour le voisinage quand root est absent. |
| `linkTypes` | query | string[] | non | Codes de types de liens suivis, parmi ceux de GET /api/vocabulary/link-types : liste séparée par des virgules ou paramètre répété. Absent : tous les types. |
| `from` | query | string (date-time) | non | Borne basse incluse sur la date de début (occurred) des nœuds, ISO 8601 UTC. Absent : pas de borne. |
| `to` | query | string (date-time) | non | Borne haute exclue sur la date de début (occurred) des nœuds, ISO 8601 UTC. Absent : pas de borne. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [GraphDto](#schema-graphdto) (*/*) | Graphe : nodes, edges, superNodes et truncated (nodes limité à 150). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : patient inexistant ; ENTRY_NOT_FOUND : la racine root n'existe pas ou appartient à un patient d'un autre praticien. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ENTRY_ARCHIVED : la racine root est archivée, errors[] porte le champ root. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message}, une entrée par paramètre fautif ; codes de champ : OUT_OF_RANGE (depth hors de 1 à 3), INVALID_TIME (from postérieur à to), INVALID_VALUE (linkTypes contient un code absent du catalogue ou inactif) ; DIFFERENT_PATIENT (root : entrée d'un autre patient du même praticien). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/patients/{id}/graph/expand`

**Développe un super-nœud ou une liste d'entrées du graphe**

Session praticien propriétaire du patient. Le corps contient exactement un de superNodeId (identifiant d'un élément de superNodes d'un graphe déjà reçu) et memberIds (1 à 500 identifiants d'entrées vivantes du patient, sans doublon). Rend les membres (à distance 1, avec leur degré dans tout le dossier) et les liens acceptés incidents à au moins l'un d'eux ; superNodes est toujours vide. Un super-nœud se développe sans les filtres du graphe d'origine et au plus 500 membres sont rendus : truncated vaut alors true. Réponse non paginée.

operationId : `expandGraphGroup`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |

Corps (`application/json`) : [ExpandGraphRequest](#schema-expandgraphrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [GraphDto](#schema-graphdto) (*/*) | Membres du groupe et arêtes incidentes (superNodes vide). |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : corps JSON absent ou illisible sans champ identifiable. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : patient inexistant ; SUPER_NODE_NOT_FOUND : le groupe superNodeId n'existe plus (entrée pivot absente ou archivée, aucun membre vivant du type). |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : INVALID_VALUE (superNodeId : ni superNodeId ni memberIds, ou les deux ; memberIds : doublon ou élément nul), INVALID_FORMAT (superNodeId qui n'est pas de la forme sn:{uuid}:{type d'entrée} ; memberIds contenant un non-UUID), REQUIRED (memberIds vide), OUT_OF_RANGE (memberIds de plus de 500 éléments), ENTRY_NOT_FOUND (memberIds : une entrée est inexistante, archivée ou d'un autre patient). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-liens"></a>Liens

### `GET /api/entries/{id}/links`

**Liste les liens acceptés d'une entrée**

Session praticien propriétaire du patient de l'entrée. Rend les liens acceptés dont l'entrée est source ou cible, du plus ancien au plus récent (createdAt, puis id), chacun avec label et sentence vus depuis cette entrée (verbe inverse quand elle est la cible d'un lien dirigé), dans la langue Accept-Language (fr par défaut). Les liens remplacés ou supprimés n'y figurent pas. Liste complète, non paginée, vide si l'entrée n'a pas de lien.

operationId : `listEntryLinks`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant de l'entrée dont on liste les liens. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [LinkDto](#schema-linkdto)[] (*/*) | Liens acceptés de l'entrée (tableau, éventuellement vide). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : l'entrée appartient à un patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ENTRY_NOT_FOUND : entrée inexistante. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/entries/{id}/links`

**Pose un lien manuel entre l'entrée ouverte et une autre entrée du même patient**

Session praticien propriétaire du patient des deux entrées. Le lien est créé avec la provenance manual et le statut accepted (non modifiables). direction (outgoing par défaut) place l'entrée de l'URL comme source (outgoing) ou comme cible (incoming) ; la réponse est le lien vu depuis cette entrée (label et sentence dans la langue Accept-Language, fr par défaut). Les deux entrées doivent être du même patient et non archivées, et le type autorisé pour le couple (type source, type cible) par le catalogue GET /api/vocabulary/link-types. Un lien actif identique (mêmes extrémités et même type, sens indifférent pour un type symétrique) est refusé. Limite : rationale 500 caractères au plus. Réponse 201 avec Location.

operationId : `createLink`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant de l'entrée ouverte, dont le lien est vu. |

Corps (`application/json`) : [CreateLinkRequest](#schema-createlinkrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [LinkDto](#schema-linkdto) (*/*) | Lien créé ; en-tête Location = /api/links/{id}. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : corps JSON illisible sans champ identifiable. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : une des deux entrées appartient à un patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ENTRY_NOT_FOUND : l'entrée de l'URL ou la cible targetId n'existe pas. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | LINK_EXISTS : un lien actif identique existe déjà, existingLinkId donne son identifiant ; ENTRY_ARCHIVED : une extrémité est archivée, errors[] porte le champ sourceId ou targetId. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : REQUIRED (targetId, linkType), INVALID_VALUE (direction autre que incoming ou outgoing), OUT_OF_RANGE (rationale de plus de 500 caractères), INVALID_FORMAT (targetId qui n'est pas un UUID) ; SELF_LINK (targetId : même entrée que celle de l'URL) ; DIFFERENT_PATIENT (targetId : entrée d'un autre patient) ; UNKNOWN_LINK_TYPE (linkType absent du catalogue ou inactif) ; LINK_TYPE_NOT_ALLOWED (linkType interdit pour ce couple de types d'entrées : allowedLinkTypes[] {code, label} liste les types possibles, vide si aucun). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `PATCH /api/links/{id}`

**Change le type d'un lien en le remplaçant par un nouveau lien**

Session praticien propriétaire du patient du lien. Le lien doit être actif (409 LINK_NOT_ACTIVE sinon) et ses entrées non archivées. Un nouveau lien manual accepted est créé avec les mêmes extrémités et la même justification, l'ancien passe superseded (jamais effacé) : la réponse est le nouveau lien, avec un nouvel identifiant, vu depuis sa source. Les règles de matrice des types et de doublon sont celles de la création ; reposer le type actuel donne 409 LINK_EXISTS.

operationId : `changeLinkType`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du lien à remplacer. |

Corps (`application/json`) : [ChangeLinkTypeRequest](#schema-changelinktyperequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [LinkDto](#schema-linkdto) (*/*) | Nouveau lien créé en remplacement de l'ancien. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : corps JSON illisible sans champ identifiable. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : le lien appartient à un patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | LINK_NOT_FOUND : lien inexistant. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | LINK_NOT_ACTIVE : le lien est déjà remplacé ou supprimé ; LINK_EXISTS : un lien actif de ce type existe déjà entre les mêmes entrées (y compris le type actuel), existingLinkId donne son identifiant ; ENTRY_ARCHIVED : une extrémité est archivée, errors[] porte le champ sourceId ou targetId. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : REQUIRED (linkType) ; UNKNOWN_LINK_TYPE (linkType absent du catalogue ou inactif) ; LINK_TYPE_NOT_ALLOWED (linkType interdit pour ce couple de types d'entrées : allowedLinkTypes[] {code, label} liste les types possibles, vide si aucun). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `DELETE /api/links/{id}`

**Supprime un lien sans l'effacer**

Session praticien propriétaire du patient du lien. Le lien passe superseded (jamais supprimé physiquement) et ses deux entrées perdent un lien dans linkCount. Idempotent : supprimer un lien déjà remplacé ou supprimé renvoie aussi 204, sans effet.

operationId : `removeLink`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du lien à supprimer. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | Lien supprimé (ou déjà inactif). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : le lien appartient à un patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | LINK_NOT_FOUND : lien inexistant. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-patients"></a>Patients

### `GET /api/patients`

**Liste les patients du praticien connecté**

Session praticien ; ne renvoie que les patients de son cabinet. Par défaut les patients actifs ; archived=true renvoie uniquement les patients archivés. Le filtre q porte sur le nom affiché (insensible à la casse et aux accents), tag filtre sur un tag du praticien (un tag inconnu donne une liste vide). Pagination par curseur opaque : limit 50 par défaut, ramené à 1..200 ; nextCursor est null sur la dernière page.

operationId : `listPatients`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `q` | query | string | non | Filtre « contient » sur le nom affiché, insensible à la casse et aux accents ; les espaces multiples sont réduits. Vide ou absent : pas de filtre. |
| `archived` | query | boolean | non | false (défaut) : patients actifs seulement ; true : patients archivés seulement. |
| `tag` | query | string | non | Libellé d'un tag du praticien ; ne renvoie que les patients qui le portent. Un libellé qui ne correspond à aucun tag donne une liste vide. |
| `sort` | query | `name` \| `created` \| `updated` | non | Ordre de tri : name (défaut, alphabétique sans accent ni casse), created (création décroissante) ou updated (dernière modification décroissante). |
| `cursor` | query | string | non | Curseur opaque lu dans nextCursor de la page précédente ; absent pour la première page. |
| `limit` | query | integer (int32) | non | Nombre maximal de patients par page : 50 par défaut ; une valeur hors de 1..200 est ramenée à la borne. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PatientPage](#schema-patientpage) (*/*) | Page de patients. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : paramètre invalide, errors[] {field, message} avec field = sort (valeur autre que name, created, updated) ou cursor (curseur illisible). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/patients`

**Crée un patient dans le cabinet du praticien**

Session praticien ; le patient appartient au praticien connecté. Seul displayName est obligatoire. Des drapeaux (un par nature) et des tags existants peuvent être posés dès la création ; la fiche démarre à la version 1. La création est atomique : en cas d'erreur rien n'est enregistré. Réponse 201 avec la fiche complète.

operationId : `createPatient`

Corps (`application/json`) : [CreatePatientRequest](#schema-createpatientrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [PatientDto](#schema-patientdto) (*/*) | Patient créé ; corps = fiche complète. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | FLAG_ALREADY_ACTIVE : la même nature de drapeau est présente deux fois. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : errors[] {field, message} avec field = displayName (obligatoire), birthDate (future ou de plus de 120 ans), flags[i].kind (nature inconnue), flags[i].reason (obligatoire pour watch), tags[i] (libellé vide) ; TAG_IS_EMOTION : un libellé de tags correspond à une émotion ; TAG_UNKNOWN : un libellé de tags n'existe pas encore (créer le tag d'abord). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/patients/{id}`

**Lit la fiche d'un patient**

Session praticien propriétaire du patient. Fonctionne aussi pour un patient archivé (archivedAt renseigné). Renvoie la fiche avec ses drapeaux actifs et ses tags.

operationId : `getPatient`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PatientDto](#schema-patientdto) (*/*) | Fiche du patient. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien (ou d'un autre cabinet). EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : aucun patient avec cet identifiant. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `PATCH /api/patients/{id}`

**Modifie la fiche d'un patient en créant une version**

Session praticien propriétaire du patient, patient actif (409 PATIENT_ARCHIVED sinon). Mise à jour partielle : seules les clés présentes du corps sont modifiées ; une valeur null ou vide efface un champ texte (sauf displayName, obligatoire : 422) ; birthDate s'efface avec null (une chaîne vide est refusée en 422). context et followUp sont fusionnés clé à clé (une clé à null est retirée ; l'objet entier à null le vide). Chaque appel réussi incrémente currentVersion et archive un instantané (GET /versions) ; reason, facultatif, est le motif conservé dans la version.

operationId : `patchPatient`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |

Corps (`application/json`) : object

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PatientDto](#schema-patientdto) (*/*) | Fiche modifiée ; corps = fiche complète. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : aucun patient avec cet identifiant. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_ARCHIVED : patient archivé, restaurer d'abord. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : errors[] {field, message} avec field = nom de la clé inconnue ou non modifiable, displayName (vide), birthDate (format invalide, future ou de plus de 120 ans), context ou followUp (objet attendu). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `DELETE /api/patients/{id}`

**Archive un patient**

Session praticien propriétaire du patient. Archivage logique : rien n'est supprimé, le patient disparaît de la liste par défaut (visible avec archived=true) et ses écritures sont refusées jusqu'à la restauration (POST /restore). Idempotent : archiver un patient déjà archivé renvoie aussi 204.

operationId : `archivePatient`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | Patient archivé (ou déjà archivé) ; pas de corps. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : aucun patient avec cet identifiant. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/patients/{id}/flags`

**Pose un drapeau sur un patient**

Session praticien propriétaire du patient, patient actif (409 PATIENT_ARCHIVED sinon). Un seul drapeau actif par nature (watch, risk, shared_care) : le reposer est refusé tant qu'il n'a pas été levé. watch exige une raison. Réponse 201 avec la fiche complète du patient (et non le drapeau seul).

operationId : `addPatientFlag`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |

Corps (`application/json`) : [FlagRequest](#schema-flagrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [PatientDto](#schema-patientdto) (*/*) | Drapeau posé ; corps = fiche complète du patient. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : aucun patient avec cet identifiant. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_ARCHIVED : patient archivé ; FLAG_ALREADY_ACTIVE : ce drapeau est déjà actif. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : errors[] {field, message} avec field = flag.kind (nature inconnue ou absente) ou flag.reason (obligatoire pour watch). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `DELETE /api/patients/{id}/flags/{kind}`

**Lève un drapeau actif d'un patient**

Session praticien propriétaire du patient, patient actif (409 PATIENT_ARCHIVED sinon). Le drapeau levé n'apparaît plus dans flags ; il peut être reposé ensuite. Réponse 200 avec la fiche complète du patient.

operationId : `clearPatientFlag`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |
| `kind` | path | `watch` \| `risk` \| `shared_care` | oui | Nature du drapeau à lever : watch (à surveiller), risk (risque) ou shared_care (suivi partagé). |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PatientDto](#schema-patientdto) (*/*) | Drapeau levé ; corps = fiche complète du patient. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : aucun patient avec cet identifiant ; FLAG_NOT_ACTIVE : ce drapeau n'est pas actif sur le patient. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_ARCHIVED : patient archivé, restaurer d'abord. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : errors[] {field, message} avec field = kind (nature de drapeau inconnue). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/patients/{id}/restore`

**Restaure un patient archivé**

Session praticien propriétaire du patient. Lève l'archivage : le patient réapparaît dans la liste par défaut et accepte de nouveau les écritures. Contrairement aux autres écritures, la restauration est acceptée sur un patient archivé. Idempotent : sur un patient actif, renvoie la fiche inchangée en 200. Aucun corps de requête.

operationId : `restorePatient`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PatientDto](#schema-patientdto) (*/*) | Patient restauré ; corps = fiche complète. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : aucun patient avec cet identifiant. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `PUT /api/patients/{id}/tags`

**Remplace la liste des tags d'un patient**

Session praticien propriétaire du patient, patient actif (409 PATIENT_ARCHIVED sinon). Remplacement complet : les tags absents du corps sont retirés du patient (liste vide = aucun tag). Les tags doivent exister (POST /api/tags) et ne pas être des émotions. Réponse 200 avec la fiche complète du patient.

operationId : `replacePatientTags`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |

Corps (`application/json`) : [TagsRequest](#schema-tagsrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PatientDto](#schema-patientdto) (*/*) | Tags remplacés ; corps = fiche complète du patient. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : aucun patient avec cet identifiant. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_ARCHIVED : patient archivé, restaurer d'abord. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : libellé vide, errors[] {field, message} avec field = tags[i] ; TAG_IS_EMOTION : le libellé correspond à une émotion (utiliser l'émotion) ; TAG_UNKNOWN : le tag n'existe pas (le créer d'abord par POST /api/tags). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/patients/{id}/versions`

**Liste l'historique des versions de la fiche d'un patient**

Session praticien propriétaire du patient ; fonctionne aussi pour un patient archivé. Une entrée par modification (PATCH), de la plus ancienne à la plus récente, avec l'instantané de la fiche après la modification ; la création (version 1) n'en a pas. Liste non paginée, vide tant que la fiche n'a jamais été modifiée.

operationId : `listPatientVersions`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [VersionDto](#schema-versiondto)[] (*/*) | Versions, de la plus ancienne à la plus récente. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : aucun patient avec cet identifiant. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-profil-annuaire"></a>Profil annuaire

### `GET /api/me/profile`

**Lit le profil d'annuaire du praticien connecté**

Session praticien. Le profil est créé vide au premier appel (nom affiché du compte, adresse publique slug unique dérivée du nom, non publié) ; les appels suivants le relisent. La profession vient du compte et n'est pas modifiable ici.

operationId : `get`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ProfileDto](#schema-profiledto) (*/*) | Profil du praticien connecté. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | SLUG_CONFLICT : impossible de générer une adresse publique unique à la création du profil, réessayer. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `PUT /api/me/profile`

**Remplace les champs éditables du profil d'annuaire**

Session praticien. Remplace toutes les colonnes éditables : un champ absent reprend sa valeur par défaut (listes vides, interrupteurs show* à false, availability unknown, country FR, autres champs vides). published, slug, profession et la photo ne s'éditent pas ici (champs ignorés). Les listes fermées specialties et audiences n'acceptent que des codes actifs de GET /api/vocabulary/directory. Les textes sont rognés et un texte vide devient null. Limites : displayName 120 (obligatoire), titleLabel 120, contactPhone 30, contactEmail 254, websiteUrl 300, address 300, city 100, postalCode 20, responseDelay 60, fees 500, bio 1 200 caractères, 8 spécialités au plus.

operationId : `update`

Corps (`application/json`) : [UpdateProfileRequest](#schema-updateprofilerequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ProfileDto](#schema-profiledto) (*/*) | Profil mis à jour. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | INVALID_BODY : corps JSON illisible (syntaxe ou type de champ invalide). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | SLUG_CONFLICT : impossible de générer une adresse publique unique à la création du profil, réessayer. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, message} (pas de code par champ), un élément par violation ; champs : displayName (absent, vide ou de plus de 120 caractères) ; titleLabel, contactPhone, contactEmail, websiteUrl, address, city, postalCode, responseDelay, fees, bio (longueur maximale dépassée) ; specialties, audiences, modalities, languages (valeur hors liste, inactive ou en double ; specialties : plus de 8 valeurs) ; availability (hors accepting, waitlist, closed, unknown) ; websiteUrl (pas une adresse http ou https) ; contactEmail (adresse invalide) ; country (pas un code ISO à deux lettres). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/me/profile/photo`

**Envoie la photo du profil d'annuaire**

Session praticien. Requête multipart/form-data avec la partie file : image JPEG ou PNG (signature vérifiée, pas le Content-Type). Limites : 5 Mo, 25 millions de pixels. La photo est recadrée en carré au centre, réduite à 512 px au plus, réécrite en JPEG sans métadonnées (EXIF et GPS supprimés) et remplace la précédente. Réponse : le profil mis à jour.

operationId : `uploadPhoto`

Corps (`multipart/form-data`) : object

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ProfileDto](#schema-profiledto) (*/*) | Photo enregistrée ; profil mis à jour. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | SLUG_CONFLICT : impossible de générer une adresse publique unique à la création du profil, réessayer. |
| 413 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PHOTO_TOO_LARGE : le fichier dépasse 5 Mo. |
| 415 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PHOTO_UNSUPPORTED : le fichier n'est ni un JPEG ni un PNG. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PHOTO_INVALID : fichier vide, image illisible ou corrompue ; PHOTO_TOO_LARGE_DIMENSIONS : image de plus de 25 millions de pixels. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `DELETE /api/me/profile/photo`

**Retire la photo du profil d'annuaire**

Session praticien. Supprime la photo du profil ; idempotent : sans photo, répond aussi 204 sans effet.

operationId : `deletePhoto`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | Photo retirée (ou déjà absente). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | SLUG_CONFLICT : impossible de générer une adresse publique unique à la création du profil, réessayer. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/me/profile/publish`

**Publie le profil dans l'annuaire public**

Session praticien. Le dossier de vérification doit être approuvé et le profil complet : nom affiché, profession, ville, et au moins un moyen de contact affiché et renseigné (téléphone, e-mail ou adresse avec son interrupteur show* à true) ; les spécialités et publics enregistrés doivent être encore actifs. Sinon 409 PROFILE_INCOMPLETE avec missing[], sans rien publier. Idempotent : un profil déjà publié reste inchangé. Le profil est dépublié automatiquement quand le dossier est refusé ou le compte suspendu.

operationId : `publish`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | Profil publié (ou déjà publié). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PROFILE_INCOMPLETE : conditions de publication non remplies, missing[] liste les éléments à fournir dans cet ordre : verification (dossier non approuvé), displayName, profession, city, contact (aucun moyen de contact affiché et renseigné), specialties ou audiences (code désactivé depuis l'enregistrement) ; SLUG_CONFLICT : impossible de générer une adresse publique unique à la création du profil, réessayer. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/me/profile/unpublish`

**Retire le profil de l'annuaire public**

Session praticien. Le profil cesse d'apparaître dans l'annuaire public (sa fiche répond 404 PROFILE_NOT_FOUND) mais reste éditable ; publishedAt est conservé. Idempotent : un profil non publié reste inchangé.

operationId : `unpublish`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | Profil dépublié (ou déjà non publié). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | SLUG_CONFLICT : impossible de générer une adresse publique unique à la création du profil, réessayer. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-preferences"></a>Préférences

### `GET /api/me/preferences`

**Préférences du compte (valeurs stockées complétées par les défauts)**

Session praticien. Renvoie toujours les 9 clés : la valeur enregistrée si elle est valide, sinon le défaut calculé selon la profession (coach : vocabulary.subjectLabel = client et entryTypes.medicationVisible = false ; psychiatre : entryTypes.medicationVisible = true). Les clés inconnues stockées ne sont pas renvoyées.

operationId : `getPreferences`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [Preferences](#schema-preferences) (application/json) | Les 9 préférences effectives du compte. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `PATCH /api/me/preferences`

**Modifie les préférences (merge-patch RFC 7396, null = retour au défaut)**

Session praticien. Corps JSON plat (application/json ou application/merge-patch+json) avec seulement les clés à changer : les autres sont conservées. null remet la clé à son défaut ; une clé inconnue est ignorée sans erreur. Une seule valeur hors domaine rejette toute la requête (422, errors[].field = clé fautive) et rien n'est appliqué. Renvoie les 9 préférences effectives après fusion ; un PATCH qui ne change rien est un succès.

operationId : `updatePreferences`

Corps (`application/json`) : [Preferences](#schema-preferences)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [Preferences](#schema-preferences) (application/json) | Les 9 préférences effectives après fusion. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} : code INVALID_VALUE, field = la clé fautive (par exemple overview.window) ; valeurs admises dans message ; rien n'est appliqué. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-recherche"></a>Recherche

### `GET /api/patients/{id}/search`

**Recherche des entrées dans le dossier d'un patient**

Session praticien propriétaire du patient. Recherche plein texte en français, sans accents ni casse, classée par pertinence avec un boost x1,5 pour les entrées de moins de 90 jours ; sans texte, liste par date décroissante. Avec un texte (sans exclusion -mot) et moins de 3 résultats exacts, la page 1 est complétée par des résultats approchés (tolérance aux fautes, approximate=true). Extraits échappés en HTML avec <mark>. Syntaxe de q, filtres et facettes (chacune ignore son propre filtre) : voir les paramètres ; plusieurs valeurs d'un même filtre se combinent en « ou », les filtres entre eux en « et ». Les entrées privées d'un autre praticien ne sont jamais renvoyées. Pagination par numéro de page (exception au curseur) : 20 résultats par page, 500 pages au plus ; approchés sur la page 1 seulement.

operationId : `searchPatientEntries`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |
| `q` | query | string | non | Texte et jetons de recherche, 200 caractères au maximum (400 TOO_LONG au-delà). Le texte suit la syntaxe web : mots (tous requis), "expression exacte", mot1 or mot2, -mot pour exclure. Jetons retirés du texte et appliqués comme filtres : tag:travail, émotion:anxiété (code ou libellé, emotion: accepté), avant:AAAA[-MM[-JJ]] (strictement avant le début de la période, before: accepté), après:AAAA[-MM[-JJ]] (à partir de la fin de la période, after: accepté ; après:2026-06 = dès le 1er juillet 2026, UTC). Valeur à espaces entre guillemets : tag:"vie pro". Préfixes sans casse ni accents ; un tag ou une émotion inconnus ne retiennent aucune entrée, sans erreur. |
| `types` | query | string[] | non | Types d'entrée à retenir ; paramètre répétable (types=note&types=event), en « ou ». Valeurs : note, event, situation, feeling, session, medication ; toute autre donne 400 UNKNOWN_TYPE. |
| `emotions` | query | string[] | non | Émotions à retenir (ressentis), par code ou libellé sans casse ni accents ; paramètre répétable, en « ou ». Une émotion inconnue ne retient aucune entrée. |
| `tags` | query | string[] | non | Libellés de tags à retenir, sans casse ni accents, « # » de tête toléré ; paramètre répétable, en « ou ». Un tag inconnu ne retient aucune entrée. |
| `from` | query | string | non | Début de période sur la date de l'entrée (occurred_from), inclus : date AAAA-MM-JJ (dès 00:00 UTC) ou instant ISO 8601 avec fuseau (2026-03-14T09:30:00Z). Autre format : 400 INVALID_DATE. |
| `to` | query | string | non | Fin de période sur la date de l'entrée, incluse : date AAAA-MM-JJ (jour entier compris) ou instant ISO 8601 avec fuseau. Ne doit pas être antérieure à from (la même journée est admise) : 400 RANGE_INVERTED sinon. |
| `sessionId` | query | string (uuid) | non | Ne retenir que les entrées rattachées à cette séance (identifiant). |
| `includeArchived` | query | boolean | non | true : inclure aussi les entrées archivées (archivedAt renseigné) ; false (défaut) : les exclure. |
| `page` | query | integer (int32) | non | Numéro de page, de 1 à 500 (défaut 1), 20 résultats par page ; hors bornes : 400 INVALID_PAGE. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntrySearchResultDto](#schema-entrysearchresultdto) (*/*) | Résultats de la page, total exact, facettes et requête interprétée. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | SEARCH_BAD_REQUEST : errors[] {field, code, message}, toutes les erreurs ensemble ; codes par champ : q = TOO_LONG (plus de 200 caractères) ou INVALID_DATE (date invalide dans avant: ou après:), page = INVALID_PAGE (hors 1..500), from et to = INVALID_DATE, to = RANGE_INVERTED (to antérieur à from), types = UNKNOWN_TYPE, et INVALID_FORMAT sur le paramètre concerné pour une valeur non convertible (page non numérique, sessionId qui n'est pas un UUID, includeArchived non booléen, id qui n'est pas un UUID : field = id). Le contrôle de propriété passe avant les contrôles de q, page, from, to et types (patient d'un autre praticien : 403), mais pas avant INVALID_FORMAT, détecté à la conversion des paramètres. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : aucun patient avec cet identifiant. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-recours"></a>Recours

### `GET /api/admin/appeals`

**Liste les recours à examiner ou déjà examinés**

Administrateur avec 2FA. Filtre status : open (non examinés, par défaut), decided (examinés) ou all. Les recours open sont triés du plus ancien au plus récent (file de traitement), decided et all du plus récent au plus ancien. Pagination par curseur opaque : limit 50 par défaut, bornée à 1..200 sans erreur ; nextCursor est null sur la dernière page.

operationId : `listAdminAppeals`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `status` | query | `open` \| `decided` \| `all` | non | Recours à lister : open (défaut), decided ou all. Autre valeur : 422 INVALID_STATUS. |
| `cursor` | query | string | non | Curseur opaque (nextCursor de la page précédente, à renvoyer tel quel) ; absent pour la première page. Illisible : 422 INVALID_CURSOR. |
| `limit` | query | integer (int32) | non | Nombre maximal de recours par page : 50 par défaut, ramené dans l'intervalle 1 à 200 sans erreur. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [AppealListDto](#schema-appeallistdto) (*/*) | Page de recours. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : INVALID_STATUS (status, autre que open, decided, all), INVALID_CURSOR (cursor illisible). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/admin/appeals/{id}/decision`

**Accepte ou écarte un recours**

Administrateur avec 2FA, différent de l'auteur de la décision contestée. Le corps est validé en premier (422). accepted : le compte est réactivé comme par la réactivation manuelle (statut d'avant la suspension, ou docs_pending pour un dossier refusé), décision appeal_accepted au journal, un seul e-mail. dismissed : le compte reste inchangé, décision appeal_rejected, e-mail de réponse. Dans les deux cas la réponse est transmise au praticien, l'e-mail part de façon asynchrone après l'enregistrement, et le recours est clos : il ne peut plus être décidé ni redéposé pour la même décision.

operationId : `decideAdminAppeal`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du recours. |

Corps (`application/json`) : [AppealDecisionRequest](#schema-appealdecisionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [AppealItemDto](#schema-appealitemdto) (*/*) | Recours examiné, avec son issue. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : corps absent ou JSON illisible (code propre à ce module). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. ADMIN_ROLE_REQUIRED : compte sans rôle admin ; TWO_FACTOR_REQUIRED : double authentification non activée sur le compte admin. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | APPEAL_NOT_FOUND : aucun recours avec cet identifiant. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | APPEAL_ALREADY_DECIDED : le recours a déjà été examiné ; APPEAL_SELF_REVIEW : l'administrateur est l'auteur de la décision contestée ; APPEAL_ACCOUNT_NOT_REACTIVABLE : outcome accepted alors que le compte n'est plus suspended ni rejected. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : INVALID_OUTCOME (outcome, autre que accepted ou dismissed), REQUIRED (messageToPractitioner), TOO_LONG (messageToPractitioner, plus de 4000 caractères). Contrôlé avant la recherche du recours. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/me/appeal`

**Dépose le recours d'un compte refusé ou suspendu**

Public, sans session : le praticien s'identifie par {email, password, otp?} dans le corps, car son compte refusé ou suspendu ne peut plus se connecter. Le corps est validé en premier (422), sans consommer de tentative. Le compte doit être rejected ou suspended (409 sinon) ; si la 2FA est active et que otp manque, réponse 202 avec otpRequired et rien n'est enregistré. Un seul recours ouvert à la fois et un seul par décision contestée ; 5 échecs en 15 minutes verrouillent le couple e-mail et IP 15 minutes (423). Dépôt inscrit au journal d'administration ; 201 sans en-tête Location.

operationId : `submitAppeal`

Corps (`application/json`) : [AppealRequest](#schema-appealrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [AppealCreatedDto](#schema-appealcreateddto) (*/*) | Recours enregistré, au statut open ; en attente d'un administrateur. |
| 202 | [AppealOtpRequiredDto](#schema-appealotprequireddto) (*/*) | Identifiants corrects, 2FA active et code absent : renvoyer la même requête avec otp. Rien n'est enregistré. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : corps absent ou JSON illisible (code propre à ce module, à la place de MALFORMED_JSON). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | INVALID_CREDENTIALS : e-mail inconnu, mot de passe incorrect ou code 2FA faux (message unique, sans indiquer lequel). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : mot de passe correct mais l'adresse e-mail n'a jamais été confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ACCOUNT_NOT_SUSPENDED : identifiants corrects mais le compte n'est ni refusé ni suspendu ; APPEAL_NOT_ALLOWED : aucune décision de refus ou de suspension à contester ; APPEAL_ALREADY_OPEN : un recours est déjà en attente ; APPEAL_ALREADY_USED : la décision contestée a déjà fait l'objet d'un recours examiné. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} ; codes de champ : REQUIRED (email, password, message), TOO_SHORT (message, moins de 20 caractères), TOO_LONG (message, plus de 4000 caractères). |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ACCOUNT_LOCKED : 5 échecs d'identification en 15 minutes ; réessayer après retryAfterSeconds. |

## <a id="tag-seances"></a>Séances

### `POST /api/patients/{id}/sessions/contact`

**Consigne un contact hors rendez-vous comme une séance déjà clôturée**

Session praticien, propriétaire du patient. Crée une séance de genre contact (téléphone ou e-mail), clôturée d'emblée, à la date indiquée, dont le texte devient le compte rendu. N'affecte pas la séance éventuellement ouverte. Réponse 201 avec Location. authorType et submissionId sont refusés (UNKNOWN_FIELD).

operationId : `recordContact`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |

Corps (`application/json`) : [RecordContactRequest](#schema-recordcontactrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [EntryDto](#schema-entrydto) (*/*) | Contact consigné ; en-tête Location = /api/entries/{id} de la séance. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : identifiant du patient qui n'est pas un UUID, ou corps JSON absent ou illisible. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : patient inexistant. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] : modality REQUIRED ou INVALID_VALUE (hors phone, email), occurredFrom REQUIRED ou INVALID_FORMAT (date illisible), body REQUIRED (texte vide) ; UNKNOWN_FIELD si authorType ou submissionId est envoyé. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/patients/{id}/sessions/current`

**Donne la séance courante du patient**

Session praticien, propriétaire du patient. La séance courante est la séance ouverte, sinon la dernière séance ou le dernier contact clôturé, sinon la séance d'accueil. C'est celle à laquelle une entrée sans sessionId est rattachée. L'accueil étant créé de façon asynchrone après la création du patient, il peut manquer brièvement.

operationId : `getCurrentSession`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryDto](#schema-entrydto) (*/*) | Séance courante (entrée de type session). |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : identifiant du patient qui n'est pas un UUID. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : patient inexistant ; NO_CURRENT_SESSION : le patient n'a aucune séance. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/patients/{id}/sessions/start`

**Démarre une séance maintenant pour le patient**

Session praticien, propriétaire du patient. Une seule séance peut être ouverte par patient (la séance d'accueil créée avec le patient ne compte pas). La séance démarre à l'instant présent, durée inconnue jusqu'à la clôture (POST /api/sessions/{id}/close). Réponse 201 avec Location. authorType et submissionId sont refusés (UNKNOWN_FIELD).

operationId : `startSession`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |

Corps (`application/json`) : [StartSessionRequest](#schema-startsessionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [EntryDto](#schema-entrydto) (*/*) | Séance ouverte créée ; en-tête Location = /api/entries/{id} de la séance. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : identifiant du patient qui n'est pas un UUID, ou corps JSON absent ou illisible. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : patient inexistant. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | SESSION_ALREADY_OPEN : une séance est déjà ouverte pour ce patient. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] : modality REQUIRED (absente) ou INVALID_VALUE (vide ou hors in_person, video, phone, email) ; UNKNOWN_FIELD si authorType ou submissionId est envoyé. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/sessions/{id}/close`

**Clôture une séance ouverte en figeant durée, fin et compte rendu**

Session praticien, propriétaire du patient de la séance. La durée (sinon la durée par défaut du praticien, 60 minutes à défaut), l'heure de fin et le compte rendu (summary) sont figés dans une nouvelle version, même dans la fenêtre de grâce de 1 h 15. Une séance ne se clôture qu'une fois. authorType et submissionId sont refusés (UNKNOWN_FIELD). Le corps est obligatoire, un objet vide convient.

operationId : `closeSession`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant de la séance (entrée de type session). |

Corps (`application/json`) : [CloseSessionRequest](#schema-closesessionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryDto](#schema-entrydto) (*/*) | Séance clôturée : nouvelle version portant durée, fin et compte rendu. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MALFORMED_REQUEST : identifiant de la séance qui n'est pas un UUID, ou corps JSON absent ou illisible. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : la séance appartient au dossier d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ENTRY_NOT_FOUND : séance inexistante. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | SESSION_ALREADY_CLOSED : la séance est déjà clôturée ; ENTRY_ARCHIVED : la séance est archivée. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | SESSION_INVALID : l'entrée désignée n'est pas une séance (code racine, errors[0].field = sessionId) ; VALIDATION_FAILED avec errors[] : durationMin OUT_OF_RANGE (hors 1 à 600) ou INVALID_FORMAT, UNKNOWN_FIELD si authorType ou submissionId est envoyé. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-tags"></a>Tags

### `GET /api/tags`

**Liste les tags actifs du praticien**

Session praticien. Renvoie uniquement ses propres tags actifs (les tags fusionnés dans un autre sont absents), triés par libellé normalisé. Liste complète, non paginée.

operationId : `list`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [TagView](#schema-tagview)[] (*/*) | Tags actifs du praticien. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/tags`

**Crée un tag pour le praticien**

Session praticien. Le tag lui appartient. Un libellé équivalent à un tag actif existant (sans casse, accents ni « # ») est refusé ; un libellé qui correspond à une émotion globale ou à une de ses émotions personnalisées aussi, avec la propriété suggestedEmotion (émotion à utiliser à la place). Le libellé d'un tag fusionné est de nouveau libre.

operationId : `create`

Corps (`application/json`) : [TagRequest](#schema-tagrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [TagView](#schema-tagview) (*/*) | Tag créé ; corps = tag. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TAG_EXISTS : un tag actif porte déjà ce libellé. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : errors[] {field, message} avec field = label (obligatoire) ; TAG_IS_EMOTION : le libellé est déjà une émotion, errors[] avec field = label et propriété suggestedEmotion (objet EmotionView). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `PATCH /api/tags/{id}`

**Renomme un tag du praticien**

Session praticien propriétaire du tag ; un tag déjà fusionné est introuvable. Mêmes règles de libellé qu'à la création ; le nouveau libellé peut différer du précédent seulement par la casse ou les accents. Le renommage s'applique partout où le tag est utilisé (patients, entrées).

operationId : `rename`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du tag. |

Corps (`application/json`) : [TagRequest](#schema-tagrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [TagView](#schema-tagview) (*/*) | Tag renommé ; corps = tag. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TAG_NOT_FOUND : tag inexistant, archivé (fusionné) ou appartenant à un autre praticien. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TAG_EXISTS : un autre tag actif porte déjà ce libellé. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : errors[] {field, message} avec field = label (obligatoire) ; TAG_IS_EMOTION : le libellé est déjà une émotion, avec propriété suggestedEmotion. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/tags/{id}/merge`

**Fusionne un tag dans un autre**

Session praticien propriétaire des deux tags, tous deux actifs. Le tag source (id du chemin) est archivé et son libellé redevient libre ; ses patients et ses entrées sont rattachés au tag cible sans doublon, et son compteur d'usages s'ajoute à celui de la cible. Réponse 200 avec le tag cible mis à jour.

operationId : `merge`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du tag source, celui qui est absorbé puis archivé. |

Corps (`application/json`) : [MergeTagRequest](#schema-mergetagrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [TagView](#schema-tagview) (*/*) | Fusion faite ; corps = tag cible. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TAG_NOT_FOUND : tag source ou tag cible inexistant, archivé (fusionné) ou appartenant à un autre praticien. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : errors[] {field, message} avec field = targetId (absent, ou identique à la source). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-vocabulaire"></a>Vocabulaire

### `GET /api/vocabulary/emotions`

**Liste les émotions utilisables par le praticien**

Session praticien. Renvoie les 29 émotions globales du produit plus les émotions personnalisées actives du praticien connecté (jamais celles d'un autre praticien) ; les émotions fusionnées sont absentes. Tri : globales d'abord, puis par famille, niveau d'intensité (non renseigné en dernier) et libellé. Liste complète, non paginée.

operationId : `emotions`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EmotionView](#schema-emotionview)[] (*/*) | Émotions actives (globales et personnalisées). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/vocabulary/entry-types`

**Liste les types d'entrées cliniques**

Session praticien. Les six types d'entrées actifs (note, event, situation, feeling, session, medication), triés par sortOrder. Catalogue identique pour tous les praticiens, liste complète, non paginée.

operationId : `entryTypes`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryTypeView](#schema-entrytypeview)[] (*/*) | Types d'entrées actifs. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/vocabulary/link-types`

**Liste les types de liens et leur matrice source/cible**

Session praticien. Les huit types de liens actifs, triés par sortOrder, avec les types d'entrée admis en source et en cible : un lien dont la source ou la cible sort de cette matrice est refusé à la création. Catalogue identique pour tous les praticiens, liste complète, non paginée.

operationId : `linkTypes`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [LinkTypeView](#schema-linktypeview)[] (*/*) | Types de liens actifs. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-vocabulaire-de-lannuaire"></a>Vocabulaire de l'annuaire

### `GET /api/vocabulary/directory`

**Liste les valeurs admises pour remplir le profil d'annuaire**

Session praticien. Rend les spécialités et publics actifs (administrables), les modalités et les langues proposées ; les codes sont ceux à envoyer dans le profil (PUT /api/me/profile) et dans les filtres de l'annuaire public. Listes complètes, non paginées.

operationId : `get_1`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [DirectoryVocabularyDto](#schema-directoryvocabularydto) (*/*) | Listes fermées de l'annuaire. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-vue-densemble"></a>Vue d'ensemble

### `GET /api/patients/{id}/overview`

**Synthèse clinique d'un patient sur une fenêtre de temps**

Session praticien propriétaire du patient (fonctionne aussi pour un patient archivé). Une seule réponse porte tout : faits clés, situations actives, tendance d'intensité (moyenne glissante sur 7 jours, 90 points au plus, repères de séances et de médicaments), émotions dominantes comparées à la fenêtre précédente, ressentis réels, brouillons, entrées depuis la dernière séance, 5 séances récentes et résumé « En bref » rédigé par règles, sans IA, dans la langue d'Accept-Language (français par défaut). La fenêtre window borne la tendance, les émotions et les ressentis. Les données viennent d'une projection recalculée à la volée si elle est en retard sur le dossier : la réponse n'est jamais obsolète ; recentActivity est lu en direct. Entrées archivées exclues, entrées privées du praticien incluses.

operationId : `getPatientOverview`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient. |
| `window` | query | `30d` \| `90d` \| `12m` | non | Fenêtre de la tendance, des émotions dominantes et des ressentis, jusqu'à aujourd'hui (jours UTC) : 30d = 30 jours, 90d = 90 jours (défaut), 12m = 12 mois (un point par semaine). Absent ou vide : 90d. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [OverviewDto](#schema-overviewdto) (*/*) | Synthèse du patient pour la fenêtre demandée. |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | OVERVIEW_BAD_REQUEST : paramètre invalide, errors[] {field, code, message} avec field = window et code = INVALID_WINDOW (valeur autre que 30d, 90d, 12m ; la casse compte). Le contrôle de propriété passe avant : un patient d'un autre praticien reste en 403. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND : aucun patient avec cet identifiant. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-verification-du-praticien"></a>Vérification du praticien

### `PATCH /api/me/professional-info`

**Met à jour n° professionnel, téléphone, adresse et exercice à distance**

Session praticien (compte confirmé). Mise à jour partielle : un champ absent ou null est inchangé, une chaîne vide l'efface. Possible quel que soit l'état du dossier. Aucune modification n'est appliquée si un champ est invalide. Renvoie les informations enregistrées.

operationId : `updateProfessionalInfo`

Corps (`application/json`) : [ProfessionalInfoRequest](#schema-professionalinforequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ProfessionalInfoDto](#schema-professionalinfodto) (*/*) | Informations professionnelles à jour. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ACCOUNT_NOT_FOUND : compte du praticien introuvable. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} : INVALID_FIELD, field = professionalNumber (4 à 20 caractères : lettres, chiffres, espace, tiret), phone (6 à 30 caractères : chiffres, + espace ( ) . tiret) ou address.street, address.postalCode, address.city (200 caractères au maximum). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/me/verification`

**État du dossier professionnel, justificatifs, pièces manquantes**

Session praticien (compte confirmé). Renvoie l'état de la vérification (email_pending, docs_pending, under_review, approved, needs_more, rejected, suspended, closed), les justificatifs actifs, les types obligatoires manquants (missing) et conseillés (recommended), les décisions reçues avec leur message et les informations professionnelles. La note interne de l'administrateur n'est jamais exposée.

operationId : `getVerification`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [VerificationDto](#schema-verificationdto) (*/*) | Dossier professionnel du praticien. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ACCOUNT_NOT_FOUND : compte du praticien introuvable. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/me/verification/documents`

**Dépose un justificatif (PDF, JPEG ou PNG, 10 Mo au maximum)**

Session praticien (compte confirmé), requête multipart/form-data : le fichier dans le champ file ; type, title, issuer et year sont lus comme paramètres de requête ou champs du formulaire (équivalents pour le serveur) ; type, title et file sont obligatoires (422 sinon). Autorisé seulement en docs_pending et needs_more ; 20 justificatifs actifs au maximum. Le format est reconnu d'après le contenu du fichier (jamais l'extension) ; les images sont ré-encodées sans métadonnées (EXIF, GPS), les PDF conservés tels quels. Le fichier est stocké chiffré. Limites : 10 Mo par fichier, image de 25 millions de pixels au maximum. Réponse 201 avec le justificatif créé.

operationId : `uploadDocument`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `type` | query | string | non | Nature du justificatif : diploma, registration, certification, professional_card, identity ou other. Obligatoire. |
| `title` | query | string | non | Intitulé du justificatif, 200 caractères au maximum. Obligatoire. |
| `issuer` | query | string | non | Établissement ou organisme émetteur, 200 caractères au maximum. Facultatif. |
| `year` | query | string | non | Année d'obtention, entier de 1950 à 2100. Facultatif. |

Corps (`multipart/form-data`) : object

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [DocumentDto](#schema-documentdto) (*/*) | Justificatif déposé. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ACCOUNT_NOT_FOUND : compte du praticien introuvable. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VERIFICATION_LOCKED : le dossier n'est pas modifiable dans son état actuel (hors docs_pending et needs_more) ; DOCUMENT_LIMIT : 20 justificatifs au maximum par dossier. |
| 413 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | DOCUMENT_TOO_LARGE : le fichier dépasse 10 Mo (au-delà du plafond global de la requête multipart, la réponse est UPLOAD_TOO_LARGE). |
| 415 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | DOCUMENT_UNSUPPORTED : seuls les fichiers PDF, JPEG et PNG sont acceptés. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED avec errors[] {field, code, message} : INVALID_TYPE (type inconnu ou absent), INVALID_TITLE (title vide ou de plus de 200 caractères), INVALID_ISSUER (issuer de plus de 200 caractères), INVALID_YEAR (year hors de 1950 à 2100 ou non numérique) ; DOCUMENT_INVALID : fichier absent ou vide, image illisible ou corrompue, image de plus de 25 millions de pixels. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/me/verification/documents/{id}`

**Métadonnées d'un justificatif (403 s'il appartient à un autre praticien)**

Session praticien (compte confirmé), propriétaire du justificatif. Renvoie les métadonnées, jamais le fichier (voir /url et /file). Un justificatif retiré est introuvable ; un justificatif purgé reste lisible en métadonnées (purged = true).

operationId : `getDocument`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du justificatif. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [DocumentDto](#schema-documentdto) (*/*) | Métadonnées du justificatif. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | DOCUMENT_FORBIDDEN : le justificatif appartient à un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | DOCUMENT_NOT_FOUND : justificatif inexistant ou retiré. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `DELETE /api/me/verification/documents/{id}`

**Retire un justificatif (docs_pending ou needs_more seulement)**

Session praticien (compte confirmé), propriétaire du justificatif. Autorisé seulement en docs_pending et needs_more. Le justificatif disparaît du dossier (suppression logique) et son fichier stocké est effacé.

operationId : `deleteDocument`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du justificatif. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | Justificatif retiré. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | DOCUMENT_FORBIDDEN : le justificatif appartient à un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | DOCUMENT_NOT_FOUND : justificatif inexistant ou déjà retiré ; ACCOUNT_NOT_FOUND : compte du praticien introuvable. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VERIFICATION_LOCKED : le dossier n'est pas modifiable dans son état actuel (hors docs_pending et needs_more). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/me/verification/documents/{id}/file`

**Sert le justificatif déchiffré (URL signée, praticien propriétaire)**

Session praticien (compte confirmé), propriétaire du justificatif, avec la signature obtenue par GET .../url (exp et sig, valables 5 minutes). Renvoie le fichier déchiffré dans son type d'origine (PDF, JPEG ou PNG), en Content-Disposition inline, Cache-Control no-store et X-Content-Type-Options nosniff. Chaque lecture est inscrite au journal d'accès aux documents (adresse IP du client).

operationId : `getDocumentFile`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du justificatif. |
| `exp` | query | integer (int64) | non | Échéance de la signature, en secondes depuis l'epoch Unix (UTC), telle que renvoyée dans l'url de GET .../url. Sa valeur est signée : ne pas la modifier. |
| `sig` | query | string | non | Signature de l'URL, telle que renvoyée dans l'url de GET .../url. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | string (binary) (application/pdf) | Fichier du justificatif (corps binaire). |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | DOCUMENT_FORBIDDEN : le justificatif appartient à un autre praticien ; SIGNED_URL_INVALID : exp ou sig absent, signature incorrecte ou URL expirée. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | DOCUMENT_NOT_FOUND : justificatif inexistant ou retiré. |
| 410 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | DOCUMENT_PURGED : le fichier a été supprimé du stockage. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `GET /api/me/verification/documents/{id}/url`

**URL signée de 5 minutes pour lire le justificatif déchiffré**

Session praticien (compte confirmé), propriétaire du justificatif. Renvoie un chemin relatif signé (paramètres exp et sig) valable 5 minutes, à appeler en GET avec la même session pour obtenir le fichier déchiffré (voir /file). Un justificatif purgé n'a plus de fichier : 410.

operationId : `getDocumentUrl`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du justificatif. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [SignedUrlDto](#schema-signedurldto) (*/*) | URL signée et date d'expiration. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | DOCUMENT_FORBIDDEN : le justificatif appartient à un autre praticien. EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | DOCUMENT_NOT_FOUND : justificatif inexistant ou retiré. |
| 410 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | DOCUMENT_PURGED : le fichier a été supprimé du stockage. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/me/verification/submit`

**Soumet le dossier pour vérification (409 avec les pièces manquantes)**

Session praticien (compte confirmé). Autorisé seulement en docs_pending et needs_more, avec un diplôme et une pièce d'identité au moins parmi les justificatifs non purgés ; sinon 409 VERIFICATION_INCOMPLETE avec missing[] (types obligatoires absents). Succès : le dossier passe en under_review, la soumission est consignée et les administrateurs sont notifiés par e-mail. Renvoie le dossier à jour.

operationId : `submitVerification`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [VerificationDto](#schema-verificationdto) (*/*) | Dossier soumis, statut under_review. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ACCOUNT_NOT_FOUND : compte du praticien introuvable. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VERIFICATION_LOCKED : le dossier n'est pas soumettable dans son état actuel (hors docs_pending et needs_more) ; VERIFICATION_INCOMPLETE : justificatifs obligatoires manquants, liste dans missing[] (diploma, identity). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## <a id="tag-emotions-personnelles"></a>Émotions personnelles

### `POST /api/me/emotions`

**Crée une émotion personnalisée**

Session praticien. L'émotion lui appartient et reste invisible aux autres praticiens ; son code est généré (« c_ » plus 8 caractères hexadécimaux) et son niveau d'intensité est non renseigné. Elle devient aussitôt disponible dans GET /api/vocabulary/emotions. Réponse 201 avec l'émotion.

operationId : `create_1`

Corps (`application/json`) : [CreateEmotionRequest](#schema-createemotionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [EmotionView](#schema-emotionview) (*/*) | Émotion créée ; corps = émotion. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMOTION_LABEL_EXISTS : le libellé est déjà pris par une émotion globale ou par une émotion personnalisée du praticien. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : errors[] {field, message} avec field = labelFr (obligatoire) ou family (obligatoire ou famille inconnue). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `PATCH /api/me/emotions/{code}`

**Renomme une émotion personnalisée**

Session praticien propriétaire de l'émotion. Seules ses émotions personnalisées actives sont modifiables : une émotion globale ou celle d'un autre praticien est introuvable. Seul le libellé français change ; le code reste stable. Réponse 200 avec l'émotion.

operationId : `rename_1`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `code` | path | string | oui | Code de l'émotion personnalisée (c_ suivi de 8 caractères hexadécimaux). |

Corps (`application/json`) : [RenameEmotionRequest](#schema-renameemotionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EmotionView](#schema-emotionview) (*/*) | Émotion renommée ; corps = émotion. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMOTION_NOT_FOUND : code inconnu, émotion globale ou émotion d'un autre praticien. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMOTION_INACTIVE : l'émotion a été fusionnée ; EMOTION_LABEL_EXISTS : le libellé est déjà pris par une autre émotion. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : errors[] {field, message} avec field = labelFr (obligatoire). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/me/emotions/{code}/merge`

**Fusionne une émotion personnalisée dans une autre émotion**

Session praticien propriétaire de l'émotion source (personnalisée, active). Tous les ressentis qui la portent passent à l'émotion cible (le code d'origine est conservé pour l'annulation), la source devient inactive et disparaît de la liste des émotions. La fusion est annulable pendant 30 jours via POST /api/me/emotions/merges/{id}/undo (champ undoUntil). Réponse 200 avec la fusion.

operationId : `merge_1`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `code` | path | string | oui | Code de l'émotion personnalisée source, celle qui est absorbée. |

Corps (`application/json`) : [MergeEmotionRequest](#schema-mergeemotionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [MergeView](#schema-mergeview) (*/*) | Fusion faite ; corps = fusion annulable. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMOTION_NOT_FOUND : émotion source inconnue, globale ou d'un autre praticien, ou émotion cible introuvable (inactive ou d'un autre praticien). |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMOTION_INACTIVE : l'émotion source a déjà été fusionnée. |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : errors[] {field, message} avec field = targetCode (absent, ou identique à la source). |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

### `POST /api/me/emotions/merges/{id}/undo`

**Annule une fusion d'émotions dans les 30 jours**

Session praticien propriétaire de la fusion. Réactive l'émotion source et lui rend les ressentis réécrits par la fusion. Possible une seule fois et jusqu'à undoUntil (30 jours après la fusion). Aucun corps de requête. Réponse 200 avec la fusion, undoneAt renseigné.

operationId : `undo`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant de la fusion, lu dans le champ id de la réponse du merge. |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [MergeView](#schema-mergeview) (*/*) | Fusion annulée ; corps = fusion avec undoneAt. |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | UNAUTHENTICATED : aucune session valide (cookie absent, expiré ou révoqué). |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED : adresse e-mail du compte non confirmée. |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MERGE_NOT_FOUND : fusion inconnue ou appartenant à un autre praticien. |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | MERGE_ALREADY_UNDONE : la fusion a déjà été annulée ; MERGE_UNDO_EXPIRED : le délai d'annulation de 30 jours est dépassé. |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | RATE_LIMITED : limite de débit atteinte (en-tête Retry-After et champ retryAfterSeconds, en secondes). |

## Schémas

### <a id="schema-accountdetaildto"></a>AccountDetailDto

Détail d'un compte : mêmes champs que dans la liste, plus l'historique des décisions et des recours.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `appeals` | [AppealSummaryDto](#schema-appealsummarydto)[] | non | Recours déposés par le praticien, du plus récent au plus ancien. |
| `city` | string | non | Ville du cabinet ; null si aucune adresse n'a été renseignée. |
| `createdAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de création du compte. |
| `decisions` | [DecisionItemDto](#schema-decisionitemdto)[] | non | Décisions prises sur ce compte (vérification, suspension, réactivation, recours), de la plus récente à la plus ancienne. |
| `displayName` | string | non | Nom d'affichage. |
| `email` | string | non | Adresse e-mail de connexion. |
| `id` | string (uuid) | non | Identifiant du compte. |
| `lastLoginAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de la dernière connexion ; null si le compte ne s'est jamais connecté. |
| `profession` | `psychologist` \| `psychiatrist` \| `coach` | non | Profession déclarée. |
| `purgeAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de la purge planifiée du compte : 30 jours après le refus du dossier ; null sinon (effacée à la réactivation). |
| `role` | `practitioner` \| `admin` | non | Rôle du compte : practitioner ou admin. |
| `suspendedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de la suspension ou du refus ; null si le compte n'est ni suspendu ni refusé (effacée à la réactivation). |
| `twoFactorEnabled` | boolean | non | Vrai si la double authentification est activée sur le compte. |
| `verification` | [AccountVerificationDto](#schema-accountverificationdto) | non | État de vérification du compte. |

### <a id="schema-accountexportrequest"></a>AccountExportRequest

Identifiants d'un compte refusé ou suspendu, qui n'a pas de session. Ignoré (et facultatif) quand le praticien est connecté ; obligatoire sinon (email et password REQUIRED).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `email` | string | non | Adresse e-mail du compte. Obligatoire sans session. |
| `otp` | string | non | Code de double authentification du compte. Absent : si la double authentification est active, la réponse 202 demande le code (otpRequired). |
| `password` | string | non | Mot de passe du compte. Obligatoire sans session. |

### <a id="schema-accountitemdto"></a>AccountItemDto

Compte d'un praticien ou d'un administrateur dans la liste d'administration.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `city` | string | non | Ville du cabinet ; null si aucune adresse n'a été renseignée. |
| `createdAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de création du compte. |
| `displayName` | string | non | Nom d'affichage. |
| `email` | string | non | Adresse e-mail de connexion. |
| `id` | string (uuid) | non | Identifiant du compte. |
| `lastLoginAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de la dernière connexion ; null si le compte ne s'est jamais connecté. |
| `profession` | `psychologist` \| `psychiatrist` \| `coach` | non | Profession déclarée. |
| `purgeAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de la purge planifiée du compte : 30 jours après le refus du dossier ; null sinon (effacée à la réactivation). |
| `role` | `practitioner` \| `admin` | non | Rôle du compte : practitioner ou admin. |
| `suspendedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de la suspension ou du refus ; null si le compte n'est ni suspendu ni refusé (effacée à la réactivation). |
| `twoFactorEnabled` | boolean | non | Vrai si la double authentification est activée sur le compte. |
| `verification` | [AccountVerificationDto](#schema-accountverificationdto) | non | État de vérification du compte. |

### <a id="schema-accountlistdto"></a>AccountListDto

Page de comptes, triés du plus récemment créé au plus ancien, avec le nombre de comptes par statut.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `counts` | object | non | Nombre de comptes par statut, avec les clés approved, under_review, needs_more, suspended et rejected (0 si aucun). Calculé sur tous les comptes qui respectent q, role et profession, sans tenir compte du filtre status ni de la pagination, pour que les onglets restent justes. |
| `items` | [AccountItemDto](#schema-accountitemdto)[] | non | Comptes de la page. |
| `nextCursor` | string | non | Curseur opaque à renvoyer dans le paramètre cursor pour la page suivante ; null sur la dernière page. |

### <a id="schema-accountverificationdto"></a>AccountVerificationDto

État de vérification d'un compte : statut, date d'entrée dans ce statut et retard de traitement.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `overdue` | boolean | non | Vrai si le dossier est under_review depuis plus de 2 jours ouvrés après sa soumission ; faux pour tout autre statut. |
| `since` | string (date-time) | non | Date-heure UTC (ISO 8601) d'entrée dans le statut courant : approbation pour approved, soumission pour under_review, suspension ou refus pour suspended, rejected et closed ; à défaut, dernière mise à jour du compte. |
| `status` | `email_pending` \| `docs_pending` \| `under_review` \| `approved` \| `needs_more` \| `rejected` \| `suspended` \| `closed` | non | Statut : email_pending (e-mail à confirmer), docs_pending (justificatifs à déposer), under_review (dossier soumis, en attente d'un administrateur), approved, needs_more (complément demandé), rejected (dossier refusé), suspended ou closed. |

### <a id="schema-activemedicationdto"></a>ActiveMedicationDto

Médicament en cours.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `dosage` | string | non | Dosage ; null si non saisi. |
| `entryId` | string (uuid) | non | Identifiant de l'entrée médicament. |
| `frequency` | string | non | Fréquence de prise ; null si non saisie. |
| `molecule` | string | non | Molécule. |
| `periodFrom` | string (date) | non | Début de la période de prise AAAA-MM-JJ ; null si non saisi. |
| `periodTo` | string (date) | non | Fin de la période de prise AAAA-MM-JJ ; null si non saisie (traitement en cours). |
| `prescriber` | string | non | Prescripteur ; null si non saisi. |
| `since` | string (date-time) | non | Début de l'entrée (occurred_from), UTC ISO 8601. |

### <a id="schema-activesituationdto"></a>ActiveSituationDto

Situation en cours (occurred_to nul).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `averageIntensity` | number (double) | non | Moyenne des intensités (0 à 10, deux décimales) de ces ressentis ; null s'il n'y en a aucun. |
| `entryId` | string (uuid) | non | Identifiant de l'entrée situation. |
| `linkCount` | integer (int32) | non | Nombre de liens de la situation. |
| `linkedFeelingCount` | integer (int32) | non | Ressentis non archivés reliés par un lien accepté, dans un sens ou l'autre. |
| `since` | string (date-time) | non | Début de la situation (occurred_from), UTC ISO 8601. |
| `title` | string | non | Titre de la situation ; null si elle n'en a pas. |

### <a id="schema-actordto"></a>ActorDto

Administrateur auteur d'un événement du journal.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `displayName` | string | non | Nom d'affichage de l'administrateur. |
| `id` | string (uuid) | non | Identifiant de l'administrateur. |

### <a id="schema-address"></a>Address

Adresse du cabinet. Obligatoire (rue, code postal, ville) sauf si remoteOnly vaut true ; contrôlée par le service, erreurs par champ en 422 VALIDATION_FAILED.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `city` | string | non | Ville (100 caractères au maximum). |
| `postalCode` | string | non | Code postal français à 5 chiffres (POSTAL_CODE_INVALID sinon ; 20 caractères au maximum acceptés en entrée). |
| `street` | string | non | Numéro et nom de la rue (200 caractères au maximum). |

### <a id="schema-addressdto"></a>AddressDto

Adresse du cabinet. En lecture, chaque champ vaut null s'il n'est pas renseigné ; en écriture (PATCH /api/me/professional-info), un champ absent ou null est inchangé et une chaîne vide l'efface.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `city` | string | non | Ville (200 caractères au maximum) ; null si absente. |
| `postalCode` | string | non | Code postal (200 caractères au maximum) ; null si absent. |
| `street` | string | non | Numéro et nom de la rue (200 caractères au maximum) ; null si absent. |

### <a id="schema-adminaddressdto"></a>AdminAddressDto

Adresse professionnelle du praticien, telle que saisie dans son profil.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `city` | string | non | Ville ; null si non renseignée. |
| `postalCode` | string | non | Code postal ; null si non renseigné. |
| `street` | string | non | Numéro et nom de la rue ; null si non renseigné. |

### <a id="schema-admindecisiondto"></a>AdminDecisionDto

Décision enregistrée sur un dossier, avec le nouvel état de vérification.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `adminId` | string (uuid) | non | Identifiant de l'administrateur qui a décidé. |
| `checklist` | object | non | Liste de contrôle enregistrée ; objet vide s'il n'y en avait pas. |
| `decidedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de la décision. |
| `id` | string (uuid) | non | Identifiant de la décision créée. |
| `internalNote` | string | non | Note interne enregistrée (blancs de bord retirés) ; null si absente. |
| `kind` | `approved` \| `needs_more` \| `rejected` | non | Issue enregistrée. |
| `messageToPractitioner` | string | non | Message au praticien enregistré (blancs de bord retirés) ; null si absent. |
| `verificationStatus` | `approved` \| `needs_more` \| `rejected` | non | État de vérification du compte après la décision : approved, needs_more ou rejected. |

### <a id="schema-admindocumentdto"></a>AdminDocumentDto

Justificatif du dossier de vérification d'un praticien. Le contenu ne s'ouvre que par une URL signée (getAdminDocumentUrl).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `id` | string (uuid) | non | Identifiant du justificatif. |
| `issuer` | string | non | Organisme émetteur ; null si non renseigné. |
| `mime` | `application/pdf` \| `image/jpeg` \| `image/png` | non | Type MIME du fichier. |
| `purged` | boolean | non | Vrai si le fichier a été purgé (90 jours après la décision) : il n'est plus téléchargeable (410 ADMIN_DOCUMENT_PURGED), seules les métadonnées restent. |
| `reviewedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de la dernière qualification ; null tant que le justificatif n'a pas été qualifié. |
| `reviewedStatus` | `pending` \| `conform` \| `non_conform` | non | Qualification par l'administration : pending (pas encore examiné), conform ou non_conform. |
| `sizeBytes` | integer (int32) | non | Taille du fichier en octets (10 Mo au plus). |
| `title` | string | non | Intitulé donné par le praticien. |
| `type` | `diploma` \| `registration` \| `certification` \| `professional_card` \| `identity` \| `other` | non | Nature de la pièce. |
| `uploadedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) du dépôt. |
| `year` | integer (int32) | non | Année d'obtention (1950 à 2100) ; null si non renseignée. |

### <a id="schema-adminsignedurldto"></a>AdminSignedUrlDto

URL signée et éphémère pour ouvrir un justificatif.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `expiresAt` | string (date-time) | non | Date-heure UTC (ISO 8601) d'expiration, 5 minutes après l'émission. |
| `url` | string | non | Chemin relatif de l'API (getAdminDocumentFile) avec exp et sig en paramètres de requête ; valable uniquement pour l'administrateur qui l'a demandée. |

### <a id="schema-appealcreateddto"></a>AppealCreatedDto

Recours enregistré.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `id` | string (uuid) | non | Identifiant du recours créé. |
| `status` | string | non | Statut du recours, toujours open à la création. |
| `submittedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) du dépôt. |

### <a id="schema-appealdecisionrequest"></a>AppealDecisionRequest

Décision d'un administrateur sur un recours ouvert.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `messageToPractitioner` | string | oui | Réponse transmise au praticien par e-mail, obligatoire (422 REQUIRED), 4000 caractères au plus (422 TOO_LONG). |
| `outcome` | `accepted` \| `dismissed` | oui | Issue : accepted (le compte est réactivé) ou dismissed (le compte reste inchangé). Autre valeur : 422 INVALID_OUTCOME. |

### <a id="schema-appealitemdto"></a>AppealItemDto

Recours vu par l'administration, avec la décision contestée et l'issue éventuelle.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `decisionAdminId` | string (uuid) | non | Administrateur auteur de la décision contestée ; il ne peut pas examiner le recours (409 APPEAL_SELF_REVIEW). |
| `decisionId` | string (uuid) | non | Identifiant de la décision contestée (dernier refus ou dernière suspension). |
| `decisionKind` | `rejected` \| `suspended` | non | Nature de la décision contestée : rejected (dossier refusé) ou suspended. |
| `id` | string (uuid) | non | Identifiant du recours. |
| `message` | string | non | Message du praticien (20 à 4000 caractères). |
| `outcome` | `accepted` \| `dismissed` | non | Issue : accepted (compte réactivé) ou dismissed (recours écarté) ; null tant que le recours est ouvert. |
| `practitionerDisplayName` | string | non | Nom d'affichage du praticien. |
| `practitionerId` | string (uuid) | non | Identifiant du praticien qui conteste. |
| `responseMessage` | string | non | Réponse de l'administrateur au praticien ; null tant que le recours est ouvert. |
| `reviewedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de l'examen ; null tant que le recours est ouvert. |
| `reviewedBy` | string (uuid) | non | Administrateur qui a examiné le recours ; null tant que le recours est ouvert. |
| `submittedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) du dépôt. |

### <a id="schema-appeallistdto"></a>AppealListDto

Page de recours.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `items` | [AppealItemDto](#schema-appealitemdto)[] | non | Recours de la page : du plus ancien au plus récent pour status=open, du plus récent au plus ancien pour decided et all. |
| `nextCursor` | string | non | Curseur opaque à renvoyer dans le paramètre cursor pour la page suivante ; null sur la dernière page. |

### <a id="schema-appealotprequireddto"></a>AppealOtpRequiredDto

Corps du 202 : le mot de passe est correct, la double authentification est active et le code est absent ; rien n'a été enregistré, renvoyer la demande avec otp.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `otpRequired` | boolean | non | Toujours vrai. |

### <a id="schema-appealrequest"></a>AppealRequest

Dépôt d'un recours par un praticien dont le compte est refusé ou suspendu. Public : le praticien s'identifie par son e-mail et son mot de passe dans le corps, car il n'a pas de session.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `email` | string | oui | Adresse e-mail du compte (insensible à la casse). |
| `message` | string | oui | Argumentaire du recours, de 20 à 4000 caractères après suppression des blancs de bord. Erreurs 422 : REQUIRED, TOO_SHORT, TOO_LONG. |
| `otp` | string | non | Code à usage unique de la double authentification (ou code de secours) ; obligatoire si la 2FA est active, sinon la réponse est 202 avec otpRequired. Facultatif sinon. |
| `password` | string | oui | Mot de passe du compte. |

### <a id="schema-appealsummarydto"></a>AppealSummaryDto

Résumé d'un recours déposé par le praticien, dans le détail de son compte.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `decisionId` | string (uuid) | non | Identifiant de la décision (refus ou suspension) contestée. |
| `id` | string (uuid) | non | Identifiant du recours. |
| `message` | string | non | Message du praticien (20 à 4000 caractères). |
| `outcome` | `accepted` \| `dismissed` | non | Issue : accepted (compte réactivé) ou dismissed (recours écarté) ; null tant que le recours est ouvert. |
| `responseMessage` | string | non | Réponse de l'administrateur au praticien ; null tant que le recours est ouvert. |
| `reviewedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de l'examen ; null tant que le recours est ouvert. |
| `submittedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) du dépôt du recours. |

### <a id="schema-card"></a>Card

Fiche résumée d'un praticien publié dans les résultats de recherche (sans coordonnées).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `audiences` | string[] | non | Codes de publics accueillis (référentiel GET /api/vocabulary/directory). Liste vide si aucun. |
| `availability` | `accepting` \| `waitlist` \| `closed` \| `unknown` | non | Disponibilité : accepting (accepte de nouveaux patients), waitlist (liste d'attente), closed (complet), unknown (non renseignée). |
| `bioExcerpt` | string | non | Début de la présentation, 200 caractères au plus, coupé au dernier mot et suivi de « … » s'il est tronqué ; null si le praticien n'en a pas. |
| `city` | string | non | Ville ; null si non renseignée. |
| `displayName` | string | non | Nom affiché. |
| `distanceKm` | number (double) | non | Distance en kilomètres au point lat/lng de la recherche, arrondie au dixième ; null sans lat et lng. |
| `languages` | string[] | non | Langues de consultation, codes ISO 639-1. Liste vide si aucune. |
| `modalities` | string[] | non | Modalités de consultation : in_person, video, home. Liste vide si aucune. |
| `photoUrl` | string | non | URL de la photo ; null (aucune route publique ne sert encore les photos). |
| `profession` | string | non | Profession : psychologist, psychiatrist ou coach. |
| `slug` | string | non | Adresse publique du praticien, à passer à la fiche détaillée. |
| `specialties` | string[] | non | Codes de spécialités (référentiel GET /api/vocabulary/directory). Liste vide si aucune. |
| `titleLabel` | string | non | Intitulé libre affiché sous le nom ; null si vide. |
| `verified` | boolean | non | true si le dossier du praticien est approuvé par l'administration (badge vérifié). |

### <a id="schema-changelinktyperequest"></a>ChangeLinkTypeRequest

Nouveau type d'un lien existant ; les extrémités ne changent pas.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `linkType` | string | oui | Code du nouveau type de lien, parmi ceux de GET /api/vocabulary/link-types ; il doit être autorisé pour le couple de types des deux entrées et différent du type actuel (sinon 409 LINK_EXISTS). |

### <a id="schema-closesessionrequest"></a>CloseSessionRequest

Clôture d'une séance ouverte. authorType et submissionId sont refusés (UNKNOWN_FIELD).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `durationMin` | integer (int32) | non | Durée de la séance en minutes, de 1 à 600 (OUT_OF_RANGE sinon). Absente : la durée par défaut du praticien, sinon 60 minutes. |
| `summary` | string | non | Compte rendu de la séance, texte libre. Vide ou absent : aucun compte rendu. |

### <a id="schema-consents"></a>Consents

Consentements obligatoires à l'inscription : les deux doivent valoir true (422 INVALID_FIELD sinon). Ils sont consignés dans le journal de sécurité.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `privacy` | boolean | oui | Acceptation de la politique de confidentialité ; true exigé. |
| `terms` | boolean | oui | Acceptation des conditions générales d'utilisation ; true exigé. |

### <a id="schema-contactdto"></a>ContactDto

Coordonnées professionnelles du praticien, vues par l'administration.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | [AdminAddressDto](#schema-adminaddressdto) | non | Adresse du cabinet ; ses champs sont null si non renseignés. |
| `phone` | string | non | Téléphone professionnel ; null si non renseigné. |
| `professionalNumber` | string | non | Numéro professionnel (RPPS, ADELI ou équivalent) ; null si non renseigné. |
| `remoteOnly` | boolean | non | Vrai si le praticien exerce uniquement à distance. |

### <a id="schema-createemotionrequest"></a>CreateEmotionRequest

Création d'une émotion personnalisée.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `family` | `joy` \| `trust` \| `fear` \| `surprise` \| `sadness` \| `disgust` \| `anger` \| `anticipation` | oui | Famille de la roue de Plutchik où ranger l'émotion ; obligatoire. |
| `labelFr` | string | oui | Libellé français ; obligatoire, non vide. Doit être distinct, sans casse ni accents, de tout libellé d'émotion globale et de ses autres émotions personnalisées (409 EMOTION_LABEL_EXISTS sinon). |

### <a id="schema-createentryrequest"></a>CreateEntryRequest

Création d'une entrée. Champs minimaux par type : note = body ; event = title ; situation = title et occurred.from ; feeling = feeling.emotionCode et feeling.intensity ; medication = medication.molecule ; session = session.modality. Un bloc de détail d'un autre type est refusé (DETAIL_NOT_ALLOWED). authorType et submissionId sont refusés (UNKNOWN_FIELD). Un corps de type session démarre une séance (une seule ouverte à la fois).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `body` | string | non | Texte (obligatoire pour note). Refusé pour une séance (NOT_ALLOWED_ON_CREATE) : le compte rendu se donne à la clôture. |
| `feeling` | [EntryFeelingRequest](#schema-entryfeelingrequest) | non | Détail du ressenti, pour le type feeling uniquement. |
| `links` | [EntryLinkRequest](#schema-entrylinkrequest)[] | non | Liens à poser avec l'entrée, 20 au plus (OUT_OF_RANGE au-delà), tout ou rien : un lien refusé annule la création. Refusé pour une séance (NOT_ALLOWED_ON_CREATE). |
| `medication` | [EntryMedicationRequest](#schema-entrymedicationrequest) | non | Détail du médicament, pour le type medication uniquement. |
| `occurred` | [EntryOccurredRequest](#schema-entryoccurredrequest) | non | Moment auquel l'entrée a eu lieu. Absent : l'instant de saisie (obligatoire pour une situation). |
| `session` | [EntrySessionRequest](#schema-entrysessionrequest) | non | Détail de la séance, pour le type session uniquement. |
| `sessionId` | string (uuid) | non | Séance de rattachement, qui doit être une séance de ce patient (SESSION_INVALID sinon). Absent : la séance courante du patient (SESSION_REQUIRED s'il n'en a aucune). Interdit pour une séance (SESSION_NOT_ALLOWED). |
| `status` | `draft` \| `final` | non | Statut : draft ou final (défaut final). Autre valeur : INVALID_VALUE. Ignoré pour une séance, toujours finale. |
| `tags` | string[] | non | Libellés de tags existants du praticien (UNKNOWN_TAG sur tags[i] sinon). Refusé pour une séance (NOT_ALLOWED_ON_CREATE). |
| `title` | string | non | Titre (obligatoire pour event et situation). Refusé pour une séance (NOT_ALLOWED_ON_CREATE). |
| `type` | `note` \| `event` \| `situation` \| `feeling` \| `session` \| `medication` | oui | Type de l'entrée. Obligatoire (REQUIRED). |
| `visibility` | `private` \| `clinical` | non | Visibilité : private ou clinical (défaut clinical). Autre valeur : INVALID_VALUE. |

### <a id="schema-createlinkrequest"></a>CreateLinkRequest

Lien à poser entre l'entrée de l'URL et une autre entrée du même patient. La provenance (manual) et le statut (accepted) ne s'envoient pas.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `direction` | `outgoing` \| `incoming` | non | Place de l'entrée de l'URL dans le lien : outgoing = elle est la source et targetId la cible ; incoming = targetId est la source et elle est la cible. Défaut : outgoing. |
| `linkType` | string | oui | Code du type de lien, parmi ceux de GET /api/vocabulary/link-types (par exemple triggers, caused_by, worsens, relieves, co_occurs, follows, part_of, treats). Le type doit être autorisé pour le couple (type de l'entrée source, type de l'entrée cible). |
| `rationale` | string | non | Justification libre du lien, 500 caractères au plus ; espaces de début et de fin retirés, vide traité comme absent. Optionnelle. |
| `targetId` | string (uuid) | oui | Identifiant de l'autre entrée à lier ; elle doit être du même patient, non archivée et différente de l'entrée de l'URL. |

### <a id="schema-createpatientrequest"></a>CreatePatientRequest

Création d'un patient dans le cabinet du praticien connecté.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `birthDate` | string (date) | non | Date de naissance AAAA-MM-JJ ; doit être passée et de moins de 120 ans (422 VALIDATION_FAILED sinon). |
| `context` | object | non | Contexte de vie : objet JSON libre ; null = objet vide. |
| `displayName` | string | oui | Nom affiché ; obligatoire, non vide après suppression des espaces. |
| `email` | string | non | Adresse e-mail, texte libre ; vide ou null = non renseignée. |
| `firstName` | string | non | Prénom ; vide ou null = non renseigné. |
| `flags` | [FlagRequest](#schema-flagrequest)[] | non | Drapeaux à poser dès la création ; un seul par nature (409 FLAG_ALREADY_ACTIVE sinon) ; null = aucun. |
| `followUp` | object | non | Cadre du suivi : objet JSON libre ; null = objet vide. |
| `lastName` | string | non | Nom de famille ; vide ou null = non renseigné. |
| `phone` | string | non | Téléphone, texte libre ; vide ou null = non renseigné. |
| `pronoun` | string | non | Pronom d'adresse libre ; vide ou null = non renseigné. |
| `tags` | string[] | non | Libellés de tags existants à associer (mêmes règles que PUT /api/patients/{id}/tags) ; null = aucun. |

### <a id="schema-createrequest"></a>CreateRequest

Nouvelle entrée du vocabulaire de l'annuaire (spécialité ou public).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | oui | Code stable de l'entrée, unique pour le type : commence par une lettre minuscule, puis minuscules, chiffres et underscores, 2 à 40 caractères. Ne change plus ensuite. |
| `kind` | `specialty` \| `audience` | oui | Type de l'entrée : specialty (spécialité) ou audience (public). |
| `labelEn` | string | non | Libellé anglais, 120 caractères au plus ; vide ou absent : pas de libellé anglais. |
| `labelFr` | string | oui | Libellé français, 120 caractères au plus. |
| `sortOrder` | integer (int32) | non | Rang d'affichage dans le type, de 0 à 32767 ; absent : après le dernier du type. |

### <a id="schema-decisiondto"></a>DecisionDto

Décision de l'administration accompagnée d'un message au praticien. La note interne de l'administrateur n'est jamais exposée.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `decidedAt` | string (date-time) | non | Date-heure de la décision, en UTC. |
| `kind` | `approved` \| `needs_more` \| `rejected` \| `suspended` \| `reactivated` \| `appeal_accepted` \| `appeal_rejected` \| `report_resolved` | non | Nature de la décision : approved = dossier approuvé, needs_more = pièces complémentaires demandées, rejected = dossier refusé, suspended = compte suspendu, reactivated = compte réactivé, appeal_accepted = recours accepté, appeal_rejected = recours refusé, report_resolved = signalement traité. |
| `message` | string | non | Message de l'administrateur au praticien. |

### <a id="schema-decisionitemdto"></a>DecisionItemDto

Décision ou acte d'administration enregistré sur un compte (historique append-only, renvoyé du plus récent au plus ancien).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `adminId` | string (uuid) | non | Identifiant de l'administrateur auteur de la décision. |
| `checklist` | object | non | Liste de contrôle libre saisie avec la décision (clés et valeurs JSON). Pour les actes de gestion de compte, contient les statuts avant et après (previousStatus, newStatus) ou la décision contestée (decisionId) ; objet vide s'il n'y en a pas. |
| `decidedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de la décision. |
| `id` | string (uuid) | non | Identifiant de la décision. |
| `internalNote` | string | non | Note interne de l'administration, jamais transmise au praticien ; null si absente. |
| `kind` | `approved` \| `needs_more` \| `rejected` \| `suspended` \| `reactivated` \| `appeal_accepted` \| `appeal_rejected` \| `report_resolved` | non | Nature de l'acte : approved, needs_more, rejected (vérification du dossier), suspended, reactivated (gestion du compte), appeal_accepted, appeal_rejected (recours), report_resolved (réservé, jamais produit en V1). |
| `messageToPractitioner` | string | non | Message transmis au praticien (complément demandé, motif du refus ou de la suspension, réponse au recours) ; null s'il n'y en a pas (par exemple une approbation sans message). |

### <a id="schema-decisionrequest"></a>DecisionRequest

Décision de l'administrateur sur un dossier en cours d'examen.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `checklist` | object | non | Liste de contrôle libre (clés et valeurs JSON), 20 000 caractères au plus une fois sérialisée (422 TOO_LARGE) ; absent = objet vide. |
| `force` | boolean | non | Pour approved uniquement : vrai pour approuver même si tous les justificatifs ne sont pas conformes ; une note interne est alors obligatoire. Absent = faux. |
| `internalNote` | string | non | Note interne, jamais transmise au praticien, 4000 caractères au plus ; obligatoire pour approved avec force=true (422 NOTE_REQUIRED). |
| `kind` | `approved` \| `needs_more` \| `rejected` | oui | Issue : approved (dossier validé), needs_more (complément demandé) ou rejected (dossier refusé). |
| `messageToPractitioner` | string | non | Message envoyé au praticien par e-mail ; obligatoire pour needs_more et rejected (422 MESSAGE_REQUIRED), 4000 caractères au plus ; facultatif pour approved. |

### <a id="schema-directoryvocabularydto"></a>DirectoryVocabularyDto

Listes fermées de l'annuaire. Seules les entrées actives sont rendues, dans l'ordre d'affichage.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `audiences` | [Item](#schema-item)[] | non | Publics accueillis actifs, par rang puis libellé français (liste administrable) : par exemple adults, young_adults, adolescents, children, couples_families. |
| `languages` | [Item](#schema-item)[] | non | Langues proposées par défaut (15 codes ISO 639-1, triées par libellé français) ; tout autre code ISO 639-1 reste accepté dans le profil. |
| `modalities` | [Item](#schema-item)[] | non | Modalités de consultation, liste fixe : in_person (au cabinet), video (en visio), home (à domicile). |
| `specialties` | [Item](#schema-item)[] | non | Spécialités actives, par rang puis libellé français (liste administrable). |

### <a id="schema-documentdto"></a>DocumentDto

Justificatif déposé dans le dossier professionnel. Aucune clé de stockage ni empreinte n'est exposée ; le fichier se lit via GET /api/me/verification/documents/{id}/url.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `id` | string (uuid) | non | Identifiant du justificatif. |
| `issuer` | string | non | Établissement ou organisme émetteur ; null si non renseigné. |
| `mime` | `application/pdf` \| `image/jpeg` \| `image/png` | non | Type MIME détecté par signature du fichier (jamais d'après l'extension). L'image est ré-encodée sans métadonnées, le PDF est conservé tel quel. |
| `purged` | boolean | non | true si le fichier a été purgé du stockage (90 jours après la décision) : les métadonnées restent, mais l'URL et le fichier répondent 410 DOCUMENT_PURGED. |
| `reviewedStatus` | `pending` \| `conform` \| `non_conform` | non | Résultat de l'examen du justificatif par l'administration : pending = pas encore examiné, conform = conforme, non_conform = non conforme. |
| `sizeBytes` | integer (int32) | non | Taille du fichier stocké, en octets (10 Mo au maximum). |
| `title` | string | non | Intitulé saisi par le praticien (200 caractères au maximum). |
| `type` | `diploma` \| `registration` \| `certification` \| `professional_card` \| `identity` \| `other` | non | Nature du justificatif : diploma = diplôme, registration = attestation d'inscription (ADELI ou RPPS), certification = certification (coach), professional_card = carte professionnelle, identity = pièce d'identité, other = autre pièce. Un diplôme et une pièce d'identité sont obligatoires pour soumettre le dossier. |
| `uploadedAt` | string (date-time) | non | Date-heure du dépôt, en UTC. |
| `year` | integer (int32) | non | Année d'obtention, de 1950 à 2100 ; null si non renseignée. |

### <a id="schema-dossierdto"></a>DossierDto

Dossier complet d'un praticien pour la vérification : identité, coordonnées, justificatifs et historique des décisions. Aucune donnée patient.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `contact` | [ContactDto](#schema-contactdto) | non | Coordonnées professionnelles. |
| `createdAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de création du compte. |
| `decisions` | [DecisionItemDto](#schema-decisionitemdto)[] | non | Historique des décisions sur ce compte, du plus récent au plus ancien. |
| `displayName` | string | non | Nom d'affichage. |
| `documents` | [AdminDocumentDto](#schema-admindocumentdto)[] | non | Justificatifs de vérification non retirés par le praticien, du plus ancien au plus récent. |
| `email` | string | non | Adresse e-mail de connexion. |
| `emailConfirmedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de confirmation de l'e-mail ; null si non confirmé. |
| `firstName` | string | non | Prénom. |
| `lastName` | string | non | Nom de famille. |
| `locale` | string | non | Langue de l'interface du praticien (code ISO 639-1). |
| `overdue` | boolean | non | Vrai si le dossier est under_review depuis plus de 2 jours ouvrés après submittedAt. |
| `practitionerId` | string (uuid) | non | Identifiant du praticien. |
| `profession` | `psychologist` \| `psychiatrist` \| `coach` | non | Profession déclarée. |
| `submittedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de la dernière soumission du dossier ; null si aucune soumission n'est journalisée. |
| `verificationStatus` | `email_pending` \| `docs_pending` \| `under_review` \| `approved` \| `needs_more` \| `rejected` \| `suspended` \| `closed` | non | État de vérification du compte : email_pending, docs_pending, under_review, approved, needs_more, rejected, suspended ou closed. |
| `verifiedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de la dernière approbation ; null si le dossier n'a jamais été approuvé. |

### <a id="schema-draftsdto"></a>DraftsDto

Brouillons et séance ouverte.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `count` | integer (int32) | non | Nombre d'entrées en brouillon non archivées. |
| `openSession` | [OpenSessionDto](#schema-opensessiondto) | non | Séance non clôturée la plus récente ; null s'il n'y en a pas. |

### <a id="schema-emailchangerequest"></a>EmailChangeRequest

Correction de l'adresse e-mail d'un compte non confirmé ; le mot de passe prouve l'identité de l'appelant (aucune session).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `email` | string | oui | Adresse e-mail actuelle du compte (254 caractères au maximum). |
| `newEmail` | string (email) | oui | Nouvelle adresse e-mail qui recevra le lien de confirmation (254 caractères au maximum). |
| `password` | string | oui | Mot de passe actuel du compte (200 caractères au maximum). |

### <a id="schema-emailconfirmrequest"></a>EmailConfirmRequest

Jeton de confirmation d'adresse e-mail reçu par e-mail.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `token` | string | oui | Jeton à usage unique reçu dans l'e-mail de confirmation, valable 24 h (200 caractères au maximum). |

### <a id="schema-emailresendrequest"></a>EmailResendRequest

Demande de renvoi de l'e-mail de confirmation.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `email` | string (email) | oui | Adresse e-mail du compte non confirmé (254 caractères au maximum). |

### <a id="schema-emotionview"></a>EmotionView

Émotion utilisable dans un ressenti : globale (catalogue du produit, 29 émotions) ou personnalisée par le praticien connecté.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `active` | boolean | non | true si l'émotion peut être choisie. Les listes ne renvoient que des émotions actives ; une personnalisée fusionnée devient inactive jusqu'à l'annulation de la fusion. |
| `code` | string | non | Code stable de l'émotion : mot anglais en minuscules pour une globale (anxiety, joy…), « c_ » suivi de 8 caractères hexadécimaux pour une personnalisée. |
| `family` | `joy` \| `trust` \| `fear` \| `surprise` \| `sadness` \| `disgust` \| `anger` \| `anticipation` | non | Famille de la roue de Plutchik à laquelle l'émotion est rattachée. |
| `intensityLevel` | integer (int32) | non | Niveau d'intensité lexicale Plutchik : 1 faible, 2 moyen, 3 fort. Null pour les ajouts cliniques (anxiety, guilt, shame, emptiness, calm) et pour les émotions personnalisées. |
| `labelEn` | string | non | Libellé anglais ; null pour une émotion personnalisée (saisie en français seulement). |
| `labelFr` | string | non | Libellé français affiché. |
| `scope` | `global` \| `custom` | non | Portée : global = catalogue du produit, custom = créée par le praticien. |

### <a id="schema-emotionsdto"></a>EmotionsDto

Émotions dominantes de la fenêtre.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `top` | [TopEmotionDto](#schema-topemotiondto)[] | non | 5 émotions au plus, par nombre de ressentis décroissant puis par code ; liste vide sans ressenti dans la fenêtre. |

### <a id="schema-entrydto"></a>EntryDto

Entrée clinique complète (version courante, détail selon le type, tags). Une entrée archivée reste lisible : archivedAt est alors renseigné. Les liens se lisent par GET /api/entries/{id}/links ; seule la réponse de création les porte dans links.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `archivedAt` | string (date-time) | non | Instant d'archivage UTC. Null si l'entrée n'est pas archivée. |
| `authorType` | `practitioner` | non | Provenance de l'entrée. Lecture seule : vaut toujours practitioner en V1, jamais acceptée en écriture (422 UNKNOWN_FIELD). |
| `body` | string | non | Texte de la version courante. Null si la version n'en a pas. |
| `feeling` | [EntryFeelingDto](#schema-entryfeelingdto) | non | Détail du ressenti. Renseigné pour le type feeling, null sinon. |
| `id` | string (uuid) | non | Identifiant de l'entrée. |
| `linkCount` | integer (int32) | non | Nombre de liens acceptés portant sur l'entrée. |
| `links` | [EntryLinkDto](#schema-entrylinkdto)[] | non | Liens posés à la création, dans leur sens réel. Renseigné uniquement dans la réponse 201 de POST /api/patients/{id}/entries (liste vide si aucun lien demandé) ; null partout ailleurs (utiliser GET /api/entries/{id}/links). |
| `medication` | [EntryMedicationDto](#schema-entrymedicationdto) | non | Détail du médicament. Renseigné pour le type medication, null sinon. |
| `occurred` | [EntryOccurredDto](#schema-entryoccurreddto) | non | Moment auquel l'entrée a eu lieu, avec sa précision. |
| `patientId` | string (uuid) | non | Identifiant du patient du dossier. |
| `recordedAt` | string (date-time) | non | Instant d'enregistrement de l'entrée, UTC ISO 8601. |
| `session` | [EntrySessionDto](#schema-entrysessiondto) | non | Détail de la séance. Renseigné pour le type session, null sinon. |
| `sessionId` | string (uuid) | non | Identifiant de la séance à laquelle l'entrée appartient. Null pour une séance (une séance n'est rattachée à aucune séance). |
| `status` | `draft` \| `final` | non | Statut : draft = brouillon ; final = définitive. L'archivage n'est pas un statut, il est porté par archivedAt. |
| `tags` | string[] | non | Libellés des tags actifs de l'entrée, triés sans tenir compte de la casse. Liste vide s'il n'y en a pas. |
| `title` | string | non | Titre de la version courante. Null si la version n'en a pas. |
| `type` | `note` \| `event` \| `situation` \| `feeling` \| `session` \| `medication` | non | Type de l'entrée. |
| `version` | integer (int32) | non | Numéro de la version courante, à partir de 1. Incrémenté à chaque correction hors fenêtre de grâce de 1 h 15. |
| `visibility` | `private` \| `clinical` | non | Visibilité : private = visible du seul praticien auteur, exclue de l'export ; clinical = partagée avec l'équipe clinique. |

### <a id="schema-entryfeelingdto"></a>EntryFeelingDto

Détail d'un ressenti (type feeling).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `arousal` | integer (int32) | non | Activation (arousal) copiée de l'émotion au moment de la saisie. Null si l'émotion n'en a pas. Jamais fournie par l'appelant. |
| `emotionCode` | string | non | Code de l'émotion, issu du catalogue de vocabulaire du praticien. |
| `family` | string | non | Famille de l'émotion d'après le catalogue : joy, trust, fear, surprise, sadness, disgust, anger ou anticipation. Null si elle est inconnue. |
| `intensity` | integer (int32) | non | Intensité du ressenti, de 0 à 10. |
| `valence` | integer (int32) | non | Valence copiée de l'émotion au moment de la saisie. Null si l'émotion n'en a pas. Jamais fournie par l'appelant. |

### <a id="schema-entryfeelingrequest"></a>EntryFeelingRequest

Détail d'un ressenti. À la création, les deux champs sont obligatoires pour le type feeling. En PATCH, un champ absent est conservé.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `emotionCode` | string | non | Code d'une émotion active du catalogue du praticien. Inconnu : UNKNOWN_EMOTION sur feeling.emotionCode. |
| `intensity` | integer (int32) | non | Intensité du ressenti, de 0 à 10 (OUT_OF_RANGE sinon). |

### <a id="schema-entrylinkdto"></a>EntryLinkDto

Lien accepté posé avec une nouvelle entrée, dans son sens réel (source vers cible).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `id` | string (uuid) | non | Identifiant du lien. |
| `label` | string | non | Verbe du lien vu depuis la nouvelle entrée : libellé inverse si elle est la cible d'un type dirigé. En anglais si Accept-Language vaut en, en français sinon. |
| `linkType` | string | non | Code du type de lien. |
| `sourceId` | string (uuid) | non | Entrée source du lien. |
| `targetId` | string (uuid) | non | Entrée cible du lien. |

### <a id="schema-entrylinkrequest"></a>EntryLinkRequest

Lien à poser avec une nouvelle entrée, accepté en même temps qu'elle (tout ou rien).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `direction` | `outgoing` \| `incoming` | non | Sens vu depuis la nouvelle entrée : outgoing (défaut) = elle est la source ; incoming = elle est la cible. Autre valeur : INVALID_VALUE. |
| `linkType` | string | non | Code du type de lien. Obligatoire (REQUIRED). Inconnu : UNKNOWN_LINK_TYPE ; non permis pour ce couple d'entrées : LINK_TYPE_NOT_ALLOWED (la réponse porte alors allowedLinkTypes). |
| `targetId` | string (uuid) | non | Entrée à lier. Obligatoire (REQUIRED). |

### <a id="schema-entrymedicationdto"></a>EntryMedicationDto

Détail d'un médicament (type medication).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `dosage` | string | non | Posologie, texte libre. |
| `frequency` | string | non | Fréquence de prise, texte libre. |
| `molecule` | string | non | Molécule ou nom du médicament. |
| `periodFrom` | string (date) | non | Début de la période de prise, date ISO 8601 (AAAA-MM-JJ). |
| `periodTo` | string (date) | non | Fin de la période de prise, date ISO 8601 (AAAA-MM-JJ). Null si en cours. |
| `prescriber` | string | non | Prescripteur, texte libre. |

### <a id="schema-entrymedicationrequest"></a>EntryMedicationRequest

Détail d'un médicament. À la création, molecule est obligatoire pour le type medication. En PATCH, un champ absent est conservé.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `dosage` | string | non | Posologie, texte libre. |
| `frequency` | string | non | Fréquence de prise, texte libre. |
| `molecule` | string | non | Molécule ou nom du médicament. |
| `periodFrom` | string (date) | non | Début de la période de prise, date ISO 8601 (AAAA-MM-JJ). |
| `periodTo` | string (date) | non | Fin de la période de prise, date ISO 8601 (AAAA-MM-JJ). |
| `prescriber` | string | non | Prescripteur, texte libre. |

### <a id="schema-entryoccurreddto"></a>EntryOccurredDto

Moment auquel l'entrée a eu lieu, avec sa précision. Les bornes sont en UTC. Pour une précision autre qu'exact, les bornes sont celles de la période désignée (jour, mois, année entiers).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `from` | string (date-time) | non | Début de l'occurrence, date-heure UTC ISO 8601. |
| `label` | string | non | Libellé de la période ou de la phase de vie (precision period ou life_phase). Null sinon. |
| `precision` | `exact` \| `day` \| `month` \| `year` \| `period` \| `life_phase` | non | Précision de la date : exact = date-heure connue ; day = jour connu ; month = mois connu ; year = année connue ; period = période libre avec libellé ; life_phase = phase de vie (bornes déduites de la date de naissance du patient). |
| `to` | string (date-time) | non | Fin de l'occurrence, date-heure UTC ISO 8601. Null pour une situation en cours (sans fin). |

### <a id="schema-entryoccurredrequest"></a>EntryOccurredRequest

Moment auquel l'entrée a eu lieu. Remplacé en entier lors d'un PATCH. Absent à la création : l'instant de saisie est utilisé (sauf pour une situation, où il est obligatoire).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `from` | string (date-time) | non | Début de l'occurrence, date-heure UTC ISO 8601. Obligatoire (REQUIRED) sauf pour la précision life_phase. |
| `label` | string | non | Libellé de la période (precision period) ou de la phase de vie (precision life_phase). |
| `precision` | `exact` \| `day` \| `month` \| `year` \| `period` \| `life_phase` | non | Précision de la date : exact (défaut) = date-heure connue ; day = jour connu ; month = mois connu ; year = année connue ; period = période libre (libellé obligatoire) ; life_phase = phase de vie reconnue par son libellé (enfance), bornes déduites de la date de naissance du patient. Toute autre valeur : INVALID_VALUE sur occurred.precision. |
| `to` | string (date-time) | non | Fin de l'occurrence, date-heure UTC ISO 8601, jamais avant from (INVALID_TIME sur occurred.to). Absente : pour une situation, elle est en cours ; pour les autres types, égale à from (la précision period exige une fin). |

### <a id="schema-entrysearchemotionfacetdto"></a>EntrySearchEmotionFacetDto

Facette par émotion (ressentis).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non | Code de l'émotion. |
| `count` | integer (int32) | non | Nombre de résultats exacts portant cette émotion. |
| `label` | string | non | Libellé français de l'émotion. |

### <a id="schema-entrysearchfacetsdto"></a>EntrySearchFacetsDto

Compteurs sur les résultats exacts, triés par effectif décroissant ; chaque facette ignore son propre filtre pour que les puces gardent leur compteur.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `emotions` | [EntrySearchEmotionFacetDto](#schema-entrysearchemotionfacetdto)[] | non | Répartition par émotion. |
| `tags` | [EntrySearchTagFacetDto](#schema-entrysearchtagfacetdto)[] | non | Répartition par tag. |
| `types` | [EntrySearchTypeFacetDto](#schema-entrysearchtypefacetdto)[] | non | Répartition par type d'entrée. |

### <a id="schema-entrysearchitemdto"></a>EntrySearchItemDto

Une entrée trouvée. title et snippet sont des fragments HTML échappés ; seule la balise mark y est ajoutée, autour des mots trouvés.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `approximate` | boolean | non | true pour un résultat approché (tolérance aux fautes de frappe), false pour un résultat exact. |
| `archivedAt` | string (date-time) | non | Date-heure d'archivage, UTC ISO 8601 ; null si l'entrée n'est pas archivée (toujours null sans includeArchived). |
| `emotionCode` | string | non | Code de l'émotion pour un ressenti, null pour les autres types. |
| `entryId` | string (uuid) | non | Identifiant de l'entrée. |
| `occurredFrom` | string (date-time) | non | Début de l'événement concerné (occurred_from), UTC ISO 8601. |
| `occurredPrecision` | `exact` \| `day` \| `month` \| `year` \| `period` \| `life_phase` | non | Précision de la date : exact = date-heure connue, day = jour connu, month = mois connu, year = année connue, period = période, life_phase = phase de vie. |
| `occurredTo` | string (date-time) | non | Fin de l'événement concerné (occurred_to), UTC ISO 8601 ; null si ponctuel ou en cours. |
| `rank` | number (double) | non | Pertinence (ts_rank_cd, multipliée par 1,5 pour les entrées de moins de 90 jours) ; null pour un résultat approché ou une recherche sans texte. |
| `sessionId` | string (uuid) | non | Identifiant de la séance de rattachement ; null pour une entrée de type session (une séance n'est rattachée à aucune séance). |
| `similarity` | number (double) | non | Similarité trigramme de 0 à 1 (seuil 0,3) ; null pour un résultat exact. |
| `snippet` | string | non | Extrait du corps en HTML échappé, mots trouvés entourés de mark (sans texte de recherche : début du corps, 200 caractères au plus, « … » si tronqué) ; null si l'entrée n'a pas de corps. |
| `tags` | string[] | non | Libellés des tags de l'entrée, triés ; liste vide si aucun. |
| `title` | string | non | Titre de la version courante en HTML échappé, mots trouvés entourés de mark si la recherche a un texte ; null si l'entrée n'a pas de titre. |
| `type` | `note` \| `event` \| `situation` \| `feeling` \| `session` \| `medication` | non | Code du type d'entrée. |
| `version` | integer (int32) | non | Numéro de la version courante de l'entrée. |
| `visibility` | `private` \| `clinical` | non | Visibilité : private = réservée à son auteur, clinical = dossier clinique. |

### <a id="schema-entrysearchquerydto"></a>EntrySearchQueryDto

Requête telle que le serveur l'a interprétée à partir du paramètre q.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `after` | string (date-time) | non | Borne inclusive déduite de après: / after: (premier instant suivant la période, UTC ISO 8601) ; null sans jeton. |
| `before` | string (date-time) | non | Borne exclusive déduite de avant: / before: (début de la période, UTC ISO 8601) ; null sans jeton. |
| `emotions` | string[] | non | Valeurs des jetons émotion: / emotion: de q (hors paramètre emotions). |
| `tags` | string[] | non | Valeurs des jetons tag: de q (hors paramètre tags). |
| `text` | string | non | Texte libre restant après retrait des jetons (tag:, émotion:, avant:, après:) ; chaîne vide s'il n'en reste pas (recherche sans texte). |

### <a id="schema-entrysearchresultdto"></a>EntrySearchResultDto

Page de résultats d'une recherche : entrées, facettes et requête interprétée. Pagination par numéro de page (20 par page), non par curseur.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `approximateCount` | integer (int32) | non | Nombre de résultats approchés dans items (page 1 seulement, et seulement s'il y a moins de 3 résultats exacts, avec un texte sans exclusion -mot ; 0 sinon). |
| `exactCount` | integer (int32) | non | Nombre de résultats exacts dans items. |
| `facets` | [EntrySearchFacetsDto](#schema-entrysearchfacetsdto) | non | Facettes calculées sur les résultats exacts. |
| `items` | [EntrySearchItemDto](#schema-entrysearchitemdto)[] | non | Résultats de la page : exacts d'abord (par pertinence, puis date décroissante), puis approchés (par similarité). Sans texte : par date décroissante. |
| `page` | integer (int32) | non | Numéro de la page renvoyée, à partir de 1. |
| `pageSize` | integer (int32) | non | Taille de page, fixe : 20. |
| `query` | [EntrySearchQueryDto](#schema-entrysearchquerydto) | non | Requête telle que le serveur l'a interprétée. |
| `tookMs` | integer (int64) | non | Durée de traitement côté serveur, en millisecondes. |
| `total` | integer (int64) | non | Nombre total de résultats exacts sur toutes les pages, hors résultats approchés. |

### <a id="schema-entrysearchtagfacetdto"></a>EntrySearchTagFacetDto

Facette par tag.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `count` | integer (int32) | non | Nombre de résultats exacts portant ce tag. |
| `id` | string (uuid) | non | Identifiant du tag. |
| `label` | string | non | Libellé du tag. |

### <a id="schema-entrysearchtypefacetdto"></a>EntrySearchTypeFacetDto

Facette par type d'entrée.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | `note` \| `event` \| `situation` \| `feeling` \| `session` \| `medication` | non | Code du type d'entrée. |
| `count` | integer (int32) | non | Nombre de résultats exacts de ce type. |

### <a id="schema-entrysessiondto"></a>EntrySessionDto

Détail d'une séance (type session).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `closedAt` | string (date-time) | non | Instant de clôture UTC. Null tant que la séance est ouverte. |
| `durationMin` | integer (int32) | non | Durée en minutes (1 à 600). Null tant que la séance n'est pas clôturée, ou si le contact n'en a pas. |
| `kind` | `intake` \| `session` \| `contact` | non | Genre de séance : intake = séance d'accueil créée avec le patient ; session = séance ordinaire ; contact = contact hors rendez-vous (téléphone, e-mail) consigné après coup. |
| `modality` | `in_person` \| `video` \| `phone` \| `email` | non | Modalité de la séance. |

### <a id="schema-entrysessionrequest"></a>EntrySessionRequest

Détail d'une séance. À la création d'une entrée de type session, seule la modalité est acceptée (la durée se donne à la clôture : NOT_ALLOWED_ON_CREATE sur session.durationMin). En PATCH, un champ absent est conservé ; le genre et la clôture ne se modifient pas.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `durationMin` | integer (int32) | non | Durée en minutes, de 1 à 600 (OUT_OF_RANGE sinon). |
| `modality` | `in_person` \| `video` \| `phone` \| `email` | non | Modalité de la séance (obligatoire pour le type session). |

### <a id="schema-entrytypeview"></a>EntryTypeView

Type d'entrée clinique du catalogue (six types en V1 : note, event, situation, feeling, session, medication).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | `note` \| `event` \| `situation` \| `feeling` \| `session` \| `medication` | non | Code stable du type d'entrée. |
| `detailTable` | string | non | Nom de la table de détail propre au type (entry_feeling, entry_session, entry_medication) ; null pour les types sans détail (note, event, situation). |
| `hasDuration` | boolean | non | true si le type porte une durée (situation, session, medication), false sinon. |
| `labelEn` | string | non | Libellé anglais. |
| `labelFr` | string | non | Libellé français affiché. |
| `sortOrder` | integer (int32) | non | Rang d'affichage, croissant ; la liste est déjà triée dans cet ordre. |

### <a id="schema-entryversiondto"></a>EntryVersionDto

Une version d'une entrée. La liste est ordonnée de la plus récente à la plus ancienne.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `authorId` | string (uuid) | non | Identifiant du praticien auteur de cette version. |
| `authorType` | `practitioner` | non | Provenance de l'entrée. Lecture seule : vaut toujours practitioner en V1. |
| `body` | string | non | Texte de cette version. Null s'il n'y en a pas. |
| `createdAt` | string (date-time) | non | Instant de création de la version, UTC ISO 8601. |
| `reason` | string | non | Motif de la correction (champ reason du PATCH). Null pour la version 1 ou si aucun motif n'a été donné. |
| `title` | string | non | Titre de cette version. Null s'il n'y en a pas. |
| `version` | integer (int32) | non | Numéro de la version, à partir de 1. |

### <a id="schema-expandgraphrequest"></a>ExpandGraphRequest

Groupe à développer : exactement un de superNodeId et memberIds (422 INVALID_VALUE sinon).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `memberIds` | string (uuid)[] | non | Identifiants des entrées à rendre : 1 à 500, sans doublon, toutes non archivées et du patient de l'URL. Exclusif avec superNodeId. |
| `superNodeId` | string | non | Identifiant d'un super-nœud reçu dans superNodes, de la forme sn:{neighborId}:{type d'entrée}. Exclusif avec memberIds. |

### <a id="schema-exportrequesteddto"></a>ExportRequestedDto

Réponse 202 : export asynchrone mis en file.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `jobId` | string (uuid) | non | Identifiant du job d'export. |
| `statusUrl` | string | non | URL relative de suivi (GET), qui porte un jeton token valable sans session. À interroger jusqu'à ce que status vaille done ou failed. |

### <a id="schema-exportstatusdto"></a>ExportStatusDto

Statut d'un export de compte.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `downloadUrl` | string | non | URL relative signée du fichier zip (GET /api/me/export/{jobId}/file avec exp et sig). Renseignée seulement quand le job est terminé et le lien non expiré, null sinon. |
| `error` | string | non | Message d'erreur, renseigné seulement quand status vaut failed. |
| `expiresAt` | string (date-time) | non | Échéance du lien de téléchargement, 7 jours après la fin. Null tant que le job n'est pas terminé. |
| `finishedAt` | string (date-time) | non | Instant de fin du job, UTC ISO 8601. Null tant qu'il n'est pas fini. |
| `jobId` | string (uuid) | non | Identifiant du job d'export. |
| `requestedAt` | string (date-time) | non | Instant de la demande, UTC ISO 8601. |
| `status` | `queued` \| `running` \| `done` \| `failed` | non | État du job : queued = en attente ; running = en cours de génération ; done = terminé, fichier téléchargeable tant que le lien n'a pas expiré ; failed = échec (voir error). |

### <a id="schema-facetcount"></a>FacetCount

Nombre de résultats pour une valeur d'une facette.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non | Valeur de la facette : code de profession, de modalité, de public ou de langue. |
| `count` | integer (int64) | non | Nombre de fiches du lot filtré qui ont cette valeur. |

### <a id="schema-facets"></a>Facets

Facettes calculées sur le lot filtré (500 fiches au plus), chacune triée par nombre décroissant.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `audiences` | [FacetCount](#schema-facetcount)[] | non | Répartition par public accueilli. |
| `languages` | [FacetCount](#schema-facetcount)[] | non | Répartition par langue (ISO 639-1). |
| `modalities` | [FacetCount](#schema-facetcount)[] | non | Répartition par modalité (in_person, video, home). |
| `professions` | [FacetCount](#schema-facetcount)[] | non | Répartition par profession (psychologist, psychiatrist, coach). |

### <a id="schema-feelingpointdto"></a>FeelingPointDto

Un ressenti : une valeur par point.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `at` | string (date-time) | non | Début du ressenti (occurred_from), UTC ISO 8601. |
| `date` | string (date) | non | Jour UTC de placement du point, AAAA-MM-JJ : le jour du ressenti, ou le milieu de la période pour un ressenti imprécis, plafonné à aujourd'hui. |
| `emotionCode` | string | non | Code de l'émotion ressentie. |
| `entryId` | string (uuid) | non | Identifiant de l'entrée ressenti. |
| `family` | string | non | Famille de l'émotion (joy, trust, fear, surprise, sadness, disgust, anger, anticipation) ; null si l'émotion n'est plus au catalogue. |
| `intensity` | integer (int32) | non | Intensité du ressenti, de 0 à 10. |
| `sessionId` | string (uuid) | non | Identifiant de la séance de rattachement. |
| `valence` | integer (int32) | non | Valence de l'émotion, de -2 (très négative) à 2 (très positive) ; null si inconnue. |

### <a id="schema-feelingseriesdto"></a>FeelingSeriesDto

Série de la courbe : une émotion de la fenêtre.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `count` | integer (int32) | non | Nombre de ressentis de cette émotion dans la fenêtre. |
| `emotionCode` | string | non | Code de l'émotion. |
| `family` | string | non | Famille de l'émotion ; null si elle n'est plus au catalogue. |
| `label` | string | non | Libellé français. |
| `labelEn` | string | non | Libellé anglais ; null s'il n'existe pas. |

### <a id="schema-feelingsdto"></a>FeelingsDto

Ressentis réels de la fenêtre, repères de médicament et jours de séance.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `markers` | [TrendMarkerDto](#schema-trendmarkerdto)[] | non | Repères de médicament (début, fin) de la fenêtre. |
| `points` | [FeelingPointDto](#schema-feelingpointdto)[] | non | Exactement un point par ressenti non archivé de la fenêtre, hors phases de vie (précision life_phase), du plus ancien au plus récent. |
| `series` | [FeelingSeriesDto](#schema-feelingseriesdto)[] | non | Une série par émotion présente dans la fenêtre, par nombre de ressentis décroissant puis par code. |
| `ticks` | string (date)[] | non | Jours UTC des séances de la fenêtre, croissants, sans doublon (AAAA-MM-JJ). |

### <a id="schema-fieldproblem"></a>FieldProblem

Une erreur de champ dans errors[] (422, 400 de paramètre, 409 ENTRY_ARCHIVED des liens).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non | Code stable de l'erreur de champ, à tester par le client : INVALID_FIELD, REQUIRED, OUT_OF_RANGE, TOO_LONG, UNKNOWN_EMOTION… (liste sur chaque opération). Absent dans les modules patients, vocabulary (tags, émotions) et directory (profil, annuaire public, contact), dont les erreurs de champ ne portent que field et message. |
| `field` | string | oui | Chemin du champ fautif dans le corps envoyé (notation pointée pour les objets imbriqués, ex. feeling.emotionCode) ; chaîne vide si l'erreur ne vise aucun champ précis. |
| `message` | string | oui | Message lisible, dans la langue d'Accept-Language (français par défaut). |

### <a id="schema-flagdto"></a>FlagDto

Drapeau actif posé sur un patient (point d'attention clinique). Un drapeau levé n'est plus renvoyé.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `kind` | `watch` \| `risk` \| `shared_care` | non | Nature du drapeau : watch = à surveiller (une raison est alors obligatoire), risk = risque, shared_care = suivi partagé avec un autre professionnel. |
| `reason` | string | non | Raison saisie par le praticien ; toujours renseignée pour watch, null pour risk et shared_care quand aucune raison n'a été saisie. |
| `setAt` | string (date-time) | non | Date-heure de pose du drapeau, UTC ISO 8601. |

### <a id="schema-flagrequest"></a>FlagRequest

Drapeau à poser sur un patient (à la création ou via POST /flags).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `kind` | `watch` \| `risk` \| `shared_care` | oui | Nature du drapeau : watch = à surveiller, risk = risque, shared_care = suivi partagé. Toute autre valeur est refusée (422 VALIDATION_FAILED). |
| `reason` | string | non | Raison libre ; obligatoire (non vide) pour watch, facultative pour risk et shared_care. |

### <a id="schema-graphdto"></a>GraphDto

Graphe d'un patient : au plus 150 nœuds (500 pour un développement par expand), leurs arêtes et les groupes de nœuds regroupés.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `edges` | [GraphEdgeDto](#schema-graphedgedto)[] | non | Liens acceptés dont les deux extrémités sont des nœuds rendus (pour un expand : les liens incidents à au moins un membre). |
| `nodes` | [GraphNodeDto](#schema-graphnodedto)[] | non | Nœuds rendus, des plus proches de la racine aux plus éloignés, puis par degré décroissant, date de début décroissante et identifiant. |
| `superNodes` | [GraphSuperNodeDto](#schema-graphsupernodedto)[] | non | Groupes de nœuds regroupés en remplacement de leurs membres ; vide si rien n'a été regroupé, et toujours vide pour un expand. |
| `truncated` | boolean | non | true si le graphe est incomplet : des nœuds ont été regroupés en super-nœuds ou retirés pour tenir en 150 nœuds (500 pour un expand). |

### <a id="schema-graphedgedto"></a>GraphEdgeDto

Arête du graphe : un lien accepté entre deux nœuds rendus.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `directed` | boolean | non | true si le type est dirigé (flèche de source vers cible) ; false pour un type symétrique comme co_occurs, dont le sens est sans signification. |
| `id` | string (uuid) | non | Identifiant du lien. |
| `linkType` | string | non | Code du type de lien (triggers, caused_by, worsens, relieves, co_occurs, follows, part_of, treats), référentiel GET /api/vocabulary/link-types. |
| `provenance` | string | non | Origine du lien : manual en V1 (ai_suggested et ai_confirmed sont réservés à l'IA, V2). |
| `source` | string (uuid) | non | Identifiant de l'entrée source du lien. |
| `status` | string | non | Statut du lien : toujours accepted dans un graphe (les autres statuts n'y figurent pas). |
| `target` | string (uuid) | non | Identifiant de l'entrée cible du lien. |

### <a id="schema-graphnodedto"></a>GraphNodeDto

Nœud du graphe : une entrée non archivée du patient.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `authorType` | `practitioner` | non | Auteur de l'entrée : toujours practitioner en V1. Lecture seule, jamais accepté en écriture. |
| `degree` | integer (int32) | non | Nombre de liens acceptés de l'entrée dans tout le dossier du patient, pas seulement dans le graphe rendu. |
| `distance` | integer (int32) | non | Distance à la racine en nombre de liens : 0 pour la racine, 1 pour tous les nœuds d'un graphe sans racine et pour les membres d'un expand. |
| `emotion` | string | non | Code de l'émotion (référentiel GET /api/vocabulary/emotions) ; null sauf pour un ressenti (feeling). |
| `id` | string (uuid) | non | Identifiant de l'entrée. |
| `intensity` | integer (int32) | non | Intensité de 0 à 10 ; null sauf pour un ressenti (feeling). |
| `occurred` | string (date-time) | non | Début de l'occurrence de l'entrée (occurred.from), ISO 8601 UTC ; null si l'entrée n'a pas de date. |
| `title` | string | non | Titre de l'entrée ; null si elle n'en a pas. |
| `type` | string | non | Code du type d'entrée : note, event, situation, feeling, session ou medication (référentiel GET /api/vocabulary/entry-types). |

### <a id="schema-graphsupernodedto"></a>GraphSuperNodeDto

Super-nœud : regroupement de nœuds de degré 1 d'un même type d'entrée reliés au même voisin, rendu à la place de ses membres quand le graphe dépasse 150 nœuds.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `count` | integer (int32) | non | Nombre de nœuds regroupés (au moins 2). |
| `dominantEmotion` | string | non | Code de l'émotion la plus fréquente parmi les membres (ordre alphabétique à égalité) ; null si aucun membre n'a d'émotion. |
| `id` | string | non | Identifiant du groupe, de la forme sn:{neighborId}:{type d'entrée} ; à renvoyer tel quel dans superNodeId de POST /api/patients/{id}/graph/expand. |
| `memberIds` | string (uuid)[] | non | Identifiants des entrées regroupées, triés par ordre croissant. |
| `neighborId` | string (uuid) | non | Identifiant de l'entrée voisine, rendue dans nodes, à laquelle le groupe est relié. |
| `type` | string | non | Code du type d'entrée commun à tous les membres. |

### <a id="schema-item"></a>Item

Entrée d'une liste fermée de l'annuaire, avec ses libellés fr et en.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non | Code stable à envoyer dans le profil ou dans les filtres de recherche (minuscules et underscores, ou code de langue ISO 639-1). |
| `labelEn` | string | non | Libellé en anglais ; peut être null pour une entrée ajoutée sans. |
| `labelFr` | string | non | Libellé en français. |

### <a id="schema-itemdto"></a>ItemDto

Entrée du vocabulaire de l'annuaire, active ou non.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `active` | boolean | non | true si l'entrée est proposée dans l'annuaire ; false si désactivée (invisible dans GET /api/vocabulary/directory et refusée dans les profils). |
| `code` | string | non | Code stable de l'entrée, unique pour le type. |
| `kind` | `specialty` \| `audience` | non | Type de l'entrée : specialty (spécialité) ou audience (public). |
| `labelEn` | string | non | Libellé anglais ; null s'il n'y en a pas. |
| `labelFr` | string | non | Libellé français. |
| `sortOrder` | integer (int32) | non | Rang d'affichage dans le type, de 0 à 32767. |
| `usedByPublishedProfiles` | integer (int32) | non | Nombre de fiches publiées qui utilisent ce code ; tant qu'il est supérieur à 0, l'entrée ne peut pas être désactivée. |

### <a id="schema-journaldto"></a>JournalDto

Page du journal d'administration, des plus récents aux plus anciens.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `items` | [JournalItemDto](#schema-journalitemdto)[] | non | Lignes du journal de la page. |
| `nextCursor` | string | non | Curseur opaque à renvoyer dans le paramètre cursor pour la page suivante ; null sur la dernière page. |

### <a id="schema-journalitemdto"></a>JournalItemDto

Ligne du journal d'administration : une décision ou un événement de sécurité. Jamais d'adresse IP ni de donnée patient.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `actor` | [ActorDto](#schema-actordto) | non | Administrateur auteur de l'acte ; null si l'événement n'est pas l'acte d'un administrateur (praticien lui-même ou système). |
| `actorType` | `admin` \| `practitioner` \| `system` | non | Nature de l'auteur : admin (un administrateur a agi), practitioner (le compte concerné lui-même) ou system (ni l'un ni l'autre). |
| `at` | string (date-time) | non | Date-heure UTC (ISO 8601) de l'événement. |
| `details` | object | non | Détails structurés de l'événement (clés et valeurs JSON variables selon kind, par exemple reason, previousStatus, newStatus, decisionId, appealId) ; objet vide s'il n'y en a pas. |
| `id` | string (uuid) | non | Identifiant de la ligne. |
| `kind` | string | non | Type d'événement, en minuscules avec points ou soulignés. Les décisions apparaissent sous admin.<kind> (admin.approved, admin.suspended, admin.appeal_accepted…), les événements de sécurité sous leur propre nom (admin.decision, admin.suspend, admin.reactivate, admin.appeal, admin.document_read, appeal.submitted, verification_submitted, session_revoked, login_failed, locked…). |
| `practitionerDisplayName` | string | non | Nom d'affichage du compte concerné ; null si practitionerId est null. |
| `practitionerId` | string (uuid) | non | Identifiant du compte concerné ; null si l'événement n'est rattaché à aucun compte. |
| `source` | `security_event` \| `verification_decision` | non | Table d'origine de la ligne : security_event (événement de sécurité) ou verification_decision (décision d'administration). |
| `summary` | string | non | Résumé lisible : le champ summary des détails s'il existe, sinon le message de la décision, sinon le type d'événement. |

### <a id="schema-linkdto"></a>LinkDto

Lien entre deux entrées d'un même patient, vu depuis une entrée de référence (l'entrée de l'URL ; la source du lien pour un changement de type).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `authorId` | string (uuid) | non | Identifiant du praticien qui a posé le lien ; null pour une suggestion de l'IA (V2, jamais en V1). |
| `createdAt` | string (date-time) | non | Date de création du lien, ISO 8601 UTC. |
| `id` | string (uuid) | non | Identifiant du lien. |
| `label` | string | non | Verbe du lien vu depuis l'entrée de référence, dans la langue de la requête : le libellé direct si elle est la source, le libellé inverse si elle est la cible d'un type dirigé (par exemple « déclenche » ou « déclenché par »). |
| `linkType` | string | non | Code du type de lien (triggers, caused_by, worsens, relieves, co_occurs, follows, part_of, treats). Toujours le code du sens source vers cible, jamais un type passif. |
| `provenance` | string | non | Origine du lien : manual (posé par le praticien), seule valeur produite en V1. Valeurs réservées à l'IA (V2) : ai_suggested, ai_confirmed. |
| `rationale` | string | non | Justification saisie à la pose du lien ; null si aucune. |
| `sentence` | string | non | Phrase lisible « entrée verbe autre entrée » vue depuis l'entrée de référence, dans la langue de la requête ; chaque entrée y est désignée par son titre, sinon par un extrait de 60 caractères de son texte, sinon par « une entrée ». |
| `sourceId` | string (uuid) | non | Identifiant de l'entrée source du lien. |
| `status` | string | non | Statut du lien : accepted (lien actif), seule valeur rendue en V1. Valeurs réservées : proposed et rejected (suggestions de l'IA, V2), superseded (lien remplacé ou supprimé, jamais rendu par cette API). |
| `targetId` | string (uuid) | non | Identifiant de l'entrée cible du lien. |

### <a id="schema-linktypeview"></a>LinkTypeView

Type de lien entre deux entrées (huit types), avec la matrice des types d'entrée admis en source et en cible.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `allowedSourceTypes` | string[] | non | Codes des types d'entrée (voir /api/vocabulary/entry-types) admis comme source du lien. |
| `allowedTargetTypes` | string[] | non | Codes des types d'entrée admis comme cible du lien. |
| `code` | `triggers` \| `caused_by` \| `worsens` \| `relieves` \| `co_occurs` \| `follows` \| `part_of` \| `treats` | non | Code stable du type de lien. |
| `directed` | boolean | non | true si le lien a un sens (source vers cible) ; false si symétrique (co_occurs). |
| `inverseLabelEn` | string | non | Libellé anglais vu depuis l'entrée cible ; null si non orienté. |
| `inverseLabelFr` | string | non | Libellé français vu depuis l'entrée cible ; null si le lien n'est pas orienté. |
| `labelEn` | string | non | Libellé anglais vu depuis l'entrée source. |
| `labelFr` | string | non | Libellé français vu depuis l'entrée source. |
| `lineStyle` | `solid` \| `long_dash` \| `short_dash` \| `dotted` \| `thin` \| `double` | non | Style de trait conseillé pour le graphe. |
| `sortOrder` | integer (int32) | non | Rang d'affichage, croissant ; la liste est déjà triée dans cet ordre. |

### <a id="schema-listdto"></a>ListDto

Entrées du vocabulaire de l'annuaire.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `items` | [ItemDto](#schema-itemdto)[] | non | Entrées, actives ou non, par type puis rang puis libellé français quand les deux types sont listés. |

### <a id="schema-loginrequest"></a>LoginRequest

Identifiants de connexion ; otp seulement si la 2FA est active.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `email` | string | oui | Adresse e-mail du compte (254 caractères au maximum). |
| `otp` | string | non | Code TOTP à 6 chiffres ou code de secours (32 caractères au maximum). À envoyer seulement si la 2FA est active ; s'il manque, la réponse est 202 otpRequired. |
| `password` | string | oui | Mot de passe du compte (200 caractères au maximum). |
| `rememberMe` | boolean | non | true pour une session de 30 jours (cookie persistant) au lieu de 12 h d'inactivité. Absent = false. |

### <a id="schema-meresponse"></a>MeResponse

Praticien connecté, tel qu'ouvert par la session.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `displayName` | string | non | Nom affiché (précédé de Dr pour un psychiatre). |
| `email` | string | non | Adresse e-mail du compte. |
| `id` | string (uuid) | non | Identifiant du praticien. |
| `profession` | `psychologist` \| `psychiatrist` \| `coach` | non | Profession : psychologist, psychiatrist ou coach. |
| `tenantId` | string (uuid) | non | Identifiant du cabinet (tenant) du praticien ; toutes ses données y sont rattachées. |
| `verificationStatus` | `email_pending` \| `docs_pending` \| `under_review` \| `approved` \| `needs_more` \| `rejected` \| `suspended` \| `closed` | non | Statut de vérification du praticien lors de l'ouverture de la session : email_pending, docs_pending, under_review, approved, needs_more, rejected, suspended ou closed (GET /api/auth/session le relit à jour). |

### <a id="schema-mergeemotionrequest"></a>MergeEmotionRequest

Cible d'une fusion d'émotions.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetCode` | string | oui | Code de l'émotion active qui absorbe la source : une émotion globale ou une autre émotion personnalisée du praticien. Obligatoire, différent de la source. |

### <a id="schema-mergetagrequest"></a>MergeTagRequest

Cible d'une fusion de tags.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetId` | string (uuid) | oui | Identifiant du tag actif du praticien qui absorbe le tag source ; obligatoire, différent de la source. |

### <a id="schema-mergeview"></a>MergeView

Fusion d'une émotion personnalisée dans une autre, annulable pendant 30 jours.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `affectedCount` | integer (int32) | non | Nombre de ressentis dont l'émotion est passée de la source à la cible. |
| `id` | string (uuid) | non | Identifiant de la fusion, à fournir pour l'annuler. |
| `mergedAt` | string (date-time) | non | Date-heure de la fusion, UTC ISO 8601. |
| `sourceCode` | string | non | Code de l'émotion personnalisée absorbée (désormais inactive). |
| `targetCode` | string | non | Code de l'émotion qui a absorbé la source. |
| `undoUntil` | string (date-time) | non | Date-heure limite d'annulation (30 jours après la fusion), UTC ISO 8601. |
| `undoneAt` | string (date-time) | non | Date-heure de l'annulation, UTC ISO 8601 ; null tant que la fusion n'a pas été annulée. |

### <a id="schema-narrativedto"></a>NarrativeDto

Résumé rédigé par règles (jusqu'à 5 phrases, chacune omise si ses données manquent, sans IA), dans la langue de la requête (Accept-Language : français par défaut, anglais si demandé).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `attention` | string | non | Point d'attention issu des drapeaux actifs ; null sans drapeau. Le mot « risque » n'apparaît jamais. |
| `sentences` | string[] | non | Phrases dans l'ordre : cadre du suivi, tendance, situations ouvertes, événement non commenté, traitement en cours ; chacune est omise si ses données manquent (liste éventuellement vide). |

### <a id="schema-opensessiondto"></a>OpenSessionDto

Séance ouverte (non clôturée).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `entryId` | string (uuid) | non | Identifiant de l'entrée séance. |
| `startedAt` | string (date-time) | non | Début de la séance (occurred_from), UTC ISO 8601. |

### <a id="schema-otprequireddto"></a>OtpRequiredDto

Réponse 202 sans job créé : le mot de passe est correct, la double authentification est active et aucun code n'a été fourni. Renvoyer la même requête avec otp.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `otpRequired` | boolean | non | Toujours vrai : un code de double authentification est requis. |

### <a id="schema-otprequiredresponse"></a>OtpRequiredResponse

Réponse 202 : le mot de passe est correct, la double authentification est active et le code manque. Renvoyer la même requête avec le champ otp.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `otpRequired` | boolean | non | Toujours true. |

### <a id="schema-overviewdto"></a>OverviewDto

Synthèse clinique d'un patient pour une fenêtre (30d, 90d ou 12m) : faits clés, situations actives, tendance, émotions dominantes, ressentis, brouillons, activité récente, résumé rédigé et séances récentes.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `activeSituations` | [ActiveSituationDto](#schema-activesituationdto)[] | non | Situations en cours (sans fin connue), triées par nombre de liens décroissant ; liste vide s'il n'y en a pas. |
| `computedAt` | string (date-time) | non | Date-heure du calcul de la projection, UTC ISO 8601 (jamais d'un jour UTC antérieur à aujourd'hui). |
| `drafts` | [DraftsDto](#schema-draftsdto) | non | Brouillons en attente et séance ouverte. |
| `emotions` | [EmotionsDto](#schema-emotionsdto) | non | Émotions dominantes de la fenêtre. |
| `facts` | [OverviewFactsDto](#schema-overviewfactsdto) | non | Faits clés du dossier, indépendants de la fenêtre. |
| `feelings` | [FeelingsDto](#schema-feelingsdto) | non | Ressentis réels de la fenêtre : un point par ressenti, une série par émotion. |
| `narrative` | [NarrativeDto](#schema-narrativedto) | non | Résumé « En bref » rédigé par règles (sans IA), dans la langue d'Accept-Language. |
| `recentActivity` | [RecentActivityItemDto](#schema-recentactivityitemdto)[] | non | 10 dernières entrées non archivées saisies ou corrigées, de la plus récente à la plus ancienne, lues en direct (hors projection) ; entrées privées incluses. |
| `recentSessions` | [RecentSessionDto](#schema-recentsessiondto)[] | non | 5 dernières séances non archivées, de la plus récente à la plus ancienne ; la plus récente porte son compte rendu entier. |
| `sinceLastSession` | [SinceLastSessionDto](#schema-sincelastsessiondto) | non | Entrées saisies depuis la dernière séance clôturée. |
| `sourceRev` | integer (int64) | non | Révision du dossier (patient.clinical_rev) au moment du calcul : compteur croissant, utile pour détecter un changement. |
| `trend` | [TrendDto](#schema-trenddto) | non | Courbe d'intensité et repères de la fenêtre. |
| `window` | `30d` \| `90d` \| `12m` | non | Fenêtre appliquée à trend, emotions et feelings. |

### <a id="schema-overviewfactsdto"></a>OverviewFactsDto

Faits clés du patient.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `activeMedications` | [ActiveMedicationDto](#schema-activemedicationdto)[] | non | Médicaments en cours (fin ni connue ni passée), une ligne par molécule, du plus récent au plus ancien ; liste vide s'il n'y en a pas. |
| `age` | integer (int32) | non | Âge en années révolues aujourd'hui ; null si la date de naissance n'est pas renseignée. |
| `flags` | [OverviewFlagDto](#schema-overviewflagdto)[] | non | Drapeaux actifs (non levés), du plus ancien au plus récent. |
| `followedSince` | string (date) | non | Date de début du suivi AAAA-MM-JJ : follow_up.since de la fiche si elle est valide, sinon la date de création du dossier. |
| `sessionCount` | integer (int32) | non | Nombre de séances non archivées. |

### <a id="schema-overviewflagdto"></a>OverviewFlagDto

Drapeau actif posé à la main sur le dossier.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `kind` | `watch` \| `risk` \| `shared_care` | non | Nature : watch = à surveiller, risk = risque, shared_care = suivi partagé. |
| `reason` | string | non | Raison saisie ; null si aucune (toujours renseignée pour watch). |
| `setAt` | string (date-time) | non | Date-heure de pose, UTC ISO 8601. |

### <a id="schema-passwordchangerequest"></a>PasswordChangeRequest

Changement de mot de passe sans session : e-mail et mot de passe actuel prouvent l'identité (compte de bootstrap à mot de passe à usage unique, ou changement volontaire). otp seulement si la 2FA est active.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `currentPassword` | string | oui | Mot de passe actuel (200 caractères au maximum). |
| `email` | string | oui | Adresse e-mail du compte (254 caractères au maximum). |
| `newPassword` | string | oui | Nouveau mot de passe (200 caractères au maximum) : politique de mot de passe, différent de l'actuel (422 PASSWORD_POLICY ou PASSWORD_UNCHANGED). |
| `otp` | string | non | Code TOTP à 6 chiffres ou code de secours (32 caractères au maximum), requis si la 2FA est active ; s'il manque, la réponse est 202 otpRequired. |

### <a id="schema-passwordresetconfirmrequest"></a>PasswordResetConfirmRequest

Nouveau mot de passe choisi à partir du lien de réinitialisation.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `password` | string | oui | Nouveau mot de passe (200 caractères au maximum), soumis à la politique de mot de passe (422 PASSWORD_POLICY sinon ; le jeton n'est alors pas consommé). |
| `token` | string | oui | Jeton à usage unique reçu par e-mail, valable 30 minutes (200 caractères au maximum). |

### <a id="schema-passwordresetrequest"></a>PasswordResetRequest

Demande d'envoi d'un lien de réinitialisation du mot de passe.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `email` | string (email) | oui | Adresse e-mail du compte (254 caractères au maximum). |

### <a id="schema-patchentryrequest"></a>PatchEntryRequest

Correction partielle d'une entrée : un champ absent est inchangé ; occurred et tags sont remplacés en entier ; un bloc de détail est fusionné champ par champ avec le détail courant et doit correspondre au type de l'entrée (DETAIL_NOT_ALLOWED sinon). Dans la fenêtre de grâce de 1 h 15 la modification est faite en place, sinon elle crée une nouvelle version. Le type ne se modifie pas. authorType et submissionId sont refusés (UNKNOWN_FIELD), links aussi (NOT_SUPPORTED_ON_PATCH).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `body` | string | non | Nouveau texte. Une note ne peut pas perdre son texte (REQUIRED). |
| `feeling` | [EntryFeelingRequest](#schema-entryfeelingrequest) | non | Détail du ressenti à fusionner (entrée de type feeling). |
| `medication` | [EntryMedicationRequest](#schema-entrymedicationrequest) | non | Détail du médicament à fusionner (entrée de type medication). |
| `occurred` | [EntryOccurredRequest](#schema-entryoccurredrequest) | non | Nouveau moment de l'entrée, remplacé en entier. |
| `reason` | string | non | Motif de la correction, conservé sur la nouvelle version. Sans effet quand la modification est faite en place pendant la fenêtre de grâce. |
| `session` | [EntrySessionRequest](#schema-entrysessionrequest) | non | Détail de la séance à fusionner (entrée de type session). |
| `status` | `draft` \| `final` | non | Nouveau statut : draft ou final. Autre valeur : INVALID_VALUE. |
| `tags` | string[] | non | Nouveaux libellés de tags, remplaçant la liste actuelle (UNKNOWN_TAG sur tags[i] si un libellé n'existe pas). Un changement de tags seul ne crée jamais de version. |
| `title` | string | non | Nouveau titre. Un event ou une situation ne peut pas perdre son titre (REQUIRED). |
| `visibility` | `private` \| `clinical` | non | Nouvelle visibilité : private ou clinical. Autre valeur : INVALID_VALUE. |

### <a id="schema-patchrequest"></a>PatchRequest

Modification partielle d'une entrée : un champ absent reste inchangé. Le code et le type ne se modifient pas.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `active` | boolean | non | false pour désactiver l'entrée (409 VOCABULARY_IN_USE si une fiche publiée l'utilise), true pour la réactiver. |
| `labelEn` | string | non | Nouveau libellé anglais, 120 caractères au plus ; chaîne vide : efface le libellé anglais. |
| `labelFr` | string | non | Nouveau libellé français, non vide, 120 caractères au plus. |
| `sortOrder` | integer (int32) | non | Nouveau rang d'affichage dans le type, de 0 à 32767. |

### <a id="schema-patientdto"></a>PatientDto

Fiche d'un patient du praticien connecté, avec ses drapeaux actifs et ses tags. Chaque modification par PATCH incrémente currentVersion et archive un instantané consultable via GET /api/patients/{id}/versions.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `archivedAt` | string (date-time) | non | Date-heure d'archivage, UTC ISO 8601 ; null tant que le patient est actif. |
| `birthDate` | string (date) | non | Date de naissance AAAA-MM-JJ ; null si non renseignée. Passée et de moins de 120 ans. |
| `context` | object | non | Contexte de vie du patient : objet JSON libre dont les clés et valeurs sont définies par le client (par exemple activity). Objet vide si rien n'est renseigné. |
| `createdAt` | string (date-time) | non | Date-heure de création, UTC ISO 8601. |
| `currentVersion` | integer (int32) | non | Numéro de la version courante de la fiche : 1 à la création, +1 à chaque modification par PATCH. |
| `displayName` | string | non | Nom affiché dans toute l'application (obligatoire, espaces de bord retirés). |
| `email` | string | non | Adresse e-mail, texte libre ; null si non renseignée. |
| `firstName` | string | non | Prénom ; null si non renseigné. |
| `flags` | [FlagDto](#schema-flagdto)[] | non | Drapeaux actifs, du plus ancien au plus récent ; liste vide si aucun. |
| `followUp` | object | non | Cadre du suivi : objet JSON libre dont les clés et valeurs sont définies par le client (par exemple rhythm). Objet vide si rien n'est renseigné. |
| `id` | string (uuid) | non | Identifiant du patient. |
| `lastName` | string | non | Nom de famille ; null si non renseigné. |
| `phone` | string | non | Téléphone, texte libre ; null si non renseigné. |
| `pronoun` | string | non | Pronom d'adresse libre ; null si non renseigné. |
| `tags` | [TagDto](#schema-tagdto)[] | non | Tags du patient ; liste vide si aucun. |
| `updatedAt` | string (date-time) | non | Date-heure de dernière modification, UTC ISO 8601. |

### <a id="schema-patientpage"></a>PatientPage

Page de patients, paginée par curseur opaque.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `items` | [PatientDto](#schema-patientdto)[] | non | Patients de la page, dans l'ordre du paramètre sort. |
| `nextCursor` | string | non | Curseur opaque à renvoyer tel quel dans le paramètre cursor pour obtenir la page suivante ; null sur la dernière page. |

### <a id="schema-preferences"></a>Preferences

Préférences à plat du compte : 9 clés connues, aux noms pointés (par exemple "overview.view"), sans objet imbriqué. En lecture, les 9 clés sont toujours présentes (valeur enregistrée, sinon défaut selon la profession). En PATCH, toutes les clés sont optionnelles : null remet la clé à son défaut, une clé inconnue est ignorée.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `entries.defaultVisibility` | `clinical` \| `private` | non | Visibilité proposée par défaut pour une nouvelle entrée : clinical = clinique, private = privée. Défaut : clinical. |
| `entryTypes.medicationVisible` | boolean | non | true si le type d'entrée « médication » est proposé à la saisie. Défaut : true pour un psychiatre, false sinon. |
| `locale` | `fr` \| `en` | non | Langue de l'interface : fr (français) ou en (anglais). Défaut : fr. |
| `overview.view` | `simple` \| `complete` | non | Vue d'ensemble du dossier : simple = version condensée, complete = version détaillée. Défaut : simple. |
| `overview.window` | `30d` \| `90d` \| `12m` | non | Fenêtre de temps de la vue d'ensemble : 30d = 30 jours, 90d = 90 jours, 12m = 12 mois. Défaut : 90d. |
| `sessions.defaultDurationMin` | integer (int32) | non | Durée proposée par défaut pour une séance, en minutes (entier de 15 à 180). Défaut : 60. |
| `theme` | `light` \| `soft` \| `dark` \| `system` | non | Thème visuel de l'application : light = clair, soft = doux, dark = sombre, system = celui du système. Défaut : light. |
| `timeline.groupBy` | `session` \| `month` \| `chronological` | non | Regroupement de la chronologie : session = par séance, month = par mois, chronological = liste chronologique sans regroupement. Défaut : session. |
| `vocabulary.subjectLabel` | `patient` \| `client` | non | Mot employé pour désigner la personne suivie : patient ou client. Défaut : client pour un coach, patient sinon. |

### <a id="schema-problemdetail"></a>ProblemDetail

Corps de toute réponse d'erreur (application/problem+json, RFC 9457). Les champs type, title, status, detail et code sont toujours présents ; errors[] et les champs complémentaires (retryAfterSeconds, existingLinkId, allowedLinkTypes, missing, pendingDocuments, usedByPublishedProfiles, suggestedEmotion) seulement pour les codes indiqués.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `allowedLinkTypes` | object[] | non | Types de lien autorisés pour ce couple d'entrées ; présent quand le code de champ est LINK_TYPE_NOT_ALLOWED. Objets {code, label} sur les routes de liens (POST /api/entries/{id}/links, PATCH /api/links/{id}) ; simples codes (chaînes) dans le 422 de POST /api/patients/{id}/entries. |
| `code` | string | oui | Code d'erreur stable, en MAJUSCULES_SOULIGNÉES, indépendant de la langue : c'est lui que le client teste. Codes transverses dans la description générale, codes métier sur chaque opération. |
| `detail` | string | oui | Explication lisible destinée à l'utilisateur ; générique pour les erreurs 5xx (jamais de message interne). |
| `errors` | [FieldProblem](#schema-fieldproblem)[] | non | Erreurs par champ ; présentes sur les 422 (VALIDATION_FAILED ou code métier de champ comme SESSION_REQUIRED), sur les 400 de paramètre (BAD_REQUEST, INVALID_PARAMETERS, SEARCH_BAD_REQUEST, OVERVIEW_BAD_REQUEST) et sur le 409 ENTRY_ARCHIVED des liens ; absentes sinon. |
| `existingLinkId` | string (uuid) | non | Identifiant du lien déjà existant ; présent sur 409 LINK_EXISTS. |
| `instance` | string (uri) | non | Chemin de la requête en erreur ; absent pour les erreurs des filtres. |
| `missing` | string[] | non | Éléments manquants pour l'action demandée : champs du profil (409 PROFILE_INCOMPLETE) ou justificatifs (409 VERIFICATION_INCOMPLETE). |
| `pendingDocuments` | string (uuid)[] | non | Identifiants des justificatifs encore en attente de qualification ; présent sur 409 ADMIN_APPROVAL_INCOMPLETE. |
| `retryAfterSeconds` | integer (int64) | non | Secondes avant nouvel essai ; présent sur 429 RATE_LIMITED et sur les 423 de verrouillage d'authentification, avec l'en-tête Retry-After. |
| `status` | integer (int32) | oui | Statut HTTP de la réponse, répété dans le corps. |
| `suggestedEmotion` | object | non | Émotion du vocabulaire dont le libellé est identique au tag demandé (forme EmotionView) ; présent sur 422 TAG_IS_EMOTION de POST et PATCH /api/tags. |
| `title` | string | oui | Titre court : libellé HTTP en anglais (Not Found) ou titre métier ; ne pas l'afficher, utiliser code. |
| `type` | string (uri) | oui | Type de problème (RFC 9457) ; toujours about:blank dans PsyMate. |
| `usedByPublishedProfiles` | integer (int32) | non | Nombre de fiches publiées qui utilisent encore l'entrée de vocabulaire ; présent sur 409 VOCABULARY_IN_USE. |

### <a id="schema-professionalinfodto"></a>ProfessionalInfoDto

Informations professionnelles du praticien, telles qu'enregistrées.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | [AddressDto](#schema-addressdto) | non | Adresse du cabinet ; ses champs valent null si absents. |
| `phone` | string | non | Téléphone, tel que saisi ; null si non renseigné. |
| `professionalNumber` | string | non | Numéro professionnel (ADELI, RPPS ou autre) ; null si non renseigné. |
| `remoteOnly` | boolean | non | true si le praticien exerce uniquement à distance (visio) : l'adresse n'est pas exigée. |

### <a id="schema-professionalinforequest"></a>ProfessionalInfoRequest

Mise à jour partielle des informations professionnelles : un champ absent ou null est inchangé, une chaîne vide efface le champ, toute autre valeur est contrôlée.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | [AddressDto](#schema-addressdto) | non | Adresse du cabinet, champ par champ (200 caractères au maximum chacun). Absente : adresse inchangée. |
| `phone` | string | non | Téléphone : 6 à 30 caractères parmi chiffres, + espace ( ) . et tiret. Vide : effacé. |
| `professionalNumber` | string | non | Numéro professionnel : 4 à 20 caractères parmi lettres, chiffres, espace et tiret. Vide : effacé. |
| `remoteOnly` | boolean | non | true pour exercer uniquement à distance. Absent ou null : inchangé. |

### <a id="schema-profiledto"></a>ProfileDto

Profil d'annuaire du praticien connecté, tel qu'il le voit (tous les champs, y compris ceux masqués au public par les interrupteurs show*).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | string | non | Adresse postale du cabinet en texte libre ; null si vide. |
| `audiences` | string[] | non | Codes de publics accueillis, parmi ceux de GET /api/vocabulary/directory (adults, young_adults, adolescents, children, couples_families). Liste vide si aucun. |
| `availability` | `accepting` \| `waitlist` \| `closed` \| `unknown` | non | Disponibilité : accepting (accepte de nouveaux patients), waitlist (liste d'attente), closed (complet), unknown (non renseignée, valeur par défaut). |
| `bio` | string | non | Présentation libre, 1 200 caractères au plus ; null si vide. |
| `city` | string | non | Ville ; null si vide. |
| `contactEmail` | string | non | E-mail de contact public ; null si vide. |
| `contactPhone` | string | non | Téléphone de contact ; null si vide. |
| `country` | string | non | Code pays ISO 3166-1 alpha-2 en majuscules ; FR par défaut. |
| `displayName` | string | non | Nom affiché dans l'annuaire. |
| `fees` | string | non | Tarifs, texte libre de 500 caractères au plus ; null si vide. |
| `languages` | string[] | non | Langues de consultation, codes ISO 639-1 (fr, en…). Liste vide si aucune. |
| `modalities` | string[] | non | Modalités de consultation : in_person (au cabinet), video, home (à domicile). Liste vide si aucune. |
| `nextSlotAt` | string (date) | non | Date du prochain créneau disponible, AAAA-MM-JJ ; null si inconnue. |
| `photoAssetKey` | string | non | Clé interne de stockage de la photo traitée ; null si aucune photo. Sert seulement à savoir si une photo existe. |
| `postalCode` | string | non | Code postal ; null si vide. |
| `profession` | string | non | Profession du praticien, lue depuis son compte : psychologist, psychiatrist ou coach. Lecture seule. |
| `published` | boolean | non | true si le profil est visible dans l'annuaire public. Lecture seule : change uniquement par publish et unpublish. |
| `publishedAt` | string (date-time) | non | Date de la dernière publication, ISO 8601 UTC ; conservée après dépublication ; null si jamais publié. |
| `responseDelay` | string | non | Délai de réponse annoncé, texte libre ; null si vide. |
| `showAddress` | boolean | non | true pour afficher publiquement address. |
| `showEmail` | boolean | non | true pour afficher publiquement contactEmail. |
| `showPhone` | boolean | non | true pour afficher publiquement contactPhone. |
| `showProfessionalNumber` | boolean | non | true pour afficher publiquement le numéro professionnel du compte. |
| `slug` | string | non | Adresse publique du profil, unique, dérivée du nom affiché à la création ; sert dans /api/public/directory/practitioners/{slug}. |
| `specialties` | string[] | non | Codes de spécialités, parmi ceux de GET /api/vocabulary/directory (8 au plus). Liste vide si aucune. |
| `titleLabel` | string | non | Intitulé libre affiché sous le nom ; null si vide. |
| `updatedAt` | string (date-time) | non | Date de dernière modification du profil, ISO 8601 UTC. |
| `websiteUrl` | string | non | Site web, adresse http ou https ; null si vide. |

### <a id="schema-publicprofile"></a>PublicProfile

Fiche publique complète d'un praticien publié. Les coordonnées (phone, email, address) et professionalNumber sont null si le praticien ne les affiche pas.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | string | non | Adresse postale du cabinet ; null si le praticien ne l'affiche pas. |
| `audiences` | string[] | non | Codes de publics accueillis (référentiel GET /api/vocabulary/directory). Liste vide si aucun. |
| `availability` | `accepting` \| `waitlist` \| `closed` \| `unknown` | non | Disponibilité : accepting (accepte de nouveaux patients), waitlist (liste d'attente), closed (complet), unknown (non renseignée). |
| `bio` | string | non | Présentation complète, 1 200 caractères au plus ; null si vide. |
| `city` | string | non | Ville ; null si non renseignée. |
| `country` | string | non | Code pays ISO 3166-1 alpha-2. |
| `displayName` | string | non | Nom affiché. |
| `email` | string | non | E-mail de contact ; null si le praticien ne l'affiche pas. |
| `fees` | string | non | Tarifs, texte libre ; null si non renseignés. |
| `languages` | string[] | non | Langues de consultation, codes ISO 639-1. Liste vide si aucune. |
| `modalities` | string[] | non | Modalités de consultation : in_person, video, home. Liste vide si aucune. |
| `nextSlotAt` | string (date) | non | Date du prochain créneau disponible, AAAA-MM-JJ ; null si inconnue. |
| `phone` | string | non | Téléphone ; null si le praticien ne l'affiche pas. |
| `photoUrl` | string | non | URL de la photo ; null (aucune route publique ne sert encore les photos). |
| `postalCode` | string | non | Code postal ; null si non renseigné. |
| `profession` | string | non | Profession : psychologist, psychiatrist ou coach. |
| `professionalNumber` | string | non | Numéro professionnel ; null si le praticien ne l'affiche pas (ou n'en a pas). |
| `publishedAt` | string (date-time) | non | Date de publication du profil, ISO 8601 UTC. |
| `responseDelay` | string | non | Délai de réponse annoncé ; null si non renseigné. |
| `slug` | string | non | Adresse publique du praticien. |
| `specialties` | string[] | non | Codes de spécialités (référentiel GET /api/vocabulary/directory). Liste vide si aucune. |
| `titleLabel` | string | non | Intitulé libre affiché sous le nom ; null si vide. |
| `verified` | boolean | non | true si le dossier du praticien est approuvé par l'administration (badge vérifié). |
| `websiteUrl` | string | non | Site web ; null si non renseigné. |

### <a id="schema-queuedto"></a>QueueDto

Page de la file de vérification. Tri par date de soumission (à défaut dernière mise à jour du compte), selon le paramètre sort.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `items` | [QueueItemDto](#schema-queueitemdto)[] | non | Dossiers de la page, dans l'ordre du tri demandé. |
| `nextCursor` | string | non | Curseur opaque à renvoyer dans le paramètre cursor pour la page suivante ; null sur la dernière page. |

### <a id="schema-queueitemdto"></a>QueueItemDto

Ligne de la file de vérification : un dossier professionnel soumis, à traiter par un administrateur.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `city` | string | non | Ville du cabinet ; null si aucune adresse n'a été renseignée. |
| `displayName` | string | non | Nom d'affichage du praticien (prénom et nom). |
| `documentsCount` | integer (int32) | non | Nombre de justificatifs de vérification non retirés par le praticien, y compris ceux déjà purgés. |
| `missingHints` | string[] | non | Types de pièces obligatoires absents du dossier (parmi diploma et identity ; un justificatif purgé ne compte pas) ; liste vide si le dossier est complet. |
| `overdue` | boolean | non | Vrai si le dossier est en statut under_review depuis plus de 2 jours ouvrés après submittedAt ; toujours faux pour needs_more ou sans submittedAt. |
| `practitionerId` | string (uuid) | non | Identifiant du praticien dont le dossier est à vérifier. |
| `profession` | `psychologist` \| `psychiatrist` \| `coach` | non | Profession déclarée. |
| `submittedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de la dernière soumission du dossier ; null si aucune soumission n'est journalisée. |

### <a id="schema-reactivatedto"></a>ReactivateDto

Résultat d'une réactivation de compte.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `decisionId` | string (uuid) | non | Identifiant de la décision de réactivation enregistrée. |
| `id` | string (uuid) | non | Identifiant du compte réactivé. |
| `verificationStatus` | `docs_pending` \| `under_review` \| `approved` \| `needs_more` | non | Statut de vérification rendu au compte : docs_pending pour un dossier refusé (le dossier doit être redéposé), sinon le statut d'avant la suspension (docs_pending, under_review, approved ou needs_more). |

### <a id="schema-reasonrequest"></a>ReasonRequest

Motif d'une suspension ou d'une réactivation manuelle.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `reason` | string | oui | Motif de l'action, de 20 à 4000 caractères après suppression des blancs de bord ; enregistré au journal (repris dans l'e-mail au praticien pour une suspension). Erreurs 422 : REQUIRED, TOO_SHORT, TOO_LONG. |

### <a id="schema-recentactivityitemdto"></a>RecentActivityItemDto

Entrée récente du dossier.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `entryId` | string (uuid) | non | Identifiant de l'entrée. |
| `occurredFrom` | string (date-time) | non | Début de l'événement concerné (occurred_from), UTC ISO 8601. |
| `occurredTo` | string (date-time) | non | Fin de l'événement concerné (occurred_to), UTC ISO 8601 ; null si ponctuel. |
| `recordedAt` | string (date-time) | non | Date-heure de saisie de l'entrée, UTC ISO 8601. |
| `sessionId` | string (uuid) | non | Identifiant de la séance de rattachement ; null pour une entrée de type session (une séance n'est rattachée à aucune séance). |
| `status` | `draft` \| `final` | non | État de l'entrée : draft = brouillon, final = validée. |
| `title` | string | non | Titre de la version courante ; null si l'entrée n'a pas de titre. |
| `type` | `note` \| `event` \| `situation` \| `feeling` \| `session` \| `medication` | non | Type d'entrée. |
| `version` | integer (int32) | non | Numéro de la version courante de l'entrée. |
| `visibility` | `private` \| `clinical` | non | Visibilité : private = réservée au praticien, clinical = dossier clinique. |

### <a id="schema-recentsessiondto"></a>RecentSessionDto

Séance récente ; seule la plus récente porte le compte rendu entier.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `closedAt` | string (date-time) | non | Date-heure de clôture, UTC ISO 8601 ; null si la séance est ouverte. |
| `durationMin` | integer (int32) | non | Durée en minutes (1 à 600) ; null si non renseignée. |
| `entryCount` | integer (int32) | non | Nombre d'entrées non archivées rattachées à la séance. |
| `entryId` | string (uuid) | non | Identifiant de l'entrée séance. |
| `kind` | `intake` \| `session` \| `contact` | non | Nature : intake = accueil, session = séance, contact = hors rendez-vous. |
| `modality` | `in_person` \| `video` \| `phone` \| `email` | non | Modalité : en cabinet, en visio, par téléphone ou par e-mail. |
| `occurredFrom` | string (date-time) | non | Début de la séance (occurred_from), UTC ISO 8601. |
| `summary` | string | non | Compte rendu entier, pour la séance la plus récente seulement ; null pour les autres ou sans compte rendu. |
| `summaryFirstLine` | string | non | Première ligne non vide du compte rendu (200 caractères au plus, « … » si tronquée) ; null sans compte rendu. |
| `title` | string | non | Titre de la séance ; null si elle n'en a pas. |

### <a id="schema-recordcontactrequest"></a>RecordContactRequest

Contact hors rendez-vous (téléphone, e-mail), consigné comme une séance déjà clôturée. authorType et submissionId sont refusés (UNKNOWN_FIELD).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `body` | string | oui | Texte du contact, qui devient le compte rendu. Obligatoire. |
| `modality` | `phone` \| `email` | oui | Modalité du contact. Obligatoire. |
| `occurredFrom` | string (date-time) | oui | Date-heure du contact, UTC ISO 8601. Obligatoire. |

### <a id="schema-recoverycodesresponse"></a>RecoveryCodesResponse

Codes de secours de la 2FA, en clair, montrés une seule fois.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `recoveryCodes` | string[] | non | Dix codes de secours à usage unique, au format XXXXX-XXXXX (majuscules et chiffres). Ils remplacent tous les codes précédents, qui ne fonctionnent plus. |

### <a id="schema-registerrequest"></a>RegisterRequest

Inscription ouverte d'un praticien (sans code d'invitation). L'adresse e-mail sert d'identifiant de connexion.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | [Address](#schema-address) | non | Adresse du cabinet ; obligatoire sauf si remoteOnly vaut true (422 ADDRESS_REQUIRED sinon). |
| `consents` | [Consents](#schema-consents) | oui | Consentements CGU et confidentialité, tous deux à true. |
| `email` | string (email) | oui | Adresse e-mail du compte (254 caractères au maximum). |
| `firstName` | string | oui | Prénom (100 caractères au maximum). |
| `lastName` | string | oui | Nom de famille (100 caractères au maximum). |
| `password` | string | oui | Mot de passe (200 caractères au maximum). Politique : 12 caractères au moins, majuscules et minuscules, absent de la liste des mots de passe courants, sans e-mail ni nom (422 PASSWORD_POLICY sinon). |
| `phone` | string | oui | Téléphone, 30 caractères au maximum ; normalisé au format E.164 (PHONE_INVALID si ce n'est pas un numéro plausible ; 06 12 34 56 78 est lu comme +33612345678). |
| `profession` | `psychologist` \| `psychiatrist` \| `coach` | oui | Profession exercée : psychologist (psychologue), psychiatrist (psychiatre) ou coach. Elle fixe les préférences par défaut du compte. |
| `professionalNumber` | string | non | Numéro professionnel facultatif (ADELI, RPPS ou autre), 30 caractères au maximum ; absent ou vide : non renseigné. |
| `remoteOnly` | boolean | non | true si le praticien exerce uniquement à distance (visio) : l'adresse n'est alors pas exigée. Absent = false. |

### <a id="schema-registerresponse"></a>RegisterResponse

Réponse de l'inscription, identique que l'adresse e-mail soit déjà inscrite ou non (anti-énumération) : un e-mail de confirmation ou un e-mail « compte existant » part dans les deux cas.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `status` | `confirmation_email_sent` | non | Toujours confirmation_email_sent. |

### <a id="schema-renameemotionrequest"></a>RenameEmotionRequest

Nouveau libellé d'une émotion personnalisée.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `labelFr` | string | oui | Nouveau libellé français ; obligatoire, non vide, mêmes règles d'unicité qu'à la création. |

### <a id="schema-reviewrequest"></a>ReviewRequest

Qualification d'un justificatif par l'administration.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `reviewedStatus` | `pending` \| `conform` \| `non_conform` | oui | Nouvel état du justificatif : pending (à examiner), conform ou non_conform ; toute autre valeur donne 422 INVALID_REVIEWED_STATUS. |

### <a id="schema-revokedsessionsresponse"></a>RevokedSessionsResponse

Résultat de la révocation des autres sessions.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `revoked` | integer (int32) | non | Nombre de sessions des autres appareils qui ont été révoquées (la session courante est conservée). |

### <a id="schema-searchresult"></a>SearchResult

Page de résultats de la recherche dans l'annuaire public.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `facets` | [Facets](#schema-facets) | non | Facettes du lot filtré, toutes pages confondues. |
| `items` | [Card](#schema-card)[] | non | Fiches de la page, au plus 20, dans l'ordre du tri demandé. |
| `page` | integer (int32) | non | Numéro de la page rendue, à partir de 1. |
| `pageSize` | integer (int32) | non | Taille de page, toujours 20. |
| `total` | integer (int64) | non | Nombre total de fiches correspondantes (dans la limite de 500 fiches examinées). |
| `totalPages` | integer (int32) | non | Nombre total de pages ; 0 s'il n'y a aucun résultat. |

### <a id="schema-sessionresponse"></a>SessionResponse

État courant de la session du praticien connecté.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `displayName` | string | non | Nom affiché (précédé de Dr pour un psychiatre). |
| `email` | string | non | Adresse e-mail du compte. |
| `emailConfirmed` | boolean | non | true si l'adresse e-mail est confirmée (verificationStatus différent de email_pending). |
| `id` | string (uuid) | non | Identifiant du praticien. |
| `profession` | `psychologist` \| `psychiatrist` \| `coach` | non | Profession : psychologist, psychiatrist ou coach. |
| `verificationStatus` | `email_pending` \| `docs_pending` \| `under_review` \| `approved` \| `needs_more` \| `rejected` \| `suspended` \| `closed` | non | Statut de vérification à jour (relu en base à chaque appel) : email_pending = e-mail non confirmé ; docs_pending = justificatifs à déposer ; under_review = dossier en cours d'examen ; approved = praticien vérifié ; needs_more = pièces complémentaires demandées ; rejected = dossier refusé ; suspended = compte suspendu ; closed = compte clos. |

### <a id="schema-signedurldto"></a>SignedUrlDto

URL signée, à courte durée, pour lire un justificatif déchiffré. Elle ne fonctionne qu'avec la session du praticien propriétaire.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `expiresAt` | string (date-time) | non | Date-heure d'expiration de l'URL, en UTC (5 minutes après l'émission). |
| `url` | string | non | Chemin relatif à appeler en GET (avec le cookie de session) : il porte les paramètres exp et sig. Valable 5 minutes. |

### <a id="schema-sincelastsessiondto"></a>SinceLastSessionDto

Entrées postérieures à la dernière séance clôturée.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `entries` | [SinceLastSessionEntryDto](#schema-sincelastsessionentrydto)[] | non | 20 entrées au plus, de la plus récente à la plus ancienne : non archivées, hors séances, non rattachées à la dernière séance, commençant à son début ou après. Sans séance clôturée : les 20 dernières entrées hors séances. |
| `lastSessionAt` | string (date-time) | non | Début de cette séance (occurred_from), UTC ISO 8601 ; null s'il n'y en a pas. |
| `lastSessionId` | string (uuid) | non | Dernière séance clôturée non archivée ; null s'il n'y en a pas. |

### <a id="schema-sincelastsessionentrydto"></a>SinceLastSessionEntryDto

Entrée saisie depuis la dernière séance clôturée.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `entryId` | string (uuid) | non | Identifiant de l'entrée. |
| `occurredFrom` | string (date-time) | non | Début (occurred_from), UTC ISO 8601. |
| `sessionId` | string (uuid) | non | Identifiant de la séance de rattachement. |
| `status` | `draft` \| `final` | non | État de l'entrée : draft = brouillon, final = validée. |
| `title` | string | non | Titre de la version courante ; null si l'entrée n'a pas de titre. |
| `type` | `note` \| `event` \| `situation` \| `feeling` \| `medication` | non | Type d'entrée. |
| `visibility` | `private` \| `clinical` | non | Visibilité : private = réservée au praticien, clinical = dossier clinique. |

### <a id="schema-startsessionrequest"></a>StartSessionRequest

Démarrage d'une séance maintenant. authorType et submissionId sont refusés (UNKNOWN_FIELD).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `modality` | `in_person` \| `video` \| `phone` \| `email` | oui | Modalité de la séance. Obligatoire. |

### <a id="schema-submitcontactrequest"></a>SubmitContactRequest

Message d'un visiteur à un praticien, relayé par e-mail. Il n'est rattaché à aucun dossier patient.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `consent` | boolean | oui | Consentement du visiteur au traitement de son message ; doit valoir true (422 sinon). |
| `email` | string (email) | oui | E-mail du visiteur, 320 caractères au plus ; le praticien y répond directement. |
| `formShownAt` | string (date-time) | oui | Instant d'affichage du formulaire, ISO 8601 UTC ; un envoi moins de 3 secondes après cet instant, ou dans le futur, est ignoré en silence (202 sans envoi). |
| `message` | string | oui | Texte du message, 4 000 caractères au plus. |
| `name` | string | oui | Nom du visiteur, 200 caractères au plus. |
| `subject` | string | non | Objet du message, 200 caractères au plus. Optionnel. |
| `website` | string | non | Piège anti-spam (honeypot) : champ caché du formulaire, à laisser vide ; rempli, le message est ignoré en silence (202 sans envoi). |

### <a id="schema-suspenddto"></a>SuspendDto

Résultat d'une suspension de compte.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `decisionId` | string (uuid) | non | Identifiant de la décision de suspension enregistrée. |
| `id` | string (uuid) | non | Identifiant du compte suspendu. |
| `suspendedAt` | string (date-time) | non | Date-heure UTC (ISO 8601) de la suspension. |
| `verificationStatus` | string | non | Nouveau statut de vérification, toujours suspended. |

### <a id="schema-tagdto"></a>TagDto

Tag libre du praticien associé à un patient.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `id` | string (uuid) | non | Identifiant du tag. |
| `label` | string | non | Libellé du tag, tel qu'affiché. |

### <a id="schema-tagrequest"></a>TagRequest

Libellé d'un tag à créer ou à substituer au libellé actuel.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `label` | string | oui | Libellé du tag ; obligatoire, non vide. Un « # » est ignoré, les espaces de bord sont retirés ; l'unicité se juge sans casse ni accents. Un libellé égal à une émotion visible du praticien est refusé (TAG_IS_EMOTION). |

### <a id="schema-tagview"></a>TagView

Tag libre du praticien connecté, utilisable sur ses patients et ses entrées.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `createdAt` | string (date-time) | non | Date-heure de création, UTC ISO 8601. |
| `id` | string (uuid) | non | Identifiant du tag. |
| `label` | string | non | Libellé tel que saisi, sans aucun « # », espaces de bord retirés. |
| `normalizedLabel` | string | non | Libellé normalisé servant à l'unicité et aux recherches : minuscules, sans accents ni « # ». |
| `usageCount` | integer (int32) | non | Compteur d'usages maintenu pour l'autocomplétion ; additionné lors d'une fusion de tags. |

### <a id="schema-tagsrequest"></a>TagsRequest

Liste complète des tags d'un patient (remplace la liste existante).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `tags` | string[] | non | Libellés de tags existants du praticien (à créer d'abord par POST /api/tags). Un libellé qui correspond à une émotion est refusé (TAG_IS_EMOTION), un libellé inconnu aussi (TAG_UNKNOWN). Liste vide pour retirer tous les tags ; les doublons sont fusionnés. |

### <a id="schema-timelineemotiondto"></a>TimelineEmotionDto

Émotion d'un ressenti d'après le catalogue de vocabulaire du praticien.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non | Code de l'émotion. |
| `family` | string | non | Famille de l'émotion d'après le catalogue : joy, trust, fear, surprise, sadness, disgust, anger ou anticipation. Null si elle est inconnue. |

### <a id="schema-timelinefacetsdto"></a>TimelineFacetsDto

Comptes de toute la fenêtre filtrée (et non de la seule page), indépendants du curseur. Triés du plus fréquent au plus rare.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `emotions` | object | non | Nombre de ressentis par émotion (clé = code de l'émotion). |
| `tags` | object | non | Nombre d'entrées par tag (clé = libellé du tag). |
| `types` | object | non | Nombre d'entrées par type (clé = code du type). |

### <a id="schema-timelineitemdto"></a>TimelineItemDto

Entrée allégée de la chronologie : de quoi dessiner une ligne sans charger l'entrée complète (GET /api/entries/{id}).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `authorType` | `practitioner` | non | Provenance de l'entrée. Lecture seule : vaut toujours practitioner en V1. |
| `emotion` | [TimelineEmotionDto](#schema-timelineemotiondto) | non | Émotion du ressenti. Renseignée pour le type feeling, null sinon. |
| `id` | string (uuid) | non | Identifiant de l'entrée. |
| `intensity` | integer (int32) | non | Intensité du ressenti, de 0 à 10. Null pour les autres types. |
| `linkCount` | integer (int32) | non | Nombre de liens acceptés portant sur l'entrée. |
| `occurred` | [EntryOccurredDto](#schema-entryoccurreddto) | non | Moment auquel l'entrée a eu lieu, avec sa précision. |
| `ongoing` | boolean | non | Vrai pour une situation sans fin (occurred.to nul), toujours en cours. Faux pour tout autre élément. |
| `recordedAt` | string (date-time) | non | Instant d'enregistrement de l'entrée, UTC ISO 8601. |
| `sessionId` | string (uuid) | non | Identifiant de la séance de l'entrée. Null pour une séance (une séance n'est rattachée à aucune séance). |
| `status` | `draft` \| `final` | non | Statut : draft = brouillon ; final = définitive. |
| `tags` | string[] | non | Libellés des tags actifs de l'entrée, triés sans tenir compte de la casse. |
| `title` | string | non | Titre de la version courante. Null si la version n'en a pas. |
| `type` | `note` \| `event` \| `situation` \| `feeling` \| `session` \| `medication` | non | Type de l'entrée. |
| `visibility` | `private` \| `clinical` | non | Visibilité : private = visible du seul praticien auteur ; clinical = partagée avec l'équipe clinique. |

### <a id="schema-timelinepagedto"></a>TimelinePageDto

Page de chronologie, triée par début d'occurrence décroissant (puis identifiant décroissant), avec facettes de la fenêtre et situations en cours.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `facets` | [TimelineFacetsDto](#schema-timelinefacetsdto) | non | Facettes de toute la fenêtre filtrée. |
| `items` | [TimelineItemDto](#schema-timelineitemdto)[] | non | Entrées de la page, de la plus récente à la plus ancienne. |
| `nextCursor` | string | non | Curseur opaque à renvoyer tel quel dans le paramètre cursor pour obtenir la page suivante. Null sur la dernière page. |
| `ongoingSituations` | [TimelineItemDto](#schema-timelineitemdto)[] | non | Situations non archivées dont la plage chevauche la fenêtre, y compris celles commencées avant from et toujours en cours. Seuls les filtres de fenêtre, de brouillon et de visibilité s'appliquent (pas types, emotions ni tags) ; indépendantes de la pagination. |

### <a id="schema-timelineperioddto"></a>TimelinePeriodDto

Agrégats d'une période (un mois ou une année, en UTC).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `averageIntensity` | number (double) | non | Intensité moyenne des ressentis de la période. Null s'il n'y en a pas. |
| `counts` | object | non | Nombre d'entrées de la période par type (clé = code du type). |
| `feelingCount` | integer (int32) | non | Nombre de ressentis de la période. |
| `from` | string (date-time) | non | Début de la période, UTC ISO 8601. |
| `period` | string | non | Libellé de la période : AAAA-MM pour un mois, AAAA pour une année. |

### <a id="schema-timelinesummarydto"></a>TimelineSummaryDto

Résumé de la chronologie par mois ou par année. Seules les périodes qui contiennent au moins une entrée sont renvoyées, de la plus ancienne à la plus récente.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `granularity` | `month` \| `year` | non | Granularité demandée. |
| `periods` | [TimelinePeriodDto](#schema-timelineperioddto)[] | non | Périodes non vides, de la plus ancienne à la plus récente. |

### <a id="schema-topemotiondto"></a>TopEmotionDto

Émotion dominante et variation par rapport à la fenêtre précédente.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non | Code de l'émotion. |
| `count` | integer (int32) | non | Nombre de ressentis dans la fenêtre. |
| `delta` | integer (int32) | non | count moins previousCount (négatif si en baisse). |
| `label` | string | non | Libellé français de l'émotion. |
| `previousCount` | integer (int32) | non | Nombre de ressentis dans la fenêtre précédente, de même longueur. |

### <a id="schema-trenddto"></a>TrendDto

Courbe d'intensité et repères de la fenêtre.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `markers` | [TrendMarkerDto](#schema-trendmarkerdto)[] | non | Séances et débuts/fins de médicament dont le jour tombe dans la fenêtre, par date croissante. |
| `points` | [TrendPointDto](#schema-trendpointdto)[] | non | Points de la courbe, dates croissantes, la dernière étant aujourd'hui : un par jour pour 30d et 90d, un par semaine pour 12m ; 90 au plus. |

### <a id="schema-trendmarkerdto"></a>TrendMarkerDto

Repère sur la courbe : séance ou début/fin de médicament.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `change` | `start` \| `end` | non | Pour un médicament : start (début) ou end (fin) ; null pour une séance. |
| `date` | string (date) | non | Jour UTC du repère, AAAA-MM-JJ. |
| `entryId` | string (uuid) | non | Identifiant de l'entrée séance ou médicament. |
| `kind` | `session` \| `medication` | non | Nature du repère : session ou medication. |
| `label` | string | non | Titre de la séance (null sans titre) ou « molécule dosage » du médicament (« molécule » seule sans dosage). |
| `sessionKind` | `intake` \| `session` \| `contact` | non | Pour une séance : intake (accueil), session (séance) ou contact (hors rendez-vous) ; null pour un médicament. |

### <a id="schema-trendpointdto"></a>TrendPointDto

Point de la courbe : moyenne glissante sur 7 jours à cette date.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `averageIntensity` | number (double) | non | Intensité moyenne (0 à 10, deux décimales) des ressentis des 7 derniers jours jusqu'à cette date ; null si aucun ressenti. |
| `date` | string (date) | non | Jour UTC du point, AAAA-MM-JJ. |
| `valence` | number (double) | non | Valence moyenne (-2 à 2, deux décimales) des valences connues sur les 7 jours ; null si aucune. Toujours null tant que les valences des émotions ne sont pas renseignées. |

### <a id="schema-twofactordisablerequest"></a>TwoFactorDisableRequest

Confirmation de la désactivation de la 2FA.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | oui | Code TOTP à 6 chiffres ou code de secours non utilisé (32 caractères au maximum). |
| `password` | string | oui | Mot de passe actuel du compte (200 caractères au maximum). |

### <a id="schema-twofactorenableresponse"></a>TwoFactorEnableResponse

Secret TOTP en attente d'activation, montré une seule fois.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `otpauthUri` | string | non | URI otpauth:// à encoder en QR code (émetteur PsyMate, SHA1, 6 chiffres, pas de 30 s). |
| `secret` | string | non | Secret TOTP en Base32, à saisir dans l'application d'authentification si le QR code n'est pas lisible. |

### <a id="schema-twofactorverifyrequest"></a>TwoFactorVerifyRequest

Premier code TOTP produit par l'application d'authentification.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | oui | Code TOTP à 6 chiffres affiché par l'application (32 caractères max). |

### <a id="schema-updateprofilerequest"></a>UpdateProfileRequest

Contenu complet du profil d'annuaire : remplace toutes les colonnes éditables, un champ absent reprend sa valeur par défaut. published, slug, profession et photo ne s'envoient pas.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | string | non | Adresse postale du cabinet, 300 caractères au plus. |
| `audiences` | string[] | non | Codes de publics actifs de GET /api/vocabulary/directory, sans doublon. Défaut : liste vide. |
| `availability` | `accepting` \| `waitlist` \| `closed` \| `unknown` | non | Disponibilité : accepting (accepte de nouveaux patients), waitlist (liste d'attente), closed (complet), unknown (non renseignée). Défaut : unknown. |
| `bio` | string | non | Présentation libre, 1 200 caractères au plus. Défaut : aucune. |
| `city` | string | non | Ville, 100 caractères au plus. Requise pour publier. |
| `contactEmail` | string | non | E-mail de contact public, 254 caractères au plus, de la forme x@y. |
| `contactPhone` | string | non | Téléphone de contact, 30 caractères au plus. |
| `country` | string | non | Code pays ISO 3166-1 alpha-2 (deux lettres, converti en majuscules). Défaut : FR. |
| `displayName` | string | oui | Nom affiché dans l'annuaire, obligatoire, 120 caractères au plus. |
| `fees` | string | non | Tarifs, texte libre de 500 caractères au plus. |
| `languages` | string[] | non | Langues de consultation, codes ISO 639-1 (fr, en…), sans doublon. Défaut : liste vide. |
| `modalities` | string[] | non | Modalités parmi in_person (au cabinet), video, home (à domicile), sans doublon. Défaut : liste vide. |
| `nextSlotAt` | string (date) | non | Date du prochain créneau disponible, AAAA-MM-JJ. Défaut : aucune. |
| `postalCode` | string | non | Code postal, 20 caractères au plus. |
| `responseDelay` | string | non | Délai de réponse annoncé, 60 caractères au plus. |
| `showAddress` | boolean | non | true pour afficher publiquement address. Défaut : false. |
| `showEmail` | boolean | non | true pour afficher publiquement contactEmail. Défaut : false. |
| `showPhone` | boolean | non | true pour afficher publiquement contactPhone. Défaut : false. |
| `showProfessionalNumber` | boolean | non | true pour afficher publiquement le numéro professionnel du compte. Défaut : false. |
| `specialties` | string[] | non | Codes de spécialités actifs de GET /api/vocabulary/directory, sans doublon, 8 au plus. Défaut : liste vide. |
| `titleLabel` | string | non | Intitulé libre affiché sous le nom, 120 caractères au plus. Défaut : aucun. |
| `websiteUrl` | string | non | Site web, adresse http ou https avec nom d'hôte, 300 caractères au plus. |

### <a id="schema-verificationdto"></a>VerificationDto

Dossier professionnel du praticien : état de la vérification, justificatifs actifs, pièces manquantes et recommandées, décisions reçues et informations professionnelles.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `decisions` | [DecisionDto](#schema-decisiondto)[] | non | Décisions de l'administration accompagnées d'un message, de la plus récente à la plus ancienne. |
| `documents` | [DocumentDto](#schema-documentdto)[] | non | Justificatifs actifs du dossier (20 au maximum), retirés exclus. |
| `missing` | string[] | non | Types de justificatifs obligatoires encore absents (diploma, identity) ; le dossier ne peut être soumis que si la liste est vide. |
| `profession` | `psychologist` \| `psychiatrist` \| `coach` | non | Profession du praticien : psychologist, psychiatrist ou coach. |
| `professionalInfo` | [ProfessionalInfoDto](#schema-professionalinfodto) | non | Informations professionnelles enregistrées. |
| `recommended` | string[] | non | Types de justificatifs conseillés encore absents (registration pour un psychologue ou un psychiatre, certification pour un coach) ; jamais bloquant. |
| `status` | `email_pending` \| `docs_pending` \| `under_review` \| `approved` \| `needs_more` \| `rejected` \| `suspended` \| `closed` | non | État du dossier : email_pending = e-mail non confirmé ; docs_pending = justificatifs à déposer ; under_review = dossier soumis, en cours d'examen ; approved = praticien vérifié ; needs_more = pièces complémentaires demandées ; rejected = dossier refusé ; suspended = compte suspendu ; closed = compte clos. Le dossier n'est modifiable qu'en docs_pending et needs_more. |
| `submittedAt` | string (date-time) | non | Date-heure de la dernière soumission du dossier, en UTC ; null s'il n'a jamais été soumis. |

### <a id="schema-versiondto"></a>VersionDto

Instantané de la fiche après une modification par PATCH. La création (version 1) n'a pas d'instantané : la liste commence à la version 2.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `authorId` | string (uuid) | non | Identifiant du praticien auteur de la modification. |
| `createdAt` | string (date-time) | non | Date-heure de la modification, UTC ISO 8601. |
| `reason` | string | non | Motif de la modification fourni par le champ reason du PATCH ; null si absent. |
| `snapshot` | object | non | État de la fiche après la modification : objet JSON avec displayName, firstName, lastName, birthDate (AAAA-MM-JJ ou null), pronoun, phone, email, context et followUp. |
| `version` | integer (int32) | non | Numéro de la version produite par la modification. |
