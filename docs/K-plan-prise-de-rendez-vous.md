# Document K – Plan d'action · Prise de rendez-vous en ligne, jalon M14 (API et web)

22 novembre 2026. **Validé par l'utilisateur le 22 novembre 2026** : les décisions de K2 et les valeurs par défaut (K10). Ce document réunit les décisions à inscrire dans G, le parcours détaillé et les tâches de réalisation, avec leurs prompts, pour `psymate-api` puis `psymate-web`. Tant que M14-01 (API) et M14-09 (web) ne sont pas fusionnées, il fait foi pour le jalon M14.

La tâche M14-01 copie la moitié API (K2.1, K4, K5, K6.1, K7) dans `psymate-api/docs/K-plan-prise-de-rendez-vous-api.md` et inscrit les décisions dans le G de l'API ; la tâche M14-09 inscrit les décisions du web dans le G de ce dépôt.

Sources : G Q50 à Q61 de psymate-api (agenda, rendez-vous invité, purge), `../psymate-api/docs/I-plan-agenda-api.md` (I2, I3, I8), le formulaire de contact public (`directory`, fiche 09), le contrat `contract-v0.14.0`, les fiches 09, 14, 15 et 15b, l'échange du 22 novembre 2026 avec l'utilisateur (pas de compte patient, deux modes de confirmation au choix du praticien).

Numéros : le jalon **M14** est libre (M12 est réservé à Google, M13 est le Profil 360). Les décisions de l'API prennent **Q71 à Q82 dans le G de psymate-api** ; celles du web prennent **Q60 à Q66 dans le G de ce dépôt**. Migration `V15`. Contrat `0.15.0`, tag `contract-v0.15.0`.

## K1. Périmètre

Ce que la fonction doit permettre :

- Un visiteur, sans compte, choisit un créneau sur la page publique d'un praticien et laisse son nom, son prénom, son e-mail et, s'il le veut, son téléphone.
- Il confirme son adresse par un lien reçu par e-mail. Rien n'entre dans l'agenda avant ce clic.
- Selon le réglage du praticien, la demande devient un rendez-vous confirmé tout de suite (acceptation automatique) ou attend sa réponse (validation manuelle, réglage par défaut).
- Le praticien règle dans ses préférences : activation, mode de confirmation, plages ouvertes, durée d'un créneau, délai minimal, horizon, modalités.
- Le demandeur suit et annule son rendez-vous par un lien personnel. Il est prévenu par e-mail de chaque changement.
- Ses données sont effacées par paliers (K3.5).

Hors M14 : compte patient ; paiement ou acompte ; rappels par SMS ; rappel automatique la veille ; liste d'attente ; choix du motif ou d'un type de consultation ; plusieurs lieux ; jours fériés et congés (le praticien bloque un créneau en y posant un rendez-vous) ; synchronisation Google (M12) ; champ libre « motif » (écarté exprès, voir Q72) ; déplacement du rendez-vous par le demandeur (il annule et redemande).

## K2. Décisions (tranchées par l'utilisateur le 22 novembre 2026)

### K2.1 API (à inscrire dans le G de psymate-api par M14-01)

| # | Question | Décision |
| --- | --- | --- |
| Q71 | Où vit la prise de rendez-vous en ligne | Dans le module **`agenda`**, sous-domaine « booking » (fichiers préfixés `Booking` ou `PublicBooking`), sans nouveau module. Routes publiques sous `/api/public/booking/**`, dans la chaîne publique existante (`directory.config.PublicSecurityConfig`, sans session ni CSRF). Nouvelle dépendance autorisée `agenda → directory :: api`, pour une seule façade, `PublishedProfileFacade` (slug → praticien publié **et** approuvé) ; `directory` ne dépend toujours pas d'`agenda`. **Aucun compte patient** : aucun nouvel acteur dans `identity`, aucun mot de passe, aucune session pour le demandeur. |
| Q72 | Ce que le demandeur fournit | Nom et prénom (100 caractères chacun), e-mail (320), tous trois obligatoires ; téléphone facultatif (30, règle de `guest.phone`) ; modalité parmi celles que le praticien offre ; consentement coché. **Aucun champ libre** : un motif de consultation est une donnée de santé écrite par un inconnu avant toute relation, on ne le recueille pas. La demande n'est rattachée à aucun dossier. |
| Q73 | E-mail vérifié avant tout | Une demande crée une ligne `booking_request` et envoie un lien à usage unique, valable **30 minutes**. Tant que le lien n'est pas suivi : aucun rendez-vous, aucun créneau retenu, aucun e-mail au praticien. Une demande non vérifiée est supprimée 24 h après sa création. |
| Q74 | Deux modes de confirmation | Préférence `booking.confirmation` : `manual` (défaut) ou `auto`. À la vérification de l'e-mail, l'API crée un **rendez-vous invité** (G Q60) d'origine `online` : statut `tentative` en `manual`, `planned` en `auto`. Le mode est lu au moment de la vérification. En `manual`, le praticien confirme (`POST /api/appointments/{id}/confirm`, existant) ou refuse (`POST /api/appointments/{id}/cancel`, existant). Dans les deux modes il peut toujours annuler ou déplacer ensuite. |
| Q75 | Réglages du praticien | Clés plates (ADR-11) dans `practitioner.preferences`, lues et écrites par `PATCH /api/me/preferences` : `booking.enabled` (défaut `false`), `booking.confirmation` (`manual`), `booking.windows` (liste de `{ day: 1 à 7, lundi = 1, start: "HH:mm", end: "HH:mm" }`, minutes multiples de 5, 21 plages au plus, sans chevauchement le même jour, défaut `[]`), `booking.slotDurationMin` (15 à 180, multiple de 5, défaut 60), `booking.minNoticeHours` (1 à 168, défaut 24), `booking.horizonDays` (7 à 90, défaut 28), `booking.modalities` (sous-ensemble non vide de `in_person`, `video`, `phone`, défaut `["in_person"]`), `booking.timezone` (fuseau IANA, défaut `Europe/Paris`). La prise de rendez-vous est **offerte** si `booking.enabled` vaut `true`, s'il existe au moins une plage, et si le profil est publié et le praticien approuvé. |
| Q76 | Créneaux offerts | Chaque plage est découpée en créneaux de `booking.slotDurationMin`, à partir de son début, dans `booking.timezone`. Un créneau est offert s'il commence au plus tôt à `maintenant + minNoticeHours`, au plus tard à la fin du jour `aujourd'hui + horizonDays`, et s'il ne chevauche aucun rendez-vous actif (`planned`, `tentative`) du praticien. L'API ne publie **que** les créneaux offerts : ni les créneaux pris, ni leur raison, ni l'amplitude réelle de travail. |
| Q77 | Un créneau en ligne est exclusif (précise Q54) | Q54 reste vraie pour le praticien : il peut superposer ses rendez-vous. Pour une demande en ligne, la vérification de l'e-mail se fait sous un verrou transactionnel par praticien : si le créneau n'est plus offert, `409 SLOT_TAKEN` et aucun rendez-vous. Le premier e-mail vérifié obtient le créneau, dans les deux modes. |
| Q78 | Des réponses publiques qui ne révèlent personne | Aucune réponse publique ne dépend de l'identité saisie. `404 BOOKING_NOT_AVAILABLE` couvre sans distinction : slug inconnu, profil non publié, praticien non approuvé, fonction désactivée. À la création : `409 SLOT_NOT_AVAILABLE` si le créneau n'est pas offert (information déjà publique), sinon `202` sans corps, y compris quand l'envoi est ignoré en silence (pot de miel, formulaire soumis en moins de 3 s, plafond d'e-mails atteint). Jamais de « vous êtes déjà patient », jamais d'acceptation automatique réservée aux patients connus : la différence de réponse dirait à n'importe qui qu'une adresse appartient à un patient. |
| Q79 | Plafonds | 5 créations par heure et par IP (règle `public-booking`, `429` avec `Retry-After`), en plus des 60 requêtes par minute de la chaîne publique. 3 e-mails de vérification par heure et par adresse (au-delà : `202`, rien n'est envoyé). Un seul rendez-vous en ligne actif et à venir par adresse et par praticien : à la vérification, `409 BOOKING_ALREADY_ACTIVE` (seul le détenteur de la boîte le voit). |
| Q80 | Lien de gestion | Après la vérification, le demandeur reçoit un lien personnel (jeton aléatoire de 256 bits, stocké haché) pour voir l'état de son rendez-vous et l'annuler, valable jusqu'à la fin du rendez-vous. Seule l'empreinte du jeton est gardée : chaque e-mail de suivi porte donc un nouveau lien, qui remplace le précédent. Les jetons voyagent dans le **corps** des requêtes vers l'API, jamais dans une URL d'API. L'annulation par le demandeur est une annulation ordinaire (`cancelled`, événement `AppointmentCancelled`) ; le praticien est prévenu par e-mail. |
| Q81 | E-mails | Au demandeur : vérification ; demande transmise (`manual`) ou rendez-vous confirmé (`auto`) avec le lien de gestion ; confirmation par le praticien ; refus ; annulation ; déplacement ; expiration. Au praticien, à l'adresse de son compte : nouvelle demande (`manual`), nouveau rendez-vous (`auto`), annulation par le demandeur. **Objet neutre** : ni nom du praticien, ni profession, ni date. Jamais la note de planification. Envoi après validation de la transaction, hors du fil de la requête ; un échec d'envoi ne remonte jamais au demandeur. Langue du demandeur : `locale` envoyée par le web (`fr` ou `en`). |
| Q82 | Expiration et conservation | **Expiration.** En `manual`, une demande sans réponse est annulée d'office 72 h après la vérification, ou au début du créneau si c'est plus tôt ; le demandeur en est prévenu. **Conservation.** (a) Demande non vérifiée : ligne supprimée après 24 h. (b) À la vérification, nom, prénom, e-mail et téléphone passent dans les colonnes `guest_*` du rendez-vous et sont effacés de `booking_request`, qui ne garde que des empreintes et des jetons hachés. (c) Rendez-vous en ligne annulé avant d'avoir eu lieu (refus, expiration, annulation) : `guest_*` à `NULL` **30 jours** après l'annulation. (d) Rendez-vous qui a eu lieu : règle de Q60, 6 mois. (e) Rattachement à un patient (`attach-patient`) : `guest_*` à `NULL` aussitôt, la personne vit alors dans le dossier du praticien. (f) La ligne `booking_request` est supprimée 30 jours après la fin ou l'annulation du rendez-vous. Deux lignes à ajouter à E9. |

### K2.2 Web (à inscrire dans le G de psymate-web par M14-09)

| # | Question | Décision |
| --- | --- | --- |
| Q60 | Où vivent les écrans | Pages publiques dans **`features/public`** : `/praticiens/:slug/rendez-vous` (créneaux et formulaire), `/rendez-vous/confirmer/:token` (suite du lien de vérification), `/rendez-vous/gerer/:token` (lien de gestion). Réglages dans **`features/account`**, page Préférences (fiche 14), section « Prise de rendez-vous en ligne ». Demandes reçues dans **`features/agenda`**. Aucune feature nouvelle. `admin` n'est pas concerné. |
| Q61 | Une demande, pas une réservation | Le mode est annoncé **avant** l'envoi. En `manual` : « Le praticien vous répondra par e-mail. Votre demande n'est pas encore un rendez-vous. » En `auto` : « Votre rendez-vous sera confirmé dès que vous aurez validé votre adresse e-mail. » L'écran d'après l'envoi dit seulement de consulter sa boîte, quel que soit le sort de la demande (Q78 de l'API). |
| Q62 | Rien du demandeur dans le navigateur | Ni `localStorage`, ni `sessionStorage`, ni paramètre d'URL ne porte le nom, l'e-mail ou le téléphone. L'état du formulaire vit dans le composant. Les pages par lien lisent le jeton dans le chemin et l'envoient à l'API dans le corps d'un `POST`. Les trois pages portent `noindex`. |
| Q63 | Mention d'urgence | Les trois pages publiques affichent, au-dessus de l'action principale : « PsyMate n'est pas un service d'urgence », avec les numéros d'urgence. Les numéros vivent dans `public-facts.ts`, les textes dans `$localize`. La liste des numéros par pays reste à valider (K10). |
| Q64 | Réglages dans `PreferencesStore` | Les huit clés `booking.*` rejoignent `core/preferences` (modèle, valeurs par défaut, nettoyage), dans la PR de contrat (M14-10), comme les clés `agenda.*`. La section de la fiche 14 les lit et les écrit par le store ; après écriture, les préférences sont relues. Si le profil public n'est pas publié, la section l'explique et renvoie vers « Mon profil public » ; l'interrupteur reste utilisable. |
| Q65 | Les demandes dans l'agenda | Une demande en ligne s'affiche comme tout rendez-vous « à confirmer » (pointillé), avec la mention « Demande en ligne ». Une entrée « Demandes », avec compteur, liste celles qui attendent (`GET /api/agenda/requests`), même hors de la fenêtre affichée. Dans le détail : « Confirmer » et « Refuser » (annulation, motif facultatif, jamais transmis au demandeur). Après chaque action, la fenêtre et la liste sont relues. L'e-mail de l'invité est affiché à côté du téléphone. |
| Q66 | Passage du contrat à `0.15.0` | `CONTRACT_TAG` passe de `contract-v0.14.0` à `contract-v0.15.0` dans une PR dédiée (M14-10), qui adapte aussi les modèles de l'agenda (`origin`, `guest.email`) et `core/preferences`. |

## K3. Parcours détaillé

### K3.1 Le demandeur

1. **Fiche publique** (`/praticiens/:slug`). Si la prise de rendez-vous est offerte, un bouton « Prendre rendez-vous » apparaît à côté de « Prendre contact ». Sinon, rien ne change.
2. **Choix du créneau** (`/praticiens/:slug/rendez-vous`). En tête : le nom du praticien, la durée d'un créneau, la mention du mode (Q61) et la mention d'urgence (Q63). Dessous : les créneaux offerts, groupés par jour, deux semaines à la fois, dans le fuseau du praticien (nommé à l'écran). Aucun créneau offert : « Aucun créneau disponible pour l'instant », avec un lien vers le formulaire de contact. Une fenêtre passée ou au-delà de l'horizon revient vide (`slots: []`), jamais en erreur.
3. **Coordonnées.** Après le choix d'un créneau : prénom, nom, e-mail, téléphone (facultatif), modalité si le praticien en offre plusieurs, case de consentement avec un lien vers la page Confidentialité. Bouton « Envoyer ma demande » (`manual`) ou « Réserver ce créneau » (`auto`).
4. **Envoi.** Réponse `202` : écran « Consultez votre boîte mail. Le lien est valable 30 minutes. » Si le créneau n'est plus disponible (`409 SLOT_NOT_AVAILABLE`) : retour au choix du créneau, message « Ce créneau n'est plus disponible », coordonnées conservées à l'écran, liste relue.
5. **Lien de vérification** (`/rendez-vous/confirmer/:token`). La page envoie le jeton. Quatre issues :
   - `manual` : « Votre demande est transmise. Le praticien vous répondra par e-mail. »
   - `auto` : « Votre rendez-vous est confirmé », avec la date, l'heure, la durée et la modalité.
   - lien expiré ou inconnu : « Ce lien n'est plus valable », avec un lien pour recommencer ;
   - créneau plus disponible (« Ce créneau n'est plus disponible » : pris entre-temps ou plus offert), ou rendez-vous déjà actif avec ce praticien : message dédié, avec un lien pour choisir un autre créneau.

   Une demande déjà vérifiée garde son résultat : le lien rouvert plus tard, même après les 30 minutes, affiche l'état courant du rendez-vous, pas « lien expiré ».
6. **E-mail de suite**, avec le lien de gestion.
7. **Gestion** (`/rendez-vous/gerer/:token`). État (« En attente de réponse », « Confirmé », « Annulé », « Passé »), date, heure, durée, modalité, nom du praticien (le nom et le lien vers sa fiche sont absents quand `practitioner.slug` vaut `null` : fiche dépubliée). Bouton « Annuler ma demande » ou « Annuler mon rendez-vous », avec une confirmation. Pas de modification : le demandeur annule et redemande.

### K3.2 Le praticien

1. **Réglages** (Mon compte › Préférences, section « Prise de rendez-vous en ligne »). Interrupteur d'activation ; choix « Je valide chaque demande » ou « Acceptation automatique dans mes plages » ; plages par jour de la semaine ; durée d'un créneau ; délai minimal ; horizon ; modalités ; fuseau (prérempli par celui du navigateur à la première activation). Un lien « Voir ma page de rendez-vous » ouvre la page publique.
2. **Nouvelle demande** (`manual`). E-mail « Nouvelle demande de rendez-vous ». Dans l'agenda : le créneau en pointillé avec la mention « Demande en ligne », et le compteur de l'entrée « Demandes ».
3. **Réponse.** Dans le détail : « Confirmer » (le rendez-vous devient planifié, le demandeur reçoit l'e-mail de confirmation) ou « Refuser » (annulation, e-mail de refus, sans motif).
4. **Mode automatique.** Le rendez-vous arrive planifié, avec la mention « Demande en ligne ». E-mail « Nouveau rendez-vous pris en ligne ».
5. **Ensuite.** Déplacer ou annuler comme tout rendez-vous : le demandeur est prévenu. Le jour venu, créer la fiche patient puis rattacher le rendez-vous (`attach-patient`, tâche M14-15).

### K3.3 États d'une demande

| Moment | `booking_request` | `appointment` | Ce que voit le demandeur |
| --- | --- | --- | --- |
| Formulaire envoyé | créée, non vérifiée | aucun | « Consultez votre boîte mail » |
| Lien suivi, mode `manual` | vérifiée, identité effacée | invité, `tentative`, `origin = online` | « En attente de réponse » |
| Lien suivi, mode `auto` | vérifiée, identité effacée | invité, `planned`, `origin = online` | « Confirmé » |
| Le praticien confirme | inchangée | `planned` | « Confirmé » |
| Le praticien refuse ou annule | `closed_by = practitioner` | `cancelled` | « Annulé » |
| Le demandeur annule | `closed_by = visitor` | `cancelled` | « Annulé » |
| Sans réponse après 72 h | `closed_by = expired` | `cancelled` | « Annulé » (demande expirée) |
| Lien jamais suivi | supprimée après 24 h | aucun | lien expiré |

### K3.4 Cas limites

- **Deux personnes, même créneau.** Aucune ne retient le créneau avant de vérifier son e-mail. La première qui vérifie l'obtient ; la seconde lit « Ce créneau n'est plus disponible » et choisit un autre créneau.
- **Le praticien pose un rendez-vous sur un créneau demandé mais pas encore vérifié.** Même issue : `409 SLOT_TAKEN` à la vérification.
- **Le praticien désactive la fonction ou dépublie son profil.** Les pages publiques répondent `404`. Les rendez-vous déjà créés restent, et le lien de gestion continue de fonctionner, sans le nom du praticien ni le lien vers sa fiche (`practitioner.slug` et `displayName` valent `null`).
- **Le praticien change de mode.** Le mode appliqué est celui lu à la vérification. Les demandes déjà en attente restent en attente.
- **Lien de vérification suivi deux fois** (double clic, antivirus de messagerie). La seconde fois renvoie le même résultat, sans second rendez-vous, même après l'échéance des 30 minutes (`verify` reste idempotent pour une demande déjà vérifiée).
- **Le praticien rattache l'invité à un patient.** Les colonnes `guest_*` sont vidées : les e-mails au demandeur s'arrêtent. Le lien de gestion reste valable.
- **Le praticien change seulement la modalité.** Le demandeur reçoit l'e-mail « Votre rendez-vous est modifié », avec un nouveau lien de gestion.
- **Adresse saisie par erreur.** Le destinataire reçoit un e-mail de vérification sans nom de praticien dans l'objet ; s'il ne clique pas, tout disparaît en 24 h.

### K3.5 Conservation des données du demandeur

| Cas | Où vivent les données | Durée |
| --- | --- | --- |
| E-mail jamais vérifié | `booking_request` | 24 h, puis ligne supprimée |
| Demande refusée, expirée ou annulée avant d'avoir eu lieu | `appointment.guest_*` | 30 jours après l'annulation, puis colonnes à `NULL` |
| Rendez-vous qui a eu lieu | `appointment.guest_*` | 6 mois après la fin (G Q60) |
| Invité rattaché à un patient | dossier du patient | celle du dossier |
| Empreintes et jetons hachés | `booking_request` | 30 jours après la fin ou l'annulation |

Ce qui échappe à l'effacement : les e-mails déjà envoyés, dans la boîte du demandeur et chez le prestataire d'envoi.

## K4. Modèle de données (migration `V15__agenda_booking.sql`)

```sql
-- Prise de rendez-vous en ligne (K, G Q71 à Q82) : origine et e-mail de l'invité, demandes publiques
ALTER TABLE appointment
  ADD COLUMN guest_email text,
  ADD COLUMN origin      text NOT NULL DEFAULT 'practitioner' CHECK (origin IN ('practitioner','online'));

ALTER TABLE appointment DROP CONSTRAINT ck_appointment_subject;
ALTER TABLE appointment ADD CONSTRAINT ck_appointment_subject CHECK (
  (patient_id IS NOT NULL AND guest_first_name IS NULL AND guest_last_name IS NULL AND guest_phone IS NULL AND guest_email IS NULL AND guest_purged_at IS NULL)
  OR (patient_id IS NULL AND (guest_last_name IS NOT NULL OR guest_purged_at IS NOT NULL))
);
CREATE INDEX ix_appointment_online_pending ON appointment(practitioner_id, starts_at)
  WHERE origin = 'online' AND status = 'tentative';

CREATE TABLE booking_request (
  id                 uuid PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES tenant(id),
  practitioner_id    uuid NOT NULL REFERENCES practitioner(id),
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz NOT NULL,
  modality           text NOT NULL CHECK (modality IN ('in_person','video','phone')),
  first_name         text,                 -- NULL dès la vérification (Q82 b)
  last_name          text,
  email              text,
  phone              text,
  locale             text NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr','en')),
  email_hash         text NOT NULL,        -- HMAC de l'adresse normalisée : plafonds de Q79
  verify_token_hash  text NOT NULL UNIQUE,
  verify_expires_at  timestamptz NOT NULL,
  verified_at        timestamptz,
  manage_token_hash  text UNIQUE,
  appointment_id     uuid REFERENCES appointment(id),
  closed_by          text CHECK (closed_by IN ('visitor','practitioner','expired')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_booking_request_order CHECK (ends_at > starts_at),
  CONSTRAINT ck_booking_request_verified CHECK ((verified_at IS NULL) = (appointment_id IS NULL)),
  CONSTRAINT ck_booking_request_identity CHECK (
    verified_at IS NULL OR (first_name IS NULL AND last_name IS NULL AND email IS NULL AND phone IS NULL)
  )
);
CREATE INDEX ix_booking_request_email ON booking_request(email_hash, created_at);
CREATE INDEX ix_booking_request_created ON booking_request(created_at) WHERE verified_at IS NULL;
CREATE INDEX ix_booking_request_appointment ON booking_request(appointment_id) WHERE appointment_id IS NOT NULL;
```

Propriétaire : module `agenda` (`TableOwnershipTests.TABLE_OWNERS += booking_request → agenda`). V12 et V13 ne sont pas modifiées. `origin` est distincte de la colonne `source` que M12 prévoyait pour Google : M12 devra réutiliser `origin` (valeur `google`) plutôt que d'ajouter `source`.

E9 reçoit deux lignes : `booking_request` (la ligne, 24 h après la création si non vérifiée, 30 jours après la fin ou l'annulation du rendez-vous sinon ; par `agenda`, `BookingPurgeJob`) ; la ligne existante des colonnes invité ajoute `guest_email` et le délai de 30 jours pour un rendez-vous en ligne annulé.

## K5. Contrat d'API (`0.15.0`, tag `contract-v0.15.0` posé par M14-08)

### K5.1 Routes publiques (sans session, `Cache-Control: no-store`)

| Route | Tâche | Rôle | Réponse |
| --- | --- | --- | --- |
| `GET /api/public/booking/practitioners/{slug}` | M14-05 | Dit si la prise de rendez-vous est offerte et avec quels réglages. | `PublicBookingDto { slug, displayName, confirmation, slotDurationMin, modalities, timezone, minNoticeHours, horizonDays }` ; `404 BOOKING_NOT_AVAILABLE` |
| `GET /api/public/booking/practitioners/{slug}/slots?from&to` | M14-05 | Créneaux offerts. `from` et `to` sont des dates `AAAA-MM-JJ` dans le fuseau du praticien, `to` inclus, 31 jours au plus (`422 WINDOW_TOO_LARGE`). | `PublicSlotsDto { timezone, slots: [{ startsAt, endsAt }] }`, instants UTC triés ; `404 BOOKING_NOT_AVAILABLE` |
| `POST /api/public/booking/practitioners/{slug}/requests` | M14-06 | Corps `CreateBookingRequest { startsAt, modality, firstName, lastName, email, phone?, locale?, consent, website, formShownAt }`. | `202` sans corps ; `404 BOOKING_NOT_AVAILABLE` ; `409 SLOT_NOT_AVAILABLE` ; `422` par champ ; `429 RATE_LIMITED` |
| `POST /api/public/booking/requests/verify` | M14-06 | Corps `{ token }`. Crée le rendez-vous invité. Idempotent tant que le jeton est valable. | `200 PublicAppointmentDto` avec `manageToken` ; `404 BOOKING_TOKEN_INVALID` ; `410 BOOKING_TOKEN_EXPIRED` ; `409 SLOT_TAKEN` ; `409 BOOKING_ALREADY_ACTIVE` ; `404 BOOKING_NOT_AVAILABLE` |
| `POST /api/public/booking/manage` | M14-06 | Corps `{ token }`. État du rendez-vous. | `200 PublicAppointmentDto` ; `404 BOOKING_TOKEN_INVALID` |
| `POST /api/public/booking/manage/cancel` | M14-06 | Corps `{ token }`. Annule ; idempotent sur un rendez-vous déjà annulé. | `200 PublicAppointmentDto` ; `404 BOOKING_TOKEN_INVALID` ; `409 APPOINTMENT_NOT_ACTIVE` si le rendez-vous est passé |

`PublicAppointmentDto` : `{ status: pending | confirmed | cancelled | past, cancelledBy?: visitor | practitioner | expired, startsAt, endsAt, durationMin, modality, practitioner: { slug, displayName }, canCancel, manageToken? }`. Il ne porte ni le nom, ni l'e-mail, ni le téléphone du demandeur, ni aucune note.

### K5.2 Routes du praticien (session)

| Route | Tâche | Changement |
| --- | --- | --- |
| `AppointmentDto` | M14-04 | `origin` (`practitioner` ou `online`) ; `guest.email` (nullable, null après la purge). |
| `POST /api/appointments`, `PATCH /api/appointments/{id}` | M14-04 | `guest.email?` (320 au plus, format e-mail, chaîne vide = aucun). `origin` refusé (`UNKNOWN_FIELD`). |
| `GET /api/agenda/requests` | M14-04 | Demandes en ligne en attente : `tentative`, `origin = online`, à venir, tri `startsAt`, 100 au plus. Réponse `{ appointments: [AppointmentDto…] }`. |
| `POST /api/appointments/{id}/confirm`, `/cancel`, `PATCH` | M14-07 | Forme inchangée. Sur un rendez-vous en ligne dont l'invité a un e-mail : e-mail au demandeur (Q81). |
| `GET`, `PATCH /api/me/preferences` | M14-02 | Les huit clés `booking.*` (Q75), erreurs `422` par clé. |

## K6. Tâches, couloirs et parallélisme

### K6.1 API (`psymate-api`)

| ID | Titre | Couloir | Dépend de | Parallèle avec |
| --- | --- | --- | --- | --- |
| M14-01 | Décisions Q71 à Q82 et documentation ; copie de ce plan côté API | docs | — | M14-02, M14-03, M14-04 |
| M14-02 | Préférences `booking.*` (Q75) | identity (preferences) | — | M14-01, M14-03, M14-04 |
| M14-03 | `PublishedProfileFacade` : slug → praticien publié et approuvé | directory (api) | — | M14-01, M14-02, M14-04 |
| M14-04 | `V15`, `origin`, `guest.email`, `GET /api/agenda/requests`, entité `BookingRequest` | agenda | — | M14-01, M14-02, M14-03 |
| M14-05 | Créneaux publics : réglages et créneaux offerts | agenda (+ une règle dans la chaîne publique) | M14-02, M14-03, M14-04 | — |
| M14-06 | Demande, vérification de l'e-mail, rendez-vous, lien de gestion, annulation par le demandeur | agenda | M14-05 | — |
| M14-07 | E-mails de suivi, expiration, purges | agenda | M14-06 | — |
| M14-08 | Seed, tag `contract-v0.15.0`, suivi | racine (`tools/seed`) | M14-07 | — |

**Vagues.** M14-A : 01, 02, 03, 04 (quatre terminaux, couloirs disjoints). M14-B : 05. M14-C : 06. M14-D : 07. M14-E : 08. Effort indicatif : 7 jours.

**Agents.** `backend-module-dev` (M14-02 à M14-07), `seed-perf` (M14-08), Claude directement pour M14-01. `reviewer` avant chaque fusion, puis `make log`.

### K6.2 Web (`psymate-web`)

| ID | Titre | Couloir | Dépend de | Parallèle avec |
| --- | --- | --- | --- | --- |
| M14-09 | Décisions Q60 à Q66, fiches 31 et 32, compléments des fiches 09, 14, 15, maquettes publiées dans la PR | docs | — (voir « Préalables ») | toutes les tâches API |
| M14-10 | Contrat `0.15.0`, clés `booking.*` dans `core/preferences`, modèles de l'agenda | `api` généré + `core/preferences` + `features/agenda` | M14-08, M14-09 | — |
| M14-11 | Réglages « Prise de rendez-vous en ligne » | `features/account` | M14-10, maquette de M14-09 | M14-12, M14-14 |
| M14-12 | Page publique : bouton de la fiche, créneaux, formulaire, écran d'attente | `features/public` | M14-10, maquette de M14-09 | M14-11, M14-14 |
| M14-13 | Pages par lien : vérification et gestion | `features/public` | M14-12 | M14-11, M14-14 |
| M14-14 | Agenda : demandes en ligne, confirmer, refuser | `features/agenda` | M14-10, maquette de M14-09 | M14-11, M14-12 |
| M14-15 | Agenda : rattacher un invité à un patient (peut glisser après le jalon) | `features/agenda` | M14-14 | M14-13 |

**Vagues.** M14-F : 09 (pendant l'API). M14-G : 10. M14-H : 11 ∥ 12 ∥ 14 (trois features, aucun fichier commun hors `messages.*.xlf`, voir le piège de fusion habituel). M14-I : 13 ∥ 15. Effort indicatif : 6 jours.

**Préalables de M14-09** (constatés le 22 novembre 2026). Deux choses manquent sur `main` : l'habillage Fluent 2 (`docs/design/fluent2.md`, G11 et Q59, encore sur la branche `fluent2-redesign`), dont dépendent les maquettes et la numérotation Q60 à Q66 ; et ce document, pas encore commité. Les tâches API n'en dépendent pas : M14-01 lit ce fichier dans le dossier de travail de `psymate-web`. Levés le 22 novembre 2026 pour ne pas retarder le jalon : M14-09 dessine les maquettes avec les tokens de `fluent2.md`, lu dans le dossier de travail sans être copié, embarque leurs valeurs dans chaque maquette, numérote **G12** et Q60 à Q66 en laissant G11 et Q59 à la branche de l'habillage, et apporte ce document sur `main`.

**Maquettes.** Les maquettes sont publiées dans la PR de M14-09 ; l'utilisateur peut les corriger après coup, les tâches d'écran les suivent à la lettre.

**Agents.** `frontend-feature-dev` pour M14-10 à M14-15 ; Claude directement pour M14-09 ; `reviewer` avant chaque fusion ; puis `pnpm progress:log`. Un seul agent par feature à la fois (H 2.7).

**e2e.** L'API tourne avec le seed `small`, qui active la prise de rendez-vous pour le praticien de démonstration (M14-08). Le lien de vérification se lit dans Mailpit, comme le font déjà `e2e/flux-9-confirmation` et `e2e/flux-7-visiteur`.

## K7. Prompts API

Manœuvre : dans `psymate-api`, `git checkout main && git pull && claude --worktree <ID>`, coller le prompt. À la fin : `Lance le sous-agent reviewer sur cette branche et corrige ce qu'il marque bloquant.`, lecture humaine (migration, diff de `contract/openapi.yaml`, un IT), `gh pr merge <n> --squash --delete-branch`.

### M14-01 — Décisions et documentation

```text
Tâche M14-01 — Inscrire le jalon M14 « Prise de rendez-vous en ligne » dans la documentation de psymate-api (docs/ et CLAUDE.md seulement ; aucun code Java, aucune migration).

Contexte : lis ../psymate-web/docs/K-plan-prise-de-rendez-vous.md en entier (il fait foi pour cette tâche), docs/G-decisions.md (Q54, Q58, Q60, Q61 et le format des lignes Q62 à Q70), docs/I-plan-agenda-api.md (I2, I3, I8 : ce que M14 étend), docs/J-plan-profil-360-api.md (modèle d'un plan de jalon), docs/A-architecture.md (A3, A5 : modules et dépendances ; la section Agenda de A4), docs/C-plan.md (C1 et la section du jalon M13, format des tables de tâches), docs/D-orchestration-backend.md (D1, D3, D5), docs/E-modele-donnees.md (E1, E3.14, E4, E9), CLAUDE.md.

Objectif :
- Nouveau fichier docs/K-plan-prise-de-rendez-vous-api.md : copie des sections K1, K2.1, K3, K4, K5, K6.1 et K7 du document du web, renumérotées K1 à K7, avec en tête la date, le renvoi au document du web pour la partie web, et la phrase « Pour toute tâche M14, ce document fait foi (K4 DDL, K5 contrat) ».
- G : nouvelle section « Prise de rendez-vous en ligne, jalon M14 » avec Q71 à Q82 copiées de K2.1, une ligne par question, même style que Q62 à Q70, datées du 22 novembre 2026, « tranchées par l'utilisateur ». Q54 et Q60 reçoivent en fin de texte « Précisée par Q77 » et « Complétée par Q82 ».
- A : A3 et A5 disent que agenda dépend aussi de directory :: api (PublishedProfileFacade) et que directory ne dépend toujours pas d'agenda ; la section Agenda de A4 renvoie à K5.
- C : C1 ajoute le jalon M14 (objectif, démontrable, effort indicatif 7 j) ; nouvelle section pour M14 avec le tableau des tâches M14-01 à M14-08, critères repris mot pour mot de K7.
- D : D1, D3, D5 reçoivent les lignes, vagues et couloirs de K6.1.
- E : E1 ajoute booking_request → agenda ; E3.14 reçoit le DDL de K4, identique octet pour octet ; E4 ajoute la ligne V15__agenda_booking.sql ; E9 reçoit les deux changements décrits sous K4.
- CLAUDE.md : une ligne « La prise de rendez-vous en ligne vit dans agenda (G Q71) : aucun compte patient, e-mail vérifié avant tout rendez-vous, réponses publiques qui ne révèlent personne (Q78). Pour toute tâche M14, docs/K-plan-prise-de-rendez-vous-api.md fait foi. » ; la liste des dépendances d'agenda est mise à jour.
- .claude/agents/backend-module-dev.md : ajoute « docs/K-plan-prise-de-rendez-vous-api.md pour toute tâche M14 » à sa liste de lecture.

Périmètre : docs/**, CLAUDE.md, .claude/agents/backend-module-dev.md. Rien d'autre.

Critères d'acceptation :
- G Q71 à Q82 existent ; Q54 et Q60 y renvoient ;
- chaque tâche M14-01 à M14-08 a sa ligne dans C et D avec les dépendances de K6.1 ;
- le DDL de E3.14 est identique octet pour octet au bloc SQL de K4 ;
- E9 porte la ligne booking_request et la ligne des colonnes invité mise à jour ;
- ./mvnw verify reste vert (aucune source touchée).

Interdits : toute modification de code, de migration ou de contrat ; toute réécriture de docs/progress/index.html ou d'un événement existant ; inscrire une décision que K ne contient pas.

Livrable : PR « M14-01 Prise de rendez-vous en ligne : décisions et documentation », puis make log TASK=M14-01 AGENT=claude STATUS=done SUMMARY="…" PR=<url>.
```

### M14-02 — Préférences `booking.*`

```text
Tâche M14-02 — Préférences booking.* (dépôt psymate-api, module identity, sous-domaine preferences). Utilise l'agent backend-module-dev.

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous-api.md (K2.1 Q75 ; tant que M14-01 n'est pas fusionnée, ../psymate-web/docs/K-plan-prise-de-rendez-vous.md fait foi), docs/G-decisions.md Q57 (préférences agenda.*, le précédent à suivre). Code : identity/preferences/Preferences.java et PreferencesSchema.java (clés agenda.*, valeurs par défaut, validation après fusion), leurs tests, et la PR de M11-04.

Objectif :
- Huit clés plates, avec leurs valeurs par défaut renvoyées par GET /api/me/preferences même quand rien n'est enregistré : booking.enabled (false), booking.confirmation ("manual" ; "manual" ou "auto"), booking.windows ([] ; liste de { day, start, end }), booking.slotDurationMin (60), booking.minNoticeHours (24), booking.horizonDays (28), booking.modalities (["in_person"]), booking.timezone ("Europe/Paris").
- Validation à l'écriture (PATCH /api/me/preferences), erreurs 422 avec field = la clé :
  - booking.confirmation hors liste → INVALID_VALUE ;
  - booking.windows : day entier de 1 à 7 ; start et end au format HH:mm, minutes multiples de 5, end strictement après start ; 21 plages au plus ; deux plages du même jour ne se chevauchent pas ; tout objet mal formé ou champ inconnu → INVALID_VALUE ; plus de 21 → OUT_OF_RANGE ;
  - booking.slotDurationMin : entier de 15 à 180, multiple de 5 → OUT_OF_RANGE sinon ;
  - booking.minNoticeHours : entier de 1 à 168 ; booking.horizonDays : entier de 7 à 90 → OUT_OF_RANGE sinon ;
  - booking.modalities : liste non vide, sans doublon, de in_person, video, phone → INVALID_VALUE sinon ;
  - booking.timezone : identifiant IANA connu de java.time.ZoneId → INVALID_VALUE sinon.
- Les plages sont stockées triées (jour, puis début). Aucune règle croisée : booking.enabled = true avec zéro plage est accepté (la fonction n'est alors simplement pas offerte, Q75).
- PreferencesSchema décrit les huit clés (type, bornes, défaut, exemple) pour le contrat ; PreferencesChanged est publié comme pour les autres clés.
- Contrat regénéré (make contract), app.contract.version = 0.15.0 si aucune tâche M14 ne l'a déjà posé.

Périmètre : src/main/java/com/psymate/identity/preferences/**, leurs tests, messages_fr.properties / messages_en.properties (clés sous « # preferences booking (M14-02) »), contract/openapi.yaml (généré).

Critères d'acceptation (PreferencesBookingIT, PreferencesBookingTest) :
- GET sans préférence enregistrée renvoie les huit valeurs par défaut ;
- PATCH { "booking.enabled": true, "booking.confirmation": "auto", "booking.windows": [{ "day": 1, "start": "09:00", "end": "12:00" }] } → 200, valeurs relues à l'identique ;
- des plages envoyées dans le désordre sont relues triées ;
- chaque règle de validation ci-dessus a un cas qui répond 422 avec le bon code sur la bonne clé, et aucune écriture partielle (les autres clés du même PATCH ne sont pas enregistrées) ;
- deux plages du lundi 09:00–12:00 et 11:00–13:00 → 422 INVALID_VALUE sur booking.windows ; 09:00–12:00 et 12:00–14:00 → acceptées ;
- booking.timezone "Europe/Paris" et "America/Montreal" acceptées, "Paris" refusée ;
- les clés existantes (locale, agenda.*, sessions.*) gardent leur comportement : leurs tests restent verts ;
- ContractIT vert, contrat regénéré.

Tests : unitaires pour la validation des plages ; IT Testcontainers pour GET et PATCH.

Interdits : toute table ou colonne nouvelle ; toute route nouvelle ; toute lecture de ces clés hors d'identity dans cette tâche ; dépendance Maven.

Livrable : PR « M14-02 Préférences booking.* », puis make log TASK=M14-02 AGENT=backend-module-dev STATUS=done SUMMARY="…" PR=<url>.
```

### M14-03 — `PublishedProfileFacade`

```text
Tâche M14-03 — Façade PublishedProfileFacade dans directory.api (dépôt psymate-api, module directory). Utilise l'agent backend-module-dev.

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous-api.md (K2.1 Q71, Q75, Q78), docs/G-decisions.md Q48 (règle « praticien approuvé », lue par PractitionerFacade). Code : directory/api (aujourd'hui deux événements, aucune façade), directory/repository/PractitionerProfileRepository.java (findPublishedRecipient), directory/service/PublicDirectoryService.java (où le filtre « approuvé » est appliqué), identity/api/PractitionerFacade.java, agenda/api/AppointmentExportFacade.java et son implémentation (modèle d'une façade : interface dans api, implémentation dans service, vue dans api).

Objectif :
- directory.api.PublishedProfileFacade : Optional<PublishedProfileView> bySlug(String slug) et Optional<PublishedProfileView> byPractitioner(UUID practitionerId).
- directory.api.PublishedProfileView : practitionerId, tenantId, slug, displayName. Rien d'autre : ni coordonnées, ni photo.
- Les deux méthodes ne renvoient une vue que si le profil est publié ET le praticien approuvé (verification_status = approved, lu par PractitionerFacade, comme Q48 (2)). Slug inconnu, profil non publié, praticien suspendu, rejeté ou clos : Optional vide, sans distinction.
- Implémentation directory.service.PublishedProfileFacadeImpl, transaction en lecture seule.
- Aucune route, aucun DTO web, aucun changement du contrat.

Périmètre : src/main/java/com/psymate/directory/api/**, directory/service/PublishedProfileFacadeImpl.java, une méthode de lecture ajoutée à PractitionerProfileRepository si nécessaire, leurs tests.

Critères d'acceptation (PublishedProfileFacadeIT) :
- profil publié d'un praticien approuvé → vue avec les quatre champs, par slug et par identifiant ;
- slug inconnu → vide ; profil existant mais non publié → vide ; profil publié d'un praticien suspendu → vide ;
- ModularityTests et ArchitectureTests verts ; directory ne dépend toujours que d'identity :: api, events :: api et shared ;
- ContractIT vert, contrat inchangé.

Tests : IT Testcontainers.

Interdits : exposer une entité ou un repository dans api ; ajouter un champ à la vue ; toute dépendance de directory vers agenda ; route ; migration ; dépendance Maven.

Livrable : PR « M14-03 PublishedProfileFacade », puis make log TASK=M14-03 …
```

### M14-04 — Migration V15, origine, e-mail de l'invité, demandes en attente

```text
Tâche M14-04 — Agenda : migration V15, origine d'un rendez-vous, e-mail de l'invité, liste des demandes en attente, entité BookingRequest (dépôt psymate-api, module agenda). Utilise l'agent backend-module-dev.

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous-api.md (K2.1 Q74, Q82 ; K4 DDL ; K5.2), docs/I-plan-agenda-api.md I8 (rendez-vous invité, GuestPurgeJob), docs/E-modele-donnees.md E3.14, E4, E9. Code : agenda/model/Appointment.java, agenda/dto (GuestDto, GuestRequest, AppointmentDto, AppointmentMapper, AppointmentAssembler), agenda/service/AppointmentService.java et GuestPurgeJob.java, agenda/controller (AgendaController, AppointmentForbiddenFieldsAdvice), agenda/repository/AppointmentRepository.java, V13__agenda_guest.sql, les IT AppointmentGuestIT et GuestPurgeJobIT.

Objectif :
- src/main/resources/db/migration/V15__agenda_booking.sql : le bloc SQL de K4, identique octet pour octet. V12 et V13 ne sont pas touchées.
- Appointment : guestEmail (nullable) et origin (enum AppointmentOrigin : PRACTITIONER, ONLINE ; défaut PRACTITIONER). Un rendez-vous créé par POST /api/appointments a toujours origin = practitioner.
- GuestRequest.email (facultatif, 320 au plus, format e-mail, chaîne vide = aucun ; INVALID_FORMAT, OUT_OF_RANGE sur guest.email) à la création et au PATCH (absent ou null = inchangé, chaîne vide = effacé, comme phone). GuestDto.email (null si inconnu ou purgé). AppointmentDto.origin ("practitioner" | "online"). origin est refusé en écriture (UNKNOWN_FIELD) à la création et au PATCH.
- attach-patient vide aussi guest_email. Les séries recopient guest_email.
- GuestPurgeJob : met aussi guest_email à NULL. Deux délais : app.agenda.guest-purge.retention (P180D, inchangé) et app.agenda.guest-purge.online-cancelled-retention (P30D) pour les rendez-vous origin = online ET status = cancelled, comptés depuis cancelled_at (Q82 c).
- GET /api/agenda/requests (AgendaController) : rendez-vous du praticien courant avec status = tentative, origin = online, starts_at >= maintenant, tri starts_at puis id, 100 au plus. Réponse { appointments: [AppointmentDto…] } (nouveau DTO BookingRequestsDto ou réemploi d'un DTO de liste existant s'il a exactement cette forme).
- Entité agenda/model/BookingRequest (toutes les colonnes de K4, UUID nus, aucune association JPA) et agenda/repository/BookingRequestRepository (vide de méthodes métier : elles viennent avec M14-06). TableOwnershipTests : booking_request → agenda.
- AppointmentExportView et les exports ne changent pas dans cette tâche.
- Contrat regénéré, app.contract.version = 0.15.0.

Périmètre : src/main/java/com/psymate/agenda/**, V15__agenda_booking.sql, application.yml (une clé), leurs tests, messages (sous « # agenda (M14-04) »), contract/openapi.yaml (généré), TableOwnershipTests (une ligne).

Critères d'acceptation (AppointmentGuestEmailIT, AgendaRequestsIT, GuestPurgeJobIT complété) :
- POST avec guest { lastName, email: "sara@example.test" } → 201, guest.email renvoyé, origin = "practitioner" ; email "abc" → 422 INVALID_FORMAT sur guest.email ; origin dans le corps → 422 UNKNOWN_FIELD ;
- PATCH { guest: { lastName: "Benali", email: "" } } efface l'e-mail ; e-mail absent → inchangé ;
- attach-patient → guest_email NULL ;
- GET /api/agenda/requests ne renvoie que les rendez-vous tentative d'origine online à venir du praticien courant (un tentative créé par le praticien, un online déjà planned, un online passé, un online d'un autre praticien n'y figurent pas), triés ;
- purge : rendez-vous online annulé il y a 31 jours → guest_* et guest_email NULL, guest_purged_at posé ; annulé il y a 29 jours → intact ; rendez-vous online qui a eu lieu il y a 5 mois → intact, il y a 7 mois → purgé ; rendez-vous practitioner annulé il y a 31 jours → intact (règle des 6 mois) ;
- FlywayMigrationIT (V15), TableOwnershipTests, ArchitectureTests verts ; AppointmentIT, AppointmentGuestIT, AgendaQueryIT, AppointmentSeriesIT et les IT d'export restent verts ;
- contrat 0.15.0 regénéré, ContractIT vert.

Tests : IT Testcontainers par endpoint ; unitaire pour la règle de l'e-mail.

Interdits : modifier V12 ou V13 ; tout DELETE sur appointment ; toute route publique (M14-05, M14-06) ; toute lecture de préférences booking.* ; dépendance Maven ; tout import hors identity.api, patients.api, events.api, shared.

Livrable : PR « M14-04 Agenda : origine, e-mail de l'invité, demandes en attente », puis make log TASK=M14-04 …
```

### M14-05 — Créneaux publics

```text
Tâche M14-05 — Prise de rendez-vous en ligne : réglages publics et créneaux offerts (dépôt psymate-api, module agenda ; une ligne dans directory/config et dans application.yml). Utilise l'agent backend-module-dev. Dépend de M14-02, M14-03 et M14-04.

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous-api.md (K2.1 Q71, Q75, Q76, Q78 ; K5.1), docs/G-decisions.md Q24 (limitation de taux), Q54. Code : directory/config/PublicSecurityConfig.java (chaîne /api/public/**, règles public-directory et public-contact), application.yml (app.rate-limits.rules), directory/controller/PublicContactController.java (modèle d'un contrôleur public documenté), directory/api/PublishedProfileFacade.java (M14-03), identity/api/PractitionerFacade.preferencesOf, agenda/service/AgendaQueryService.java (lecture des rendez-vous actifs d'une fenêtre), agenda/package-info.java.

Objectif :
- agenda/package-info.java : allowedDependencies += "directory :: api". Le commentaire du module est mis à jour.
- agenda/service/BookingSettings (record) et BookingSettingsReader : lit les huit clés booking.* par PractitionerFacade.preferencesOf et les rend typées (ZoneId, List<Window>, Set<AppointmentModality>…), avec les valeurs par défaut si une clé manque.
- agenda/service/BookingAvailability : « offerte » = profil publié et praticien approuvé (PublishedProfileFacade), booking.enabled = true, au moins une plage (Q75).
- agenda/service/SlotCalculator (pur, testable sans base) : à partir des réglages, d'un intervalle de dates, de l'instant courant et des intervalles occupés, rend les créneaux offerts selon Q76 : découpe de chaque plage en créneaux de slotDurationMin depuis son début, dans le fuseau du praticien (une plage qui ne contient pas un créneau entier n'en donne aucun ; le reste en fin de plage est ignoré) ; début >= maintenant + minNoticeHours ; début <= fin du jour (aujourd'hui + horizonDays) dans le fuseau ; aucun chevauchement avec un rendez-vous actif (planned, tentative ; les annulés et les done ne comptent pas). Les changements d'heure sont traités par java.time (un créneau qui n'existe pas le jour du passage à l'heure d'été n'est pas offert).
- agenda/controller/PublicBookingController, @RequestMapping("/api/public/booking") :
  - GET /practitioners/{slug} → PublicBookingDto { slug, displayName, confirmation, slotDurationMin, modalities, timezone, minNoticeHours, horizonDays } ;
  - GET /practitioners/{slug}/slots?from&to → PublicSlotsDto { timezone, slots: [PublicSlotDto { startsAt, endsAt }] }, instants UTC triés ; from et to sont des LocalDate dans le fuseau du praticien, to inclus ; from absent = aujourd'hui, to absent = from + 13 jours ; to avant from → 422 INVALID_VALUE sur to ; plus de 31 jours → 422 WINDOW_TOO_LARGE ;
  - 404 BOOKING_NOT_AVAILABLE dans tous les cas de Q78, avec le même corps ;
  - Cache-Control: no-store sur les deux routes.
- Les créneaux ne portent rien d'autre que début et fin : ni identifiant, ni raison, ni nombre de places.
- Règle de taux public-booking (POST /api/public/booking/practitioners/*/requests, par IP, 5 par heure) déclarée dans application.yml et posée dans PublicSecurityConfig à la suite de public-contact : elle sert M14-06 mais se déclare ici pour ne toucher directory qu'une fois.
- Documentation OpenAPI complète des deux routes (description, exemples, erreurs), comme PublicContactController. Contrat regénéré.

Périmètre : src/main/java/com/psymate/agenda/** (fichiers nouveaux préfixés Booking, PublicBooking ou Slot), agenda/package-info.java, directory/config/PublicSecurityConfig.java (une ligne), application.yml (une règle), leurs tests, messages (sous « # booking (M14-05) »), contract/openapi.yaml (généré).

Critères d'acceptation (SlotCalculatorTest, PublicBookingSlotsIT) :
- plage lundi 09:00–12:00, créneaux de 60 min → trois créneaux 09:00, 10:00, 11:00 heure de Paris, renvoyés en UTC ; créneaux de 45 min → 09:00, 09:45, 10:30, 11:15 ; plage 09:00–09:30 avec des créneaux de 60 min → aucun ;
- un rendez-vous planned de 10:00 à 10:50 retire le créneau de 10:00 et laisse 09:00 et 11:00 ; un tentative le retire aussi ; un cancelled ne retire rien ; un rendez-vous de 09:30 à 10:30 retire 09:00 et 10:00 ;
- minNoticeHours = 24 : un créneau qui commence dans 23 h n'est pas offert, dans 25 h il l'est ; horizonDays = 7 : rien au-delà ;
- fuseau America/Montreal : les instants UTC renvoyés correspondent aux heures locales de Montréal ;
- le dernier dimanche de mars, une plage 02:00–04:00 ne produit pas de créneau à une heure qui n'existe pas ;
- booking.enabled = false, zéro plage, profil non publié, praticien suspendu, slug inconnu → 404 BOOKING_NOT_AVAILABLE, corps identiques (le test les compare) ;
- la réponse des créneaux ne contient aucun champ hors startsAt et endsAt, et aucun créneau occupé ;
- fenêtre de 32 jours → 422 WINDOW_TOO_LARGE ; 61 requêtes en une minute depuis une IP → 429 ;
- les deux routes répondent sans session et sans cookie ; aucun en-tête Set-Cookie ;
- ModularityTests vert avec agenda → directory :: api ; directory n'importe rien d'agenda ; ContractIT vert.

Tests : unitaires nombreux pour SlotCalculator (c'est le cœur) ; IT Testcontainers pour les deux routes.

Interdits : exposer un rendez-vous, un nom ou un créneau occupé ; lire practitioner_profile en SQL depuis agenda ; écrire quoi que ce soit en base ; POST public (M14-06) ; toute autre modification de directory ; dépendance Maven.

Livrable : PR « M14-05 Créneaux publics », puis make log TASK=M14-05 …
```

### M14-06 — Demande, vérification, rendez-vous, lien de gestion

```text
Tâche M14-06 — Prise de rendez-vous en ligne : demande, vérification de l'e-mail, création du rendez-vous, lien de gestion, annulation par le demandeur (dépôt psymate-api, module agenda). Utilise l'agent backend-module-dev. Dépend de M14-05.

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous-api.md (K2.1 Q72 à Q74, Q77 à Q82 ; K3.3, K3.4 ; K4 ; K5.1), docs/G-decisions.md Q38 (SQL natif par fragment *NativeQueries), Q49 (réponses qui n'énumèrent rien). Code : directory/service/ContactRequestService.java (pot de miel, délai de 3 s, enregistrement puis envoi après validation de la transaction sur un pool privé, échec d'envoi jamais remonté) et ContactMailer.java ; identity/auth/service/AuthMailer.java (gabarits, app.web.base-url, langue) et la façon dont identity hache ses jetons ; agenda/service/AppointmentService.java (création d'un rendez-vous invité, événements) ; agenda/model/BookingRequest.java et V15 (M14-04) ; agenda/service/SlotCalculator, BookingSettingsReader, BookingAvailability (M14-05) ; shared/ratelimit.

Objectif :
- POST /api/public/booking/practitioners/{slug}/requests, corps CreateBookingRequest { startsAt (instant UTC), modality, firstName (requis, 100), lastName (requis, 100), email (requis, format, 320), phone? (30, règle de guest.phone), locale? ("fr" | "en", défaut "fr"), consent (doit valoir true), website (pot de miel), formShownAt (requis) }.
  - Ordre : validation de forme (422 par champ, codes REQUIRED, INVALID_FORMAT, OUT_OF_RANGE, INVALID_VALUE) ; 404 BOOKING_NOT_AVAILABLE si la fonction n'est pas offerte ; 409 SLOT_NOT_AVAILABLE si startsAt n'est pas le début d'un créneau offert (SlotCalculator) ou si modality n'est pas dans booking.modalities ; puis 202 sans corps.
  - Sous le 202, ignoré en silence, sans ligne ni e-mail : pot de miel rempli ; formulaire soumis en moins de 3 s ou dans le futur ; quatrième demande dans l'heure pour la même empreinte d'e-mail (Q79, comptée sur booking_request.email_hash).
  - Sinon : ligne booking_request (identité en clair, email_hash = HMAC-SHA-256 de l'adresse en minuscules sans blancs avec le secret app.booking.hash-secret, verify_token_hash = SHA-256 d'un jeton aléatoire de 256 bits, verify_expires_at = maintenant + app.booking.verify-ttl, défaut PT30M), puis, après validation de la transaction et hors du fil de la requête, e-mail de vérification au demandeur avec le lien {app.web.base-url}/rendez-vous/confirmer/{jeton}. Aucun rendez-vous, aucun e-mail au praticien.
- POST /api/public/booking/requests/verify { token } :
  - jeton inconnu → 404 BOOKING_TOKEN_INVALID ; expiré et non vérifié → 410 BOOKING_TOKEN_EXPIRED ;
  - déjà vérifié → 200 avec l'état courant du même rendez-vous (idempotent), sans nouveau jeton de gestion : manageToken est absent de cette seconde réponse ;
  - sinon, dans une seule transaction, sous un verrou consultatif transactionnel par praticien (pg_advisory_xact_lock, fragment BookingNativeQueries, G Q38) : 404 BOOKING_NOT_AVAILABLE si la fonction n'est plus offerte ; 409 BOOKING_ALREADY_ACTIVE s'il existe déjà un rendez-vous origin = online, actif, à venir, du même praticien avec le même guest_email (casse et blancs ignorés) ; 409 SLOT_TAKEN si le créneau n'est plus offert (Q77) ; sinon création du rendez-vous invité (guest_* depuis la demande, guest_email, origin = online, modalité et horaires de la demande, statut tentative si booking.confirmation = manual, planned si auto), événement AppointmentPlanned, puis booking_request : verified_at, appointment_id, manage_token_hash, et first_name, last_name, email, phone mis à NULL.
  - Réponse 200 PublicAppointmentDto avec manageToken (le seul moment où il est renvoyé).
  - Après validation de la transaction : e-mail au demandeur (« demande transmise » en manual, « rendez-vous confirmé » en auto) avec le lien {app.web.base-url}/rendez-vous/gerer/{jeton de gestion} ; e-mail au praticien (adresse du compte, sa langue) : « nouvelle demande » ou « nouveau rendez-vous », avec le nom du demandeur, la date et un lien vers /agenda.
  - Sur 409 SLOT_TAKEN et BOOKING_ALREADY_ACTIVE, la demande reste non vérifiée : elle sera supprimée par la purge.
- POST /api/public/booking/manage { token } → 200 PublicAppointmentDto ; jeton inconnu → 404 BOOKING_TOKEN_INVALID.
- POST /api/public/booking/manage/cancel { token } : annule le rendez-vous (status cancelled, cancelled_at, cancel_reason = libellé i18n « Annulé par le demandeur »), booking_request.closed_by = visitor, événement AppointmentCancelled, e-mail au praticien. Déjà annulé → 200, sans second e-mail. Rendez-vous commencé ou done → 409 APPOINTMENT_NOT_ACTIVE.
- PublicAppointmentDto { status, cancelledBy?, startsAt, endsAt, durationMin, modality, practitioner { slug, displayName }, canCancel, manageToken? } : status = pending (tentative), confirmed (planned, à venir), cancelled, past (planned ou done dont la fin est passée) ; cancelledBy lu dans closed_by ; canCancel vrai si pending ou confirmed. practitioner est lu par PublishedProfileFacade.byPractitioner ; si le profil n'est plus publié, slug vaut null et displayName reste celui de PractitionerFacade.
- Quand le praticien annule un rendez-vous en ligne (POST /api/appointments/{id}/cancel), booking_request.closed_by = practitioner (les e-mails viennent avec M14-07).
- Gabarits d'e-mail fr et en (BookingMailer), objets neutres (Q81) : « Confirmez votre demande de rendez-vous », « Votre demande de rendez-vous », « Votre rendez-vous ». Le corps porte le nom du praticien, la date et l'heure dans le fuseau du praticien avec le nom du fuseau, la durée, la modalité, le lien, et la phrase « PsyMate n'est pas un service d'urgence ». Jamais la note de planification.
- Propriétés : app.booking.hash-secret (variable d'environnement APP_BOOKING_HASH_SECRET, valeur d'exemple non réelle par défaut pour le développement et les tests), app.booking.verify-ttl.
- Documentation OpenAPI complète des quatre routes. Contrat regénéré.

Périmètre : src/main/java/com/psymate/agenda/** (fichiers Booking*, PublicBooking* ; AppointmentService pour closed_by seulement), application.yml, gabarits d'e-mail et messages (sous « # booking (M14-06) »), leurs tests, contract/openapi.yaml (généré).

Critères d'acceptation (PublicBookingRequestIT, PublicBookingVerifyIT, PublicBookingManageIT, BookingRulesTest) :
- demande bien formée sur un créneau offert → 202, une ligne booking_request non vérifiée, un e-mail au demandeur dont l'objet ne contient ni le nom du praticien ni sa profession, aucun rendez-vous, aucun e-mail au praticien ;
- pot de miel rempli ou formShownAt il y a 1 s → 202, aucune ligne, aucun e-mail ; quatrième demande de la même adresse dans l'heure → 202, aucun e-mail ; sixième création de la même IP dans l'heure → 429 ;
- startsAt qui n'est pas un créneau offert → 409 SLOT_NOT_AVAILABLE ; modalité non offerte → 409 SLOT_NOT_AVAILABLE ; consent false → 422 ; e-mail invalide → 422 INVALID_FORMAT sur email ; slug inconnu ou fonction désactivée → 404 BOOKING_NOT_AVAILABLE ;
- deux demandes identiques au nom près, l'une pour une adresse qui a déjà un rendez-vous chez ce praticien, l'autre non : réponses HTTP identiques (statut, corps, en-têtes hors date) ;
- vérification en mode manual → 200 status pending, rendez-vous invité tentative, origin online, guest_email renseigné, AppointmentPlanned publié, identité à NULL dans booking_request, un e-mail au demandeur avec un lien de gestion, un e-mail au praticien ; en mode auto → status confirmed, rendez-vous planned ;
- le mode appliqué est celui du moment de la vérification (demande créée en manual, préférence passée à auto, vérification → planned) ;
- second appel de verify avec le même jeton → 200, même rendez-vous, pas de second rendez-vous ni de second e-mail, pas de manageToken ;
- jeton inconnu → 404 ; jeton vieux de 31 min → 410 ; les jetons n'apparaissent jamais en clair en base (le test relit la ligne) ni dans les journaux ;
- deux demandes vérifiées pour le même créneau, l'une après l'autre : la seconde → 409 SLOT_TAKEN, un seul rendez-vous ; les deux en parallèle (deux fils) : exactement un rendez-vous ;
- un rendez-vous posé par le praticien sur le créneau entre la demande et la vérification → 409 SLOT_TAKEN ;
- même adresse, second créneau chez le même praticien alors que le premier rendez-vous est actif et à venir → 409 BOOKING_ALREADY_ACTIVE ; chez un autre praticien → accepté ;
- manage → état correct pour pending, confirmed, cancelled (avec cancelledBy), past ; manage/cancel → rendez-vous cancelled, closed_by visitor, AppointmentCancelled, un e-mail au praticien ; second cancel → 200 sans e-mail ; rendez-vous passé → 409 ;
- PublicAppointmentDto ne contient ni nom, ni e-mail, ni téléphone du demandeur, ni planningNote (le test inspecte le JSON) ;
- un échec du serveur d'envoi ne change aucune réponse HTTP ;
- GET /api/agenda et GET /api/agenda/requests du praticien montrent la demande après vérification, jamais avant ;
- ModularityTests, ArchitectureTests, TableOwnershipTests, ContractIT verts.

Tests : unitaires pour les règles (états, idempotence, empreinte) ; IT Testcontainers pour chaque route, avec lecture des e-mails comme le font les IT des mailers existants.

Interdits : créer un patient ; écrire dans une table d'un autre module ; journaliser un nom, une adresse, un téléphone ou un jeton ; renvoyer une réponse qui dépend de l'identité saisie avant la vérification ; retenir un créneau avant la vérification ; un champ libre de motif ; appeler un service externe ; dépendance Maven.

Livrable : PR « M14-06 Demande en ligne, vérification et lien de gestion », puis make log TASK=M14-06 …
```

### M14-07 — E-mails de suivi, expiration, purges

```text
Tâche M14-07 — Prise de rendez-vous en ligne : e-mails de suivi au demandeur, expiration des demandes sans réponse, purges (dépôt psymate-api, module agenda). Utilise l'agent backend-module-dev. Dépend de M14-06.

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous-api.md (K2.1 Q81, Q82 ; K3.3 ; K3.5), docs/E-modele-donnees.md E9. Code : agenda/service/AppointmentService.java (confirm, cancel, update, attach-patient et leurs événements), BookingMailer et le pool d'envoi (M14-06), agenda/service/GuestPurgeJob.java et directory/service/ContactPurgeJob.java (modèle d'une tâche planifiée : planificateur privé, cron en propriété, run() appelable par les tests, journal du nombre de lignes seulement).

Objectif :
- E-mails au demandeur, pour un rendez-vous origin = online dont guest_email n'est pas NULL, envoyés après validation de la transaction et hors du fil de la requête :
  - confirm (tentative → planned) : « Votre rendez-vous est confirmé » ;
  - cancel d'un tentative par le praticien : « Votre demande n'a pas pu être acceptée », sans motif ;
  - cancel d'un planned par le praticien : « Votre rendez-vous est annulé », sans motif ;
  - PATCH qui change startsAt ou la durée : « Votre rendez-vous est déplacé », ancienne et nouvelle date ;
  - PATCH qui ne change que la note ou l'identité de l'invité : aucun e-mail.
  Objets neutres (Q81), lien de gestion rappelé quand le rendez-vous reste actif, langue = booking_request.locale. Le cancel_reason du praticien n'est jamais transmis.
- Le lien de gestion ne peut pas être reconstruit (seule son empreinte est stockée) : chaque e-mail de suivi émet un nouveau jeton de gestion et remplace manage_token_hash. Le lien le plus récent est le seul valable ; les gabarits le disent en une phrase.
- BookingExpiryJob (cron app.booking.expiry.cron, défaut toutes les 15 min ; app.booking.pending-ttl, défaut PT72H) : annule les rendez-vous origin = online, status = tentative, dont la vérification date de plus de pending-ttl ou dont starts_at est passé ; cancel_reason = libellé i18n « Demande expirée », booking_request.closed_by = expired, événement AppointmentCancelled, e-mail « Votre demande a expiré » au demandeur. run() appelable par les tests ; idempotent.
- BookingPurgeJob (cron app.booking.purge.cron, défaut 0 45 3 * * * UTC) : supprime les lignes booking_request non vérifiées créées depuis plus de app.booking.unverified-retention (PT24H), et les lignes vérifiées dont le rendez-vous est terminé ou annulé depuis plus de app.booking.closed-retention (P30D). Journalise des nombres, jamais d'identité.
- E9 est déjà à jour (M14-01) : le code doit lui correspondre exactement.

Périmètre : src/main/java/com/psymate/agenda/**, application.yml, gabarits et messages (sous « # booking (M14-07) »), leurs tests.

Critères d'acceptation (BookingNotificationsIT, BookingExpiryJobIT, BookingPurgeJobIT) :
- confirmer une demande en ligne → un e-mail au demandeur, objet neutre, dans sa langue ; confirmer un tentative créé par le praticien → aucun e-mail ;
- refuser une demande → e-mail de refus qui ne contient pas le motif saisi par le praticien ; annuler un rendez-vous planned en ligne → e-mail d'annulation ;
- déplacer → e-mail avec les deux dates ; changer la note → aucun e-mail ; invité sans e-mail ou rattaché à un patient → aucun e-mail ;
- après un e-mail de suivi, l'ancien lien de gestion répond 404 BOOKING_TOKEN_INVALID et le nouveau fonctionne ;
- expiration : demande vérifiée il y a 73 h → cancelled, closed_by expired, e-mail ; il y a 71 h → intacte ; créneau commencé → expirée ; une demande déjà confirmée n'expire jamais ; second passage → aucun effet, aucun e-mail ;
- purge : demande non vérifiée de 25 h → ligne supprimée, de 23 h → conservée ; demande vérifiée dont le rendez-vous est annulé depuis 31 jours → ligne supprimée, le rendez-vous reste ; depuis 29 jours → conservée ; aucune ligne appointment n'est jamais supprimée ;
- un échec du serveur d'envoi ne fait échouer ni confirm, ni cancel, ni PATCH, ni les tâches planifiées ;
- ContractIT vert, contrat inchangé ; tous les IT de l'agenda restent verts.

Tests : IT Testcontainers ; horloge injectée pour les délais.

Interdits : transmettre le motif d'annulation ou la note de planification ; envoyer un e-mail pour un rendez-vous d'origine practitioner ; tout DELETE sur appointment ; SMS ; rappel avant le rendez-vous ; dépendance Maven ; service externe.

Livrable : PR « M14-07 E-mails de suivi, expiration et purges », puis make log TASK=M14-07 …
```

### M14-08 — Seed, tag de contrat, suivi

```text
Tâche M14-08 — Seed de la prise de rendez-vous en ligne, tag du contrat, suivi (dépôt psymate-api, tools/seed et racine). Utilise l'agent seed-perf. Dépend de M14-07.

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous-api.md (K4, K5, K6.1), la PR de M13-03 (seed et tag de contrat du jalon précédent), tools/seed (comment le seed pose les préférences agenda.* et les rendez-vous invités), le Makefile (make seed, make contract).

Objectif :
- Seed, tailles small et au-delà : le praticien de démonstration au profil publié (le compte « claire » de tools/seed, Accounts.java et DemoStory.java ; relève son slug réel et cite-le dans la PR) a booking.enabled = true, booking.confirmation = manual, des plages du lundi au vendredi 09:00–12:00 et 14:00–18:00, créneaux de 60 min, délai 24 h, horizon 28 jours, modalités in_person et video. Un second praticien publié est en mode auto. Les autres n'ont rien d'activé.
- Pour ce praticien : deux demandes en ligne en attente (rendez-vous invités tentative, origin online, guest_email en example.test, avec leur ligne booking_request vérifiée) dans les sept jours à venir, et un rendez-vous en ligne confirmé. Le seed reste déterministe et rejouable.
- Vérification finale du contrat : make contract ne produit aucun diff ; app.contract.version = 0.15.0 ; tag contract-v0.15.0 posé sur le commit de fusion (tools/tag-contract.sh, comme M13-03).
- docs/couverture-ecrans.md et le suivi sont mis à jour ; make log.

Périmètre : tools/seed/**, Makefile si nécessaire, docs/couverture-ecrans.md, docs/progress (événement nouveau seulement).

Critères d'acceptation :
- après make db-reset && make seed SIZE=small : GET /api/public/booking/practitioners/<slug du praticien de démonstration> → 200 ; …/slots renvoie des créneaux ; GET /api/agenda/requests de ce praticien renvoie les deux demandes ;
- le seed rejoué deux fois donne le même résultat ;
- ./mvnw verify vert ; ContractIT vert ; le tag existe et pointe sur un contrat 0.15.0.

Interdits : adresses e-mail ou téléphones réels ; modification du code de production ; modification d'une migration.

Livrable : PR « M14-08 Seed et tag contract-v0.15.0 », puis make log TASK=M14-08 AGENT=seed-perf STATUS=done SUMMARY="…" PR=<url>.
```

## K8. Prompts web

Manœuvre (H 2.7) : dans `psymate-web`, `git checkout main && git pull && claude --worktree <ID>`, coller le prompt. À la fin : `Lance le sous-agent reviewer sur cette branche et corrige ce qu'il marque bloquant.`, lecture humaine (le test e2e, les écarts fiche ↔ contrat, le diff de `package.json`), comparaison de l'écran à la maquette, `gh pr merge <n> --squash --delete-branch`.

### M14-09 — Décisions, fiches et maquettes

```text
Tâche M14-09 — Inscrire la prise de rendez-vous en ligne dans la documentation de psymate-web, écrire les fiches et les maquettes (docs/ et CLAUDE.md seulement ; aucun code d'application).

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous.md en entier (il fait foi), docs/G-decisions.md (G9 à G11, format des lignes Q52 à Q59), docs/design/README.md, docs/design/fluent2.md (habillage en vigueur, G Q59), docs/design/00-composants-partages.md, les fiches 09, 14, 15, 15b, 25 et 29 avec leurs maquettes HTML (structure d'une fiche et d'une maquette), docs/couverture-ecrans.md, docs/e2e-couverture.md, docs/C-plan.md (la section du jalon M13, format du tableau des tâches).

Objectif :
- G : nouvelle section « G12. Prise de rendez-vous en ligne (web), jalon M14 » avec Q60 à Q66 copiées de K2.2, datées du 22 novembre 2026 (« tranchées par l'utilisateur »), avec la phrase d'en-tête qui renvoie aux décisions Q71 à Q82 du G de psymate-api.
- Fiche 31 « Prise de rendez-vous publique » (docs/design/31-prise-de-rendez-vous-publique.md), au format des fiches existantes (Objectif, Route & module, Données, Structure, Interactions, Tokens, Accessibilité, Critères d'acceptation, Hors périmètre V1) : route /praticiens/:slug/rendez-vous, feature public ; contenu et parcours de K3.1 étapes 1 à 4 ; textes exacts de Q61 et Q63 ; états (chargement, aucun créneau, fonction non offerte = redirection vers la fiche, créneau pris, plafond atteint 429, erreur) ; créneaux groupés par jour, deux semaines à la fois, fuseau nommé ; formulaire ; écran « Consultez votre boîte mail ».
- Fiche 32 « Rendez-vous par lien » (docs/design/32-rendez-vous-par-lien.md) : routes /rendez-vous/confirmer/:token et /rendez-vous/gerer/:token ; K3.1 étapes 5 à 7 ; un état par réponse de l'API (K5.1), y compris lien expiré, lien inconnu, créneau pris, rendez-vous déjà actif.
- Fiche 14 : section « Prise de rendez-vous en ligne » (K3.2 étape 1, Q64), avec l'éditeur de plages par jour de la semaine, les bornes de chaque réglage (K2.1 Q75) et le cas « profil non publié ».
- Fiche 09 : bouton « Prendre rendez-vous » quand la fonction est offerte (K3.1 étape 1).
- Fiche 15 : mention « Demande en ligne », entrée « Demandes » avec compteur, actions « Confirmer » et « Refuser », e-mail de l'invité (Q65).
- Maquettes HTML autonomes, en Fluent 2 (tokens de fluent2.md), thèmes clair et sombre, 1440 et 390 px : 31-prise-de-rendez-vous-publique.html (les quatre étapes et les états), 32-rendez-vous-par-lien.html (tous les états), et, dans docs/design/propositions-2026-11/, une maquette de la section des préférences et une de l'agenda avec les demandes. Les fichiers 14 et 15 existants ne sont pas réécrits : les nouvelles maquettes les complètent.
- C : nouvelle section avec le tableau des tâches M14-09 à M14-15 (K6.2). docs/design/README.md, docs/couverture-ecrans.md, docs/e2e-couverture.md : lignes 31 et 32. CLAUDE.md : une ligne « Prise de rendez-vous en ligne : pages publiques dans public, réglages dans account, demandes dans agenda ; fiches 31 et 32, docs/K-plan-prise-de-rendez-vous.md ; rien du demandeur dans le navigateur (G Q62). »

Périmètre : docs/**, CLAUDE.md. Rien d'autre.

Critères d'acceptation :
- G Q60 à Q66 existent ; les fiches 31 et 32 existent et chacune de leurs réponses d'API correspond à K5.1 ; les fiches 09, 14 et 15 portent leurs compléments ;
- chaque critère d'acceptation des fiches 31 et 32 est vérifiable par un test (pas de « l'écran est agréable ») ;
- les maquettes s'ouvrent sans serveur, dans les deux thèmes, aux deux largeurs ; aucune couleur hors des tokens de fluent2.md ;
- aucune décision absente de K n'est inscrite ; ce que K laisse ouvert (K10) est repris tel quel sous « Points ouverts » des fiches ;
- pnpm lint vert (aucune source touchée).

Pas d'arrêt pour validation : les maquettes sont publiées dans cette PR ; l'utilisateur peut les corriger après coup, les tâches d'écran les suivent à la lettre.

Interdits : tout code dans src/ ; modifier une maquette existante ; inventer un champ que le contrat ne porte pas ; un champ « motif ».

Livrable : PR « M14-09 Prise de rendez-vous en ligne : décisions, fiches et maquettes », puis pnpm progress:log --task M14-09 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M14-10 — Contrat `0.15.0`

```text
Tâche M14-10 — Passer le contrat épinglé à contract-v0.15.0, ajouter les clés booking.* aux préférences et adapter les modèles de l'agenda (dépôt psymate-web, src/app/api généré, core/preferences, features/agenda). Utilise l'agent frontend-feature-dev. C'est la tâche dédiée qui a le droit de modifier core/preferences.

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous.md (K2.2 Q64, Q66 ; K5), docs/G-decisions.md Q57 (le précédent, M13-04) et la PR #90 (clés agenda.* dans core/preferences). Code : tools/contract-pull.mjs, src/app/core/preferences/preferences.model.ts (interface, liste des clés, valeurs par défaut, nettoyage des valeurs lues), preferences.store.ts et leurs specs, src/app/features/agenda/data/agenda.api.ts (toAppointment, toGuest) et agenda.model.ts, testing/agenda.testing.ts.

Objectif :
- CONTRACT_TAG = contract-v0.15.0 ; pnpm contract:pull ; docs/contract/openapi.yaml, docs/api-reference.md et src/app/api régénérés, jamais édités à la main.
- core/preferences : les huit clés booking.* (types exacts de K2.1 Q75, dont BookingWindow { day, start, end }), leurs valeurs par défaut, et le nettoyage d'une valeur lue invalide (retour à la valeur par défaut de la clé, comme pour agenda.*). Aucun autre changement du store.
- features/agenda : Appointment.origin ('practitioner' | 'online') et Guest.email dans le modèle, la conversion et les fixtures. Aucun changement visible à l'écran dans cette tâche, sauf l'e-mail de l'invité dans le détail s'il tient en une ligne à côté du téléphone ; sinon il vient avec M14-14.
- Aucun usage des routes /api/public/booking ni de GET /api/agenda/requests dans cette tâche.

Périmètre : CONTRACT_TAG, docs/contract/**, docs/api-reference.md, src/app/api/** (généré), src/app/core/preferences/**, src/app/features/agenda/data/** et testing/**, messages si nécessaire.

Critères d'acceptation :
- pnpm lint, pnpm check:tokens, pnpm test, pnpm build verts ; le diff de src/app/api est la sortie du générateur ;
- les préférences lues sans clé booking.* donnent les valeurs par défaut ; une valeur invalide (plage mal formée, mode inconnu) est ramenée au défaut de sa clé ; les specs de core/preferences couvrent les huit clés ;
- un rendez-vous d'origine online et un invité avec e-mail passent la conversion (spec de agenda.api) ;
- les e2e de e2e/agenda/ et e2e/preferences/ restent verts contre l'API de main ;
- la PR liste les écarts fiche ↔ contrat constatés.

Tests : Vitest (core/preferences, agenda data).

Interdits : éditer src/app/api ou docs/contract à la main ; construire un écran ; toucher à une autre feature ; toute autre modification de core ; dépendance npm.

Livrable : PR « M14-10 Contrat 0.15.0, préférences booking.* », puis pnpm progress:log.
```

### M14-11 — Réglages dans Préférences

```text
Tâche M14-11 — Section « Prise de rendez-vous en ligne » de la page Préférences (dépôt psymate-web, features/account). Utilise l'agent frontend-feature-dev. Dépend de M14-10 et de la maquette publiée par M14-09.

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous.md (K2.2 Q64 ; K3.2 étape 1 ; K2.1 Q75 pour les bornes ; K10 « Constaté pendant la réalisation de l'API »), docs/design/14-preferences-praticien.md (section ajoutée par M14-09) et sa maquette de docs/design/propositions-2026-11/, docs/design/fluent2.md, docs/design/29-etats.md. Reproduis la maquette à la lettre : n'invente ni champ, ni libellé, ni disposition. Code : src/app/features/account/pages/preferences.page.{ts,html,scss}, ui/preferences/** (segmented-control, theme-picker : modèles de contrôles de la page), core/preferences (PreferencesStore, lu seulement), la façon dont la page enregistre une préférence et traite une erreur 422 par clé, shared/forms.

Objectif :
- Nouvelle section de la page, à la place fixée par la maquette : interrupteur « Proposer la prise de rendez-vous en ligne » (booking.enabled) ; choix « Je valide chaque demande » / « Acceptation automatique dans mes plages » (booking.confirmation), avec la phrase d'explication de chaque mode ; éditeur de plages par jour de la semaine (ajouter, modifier, retirer une plage ; heures par pas de 5 minutes ; 21 plages au plus) ; durée d'un créneau ; délai minimal ; horizon ; modalités ; fuseau.
- Un composant ui/preferences/booking-windows-editor pour les plages, utilisable au clavier, avec un libellé accessible par jour et par plage.
- À la première activation, si aucune plage n'existe, booking.timezone est proposé depuis le fuseau du navigateur (Intl) et le praticien est invité à ajouter une plage ; rien n'est enregistré sans son action.
- Enregistrement par PreferencesStore, clé par clé ou par groupe selon ce que fait déjà la page ; après écriture, les préférences sont relues (pas de correction locale). Les contrôles vérifient la forme (fin après début, pas de chevauchement le même jour, bornes) ; une erreur 422 du serveur s'affiche sous le réglage concerné.
- Si le profil public n'est pas publié : un message l'explique dans la section, avec un lien vers /mon-compte/profil-public ; les réglages restent modifiables. L'état « publié » se lit par ce que la feature account expose déjà pour la page Mon profil public ; s'il faut une nouvelle lecture d'API, elle passe par un fichier data/*.api.ts de account.
- Lien « Voir ma page de rendez-vous » vers /praticiens/<slug>/rendez-vous, visible quand la fonction est offerte (compte claire.seed@example.test du seed : /praticiens/claire-martin/rendez-vous).
- messages.fr.xlf (et messages.en.xlf si possible) ; aucun texte ni couleur en dur.

Périmètre : src/app/features/account/**, messages, e2e/preferences/.

Critères d'acceptation (fiche 14, section ajoutée) :
- activer, choisir le mode automatique, ajouter lundi 09:00–12:00, enregistrer, recharger : les valeurs sont relues à l'identique ; le test lit la requête PATCH /api/me/preferences et ses clés booking.* ;
- une plage dont la fin précède le début, ou qui chevauche une autre plage du même jour : pas de requête, message sous la plage ;
- une erreur 422 simulée sur booking.windows (test du composant, service simulé) s'affiche sous l'éditeur ;
- retirer la dernière plage : la section dit que la prise de rendez-vous n'est pas proposée tant qu'il n'y a pas de plage ;
- profil non publié : le message et le lien apparaissent ;
- tout se fait au clavier ; axe-core 0 violation, thèmes clair et sombre ; mise en page tenue à 390 px et à 200 % de zoom ;
- les autres sections de la page Préférences n'ont pas changé (leurs e2e restent verts) ; pnpm lint, check:tokens, test, build verts.

Tests : Vitest pour l'éditeur de plages (ajout, retrait, validation, trois états de la section) ; e2e/preferences/prise-de-rendez-vous contre l'API réelle (le test remet les préférences du seed à la fin).

Interdits : modifier core/preferences, shared/ui ou une autre feature ; stocker un réglage ailleurs que dans les préférences du serveur ; s'écarter de la maquette ; dépendance npm.

Livrable : PR « M14-11 Préférences : prise de rendez-vous en ligne », puis pnpm progress:log.
```

### M14-12 — Page publique de prise de rendez-vous

```text
Tâche M14-12 — Page publique de prise de rendez-vous : bouton de la fiche, créneaux, formulaire, écran d'attente (dépôt psymate-web, features/public). Utilise l'agent frontend-feature-dev. Dépend de M14-10 et de la maquette publiée par M14-09.

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous.md (K2.2 Q60 à Q63 ; K3.1 étapes 1 à 4 ; K5.1 ; K10 « Constaté pendant la réalisation de l'API » : le contrat contract-v0.15.0 fait foi sur K5), docs/design/31-prise-de-rendez-vous-publique.md et sa maquette (à reproduire à la lettre), docs/design/09-fiche-publique-praticien.md (bouton ajouté), docs/api-reference.md (les trois routes /api/public/booking/practitioners/…), docs/design/fluent2.md, docs/design/29-etats.md. Code : src/app/features/public/public.routes.ts, public-paths.ts, public-facts.ts, pages/practitioner.page.{ts,html}, data/practitioner.store.ts et directory.api.ts (seul fichier de la feature qui importe src/app/api aujourd'hui : regarde comment la règle « un seul import de api/ par feature » est tenue et place les nouveaux appels en conséquence), ui/contact-form.component.{ts,html} (formulaire public : pot de miel, formShownAt, consentement, 422 par champ, 429), pages/page-meta.ts (balises, noindex), app.routes.server.ts (prérendu : la nouvelle page n'est pas prérendue).

Objectif :
- data : appels getPublicBooking(slug), getPublicSlots(slug, from, to), createBookingRequest(slug, corps) ; un store booking (SignalStore) qui porte les réglages publics, les créneaux de la fenêtre affichée et leurs trois états. Les créneaux sont relus après un 409, jamais corrigés localement.
- Fiche du praticien : bouton « Prendre rendez-vous » si GET /api/public/booking/practitioners/{slug} répond 200 ; absent sur 404 ; l'échec de cet appel ne casse pas la fiche.
- Route praticiens/:slug/rendez-vous (lazy, noindex, titre « Prendre rendez-vous · PsyMate ») : en-tête (nom du praticien, durée, phrase du mode de Q61, mention d'urgence de Q63), créneaux groupés par jour sur deux semaines avec « Semaines précédentes » / « Semaines suivantes » bornés par le délai et l'horizon (une fenêtre passée ou au-delà de l'horizon revient vide, slots: [], jamais en erreur : l'API borne elle-même la fenêtre), heures affichées dans le fuseau du praticien, nommé à l'écran (Intl, locale de l'application).
- Après le choix d'un créneau : formulaire (prénom, nom, e-mail, téléphone facultatif, modalité si plusieurs, consentement avec lien vers /confidentialite), pot de miel et formShownAt comme le formulaire de contact, locale de l'application envoyée dans le corps. formShownAt est l'instant du premier affichage du formulaire de coordonnées : il est conservé après un 409, un 422 ou « Changer de créneau » et n'est jamais remis à zéro tant que la page n'est pas rechargée (un envoi fait moins de 3 s après une remise à zéro serait ignoré en silence par l'API, sous un 202). Libellé du bouton selon le mode (K3.1 étape 3).
- Réponses : 202 → écran « Consultez votre boîte mail », identique quel que soit le sort de la demande ; 409 SLOT_NOT_AVAILABLE → retour aux créneaux, message « Ce créneau n'est plus disponible », coordonnées gardées à l'écran, créneaux relus ; 422 → messages sous les champs ; 429 → message avec le délai ; 404 → redirection vers la fiche du praticien.
- Les numéros d'urgence viennent de public-facts.ts ; la durée de validité du lien (30 minutes) aussi.
- Rien du demandeur n'est écrit dans le stockage du navigateur ni dans l'URL (Q62). Le créneau choisi peut vivre dans l'URL (?creneau=<instant>), pas l'identité.
- messages.fr.xlf (et messages.en.xlf si possible).

Périmètre : src/app/features/public/**, app.routes.server.ts (une ligne si nécessaire), messages, e2e/flux-7-visiteur/ ou un nouveau dossier e2e/prise-de-rendez-vous/.

Critères d'acceptation (fiche 31) :
- sur la fiche du praticien de démonstration (/praticiens/claire-martin), « Prendre rendez-vous » mène à la page ; sur un praticien sans prise de rendez-vous, le bouton est absent ;
- les créneaux affichés sont ceux de l'API, dans l'ordre, groupés par jour, à l'heure du fuseau du praticien (le test compare avec la réponse) ; aucun créneau : état vide avec le lien vers le contact ;
- la phrase du mode affichée correspond à confirmation (manual sur claire-martin, puis auto sur karim-haddad, le second praticien du seed) ;
- envoi complet : la requête porte startsAt, modality, firstName, lastName, email, consent = true, formShownAt, locale ; l'écran d'attente s'affiche ; un e-mail arrive dans Mailpit ;
- champ obligatoire vide ou e-mail mal formé : pas de requête, message sous le champ ; consentement non coché : pas de requête ;
- 409 simulé (test du store, service simulé) : retour aux créneaux, message, coordonnées conservées, créneaux relus ;
- après l'envoi, localStorage et sessionStorage ne contiennent ni le nom ni l'e-mail saisis, et l'URL non plus (le test e2e le vérifie) ;
- la page porte noindex ; la mention d'urgence est présente avant le bouton d'envoi ;
- tout se fait au clavier ; axe-core 0 violation, thèmes clair et sombre, 390 px et 200 % de zoom ; pnpm lint, check:tokens, test, build verts.

Tests : Vitest pour le store (trois états, relecture après 409) et les composants (liste des créneaux, formulaire) ; e2e contre l'API réelle et le seed small, lecture de l'e-mail dans Mailpit comme e2e/flux-7-visiteur.

Interdits : un champ « motif » ou tout champ libre ; afficher un créneau que l'API ne renvoie pas ; calculer des créneaux côté client ; stocker l'identité ; modifier shared/ui, core ou une autre feature ; s'écarter de la maquette ; dépendance npm.

Livrable : PR « M14-12 Page publique de prise de rendez-vous », puis pnpm progress:log.
```

### M14-13 — Pages par lien : vérification et gestion

```text
Tâche M14-13 — Pages publiques par lien : vérification de l'e-mail et gestion du rendez-vous (dépôt psymate-web, features/public). Utilise l'agent frontend-feature-dev. Dépend de M14-12.

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous.md (K2.2 Q60 à Q63 ; K3.1 étapes 5 à 7 ; K3.3 ; K3.4 ; K5.1 ; K10 « Constaté pendant la réalisation de l'API » : le contrat contract-v0.15.0 fait foi sur K5), docs/design/32-rendez-vous-par-lien.md et sa maquette (à reproduire à la lettre), docs/api-reference.md (verify, manage, manage/cancel), docs/design/25-confirmation-email.md et src/app/features/auth/pages/confirm-email.page.ts (modèle d'une page qui traite un jeton reçu par lien : à lire, pas à importer). Code : le store et l'API booking de M14-12, shared/ui/confirm-dialog, shared/ui/state.

Objectif :
- Route rendez-vous/confirmer/:token (lazy, noindex) : la page envoie le jeton par POST /api/public/booking/requests/verify, une seule fois par affichage, et montre l'un des états de la fiche 32 : demande transmise (pending), rendez-vous confirmé (confirmed), lien expiré (410, seulement pour une demande jamais vérifiée : verify reste idempotent après l'échéance), lien inconnu (404 BOOKING_TOKEN_INVALID), créneau plus disponible (409 SLOT_TAKEN, texte « Ce créneau n'est plus disponible » ; les réponses d'erreur ne portent pas le slug du praticien, le lien pour recommencer mène à l'annuaire), rendez-vous déjà actif (409 BOOKING_ALREADY_ACTIVE), fonction fermée (404 BOOKING_NOT_AVAILABLE), erreur avec « Réessayer ». Sur un succès, date, heure (fuseau du navigateur, nommé), durée, modalité, nom du praticien (absent, comme le lien vers sa fiche, quand practitioner.slug vaut null), et un lien construit avec manageToken quand la réponse le porte, « Gérer ma demande » pour une demande en attente (pending), « Gérer mon rendez-vous » sinon ; sans manageToken, la page dit que le lien de gestion est dans l'e-mail.
- Route rendez-vous/gerer/:token (lazy, noindex) : POST /api/public/booking/manage ; état (« En attente de réponse », « Confirmé », « Annulé » avec sa cause, « Passé »), détails (sans nom de praticien ni lien vers sa fiche quand practitioner.slug vaut null), et, si canCancel, « Annuler ma demande » ou « Annuler mon rendez-vous » avec le dialogue de confirmation partagé, puis POST manage/cancel et relecture de l'état. Lien inconnu : « Ce lien n'est plus valable. Utilisez le lien du dernier e-mail reçu. »
- Mention d'urgence sur les deux pages (Q63).
- Le jeton n'est lu que dans le chemin, n'est jamais copié dans le stockage du navigateur, et n'est envoyé que dans le corps des requêtes. Les deux pages posent <meta name="referrer" content="no-referrer"> (par le même mécanisme que noindex, pages/page-meta.ts) et leurs liens sortants portent rel="noreferrer" : le chemin de la page, qui porte le jeton, ne part dans aucun en-tête Referer.
- messages.fr.xlf (et messages.en.xlf si possible).

Périmètre : src/app/features/public/**, messages, e2e/prise-de-rendez-vous/.

Critères d'acceptation (fiche 32) :
- parcours complet contre l'API réelle : demande sur le praticien en mode manuel (claire-martin), lien lu dans Mailpit, page « demande transmise » ; même parcours sur le praticien en mode automatique (karim-haddad), page « rendez-vous confirmé » ;
- recharger la page de vérification ne crée pas de second rendez-vous et affiche le même état, même après l'échéance du lien ;
- chaque réponse d'erreur de K5.1 a son état (tests du store ou des pages avec service simulé) ;
- gestion : l'état affiché correspond à la réponse ; annuler demande une confirmation, puis l'état devient « Annulé » ; refuser la confirmation ne change rien ; un rendez-vous annulé ou passé n'a pas de bouton d'annulation ;
- le jeton n'apparaît ni dans localStorage, ni dans sessionStorage, ni dans l'URL d'aucune requête vers /api, ni dans leur en-tête Referer (la navigation vers la page elle-même porte forcément le jeton dans son chemin) ; le test e2e inspecte l'URL et les en-têtes des requêtes /api émises depuis ces pages, et vérifie la balise meta referrer ;
- les deux pages portent noindex ; axe-core 0 violation, thèmes clair et sombre, 390 px ; pnpm lint, check:tokens, test, build verts.

Tests : Vitest (états des deux pages, service simulé) ; e2e contre l'API réelle, avec Mailpit.

Interdits : importer la feature auth ; envoyer un jeton dans une URL d'API ; proposer de modifier le rendez-vous ; demander un motif d'annulation ; modifier shared/ui, core ou une autre feature ; s'écarter de la maquette ; dépendance npm.

Livrable : PR « M14-13 Rendez-vous par lien : vérification et gestion », puis pnpm progress:log.
```

### M14-14 — Agenda : demandes en ligne

```text
Tâche M14-14 — Agenda : demandes en ligne, confirmer, refuser (dépôt psymate-web, features/agenda). Utilise l'agent frontend-feature-dev. Dépend de M14-10 et de la maquette publiée par M14-09.

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous.md (K2.2 Q65 ; K3.2 étapes 2 à 4 ; K5.2 ; K10 « Constaté pendant la réalisation de l'API »), docs/design/15-agenda.md (complément de M14-09) et la maquette de l'agenda avec les demandes (à reproduire à la lettre), docs/api-reference.md (GET /api/agenda/requests, confirm, cancel). Code : src/app/features/agenda/data/agenda.api.ts (confirm existe déjà), agenda.store.ts, agenda.model.ts, ui/appointment-detail.component.{ts,html} (bouton Confirmer d'un rendez-vous « à confirmer », annulation avec motif), ui/agenda-calendar.component.{ts,html} (rendu pointillé), pages/agenda.page.{ts,html}.

Objectif :
- data : listRequests() (GET /api/agenda/requests) dans agenda.api.ts ; le store porte les demandes en attente et leur compteur, avec leurs trois états ; elles sont relues après une confirmation, un refus, une annulation, et à chaque rechargement de la fenêtre.
- Page : entrée « Demandes » avec compteur, à l'emplacement fixé par la maquette ; elle ouvre la liste des demandes en attente (date, heure, nom de l'invité, modalité) ; choisir une demande amène la grille à sa date et ouvre son détail. Aucune demande : l'entrée reste, sans compteur, et la liste montre un état vide.
- Grille et vue Liste : un rendez-vous d'origine online porte la mention « Demande en ligne », en texte ou en pictogramme avec un nom accessible, jamais par la couleur seule.
- Détail d'un rendez-vous online : e-mail et téléphone de l'invité ; pour un tentative, « Confirmer » (existant) et « Refuser » (l'annulation existante, avec le libellé « Refuser la demande » et une phrase qui dit que le demandeur sera prévenu par e-mail sans le motif) ; pour un planned, l'annulation habituelle avec la même phrase. La phrase « le demandeur sera prévenu par e-mail » vaut aussi quand le praticien déplace le rendez-vous ou change seulement sa modalité (e-mail « Votre rendez-vous est modifié »).
- Toast après chaque action ; aucune correction locale de la grille : la fenêtre est relue.
- messages.fr.xlf (et messages.en.xlf si possible).

Périmètre : src/app/features/agenda/**, messages, e2e/agenda/.

Critères d'acceptation (fiche 15, complément) :
- avec le seed (compte claire.seed@example.test, fiche claire-martin, mode manual), l'entrée « Demandes » affiche le compteur renvoyé par l'API (2) ; la liste montre les deux demandes dans l'ordre de l'API ;
- choisir une demande ouvre son détail, avec la mention « Demande en ligne », l'e-mail et le téléphone de l'invité ;
- confirmer : le rendez-vous n'est plus en pointillé, le compteur baisse de un, toast ; le test lit POST …/confirm ;
- refuser : confirmation sur place, puis le rendez-vous disparaît de la grille (annulés masqués), le compteur baisse de un ; le test lit POST …/cancel ;
- un rendez-vous « à confirmer » créé par le praticien n'a ni la mention ni le libellé « Refuser », et ne compte pas dans « Demandes » ;
- erreur 409 APPOINTMENT_NOT_ACTIVE (la demande vient d'être annulée par le demandeur) : toast, relecture, le détail se ferme ;
- trois états de la liste des demandes ; tout se fait au clavier ; axe-core 0 violation, thèmes clair et sombre ; les e2e existants de e2e/agenda/ restent verts ; pnpm lint, check:tokens, test, build verts.

Tests : Vitest pour le store (demandes, compteur, relecture) et les composants (détail online, liste des demandes) ; e2e/agenda/demandes-en-ligne contre l'API réelle (le test crée ses propres demandes par le parcours public, ou restaure le seed).

Interdits : compter ou filtrer les demandes côté client à la place de GET /api/agenda/requests ; transmettre un motif au demandeur ; un bouton rouge pour « Refuser » si la maquette ne le montre pas ; modifier shared/ui, core ou une autre feature ; s'écarter de la maquette ; dépendance npm.

Livrable : PR « M14-14 Agenda : demandes en ligne », puis pnpm progress:log.
```

### M14-15 — Agenda : rattacher un invité à un patient

```text
Tâche M14-15 — Agenda : rattacher un rendez-vous invité à un patient (dépôt psymate-web, features/agenda). Utilise l'agent frontend-feature-dev. Dépend de M14-14. Peut glisser après le jalon : la prise de rendez-vous fonctionne sans elle.

Contexte : lis CLAUDE.md, docs/K-plan-prise-de-rendez-vous.md (K3.2 étape 5 ; K3.4 ; K10 « Constaté pendant la réalisation de l'API » : seed claire-martin, deux demandes en ligne en attente), docs/J-plan-profil-360-web.md J5 (« Rendez-vous invités dans l'agenda », resté ouvert), docs/api-reference.md (POST /api/appointments/{id}/attach-patient et ses erreurs), docs/design/15-agenda.md. Code : ui/appointment-detail.component.{ts,html}, panels/new-appointment.panel.{ts,html} (choix d'un patient : le sélecteur à réemployer), data/agenda.api.ts et agenda.store.ts.

Objectif :
- Détail d'un rendez-vous invité non purgé : action « Rattacher à un patient ». Elle ouvre, dans le panneau, le sélecteur de patient déjà utilisé par « Nouveau rendez-vous », et une case « Rattacher aussi les autres rendez-vous de cette personne » (includeSameGuest).
- data : attachPatient(id, patientId, includeSameGuest) dans agenda.api.ts. Après succès : toast, relecture de la fenêtre et des demandes ; le détail montre le patient, avec le lien vers son dossier.
- Erreurs : 409 APPOINTMENT_NOT_ACTIVE et 422 PATIENT_ARCHIVED en message dans le panneau ; 403 / 404 du patient → toast et relecture.
- Une phrase prévient que, pour une demande en ligne, les e-mails automatiques au demandeur s'arrêtent après le rattachement (K3.4).
- La création d'une fiche patient depuis ce panneau n'est pas construite : le praticien crée d'abord le patient par le parcours existant. Si les fiches ne décrivent pas l'écran assez précisément, arrête-toi et propose une maquette avant de construire.
- messages.fr.xlf (et messages.en.xlf si possible).

Périmètre : src/app/features/agenda/**, messages, e2e/agenda/.

Critères d'acceptation :
- rattacher un rendez-vous invité à un patient du seed : le détail montre le patient, le rendez-vous apparaît dans les rendez-vous du patient ; le test lit la requête ;
- avec la case cochée, les autres rendez-vous du même invité sont rattachés aussi (le test en crée deux) ;
- un invité purgé n'a pas l'action ; un rendez-vous de patient non plus ;
- patient archivé : message dans le panneau, rien n'est rattaché ;
- axe-core 0 violation ; pnpm lint, check:tokens, test, build verts.

Tests : Vitest (store, panneau) ; e2e contre l'API réelle.

Interdits : importer la feature patients ; créer un patient depuis l'agenda ; corriger la grille localement ; modifier shared/ui, core ou une autre feature ; dépendance npm.

Livrable : PR « M14-15 Agenda : rattacher un invité à un patient », puis pnpm progress:log.
```

## K9. Revue

API (à coller après chaque tâche M14-02 à M14-08) :

```text
Lance le sous-agent reviewer sur cette branche pour la tâche <ID>. En plus de sa liste habituelle, vérifie : (1) qu'agenda n'importe que identity.api, patients.api, directory.api, events.api et shared, et que directory n'importe rien d'agenda ; (2) que les critères de docs/K-plan-prise-de-rendez-vous-api.md K7 <ID> ont chacun un test nommé ; (3) qu'aucune réponse publique ne dépend de l'identité saisie avant la vérification de l'e-mail, et que les cas de 404 BOOKING_NOT_AVAILABLE ont des corps identiques ; (4) qu'aucun nom, e-mail, téléphone ou jeton n'est journalisé, et qu'aucun jeton n'est stocké en clair ; (5) qu'aucun rendez-vous n'est créé et aucun créneau retenu avant la vérification ; (6) qu'aucun DELETE ne touche appointment et que les suppressions de booking_request correspondent à E9 ; (7) qu'aucun champ libre de motif, aucun compte patient, aucun appel externe n'apparaît ; (8) que app.contract.version et contract/openapi.yaml sont cohérents avec K5. Corrige ce qu'il marque bloquant, relance-le, puis make log.
```

Web (identique pour chaque tâche M14-10 à M14-15) :

```text
Relis le diff de cette branche contre main pour la tâche <ID>, sans rien modifier. Vérifie, dans l'ordre : le périmètre de fichiers du prompt (une seule feature ; core/preferences et src/app/api seulement dans M14-10) ; la conformité aux fiches 31, 32, 14, 15 et à K2.2 (mode annoncé avant l'envoi, mention d'urgence, rien du demandeur ni aucun jeton dans le stockage du navigateur ou dans une URL, aucun champ de motif, relecture après écriture, créneaux jamais calculés côté client) ; la fidélité à la maquette de M14-09 ; les six couches (seul data/*.api.ts importe src/app/api) ; aucun texte, couleur ou URL en dur ; trois états par bloc de données ; chaque critère d'acceptation couvert par un test qui échouerait sans le code ; e2e contre l'API réelle, sans mock du backend, avec axe-core ; aucune dépendance npm non annoncée. Classe chaque remarque en bloquant ou non bloquant.
```

## K10. Ce qui reste ouvert

Tranché par l'utilisateur le 22 novembre 2026 :

- **Valeurs par défaut** : lien de vérification 30 minutes ; expiration d'une demande 72 h ; délai minimal 24 h ; horizon 28 jours ; créneau de 60 minutes ; conservation 24 h, 30 jours, 6 mois (K3.5).
- **Prénom obligatoire** pour le demandeur, alors qu'il est facultatif pour un invité saisi par le praticien.

Encore à trancher par l'utilisateur (aucune proposition n'était faite, la validation ne les couvre pas) :

- **Numéros d'urgence** affichés (Q63) : lesquels, et pour quels pays. M14-09 pose dans les fiches et les maquettes le **112** (urgences, Europe) et le **3114** (numéro national français de prévention du suicide), **à valider par l'utilisateur** ; ils vivront dans `public-facts.ts`. Ne bloque aucune tâche API.
- **Nom d'expéditeur des e-mails.** « PsyMate » dans la boîte de réception dit déjà quelque chose à qui partage la boîte. Un nom d'expéditeur neutre est possible, au prix d'e-mails moins reconnaissables. En attendant, M14-06 garde l'expéditeur actuel de l'API.

À faire valider par un juriste ou un DPO (aucune tâche ne le tranche) :

- **Rôles au sens du RGPD** : PsyMate sous-traitant du praticien pour ses rendez-vous, responsable pour l'annuaire ; mention d'information du formulaire et texte du consentement.
- **Hébergement de données de santé** si la France est visée : une demande de rendez-vous chez un psychologue est une donnée de santé.
- **Durées de conservation** de K3.5.
- **Mineurs** : aucune date de naissance n'est demandée ; la question de l'autorité parentale reste entre le praticien et le demandeur.

Constaté pendant la réalisation de l'API (22 novembre 2026), à reprendre par les tâches web ; le contrat `contract-v0.15.0` fait foi sur K5 :

- **`PublicAppointmentDto.practitioner`** : `slug` et `displayName` valent `null` quand la fiche n'est plus publiée (l'API n'a pas d'autre source pour le nom). Les pages par lien (M14-13) affichent alors le rendez-vous sans nom de praticien et sans lien vers la fiche.
- **`manageToken` et `cancelledBy`** valent `null` plutôt que d'être absents.
- **`verify`** reste idempotent pour une demande déjà vérifiée, même après les 30 minutes : la page de vérification rechargée plus tard affiche l'état courant, pas « lien expiré ».
- **`409 SLOT_TAKEN`** sert aussi quand le créneau n'est plus offert pour une autre raison (délai minimal franchi, réglages modifiés, modalité retirée). Le texte du web est donc « Ce créneau n'est plus disponible », à la place de « Ce créneau vient d'être pris » (K3.1, K3.4, prompts M14-12 et M14-13).
- **`formShownAt`** : l'API accepte jusqu'à 5 minutes d'avance de l'horloge du navigateur ; au-delà, la demande est ignorée en silence. Le web envoie l'instant d'affichage du formulaire, comme le formulaire de contact.
- **`GET …/slots`** : une fenêtre passée ou au-delà de l'horizon rend `slots: []`, pas une erreur ; l'API borne elle-même la fenêtre à [aujourd'hui, aujourd'hui + `horizonDays`].
- **Lien de gestion (précise Q80, M14-07)** : seuls les e-mails qui portent un lien (demande transmise, confirmation, déplacement, modification) en émettent un nouveau, qui remplace le précédent. Les e-mails sans lien (refus, annulation, expiration) laissent le dernier lien valable : le demandeur peut encore y lire « Annulé ».
- **Durée du lien de gestion (précise Q80)** : Q80 dit « valable jusqu'à la fin du rendez-vous » ; le contrat ne donne aucune échéance à ce lien. Il répond tant que la demande n'est pas purgée (30 jours après la fin ou l'annulation du rendez-vous, Q82 f), puis `404 BOOKING_TOKEN_INVALID`. Les pages par lien (M14-13) n'ont donc pas d'état « expiré » pour le lien de gestion.
- **Changement de modalité (précise Q81, M14-07)** : quand le praticien change seulement la modalité d'un rendez-vous en ligne, le demandeur reçoit « Votre rendez-vous est modifié ». Côté agenda (M14-14), la phrase « le demandeur sera prévenu par e-mail » vaut donc aussi pour ce cas.
- **Seed (M14-08)** : deux praticiens de démonstration approuvés et publiés. `claire-martin` (compte `claire.seed@example.test`, celui des e2e) est en mode `manual`, avec deux demandes en attente, un rendez-vous en ligne confirmé et des créneaux sur 28 jours ; `karim-haddad` (`karim.seed@example.test`) est en mode `auto`. Le compte claire n'affiche donc plus le bandeau de vérification. Remplace « claire-lambert » partout où ce plan le citait (les exemples du contrat écrivent encore `claire-lambert` : ce ne sont que des exemples).
- **Déploiement** : `APP_BOOKING_HASH_SECRET` doit être défini en production ; aucune garde ne refuse la valeur d'exemple au démarrage (même situation que `APP_CRYPTO_KEY`).

Reporté après M14 :

- Plafond de demandes en attente par praticien, si des abus apparaissent malgré la vérification de l'e-mail.
- Liste de blocage côté praticien (adresse ou téléphone).
- Rappel automatique avant le rendez-vous ; SMS.
- Congés et jours fériés ; plusieurs durées ou types de consultation ; « premier rendez-vous » distinct du suivi ; acceptation automatique par type de rendez-vous.
- Déplacement du rendez-vous par le demandeur.
- `nextSlotAt` de la fiche publique calculé depuis les créneaux offerts (aujourd'hui saisi à la main par le praticien).
- Les rendez-vous en ligne dans l'export du compte : colonne « Origine » et e-mail de l'invité dans `rendez-vous.md` (G Q61).
- Synchronisation Google (M12) : les créneaux offerts devront tenir compte des plages occupées de Google.
