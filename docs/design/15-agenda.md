# Écran 15 · Agenda (synchronisé avec Google Agenda)

> **En V1 depuis le 15 novembre 2026 (G Q25 amendée ; hors V1 du 29 octobre au 15 novembre)**. Côté web, l'écran est livré en rendu seul (PR #86, `features/agenda`, FullCalendar 6) sur des données de démonstration : la semaine de la maquette, servie par `agenda.api.ts` tant que le contrat ne porte pas l'agenda. Côté API, le jalon M11 de psymate-api (`docs/I-plan-agenda-api.md`, module `agenda`) livre les rendez-vous **sans Google** : la « Décision de confidentialité », la « Synchronisation Google », le bloc Google du détail et l'état de synchronisation restent **hors V1** (jalon M12, non planifié) ; l'écran les montre en démonstration. Le DDL d'origine reste en E6.2 ; le plan I le remplace. Ce qui diffère de la maquette est dans « Écarts avec la maquette ».

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

## Écarts avec la maquette (livraison du 15 novembre 2026, PR #86)
- **En-tête** : la maquette dessine une barre d'application « Patients · Agenda » ; l'écran garde la barre d'application et le rail de navigation existants (fiche 00 §9), carreau Agenda actif. Décision du propriétaire du 15 novembre ; maquette non modifiée.
- **Bibliothèque** : FullCalendar 6.1.22 (`@fullcalendar/angular`, `core`, `daygrid`, `timegrid`, `list`, `interaction` ; versions exactes, chunk paresseux), habillé aux tokens Nordique sous `.pm-calendar` (`pm-agenda-calendar`). Pas de plugin `rrule` : la répétition du panneau 15b produit des occurrences indépendantes côté web, comme le proposera l'API (une ligne par occurrence). Mini-mois, rail « Mes agendas », barre d'outils, détail et panneau sont des composants maison. Une grille maison sans dépendance (branche locale `claude/agenda-rendu-fiche-15`, non poussée) a été écartée.
- **Données** : `agenda.api.ts` sert la semaine de démonstration de la maquette quelle que soit la plage demandée, et un état « synchronisé · il y a 2 min » figé ; les bornes 8 h → 19 h, le samedi travaillé (matin) et le dimanche non travaillé sont des constantes, les préférences `agenda.*` de l'API (`dayStartHour`, `dayEndHour`, `workingDays`, `defaultView`, qui remplacent `agenda.hours`) ne sont pas encore lues. Le jour du branchement, seul `agenda.api.ts` change (client généré) ; store et composants restent.
- **Écritures absentes** : les boutons du pied du détail (Démarrer la séance, Déplacer, Dupliquer, Annuler) sont inertes, `aria-disabled="true"`, nommés « … · à venir » comme le carreau Facture ; la note de planification est en lecture seule ; le panneau 15b se ferme sans créer et sans toast « n rendez-vous planifiés · Annuler » ; le glisser-déposer et l'étirement modifient l'état local seulement (le `PATCH` viendra avec l'API). Seuls `planned` et `tentative` se déplacent ; un dépôt sur un bloc Google « occupé » est refusé par la grille, sans la confirmation inline « déplacer quand même ? », qui viendra avec le `PATCH`.
- **Contrastes (axe, étude §7)** : le rendez-vous sélectionné a le fond de sa modalité assombri de 30 % vers le texte (≥ 5:1, texte blanc ; la maquette est à 3,9:1) ; les liens « Régler » du rail et du panneau, dans un texte gris, sont soulignés ; les jours des mois voisins et les dimanches du mini-mois sont en `text-secondary` (boutons de 12 px ; la maquette à 1,8:1 et 3:1) ; l'étiquette « Séance planifiée · cabinet » du détail est assombrie d'un quart vers le texte (12 px). Maquette non modifiée.
- **Mois** : au-delà de trois rendez-vous, la case dit « + n autres » et ouvre la vue Jour de ce jour (`?view=day&date=`), au lieu du popover de FullCalendar.
- **URL et clavier** : `/agenda?view=&date=` comme la fiche ; le détail `/agenda/rdv/:id` se ferme quand la date ou la vue change, ou quand l'agenda du rendez-vous est masqué ; `Échap` rend le focus au rendez-vous dans la grille ; `↑ ↓` ne réagissent qu'avec un détail ouvert. Le panneau 15b ne pose pas `?nouveau=` dans l'URL (état du dialogue seulement, fiche 00 §6).
- **Tests** : les critères d'acceptation ci-dessus (Google, webhook, `entry_session`) restent ceux de la phase API. La livraison du 15 novembre est couverte par `e2e/agenda/agenda-maquette.spec.ts` (5 tests, axe-core inclus : rail → semaine, barre d'outils, rail, grille et blocs Google ; détail, ↓ ↑, Échap ; vues Jour / Mois / Liste et liste vide ; panneau 15b ; glisser-déposer et étirement) et par Vitest (store, modèle, page, calendrier doublé en jsdom, panneau).
- **Traductions** : `messages.fr.xlf` complet ; EN absent (G Q23, avertissements au build).

## Hors périmètre
Prise de rendez-vous en ligne par les patients, rappels SMS/e-mail, salle d'attente visio, multi-praticiens (cabinet de groupe), Outlook / iCloud (le flux iCal couvre la lecture).
