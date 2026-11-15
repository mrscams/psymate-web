# API Agenda · contrat `contract-v0.12.1` (psymate-api, main 44e6ac2)

Fichier complet : `contract/openapi.yaml` au tag `contract-v0.12.1` (`git fetch --tags && git show contract-v0.12.1:contract/openapi.yaml`), ou la copie `openapi-v0.12.1.yaml` jointe. Le web régénère son client à partir de ce fichier (C4 : le backend tague, le frontend tire).

Toutes les routes exigent la session praticien (cookie). Dates en UTC ISO 8601 (`2026-11-07T09:00:00Z`) ; le web convertit dans le fuseau du praticien. Erreurs RFC 9457 (`application/problem+json`) avec `errors[{ field, code, message }]`.

## Routes

| Méthode et route | Rôle | Corps / paramètres | Réponse |
| --- | --- | --- | --- |
| `GET /api/agenda?from&to&includeCancelled=false` | Grille (jour, semaine, mois) et vue Liste | `from`, `to` obligatoires, `to - from ≤ 62 jours` sinon `422 WINDOW_TOO_LARGE` ; rendez-vous tels que `startsAt < to` et `endsAt > from`, triés par `startsAt` ; `cancelled` exclus sauf `includeCancelled=true` | `AgendaWindowDto { from, to, appointments: AppointmentDto[], busy: [] }` — `busy` toujours vide en V1 (réservé aux indisponibilités Google/Outlook) |
| `GET /api/agenda/freebusy?from&to&excludeAppointmentId?&tz?` | Conflits d'un créneau avant création ou déplacement (débounce 300 ms côté web) et voisinage « suivi de Théo B. à 11:30 » | `tz` défaut `Europe/Paris` ; `excludeAppointmentId` pour ignorer le rendez-vous que l'on déplace | `FreeBusyDto { conflicts: ConflictDto[], previous?: AppointmentDto, next?: AppointmentDto }` |
| `GET /api/patients/{id}/appointments?from?&limit=20` | Rendez-vous à venir d'un patient + valeurs par défaut du panneau « Nouveau rendez-vous » | `from` défaut maintenant ; `limit` 1–100 | `PatientAppointmentsDto { appointments, defaults: { durationMin, modality, rhythm? } }` |
| `POST /api/appointments` | Créer depuis un créneau (une occurrence ou une série) | `CreateAppointmentRequest` | `201`, `Location: /api/appointments/{id}` (première occurrence), `AppointmentCreatedDto { appointments, conflicts }` |
| `GET /api/appointments/{id}` | Panneau de détail à droite | — | `AppointmentDto` ; `404 APPOINTMENT_NOT_FOUND` si inconnu ou à un autre praticien |
| `PATCH /api/appointments/{id}` | Déplacer (glisser-déposer ou formulaire), changer durée, modalité, note | `UpdateAppointmentRequest` (fusion partielle ; `planningNote: null` efface) | `AppointmentUpdatedDto { appointment, conflicts }` ; `409 APPOINTMENT_NOT_ACTIVE` si `cancelled` ou `done` |
| `POST /api/appointments/{id}/cancel` | Annuler (motif facultatif) | `CancelAppointmentRequest { reason? ≤ 500 }` | `AppointmentDto` (idempotent : un second appel répond `200`) ; `409` si `done` |
| `POST /api/appointments/{id}/confirm` | « À confirmer » → planifié | — | `AppointmentDto` ; `409` si le statut n'est pas `tentative` |
| `POST /api/appointments/series/{seriesId}/cancel` | « Annuler » du toast après création d'une série | `CancelAppointmentRequest { reason? }` | `AppointmentSeriesDto { appointments }` (toutes les occurrences, état final) ; `404 SERIES_NOT_FOUND` |

Pas d'API pour « Dupliquer » (le web rouvre le panneau prérempli) ni pour « Démarrer la séance » (M11-08 non livrée : `sessionEntryId` reste `null`). Le bloc « Préparer » se compose avec `GET /api/patients/{id}/overview` et la timeline existantes.

## Schémas

**AppointmentDto** : `id`, `patient { id, displayName, birthDate, archived }`, `seriesId?`, `startsAt`, `endsAt`, `durationMin`, `modality` (`in_person | video | phone`), `status` (`planned | tentative | cancelled | done`), `planningNote?`, `cancelReason?`, `cancelledAt?`, `sessionEntryId?`, `createdAt`, `updatedAt`.

**CreateAppointmentRequest** : `patientId` (uuid, requis), `startsAt` (date-time UTC, requis), `durationMin` (5–600, requis), `modality` (requis), `planningNote?` (≤ 2 000), `tentative?` (défaut `false` ; `true` = case « À confirmer »), `tz?` (défaut `Europe/Paris`, utilisé pour les séries), `recurrence?`.

**RecurrenceRequest** : `everyWeeks` (1, 2 ou 4), puis exactement un de `count` (1–26) ou `until` (date `AAAA-MM-JJ`, incluse, lue dans `tz`). Plus de 26 occurrences → `422 TOO_MANY_OCCURRENCES`. Chaque occurrence est un rendez-vous distinct, même `seriesId`, à la même heure locale (passages d'heure gérés).

**UpdateAppointmentRequest** : `startsAt?`, `durationMin?`, `modality?`, `planningNote?` (nullable). `recurrence`, `status`, `patientId` refusés (`422 UNKNOWN_FIELD`).

**ConflictDto** : `appointmentId`, `startsAt`, `endsAt`, `patientDisplayName`, `occurrenceStartsAt` (l'occurrence concernée dans une série ; pour un rendez-vous seul ou un freebusy, le début du créneau). Un conflit **n'empêche jamais** la création ni le déplacement : il est seulement affiché (bandeau ambre de la fiche 15b).

**AppointmentDefaultsDto** : `durationMin` (fiche patient, sinon préférence `sessions.defaultDurationMin`, sinon 60), `modality` (fiche patient si `in_person | video | phone`, sinon `in_person`), `rhythm?` (texte libre de la fiche patient, ex. « toutes les 1 à 2 semaines »).

## Codes d'erreur propres à l'agenda

`APPOINTMENT_NOT_FOUND` (404), `SERIES_NOT_FOUND` (404), `APPOINTMENT_NOT_ACTIVE` (409), `PATIENT_ARCHIVED` (422), `TOO_MANY_OCCURRENCES` (422), `WINDOW_TOO_LARGE` (422) ; plus les codes communs `REQUIRED`, `INVALID_FORMAT`, `INVALID_VALUE`, `OUT_OF_RANGE`, `UNKNOWN_FIELD`, et `PATIENT_FORBIDDEN` (403) / `PATIENT_NOT_FOUND` (404) du module patients.

## Préférences utiles au web (déjà dans `GET /api/me/preferences`, contrat 0.11.1+)

`agenda.dayStartHour` (8), `agenda.dayEndHour` (19), `agenda.workingDays` (`[1,2,3,4,5,6]`, lundi = 1), `agenda.defaultView` (`day | week | month | list`, défaut `week`), `sessions.defaultDurationMin` (60).

## Données de démonstration

`make seed` (small, medium) pose 8 semaines de rendez-vous par praticien : 14 actifs sur la semaine courante, 70 % cabinet / 20 % visio / 10 % téléphone, un « à confirmer » et un annulé par semaine, des séries de 4 à 6 occurrences.
