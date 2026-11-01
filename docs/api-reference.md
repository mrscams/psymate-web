# Référence de l'API PsyMate

Généré depuis le contrat OpenAPI (`PsyMate API`, info.version 0.6.0). 86 chemins, 142 schémas.

Toutes les routes `/api/**` exigent une session (cookie posé par `POST /api/auth/login`), sauf celles marquées publiques dans leur description (`/api/auth/*`, `/api/public/**`, `/api/me/appeal`, `/api/me/export`). Erreurs : `application/problem+json` avec `code` et `errors[]`.

## Sommaire

- [account-export-controller](#account-export-controller) (3)
- [admin-journal-controller](#admin-journal-controller) (1)
- [admin-practitioner-controller](#admin-practitioner-controller) (4)
- [admin-verification-controller](#admin-verification-controller) (6)
- [appeal-controller](#appeal-controller) (3)
- [auth-controller](#auth-controller) (13)
- [directory-vocabulary-admin-controller](#directory-vocabulary-admin-controller) (3)
- [directory-vocabulary-controller](#directory-vocabulary-controller) (1)
- [entry-controller](#entry-controller) (6)
- [graph-controller](#graph-controller) (2)
- [link-controller](#link-controller) (4)
- [my-emotion-controller](#my-emotion-controller) (4)
- [overview](#overview) (1)
- [patient-controller](#patient-controller) (10)
- [patient-export-controller](#patient-export-controller) (1)
- [preferences-controller](#preferences-controller) (2)
- [profile-controller](#profile-controller) (6)
- [public-directory-controller](#public-directory-controller) (3)
- [search](#search) (1)
- [session-controller](#session-controller) (4)
- [tag-controller](#tag-controller) (4)
- [timeline-controller](#timeline-controller) (2)
- [two-factor-controller](#two-factor-controller) (4)
- [verification-controller](#verification-controller) (8)
- [vocabulary-controller](#vocabulary-controller) (3)

## account-export-controller

### `POST /api/me/export`

**Lance l'export asynchrone de tous les patients du compte (zip chiffré, lien 7 jours) : 202 jobId et statusUrl, ou 202 otpRequired. Compte connecté (corps ignoré) ou compte refusé/suspendu par e-mail + mot de passe (+ code 2FA) dans le corps.**

operationId : `requestAccountExport`

Corps (`application/json`) : [AccountExportRequest](#schema-accountexportrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 202 | [ExportRequestedDto](#schema-exportrequesteddto) (*/*) | Job créé (jobId, statusUrl), ou code 2FA requis (otpRequired) |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | INVALID_CREDENTIALS : identifiants incorrects ou code 2FA faux |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EXPORT_IN_PROGRESS (un seul export en cours) ou ACCOUNT_NOT_SUSPENDED (compte approuvé ou clos sans session) |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : e-mail ou mot de passe manquants sans session |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Verrouillage après 5 échecs (15 min) |

### `GET /api/me/export/{jobId}`

**Statut d'un export du compte : praticien connecté propriétaire du job, ou paramètre token du statusUrl. downloadUrl seulement quand le job est terminé et non expiré.**

operationId : `getAccountExport`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `jobId` | path | string (uuid) | oui |  |
| `token` | query | string | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ExportStatusDto](#schema-exportstatusdto) (*/*) | OK |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EXPORT_NOT_FOUND : job inconnu, d'un autre praticien, ou jeton invalide |

### `GET /api/me/export/{jobId}/file`

**Télécharge le zip de l'export (URL signée valable 7 jours) : 200 application/zip, 403 signature invalide, 410 expiré ou purgé.**

operationId : `downloadAccountExport`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `jobId` | path | string (uuid) | oui |  |
| `exp` | query | string | non |  |
| `sig` | query | string | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | string (binary) (application/zip) | Zip en pièce jointe : patients.md, puis un .md et un .pdf par patient |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | SIGNED_URL_INVALID |
| 410 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EXPORT_EXPIRED : échéance passée ou fichier purgé |

## admin-journal-controller

### `GET /api/admin/journal`

**Journal d'administration (décisions et événements, plus récents d'abord), pagination par curseur ; jamais d'adresse IP**

operationId : `listAdminJournal`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `kind` | query | string | non |  |
| `practitionerId` | query | string | non |  |
| `actorId` | query | string | non |  |
| `from` | query | string | non |  |
| `to` | query | string | non |  |
| `cursor` | query | string | non |  |
| `limit` | query | integer (int32) | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [JournalDto](#schema-journaldto) (*/*) | OK |

## admin-practitioner-controller

### `GET /api/admin/practitioners`

**Comptes des praticiens (recherche q, filtres status, role, profession), pagination par curseur, compteurs par statut**

operationId : `listAdminPractitioners`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `q` | query | string | non |  |
| `status` | query | string | non |  |
| `role` | query | string | non |  |
| `profession` | query | string | non |  |
| `cursor` | query | string | non |  |
| `limit` | query | integer (int32) | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [AccountListDto](#schema-accountlistdto) (*/*) | OK |

### `GET /api/admin/practitioners/{id}`

**Compte d'un praticien : état, décisions et recours**

operationId : `getAdminPractitioner`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [AccountDetailDto](#schema-accountdetaildto) (*/*) | OK |

### `POST /api/admin/practitioners/{id}/reactivate`

**Réactive un compte suspendu ou refusé (motif d'au moins 20 caractères)**

operationId : `reactivateAdminPractitioner`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [ReasonRequest](#schema-reasonrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ReactivateDto](#schema-reactivatedto) (*/*) | OK |

### `POST /api/admin/practitioners/{id}/suspend`

**Suspend un compte (motif d'au moins 20 caractères) : sessions révoquées, e-mail au praticien, fiche publique dépubliée**

operationId : `suspendAdminPractitioner`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [ReasonRequest](#schema-reasonrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [SuspendDto](#schema-suspenddto) (*/*) | OK |

## admin-verification-controller

### `GET /api/admin/verifications`

**File des dossiers à vérifier (under_review ou needs_more), pagination par curseur**

operationId : `listAdminVerifications`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `status` | query | string | non |  |
| `sort` | query | string | non |  |
| `cursor` | query | string | non |  |
| `limit` | query | integer (int32) | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [QueueDto](#schema-queuedto) (*/*) | OK |

### `GET /api/admin/verifications/{practitionerId}`

**Dossier d'un praticien : identité, coordonnées, justificatifs, décisions**

operationId : `getAdminVerification`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `practitionerId` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [DossierDto](#schema-dossierdto) (*/*) | OK |

### `POST /api/admin/verifications/{practitionerId}/decision`

**Approuve, demande un complément ou refuse (décision append-only)**

operationId : `decideAdminVerification`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `practitionerId` | path | string (uuid) | oui |  |

Corps (`application/json`) : [DecisionRequest](#schema-decisionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [DecisionDto](#schema-decisiondto) (*/*) | OK |

### `PATCH /api/admin/verifications/{practitionerId}/documents/{docId}`

**Qualifie un justificatif (pending, conform, non_conform)**

operationId : `reviewAdminDocument`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `practitionerId` | path | string (uuid) | oui |  |
| `docId` | path | string (uuid) | oui |  |

Corps (`application/json`) : [ReviewRequest](#schema-reviewrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [DocumentDto](#schema-documentdto) (*/*) | OK |

### `GET /api/admin/verifications/{practitionerId}/documents/{docId}/file`

**Sert le justificatif déchiffré (URL signée) et consigne l'accès**

operationId : `getAdminDocumentFile`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `practitionerId` | path | string (uuid) | oui |  |
| `docId` | path | string (uuid) | oui |  |
| `exp` | query | integer (int64) | non |  |
| `sig` | query | string | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | string (byte) (*/*) | OK |

### `GET /api/admin/verifications/{practitionerId}/documents/{docId}/url`

**URL signée de 5 minutes pour ouvrir un justificatif**

operationId : `getAdminDocumentUrl`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `practitionerId` | path | string (uuid) | oui |  |
| `docId` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [SignedUrlDto](#schema-signedurldto) (*/*) | OK |

## appeal-controller

### `GET /api/admin/appeals`

**Recours (status open par défaut, decided ou all), pagination par curseur ; les plus anciens d'abord pour open**

operationId : `listAdminAppeals`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `status` | query | string | non |  |
| `cursor` | query | string | non |  |
| `limit` | query | integer (int32) | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [AppealListDto](#schema-appeallistdto) (*/*) | OK |

### `POST /api/admin/appeals/{id}/decision`

**Accepte ou rejette un recours (accepted réactive le compte) ; l'administrateur doit différer de l'auteur de la décision contestée**

operationId : `decideAdminAppeal`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [AppealDecisionRequest](#schema-appealdecisionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [AppealItemDto](#schema-appealitemdto) (*/*) | OK |

### `POST /api/me/appeal`

**Dépose le recours d'un compte refusé ou suspendu (public : e-mail + mot de passe) : 201, 202 code 2FA requis, 401, 403, 409, 422, 423. Un seul recours par décision.**

operationId : `submitAppeal`

Corps (`application/json`) : [AppealRequest](#schema-appealrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [AppealCreatedDto](#schema-appealcreateddto) (*/*) | Created |
| 202 | [OtpRequiredDto](#schema-otprequireddto) (*/*) | Mot de passe correct, 2FA active et code manquant |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Identifiants incorrects (message unique) ou code 2FA faux |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | ACCOUNT_NOT_SUSPENDED, APPEAL_NOT_ALLOWED, APPEAL_ALREADY_OPEN ou APPEAL_ALREADY_USED |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Verrouillage après 5 échecs (15 min) |

## auth-controller

### `POST /api/auth/email/change`

**Corrige l'adresse d'un compte non confirmé (public : e-mail + mot de passe, 202 dans tous les cas)**

operationId : `changeEmail`

Corps (`application/json`) : [EmailChangeRequest](#schema-emailchangerequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Verrouillage e-mail + IP après 5 mots de passe faux |

### `POST /api/auth/email/confirm`

**Confirme l'adresse e-mail et ouvre une session**

operationId : `confirmEmail`

Corps (`application/json`) : [EmailConfirmRequest](#schema-emailconfirmrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | — | OK |

### `POST /api/auth/email/resend`

**Renvoie l'e-mail de confirmation (202 dans tous les cas)**

operationId : `resendEmail`

Corps (`application/json`) : [EmailResendRequest](#schema-emailresendrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | — | OK |

### `POST /api/auth/login`

**Connexion : 200 session, 202 code 2FA requis, 401, 403, 423 (Retry-After)**

operationId : `login`

Corps (`application/json`) : [LoginRequest](#schema-loginrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [MeResponse](#schema-meresponse) (*/*) | OK |
| 202 | [OtpRequiredResponse](#schema-otprequiredresponse) (*/*) | Accepted |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Identifiants incorrects (message unique) ou code 2FA faux |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED, ACCOUNT_SUSPENDED ou PASSWORD_CHANGE_REQUIRED |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Verrouillage après 5 échecs (15 min) |

### `POST /api/auth/logout`

operationId : `logout`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | — | OK |

### `GET /api/auth/me`

operationId : `me`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [MeResponse](#schema-meresponse) (*/*) | OK |

### `POST /api/auth/password-reset/confirm`

operationId : `confirmReset`

Corps (`application/json`) : [PasswordResetConfirmRequest](#schema-passwordresetconfirmrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | — | OK |

### `POST /api/auth/password-reset/request`

operationId : `requestReset`

Corps (`application/json`) : [PasswordResetRequest](#schema-passwordresetrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | — | OK |

### `POST /api/auth/password/change`

**Change le mot de passe (public : e-mail + mot de passe actuel) : 204, 202 code 2FA requis, 401, 403, 422, 423. Révoque toutes les sessions.**

operationId : `changePassword`

Corps (`application/json`) : [PasswordChangeRequest](#schema-passwordchangerequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 202 | [OtpRequiredResponse](#schema-otprequiredresponse) (*/*) | Mot de passe actuel correct, 2FA active et code manquant |
| 204 | — | Mot de passe changé, sessions révoquées |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Identifiants incorrects (message unique) ou code 2FA faux |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EMAIL_NOT_CONFIRMED ou ACCOUNT_SUSPENDED |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PASSWORD_POLICY, ou PASSWORD_UNCHANGED (champ newPassword) |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Verrouillage après 5 échecs (15 min) |

### `POST /api/auth/register`

**Inscription d'un praticien (ouverte, sans code d'invitation)**

operationId : `register`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `Accept-Language` | header | string | non |  |

Corps (`application/json`) : [RegisterRequest](#schema-registerrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [RegisterResponse](#schema-registerresponse) (*/*) | OK |

### `GET /api/auth/session`

**État courant de la session (statut de vérification à jour)**

operationId : `session`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [SessionResponse](#schema-sessionresponse) (*/*) | OK |

### `POST /api/auth/sessions/revoke-others`

**Déconnecte tous les autres appareils (la session courante est conservée)**

operationId : `revokeOtherSessions`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [RevokedSessionsResponse](#schema-revokedsessionsresponse) (*/*) | OK |

### `POST /api/auth/signup`

**Alias déprécié de POST /api/auth/register**

operationId : `signup`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `Accept-Language` | header | string | non |  |

Corps (`application/json`) : [RegisterRequest](#schema-registerrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [RegisterResponse](#schema-registerresponse) (*/*) | OK |

## directory-vocabulary-admin-controller

### `GET /api/admin/vocabulary/directory`

**Spécialités et publics de l'annuaire, actifs ou non, avec le nombre de fiches publiées qui les utilisent**

operationId : `listAdminDirectoryVocabulary`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `kind` | query | string | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ListDto](#schema-listdto) (*/*) | OK |

### `POST /api/admin/vocabulary/directory`

**Ajoute une spécialité ou un public (409 VOCABULARY_EXISTS si le code existe)**

operationId : `createAdminDirectoryVocabulary`

Corps (`application/json`) : [CreateRequest](#schema-createrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ItemDto](#schema-itemdto) (*/*) | OK |

### `PATCH /api/admin/vocabulary/directory/{kind}/{code}`

**Modifie libellés, rang ou activation (409 VOCABULARY_IN_USE pour désactiver un code utilisé par une fiche publiée)**

operationId : `updateAdminDirectoryVocabulary`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `kind` | path | string | oui |  |
| `code` | path | string | oui |  |

Corps (`application/json`) : [PatchRequest](#schema-patchrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ItemDto](#schema-itemdto) (*/*) | OK |

## directory-vocabulary-controller

### `GET /api/vocabulary/directory`

operationId : `get_1`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [DirectoryVocabularyDto](#schema-directoryvocabularydto) (*/*) | OK |

## entry-controller

### `GET /api/entries/{id}`

operationId : `getEntry`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryDto](#schema-entrydto) (*/*) | OK |

### `PATCH /api/entries/{id}`

operationId : `patchEntry`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [PatchEntryRequest](#schema-patchentryrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryDto](#schema-entrydto) (*/*) | OK |

### `DELETE /api/entries/{id}`

operationId : `archiveEntry`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | No Content |

### `POST /api/entries/{id}/restore`

operationId : `restoreEntry`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryDto](#schema-entrydto) (*/*) | OK |

### `GET /api/entries/{id}/versions`

operationId : `listEntryVersions`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryVersionDto](#schema-entryversiondto)[] (*/*) | OK |

### `POST /api/patients/{id}/entries`

operationId : `createEntry`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [CreateEntryRequest](#schema-createentryrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryDto](#schema-entrydto) (*/*) | OK |

## graph-controller

### `GET /api/patients/{id}/graph`

operationId : `getPatientGraph`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |
| `root` | query | string (uuid) | non |  |
| `depth` | query | integer (int32) | non |  |
| `linkTypes` | query | string[] | non |  |
| `from` | query | string (date-time) | non |  |
| `to` | query | string (date-time) | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [GraphDto](#schema-graphdto) (*/*) | OK |

### `POST /api/patients/{id}/graph/expand`

operationId : `expandGraphGroup`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [ExpandGraphRequest](#schema-expandgraphrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [GraphDto](#schema-graphdto) (*/*) | OK |

## link-controller

### `GET /api/entries/{id}/links`

operationId : `listEntryLinks`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [LinkDto](#schema-linkdto)[] (*/*) | OK |

### `POST /api/entries/{id}/links`

operationId : `createLink`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [CreateLinkRequest](#schema-createlinkrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [LinkDto](#schema-linkdto) (*/*) | Created |

### `PATCH /api/links/{id}`

operationId : `changeLinkType`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [ChangeLinkTypeRequest](#schema-changelinktyperequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [LinkDto](#schema-linkdto) (*/*) | OK |

### `DELETE /api/links/{id}`

operationId : `removeLink`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | No Content |

## my-emotion-controller

### `POST /api/me/emotions`

operationId : `create_1`

Corps (`application/json`) : [CreateEmotionRequest](#schema-createemotionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [EmotionView](#schema-emotionview) (*/*) | Created |

### `PATCH /api/me/emotions/{code}`

operationId : `rename_1`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `code` | path | string | oui |  |

Corps (`application/json`) : [RenameEmotionRequest](#schema-renameemotionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EmotionView](#schema-emotionview) (*/*) | OK |

### `POST /api/me/emotions/{code}/merge`

operationId : `merge_1`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `code` | path | string | oui |  |

Corps (`application/json`) : [MergeEmotionRequest](#schema-mergeemotionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [MergeView](#schema-mergeview) (*/*) | OK |

### `POST /api/me/emotions/merges/{id}/undo`

operationId : `undo`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [MergeView](#schema-mergeview) (*/*) | OK |

## overview

### `GET /api/patients/{id}/overview`

**Vue d'ensemble d'un patient**

Lit la projection patient_overview : faits clés, situations actives, tendance d'intensité (moyenne glissante sur 7 jours, 90 points au plus, repères de séances et de médicaments), émotions dominantes avec variation sur la fenêtre précédente, brouillons et séance ouverte. La fenêtre (window) borne la tendance et les émotions. Si la projection est en retard sur patient.clinical_rev, elle est recalculée et réécrite avant de répondre : la réponse n'est jamais obsolète. recentActivity (10 dernières entrées non archivées) est toujours lu en direct. Les entrées archivées sont exclues, les entrées privées du praticien incluses. Ajouts (M4-06, additifs) : narrative (résumé « En bref » de 5 phrases au plus, chacune omise si ses données manquent, rédigé par règles, sans IA, plus un point d'attention issu des drapeaux ; composé dans la langue de Accept-Language, français par défaut), feelings (un point par ressenti réel de la fenêtre, une série par émotion, repères de médicament et jours de séance), sinceLastSession (entrées postérieures à la dernière séance clôturée, 20 au plus) et recentSessions (5 dernières séances, la plus récente avec son compte rendu entier). Le client choisit la vue simple ou complète : la réponse porte tout.

operationId : `getPatientOverview`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient |
| `window` | query | `30d` \| `90d` \| `12m` | non | Fenêtre de la tendance et des émotions : 30d, 90d (défaut) ou 12m |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [OverviewDto](#schema-overviewdto) (*/*) | Vue d'ensemble pour la fenêtre demandée |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Fenêtre invalide (errors[] par champ, code INVALID_WINDOW) |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Le patient n'appartient pas au praticien courant |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Patient inconnu |

## patient-controller

### `GET /api/patients`

operationId : `listPatients`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `q` | query | string | non |  |
| `archived` | query | boolean | non |  |
| `tag` | query | string | non |  |
| `sort` | query | string | non |  |
| `cursor` | query | string | non |  |
| `limit` | query | integer (int32) | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PatientPage](#schema-patientpage) (*/*) | OK |

### `POST /api/patients`

operationId : `createPatient`

Corps (`application/json`) : [CreatePatientRequest](#schema-createpatientrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [PatientDto](#schema-patientdto) (*/*) | Created |

### `GET /api/patients/{id}`

operationId : `getPatient`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PatientDto](#schema-patientdto) (*/*) | OK |

### `PATCH /api/patients/{id}`

operationId : `patchPatient`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : object

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PatientDto](#schema-patientdto) (*/*) | OK |

### `DELETE /api/patients/{id}`

operationId : `archivePatient`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 204 | — | No Content |

### `POST /api/patients/{id}/flags`

operationId : `addPatientFlag`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [FlagRequest](#schema-flagrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [PatientDto](#schema-patientdto) (*/*) | Created |

### `DELETE /api/patients/{id}/flags/{kind}`

operationId : `clearPatientFlag`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |
| `kind` | path | string | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PatientDto](#schema-patientdto) (*/*) | OK |

### `POST /api/patients/{id}/restore`

operationId : `restorePatient`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PatientDto](#schema-patientdto) (*/*) | OK |

### `PUT /api/patients/{id}/tags`

operationId : `replacePatientTags`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [TagsRequest](#schema-tagsrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PatientDto](#schema-patientdto) (*/*) | OK |

### `GET /api/patients/{id}/versions`

operationId : `listPatientVersions`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [VersionDto](#schema-versiondto)[] (*/*) | OK |

## patient-export-controller

### `GET /api/patients/{id}/export`

**Exporte le dossier du patient en Markdown (md) ou en PDF thème clair (pdf), séances et entrées en ordre chronologique ; entrées privées et archivées exclues.**

operationId : `exportPatient`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |
| `format` | query | string | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | string (binary) (application/pdf) | Fichier en pièce jointe (text/markdown ou application/pdf) |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_FORBIDDEN : patient d'un autre praticien |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | PATIENT_NOT_FOUND |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | VALIDATION_FAILED : format absent ou différent de md et pdf |
| 500 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | EXPORT_FAILED : génération du PDF impossible |

## preferences-controller

### `GET /api/me/preferences`

**Préférences du compte (valeurs stockées complétées par les défauts)**

operationId : `getPreferences`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [Preferences](#schema-preferences) (*/*) | OK |

### `PATCH /api/me/preferences`

**Modifie les préférences (RFC 7396 : null = retour au défaut, clés inconnues ignorées)**

operationId : `updatePreferences`

Corps (`application/json`) : object

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [Preferences](#schema-preferences) (*/*) | OK |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Valeur hors domaine : errors[].field = clé fautive, rien n'est appliqué |

## profile-controller

### `GET /api/me/profile`

operationId : `get`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ProfileDto](#schema-profiledto) (*/*) | OK |

### `PUT /api/me/profile`

operationId : `update`

Corps (`application/json`) : [UpdateProfileRequest](#schema-updateprofilerequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ProfileDto](#schema-profiledto) (*/*) | OK |

### `POST /api/me/profile/photo`

operationId : `uploadPhoto`

Corps (`multipart/form-data`) : object

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ProfileDto](#schema-profiledto) (*/*) | OK |

### `DELETE /api/me/profile/photo`

operationId : `deletePhoto`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | — | OK |

### `POST /api/me/profile/publish`

operationId : `publish`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | — | OK |

### `POST /api/me/profile/unpublish`

operationId : `unpublish`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | — | OK |

## public-directory-controller

### `GET /api/public/directory`

operationId : `searchPublicDirectory`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `q` | query | string | non |  |
| `city` | query | string | non |  |
| `lat` | query | number (double) | non |  |
| `lng` | query | number (double) | non |  |
| `radiusKm` | query | number (double) | non |  |
| `professions` | query | string[] | non |  |
| `modalities` | query | string[] | non |  |
| `audiences` | query | string[] | non |  |
| `languages` | query | string[] | non |  |
| `accepting` | query | boolean | non |  |
| `sort` | query | string | non |  |
| `page` | query | integer (int32) | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [SearchResult](#schema-searchresult) (*/*) | OK |

### `GET /api/public/directory/practitioners/{slug}`

operationId : `getPublicPractitionerProfile`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `slug` | path | string | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [PublicProfile](#schema-publicprofile) (*/*) | OK |

### `POST /api/public/directory/practitioners/{slug}/contact`

**Envoie un message au praticien (relayé par e-mail, non rattaché à un dossier)**

Répond 202 sans corps pour tout envoi bien formé, y compris un envoi ignoré en silence (honeypot, formulaire soumis en moins de 3 s, fiche inconnue ou non publiée).

operationId : `submitContactRequest`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `slug` | path | string | oui |  |

Corps (`application/json`) : [SubmitContactRequest](#schema-submitcontactrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 202 | — | Accepté (ou ignoré en silence) |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Champs invalides (errors[] par champ) |
| 429 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Plus de 5 envois par heure depuis cette adresse (en-tête Retry-After) |

## search

### `GET /api/patients/{id}/search`

**Recherche dans le dossier d'un patient**

Recherche plein texte (français, sans accents, ts_rank_cd, boost x1,5 sous 90 jours), repli par trigrammes (résultats approchés, approximate=true) quand moins de 3 résultats exacts, extraits surlignés (balises mark), filtres et facettes. Le paramètre q accepte les jetons tag:xxx, émotion:xxx, avant:AAAA[-MM[-JJ]] et après:AAAA[-MM[-JJ]] (valeur entre guillemets possible) ; ils se cumulent avec les paramètres types, emotions, tags, from et to. Plusieurs valeurs d'un même filtre s'additionnent (ou), les filtres entre eux se combinent (et). Chaque facette ignore son propre filtre. Exception documentée à la pagination par curseur : pagination par numéro de page, 20 résultats par page (page 1 : exacts puis approchés ; pages suivantes : exacts seulement). Les entrées privées d'un autre praticien ne sont jamais renvoyées.

operationId : `searchPatientEntries`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui | Identifiant du patient |
| `q` | query | string | non | Texte et jetons de recherche, 200 caractères au maximum. Exemple : licenciement tag:travail émotion:anxiété après:2026-06 |
| `types` | query | string[] | non | Types d'entrée à retenir (note, event, situation, feeling, session, medication) ; paramètre répétable |
| `emotions` | query | string[] | non | Codes d'émotion à retenir (ressentis) ; paramètre répétable |
| `tags` | query | string[] | non | Libellés de tags à retenir, sans accents ni casse ; paramètre répétable |
| `from` | query | string | non | Début de période sur la date de l'entrée : instant ISO 8601 ou date AAAA-MM-JJ |
| `to` | query | string | non | Fin de période (incluse) : instant ISO 8601 ou date AAAA-MM-JJ (jour inclus) |
| `sessionId` | query | string (uuid) | non | Séance de rattachement des entrées |
| `includeArchived` | query | boolean | non | Inclure les entrées archivées (exclues par défaut) |
| `page` | query | integer (int32) | non | Numéro de page, à partir de 1 (20 résultats par page) |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntrySearchResultDto](#schema-entrysearchresultdto) (*/*) | Résultats, facettes et requête interprétée |
| 400 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Paramètre invalide (errors[] par champ, code SEARCH_BAD_REQUEST) |
| 403 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Le patient n'appartient pas au praticien courant |
| 404 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Patient inconnu |

## session-controller

### `POST /api/patients/{id}/sessions/contact`

operationId : `recordContact`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [RecordContactRequest](#schema-recordcontactrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryDto](#schema-entrydto) (*/*) | OK |

### `GET /api/patients/{id}/sessions/current`

operationId : `getCurrentSession`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryDto](#schema-entrydto) (*/*) | OK |

### `POST /api/patients/{id}/sessions/start`

operationId : `startSession`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [StartSessionRequest](#schema-startsessionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryDto](#schema-entrydto) (*/*) | OK |

### `POST /api/sessions/{id}/close`

operationId : `closeSession`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [CloseSessionRequest](#schema-closesessionrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryDto](#schema-entrydto) (*/*) | OK |

## tag-controller

### `GET /api/tags`

operationId : `list`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [TagView](#schema-tagview)[] (*/*) | OK |

### `POST /api/tags`

operationId : `create`

Corps (`application/json`) : [TagRequest](#schema-tagrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 201 | [TagView](#schema-tagview) (*/*) | Created |

### `PATCH /api/tags/{id}`

operationId : `rename`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [TagRequest](#schema-tagrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [TagView](#schema-tagview) (*/*) | OK |

### `POST /api/tags/{id}/merge`

operationId : `merge`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

Corps (`application/json`) : [MergeTagRequest](#schema-mergetagrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [TagView](#schema-tagview) (*/*) | OK |

## timeline-controller

### `GET /api/patients/{id}/timeline`

operationId : `getTimeline`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |
| `from` | query | string (date-time) | non |  |
| `to` | query | string (date-time) | non |  |
| `types` | query | string[] | non |  |
| `emotions` | query | string[] | non |  |
| `tags` | query | string[] | non |  |
| `draftsOnly` | query | boolean | non |  |
| `includePrivate` | query | boolean | non |  |
| `cursor` | query | string | non |  |
| `limit` | query | integer (int32) | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [TimelinePageDto](#schema-timelinepagedto) (*/*) | OK |

### `GET /api/patients/{id}/timeline/summary`

operationId : `getTimelineSummary`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |
| `granularity` | query | string | non |  |
| `from` | query | string (date-time) | non |  |
| `to` | query | string (date-time) | non |  |
| `includePrivate` | query | boolean | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [TimelineSummaryDto](#schema-timelinesummarydto) (*/*) | OK |

## two-factor-controller

### `POST /api/me/2fa/disable`

**Désactive la 2FA (mot de passe et code TOTP ou de secours)**

operationId : `disableTwoFactor`

Corps (`application/json`) : [TwoFactorDisableRequest](#schema-twofactordisablerequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Session absente |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TWO_FACTOR_NOT_ENABLED |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Mot de passe ou code incorrect (errors[] par champ) |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | 5 échecs : essais verrouillés 15 min |

### `POST /api/me/2fa/enable`

**Génère le secret TOTP (en attente) et l'URI otpauth:// du QR code**

operationId : `enableTwoFactor`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Session absente |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TWO_FACTOR_ALREADY_ENABLED |

### `POST /api/me/2fa/recovery-codes/regenerate`

**Remplace les codes de secours par 10 nouveaux (anciens invalidés)**

operationId : `regenerateRecoveryCodes`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Session absente |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TWO_FACTOR_NOT_ENABLED |

### `POST /api/me/2fa/verify`

**Vérifie le premier code, active la 2FA et renvoie 10 codes de secours (une fois)**

operationId : `verifyTwoFactor`

Corps (`application/json`) : [TwoFactorVerifyRequest](#schema-twofactorverifyrequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 401 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Session absente |
| 409 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | TWO_FACTOR_ALREADY_ENABLED ou TWO_FACTOR_NOT_STARTED |
| 422 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | Code incorrect (errors[] par champ) |
| 423 | [ProblemDetail](#schema-problemdetail) (application/problem+json) | 5 codes faux : essais verrouillés 15 min |

## verification-controller

### `PATCH /api/me/professional-info`

**Met à jour n° professionnel, téléphone, adresse et exercice à distance**

operationId : `updateProfessionalInfo`

Corps (`application/json`) : [ProfessionalInfoRequest](#schema-professionalinforequest)

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [ProfessionalInfoDto](#schema-professionalinfodto) (*/*) | OK |

### `GET /api/me/verification`

**État du dossier professionnel, justificatifs, pièces manquantes**

operationId : `getVerification`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [VerificationDto](#schema-verificationdto) (*/*) | OK |

### `POST /api/me/verification/documents`

**Dépose un justificatif (PDF, JPEG ou PNG, 10 Mo au maximum)**

operationId : `uploadDocument`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `type` | query | string | non |  |
| `title` | query | string | non |  |
| `issuer` | query | string | non |  |
| `year` | query | string | non |  |

Corps (`multipart/form-data`) : object

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [DocumentDto](#schema-documentdto) (*/*) | OK |

### `GET /api/me/verification/documents/{id}`

**Métadonnées d'un justificatif (403 s'il appartient à un autre praticien)**

operationId : `getDocument`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [DocumentDto](#schema-documentdto) (*/*) | OK |

### `DELETE /api/me/verification/documents/{id}`

**Retire un justificatif (docs_pending ou needs_more seulement)**

operationId : `deleteDocument`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | — | OK |

### `GET /api/me/verification/documents/{id}/file`

**Sert le justificatif déchiffré (URL signée, praticien propriétaire)**

operationId : `getDocumentFile`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |
| `exp` | query | integer (int64) | non |  |
| `sig` | query | string | non |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | string (byte) (*/*) | OK |

### `GET /api/me/verification/documents/{id}/url`

**URL signée de 5 minutes pour lire le justificatif déchiffré**

operationId : `getDocumentUrl`

| Paramètre | Dans | Type | Requis | Description |
| --- | --- | --- | --- | --- |
| `id` | path | string (uuid) | oui |  |

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [SignedUrlDto](#schema-signedurldto) (*/*) | OK |

### `POST /api/me/verification/submit`

**Soumet le dossier pour vérification (409 avec les pièces manquantes)**

operationId : `submitVerification`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [VerificationDto](#schema-verificationdto) (*/*) | OK |

## vocabulary-controller

### `GET /api/vocabulary/emotions`

operationId : `emotions`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EmotionView](#schema-emotionview)[] (*/*) | OK |

### `GET /api/vocabulary/entry-types`

operationId : `entryTypes`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [EntryTypeView](#schema-entrytypeview)[] (*/*) | OK |

### `GET /api/vocabulary/link-types`

operationId : `linkTypes`

| Réponse | Contenu | Description |
| --- | --- | --- |
| 200 | [LinkTypeView](#schema-linktypeview)[] (*/*) | OK |

## Schémas

### <a id="schema-accountdetaildto"></a>AccountDetailDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `appeals` | [AppealSummaryDto](#schema-appealsummarydto)[] | non |  |
| `city` | string | non |  |
| `createdAt` | string (date-time) | non |  |
| `decisions` | [DecisionItemDto](#schema-decisionitemdto)[] | non |  |
| `displayName` | string | non |  |
| `email` | string | non |  |
| `id` | string (uuid) | non |  |
| `lastLoginAt` | string (date-time) | non |  |
| `profession` | string | non |  |
| `purgeAt` | string (date-time) | non |  |
| `role` | string | non |  |
| `suspendedAt` | string (date-time) | non |  |
| `twoFactorEnabled` | boolean | non |  |
| `verification` | [VerificationDto](#schema-verificationdto) | non |  |

### <a id="schema-accountexportrequest"></a>AccountExportRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `email` | string | non |  |
| `otp` | string | non |  |
| `password` | string | non |  |

### <a id="schema-accountitemdto"></a>AccountItemDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `city` | string | non |  |
| `createdAt` | string (date-time) | non |  |
| `displayName` | string | non |  |
| `email` | string | non |  |
| `id` | string (uuid) | non |  |
| `lastLoginAt` | string (date-time) | non |  |
| `profession` | string | non |  |
| `purgeAt` | string (date-time) | non |  |
| `role` | string | non |  |
| `suspendedAt` | string (date-time) | non |  |
| `twoFactorEnabled` | boolean | non |  |
| `verification` | [VerificationDto](#schema-verificationdto) | non |  |

### <a id="schema-accountlistdto"></a>AccountListDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `counts` | object | non |  |
| `items` | [AccountItemDto](#schema-accountitemdto)[] | non |  |
| `nextCursor` | string | non |  |

### <a id="schema-activemedicationdto"></a>ActiveMedicationDto

Médicament en cours

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `dosage` | string | non |  |
| `entryId` | string (uuid) | non |  |
| `frequency` | string | non |  |
| `molecule` | string | non |  |
| `periodFrom` | string (date) | non | Début de la période de prise, si saisi |
| `periodTo` | string (date) | non | Fin de la période de prise, si saisie (nulle = en cours) |
| `prescriber` | string | non |  |
| `since` | string (date-time) | non | Début de l'entrée (occurred_from) |

### <a id="schema-activesituationdto"></a>ActiveSituationDto

Situation en cours (occurred_to nul)

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `averageIntensity` | number (double) | non | Moyenne des intensités de ces ressentis, null s'il n'y en a aucun |
| `entryId` | string (uuid) | non |  |
| `linkCount` | integer (int32) | non |  |
| `linkedFeelingCount` | integer (int32) | non | Ressentis non archivés reliés par un lien accepté, dans un sens ou l'autre |
| `since` | string (date-time) | non | Début (occurred_from) |
| `title` | string | non |  |

### <a id="schema-actordto"></a>ActorDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `displayName` | string | non |  |
| `id` | string (uuid) | non |  |

### <a id="schema-address"></a>Address

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `city` | string | non |  |
| `postalCode` | string | non |  |
| `street` | string | non |  |

### <a id="schema-addressdto"></a>AddressDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `city` | string | non |  |
| `postalCode` | string | non |  |
| `street` | string | non |  |

### <a id="schema-appealcreateddto"></a>AppealCreatedDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `id` | string (uuid) | non |  |
| `status` | string | non |  |
| `submittedAt` | string (date-time) | non |  |

### <a id="schema-appealdecisionrequest"></a>AppealDecisionRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `messageToPractitioner` | string | non |  |
| `outcome` | string | non |  |

### <a id="schema-appealitemdto"></a>AppealItemDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `decisionAdminId` | string (uuid) | non |  |
| `decisionId` | string (uuid) | non |  |
| `decisionKind` | string | non |  |
| `id` | string (uuid) | non |  |
| `message` | string | non |  |
| `outcome` | string | non |  |
| `practitionerDisplayName` | string | non |  |
| `practitionerId` | string (uuid) | non |  |
| `responseMessage` | string | non |  |
| `reviewedAt` | string (date-time) | non |  |
| `reviewedBy` | string (uuid) | non |  |
| `submittedAt` | string (date-time) | non |  |

### <a id="schema-appeallistdto"></a>AppealListDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `items` | [AppealItemDto](#schema-appealitemdto)[] | non |  |
| `nextCursor` | string | non |  |

### <a id="schema-appealrequest"></a>AppealRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `email` | string | non |  |
| `message` | string | non |  |
| `otp` | string | non |  |
| `password` | string | non |  |

### <a id="schema-appealsummarydto"></a>AppealSummaryDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `decisionId` | string (uuid) | non |  |
| `id` | string (uuid) | non |  |
| `message` | string | non |  |
| `outcome` | string | non |  |
| `responseMessage` | string | non |  |
| `reviewedAt` | string (date-time) | non |  |
| `submittedAt` | string (date-time) | non |  |

### <a id="schema-card"></a>Card

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `audiences` | string[] | non |  |
| `availability` | string | non |  |
| `bioExcerpt` | string | non |  |
| `city` | string | non |  |
| `displayName` | string | non |  |
| `distanceKm` | number (double) | non |  |
| `languages` | string[] | non |  |
| `modalities` | string[] | non |  |
| `photoUrl` | string | non |  |
| `profession` | string | non |  |
| `slug` | string | non |  |
| `specialties` | string[] | non |  |
| `titleLabel` | string | non |  |
| `verified` | boolean | non |  |

### <a id="schema-changelinktyperequest"></a>ChangeLinkTypeRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `linkType` | string | oui |  |

### <a id="schema-closesessionrequest"></a>CloseSessionRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `durationMin` | integer (int32) | non |  |
| `summary` | string | non |  |

### <a id="schema-consents"></a>Consents

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `privacy` | boolean | oui |  |
| `terms` | boolean | oui |  |

### <a id="schema-contactdto"></a>ContactDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | [AddressDto](#schema-addressdto) | non |  |
| `phone` | string | non |  |
| `professionalNumber` | string | non |  |
| `remoteOnly` | boolean | non |  |

### <a id="schema-createemotionrequest"></a>CreateEmotionRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `family` | string | non |  |
| `labelFr` | string | non |  |

### <a id="schema-createentryrequest"></a>CreateEntryRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `body` | string | non |  |
| `feeling` | [EntryFeelingRequest](#schema-entryfeelingrequest) | non |  |
| `links` | [EntryLinkRequest](#schema-entrylinkrequest)[] | non |  |
| `medication` | [EntryMedicationRequest](#schema-entrymedicationrequest) | non |  |
| `occurred` | [EntryOccurredRequest](#schema-entryoccurredrequest) | non |  |
| `session` | [EntrySessionRequest](#schema-entrysessionrequest) | non |  |
| `sessionId` | string (uuid) | non |  |
| `status` | string | non |  |
| `tags` | string[] | non |  |
| `title` | string | non |  |
| `type` | string | non |  |
| `visibility` | string | non |  |

### <a id="schema-createlinkrequest"></a>CreateLinkRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `direction` | string | non |  |
| `linkType` | string | oui |  |
| `rationale` | string | non |  |
| `targetId` | string (uuid) | oui |  |

### <a id="schema-createpatientrequest"></a>CreatePatientRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `birthDate` | string (date) | non |  |
| `context` | object | non |  |
| `displayName` | string | non |  |
| `email` | string | non |  |
| `firstName` | string | non |  |
| `flags` | [FlagRequest](#schema-flagrequest)[] | non |  |
| `followUp` | object | non |  |
| `lastName` | string | non |  |
| `phone` | string | non |  |
| `pronoun` | string | non |  |
| `tags` | string[] | non |  |

### <a id="schema-createrequest"></a>CreateRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non |  |
| `kind` | string | non |  |
| `labelEn` | string | non |  |
| `labelFr` | string | non |  |
| `sortOrder` | integer (int32) | non |  |

### <a id="schema-decisiondto"></a>DecisionDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `decidedAt` | string (date-time) | non |  |
| `kind` | string | non |  |
| `message` | string | non |  |

### <a id="schema-decisionitemdto"></a>DecisionItemDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `adminId` | string (uuid) | non |  |
| `checklist` | object | non |  |
| `decidedAt` | string (date-time) | non |  |
| `id` | string (uuid) | non |  |
| `internalNote` | string | non |  |
| `kind` | string | non |  |
| `messageToPractitioner` | string | non |  |

### <a id="schema-decisionrequest"></a>DecisionRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `checklist` | object | non |  |
| `force` | boolean | non |  |
| `internalNote` | string | non |  |
| `kind` | string | non |  |
| `messageToPractitioner` | string | non |  |

### <a id="schema-directoryvocabularydto"></a>DirectoryVocabularyDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `audiences` | [Item](#schema-item)[] | non |  |
| `languages` | [Item](#schema-item)[] | non |  |
| `modalities` | [Item](#schema-item)[] | non |  |
| `specialties` | [Item](#schema-item)[] | non |  |

### <a id="schema-documentdto"></a>DocumentDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `id` | string (uuid) | non |  |
| `issuer` | string | non |  |
| `mime` | string | non |  |
| `purged` | boolean | non |  |
| `reviewedStatus` | string | non |  |
| `sizeBytes` | integer (int32) | non |  |
| `title` | string | non |  |
| `type` | string | non |  |
| `uploadedAt` | string (date-time) | non |  |
| `year` | integer (int32) | non |  |

### <a id="schema-dossierdto"></a>DossierDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `contact` | [ContactDto](#schema-contactdto) | non |  |
| `createdAt` | string (date-time) | non |  |
| `decisions` | [DecisionItemDto](#schema-decisionitemdto)[] | non |  |
| `displayName` | string | non |  |
| `documents` | [DocumentDto](#schema-documentdto)[] | non |  |
| `email` | string | non |  |
| `emailConfirmedAt` | string (date-time) | non |  |
| `firstName` | string | non |  |
| `lastName` | string | non |  |
| `locale` | string | non |  |
| `overdue` | boolean | non |  |
| `practitionerId` | string (uuid) | non |  |
| `profession` | string | non |  |
| `submittedAt` | string (date-time) | non |  |
| `verificationStatus` | string | non |  |
| `verifiedAt` | string (date-time) | non |  |

### <a id="schema-draftsdto"></a>DraftsDto

Brouillons et séance ouverte

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `count` | integer (int32) | non | Entrées en brouillon non archivées |
| `openSession` | [OpenSessionDto](#schema-opensessiondto) | non | Séance non clôturée la plus récente, null s'il n'y en a pas |

### <a id="schema-emailchangerequest"></a>EmailChangeRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `email` | string | oui |  |
| `newEmail` | string (email) | oui |  |
| `password` | string | oui |  |

### <a id="schema-emailconfirmrequest"></a>EmailConfirmRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `token` | string | oui |  |

### <a id="schema-emailresendrequest"></a>EmailResendRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `email` | string (email) | oui |  |

### <a id="schema-emotionview"></a>EmotionView

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `active` | boolean | non |  |
| `code` | string | non |  |
| `family` | string | non |  |
| `intensityLevel` | integer (int32) | non |  |
| `labelEn` | string | non |  |
| `labelFr` | string | non |  |
| `scope` | string | non |  |

### <a id="schema-emotionsdto"></a>EmotionsDto

Émotions dominantes de la fenêtre

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `top` | [TopEmotionDto](#schema-topemotiondto)[] | non | 5 au plus, par effectif décroissant |

### <a id="schema-entrydto"></a>EntryDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `archivedAt` | string (date-time) | non |  |
| `authorType` | string | non |  |
| `body` | string | non |  |
| `feeling` | [EntryFeelingDto](#schema-entryfeelingdto) | non |  |
| `id` | string (uuid) | non |  |
| `linkCount` | integer (int32) | non |  |
| `links` | [EntryLinkDto](#schema-entrylinkdto)[] | non |  |
| `medication` | [EntryMedicationDto](#schema-entrymedicationdto) | non |  |
| `occurred` | [EntryOccurredDto](#schema-entryoccurreddto) | non |  |
| `patientId` | string (uuid) | non |  |
| `recordedAt` | string (date-time) | non |  |
| `session` | [EntrySessionDto](#schema-entrysessiondto) | non |  |
| `sessionId` | string (uuid) | non |  |
| `status` | string | non |  |
| `tags` | string[] | non |  |
| `title` | string | non |  |
| `type` | string | non |  |
| `version` | integer (int32) | non |  |
| `visibility` | string | non |  |

### <a id="schema-entryfeelingdto"></a>EntryFeelingDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `arousal` | integer (int32) | non |  |
| `emotionCode` | string | non |  |
| `family` | string | non |  |
| `intensity` | integer (int32) | non |  |
| `valence` | integer (int32) | non |  |

### <a id="schema-entryfeelingrequest"></a>EntryFeelingRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `emotionCode` | string | non |  |
| `intensity` | integer (int32) | non |  |

### <a id="schema-entrylinkdto"></a>EntryLinkDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `id` | string (uuid) | non |  |
| `label` | string | non |  |
| `linkType` | string | non |  |
| `sourceId` | string (uuid) | non |  |
| `targetId` | string (uuid) | non |  |

### <a id="schema-entrylinkrequest"></a>EntryLinkRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `direction` | string | non |  |
| `linkType` | string | non |  |
| `targetId` | string (uuid) | non |  |

### <a id="schema-entrymedicationdto"></a>EntryMedicationDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `dosage` | string | non |  |
| `frequency` | string | non |  |
| `molecule` | string | non |  |
| `periodFrom` | string (date) | non |  |
| `periodTo` | string (date) | non |  |
| `prescriber` | string | non |  |

### <a id="schema-entrymedicationrequest"></a>EntryMedicationRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `dosage` | string | non |  |
| `frequency` | string | non |  |
| `molecule` | string | non |  |
| `periodFrom` | string (date) | non |  |
| `periodTo` | string (date) | non |  |
| `prescriber` | string | non |  |

### <a id="schema-entryoccurreddto"></a>EntryOccurredDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `from` | string (date-time) | non |  |
| `label` | string | non |  |
| `precision` | string | non |  |
| `to` | string (date-time) | non |  |

### <a id="schema-entryoccurredrequest"></a>EntryOccurredRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `from` | string (date-time) | non |  |
| `label` | string | non |  |
| `precision` | string | non |  |
| `to` | string (date-time) | non |  |

### <a id="schema-entrysearchemotionfacetdto"></a>EntrySearchEmotionFacetDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non |  |
| `count` | integer (int32) | non |  |
| `label` | string | non |  |

### <a id="schema-entrysearchfacetsdto"></a>EntrySearchFacetsDto

Compteurs sur les résultats exacts ; chaque facette ignore son propre filtre pour que les puces gardent leur compteur.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `emotions` | [EntrySearchEmotionFacetDto](#schema-entrysearchemotionfacetdto)[] | non |  |
| `tags` | [EntrySearchTagFacetDto](#schema-entrysearchtagfacetdto)[] | non |  |
| `types` | [EntrySearchTypeFacetDto](#schema-entrysearchtypefacetdto)[] | non |  |

### <a id="schema-entrysearchitemdto"></a>EntrySearchItemDto

Une entrée trouvée. title et snippet sont des fragments HTML échappés.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `approximate` | boolean | non | true pour un résultat approché (tolérance aux fautes) |
| `archivedAt` | string (date-time) | non |  |
| `emotionCode` | string | non | Code de l'émotion pour un ressenti, sinon null |
| `entryId` | string (uuid) | non |  |
| `occurredFrom` | string (date-time) | non |  |
| `occurredPrecision` | string | non |  |
| `occurredTo` | string (date-time) | non |  |
| `rank` | number (double) | non | Pertinence (ts_rank_cd, multipliée par 1,5 sous 90 jours) ; null pour un résultat approché ou sans texte |
| `sessionId` | string (uuid) | non |  |
| `similarity` | number (double) | non | Similarité trigramme (0 à 1) ; null pour un résultat exact |
| `snippet` | string | non | Extrait du corps en HTML échappé avec mark ; null si l'entrée n'a pas de corps |
| `tags` | string[] | non | Libellés des tags |
| `title` | string | non | Titre en HTML échappé, mots trouvés entre mark si la recherche a un texte |
| `type` | string | non | Code du type d'entrée (note, event, situation, feeling, ...) |
| `version` | integer (int32) | non | Version courante de l'entrée |
| `visibility` | string | non | private ou clinical |

### <a id="schema-entrysearchquerydto"></a>EntrySearchQueryDto

Requête telle que le serveur l'a interprétée à partir du paramètre q.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `after` | string (date-time) | non | Borne inclusive déduite de après: / after: (UTC), ou null |
| `before` | string (date-time) | non | Borne exclusive de avant: / before: (UTC), ou null |
| `emotions` | string[] | non | Valeurs des jetons émotion: / emotion: |
| `tags` | string[] | non | Valeurs des jetons tag: |
| `text` | string | non | Texte libre restant après retrait des jetons (tag:, émotion:, ...) |

### <a id="schema-entrysearchresultdto"></a>EntrySearchResultDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `approximateCount` | integer (int32) | non | Résultats approchés dans items (page 1 seulement) |
| `exactCount` | integer (int32) | non | Résultats exacts dans items |
| `facets` | [EntrySearchFacetsDto](#schema-entrysearchfacetsdto) | non |  |
| `items` | [EntrySearchItemDto](#schema-entrysearchitemdto)[] | non | Exacts d'abord, puis approchés |
| `page` | integer (int32) | non | Numéro de page, à partir de 1 |
| `pageSize` | integer (int32) | non | Taille de page (20) |
| `query` | [EntrySearchQueryDto](#schema-entrysearchquerydto) | non |  |
| `tookMs` | integer (int64) | non | Durée de traitement côté serveur, en millisecondes |
| `total` | integer (int64) | non | Nombre total de résultats exacts, hors approchés |

### <a id="schema-entrysearchtagfacetdto"></a>EntrySearchTagFacetDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `count` | integer (int32) | non |  |
| `id` | string (uuid) | non |  |
| `label` | string | non |  |

### <a id="schema-entrysearchtypefacetdto"></a>EntrySearchTypeFacetDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non |  |
| `count` | integer (int32) | non |  |

### <a id="schema-entrysessiondto"></a>EntrySessionDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `closedAt` | string (date-time) | non |  |
| `durationMin` | integer (int32) | non |  |
| `kind` | string | non |  |
| `modality` | string | non |  |

### <a id="schema-entrysessionrequest"></a>EntrySessionRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `durationMin` | integer (int32) | non |  |
| `modality` | string | non |  |

### <a id="schema-entrytypeview"></a>EntryTypeView

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non |  |
| `detailTable` | string | non |  |
| `hasDuration` | boolean | non |  |
| `labelEn` | string | non |  |
| `labelFr` | string | non |  |
| `sortOrder` | integer (int32) | non |  |

### <a id="schema-entryversiondto"></a>EntryVersionDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `authorId` | string (uuid) | non |  |
| `authorType` | string | non |  |
| `body` | string | non |  |
| `createdAt` | string (date-time) | non |  |
| `reason` | string | non |  |
| `title` | string | non |  |
| `version` | integer (int32) | non |  |

### <a id="schema-expandgraphrequest"></a>ExpandGraphRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `memberIds` | string (uuid)[] | non |  |
| `superNodeId` | string | non |  |

### <a id="schema-exportrequesteddto"></a>ExportRequestedDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `jobId` | string (uuid) | non |  |
| `statusUrl` | string | non |  |

### <a id="schema-exportstatusdto"></a>ExportStatusDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `downloadUrl` | string | non |  |
| `error` | string | non |  |
| `expiresAt` | string (date-time) | non |  |
| `finishedAt` | string (date-time) | non |  |
| `jobId` | string (uuid) | non |  |
| `requestedAt` | string (date-time) | non |  |
| `status` | string | non |  |

### <a id="schema-facetcount"></a>FacetCount

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non |  |
| `count` | integer (int64) | non |  |

### <a id="schema-facets"></a>Facets

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `audiences` | [FacetCount](#schema-facetcount)[] | non |  |
| `languages` | [FacetCount](#schema-facetcount)[] | non |  |
| `modalities` | [FacetCount](#schema-facetcount)[] | non |  |
| `professions` | [FacetCount](#schema-facetcount)[] | non |  |

### <a id="schema-feelingpointdto"></a>FeelingPointDto

Un ressenti : une valeur par point

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `at` | string (date-time) | non | occurred_from de l'entrée |
| `date` | string (date) | non | Jour UTC de placement (milieu de période, plafonné à aujourd'hui) |
| `emotionCode` | string | non |  |
| `entryId` | string (uuid) | non |  |
| `family` | string | non | Famille de l'émotion (joy, trust, fear, ...) |
| `intensity` | integer (int32) | non | 0 à 10 |
| `sessionId` | string (uuid) | non | Séance de rattachement |
| `valence` | integer (int32) | non | -2 à 2, null si inconnue |

### <a id="schema-feelingseriesdto"></a>FeelingSeriesDto

Série de la courbe : une émotion de la fenêtre

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `count` | integer (int32) | non | Nombre de ressentis de cette émotion dans la fenêtre |
| `emotionCode` | string | non |  |
| `family` | string | non |  |
| `label` | string | non | Libellé français |
| `labelEn` | string | non | Libellé anglais, null s'il n'existe pas |

### <a id="schema-feelingsdto"></a>FeelingsDto

Ressentis réels de la fenêtre, repères de médicament et jours de séance

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `markers` | [TrendMarkerDto](#schema-trendmarkerdto)[] | non | Repères de médicament (début, fin) de la fenêtre |
| `points` | [FeelingPointDto](#schema-feelingpointdto)[] | non | Exactement un point par ressenti non archivé de la fenêtre |
| `series` | [FeelingSeriesDto](#schema-feelingseriesdto)[] | non | Une entrée par émotion présente dans la fenêtre, par effectif décroissant |
| `ticks` | string (date)[] | non | Jours des séances de la fenêtre, croissants, sans doublon |

### <a id="schema-flagdto"></a>FlagDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `kind` | string | non |  |
| `reason` | string | non |  |
| `setAt` | string (date-time) | non |  |

### <a id="schema-flagrequest"></a>FlagRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `kind` | string | non |  |
| `reason` | string | non |  |

### <a id="schema-graphdto"></a>GraphDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `edges` | [GraphEdgeDto](#schema-graphedgedto)[] | non |  |
| `nodes` | [GraphNodeDto](#schema-graphnodedto)[] | non |  |
| `superNodes` | [GraphSuperNodeDto](#schema-graphsupernodedto)[] | non |  |
| `truncated` | boolean | non |  |

### <a id="schema-graphedgedto"></a>GraphEdgeDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `directed` | boolean | non |  |
| `id` | string (uuid) | non |  |
| `linkType` | string | non |  |
| `provenance` | string | non |  |
| `source` | string (uuid) | non |  |
| `status` | string | non |  |
| `target` | string (uuid) | non |  |

### <a id="schema-graphnodedto"></a>GraphNodeDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `authorType` | string | non |  |
| `degree` | integer (int32) | non |  |
| `distance` | integer (int32) | non |  |
| `emotion` | string | non |  |
| `id` | string (uuid) | non |  |
| `intensity` | integer (int32) | non |  |
| `occurred` | string (date-time) | non |  |
| `title` | string | non |  |
| `type` | string | non |  |

### <a id="schema-graphsupernodedto"></a>GraphSuperNodeDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `count` | integer (int32) | non |  |
| `dominantEmotion` | string | non |  |
| `id` | string | non |  |
| `memberIds` | string (uuid)[] | non |  |
| `neighborId` | string (uuid) | non |  |
| `type` | string | non |  |

### <a id="schema-item"></a>Item

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non |  |
| `labelEn` | string | non |  |
| `labelFr` | string | non |  |

### <a id="schema-itemdto"></a>ItemDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `active` | boolean | non |  |
| `code` | string | non |  |
| `kind` | string | non |  |
| `labelEn` | string | non |  |
| `labelFr` | string | non |  |
| `sortOrder` | integer (int32) | non |  |
| `usedByPublishedProfiles` | integer (int32) | non |  |

### <a id="schema-journaldto"></a>JournalDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `items` | [JournalItemDto](#schema-journalitemdto)[] | non |  |
| `nextCursor` | string | non |  |

### <a id="schema-journalitemdto"></a>JournalItemDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `actor` | [ActorDto](#schema-actordto) | non |  |
| `actorType` | string | non |  |
| `at` | string (date-time) | non |  |
| `details` | object | non |  |
| `id` | string (uuid) | non |  |
| `kind` | string | non |  |
| `practitionerDisplayName` | string | non |  |
| `practitionerId` | string (uuid) | non |  |
| `source` | string | non |  |
| `summary` | string | non |  |

### <a id="schema-linkdto"></a>LinkDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `authorId` | string (uuid) | non |  |
| `createdAt` | string (date-time) | non |  |
| `id` | string (uuid) | non |  |
| `label` | string | non |  |
| `linkType` | string | non |  |
| `provenance` | string | non |  |
| `rationale` | string | non |  |
| `sentence` | string | non |  |
| `sourceId` | string (uuid) | non |  |
| `status` | string | non |  |
| `targetId` | string (uuid) | non |  |

### <a id="schema-linktypeview"></a>LinkTypeView

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `allowedSourceTypes` | string[] | non |  |
| `allowedTargetTypes` | string[] | non |  |
| `code` | string | non |  |
| `directed` | boolean | non |  |
| `inverseLabelEn` | string | non |  |
| `inverseLabelFr` | string | non |  |
| `labelEn` | string | non |  |
| `labelFr` | string | non |  |
| `lineStyle` | string | non |  |
| `sortOrder` | integer (int32) | non |  |

### <a id="schema-listdto"></a>ListDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `items` | [ItemDto](#schema-itemdto)[] | non |  |

### <a id="schema-loginrequest"></a>LoginRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `email` | string | oui |  |
| `otp` | string | non |  |
| `password` | string | oui |  |
| `rememberMe` | boolean | non |  |

### <a id="schema-meresponse"></a>MeResponse

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `displayName` | string | non |  |
| `email` | string | non |  |
| `id` | string (uuid) | non |  |
| `profession` | string | non |  |
| `tenantId` | string (uuid) | non |  |
| `verificationStatus` | string | non |  |

### <a id="schema-mergeemotionrequest"></a>MergeEmotionRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetCode` | string | non |  |

### <a id="schema-mergetagrequest"></a>MergeTagRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetId` | string (uuid) | non |  |

### <a id="schema-mergeview"></a>MergeView

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `affectedCount` | integer (int32) | non |  |
| `id` | string (uuid) | non |  |
| `mergedAt` | string (date-time) | non |  |
| `sourceCode` | string | non |  |
| `targetCode` | string | non |  |
| `undoUntil` | string (date-time) | non |  |
| `undoneAt` | string (date-time) | non |  |

### <a id="schema-narrativedto"></a>NarrativeDto

Résumé rédigé par règles (jusqu'à 5 phrases, chacune omise si ses données manquent, sans IA), dans la langue de la requête (Accept-Language : français par défaut, anglais si demandé)

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `attention` | string | non | Point d'attention issu des drapeaux actifs, null sans drapeau |
| `sentences` | string[] | non | Phrases dans l'ordre cadre, tendance, situations, événement, traitement ; chacune est omise si ses données manquent |

### <a id="schema-opensessiondto"></a>OpenSessionDto

Séance ouverte

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `entryId` | string (uuid) | non |  |
| `startedAt` | string (date-time) | non |  |

### <a id="schema-otprequireddto"></a>OtpRequiredDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `otpRequired` | boolean | non |  |

### <a id="schema-otprequiredresponse"></a>OtpRequiredResponse

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `otpRequired` | boolean | non |  |

### <a id="schema-overviewdto"></a>OverviewDto

Vue d'ensemble d'un patient pour une fenêtre (30d, 90d ou 12m).

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `activeSituations` | [ActiveSituationDto](#schema-activesituationdto)[] | non | Situations en cours, triées par nombre de liens décroissant |
| `computedAt` | string (date-time) | non | Instant (UTC) du calcul de la projection |
| `drafts` | [DraftsDto](#schema-draftsdto) | non |  |
| `emotions` | [EmotionsDto](#schema-emotionsdto) | non |  |
| `facts` | [OverviewFactsDto](#schema-overviewfactsdto) | non |  |
| `feelings` | [FeelingsDto](#schema-feelingsdto) | non | Ressentis réels de la fenêtre : un point par ressenti |
| `narrative` | [NarrativeDto](#schema-narrativedto) | non | Résumé « En bref » rédigé par règles, dans la langue de la requête |
| `recentActivity` | [RecentActivityItemDto](#schema-recentactivityitemdto)[] | non | 10 dernières entrées non archivées, lues en direct (hors projection) |
| `recentSessions` | [RecentSessionDto](#schema-recentsessiondto)[] | non | 5 dernières séances, la plus récente avec son compte rendu entier |
| `sinceLastSession` | [SinceLastSessionDto](#schema-sincelastsessiondto) | non | Entrées saisies depuis la dernière séance clôturée |
| `sourceRev` | integer (int64) | non | patient.clinical_rev au moment du calcul de la projection |
| `trend` | [TrendDto](#schema-trenddto) | non |  |
| `window` | string | non | Fenêtre appliquée à trend et emotions : 30d, 90d ou 12m |

### <a id="schema-overviewfactsdto"></a>OverviewFactsDto

Faits clés du patient

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `activeMedications` | [ActiveMedicationDto](#schema-activemedicationdto)[] | non |  |
| `age` | integer (int32) | non | Âge en années, null sans date de naissance |
| `flags` | [OverviewFlagDto](#schema-overviewflagdto)[] | non | Drapeaux actifs (non levés) |
| `followedSince` | string (date) | non | follow_up.since, sinon la date de création du dossier |
| `sessionCount` | integer (int32) | non | Nombre de séances non archivées |

### <a id="schema-overviewflagdto"></a>OverviewFlagDto

Drapeau actif posé à la main sur le dossier

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `kind` | string | non | watch, risk ou shared_care |
| `reason` | string | non |  |
| `setAt` | string (date-time) | non |  |

### <a id="schema-passwordchangerequest"></a>PasswordChangeRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `currentPassword` | string | oui |  |
| `email` | string | oui |  |
| `newPassword` | string | oui |  |
| `otp` | string | non |  |

### <a id="schema-passwordresetconfirmrequest"></a>PasswordResetConfirmRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `password` | string | oui |  |
| `token` | string | oui |  |

### <a id="schema-passwordresetrequest"></a>PasswordResetRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `email` | string (email) | oui |  |

### <a id="schema-patchentryrequest"></a>PatchEntryRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `body` | string | non |  |
| `feeling` | [EntryFeelingRequest](#schema-entryfeelingrequest) | non |  |
| `medication` | [EntryMedicationRequest](#schema-entrymedicationrequest) | non |  |
| `occurred` | [EntryOccurredRequest](#schema-entryoccurredrequest) | non |  |
| `reason` | string | non |  |
| `session` | [EntrySessionRequest](#schema-entrysessionrequest) | non |  |
| `status` | string | non |  |
| `tags` | string[] | non |  |
| `title` | string | non |  |
| `visibility` | string | non |  |

### <a id="schema-patchrequest"></a>PatchRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `active` | boolean | non |  |
| `labelEn` | string | non |  |
| `labelFr` | string | non |  |
| `sortOrder` | integer (int32) | non |  |

### <a id="schema-patientdto"></a>PatientDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `archivedAt` | string (date-time) | non |  |
| `birthDate` | string (date) | non |  |
| `context` | object | non |  |
| `createdAt` | string (date-time) | non |  |
| `currentVersion` | integer (int32) | non |  |
| `displayName` | string | non |  |
| `email` | string | non |  |
| `firstName` | string | non |  |
| `flags` | [FlagDto](#schema-flagdto)[] | non |  |
| `followUp` | object | non |  |
| `id` | string (uuid) | non |  |
| `lastName` | string | non |  |
| `phone` | string | non |  |
| `pronoun` | string | non |  |
| `tags` | [TagDto](#schema-tagdto)[] | non |  |
| `updatedAt` | string (date-time) | non |  |

### <a id="schema-patientpage"></a>PatientPage

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `items` | [PatientDto](#schema-patientdto)[] | non |  |
| `nextCursor` | string | non |  |

### <a id="schema-preferences"></a>Preferences

Préférences à plat du compte ; en PATCH, toutes les clés sont optionnelles.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `entries.defaultVisibility` | `clinical` \| `private` | non |  |
| `entryTypes.medicationVisible` | boolean | non | Défaut : true pour un psychiatre, false sinon |
| `locale` | `fr` \| `en` | non |  |
| `overview.view` | `simple` \| `complete` | non |  |
| `overview.window` | `30d` \| `90d` \| `12m` | non |  |
| `sessions.defaultDurationMin` | integer (int32) | non |  |
| `theme` | `light` \| `soft` \| `dark` \| `system` | non |  |
| `timeline.groupBy` | `session` \| `month` \| `chronological` | non |  |
| `vocabulary.subjectLabel` | `patient` \| `client` | non | Défaut : client pour un coach, patient sinon |

### <a id="schema-problemdetail"></a>ProblemDetail

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `detail` | string | non |  |
| `instance` | string (uri) | non |  |
| `properties` | object | non |  |
| `status` | integer (int32) | non |  |
| `title` | string | non |  |
| `type` | string (uri) | non |  |

### <a id="schema-professionalinfodto"></a>ProfessionalInfoDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | [AddressDto](#schema-addressdto) | non |  |
| `phone` | string | non |  |
| `professionalNumber` | string | non |  |
| `remoteOnly` | boolean | non |  |

### <a id="schema-professionalinforequest"></a>ProfessionalInfoRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | [AddressDto](#schema-addressdto) | non |  |
| `phone` | string | non |  |
| `professionalNumber` | string | non |  |
| `remoteOnly` | boolean | non |  |

### <a id="schema-profiledto"></a>ProfileDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | string | non |  |
| `audiences` | string[] | non |  |
| `availability` | string | non |  |
| `bio` | string | non |  |
| `city` | string | non |  |
| `contactEmail` | string | non |  |
| `contactPhone` | string | non |  |
| `country` | string | non |  |
| `displayName` | string | non |  |
| `fees` | string | non |  |
| `languages` | string[] | non |  |
| `modalities` | string[] | non |  |
| `nextSlotAt` | string (date) | non |  |
| `photoAssetKey` | string | non |  |
| `postalCode` | string | non |  |
| `profession` | string | non |  |
| `published` | boolean | non |  |
| `publishedAt` | string (date-time) | non |  |
| `responseDelay` | string | non |  |
| `showAddress` | boolean | non |  |
| `showEmail` | boolean | non |  |
| `showPhone` | boolean | non |  |
| `showProfessionalNumber` | boolean | non |  |
| `slug` | string | non |  |
| `specialties` | string[] | non |  |
| `titleLabel` | string | non |  |
| `updatedAt` | string (date-time) | non |  |
| `websiteUrl` | string | non |  |

### <a id="schema-publicprofile"></a>PublicProfile

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | string | non |  |
| `audiences` | string[] | non |  |
| `availability` | string | non |  |
| `bio` | string | non |  |
| `city` | string | non |  |
| `country` | string | non |  |
| `displayName` | string | non |  |
| `email` | string | non |  |
| `fees` | string | non |  |
| `languages` | string[] | non |  |
| `modalities` | string[] | non |  |
| `nextSlotAt` | string (date) | non |  |
| `phone` | string | non |  |
| `photoUrl` | string | non |  |
| `postalCode` | string | non |  |
| `profession` | string | non |  |
| `professionalNumber` | string | non |  |
| `publishedAt` | string (date-time) | non |  |
| `responseDelay` | string | non |  |
| `slug` | string | non |  |
| `specialties` | string[] | non |  |
| `titleLabel` | string | non |  |
| `verified` | boolean | non |  |
| `websiteUrl` | string | non |  |

### <a id="schema-queuedto"></a>QueueDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `items` | [QueueItemDto](#schema-queueitemdto)[] | non |  |
| `nextCursor` | string | non |  |

### <a id="schema-queueitemdto"></a>QueueItemDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `city` | string | non |  |
| `displayName` | string | non |  |
| `documentsCount` | integer (int32) | non |  |
| `missingHints` | string[] | non |  |
| `overdue` | boolean | non |  |
| `practitionerId` | string (uuid) | non |  |
| `profession` | string | non |  |
| `submittedAt` | string (date-time) | non |  |

### <a id="schema-reactivatedto"></a>ReactivateDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `decisionId` | string (uuid) | non |  |
| `id` | string (uuid) | non |  |
| `verificationStatus` | string | non |  |

### <a id="schema-reasonrequest"></a>ReasonRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `reason` | string | non |  |

### <a id="schema-recentactivityitemdto"></a>RecentActivityItemDto

Entrée récente

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `entryId` | string (uuid) | non |  |
| `occurredFrom` | string (date-time) | non |  |
| `occurredTo` | string (date-time) | non |  |
| `recordedAt` | string (date-time) | non |  |
| `sessionId` | string (uuid) | non |  |
| `status` | string | non | draft ou final |
| `title` | string | non |  |
| `type` | string | non |  |
| `version` | integer (int32) | non | Version courante |
| `visibility` | string | non | private ou clinical |

### <a id="schema-recentsessiondto"></a>RecentSessionDto

Séance récente ; seule la plus récente porte le compte rendu entier

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `closedAt` | string (date-time) | non | Clôture, null si la séance est ouverte |
| `durationMin` | integer (int32) | non |  |
| `entryCount` | integer (int32) | non | Entrées non archivées rattachées à la séance |
| `entryId` | string (uuid) | non |  |
| `kind` | string | non | intake, session ou contact |
| `modality` | string | non | in_person, video, phone ou email |
| `occurredFrom` | string (date-time) | non |  |
| `summary` | string | non | Compte rendu entier (séance la plus récente seulement), sinon null |
| `summaryFirstLine` | string | non | Première ligne du compte rendu, null sans compte rendu |
| `title` | string | non |  |

### <a id="schema-recordcontactrequest"></a>RecordContactRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `body` | string | oui |  |
| `modality` | string | oui |  |
| `occurredFrom` | string (date-time) | oui |  |

### <a id="schema-registerrequest"></a>RegisterRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | [Address](#schema-address) | non |  |
| `consents` | [Consents](#schema-consents) | oui |  |
| `email` | string (email) | oui |  |
| `firstName` | string | oui |  |
| `lastName` | string | oui |  |
| `password` | string | oui |  |
| `phone` | string | oui |  |
| `profession` | string | oui |  |
| `professionalNumber` | string | non |  |
| `remoteOnly` | boolean | non |  |

### <a id="schema-registerresponse"></a>RegisterResponse

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `status` | string | non |  |

### <a id="schema-renameemotionrequest"></a>RenameEmotionRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `labelFr` | string | non |  |

### <a id="schema-reviewrequest"></a>ReviewRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `reviewedStatus` | string | non |  |

### <a id="schema-revokedsessionsresponse"></a>RevokedSessionsResponse

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `revoked` | integer (int32) | non |  |

### <a id="schema-searchresult"></a>SearchResult

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `facets` | [Facets](#schema-facets) | non |  |
| `items` | [Card](#schema-card)[] | non |  |
| `page` | integer (int32) | non |  |
| `pageSize` | integer (int32) | non |  |
| `total` | integer (int64) | non |  |
| `totalPages` | integer (int32) | non |  |

### <a id="schema-sessionresponse"></a>SessionResponse

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `displayName` | string | non |  |
| `email` | string | non |  |
| `emailConfirmed` | boolean | non |  |
| `id` | string (uuid) | non |  |
| `profession` | string | non |  |
| `verificationStatus` | string | non |  |

### <a id="schema-signedurldto"></a>SignedUrlDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `expiresAt` | string (date-time) | non |  |
| `url` | string | non |  |

### <a id="schema-sincelastsessiondto"></a>SinceLastSessionDto

Entrées postérieures à la dernière séance clôturée

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `entries` | [SinceLastSessionEntryDto](#schema-sincelastsessionentrydto)[] | non | 20 au plus, de la plus récente à la plus ancienne |
| `lastSessionAt` | string (date-time) | non | occurred_from de cette séance, null s'il n'y en a pas |
| `lastSessionId` | string (uuid) | non | Dernière séance clôturée non archivée, null s'il n'y en a pas |

### <a id="schema-sincelastsessionentrydto"></a>SinceLastSessionEntryDto

Entrée saisie depuis la dernière séance clôturée

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `entryId` | string (uuid) | non |  |
| `occurredFrom` | string (date-time) | non |  |
| `sessionId` | string (uuid) | non |  |
| `status` | string | non | draft ou final |
| `title` | string | non |  |
| `type` | string | non |  |
| `visibility` | string | non | private ou clinical |

### <a id="schema-startsessionrequest"></a>StartSessionRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `modality` | string | oui |  |

### <a id="schema-submitcontactrequest"></a>SubmitContactRequest

Message d'un visiteur à un praticien, relayé par e-mail.

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `consent` | boolean | oui | Consentement au traitement du message ; doit valoir true |
| `email` | string (email) | oui | E-mail du visiteur (réponse du praticien) |
| `formShownAt` | string (date-time) | oui | Instant (ISO 8601, UTC) d'affichage du formulaire ; un envoi dans les 3 s est ignoré |
| `message` | string | oui | Message |
| `name` | string | oui | Nom du visiteur |
| `subject` | string | non | Objet (optionnel) |
| `website` | string | non | Piège anti-spam (honeypot) : champ caché, doit rester vide |

### <a id="schema-suspenddto"></a>SuspendDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `decisionId` | string (uuid) | non |  |
| `id` | string (uuid) | non |  |
| `suspendedAt` | string (date-time) | non |  |
| `verificationStatus` | string | non |  |

### <a id="schema-tagdto"></a>TagDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `id` | string (uuid) | non |  |
| `label` | string | non |  |

### <a id="schema-tagrequest"></a>TagRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `label` | string | non |  |

### <a id="schema-tagview"></a>TagView

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `createdAt` | string (date-time) | non |  |
| `id` | string (uuid) | non |  |
| `label` | string | non |  |
| `normalizedLabel` | string | non |  |
| `usageCount` | integer (int32) | non |  |

### <a id="schema-tagsrequest"></a>TagsRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `tags` | string[] | non |  |

### <a id="schema-timelineemotiondto"></a>TimelineEmotionDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non |  |
| `family` | string | non |  |

### <a id="schema-timelinefacetsdto"></a>TimelineFacetsDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `emotions` | object | non |  |
| `tags` | object | non |  |
| `types` | object | non |  |

### <a id="schema-timelineitemdto"></a>TimelineItemDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `authorType` | string | non |  |
| `emotion` | [TimelineEmotionDto](#schema-timelineemotiondto) | non |  |
| `id` | string (uuid) | non |  |
| `intensity` | integer (int32) | non |  |
| `linkCount` | integer (int32) | non |  |
| `occurred` | [EntryOccurredDto](#schema-entryoccurreddto) | non |  |
| `ongoing` | boolean | non |  |
| `recordedAt` | string (date-time) | non |  |
| `sessionId` | string (uuid) | non |  |
| `status` | string | non |  |
| `tags` | string[] | non |  |
| `title` | string | non |  |
| `type` | string | non |  |
| `visibility` | string | non |  |

### <a id="schema-timelinepagedto"></a>TimelinePageDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `facets` | [TimelineFacetsDto](#schema-timelinefacetsdto) | non |  |
| `items` | [TimelineItemDto](#schema-timelineitemdto)[] | non |  |
| `nextCursor` | string | non |  |
| `ongoingSituations` | [TimelineItemDto](#schema-timelineitemdto)[] | non |  |

### <a id="schema-timelineperioddto"></a>TimelinePeriodDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `averageIntensity` | number (double) | non |  |
| `counts` | object | non |  |
| `feelingCount` | integer (int32) | non |  |
| `from` | string (date-time) | non |  |
| `period` | string | non |  |

### <a id="schema-timelinesummarydto"></a>TimelineSummaryDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `granularity` | string | non |  |
| `periods` | [TimelinePeriodDto](#schema-timelineperioddto)[] | non |  |

### <a id="schema-topemotiondto"></a>TopEmotionDto

Émotion dominante et variation par rapport à la fenêtre précédente

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | non |  |
| `count` | integer (int32) | non | Nombre de ressentis dans la fenêtre |
| `delta` | integer (int32) | non | count moins previousCount |
| `label` | string | non |  |
| `previousCount` | integer (int32) | non | Nombre dans la fenêtre précédente de même longueur |

### <a id="schema-trenddto"></a>TrendDto

Courbe d'intensité et repères de la fenêtre

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `markers` | [TrendMarkerDto](#schema-trendmarkerdto)[] | non |  |
| `points` | [TrendPointDto](#schema-trendpointdto)[] | non |  |

### <a id="schema-trendmarkerdto"></a>TrendMarkerDto

Repère sur la courbe : séance ou changement de médicament

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `change` | string | non | start ou end pour un médicament, null pour une séance |
| `date` | string (date) | non |  |
| `entryId` | string (uuid) | non |  |
| `kind` | string | non | session ou medication |
| `label` | string | non | Titre de la séance (null sans titre) ou « molécule dosage » |
| `sessionKind` | string | non | intake, session ou contact pour une séance, null pour un médicament |

### <a id="schema-trendpointdto"></a>TrendPointDto

Point de la courbe : moyenne glissante sur 7 jours à cette date

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `averageIntensity` | number (double) | non | Intensité moyenne (0 à 10) des ressentis des 7 derniers jours, null si aucun |
| `date` | string (date) | non |  |
| `valence` | number (double) | non | Valence moyenne (-2 à 2) des valences connues, null sinon |

### <a id="schema-twofactordisablerequest"></a>TwoFactorDisableRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | oui |  |
| `password` | string | oui |  |

### <a id="schema-twofactorverifyrequest"></a>TwoFactorVerifyRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `code` | string | oui |  |

### <a id="schema-updateprofilerequest"></a>UpdateProfileRequest

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `address` | string | non |  |
| `audiences` | string[] | non |  |
| `availability` | string | non |  |
| `bio` | string | non |  |
| `city` | string | non |  |
| `contactEmail` | string | non |  |
| `contactPhone` | string | non |  |
| `country` | string | non |  |
| `displayName` | string | non |  |
| `fees` | string | non |  |
| `languages` | string[] | non |  |
| `modalities` | string[] | non |  |
| `nextSlotAt` | string (date) | non |  |
| `postalCode` | string | non |  |
| `responseDelay` | string | non |  |
| `showAddress` | boolean | non |  |
| `showEmail` | boolean | non |  |
| `showPhone` | boolean | non |  |
| `showProfessionalNumber` | boolean | non |  |
| `specialties` | string[] | non |  |
| `titleLabel` | string | non |  |
| `websiteUrl` | string | non |  |

### <a id="schema-verificationdto"></a>VerificationDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `decisions` | [DecisionDto](#schema-decisiondto)[] | non |  |
| `documents` | [DocumentDto](#schema-documentdto)[] | non |  |
| `missing` | string[] | non |  |
| `profession` | string | non |  |
| `professionalInfo` | [ProfessionalInfoDto](#schema-professionalinfodto) | non |  |
| `recommended` | string[] | non |  |
| `status` | string | non |  |
| `submittedAt` | string (date-time) | non |  |

### <a id="schema-versiondto"></a>VersionDto

| Champ | Type | Requis | Description |
| --- | --- | --- | --- |
| `authorId` | string (uuid) | non |  |
| `createdAt` | string (date-time) | non |  |
| `reason` | string | non |  |
| `snapshot` | object | non |  |
| `version` | integer (int32) | non |  |
