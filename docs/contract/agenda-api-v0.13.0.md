# API Agenda · contrat `contract-v0.13.0` (psymate-api, main)

Fichier complet : `openapi.yaml` dans ce dossier (copie de `psymate-api/contract/openapi.yaml` au tag `contract-v0.13.0`). Le web régénère son client à partir de ce fichier (C4 : le backend tague, le frontend tire). Remplace la fiche `agenda-api-v0.12.1.md` ; la nouveauté de 0.13.0 est le **rendez-vous invité** (§ Invité).

Toutes les routes exigent la session praticien (cookie). Dates en UTC ISO 8601 (`2026-11-07T09:00:00Z`) ; le web convertit dans le fuseau du praticien. Erreurs RFC 9457 (`application/problem+json`) avec `errors[{ field, code, message }]`.

## Routes

| Méthode et route | Rôle | Corps / paramètres | Réponse |
| --- | --- | --- | --- |
| `GET /api/agenda?from&to&includeCancelled=false` | Grille (jour, semaine, mois) et vue Liste | `from`, `to` obligatoires, `to - from ≤ 62 jours` sinon `422 WINDOW_TOO_LARGE` ; rendez-vous tels que `startsAt < to` et `endsAt > from`, triés par `startsAt` ; `cancelled` exclus sauf `includeCancelled=true` | `AgendaWindowDto { from, to, appointments: AppointmentDto[], busy: [] }` — `busy` toujours vide en V1 (réservé aux indisponibilités Google/Outlook) |
| `GET /api/agenda/freebusy?from&to&excludeAppointmentId?&tz?` | Conflits d'un créneau avant création ou déplacement (débounce 300 ms côté web) et voisinage « suivi de Théo B. à 11:30 » | `tz` défaut `Europe/Paris` ; `excludeAppointmentId` pour ignorer le rendez-vous que l'on déplace | `FreeBusyDto { conflicts: ConflictDto[], previous?: AppointmentDto, next?: AppointmentDto }` |
| `GET /api/patients/{id}/appointments?from?&limit=20` | Rendez-vous à venir d'un patient + valeurs par défaut du panneau « Nouveau rendez-vous » (jamais d'invité) | `from` défaut maintenant ; `limit` 1–100 | `PatientAppointmentsDto { appointments, defaults: { durationMin, modality, rhythm? } }` |
| `POST /api/appointments` | Créer depuis un créneau (une occurrence ou une série), pour un patient **ou un invité** | `CreateAppointmentRequest` | `201`, `Location: /api/appointments/{id}` (première occurrence), `AppointmentCreatedDto { appointments, conflicts }` |
| `GET /api/appointments/{id}` | Panneau de détail à droite | — | `AppointmentDto` ; `404 APPOINTMENT_NOT_FOUND` si inconnu ou à un autre praticien |
| `PATCH /api/appointments/{id}` | Déplacer (glisser-déposer ou formulaire), changer durée, modalité, note, ou corriger l'invité | `UpdateAppointmentRequest` (fusion partielle ; `planningNote: null` efface) | `AppointmentUpdatedDto { appointment, conflicts }` ; `409 APPOINTMENT_NOT_ACTIVE` si `cancelled` ou `done` |
| `POST /api/appointments/{id}/cancel` | Annuler (motif facultatif) | `CancelAppointmentRequest { reason? ≤ 500 }` | `AppointmentDto` (idempotent) ; `409` si `done` |
| `POST /api/appointments/{id}/confirm` | « À confirmer » → planifié | — | `AppointmentDto` ; `409` si le statut n'est pas `tentative` |
| `POST /api/appointments/{id}/attach-patient` | **Nouveau 0.13.0.** Bouton « Créer le dossier » : rattache un rendez-vous invité à une fiche patient | `AttachPatientRequest { patientId, includeSameGuest?: false }` | `AttachedAppointmentsDto { appointments }` (le rendez-vous, plus ceux du même invité si `includeSameGuest`) ; `409 APPOINTMENT_NOT_ACTIVE` si déjà patient ou invité purgé ; `403` / `404` / `422 PATIENT_ARCHIVED` selon le patient |
| `POST /api/appointments/series/{seriesId}/cancel` | « Annuler » du toast après création d'une série | `CancelAppointmentRequest { reason? }` | `AppointmentSeriesDto { appointments }` ; `404 SERIES_NOT_FOUND` |

Pas d'API pour « Dupliquer » (le web rouvre le panneau prérempli) ni pour « Démarrer la séance » (`sessionEntryId` reste `null` en V1). Le bloc « Préparer » se compose avec `GET /api/patients/{id}/overview` et la timeline existantes.

## Invité (nouveau en 0.13.0, décision G Q60)

Un rendez-vous vise **soit** un patient du praticien, **soit** un invité : une personne décrite seulement par nom, prénom et téléphone, sans fiche patient (premier contact). L'invité ne vit que dans ses rendez-vous : il n'apparaît ni dans la liste des patients, ni dans la recherche, ni dans `GET /api/patients/{id}/appointments`.

- **Créer** : `POST /api/appointments` avec `guest { lastName (requis, ≤ 100), firstName? (≤ 100), phone? (≤ 30 : chiffres, espaces, `+`, `.`, `-`, parenthèses) }` **à la place** de `patientId`. Aucun des deux → `422 REQUIRED` sur `patientId` ; les deux → `422 INVALID_VALUE` sur `guest`. Les séries fonctionnent aussi pour un invité.
- **Lire** : `AppointmentDto.patient` vaut `null` et `AppointmentDto.guest { firstName, lastName, phone, purgedAt }` est rempli. Dans les conflits et le freebusy, `patientDisplayName` vaut « Prénom Nom ».
- **Corriger** : `PATCH` avec `guest { lastName, firstName?, phone? }` (fusion : champ absent ou `null` gardé, chaîne vide effacée) ; `422 INVALID_VALUE` sur un rendez-vous patient.
- **Créer le dossier** : le web enchaîne `POST /api/patients` (fiche minimale, `displayName` suffit) puis `POST /api/appointments/{id}/attach-patient { patientId, includeSameGuest: true }` : le rendez-vous (et ceux du même invité, comparés sans casse ni espaces) reçoit `patient`, `guest` repasse à `null`.
- **Purge** : 6 mois après la fin (ou l'annulation) d'un rendez-vous invité jamais rattaché, nom, prénom et téléphone sont effacés : `guest.purgedAt` renseigné, les trois champs `null`, `patientDisplayName` = « Invité purgé ». Le rendez-vous reste. Plus de `attach-patient` ni de `PATCH guest` possible (`409` / `422`).

Affichage recommandé (fiche 15b) : carte grise « Premier contact » dans le détail, pas d'âge ni de bloc « Préparer », bouton « Créer le dossier ».

## Schémas

**AppointmentDto** : `id`, `patient? { id, displayName, birthDate, archived }`, `guest? { firstName, lastName, phone, purgedAt }`, `seriesId?`, `startsAt`, `endsAt`, `durationMin`, `modality` (`in_person | video | phone`), `status` (`planned | tentative | cancelled | done`), `planningNote?`, `cancelReason?`, `cancelledAt?`, `sessionEntryId?`, `createdAt`, `updatedAt`. Exactement un de `patient` / `guest` est non nul.

**CreateAppointmentRequest** : `patientId?` (uuid) **ou** `guest?` (`GuestRequest`), `startsAt` (date-time UTC, requis), `durationMin` (5–600, requis), `modality` (requis), `planningNote?` (≤ 2 000), `tentative?` (défaut `false` ; `true` = case « À confirmer »), `tz?` (défaut `Europe/Paris`, utilisé pour les séries), `recurrence?`.

**RecurrenceRequest** : `everyWeeks` (1, 2 ou 4), puis exactement un de `count` (1–26) ou `until` (date `AAAA-MM-JJ`, incluse, lue dans `tz`). Plus de 26 occurrences → `422 TOO_MANY_OCCURRENCES`. Chaque occurrence est un rendez-vous distinct, même `seriesId`, à la même heure locale.

**UpdateAppointmentRequest** : `startsAt?`, `durationMin?`, `modality?`, `planningNote?` (nullable), `guest?`. `recurrence`, `status`, `patientId` refusés (`422 UNKNOWN_FIELD`).

**ConflictDto** : `appointmentId`, `startsAt`, `endsAt`, `patientDisplayName` (patient, « Prénom Nom » de l'invité, ou « Invité purgé »), `occurrenceStartsAt`. Un conflit **n'empêche jamais** la création ni le déplacement : il est seulement affiché (bandeau ambre de la fiche 15b).

**AppointmentDefaultsDto** : `durationMin` (fiche patient, sinon préférence `sessions.defaultDurationMin`, sinon 60), `modality` (fiche patient si `in_person | video | phone`, sinon `in_person`), `rhythm?` (texte libre de la fiche patient).

## Codes d'erreur propres à l'agenda

`APPOINTMENT_NOT_FOUND` (404), `SERIES_NOT_FOUND` (404), `APPOINTMENT_NOT_ACTIVE` (409), `PATIENT_ARCHIVED` (422), `TOO_MANY_OCCURRENCES` (422), `WINDOW_TOO_LARGE` (422) ; plus les codes communs `REQUIRED`, `INVALID_FORMAT`, `INVALID_VALUE`, `OUT_OF_RANGE`, `UNKNOWN_FIELD`, et `PATIENT_FORBIDDEN` (403) / `PATIENT_NOT_FOUND` (404) du module patients.

## Préférences utiles au web (`GET /api/me/preferences`)

`agenda.dayStartHour` (8), `agenda.dayEndHour` (19), `agenda.workingDays` (`[1,2,3,4,5,6]`, lundi = 1), `agenda.defaultView` (`day | week | month | list`, défaut `week`), `sessions.defaultDurationMin` (60).

## Exports (sans changement de contrat)

L'export du compte (`POST /api/me/export`, zip) contient `rendez-vous.md` (tous les rendez-vous, patients et invités) ; l'export d'un dossier (`GET /api/patients/{id}/export`) a une section « Rendez-vous ». Heures en UTC comme le reste de l'export.

## Données de démonstration

`make seed` (small, medium) pose 8 semaines de rendez-vous par praticien : 14 actifs sur la semaine courante, 70 % cabinet / 20 % visio / 10 % téléphone, un « à confirmer » et un annulé par semaine, des séries de 4 à 6 occurrences. Aucun invité dans le seed pour l'instant.
