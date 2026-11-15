# Écran 15 · Agenda (synchronisé avec Google Agenda)

> **En V1 depuis le 15 novembre 2026 (G Q25 amendée ; hors V1 du 29 octobre au 15 novembre)**. Côté web, l'écran a été livré en rendu seul (PR #86, `features/agenda`, FullCalendar 6), puis branché sur l'API réelle du jalon M11 (contrat `contract-v0.12.1`) : `agenda.api.ts` passe par le client généré. Côté API, le jalon M11 de psymate-api (`docs/I-plan-agenda-api.md`, module `agenda`) livre les rendez-vous **sans Google** : la « Décision de confidentialité », la « Synchronisation Google », le bloc Google du détail et l'état de synchronisation restent **hors V1** (jalon M12, non planifié) et ne sont plus dessinés. Le DDL d'origine reste en E6.2 ; le plan I le remplace. Ce qui diffère de la maquette est dans « Écarts avec la maquette ».

> Spécification pour agents. Maquette : `15-agenda.html` / `.png`. Palette : Nordique. Module backend `agenda` (le plan I l'a renommé depuis `scheduling`) ; front `features/agenda`.

## Objectif
Le praticien voit sa semaine, planifie et déplace ses séances, voit ses indisponibilités Google sans les copier, et ouvre le détail d'un rendez-vous **à droite** d'un clic — avec de quoi préparer la séance et la démarrer. L'application reste la source de vérité des séances ; Google Agenda est un miroir bidirectionnel limité à ce que le praticien accepte d'y mettre.

## Décision de confidentialité (à valider)
Google Agenda n'est pas un hébergeur de données de santé. Par défaut, l'événement copié dans Google s'intitule **« Séance · M. D. »** (initiales), porte la modalité et la durée, et **rien d'autre** (pas de nom complet, pas de motif, pas de note). Préférence `calendar.googleDetail` : `initials` (défaut) · `first_name` · `busy_only` (« Occupé »). La note de planification n'est jamais synchronisée.

## Bibliothèques
- **Interface** : FullCalendar cœur (MIT) via `@fullcalendar/angular` — plugins `daygrid`, `timegrid`, `list`, `interaction` (glisser-déposer, redimensionnement), `rrule` (récurrence), locale `fr`. Thème par surcharge CSS avec les tokens Nordique (`--fc-*`). Le panneau de détail, le rail gauche et la barre d'outils sont des composants maison (Material M3). Alternatives écartées : `angular-calendar` (moins complet), Schedule-X (trop jeune), Bryntum / Syncfusion / Kendo (payants).
- **Backend** : `google-api-services-calendar` + `google-auth-library-oauth2-http` (Spring Boot). Flux iCal via `biweekly` ou `ical4j`.

## Route & module
- Route : `/agenda` (vue semaine par défaut), `/agenda?view=day|week|month|list&date=`, `/agenda/rdv/:id` ouvre le détail.
- Module `scheduling` : dépend de `identity` et `clinical` (pour créer / rattacher une `entry_session`), `events`. Expose `AppointmentFacade`, événements `AppointmentPlanned`, `AppointmentRescheduled`, `AppointmentCancelled`, `AppointmentStarted`.
- Tables :
  - `appointment (id, practitioner_id, patient_id, starts_at, ends_at, modality in_person|video|phone, status planned|confirmed|cancelled|done, planning_note, session_entry_id NULL, google_event_id, google_etag, source app|google, created_at, updated_at)` ; index `(practitioner_id, starts_at)`.
  - `practitioner_integration (practitioner_id, provider 'google', refresh_token_enc, scope, target_calendar_id, watch_channel_id, watch_resource_id, watch_expires_at, sync_token, last_sync_at, last_error, detail_level, read_calendars jsonb)`.
- API : `GET /api/agenda?from&to` → séances + blocs « occupé » des agendas Google en lecture (`{start, end, calendar}`, sans titre) ; `POST /api/appointments`, `PATCH /api/appointments/{id}` (déplacer, modalité, note), `POST /api/appointments/{id}/cancel`, `POST /api/appointments/{id}/start` (crée l'`entry_session` et redirige vers le patient) ; `GET /api/me/integrations/google/connect` (OAuth), `POST …/disconnect`, `GET …/status` ; `POST /api/integrations/google/webhook` (notifications `events.watch`, vérifie `X-Goog-Channel-Token`) ; `GET /api/me/calendar.ics?token=` (flux secret, lecture seule).

## Synchronisation Google
1. **Connexion** : OAuth 2.0, scope `https://www.googleapis.com/auth/calendar.events` (+ `calendar.readonly` si le praticien coche des agendas en lecture) ; `refresh_token` chiffré en base ; création d'un agenda secondaire « PsyMate » dans le compte Google (`target_calendar_id`).
2. **App → Google** : à chaque `AppointmentPlanned/Rescheduled/Cancelled`, `events.insert/patch/delete` sur l'agenda « PsyMate », `extendedProperties.private.appointmentId`, titre selon `detail_level`, `etag` conservé ; échec → file de reprise (outbox) et bandeau « non synchronisé ».
3. **Google → App** : `events.watch` sur l'agenda « PsyMate » (canal renouvelé tous les 6 jours par tâche planifiée) ; à chaque notification, `events.list(syncToken)` → deltas ; déplacement ou suppression côté Google → `PATCH`/`cancel` de l'`appointment` avec `source = google` et trace « déplacé depuis Google le … » ; `410 Gone` sur le `syncToken` → resynchronisation complète.
4. **Agendas en lecture** (Pro, Perso) : `freebusy.query` sur la fenêtre affichée, rendu en hachuré « Occupé · Google Pro » sans titre ni détail ; jamais stocké.
5. **Conflits** : dernier `updated` gagne ; si les deux côtés ont changé en moins de 60 s, l'application gagne et renvoie l'événement.
6. **Validation Google OAuth** : scope sensible → vérification de l'application (politique de confidentialité, vidéo) ; sans validation, plafond 100 utilisateurs et écran « non vérifiée ».

## Structure de l'écran
1. **Barre d'application** (Patients · **Agenda**).
2. **Barre d'outils** : titre, *Aujourd'hui*, ‹ ›, plage affichée (« 26 octobre – 1er novembre 2026 · semaine 44 · 14 séances »), vues *Jour / Semaine / Mois / Liste* (`role="group"`, `aria-pressed`), état de synchronisation (vert « synchronisé · il y a n min », ambre « en attente », rouge « erreur, reconnecter »), bouton **+ Rendez-vous**.
3. **Rail gauche** (220 px) : mini-mois (aujourd'hui en noir, semaine affichée en teinte primaire), **Mes agendas** (cases : cabinet `#3E8E7E`, visio `#3A63C2`, contacts `#7F8EA8`), **Google Agenda** (connecté ; agendas en lecture avec vignette hachurée ; phrase sur le niveau de détail + lien *Régler*), légende (*à confirmer* pointillé, *indisponible* hachuré).
4. **Grille semaine** : 56 px d'heures + 7 colonnes, 8 h → 19 h, 52 px/heure (préférence `agenda.hours`), ligne de l'heure courante en `--primary` quand la semaine contient aujourd'hui, samedi travaillé en teinte, dimanche hachuré clair (non travaillé), demi-journées non travaillées hachurées clair. Événements : fond teinte + barre gauche 3 px couleur de modalité, nom, `HH:MM–HH:MM` mono ; *à confirmer* = fond blanc bordure pointillée ; sélectionné = fond plein couleur de modalité, texte blanc, halo teinte ; contact téléphonique = bandeau fin 14 px.
5. **Détail à droite** (320–360 px, `aside aria-label`) : bande supérieure couleur de modalité, étiquette « Séance planifiée · cabinet », bouton fermer ; patient (initiales, nom lié au dossier, âge, suivi depuis, drapeau) ; date et heures mono ; lieu, n° de séance, rythme ; **Préparer** (dernière séance, objectif, ce qui s'est passé depuis : ressentis, événements non commentés ; boutons *Vue d'ensemble*, *Timeline*) ; **Note de planification** (jamais envoyée à Google) ; **bloc Google** (ce qui est dans Google, historique « déplacé depuis Google ») ; rappel SMS (interrupteur, hors V1 : désactivé) ; pied : **Démarrer la séance** (primaire), *Déplacer*, *Dupliquer*, *Annuler* (rouge texte), aide clavier.

## Interactions
- Clic sur un événement → détail à droite sans changer de vue ; `Échap` ferme ; `↑ ↓` passent au rendez-vous précédent/suivant du jour ; double-clic → dossier patient.
- Glisser-déposer / redimensionner → `PATCH` immédiat + synchronisation Google ; confirmation inline si le déplacement crée un chevauchement avec un bloc Google « occupé » (« Chevauche Google Pro 14:00–16:00 — déplacer quand même ? »).
- **+ Rendez-vous** ou clic sur un créneau vide → panneau de création (patient par recherche, modalité, durée par défaut `sessions.defaultDurationMin`, récurrence simple « toutes les 1 / 2 / 4 semaines », note).
- **Démarrer la séance** → crée l'`entry_session` (durée pré-remplie), marque le rendez-vous `done`, ouvre la vue d'ensemble du patient avec la barre de saisie prête.
- Annuler → motif optionnel, événement supprimé de Google, rendez-vous conservé en `cancelled` (visible via filtre).
- Vue Liste : les 30 prochains jours, groupés par jour, même panneau de détail.

## Tokens
- Modalités : cabinet `#3E8E7E` / `#E2F1EE`, visio `#3A63C2` / `#E3EAF8`, contact `#7F8EA8` / `#EEF1F6` (mêmes couleurs que le type séance et la barre de saisie).
- Indisponible Google : `repeating-linear-gradient(135deg, #E4E8F0 0 3px, #FFFFFF 3px 6px)` + bordure `#D6DCE6`, texte `#5A6679`.
- Non travaillé : bandes `#F6F8FB` / `#FFFFFF` ; samedi travaillé : fond `#F7F9FC`, en-tête `#E3EAF8`.
- Sélection : fond plein modalité, halo 3 px de la teinte ; aujourd'hui dans le mini-mois : `#1E2633` / blanc.
- État de synchronisation : `--success`, `--warning`, `--danger` avec texte, jamais couleur seule.

## Accessibilité
- Chaque événement est un `<a href>` avec nom, heures et modalité dans le texte ; `aria-current="true"` sur le sélectionné.
- Blocs Google « occupé » : `role="img" aria-label` avec plage et agenda.
- Vue Liste = alternative complète à la grille pour lecteurs d'écran et mobile ; grille en `overflow-x: auto` sous 900 px.
- Glisser-déposer doublé par *Déplacer* (formulaire date/heure).

## Critères d'acceptation
- [ ] Créer un rendez-vous → événement « Séance · M. D. » visible dans l'agenda Google « PsyMate » en < 5 s ; `extendedProperties.private.appointmentId` renseigné.
- [ ] Déplacer l'événement dans Google → `appointment.starts_at` mis à jour en < 30 s (webhook), détail affiche « déplacé depuis Google ».
- [ ] `detail_level = busy_only` → titre Google « Occupé », aucune initiale.
- [ ] Agenda Pro en lecture : bloc hachuré 14:00–16:00 affiché, aucun titre Google stocké (test base).
- [ ] Révocation du token côté Google → état rouge « reconnecter », aucune perte de rendez-vous.
- [ ] Canal `watch` expiré → renouvelé par la tâche planifiée avant expiration (test avec horloge simulée).
- [ ] *Démarrer la séance* → `entry_session` créée avec `session_id` prêt, redirection vers `/patients/:id`.
- [ ] axe-core 0 violation ; parcours clavier : ouvrir un rendez-vous, le fermer, démarrer la séance.

## Écarts avec la maquette (rendu du 15 novembre 2026, PR #86 ; branchement sur `contract-v0.12.1`)
- **En-tête** : la maquette dessine une barre d'application « Patients · Agenda » ; l'écran garde la barre d'application et le rail de navigation existants (fiche 00 §9), carreau Agenda actif. Décision du propriétaire du 15 novembre ; maquette non modifiée.
- **Bibliothèque** : FullCalendar 6.1.22 (`@fullcalendar/angular`, `core`, `daygrid`, `timegrid`, `list`, `interaction` ; versions exactes, chunk paresseux), habillé aux tokens Nordique sous `.pm-calendar` (`pm-agenda-calendar`). Pas de plugin `rrule` : la répétition est portée par l'API (une ligne par occurrence, même `seriesId`) ; le panneau 15b n'en calcule que l'aperçu. Mini-mois, rail « Mes agendas », barre d'outils, détail et panneau sont des composants maison.
- **Données réelles** : `agenda.api.ts` (seul fichier de la feature qui importe `src/app/api`) lit `GET /api/agenda?from&to` (plage de la vue, 42 jours au plus en vue Mois), `GET /api/appointments/{id}` (lien direct hors de la plage ; 404 → « Rendez-vous introuvable » dans le détail), `GET /api/agenda/freebusy`, `GET /api/patients/{id}/appointments`, `GET /api/patients?q=&archived=false` et `GET /api/patients/{id}/overview`. Après toute écriture (créer, déplacer, annuler, confirmer, note), la plage est relue ; rien n'est recalculé localement. `busy` est toujours vide en V1 : la grille sait dessiner une indisponibilité externe hachurée, aucune n'arrive.
- **Google retiré** : plus d'état de synchronisation dans la barre d'outils ; dans le rail, « Google Agenda » suivi de « à venir » en `text-secondary` (un texte, pas un contrôle désactivé comme le carreau Facture : le contraste AA s'applique ; sans cases, sans phrase de niveau de détail ni lien « Régler ») ; la légende ne garde que « À confirmer » ; le bloc Google et le rappel SMS disparaissent du détail ; le panneau 15b n'a plus de bloc « Sera copié dans Google Agenda ». Le chevauchement avec un bloc Google « occupé » (« déplacer quand même ? ») attend M12.
- **Modèle** : plus de « contact » distinct ni de numéro de séance ni de lieu : un rendez-vous `phone` est un rendez-vous rendu avec la couleur téléphone, la modalité s'affiche en clair (« Cabinet », « Visio », « Téléphone ») avec la durée ; l'âge vient de `patient.birthDate`, « suivi depuis » et « Préparer » de la vue d'ensemble (dernière séance, ressentis, événements et autres entrées depuis), le rythme de `defaults.rhythm`. « Préparer » ne bloque jamais l'ouverture du détail : en erreur, seuls les liens Vue d'ensemble et Timeline restent.
- **Écritures** : glisser-déposer et étirement → `PATCH { startsAt, durationMin }` immédiat puis relecture ; un chevauchement (`conflicts`) donne un toast d'information « Chevauche le rendez-vous de X à HH:MM », jamais bloquant ; une erreur (`409 APPOINTMENT_NOT_ACTIVE`, réseau) relit la plage (le rendez-vous revient à sa place) et le toast reprend le `detail` du problème (niveau avertissement : le service de toasts n'a pas de niveau erreur). Dans le détail : **Confirmer** (à confirmer seulement), **Déplacer** (formulaire date, heure, durée sur place, équivalent clavier du glisser-déposer), **Dupliquer** (panneau 15b prérempli, même créneau une semaine plus tard), **Annuler** (confirmation sur place, motif facultatif ≤ 500, toast « Rendez-vous annulé »). Un rendez-vous annulé ou fait ne garde que Dupliquer et montre « Annulé le … (motif) ». La note de planification s'enregistre au blur (`PATCH { planningNote }`, vide → `null`), indicateur « Enregistré ».
- **Démarrer la séance** : toujours inerte, `aria-disabled="true"`, nommé « Démarrer la séance · à venir » : M11-08 n'est pas livrée (`sessionEntryId` reste `null`, aucune route).
- **Préférences lues** : `agenda.dayStartHour` / `agenda.dayEndHour` bornent la grille (8 h → 19 h par défaut), `agenda.workingDays` hachure les jours non travaillés (`businessHours`) et teinte un samedi ou un dimanche travaillé, `agenda.defaultView` est la vue quand l'URL n'a pas `?view=`. L'agenda ne les écrit pas (fiche 14).
- **Contrastes (axe, étude §7)** : le rendez-vous sélectionné a le fond de sa modalité assombri de 30 % vers le texte (≥ 5:1, texte blanc ; la maquette est à 3,9:1) ; les jours des mois voisins et les dimanches du mini-mois sont en `text-secondary` (boutons de 12 px ; la maquette à 1,8:1 et 3:1) ; l'étiquette « Séance planifiée · cabinet » du détail est assombrie d'un quart vers le texte (12 px). Maquette non modifiée.
- **Mois** : au-delà de trois rendez-vous, la case dit « + n autres » et ouvre la vue Jour de ce jour (`?view=day&date=`), au lieu du popover de FullCalendar.
- **URL et clavier** : `/agenda?view=&date=` comme la fiche ; le détail `/agenda/rdv/:id` se ferme quand la date ou la vue change, ou quand l'agenda du rendez-vous est masqué ; `Échap` rend le focus au rendez-vous dans la grille ; `↑ ↓` ne réagissent qu'avec un détail ouvert. Le panneau 15b ne pose pas `?nouveau=` dans l'URL (état du dialogue seulement, fiche 00 §6).
- **Tests** : les critères d'acceptation ci-dessus (Google, webhook, `entry_session`) restent ceux de M12 et de M11-08. Le branchement est couvert par `e2e/agenda/agenda.spec.ts` contre l'API réelle (5 tests, axe-core inclus : semaine, rail et liste vide ; détail, Confirmer, ↓ ↑, Échap, Annuler avec motif ; glisser-déposer et étirement relus par `GET` ; panneau 15b avec recherche, défauts, chevauchement, série × 3 et « Annuler » du toast ; préférences `agenda.*`) et par Vitest (`agenda.api.ts` sur le client généré, store, modèle, page, détail, calendrier doublé en jsdom, panneau).
- **Traductions** : `messages.fr.xlf` complet ; EN absent (G Q23, avertissements au build).

## Hors périmètre
Prise de rendez-vous en ligne par les patients, rappels SMS/e-mail, salle d'attente visio, multi-praticiens (cabinet de groupe), Outlook / iCloud (le flux iCal couvre la lecture).
