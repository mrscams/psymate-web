# Document L – Plan d'action · Facturation, jalon M15 (API et web)

22 novembre 2026, **mis à jour et lancé le 28 novembre 2026**. Écrit à la demande de l'utilisateur. **Le périmètre est tranché par l'utilisateur** (G Q67 de psymate-web, huit points). **Les décisions techniques de L2.2, le modèle de L4 et le contrat de L5 sont proposés par ce plan** : l'utilisateur ne les a pas relus. Le 28 novembre 2026, il a demandé de lancer le jalon et de le mener au bout sans son intervention : les tâches partent donc sur ces propositions, qui restent marquées comme telles partout où elles sont inscrites.

La tâche M15-01 copie la moitié API (L1, L2.2, L3, L4, L5, L6.1, L6.3, L7, L9 API) dans `psymate-api/docs/L-plan-facturation-api.md` et inscrit les décisions dans le G de l'API. Ce document, les fiches 33 à 39, les maquettes, G13 et C13 sont sur `main` de psymate-web depuis le 28 novembre 2026 ; la tâche M15-13 les complète.

Sources : G Q67 (web), les fiches `docs/design/33-facturation-factures.md` à `39-facturation-reglages.md`, les maquettes `docs/design/facturation/`, le code de psymate-api au 28 novembre 2026 (`main` = 148447f, jalons M14 et M16 fusionnés).

Numéros (revérifiés le 28 novembre 2026) : jalon **M15**. Décisions de l'API : **Q83 à Q95, section G11 du G de psymate-api** (réservées ; Q96 à Q102 et G12 sont à M16). Section **C14** du plan de l'API, section **E3.15** du modèle. Web : **Q67 à Q70, section G13** ; section **C13** ; fiches **33 à 39**. Migration **`V18__billing.sql`** (`V16` et `V17` ont été prises par M16). Contrat : `0.16.0` est tagué, la facturation vise **`0.17.0`**, tag `contract-v0.17.0` (L6.3 règle 2).

## L1. Périmètre

Ce que le module doit permettre (G Q67) :

- Le praticien règle une fois ce qui figure sur ses factures : identité, SIRET, régime de TVA (trois régimes), prestations et tarifs, modalités de règlement.
- Une séance close arrive dans « À facturer ». Rien n'est facturé sans un geste du praticien.
- Il prépare une facture en brouillon (depuis des séances ou à la main), la relit, puis l'**émet** : elle reçoit un numéro et ne change plus.
- Il enregistre les paiements reçus (espèces, chèque, virement, carte, autre), en totalité ou en partie ; la facture payée devient une facture acquittée.
- Il corrige une facture émise par un **avoir**, total ou partiel, jamais en la modifiant.
- Il télécharge le PDF, l'envoie par e-mail au patient, consulte le journal des encaissements et l'exporte.
- Dans le dossier, un lien de la fiche patient ouvre la liste des factures filtrée sur le patient ; il n'y a pas d'onglet Facturation.

Hors M15 : feuilles de soins, télétransmission, tiers payant ; paiement en ligne ; facturation d'un rendez-vous non honoré ; onglet dans le dossier patient ; devis, acomptes, factures récurrentes, relances automatiques ; plusieurs taux de TVA sur une facture ; plusieurs devises ; logo sur la facture ; rapprochement bancaire ; reprise des séances closes avant la mise en service (L10) ; **ligne « Facturation » dans le détail d'un rendez-vous de l'agenda** (aucun rendez-vous n'est relié à une séance aujourd'hui : `Appointment.attachSession` n'a pas d'appelant, M11-08 a été remplacée ; la fiche 38 la garde pour plus tard).

## L2. Décisions

### L2.1 Web (déjà inscrite : G Q67 de psymate-web, section G13)

Huit points tranchés par l'utilisateur le 22 novembre 2026 : France, psychologues et coachs, trois régimes de TVA ; pas de feuilles de soins ; pas de paiement en ligne ; envoi de la facture par e-mail depuis l'application ; réglages en quatrième onglet du module ; pas d'onglet dans le dossier, un lien de la fiche patient vers `/facturation?patient=:id` ; rendez-vous non honoré jamais facturé ; carreau du rail « Facture » inchangé.

Décisions web complémentaires de ce plan (à inscrire en Q68 à Q70 par M15-13) :

| # | Question | Décision |
| --- | --- | --- |
| Q68 | Où vivent les écrans | Nouvelle feature **`billing`**, chargée à la demande, routes `/facturation/**`, habillage praticien, `contentWidth: 'full'`. Elle rejoint `PATIENT_FEATURES` (ESLint) : `admin` ne l'importe jamais. Le carreau « Facture » du rail reçoit sa route dans la tâche de socle M15-14, la seule qui touche `shared/ui/nav-rail` et `app.routes.ts`. Les points d'entrée vivent dans leurs features (`patients`, `patient-shell`) et n'importent rien de `billing` : ce sont des liens et des appels d'API. |
| Q69 | Montants | L'API parle en **centimes entiers** (L2.2 Q84). Le web ne fait aucune addition qui s'affiche : totaux, reste dû, TVA et statuts viennent de l'API. La conversion centimes ↔ saisie vit dans `features/billing/data/money.ts` (une seule fonction de lecture d'une saisie « 60,00 », une d'affichage par `Intl.NumberFormat`). |
| Q70 | Aperçu de la facture | L'aperçu de l'éditeur et la feuille d'une facture émise sont du HTML dessiné par le web à partir de `GET /api/invoices/{id}` (bloc `issuer` compris). Le PDF vient toujours de l'API. Aucune dépendance npm. |

### L2.2 API (à inscrire dans le G de psymate-api par M15-01, section G11)

| # | Question | Décision |
| --- | --- | --- |
| Q83 | Où vit la facturation | Nouveau module Spring Modulith **`billing`** (`com.psymate.billing`), structure par rôle (G Q33), JPA (G Q32). Dépendances autorisées : `identity :: api`, `patients :: api`, `clinical :: api`, `events :: api`, `shared`. **Aucun module ne dépend de `billing`** ; `search` et `overview` ne lisent pas ses tables. `billing` ne stocke aucun texte clinique : une ligne de facture porte une date et une désignation, jamais le titre, le corps ou le résumé d'une séance. |
| Q84 | Montants | **Centimes d'euro en entiers**, en base (`integer` / `bigint`) comme en JSON (champs entiers, décrits « centimes »). Devise unique EUR, sans champ de devise. Aucun `double`, aucun `BigDecimal` dans les DTO. Un taux de TVA est en points de base (2000 = 20 %). |
| Q85 | Ce qu'il manque aux façades | Trois petites tâches d'`api`, sans route ni migration : `clinical` publie **`SessionClosed`** et expose `SessionFacade.closedSession(id)` (M15-02) ; `identity` expose l'identité d'émetteur du praticien et la vérification du mot de passe (M15-03) ; `patients` expose l'identité de facturation d'un patient (M15-04). `billing` ne lit aucune table d'un autre module. |
| Q86 | Séance à facturer | Une séance de type `session` (ni `intake` ni `contact`) qui se clôt crée une ligne `billable_session` à l'état `pending`, par écoute de `SessionClosed`. États : `pending` → `invoiced` (dans une facture, brouillon compris) ou `dismissed` (« ne pas facturer », réversible). Une séance archivée (`EntryArchived`) encore `pending` passe à `dismissed`. Retirer une ligne d'un brouillon, supprimer le brouillon ou annuler la ligne par un avoir la remet à `pending`. Un rendez-vous de l'agenda ne crée jamais de ligne (G Q67 point 7). Si l'événement n'est pas encore traité quand le praticien agit, `billing` crée la ligne à la demande par `SessionFacade.closedSession`. |
| Q87 | Tarif d'une séance | Dans l'ordre : montant fixé sur la séance (`billable_session.amount_cents`), tarif du patient (`billing_patient.rate_cents`), prix de la prestation par défaut. Sans aucun des trois : `rateSource = none`, la séance ne peut pas entrer dans une facture (`422 RATE_REQUIRED`). Le tarif du patient vit dans `billing`, pas dans `patient.follow_up.fee` (texte libre, jamais exposé par la façade : inchangé, plus lu par le web à partir de M15-21). |
| Q88 | Cycle d'une facture | `draft` : tout se modifie, suppression physique permise (ligne ajoutée à E9). **Émission** (`issued`) : numéro attribué, date d'émission, instantané de l'émetteur et du destinataire, total figé ; plus aucune modification ni suppression, à jamais. `void` : annulée en totalité par un avoir. Le statut exposé est calculé : `draft`, `due`, `partial`, `paid`, `void` pour une facture, `issued` pour un avoir, plus le booléen `overdue` (échéance passée et reste dû supérieur à zéro, au jour de `Europe/Paris`). |
| Q89 | Numérotation | Continue, sans trou, par praticien, par nature (facture, avoir) et par année civile de la date d'émission : `F-2026-0001`, `AV-2026-0001` (préfixes des réglages, modifiables tant que rien n'est émis). Compteur `billing_counter`, verrouillé dans la transaction d'émission (`select … for update`). La demande d'émission porte `expectedNumber` ; s'il n'est plus le suivant : `409 INVOICE_NUMBER_CHANGED` avec le nouveau, rien n'est émis. |
| Q90 | Paiements | Table `payment`, jamais de suppression : une annulation pose `cancelled_at`. Un paiement ne dépasse pas le reste dû (`409 AMOUNT_EXCEEDS_BALANCE`). Un remboursement est un paiement de nature `refund`, rattaché à un avoir. `invoice.paid_cents` et `credited_cents` sont tenus à jour dans la même transaction ; le reste dû en découle. |
| Q91 | Avoir | Document de nature `credit_note`, numéroté dans sa suite, émis d'emblée (pas de brouillon d'avoir), rattaché à une facture émise. Portée `full` ou `lines` (lignes entières). Il réduit le reste dû ; s'il dépasse ce qui restait dû, `refundDue` dit ce qui est à rembourser. Un avoir total passe la facture à `void`. Les séances des lignes annulées reviennent à `pending`. |
| Q92 | TVA | Régime du praticien : `health_exempt` (mention « TVA non applicable, article 261-4-1° du Code général des impôts »), `franchise` (« TVA non applicable, article 293 B du Code général des impôts »), `liable` (un taux, prix saisis hors taxes, la facture montre HT, TVA, TTC ; TVA = arrondi au centime du total HT × taux). Le texte des mentions vient de `messages_fr.properties`, jamais d'un champ libre. Mentions à faire relire par un expert-comptable (L10). |
| Q93 | PDF | Produit par l'API avec **openhtmltopdf** (déjà au `pom.xml`, aucune dépendance ajoutée), par un moteur propre à `billing` (`clinical.export` n'est pas touché). Le PDF d'une facture ou d'un avoir est rendu **une fois, à l'émission**, et rangé chiffré par `EncryptedStorageFacade` (clé `billing/invoice/{id}.pdf`) : le document émis ne change pas si les réglages changent. Rendus à la demande, jamais rangés : le brouillon (filigrane « Brouillon »), la facture acquittée, le reçu d'un paiement. Toujours en clair, format A4. |
| Q94 | E-mail au patient | `InvoiceMailer` propre à `billing` (`JavaMailSender`, comme les autres modules). Expéditeur technique de l'application, nom affiché « {praticien} via PsyMate », `Reply-To` = e-mail affiché des réglages. Corps = le texte validé par le praticien, PDF joint ; aucun autre contenu. Plafond : **30 envois par heure et par praticien** (`429`). Chaque envoi est inscrit dans l'historique de la facture avec l'adresse. C'est, avec M14-06, le premier e-mail adressé à un non-praticien : base légale et mention à faire valider (L10). |
| Q95 | Données sensibles et conservation | L'IBAN n'est jamais en base : il est rangé chiffré (`EncryptedStorageFacade`, clé `billing/iban/{practitionerId}`), seuls ses quatre derniers caractères sont en base ; le changer exige le mot de passe du compte. Aucune facture émise, aucun avoir, aucun paiement, aucun événement d'historique n'est supprimé (obligation de conservation). Ni nom de patient, ni montant, ni IBAN, ni adresse e-mail dans les journaux applicatifs. L'archivage d'un patient ne change rien à ses factures. |

## L3. Règles métier

### L3.1 États

```text
séance close ──► billable_session.pending ──► invoiced (dans un brouillon ou une facture)
                        │  ▲                        │
            « ne pas facturer »  « remettre »        │ ligne retirée, brouillon supprimé, avoir sur la ligne
                        ▼  │                        │
                     dismissed ◄────────────────────┘ (retour à pending, pas à dismissed)

facture : draft ──émettre──► issued ──paiements──► (due | partial | paid, calculé)
            │ supprimer                 └─avoir total──► void
            ▼
        (ligne effacée)
```

### L3.2 Calculs (tous côté API)

- `line.amount = quantity × unitPrice` ; une remise est une ligne à prix négatif. `subtotal = somme des lignes` ; `subtotal` ne peut pas être négatif ni nul à l'émission (`422 EMPTY_INVOICE`).
- `vat = régime liable ? arrondi(subtotal × taux / 10000) : 0` ; `total = subtotal + vat`.
- `balanceDue = total − paid − credited` (jamais négatif ; l'excédent d'un avoir est `refundDue` sur l'avoir).
- Statut : `draft` si brouillon ; `void` si annulée ; sinon `paid` si `balanceDue = 0`, `partial` si `paid + credited > 0`, `due` sinon.
- Échéance : `on_receipt` → `dueOn = issueDate` ; `days_15`, `days_30` → `issueDate + n` ; ou une date choisie. `overdue = dueOn < aujourd'hui (Europe/Paris) et balanceDue > 0`.

### L3.3 Cas limites

- Deux onglets émettent en même temps : le second reçoit `409 INVOICE_NUMBER_CHANGED` et réaffiche le numéro.
- Une séance déjà dans un brouillon est demandée dans un autre : `409 SESSION_ALREADY_INVOICED` (avec `sessionEntryId`).
- Réglages incomplets à l'émission (SIRET, adresse, au moins une prestation ou un prix) : `422 BILLING_SETTINGS_INCOMPLETE` avec `errors[]` par champ manquant ; le brouillon reste intact.
- Patient archivé : ses factures restent lisibles, encaissables, annulables par avoir ; plus de nouveau brouillon (`409 PATIENT_ARCHIVED`).
- Paiement sur une facture `void` ou un brouillon : `409 INVOICE_NOT_PAYABLE`.
- Avoir sur une ligne déjà annulée : `409 LINE_ALREADY_CREDITED`.

## L4. Modèle de données (migration `V18__billing.sql`, écrite par M15-05)

Toutes les tables appartiennent au module `billing`. Le DDL ci-dessous est repris tel quel dans E3.15 par M15-01 et dans la migration par M15-05.

```sql
create table billing_settings (
  practitioner_id     uuid primary key,
  tenant_id           uuid not null,
  siret               varchar(14),
  address_lines       varchar(300),
  display_email       varchar(320),
  display_phone       varchar(30),
  vat_regime          varchar(20) not null default 'health_exempt'
                      check (vat_regime in ('health_exempt', 'franchise', 'liable')),
  vat_rate_bp         integer check (vat_rate_bp between 0 and 10000),
  vat_number          varchar(20),
  invoice_prefix      varchar(10) not null default 'F',
  credit_note_prefix  varchar(10) not null default 'AV',
  due_term            varchar(20) not null default 'on_receipt'
                      check (due_term in ('on_receipt', 'days_15', 'days_30')),
  cheque_payee        varchar(120),
  accepted_modes      jsonb not null default '["transfer","cheque","cash"]',
  show_bank_details   boolean not null default false,
  iban_last4          varchar(4),
  footer_note         varchar(500),
  email_templates     jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (vat_regime <> 'liable' or vat_rate_bp is not null)
);

create table billing_service (
  id               uuid primary key,
  tenant_id        uuid not null,
  practitioner_id  uuid not null,
  label            varchar(120) not null,
  duration_min     integer check (duration_min between 1 and 600),
  price_cents      integer not null check (price_cents > 0),
  is_default       boolean not null default false,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index billing_service_one_default
  on billing_service (practitioner_id) where is_default and archived_at is null;
create index billing_service_by_practitioner on billing_service (practitioner_id) where archived_at is null;

create table billing_patient (
  patient_id           uuid primary key,
  tenant_id            uuid not null,
  practitioner_id      uuid not null,
  rate_cents           integer check (rate_cents > 0),
  address_lines        varchar(300),
  third_party_name     varchar(200),
  third_party_address  varchar(300),
  updated_at           timestamptz not null default now()
);

create table invoice (
  id                 uuid primary key,
  tenant_id          uuid not null,
  practitioner_id    uuid not null,
  patient_id         uuid not null,
  kind               varchar(12) not null check (kind in ('invoice', 'credit_note')),
  status             varchar(8) not null check (status in ('draft', 'issued', 'void')),
  number             varchar(30),
  cancels_invoice_id uuid references invoice (id),
  recipient_name     varchar(200),
  recipient_address  varchar(300),
  issue_date         date not null,
  due_term           varchar(20) not null check (due_term in ('on_receipt', 'days_15', 'days_30', 'date')),
  due_on             date,
  footer_note        varchar(500),
  reason_code        varchar(30),
  reason_text        varchar(300),
  issuer_snapshot    jsonb,
  subtotal_cents     bigint not null default 0,
  vat_cents          bigint not null default 0,
  total_cents        bigint not null default 0,
  paid_cents         bigint not null default 0 check (paid_cents >= 0),
  credited_cents     bigint not null default 0 check (credited_cents >= 0),
  refund_due_cents   bigint not null default 0 check (refund_due_cents >= 0),
  pdf_storage_key    varchar(120),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  issued_at          timestamptz,
  voided_at          timestamptz,
  check ((status = 'draft') = (number is null)),
  check (status = 'draft' or issuer_snapshot is not null),
  check ((kind = 'credit_note') = (cancels_invoice_id is not null)),
  check (kind = 'invoice' or status <> 'draft')
);
create unique index invoice_number_per_practitioner on invoice (practitioner_id, number) where number is not null;
create index invoice_by_practitioner on invoice (practitioner_id, issue_date desc, id);
create index invoice_by_patient on invoice (patient_id, issue_date desc, id);

create table invoice_line (
  id                uuid primary key,
  invoice_id        uuid not null references invoice (id) on delete cascade,
  position          integer not null,
  service_id        uuid,
  label             varchar(200) not null,
  occurred_on       date,
  quantity          integer not null check (quantity between 1 and 999),
  unit_price_cents  integer not null,
  amount_cents      bigint not null,
  session_entry_id  uuid,
  source_line_id    uuid references invoice_line (id),
  unique (invoice_id, position)
);
create index invoice_line_by_session on invoice_line (session_entry_id) where session_entry_id is not null;

create table billable_session (
  session_entry_id  uuid primary key,
  tenant_id         uuid not null,
  practitioner_id   uuid not null,
  patient_id        uuid not null,
  occurred_on       date not null,
  modality          varchar(20) not null,
  duration_min      integer,
  state             varchar(10) not null check (state in ('pending', 'dismissed', 'invoiced')),
  service_id        uuid,
  amount_cents      integer check (amount_cents > 0),
  invoice_id        uuid references invoice (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((state = 'invoiced') = (invoice_id is not null))
);
create index billable_session_pending on billable_session (practitioner_id, occurred_on) where state = 'pending';

create table billing_counter (
  practitioner_id  uuid not null,
  kind             varchar(12) not null check (kind in ('invoice', 'credit_note')),
  year             integer not null,
  last_number      integer not null check (last_number >= 0),
  primary key (practitioner_id, kind, year)
);

create table payment (
  id               uuid primary key,
  tenant_id        uuid not null,
  practitioner_id  uuid not null,
  invoice_id       uuid not null references invoice (id),
  kind             varchar(8) not null check (kind in ('payment', 'refund')),
  mode             varchar(10) not null check (mode in ('cash', 'cheque', 'transfer', 'card', 'other')),
  amount_cents     bigint not null check (amount_cents > 0),
  received_on      date not null,
  reference        varchar(120),
  note             varchar(500),
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now()
);
create index payment_by_practitioner on payment (practitioner_id, received_on desc, id);
create index payment_by_invoice on payment (invoice_id);

create table invoice_event (
  id          uuid primary key,
  invoice_id  uuid not null references invoice (id) on delete cascade,
  kind        varchar(24) not null check (kind in ('draft_created', 'issued', 'sent', 'payment_recorded',
              'payment_cancelled', 'credit_note_issued', 'voided')),
  at          timestamptz not null default now(),
  detail      jsonb not null default '{}'
);
create index invoice_event_by_invoice on invoice_event (invoice_id, at desc);
```

Changements de E qui vont avec : E1 ajoute le module `billing` et ses dix tables ; E4 réserve `V18__billing.sql` (M15-05, vague M15-A, dépend de V01) ; E9 ajoute une ligne « `invoice` à l'état `draft`, ses `invoice_line` et ses `invoice_event` : suppression physique à la demande du praticien ; jamais une facture émise, un avoir, un paiement » ; `invoice_event` est append-only (`@Immutable`) ; `payment` ne se modifie que par `cancelled_at`.

## L5. Contrat d'API (cible `0.17.0`, tag `contract-v0.17.0` posé par M15-12)

Toutes les routes exigent une session praticien ; chaque ressource est filtrée par `practitioner_id` (un identifiant d'un autre praticien répond `404`). Erreurs RFC 9457, `errors[]` par champ. Champs inconnus refusés (`UNKNOWN_FIELD`), comme ailleurs. Montants en centimes entiers ; dates `AAAA-MM-JJ` ; instants en UTC ISO 8601.

### L5.1 Réglages, prestations, profil de facturation du patient

| Route | Tâche | Comportement |
| --- | --- | --- |
| `GET /api/me/billing-settings` | M15-06 | `{ identity: { name, title, professionalNumber } (lecture seule, de identity), siret, addressLines, displayEmail, displayPhone, vat: { regime, rateBp?, vatNumber?, mention }, numbering: { invoicePrefix, creditNotePrefix, nextInvoiceNumber, nextCreditNoteNumber, locked }, payment: { dueTerm, chequePayee, acceptedModes[], showBankDetails, ibanLast4? }, footerNote, emailTemplates: { invoice: { subject, body }, reminder: { subject, body } }, missing: [] }`. Sans ligne en base : valeurs par défaut, adresse et e-mail proposés depuis identity. `missing` liste ce qui empêche d'émettre (`siret`, `addressLines`, `service`). |
| `PUT /api/me/billing-settings` | M15-06 | Remplace les champs modifiables. `422` : `SIRET_INVALID` (14 chiffres et clé de Luhn), `VAT_RATE_REQUIRED`, `VAT_NUMBER_REQUIRED` (régime `liable`), `OUT_OF_RANGE`, `INVALID_VALUE`. `409 NUMBERING_LOCKED` si un préfixe change après une première émission. |
| `PUT /api/me/billing-settings/iban` | M15-06 | `{ iban, currentPassword }` → `204`. `422 IBAN_INVALID` (format et clé mod 97), `403 PASSWORD_INVALID`. `DELETE` de la même route efface l'IBAN (mot de passe dans le corps). |
| `GET /api/me/billing-services` | M15-05 | `{ services: [{ id, label, durationMin?, price, isDefault }] }`, non archivées, la prestation par défaut d'abord puis par libellé. |
| `POST /api/me/billing-services` | M15-05 | `{ label, durationMin?, price, isDefault? }` → `201`. La première créée devient la prestation par défaut. 50 au plus (`422 SERVICE_LIMIT_REACHED`). |
| `PATCH`, `DELETE /api/me/billing-services/{id}` | M15-05 | Fusion partielle ; `isDefault: true` retire le défaut de l'autre. `DELETE` archive (`204`, idempotent) ; `409 SERVICE_IS_DEFAULT` s'il reste d'autres prestations. |
| `GET`, `PUT /api/patients/{id}/billing-profile` | M15-05 | `{ rate?, addressLines?, thirdPartyName?, thirdPartyAddress? }`. `PUT` remplace ; `null` efface. `409 PATIENT_ARCHIVED` en écriture. |

### L5.2 Séances à facturer

| Route | Tâche | Comportement |
| --- | --- | --- |
| `GET /api/billing/billable-sessions?until=&patientId=` | M15-07 | `{ groups: [{ patient: { id, displayName, archived }, rate?, rateSource: session, patient, service, none, openDraftCount, lastInvoice?: { number, issueDate }, sessions: [{ sessionEntryId, occurredOn, modality, durationMin?, serviceId?, serviceLabel?, amount? }] }], dismissedCount }`. État `pending` seulement, groupes par nom affiché, séances par date. |
| `GET /api/billing/billable-sessions/dismissed` | M15-07 | Les séances écartées des 90 derniers jours, même forme sans regroupement. |
| `POST /api/billing/billable-sessions/{sessionEntryId}/dismiss`, `/restore` | M15-07 | `204`, idempotents. Crée la ligne à la demande si la séance est close et pas encore connue (Q86). `404 SESSION_NOT_BILLABLE` (séance ouverte, d'accueil, de contact, ou d'un autre praticien), `409 SESSION_ALREADY_INVOICED`. |
| `PATCH /api/billing/billable-sessions/{sessionEntryId}` | M15-07 | `{ amount?, serviceId? }` ; `null` rend le tarif calculé. |

### L5.3 Factures

| Route | Tâche | Comportement |
| --- | --- | --- |
| `POST /api/invoices` | M15-08 | `{ patientId, sessionEntryIds?: [], lines?: [] }` → `201` brouillon. Une ligne par séance (désignation et prix de Q87). `409 PATIENT_ARCHIVED`, `409 SESSION_ALREADY_INVOICED`, `422 RATE_REQUIRED`. |
| `POST /api/invoices/batch` | M15-08 | `{ sessionEntryIds: [] }` (200 au plus) → `201 { invoices: [{ id, patient, total }] }`, un brouillon par patient, tout ou rien. |
| `GET /api/invoices?status=&overdue=&kind=&patientId=&q=&from=&cursor=` | M15-08 | `{ items: [InvoiceSummary], nextCursor? }`. Brouillons d'abord, puis date d'émission décroissante. `status` ∈ `draft`, `due`, `partial`, `paid`, `void` ; `q` cherche dans le numéro et le nom affiché du patient (2 caractères au moins). `InvoiceSummary = { id, kind, number?, status, overdue, overdueDays?, patient: { id, displayName }, issueDate, dueOn?, subject: { sessionCount, firstOn?, lastOn?, label? }, total, balanceDue, lastPaymentMode?, creditNoteNumber?, cancelsNumber? }`. |
| `GET /api/invoices/{id}` | M15-08 | `Invoice = InvoiceSummary + { issuer: { name, title, professionalNumber, siret, addressLines, displayEmail, displayPhone, vatMention, vatRateBp?, vatNumber?, chequePayee, acceptedModes[], bankDetailsShown }, recipient: { name, addressLines, patientName? }, lines: [{ id, position, occurredOn?, serviceId?, label, quantity, unitPrice, amount, sessionEntryId?, credited }], dueTerm, footerNote?, subtotal, vat, paid, credited, refundDue, nextNumberPreview? (brouillon), payments: [Payment], creditNotes: [{ id, number, total, issueDate }], cancels?: { id, number }, history: [{ kind, at, detail }], updatedAt }`. Pour un brouillon, `issuer` reflète les réglages du moment ; pour un document émis, l'instantané. |
| `PATCH /api/invoices/{id}` | M15-08 | Brouillon seulement (`409 INVOICE_ISSUED` sinon). Fusion partielle de `patientId` (tant qu'aucune ligne de séance), `recipient`, `issueDate`, `dueTerm`, `dueOn`, `footerNote`, et `lines` (remplacement complet, 100 au plus ; une ligne de séance retirée rend la séance à `pending`). Réponse : la facture relue. |
| `DELETE /api/invoices/{id}` | M15-08 | Brouillon seulement, `204` ; ses séances reviennent à `pending`. |
| `POST /api/invoices/{id}/issue` | M15-09 | `{ expectedNumber, alreadyPaid?: { mode, receivedOn, reference? } }` → `200` la facture émise. `409 INVOICE_NUMBER_CHANGED` (`nextNumber` dans le problème), `422 BILLING_SETTINGS_INCOMPLETE`, `422 EMPTY_INVOICE`, `422` par champ. |
| `GET /api/invoices/by-number/{number}` | M15-09 | Même réponse que `GET /api/invoices/{id}`. |
| `GET /api/invoices/{id}/pdf?variant=` | M15-09 | `application/pdf`. Brouillon : rendu à la demande, filigrane. Émis : le fichier rangé à l'émission. `variant=receipted` : facture acquittée, `409 INVOICE_NOT_PAID` si elle ne l'est pas. Nom de fichier : le numéro. |
| `POST /api/invoices/{id}/duplicate` | M15-09 | `201` un brouillon avec les mêmes lignes sans leurs séances. |
| `POST /api/invoices/{id}/credit-notes` | M15-11 | `{ scope: full, lines, lineIds?, reasonCode: session_cancelled, wrong_amount, wrong_recipient, other, reasonText?, expectedNumber }` → `201` l'avoir (`refundDue` compris). `409 CREDIT_NOTE_NUMBER_CHANGED`, `409 LINE_ALREADY_CREDITED`, `409 INVOICE_VOID`, `422 REASON_TEXT_REQUIRED` (motif `other`). |
| `POST /api/invoices/{id}/send` | M15-11 | `{ to, subject, body, template: invoice, reminder }` → `202`. `422 EMAIL_INVALID`, `409 INVOICE_NOT_ISSUED`, `429`. Sujet 200 caractères, corps 5 000. |

### L5.4 Paiements, chiffres

| Route | Tâche | Comportement |
| --- | --- | --- |
| `POST /api/invoices/{id}/payments` | M15-10 | `{ amount, mode, receivedOn, reference?, note? }` → `201 Payment = { id, invoiceId, invoiceNumber, kind, mode, amount, receivedOn, reference?, note?, cancelledAt? }`. Sur un avoir dont `refundDue > 0` : nature `refund`, plafonnée à `refundDue`. `409 AMOUNT_EXCEEDS_BALANCE`, `409 INVOICE_NOT_PAYABLE`, `422 MODE_NOT_ACCEPTED` (mode absent des réglages, `other` toujours accepté), `422` date future. |
| `POST /api/payments/{id}/cancel` | M15-10 | `200` le paiement annulé ; idempotent. |
| `GET /api/payments?from=&to=&mode=&cursor=` | M15-10 | `{ items: [Payment + { patient: { id, displayName }, partial }], nextCursor?, totals: { amount, paymentCount, refundCount, byMode: [{ mode, amount }] } }`. Les totaux portent sur toute la période (remboursements déduits, annulés exclus). |
| `GET /api/payments/{id}/receipt` | M15-10 | PDF du reçu, rendu à la demande. |
| `GET /api/payments/export?from=&to=&format=csv,pdf&identity=document_number,full_name` | M15-10 | Fichier, téléchargement direct. Colonnes : date, numéro, mode, référence, montant ; le nom seulement avec `full_name`. Un an au plus par export. |
| `GET /api/billing/summary` | M15-10 | `{ month, collected, paymentCount, outstanding, outstandingCount, overdue, overdueCount, oldestOverdueDays?, billableCount, billableAmount, billableWithoutRate }`. |
| `GET /api/patients/{id}/billing` | M15-10 | `{ patient: { id, displayName, archived }, balanceDue, dueInvoiceCount, nextDueOn?, billableCount, rate?, rateSource, recipient: { name, addressLines } }`. |

### L5.5 Ce qui diffère des fiches 33 à 39 (à reporter par M15-13)

Montants en centimes ; pas de route d'aperçu (l'aperçu est dessiné par le web, Q70) ; pas de `sendByEmail` à l'émission (le web enchaîne émission puis envoi) ; tarif et adresse du patient par `billing-profile`, pas par `PATCH /api/patients/{id}` ; pas de champ `billing` sur la clôture de séance (le web appelle `dismiss`, ou crée puis émet une facture, après la clôture) ; export du journal en téléchargement direct ; `reasonCode` au lieu d'un libellé ; ligne de l'agenda hors M15. Relevé en plus par M15-13 (fiches corrigées) : aucune route d'export de la liste des factures (le bouton « Exporter » des fiches 33 et 38 n'est pas réalisé en M15) ; une remise est une ligne à prix négatif, en montant seulement (pas de pourcentage) ; `rateSource` porte aussi `session` ; l'identité des réglages est `{ name, title, professionalNumber }` (pas de nature ADELI ou RPPS), et l'IBAN n'est connu que par `ibanLast4`.

## L6. Tâches, couloirs et parallélisme

### L6.1 API (`psymate-api`)

| ID | Titre | Couloir | Dépend de | Parallèle avec |
| --- | --- | --- | --- | --- |
| M15-01 | Décisions Q83 à Q95 et documentation ; copie de ce plan côté API | docs | — | M15-02 à M15-05 |
| M15-02 | `SessionClosed` et `SessionFacade.closedSession` | clinical (api, service) | — | M15-01, 03, 04, 05 |
| M15-03 | Identité d'émetteur et vérification du mot de passe | identity (api) | — | M15-01, 02, 04, 05 |
| M15-04 | Identité de facturation d'un patient | patients (api) | — | M15-01, 02, 03, 05 |
| M15-05 | Module `billing` : socle, `V18`, prestations, profil de facturation du patient | billing | — | M15-01 à M15-04 |
| M15-06 | Réglages de facturation, IBAN | billing | M15-03, M15-05 | — |
| M15-07 | Séances à facturer | billing | M15-02, M15-04, M15-06 | — |
| M15-08 | Factures : brouillons, liste | billing | M15-07 | — |
| M15-09 | Émission, numérotation, PDF | billing | M15-08 | — |
| M15-10 | Paiements, journal, export, chiffres | billing | M15-09 | — |
| M15-11 | Avoirs, envoi par e-mail | billing | M15-10 | — |
| M15-12 | Seed, tag de contrat, suivi | racine (`tools/seed`) | M15-11 | — |

**Vagues.** M15-A : 01 ∥ 02 ∥ 03 ∥ 04 ∥ 05 (cinq couloirs disjoints : docs, clinical, identity, patients, billing). M15-B : 06. M15-C : 07. M15-D : 08. M15-E : 09. M15-F : 10. M15-G : 11. M15-H : 12. Le couloir `billing` n'a jamais deux agents à la fois. Effort indicatif : 10 jours.

**Agents.** `backend-module-dev` (M15-02 à M15-11), `seed-perf` (M15-12), Claude directement pour M15-01. `reviewer` avant chaque fusion, puis `make log`.

**Voisinage.** Les jalons M14 (prise de rendez-vous) et M16 (version arabe) sont fusionnés. M15 ne touche ni `agenda`, ni `identity/preferences`, ni `directory`. **Version arabe** : l'API a trois fichiers de messages (`messages_fr`, `messages_en`, `messages_ar`) ; une clé ajoutée par M15 suit la règle du dépôt à ce sujet (voir `CLAUDE.md` et `docs/M-plan-version-arabe-api.md`) ; les factures, les avoirs, les reçus et leurs mentions légales restent en français quelle que soit la langue du praticien. Fichiers que plusieurs tâches M15 touchent en parallèle : `contract/openapi.yaml`, `docs/generated/**`, `ContractIT`, les listes des tests d'architecture, `G`, `C`, `D`, `E`, `CLAUDE.md`. En cas de conflit au rebase : pour `contract/openapi.yaml` et `docs/generated/**`, reprendre la version de `main` puis regénérer (`make contract`), jamais résoudre à la main ; pour une liste, garder les deux côtés.

### L6.2 Web (`psymate-web`)

| ID | Titre | Couloir | Dépend de | Parallèle avec |
| --- | --- | --- | --- | --- |
| M15-13 | Décisions Q68 à Q70, fiches 33 à 39 alignées sur L5, maquettes des états manquants | docs | — | toutes les tâches API |
| M15-14 | Contrat `0.17.0` ; socle : route du carreau du rail, feature `billing`, en-tête et onglets du module | `api` généré + `shared/ui/nav-rail` + `app.routes.ts` + `features/billing` | M15-12, M15-13 | — |
| M15-15 | Réglages (fiche 39) | `features/billing` | M15-14 | — |
| M15-16 | Factures : liste, bandeau, filtre sur un patient (fiches 33, 38) | `features/billing` | M15-15 | — |
| M15-17 | Nouvelle facture : éditeur, émission (fiche 35) | `features/billing` | M15-16 | M15-21 |
| M15-18 | Facture émise : paiement, avoir, envoi (fiche 36) | `features/billing` | M15-17 | M15-21 |
| M15-19 | À facturer (fiche 34) | `features/billing` | M15-18 | M15-21 |
| M15-20 | Paiements : journal, export (fiche 37) | `features/billing` | M15-19 | M15-21, M15-22 |
| M15-21 | Fiche patient : tarif, adresse de facturation, lien « Voir les factures » (fiche 38) | `features/patients` | M15-16 | M15-17 à M15-20 |
| M15-22 | Clôture de séance : « Ajouter à À facturer », « Réglée en séance » (fiche 38) | `features/patient-shell` | M15-19 | M15-20 |

**Vagues.** M15-I : 13 (pendant l'API). M15-J : 14. M15-K : 15 → 16 → 17 → 18 → 19 → 20 dans le couloir `billing`, un agent à la fois (H 2.7) ; 21 dès que 16 est fusionnée ; 22 dès que 19 l'est. Effort indicatif : 10 jours.

**État du web au 28 novembre 2026.** Ce document, les fiches 33 à 39, les maquettes `docs/design/facturation/`, G13 (Q67) et C13 sont sur `main`. Habillage : celui de l'application (tokens de `src/theme/tokens.css`, palette Nordique, polices Inter et JetBrains Mono) ; depuis M15-13, les maquettes de la facturation sont dessinées avec ces mêmes valeurs. Un écran reprend la structure, les espacements et les noms de tokens de la maquette, jamais une valeur de couleur écrite en dur. **Version arabe** (G14, `docs/design/arabe.md`, `arabe-glossaire.md`) : toute tâche d'écran suit ses règles (propriétés CSS logiques seulement, `dir="auto"` sur tout contenu saisi, locale de formatage de `core/i18n`, jamais `LOCALE_ID` dans `Intl`), fournit `messages.ar.xlf` comme le demande le dépôt, et ne change pas le rendu de `/fr/` ni de `/en/` ; la feuille de facture (aperçu et PDF) reste en français et de gauche à droite.

**Agents.** `frontend-feature-dev` pour M15-14 à M15-22 ; Claude directement pour M15-13 ; `reviewer` avant chaque fusion ; puis `pnpm progress:log`.

**e2e.** L'API tourne avec le seed `small`, qui porte des réglages complets, des prestations, des factures dans chaque statut et des séances à facturer (M15-12). Les e-mails se lisent dans Mailpit.

### L6.3 Règles communes aux tâches API

1. **Lecture.** `CLAUDE.md`, puis ce plan : `../psymate-web/docs/L-plan-facturation.md` tant que `docs/L-plan-facturation-api.md` n'est pas sur `main`, ensuite la copie de l'API. Le chemin `../psymate-web` part de la racine du dépôt principal ; depuis un worktree, c'est `$(git rev-parse --git-common-dir)/../../psymate-web/docs/L-plan-facturation.md`. G l'emporte sur L, L sur C.
2. **Version du contrat.** `0.16.0` est taguée (`contract-v0.16.0`, M16). La première tâche M15 qui change `contract/openapi.yaml` (M15-05) passe `app.contract.version` à `0.17.0` dans sa PR ; les suivantes ajoutent leurs routes à `0.17.0` sans changer la version. Règle générale, si un autre jalon passe avant : regarder si le tag `contract-v<version courante>` existe (`git fetch --tags && git tag -l "contract-v<version>"`) ; s'il existe, passer à la mineure suivante ; sinon ne pas toucher à la version. M15-12 pose le tag de la version atteinte (`contract-v0.17.0`).
3. **Un seul `verify` à la fois sur le poste** (CLAUDE.md). Avant `./mvnw verify` ou `bash tools/verify-fast.sh`, prendre le verrou partagé des worktrees : `LOCK="$(git rev-parse --git-common-dir)/verify.lock"; until mkdir "$LOCK" 2>/dev/null; do sleep 30; done`, et le rendre à la fin, succès ou échec : `rmdir "$LOCK"`. Un verrou vieux de plus de 45 minutes est considéré comme abandonné et peut être retiré. Un test isolé (`./mvnw test -Dtest=…`) n'a pas besoin du verrou.
4. **Début et fin de tâche** (consigne de l'utilisateur du 28 novembre 2026). Au début : `make log TASK=<ID> AGENT=<agent> STATUS=in-progress SUMMARY="…"`. À la fin : `./mvnw verify` vert, sous-agent `reviewer` avec le prompt de L9, corrections des points bloquants, PR avec le template, `make log … STATUS=done … PR=<url>`, événements commités. Dès la PR ouverte, la session **active Auto-fix** sur sa PR (outils `ccd_pr` : `get_status`, `bind_pr` si besoin, puis la surveillance) et répare elle-même une CI rouge, un conflit ou une remarque de revue. **Chaque session fusionne sa propre PR**, en squash (`gh pr merge <n> --squash --delete-branch`), dès que la CI est verte et que `reviewer` n'a rien de bloquant ; si la fusion lui est refusée, elle le dit dans son dernier message et la session orchestratrice fusionne. Aucune tâche n'attend l'utilisateur : M15-01 et M15-13 se fusionnent comme les autres, et disent en tête de leur PR que les décisions Q83 à Q95 et les maquettes complétées n'ont pas été relues par lui.
5. **Jamais** : un nom de patient, un montant, un IBAN ou une adresse e-mail dans un journal ; une dépendance Maven ; un appel externe ; un fichier hors du couloir de la tâche (les listes des tests d'architecture et `tools/it-slices.txt` sont permises à la tâche qui crée le module).

### L6.4 Lancement (28 novembre 2026)

Lancé par la session orchestratrice, à la demande de l'utilisateur, qui la pilote à distance et n'intervient pas dans les sessions de tâche.

1. **Vague M15-A** : cinq sessions dans `psymate-api`, une par tâche, chacune dans son worktree coupé de `main`, modèle Opus 5.5 : M15-01 (docs), M15-02 (clinical), M15-03 (identity), M15-04 (patients), M15-05 (billing).
2. **Couloir `billing`** : la session de M15-05 enchaîne M15-06 à M15-11 dans l'ordre, une branche neuve depuis `origin/main` par tâche, chaque tâche après la fusion de la précédente ; M15-06 attend aussi M15-03, M15-07 attend M15-02 et M15-04. Puis M15-12 (seed, tag `contract-v0.17.0`).
3. **Couloir web** : une session dans `psymate-web` fait M15-13 pendant l'API, puis, après le tag du contrat, M15-14 et les écrans M15-15 à M15-20, puis M15-21 et M15-22, une branche neuve depuis `origin/main` par tâche.
4. **Surveillance** : toutes les dix minutes, la session orchestratrice revoit les sessions et les PR des deux dépôts, fusionne une PR verte restée ouverte, relance une session arrêtée ou bloquée, et envoie la tâche suivante à la session du couloir quand ses dépendances sont fusionnées.

Phrase de lancement d'une tâche (dans le dépôt de la tâche) : « Exécute la tâche M15-NN : ton prompt est le bloc M15-NN de la section L7 (API) ou L8 (web) de `docs/L-plan-facturation.md` ; applique aussi L6.3. »

## L7. Prompts API

Manœuvre : dans `psymate-api`, `git checkout main && git pull && claude --worktree <ID>`, coller le prompt (ou la phrase de lancement de L6.4). Chaque prompt se complète des règles communes de L6.3 : lecture du plan, version du contrat, verrou de `verify`, début et fin de tâche. À la fin : sous-agent `reviewer`, lecture humaine (migration, diff de `contract/openapi.yaml`, un IT), `gh pr merge <n> --squash --delete-branch`.

### M15-01 — Décisions et documentation

```text
Tâche M15-01 — Inscrire le jalon M15 « Facturation » dans la documentation de psymate-api (docs/, CLAUDE.md et .claude/agents seulement ; aucun code Java, aucune migration).

Contexte : lis ../psymate-web/docs/L-plan-facturation.md en entier (il fait foi pour cette tâche), docs/G-decisions.md (G10 et le format des lignes Q71 à Q82, la table G5), docs/K-plan-prise-de-rendez-vous-api.md (modèle d'un plan de jalon copié du web), docs/A-architecture.md (A3, A5 : modules et dépendances), docs/C-plan.md (C1 et la section C13 du jalon M14 : format), docs/D-orchestration-backend.md (D1, D3, D5), docs/E-modele-donnees.md (E1, E3.14, E4, E9), CLAUDE.md, .claude/agents/backend-module-dev.md.

Objectif :
- Nouveau fichier docs/L-plan-facturation-api.md : copie des sections L1, L2.2, L3, L4, L5, L6.1, L6.3, L7 et de la partie API de L9 et L10 du document du web, avec en tête la date, le renvoi au document du web pour la partie web, la phrase « Pour toute tâche M15, ce document fait foi (L4 DDL, L5 contrat) » et la mention que L2.2, L4 et L5 sont proposés par le plan et n'ont pas été relus par l'utilisateur, qui a demandé le 28 novembre 2026 de lancer le jalon sur cette base.
- G : nouvelle section « G11. Facturation, jalon M15, module billing (22 novembre 2026) » avec Q83 à Q95 copiées de L2.2, une ligne par question, même style que Q71 à Q82. La phrase d'introduction dit : périmètre tranché par l'utilisateur le 22 novembre 2026 (G Q67 de psymate-web) ; décisions techniques proposées par le plan L, non relues par l'utilisateur, appliquées à sa demande du 28 novembre 2026. Une ligne dans la table G5.
- A : A3 et A5 ajoutent le module billing et ses dépendances (identity, patients, clinical, events, shared ; personne ne dépend de billing).
- C : C1 ajoute le jalon M15 (objectif, démontrable, effort indicatif 10 j) ; nouvelle section C14 avec le tableau des tâches M15-01 à M15-12 au format de C13, critères repris mot pour mot de L7.
- D : D1, D3, D5 reçoivent les lignes, vagues et couloirs de L6.1, dont un nouveau couloir billing.
- E : E1 ajoute billing et ses dix tables ; nouvelle section E3.15 avec le DDL de L4, identique octet pour octet ; E4 ajoute la ligne V18__billing.sql (M15-05, vague M15-A, dépend de V01) ; E9 reçoit la ligne des brouillons de L4.
- CLAUDE.md : billing rejoint la liste des modules avec ses dépendances ; une ligne « La facturation vit dans le module billing (G Q83) : montants en centimes entiers (Q84), facture émise jamais modifiée ni supprimée, correction par avoir (Q88, Q91), rien de clinique sur une facture. Pour toute tâche M15, docs/L-plan-facturation-api.md fait foi (L4 DDL, L5 contrat). »
- .claude/agents/backend-module-dev.md : ajoute « docs/L-plan-facturation-api.md pour toute tâche M15 » à sa liste de lecture.

Périmètre : docs/**, CLAUDE.md, .claude/agents/backend-module-dev.md. Rien d'autre.

Critères d'acceptation :
- G Q83 à Q95 existent, avec la mention exacte de qui a tranché quoi ;
- chaque tâche M15-01 à M15-12 a sa ligne dans C et D avec les dépendances de L6.1 ;
- le DDL de E3.15 est identique octet pour octet au bloc SQL de L4 ;
- E4 porte V18, E9 porte la ligne des brouillons ;
- aucune source Java, aucune migration, aucun contrat modifié.

Interdits : toute modification de code, de migration ou de contrat ; réécrire docs/progress/index.html ou un événement existant ; inscrire une décision que L ne contient pas ; écrire qu'une décision de L2.2 a été « tranchée par l'utilisateur ».

Règles d'exécution : L6.3 (règles 1 et 4). Aucune source n'étant touchée, ./mvnw verify n'est pas nécessaire.

Livrable : PR « M15-01 Facturation : décisions et documentation », qui dit en tête que les décisions Q83 à Q95 sont proposées par le plan et non relues par l'utilisateur, puis make log TASK=M15-01 AGENT=claude STATUS=done SUMMARY="…" PR=<url>. Fusion : L6.3 règle 4.
```

### M15-02 — `SessionClosed` et `SessionFacade`

```text
Tâche M15-02 — Faire connaître la clôture d'une séance aux autres modules (dépôt psymate-api, module clinical : package api et SessionService seulement). Utilise l'agent backend-module-dev.

Contexte : lis CLAUDE.md, ../psymate-web/docs/L-plan-facturation.md (L2.2 Q85 et Q86, L6.3). Code : clinical/service/SessionService.java (close, start, contact), clinical/api (SessionView, EntryFacade, EntryCorrected : forme d'un événement et d'une façade), clinical/repository/EntryRepository (SESSION_VIEW_SELECT, openSession, currentSession), events/api (DomainEvent, DomainEventPublisher), un écouteur existant (clinical/service/IntakeSessionListener), ApiBoundaryTests, ApiUsageTests et ReservesConformanceIT (ce qu'une API encore sans appelant doit porter, voir @Reserved sur PublishedProfileFacade).

Objectif :
- clinical.api.SessionClosed : événement de domaine (tenantId, sessionId, patientId, practitionerId, kind, modality, occurredFrom, closedAt, durationMin), publié par SessionService.close dans la transaction de clôture, une fois par clôture réussie, pour tout kind ; publié aussi par la création d'une séance de contact, qui naît close. La publication de EntryCorrected ne change pas.
- clinical.api.SessionFacade : Optional<SessionView> closedSession(UUID sessionId) (vide si la séance n'existe pas, est archivée ou n'est pas close). SessionView reçoit practitionerId s'il n'y est pas. Implémentation dans clinical/service, lecture par EntryRepository.
- Aucune route, aucun changement de contrat, aucune migration.

Périmètre : src/main/java/com/psymate/clinical/api/**, clinical/service/SessionService.java et l'implémentation de la façade, clinical/repository/EntryRepository si une requête manque, leurs tests. Rien dans les autres modules.

Critères d'acceptation :
- clore une séance publie exactement un SessionClosed avec la durée et l'instant de clôture retenus ; clore une séance déjà close n'en publie pas ;
- closedSession renvoie la vue d'une séance close, vide pour une séance ouverte, archivée ou inconnue ;
- les tests d'architecture et ReservesConformanceIT sont verts (marque @Reserved « M15-07, G Q86 » si c'est la règle pour une API sans appelant) ;
- contract/openapi.yaml inchangé ; ./mvnw verify vert.

Tests : unitaire de SessionService (publication), IT de clôture (événement publié une fois), IT de la façade.

Interdits : toucher à un autre module ; changer la forme de EntryCorrected, de CloseSessionRequest ou d'une réponse HTTP ; journaliser un contenu de séance.

Règles d'exécution : L6.3 en entier (lecture du plan, version du contrat, verrou de verify, début et fin de tâche, fusion).

Livrable : PR « M15-02 Clôture de séance : événement et façade », puis make log TASK=M15-02 AGENT=backend-module-dev STATUS=done SUMMARY="…" PR=<url>.
```

### M15-03 — Identité d'émetteur et mot de passe

```text
Tâche M15-03 — Exposer aux autres modules l'identité d'émetteur d'un praticien et la vérification de son mot de passe (dépôt psymate-api, module identity : package api et son implémentation seulement). Utilise l'agent backend-module-dev.

Contexte : lis CLAUDE.md, ../psymate-web/docs/L-plan-facturation.md (L2.2 Q85, Q95 ; L5.1 ; L6.3). Code : identity/api/PractitionerFacade.java et identity/auth/service/PractitionerFacadeImpl.java, identity/model/Practitioner.java (first_name, last_name, display_name, profession, professional_number, address_street, address_postal_code, address_city, phone, email), la façon dont le changement de mot de passe vérifie le mot de passe courant (identity/auth, PasswordEncoder), identity/api/SuspendedAccountAuthenticator (forme d'une façade d'authentification), ApiBoundaryTests, ReservesConformanceIT.

Objectif :
- PractitionerFacade.issuerOf(UUID id) → Optional<IssuerView> : record (id, firstName, lastName, displayName, profession, professionalNumber, addressStreet, addressPostalCode, addressCity, phone, email). Lecture seule.
- identity.api.PasswordCheck (ou une méthode de façade nommée dans le style du module) : boolean matches(UUID practitionerId, CharSequence password), sans effet de bord sur les compteurs de verrouillage de la connexion, sans journaliser le mot de passe ; un praticien inconnu ou sans mot de passe répond false.
- Aucune route, aucun changement de contrat, aucune migration.

Périmètre : src/main/java/com/psymate/identity/api/**, l'implémentation dans identity/auth/service, leurs tests. Ne touche pas à identity/preferences (tâche M14-02 en cours).

Critères d'acceptation :
- issuerOf renvoie les champs du praticien, vide pour un identifiant inconnu ;
- matches répond true pour le bon mot de passe, false sinon, et ne change ni l'état du compte ni les compteurs de tentative ;
- tests d'architecture et ReservesConformanceIT verts (marque @Reserved « M15-06, G Q85 » si c'est la règle) ;
- contract/openapi.yaml inchangé ; ./mvnw verify vert.

Tests : IT de la façade (issuerOf), IT ou unitaire de la vérification du mot de passe.

Interdits : exposer le hachage du mot de passe ; toucher à identity/preferences, à un contrôleur ou à un autre module ; ajouter une route.

Règles d'exécution : L6.3 en entier (lecture du plan, version du contrat, verrou de verify, début et fin de tâche, fusion).

Livrable : PR « M15-03 Identity : identité d'émetteur et vérification du mot de passe », puis make log TASK=M15-03 AGENT=backend-module-dev STATUS=done SUMMARY="…" PR=<url>.
```

### M15-04 — Identité de facturation d'un patient

```text
Tâche M15-04 — Exposer aux autres modules ce que la facturation doit savoir d'un patient (dépôt psymate-api, module patients : package api et PatientService seulement). Utilise l'agent backend-module-dev.

Contexte : lis CLAUDE.md, ../psymate-web/docs/L-plan-facturation.md (L2.2 Q85, Q87 ; L6.3), docs/G-decisions.md Q56 (fee et prescriber ne sont jamais exposés). Code : patients/api/PatientFacade.java, PatientRef, FollowUpView, patients/service/PatientService.java (il implémente la façade), patients/model/Patient.java, PatientOwnershipGuard, ApiBoundaryTests, ReservesConformanceIT.

Objectif :
- PatientFacade.billingIdentity(UUID patientId) → Optional<PatientBillingView> : record (id, ownerId, displayName, firstName, lastName, email, archived). Vide pour un patient inconnu.
- PatientFacade.billingIdentities(Collection<UUID>) → Map<UUID, PatientBillingView>, en une requête.
- Rien d'autre : ni fee, ni prescriber, ni contexte, ni téléphone.
- Aucune route, aucun changement de contrat, aucune migration.

Périmètre : src/main/java/com/psymate/patients/api/**, patients/service/PatientService.java, patients/repository si une requête manque, leurs tests.

Critères d'acceptation :
- les deux méthodes renvoient les sept champs, archived compris, pour un patient actif et un patient archivé ;
- la méthode par lot fait une seule requête pour n identifiants et ignore les inconnus ;
- tests d'architecture et ReservesConformanceIT verts (marque @Reserved « M15-07, G Q85 » si c'est la règle) ;
- contract/openapi.yaml inchangé ; ./mvnw verify vert.

Tests : IT de la façade (actif, archivé, inconnu, lot).

Interdits : exposer follow_up ou une donnée clinique ; toucher aux fichiers PatientProfile*, à un contrôleur ou à un autre module.

Règles d'exécution : L6.3 en entier (lecture du plan, version du contrat, verrou de verify, début et fin de tâche, fusion).

Livrable : PR « M15-04 Patients : identité de facturation », puis make log TASK=M15-04 AGENT=backend-module-dev STATUS=done SUMMARY="…" PR=<url>.
```

### M15-05 — Module `billing` : socle, prestations, profil de facturation

```text
Tâche M15-05 — Créer le module billing, sa migration, les prestations et le profil de facturation d'un patient (dépôt psymate-api, nouveau module com.psymate.billing). Utilise l'agent backend-module-dev.

Contexte : lis CLAUDE.md, ../psymate-web/docs/L-plan-facturation.md (L2.2 Q83, Q84, Q87 ; L4 en entier ; L5.1 ; L6.3), docs/E-modele-donnees.md (E4 : règles des migrations ; E9), docs/G-decisions.md Q32 à Q38 (structure par rôle, JPA, un fichier par DTO). Code : le module agenda comme modèle récent (package-info.java, AppointmentController, AgendaExceptionHandler, AppointmentForbiddenFieldsAdvice, AppointmentMapper, AppointmentRepository, AppointmentService) ; patients/api/PatientOwnershipGuard ; identity/api/CurrentPractitioner ; les tests ModularityTests (EXPECTED_MODULES, PENDING_MODULES), ArchitectureTests (JPA_PACKAGES), RoleFolderTests (ROLE_FOLDER_MODULES), TableOwnershipTests, FlywayMigrationIT, src/test/resources/expected-schema-v01.yaml, tools/it-slices.txt et tools/verify-fast.sh --check ; la PR #103 (M14-04) pour voir ce qu'une migration fait bouger.

Objectif :
- Module billing : package-info.java avec allowedDependencies = identity :: api, patients :: api, clinical :: api, events :: api, shared (les dépendances pas encore employées vont dans PENDING_MODULES ou ce que la règle demande). Dossiers par rôle. Aucun package api (personne ne dépend de billing).
- V18__billing.sql : le DDL de L4, identique octet pour octet, les dix tables d'un coup. expected-schema-v01.yaml, TableOwnershipTests, FlywayMigrationIT et les listes d'architecture mis à jour ; les *IT de billing rejoignent la tranche core de tools/it-slices.txt.
- Entités et dépôts JPA pour billing_service et billing_patient seulement (les autres tables viennent avec leurs tâches).
- Routes de L5.1 : GET et POST /api/me/billing-services, PATCH et DELETE /api/me/billing-services/{id}, GET et PUT /api/patients/{id}/billing-profile. Règles : montants en centimes entiers ; première prestation créée = défaut ; un seul défaut ; 50 prestations au plus ; DELETE archive ; 409 SERVICE_IS_DEFAULT ; propriété du patient par PatientOwnershipGuard ; 409 PATIENT_ARCHIVED en écriture ; champs inconnus refusés (UNKNOWN_FIELD) ; 422 par champ avec les codes de L5.1.
- Contrat regénéré (make contract) ; version selon L6.3 règle 2. messages_fr.properties pour les textes d'erreur.

Périmètre : src/main/java/com/psymate/billing/**, src/main/resources/db/migration/V18__billing.sql, messages_*.properties (clés billing.*), les tests de billing, les listes des tests d'architecture, expected-schema-v01.yaml, tools/it-slices.txt, contract/openapi.yaml, docs/generated/** (regénérés). Aucun autre module.

Critères d'acceptation :
- la base migrée contient les dix tables de L4 avec leurs contraintes ; FlywayMigrationIT et TableOwnershipTests verts ;
- ModularityTests reconnaît billing ; aucune dépendance interdite ; tools/verify-fast.sh --check vert ;
- prestations : création, liste (défaut d'abord), modification, changement de défaut, archivage, limite de 50, 409 SERVICE_IS_DEFAULT, isolement entre praticiens (404 pour la prestation d'un autre) ;
- profil de facturation : lecture d'un profil vide, écriture, effacement par null, 404 pour le patient d'un autre, 409 pour un patient archivé ;
- un prix à zéro, négatif ou non entier est refusé (422) ; aucun montant en décimal dans le contrat ;
- ./mvnw verify vert.

Tests : *IT Testcontainers pour chaque route (succès, 404, 409, 422), test unitaire des règles de défaut.

Interdits : toucher à un autre module ; écrire les entités des factures, des paiements ou des séances à facturer ; une dépendance Maven ; modifier une migration existante ; journaliser un montant ou un nom.

Règles d'exécution : L6.3 en entier (lecture du plan, version du contrat, verrou de verify, début et fin de tâche, fusion).

Livrable : PR « M15-05 Billing : socle, prestations, profil de facturation », puis make log TASK=M15-05 AGENT=backend-module-dev STATUS=done SUMMARY="…" PR=<url>.
```

### M15-06 — Réglages de facturation, IBAN

```text
Tâche M15-06 — Réglages de facturation et IBAN (dépôt psymate-api, module billing). Utilise l'agent backend-module-dev. Dépend de M15-03 et M15-05, fusionnées.

Contexte : lis CLAUDE.md, docs/L-plan-facturation-api.md (Q85, Q89, Q92, Q95 ; L4 billing_settings ; L5.1). Code : billing (M15-05), identity/api (PractitionerFacade.issuerOf, vérification du mot de passe, EncryptedStorageFacade, CurrentPractitioner).

Objectif : GET et PUT /api/me/billing-settings, PUT et DELETE /api/me/billing-settings/iban, exactement comme L5.1. Bloc identity en lecture seule (nom, titre tiré de la profession, numéro professionnel) ; valeurs par défaut sans ligne en base ; adresse et e-mail proposés depuis identity tant qu'ils ne sont pas enregistrés ; mention de TVA tirée de messages_fr selon le régime ; numbering.next* calculés depuis billing_counter et l'année en cours, locked dès qu'un numéro existe ; missing calculé (siret, addressLines, service). SIRET : 14 chiffres et clé de Luhn. IBAN : format et clé mod 97, rangé chiffré (clé billing/iban/{practitionerId}), quatre derniers caractères en base, jamais renvoyé ; mot de passe exigé pour l'écrire et l'effacer.

Critères d'acceptation : chaque code d'erreur de L5.1 a un IT ; l'IBAN n'apparaît dans aucune réponse, aucune table, aucun journal ; un préfixe ne change plus après une émission simulée par une ligne de billing_counter ; isolement entre praticiens ; ./mvnw verify vert ; contrat regénéré.

Interdits : toucher à un autre module ; stocker l'IBAN en clair ; un champ libre pour la mention de TVA.

Périmètre : src/main/java/com/psymate/billing/**, src/main/resources/messages_*.properties (clés billing.*), les tests de billing, contract/openapi.yaml et docs/generated/** (regénérés par make contract). Aucun autre module, aucune migration (si une colonne manque à V18, arrête-toi et dis-le : une migration de plus se réserve dans E4).

Tests : *IT pour chaque route et chaque code d'erreur ; tests unitaires de la clé de Luhn du SIRET, de la clé mod 97 de l'IBAN et du calcul de missing.

Règles d'exécution : L6.3 en entier (lecture du plan, version du contrat, verrou de verify, début et fin de tâche, fusion).

Livrable : PR « M15-06 Billing : réglages et IBAN », puis make log TASK=M15-06 AGENT=backend-module-dev STATUS=done SUMMARY="…" PR=<url>.
```

### M15-07 — Séances à facturer

```text
Tâche M15-07 — Séances à facturer (dépôt psymate-api, module billing). Utilise l'agent backend-module-dev. Dépend de M15-02, M15-04 et M15-06, fusionnées.

Contexte : lis docs/L-plan-facturation-api.md (Q86, Q87 ; L3.1 ; L4 billable_session ; L5.2). Code : clinical/api (SessionClosed, SessionFacade, EntryArchived), patients/api (billingIdentities), events/api (EventDeduplicator), un écouteur existant (directory/service/PractitionerStatusListener).

Objectif : écouteurs de SessionClosed (kind session seulement → pending, idempotent) et de EntryArchived (séance pending → dismissed) ; création à la demande par SessionFacade.closedSession ; les quatre routes de L5.2 ; calcul du tarif et de rateSource selon Q87 ; regroupement par patient, noms par billingIdentities.

Critères d'acceptation : une séance close apparaît dans la liste, une séance d'accueil ou de contact jamais ; rejouer l'événement ne crée pas de doublon ; dismiss puis restore ; dismiss juste après la clôture réussit même si l'événement n'est pas encore traité ; rateSource vaut session, patient, service ou none dans les quatre cas ; isolement entre praticiens ; ./mvnw verify vert ; contrat regénéré.

Interdits : lire une table de clinical ou de patients ; reprendre les séances closes avant la mise en service ; créer une ligne pour un rendez-vous.

Périmètre : src/main/java/com/psymate/billing/**, src/main/resources/messages_*.properties (clés billing.*), les tests de billing, contract/openapi.yaml et docs/generated/** (regénérés par make contract). Aucun autre module, aucune migration (si une colonne manque à V18, arrête-toi et dis-le : une migration de plus se réserve dans E4).

Tests : IT des deux écouteurs (dont le rejeu d'un événement), IT de chaque route, test unitaire du calcul du tarif (quatre sources).

Règles d'exécution : L6.3 en entier (lecture du plan, version du contrat, verrou de verify, début et fin de tâche, fusion).

Livrable : PR « M15-07 Billing : séances à facturer », puis make log TASK=M15-07 AGENT=backend-module-dev STATUS=done SUMMARY="…" PR=<url>.
```

### M15-08 — Factures : brouillons, liste

```text
Tâche M15-08 — Brouillons de facture et liste (dépôt psymate-api, module billing). Utilise l'agent backend-module-dev. Dépend de M15-07.

Contexte : lis docs/L-plan-facturation-api.md (Q84, Q87, Q88 ; L3 ; L4 invoice, invoice_line, invoice_event ; L5.3 jusqu'à DELETE).

Objectif : POST /api/invoices, POST /api/invoices/batch, GET /api/invoices (filtres, curseur, statut calculé en SQL par un fragment *NativeQueries), GET, PATCH, DELETE /api/invoices/{id}. Calculs de L3.2 ; nextNumberPreview ; bloc issuer d'un brouillon = réglages du moment ; événement d'historique draft_created ; séances passées à invoiced, rendues à pending quand une ligne part ou que le brouillon est supprimé.

Critères d'acceptation : chaque règle et chaque code de L5.3 (jusqu'à DELETE) a un IT ; le total d'un brouillon est toujours celui de L3.2, en centimes ; le lot est tout ou rien ; l'ordre de la liste est celui de L5.3 ; filtrer par chaque statut ; isolement entre praticiens ; ./mvnw verify vert ; contrat regénéré.

Interdits : émettre, numéroter, produire un PDF (M15-09) ; supprimer autre chose qu'un brouillon.

Périmètre : src/main/java/com/psymate/billing/**, src/main/resources/messages_*.properties (clés billing.*), les tests de billing, contract/openapi.yaml et docs/generated/** (regénérés par make contract). Aucun autre module, aucune migration (si une colonne manque à V18, arrête-toi et dis-le : une migration de plus se réserve dans E4).

Tests : tests unitaires des calculs de L3.2 (lignes, remise, TVA des trois régimes, arrondi), IT de chaque route et de chaque code, IT du lot tout ou rien, IT d'isolement entre praticiens.

Règles d'exécution : L6.3 en entier (lecture du plan, version du contrat, verrou de verify, début et fin de tâche, fusion).

Livrable : PR « M15-08 Billing : brouillons et liste », puis make log TASK=M15-08 AGENT=backend-module-dev STATUS=done SUMMARY="…" PR=<url>.
```

### M15-09 — Émission, numérotation, PDF

```text
Tâche M15-09 — Émettre une facture, la numéroter, produire son PDF (dépôt psymate-api, module billing). Utilise l'agent backend-module-dev. Dépend de M15-08.

Contexte : lis docs/L-plan-facturation-api.md (Q88, Q89, Q92, Q93 ; L3.3 ; L5.3 de issue à duplicate), clinical/export/service/PdfRenderer et HtmlRenderer (emploi d'openhtmltopdf, polices ; à lire, pas à modifier), les maquettes de la feuille dans ../psymate-web/docs/design/facturation/ (maquette.js, fonction paper ; facturation.css, classes .paper).

Objectif : POST /api/invoices/{id}/issue (verrou du compteur, expectedNumber, instantané issuer et recipient, date, échéance, alreadyPaid qui crée le paiement dans la même transaction), GET /api/invoices/by-number/{number}, GET /api/invoices/{id}/pdf (brouillon avec filigrane, émis depuis le fichier rangé chiffré, variante receipted), POST /api/invoices/{id}/duplicate. Moteur de rendu propre à billing, mise en page de la maquette (émetteur, titre et numéro, destinataire, dates, lignes, totaux, mention de TVA, modalités, pied), en clair, A4. Aucune modification d'une facture émise, par aucune route.

Critères d'acceptation : deux émissions concurrentes ne produisent ni doublon ni trou (IT avec deux transactions) ; 409 INVOICE_NUMBER_CHANGED porte le bon numéro ; la suite repart à 0001 au changement d'année de la date d'émission ; PATCH et DELETE d'une facture émise répondent 409 ; le PDF rangé ne change pas quand les réglages changent ensuite ; le PDF contient le numéro, le total, la mention du régime, et aucune autre donnée du dossier que les dates et désignations (IT qui extrait le texte) ; ./mvnw verify vert ; contrat regénéré.

Interdits : toucher à clinical.export ; une dépendance Maven ; un PDF rangé en clair.

Périmètre : src/main/java/com/psymate/billing/**, src/main/resources/messages_*.properties (clés billing.*), les tests de billing, contract/openapi.yaml et docs/generated/** (regénérés par make contract). Aucun autre module, aucune migration (si une colonne manque à V18, arrête-toi et dis-le : une migration de plus se réserve dans E4).

Tests : IT de concurrence sur le compteur, IT de chaque route et de chaque code, IT d'immuabilité (PATCH et DELETE refusés), IT du PDF (texte extrait par PDFBox, déjà présent avec openhtmltopdf), test unitaire du changement d'année.

Règles d'exécution : L6.3 en entier (lecture du plan, version du contrat, verrou de verify, début et fin de tâche, fusion).

Livrable : PR « M15-09 Billing : émission, numérotation, PDF », puis make log TASK=M15-09 AGENT=backend-module-dev STATUS=done SUMMARY="…" PR=<url>.
```

### M15-10 — Paiements, journal, export, chiffres

```text
Tâche M15-10 — Paiements, journal des encaissements, export et chiffres (dépôt psymate-api, module billing). Utilise l'agent backend-module-dev. Dépend de M15-09.

Contexte : lis docs/L-plan-facturation-api.md (Q90 ; L3.2 ; L4 payment ; L5.4).

Objectif : les sept routes de L5.4. paid_cents tenu dans la transaction ; statut et overdue recalculés ; totaux de période en SQL ; reçu en PDF à la demande ; export CSV (séparateur point-virgule, UTF-8 avec BOM, montants en euros à virgule) et PDF, sans nom par défaut ; summary et patients/{id}/billing.

Critères d'acceptation : chaque code de L5.4 a un IT ; un paiement partiel puis le solde donnent partial puis paid ; annuler un paiement rend le reste dû et garde la ligne ; les totaux d'une période de plusieurs pages sont ceux de toute la période ; l'export par défaut ne contient aucun nom ; overdue bascule le lendemain de l'échéance, au jour de Europe/Paris (horloge injectée) ; ./mvnw verify vert ; contrat regénéré.

Interdits : supprimer un paiement ; modifier un montant enregistré.

Périmètre : src/main/java/com/psymate/billing/**, src/main/resources/messages_*.properties (clés billing.*), les tests de billing, contract/openapi.yaml et docs/generated/** (regénérés par make contract). Aucun autre module, aucune migration (si une colonne manque à V18, arrête-toi et dis-le : une migration de plus se réserve dans E4).

Tests : IT de chaque route et de chaque code, IT des totaux sur plusieurs pages, IT de l'export (contenu du CSV, avec et sans nom), tests unitaires de overdue avec une horloge injectée.

Règles d'exécution : L6.3 en entier (lecture du plan, version du contrat, verrou de verify, début et fin de tâche, fusion).

Livrable : PR « M15-10 Billing : paiements, journal, chiffres », puis make log TASK=M15-10 AGENT=backend-module-dev STATUS=done SUMMARY="…" PR=<url>.
```

### M15-11 — Avoirs, envoi par e-mail

```text
Tâche M15-11 — Avoirs et envoi d'une facture par e-mail (dépôt psymate-api, module billing). Utilise l'agent backend-module-dev. Dépend de M15-10.

Contexte : lis docs/L-plan-facturation-api.md (Q91, Q94 ; L5.3 credit-notes et send ; L5.4 remboursement), directory/service/ContactMailer (forme d'un mailer, Reply-To), shared/ratelimit, testsupport/SharedMailpit et MailpitClient.

Objectif : POST /api/invoices/{id}/credit-notes (portée full ou lines, numérotation de la suite des avoirs, PDF à l'émission, credited_cents, refund_due_cents, facture void si total, séances rendues à pending), remboursement par POST /api/invoices/{creditNoteId}/payments ; POST /api/invoices/{id}/send (InvoiceMailer, modèles des réglages avec les variables {numéro}, {montant}, {reste dû}, {échéance}, PDF joint, plafond de 30 par heure et par praticien, événement d'historique sent).

Critères d'acceptation : avoir partiel, avoir total, avoir supérieur au reste dû (refundDue), ligne déjà créditée (409) ; la facture d'origine n'est jamais modifiée hors de ses compteurs ; le message reçu dans Mailpit a le bon destinataire, le Reply-To du praticien, le PDF joint et aucun autre contenu que le texte envoyé ; le 31e envoi de l'heure répond 429 ; aucune adresse dans les journaux ; ./mvnw verify vert ; contrat regénéré.

Interdits : un brouillon d'avoir ; un e-mail automatique ; un appel externe autre que le SMTP configuré.

Périmètre : src/main/java/com/psymate/billing/**, src/main/resources/messages_*.properties (clés billing.*), les tests de billing, contract/openapi.yaml et docs/generated/** (regénérés par make contract). Aucun autre module, aucune migration (si une colonne manque à V18, arrête-toi et dis-le : une migration de plus se réserve dans E4).

Tests : IT des quatre cas d'avoir, IT du remboursement, IT de l'envoi lu dans Mailpit (destinataire, Reply-To, pièce jointe), IT du plafond d'envoi.

Règles d'exécution : L6.3 en entier (lecture du plan, version du contrat, verrou de verify, début et fin de tâche, fusion).

Livrable : PR « M15-11 Billing : avoirs et envoi par e-mail », puis make log TASK=M15-11 AGENT=backend-module-dev STATUS=done SUMMARY="…" PR=<url>.
```

### M15-12 — Seed, tag de contrat, suivi

```text
Tâche M15-12 — Seed de la facturation, tag du contrat, suivi (dépôt psymate-api, tools/seed et racine). Utilise l'agent seed-perf. Dépend de M15-11.

Contexte : lis docs/L-plan-facturation-api.md (L5, L6.3 règle 2), tools/seed/README.md, AgendaScenario et AgendaSeeder (modèle), tools/tag-contract.sh.

Objectif : BillingScenario et BillingSeeder, par l'API seulement : pour chaque praticien de démonstration, réglages complets (SIRET factice valide, régime health_exempt), trois prestations, tarif pour une partie des patients, puis, à partir des séances closes du seed : des séances laissées à facturer, deux brouillons, des factures à régler, payée en partie, payées par chaque mode, une en retard, un avoir partiel, une facture annulée par un avoir total. Idempotent. Vérification dans Verifier. Version du contrat passée à 0.17.0 si elle ne l'est pas (L6.3 règle 2), tag contract-v0.17.0 posé par tools/tag-contract.sh et poussé.

Critères d'acceptation : make seed SIZE=small puis une seconde fois ne change rien ; GET /api/billing/summary du praticien de démonstration renvoie des chiffres non nuls dans chaque case ; chaque statut de L3.2 a au moins une facture ; le tag existe et info.version vaut 0.17.0 ; ./mvnw verify vert.

Périmètre : tools/seed/**, src/main/resources/application.yml (app.contract.version seulement), contract/openapi.yaml et ContractIT (regénérés), src/test/**/perf si un scénario de performance est ajouté. Aucun code de module.

Tests : tests unitaires de BillingScenario (déterministe, chaque statut présent), Verifier étendu.

Règles d'exécution : L6.3 en entier (lecture du plan, version du contrat, verrou de verify, début et fin de tâche, fusion).

Livrable : PR « M15-12 Facturation : seed et tag de contrat », puis make log TASK=M15-12 AGENT=seed-perf STATUS=done SUMMARY="…" PR=<url>. Le tag se pose après la fusion, sur le commit de main.
```

## L8. Prompts web

Manœuvre (H 2.7) : dans `psymate-web`, `git checkout main && git pull && claude --worktree <ID>`, coller le prompt (ou la phrase de lancement de L6.4). Un prompt par tâche ; M15-13 les corrige si le contrat fusionné s'écarte de L5. Fin de tâche commune : `pnpm lint`, `pnpm check:tokens`, `pnpm test`, `pnpm build`, e2e de la tâche, sous-agent `reviewer` avec le prompt de L9, PR avec le template, `pnpm progress:log` ; Auto-fix activé sur la PR ; la session fusionne elle-même en squash dès que la CI est verte et la revue sans point bloquant (même règle que L6.3 règle 4). Toute tâche d'écran suit `docs/design/arabe.md` (voir « État du web » en L6.2).

### M15-13 — Décisions, fiches et maquettes

```text
Tâche M15-13 — Inscrire la facturation dans la documentation de psymate-web et compléter les maquettes (docs/ et CLAUDE.md seulement ; aucun code d'application).

Contexte : lis CLAUDE.md, docs/L-plan-facturation.md en entier, docs/G-decisions.md (G13, Q67), les fiches docs/design/33 à 39 et les maquettes docs/design/facturation/ (index.html, 01 à 07, facturation.css, maquette.js), src/theme/tokens.css (habillage de l'application), docs/design/00-composants-partages.md, docs/C-plan.md (C13), docs/couverture-ecrans.md, docs/e2e-couverture.md.

Objectif :
- G13 : Q68 à Q70 de L2.1, à la suite de Q67.
- Fiches 33 à 39 : la section « Route & API attendue » devient « Route & API » et suit L5 (ou docs/api-reference.md si le contrat 0.17.0 est déjà tiré) ; chaque écart de L5.5 est reporté ; la ligne de l'agenda de la fiche 38 est marquée hors M15.
- Maquettes : dessiner chaque état des sections « Spécifié ici, pas dessiné dans la maquette » des fiches 33 à 39 (sans rien inventer : chaque état vient de la fiche et de L5), dans les pages existantes de docs/design/facturation/, mêmes feuille et script, clair et sombre ; captures régénérées dans captures/.
- C13 (déjà écrite) relue contre L6.2 ; docs/design/README.md, docs/couverture-ecrans.md, docs/e2e-couverture.md : lignes 33 à 39 ; CLAUDE.md : billing dans la liste des features et une ligne « Facturation : feature billing, fiches 33 à 39, docs/L-plan-facturation.md ; montants en centimes venus de l'API, jamais additionnés à l'écran (G Q69). »

Critères d'acceptation : aucune décision absente de L ou de G n'est inscrite ; chaque critère des fiches est vérifiable par un test ; les maquettes s'ouvrent par le serveur design-mockups, dans les trois thèmes ; aucune couleur hors des tokens ; pnpm lint vert.

Validation : l'utilisateur a demandé le 28 novembre 2026 que le jalon aille au bout sans son intervention ; les maquettes complétées font donc foi dès la fusion de cette PR, et la PR le dit en tête (« maquettes non relues par l'utilisateur »).

Interdits : tout code dans src/ ; inventer un champ que L5 ne porte pas.

Livrable : PR « M15-13 Facturation : décisions, fiches et maquettes », puis pnpm progress:log --task M15-13 --agent claude --status done --summary "…" --pr <url>.
```

### M15-14 — Contrat `0.17.0` et socle

```text
Tâche M15-14 — Passer le contrat à contract-v0.17.0 et poser le socle du module Facturation (dépôt psymate-web). Utilise l'agent frontend-feature-dev. C'est la tâche dédiée qui a le droit de modifier shared/ui/nav-rail, app.routes.ts et la configuration ESLint.

Contexte : lis CLAUDE.md, docs/L-plan-facturation.md (L2.1 Q68, L5, L6.2), docs/design/33-facturation-factures.md (« Cadre du module »), docs/design/00-composants-partages.md (rail de navigation, en-tête patient), G Q57 et la PR de M13-04 (précédent d'un changement de contrat). Code : tools/contract-pull.mjs, src/app/shared/ui/nav-rail/** et sa spec, src/app/app.routes.ts, eslint.config.mjs (PATIENT_FEATURES), src/app/features/agenda (modèle d'une feature de premier niveau), src/app/shared/ui/patient-header (dessin des onglets à reprendre dans la feature, sans le modifier).

Objectif : CONTRACT_TAG = contract-v0.17.0 et pnpm contract:pull ; le carreau « Facture » du rail devient un lien vers /facturation, actif sur /facturation/** (libellé inchangé, G Q67) ; route lazy /facturation dans app.routes.ts ; feature billing (index.ts, billing.routes.ts, en-tête de module avec les quatre onglets et « Nouvelle facture », quatre pages minimales à l'état « chargement », aucun appel d'API) ; billing dans PATIENT_FEATURES.

Critères d'acceptation : le carreau ouvre /facturation et porte aria-current ; les quatre onglets naviguent ; N ouvre /facturation/nouvelle ; admin n'importe pas billing (règle ESLint vérifiée par une fixture) ; le diff de src/app/api est la sortie du générateur ; les e2e du shell et de l'agenda restent verts ; axe-core 0 violation ; pnpm lint, check:tokens, test, build verts.

Interdits : un écran de données ; toucher à shared/ui/patient-header ; une dépendance npm.

Périmètre : CONTRACT_TAG, docs/contract/**, docs/api-reference.md, src/app/api/** (généré), src/app/shared/ui/nav-rail/**, src/app/app.routes.ts, eslint.config.mjs et tools/eslint/fixtures, src/app/features/billing/**, src/locale/messages.*.xlf, e2e/facturation/socle.spec.ts.

Tests : spec du rail (carreau relié, aria-current), spec de l'en-tête de module, fixture ESLint, e2e facturation/socle.

Livrable : PR « M15-14 Contrat 0.17.0 et socle de la facturation », puis pnpm progress:log --task M15-14 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M15-15 — Réglages de facturation

```text
Tâche M15-15 — Réglages de facturation (dépôt psymate-web, features/billing). Utilise l'agent frontend-feature-dev. Dépend de M15-14 (et de M15-13 pour les maquettes complétées).

Contexte : lis CLAUDE.md, docs/L-plan-facturation.md (L2.1 ; L2.2 Q89, Q92, Q95 ; L5.1), docs/design/39-facturation-reglages.md et sa maquette docs/design/facturation/07-reglages.html. Code : features/billing (socle de M15-14), features/account/pages/preferences.page.* et security.page.* (modèles d'une page de réglages et d'un dialogue qui demande le mot de passe), shared/forms (applyProblem, FieldErrorsComponent), shared/ui (panneau latéral, dialogue de confirmation, toast), docs/design/33-facturation-factures.md (cadre du module, statuts, règles communes), docs/design/29-etats.md, docs/design/00-composants-partages.md, src/theme/tokens.css (habillage de l'application), docs/api-reference.md. Reproduis la maquette à la lettre : n'invente ni champ, ni libellé, ni disposition (ouvre-la par le serveur design-mockups, http://localhost:4310/facturation/).

Objectif :
- data/billing-settings.api.ts, .model.ts, .store.ts (SignalStore, trois états, relecture après chaque écriture) ; data/money.ts (lecture d'une saisie « 60,00 », affichage par Intl.NumberFormat ; centimes vers l'API), créé ici.
- Page /facturation/reglages : sommaire à ancres, identité (champs verrouillés venus de l'API, SIRET, adresse, e-mail, téléphone), TVA (trois cartes à choix unique, champs du régime assujetti), numérotation (préfixes, prochain numéro, verrou), prestations et tarifs (tableau, panneau latéral ajouter / modifier / retirer, prestation par défaut), règlement (échéance, ordre des chèques, modes acceptés, coordonnées bancaires), modèles d'e-mail (panneau), aperçu de la feuille, barre d'enregistrement unique.
- IBAN : dialogue avec le mot de passe (PUT et DELETE /api/me/billing-settings/iban) ; jamais affiché en clair.
- Arrivée depuis un avertissement des fiches 33 et 35 (ancre de rubrique de la fiche 39) : rubrique en vue, focus sur le premier champ de missing.

Périmètre : src/app/features/billing/** (pages/settings, ui/settings, data/billing-settings.*, data/money.ts), src/locale/messages.*.xlf, e2e/facturation/reglages.spec.ts.

Critères d'acceptation :
- chaque critère de docs/design/39-facturation-reglages.md est couvert par un test nommé ;
- les codes 422 de L5.1 (SIRET_INVALID, IBAN_INVALID, VAT_RATE_REQUIRED, VAT_NUMBER_REQUIRED), 409 NUMBERING_LOCKED et SERVICE_IS_DEFAULT, 403 PASSWORD_INVALID s'affichent sur le champ ou le panneau concerné ;
- quitter avec des modifications non enregistrées demande confirmation ; la mention de TVA affichée est celle de l'API ;
- pnpm lint, pnpm check:tokens, pnpm test, pnpm build verts ; e2e de la tâche verts contre l'API réelle (seed small), avec axe-core, thèmes clair et sombre ; la PR liste les écarts fiche ↔ contrat constatés.

Tests : Vitest (store avec service de données simulé, money.ts, composants dans leurs trois états), e2e facturation/reglages.

Interdits : toucher à une autre feature, à core ou à shared (si un composant partagé manque, arrête-toi et dis-le) ; calculer à l'écran un total, un reste dû ou un statut ; une dépendance npm ; une couleur, un texte ou une URL d'API en dur ; un mock du backend dans un e2e.

Livrable : PR « M15-15 Facturation : réglages », puis pnpm progress:log --task M15-15 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M15-16 — Factures : liste, bandeau, filtre sur un patient

```text
Tâche M15-16 — Factures : liste, bandeau, filtre sur un patient (dépôt psymate-web, features/billing). Utilise l'agent frontend-feature-dev. Dépend de M15-15.

Contexte : lis CLAUDE.md, docs/L-plan-facturation.md (L2.1 ; L3.2 ; L5.3 (GET /api/invoices, DELETE, pdf) ; L5.4 (summary, patients/{id}/billing)), docs/design/33-facturation-factures.md, docs/design/38-facturation-dossier-patient.md (« Structure de la liste filtrée », « Interactions »), les maquettes docs/design/facturation/01-factures.html et 06-dossier-patient.html. Code : features/patients/pages/patient-list.page.* et ui/patient-table.component.* (ligne-lien, actions au survol, pagination par curseurs, cartes sous 600 px : même mécanique), docs/design/33-facturation-factures.md (cadre du module, statuts, règles communes), docs/design/29-etats.md, docs/design/00-composants-partages.md, src/theme/tokens.css (habillage de l'application), docs/api-reference.md. Reproduis la maquette à la lettre : n'invente ni champ, ni libellé, ni disposition (ouvre-la par le serveur design-mockups, http://localhost:4310/facturation/).

Objectif :
- data/invoices.api.ts, .model.ts, .store.ts ; data/billing-summary.*.
- Page /facturation : bandeau de quatre chiffres (bloc à part, ses trois états), filtres dans l'URL (?statut=, ?q=, ?depuis=), tableau avec les sept statuts (icône et mot), actions de ligne (Encaisser : lien vers la facture avec ?panneau=paiement tant que M15-18 n'a pas livré le panneau ; PDF ; menu), pagination Précédent / Suivant, état vide de première ouverture avec ce qui manque aux réglages, version sous 600 px.
- Filtre ?patient=:id : puce « Patient : … », carte du patient à la place du bandeau (GET /api/patients/{id}/billing), colonne Patient masquée, « Nouvelle facture » avec ?patient=.
- Suppression d'un brouillon avec le dialogue de confirmation partagé.

Périmètre : src/app/features/billing/** (pages/invoices, ui/invoices, data/invoices.*, data/billing-summary.*), src/locale/messages.*.xlf, e2e/facturation/factures.spec.ts et patient.spec.ts.

Critères d'acceptation :
- chaque critère de la fiche 33 et les critères de liste filtrée de la fiche 38 sont couverts par un test nommé ;
- l'ordre des lignes est celui de l'API ; « En retard » n'emploie jamais danger ; une facture annulée reste dans la liste, numéro barré ;
- ?patient= inconnu (404) : liste entière et toast ; la croix de la puce retire le paramètre et garde les autres filtres ;
- pnpm lint, pnpm check:tokens, pnpm test, pnpm build verts ; e2e de la tâche verts contre l'API réelle (seed small), avec axe-core, thèmes clair et sombre ; la PR liste les écarts fiche ↔ contrat constatés.

Tests : Vitest (stores, tableau, bandeau, trois états, statuts), e2e facturation/factures et facturation/patient.

Interdits : toucher à une autre feature, à core ou à shared (si un composant partagé manque, arrête-toi et dis-le) ; calculer à l'écran un total, un reste dû ou un statut ; une dépendance npm ; une couleur, un texte ou une URL d'API en dur ; un mock du backend dans un e2e.

Livrable : PR « M15-16 Facturation : factures », puis pnpm progress:log --task M15-16 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M15-17 — Nouvelle facture : éditeur d'un brouillon, émission

```text
Tâche M15-17 — Nouvelle facture : éditeur d'un brouillon, émission (dépôt psymate-web, features/billing). Utilise l'agent frontend-feature-dev. Dépend de M15-16.

Contexte : lis CLAUDE.md, docs/L-plan-facturation.md (L2.1 Q70 ; L3 ; L5.3 (POST, GET, PATCH, DELETE /api/invoices, issue, pdf) ; L5.1 (billing-services) ; L5.2 (billable-sessions?patientId=)), docs/design/35-facturation-editeur.md et sa maquette docs/design/facturation/03-editeur.html (feuille : maquette.js, fonction paper ; facturation.css, classes .paper). Code : features/billing (stores de M15-15 et M15-16), la liste à saisie assistée de patients de features/agenda/panels/new-appointment.panel.* (à reproduire dans billing, sans import), docs/design/33-facturation-factures.md (cadre du module, statuts, règles communes), docs/design/29-etats.md, docs/design/00-composants-partages.md, src/theme/tokens.css (habillage de l'application), docs/api-reference.md. Reproduis la maquette à la lettre : n'invente ni champ, ni libellé, ni disposition (ouvre-la par le serveur design-mockups, http://localhost:4310/facturation/).

Objectif :
- Routes /facturation/nouvelle (aucun POST avant le choix du patient ; ?patient= préremplit) et /facturation/brouillons/:id ; l'URL devient celle du brouillon après la première écriture.
- Éditeur : patient et destinataire (interrupteur « autre personne »), lignes (prestation, quantité, prix, retrait, « Ajouter une séance », « Ligne libre », « Remise »), date et échéance, « Déjà réglée » (mode, date), mention ; enregistrement automatique par PATCH, état « Enregistré à … » / « Non enregistré ».
- Aperçu de la feuille en HTML (composant ui/invoice-sheet réutilisé par M15-18), dessiné depuis la réponse de l'API, en clair dans les trois thèmes.
- Émission : dialogue avec nextNumberPreview, expectedNumber, 409 INVOICE_NUMBER_CHANGED (le dialogue affiche le nouveau numéro), 422 BILLING_SETTINGS_INCOMPLETE (bandeau, lien vers les réglages) ; « Envoyer aussi par e-mail » enchaîne POST send après l'émission (L5.5) ; succès : navigation vers /facturation/:numero.
- Suppression du brouillon ; brouillon introuvable.

Périmètre : src/app/features/billing/** (pages/editor, ui/editor, ui/invoice-sheet, data/invoice-draft.*), src/locale/messages.*.xlf, e2e/facturation/editeur.spec.ts.

Critères d'acceptation :
- chaque critère de la fiche 35 est couvert par un test nommé ;
- total, TVA et montants de ligne affichés sont ceux de la réponse de l'API après chaque PATCH ;
- la feuille reste en clair en thème sombre et ne montre aucune donnée du dossier hors dates et désignations ;
- pnpm lint, pnpm check:tokens, pnpm test, pnpm build verts ; e2e de la tâche verts contre l'API réelle (seed small), avec axe-core, thèmes clair et sombre ; la PR liste les écarts fiche ↔ contrat constatés.

Tests : Vitest (store du brouillon, enregistrement automatique, feuille, dialogue d'émission), e2e facturation/editeur.

Interdits : toucher à une autre feature, à core ou à shared (si un composant partagé manque, arrête-toi et dis-le) ; calculer à l'écran un total, un reste dû ou un statut ; une dépendance npm ; une couleur, un texte ou une URL d'API en dur ; un mock du backend dans un e2e.

Livrable : PR « M15-17 Facturation : nouvelle facture », puis pnpm progress:log --task M15-17 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M15-18 — Facture émise : paiement, avoir, envoi par e-mail

```text
Tâche M15-18 — Facture émise : paiement, avoir, envoi par e-mail (dépôt psymate-web, features/billing). Utilise l'agent frontend-feature-dev. Dépend de M15-17.

Contexte : lis CLAUDE.md, docs/L-plan-facturation.md (L2.2 Q88, Q90, Q91, Q94 ; L3 ; L5.3 (by-number, pdf, duplicate, credit-notes, send) ; L5.4 (payments, cancel, receipt)), docs/design/36-facturation-facture-emise.md et sa maquette docs/design/facturation/04-facture.html. Code : features/billing (ui/invoice-sheet de M15-17), shared/ui/side-panel (panneau de 480 px), le dialogue de confirmation partagé, docs/design/33-facturation-factures.md (cadre du module, statuts, règles communes), docs/design/29-etats.md, docs/design/00-composants-partages.md, src/theme/tokens.css (habillage de l'application), docs/api-reference.md. Reproduis la maquette à la lettre : n'invente ni champ, ni libellé, ni disposition (ouvre-la par le serveur design-mockups, http://localhost:4310/facturation/).

Objectif :
- Route /facturation/:numero (facture ou avoir), déclarée après les routes fixes ; ?panneau=paiement | avoir | envoi.
- Feuille (ui/invoice-sheet), rail : Règlement (progression, reste dû, action primaire), Paiements (reçu, annulation), Séances facturées, Historique.
- Panneau « Enregistrer un paiement » (montant plafonné au reste dû, modes acceptés, date, référence, note, encart de conséquence).
- Dialogue « Créer un avoir » (portée, lignes, motif, expectedNumber, 409, refundDue) ; page d'un avoir ; remboursement.
- Dialogue « Envoyer la facture » (modèle des réglages, relance si en retard) ; PDF, facture acquittée, duplication.
- L'action « Encaisser » de la liste (M15-16) ouvre désormais ce panneau.

Périmètre : src/app/features/billing/** (pages/invoice, ui/invoice, panels/payment, data/invoice.*, data/payments-write.*), src/locale/messages.*.xlf, e2e/facturation/facture.spec.ts.

Critères d'acceptation :
- chaque critère de la fiche 36 est couvert par un test nommé ;
- aucune action de modification ni de suppression n'existe sur un document émis ; après chaque écriture la facture est relue ;
- l'e-mail envoyé est lu dans Mailpit (destinataire, pièce jointe) ; axe-core 0 violation panneau et dialogues ouverts ;
- pnpm lint, pnpm check:tokens, pnpm test, pnpm build verts ; e2e de la tâche verts contre l'API réelle (seed small), avec axe-core, thèmes clair et sombre ; la PR liste les écarts fiche ↔ contrat constatés.

Tests : Vitest (store, panneau, dialogues, rail, trois états), e2e facturation/facture.

Interdits : toucher à une autre feature, à core ou à shared (si un composant partagé manque, arrête-toi et dis-le) ; calculer à l'écran un total, un reste dû ou un statut ; une dépendance npm ; une couleur, un texte ou une URL d'API en dur ; un mock du backend dans un e2e.

Livrable : PR « M15-18 Facturation : facture émise », puis pnpm progress:log --task M15-18 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M15-19 — À facturer

```text
Tâche M15-19 — À facturer (dépôt psymate-web, features/billing). Utilise l'agent frontend-feature-dev. Dépend de M15-18.

Contexte : lis CLAUDE.md, docs/L-plan-facturation.md (L2.2 Q86, Q87 ; L3.1 ; L5.2 ; L5.3 (POST /api/invoices, batch)), docs/design/34-facturation-a-facturer.md et sa maquette docs/design/facturation/02-a-facturer.html, docs/design/33-facturation-factures.md (cadre du module, statuts, règles communes), docs/design/29-etats.md, docs/design/00-composants-partages.md, src/theme/tokens.css (habillage de l'application), docs/api-reference.md. Reproduis la maquette à la lettre : n'invente ni champ, ni libellé, ni disposition (ouvre-la par le serveur design-mockups, http://localhost:4310/facturation/).

Objectif :
- data/billable.api.ts, .model.ts, .store.ts.
- Page /facturation/a-facturer : groupes par patient (case à trois états, tarif et rateSource de l'API, « Facturer »), lignes de séance, menu (changer le tarif, ouvrir la séance, ne pas facturer), groupe sans tarif, rail « Ce qui sera créé » et « Écartées », barre flottante de sélection, vue par date, ?vue= et ?jusqu= dans l'URL.
- « Créer n brouillons » (POST batch) puis relecture et toast ; « Facturer » un groupe ouvre l'éditeur ; 409 SESSION_ALREADY_INVOICED traité par relecture.
- Compteur de l'onglet « À facturer » lu dans summary.billableCount, relu après chaque écriture.

Périmètre : src/app/features/billing/** (pages/billable, ui/billable, data/billable.*), src/locale/messages.*.xlf, e2e/facturation/a-facturer.spec.ts.

Critères d'acceptation :
- chaque critère de la fiche 34 est couvert par un test nommé ;
- aucun titre, note ou contenu de séance n'est affiché ni demandé à l'API ;
- la sélection annonce son nombre et son total (région de statut) sans prendre le focus ;
- pnpm lint, pnpm check:tokens, pnpm test, pnpm build verts ; e2e de la tâche verts contre l'API réelle (seed small), avec axe-core, thèmes clair et sombre ; la PR liste les écarts fiche ↔ contrat constatés.

Tests : Vitest (store, sélection, barre flottante, trois états), e2e facturation/a-facturer.

Interdits : toucher à une autre feature, à core ou à shared (si un composant partagé manque, arrête-toi et dis-le) ; calculer à l'écran un total, un reste dû ou un statut ; une dépendance npm ; une couleur, un texte ou une URL d'API en dur ; un mock du backend dans un e2e.

Livrable : PR « M15-19 Facturation : à facturer », puis pnpm progress:log --task M15-19 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M15-20 — Paiements : journal et export

```text
Tâche M15-20 — Paiements : journal et export (dépôt psymate-web, features/billing). Utilise l'agent frontend-feature-dev. Dépend de M15-19.

Contexte : lis CLAUDE.md, docs/L-plan-facturation.md (L2.2 Q90 ; L5.4 (GET /api/payments, cancel, receipt, export)), docs/design/37-facturation-paiements.md et sa maquette docs/design/facturation/05-paiements.html. Code : features/patients/ui/save-file.ts (enregistrer un fichier téléchargé : même approche, sans import), docs/design/33-facturation-factures.md (cadre du module, statuts, règles communes), docs/design/29-etats.md, docs/design/00-composants-partages.md, src/theme/tokens.css (habillage de l'application), docs/api-reference.md. Reproduis la maquette à la lettre : n'invente ni champ, ni libellé, ni disposition (ouvre-la par le serveur design-mockups, http://localhost:4310/facturation/).

Objectif :
- data/payments.api.ts, .model.ts, .store.ts.
- Page /facturation/paiements : période, étendue et mode dans l'URL (?periode=, ?mode=), résumé (total et barres par mode, valeurs de totals), tableau avec pied de total, paiement annulé barré, remboursement négatif, actions (reçu, ouvrir la facture, annuler), pagination.
- Dialogue « Exporter le journal » (dates, format, identité : numéro seul par défaut), téléchargement du fichier.

Périmètre : src/app/features/billing/** (pages/payments, ui/payments, data/payments.*), src/locale/messages.*.xlf, e2e/facturation/paiements.spec.ts.

Critères d'acceptation :
- chaque critère de la fiche 37 est couvert par un test nommé ;
- total et répartition sont ceux de totals, liste de plusieurs pages comprise ; aucun bouton ne crée un paiement ici ;
- le fichier exporté par défaut ne contient aucun nom de patient (l'e2e lit le fichier) ;
- pnpm lint, pnpm check:tokens, pnpm test, pnpm build verts ; e2e de la tâche verts contre l'API réelle (seed small), avec axe-core, thèmes clair et sombre ; la PR liste les écarts fiche ↔ contrat constatés.

Tests : Vitest (store, résumé, tableau, dialogue, trois états), e2e facturation/paiements.

Interdits : toucher à une autre feature, à core ou à shared (si un composant partagé manque, arrête-toi et dis-le) ; calculer à l'écran un total, un reste dû ou un statut ; une dépendance npm ; une couleur, un texte ou une URL d'API en dur ; un mock du backend dans un e2e.

Livrable : PR « M15-20 Facturation : paiements », puis pnpm progress:log --task M15-20 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M15-21 — Fiche patient

```text
Tâche M15-21 — Tarif, adresse de facturation et lien vers les factures dans la fiche patient (dépôt psymate-web, features/patients). Utilise l'agent frontend-feature-dev. Dépend de M15-16.

Contexte : lis CLAUDE.md, docs/L-plan-facturation.md (Q87, L5.1 billing-profile, L5.4 patients/{id}/billing), docs/design/38-facturation-dossier-patient.md (Points d'entrée 1), docs/design/16-fiche-patient.md. Code : features/patients/pages/patient-form.page.*, ui/patient-form.ts, data/patient.api.ts et patient.model.ts (champ followUp.fee, texte libre).

Objectif : le champ « Tarif » de la rubrique Suivi lit et écrit billing-profile.rate (saisie en euros, centimes vers l'API) ; l'ancien texte followUp.fee n'est plus envoyé ni modifié et, s'il existe sans tarif enregistré, s'affiche en aide sous le champ (« Ancienne valeur : … ») ; adresse de facturation et destinataire tiers ; ligne « Facturation » (reste dû de patients/{id}/billing, lien « Voir les factures » vers /facturation?patient=:id), sur une fiche existante seulement.

Critères d'acceptation : ceux de la fiche 38 pour la fiche patient ; enregistrer la fiche puis la rouvrir montre le tarif ; un échec de billing-profile ne perd pas le reste de la fiche et s'affiche sur le champ ; aucun import de features/billing ; e2e avec axe-core ; pnpm lint, check:tokens, test, build verts.

Périmètre : src/app/features/patients/**, src/locale/messages.*.xlf, e2e/facturation/fiche-patient.spec.ts.

Tests : Vitest (patient.api, store, formulaire), e2e facturation/fiche-patient.

Interdits : importer features/billing ; modifier core ou shared ; écrire followUp.fee.

Livrable : PR « M15-21 Fiche patient : tarif et facturation », puis pnpm progress:log --task M15-21 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

### M15-22 — Clôture de séance

```text
Tâche M15-22 — Deux cases de facturation dans le panneau de clôture de séance (dépôt psymate-web, features/patient-shell). Utilise l'agent frontend-feature-dev. Dépend de M15-19.

Contexte : lis CLAUDE.md, docs/L-plan-facturation.md (Q86, L5.2 dismiss, L5.3 POST /api/invoices et issue avec alreadyPaid, L5.5), docs/design/38-facturation-dossier-patient.md (Points d'entrée 2). Code : features/patient-shell/panels/close-session.panel.ts, data/patient-shell.store.ts et .api.ts.

Objectif : « Ajouter à À facturer » (cochée par défaut si un tarif s'applique, absente pour une séance d'accueil) ; décochée, le store appelle dismiss après la clôture réussie ; « Réglée en séance » révèle le mode de paiement puis, après la clôture, crée la facture de la séance et l'émet acquittée. Un échec de facturation après une clôture réussie ne défait pas la clôture : toast d'avertissement avec un lien vers « À facturer ».

Critères d'acceptation : ceux de la fiche 38 pour la clôture ; la clôture seule reste un seul appel quand les cases sont dans leur état par défaut ; e2e des trois cas avec axe-core ; aucun import de features/billing ; pnpm lint, check:tokens, test, build verts.

Périmètre : src/app/features/patient-shell/**, src/locale/messages.*.xlf, e2e/facturation/cloture.spec.ts.

Tests : Vitest (panneau, store), e2e facturation/cloture.

Interdits : importer features/billing ; modifier core ou shared ; toucher à la forme de l'appel de clôture.

Livrable : PR « M15-22 Clôture de séance : facturation », puis pnpm progress:log --task M15-22 --agent frontend-feature-dev --status done --summary "…" --pr <url>.
```

## L9. Revue

API (à coller après chaque tâche M15-02 à M15-12) :

```text
Lance le sous-agent reviewer sur cette branche pour la tâche <ID>. En plus de sa liste habituelle, vérifie : (1) que billing n'importe que identity.api, patients.api, clinical.api, events.api et shared, et qu'aucun module n'importe billing ; (2) que chaque critère de L7 <ID> a un test nommé ; (3) qu'aucun montant n'est un décimal, dans le code comme dans le contrat ; (4) qu'aucune route ne modifie ni ne supprime une facture émise, un avoir ou un paiement (hors cancelled_at) ; (5) qu'aucun nom de patient, montant, IBAN ou adresse e-mail n'est journalisé, et que l'IBAN n'est ni en base ni dans une réponse ; (6) qu'aucun texte clinique n'entre dans billing ; (7) que chaque lecture et écriture est filtrée par praticien, avec un test d'isolement ; (8) que la version du contrat suit L6.3 règle 2 et que contract/openapi.yaml correspond à L5. Corrige ce qu'il marque bloquant, relance-le, puis make log.
```

Web (identique pour chaque tâche M15-14 à M15-22) :

```text
Relis le diff de cette branche contre main pour la tâche <ID>, sans rien modifier. Vérifie, dans l'ordre : le périmètre de fichiers du prompt (une seule feature ; shared/ui/nav-rail, app.routes.ts et src/app/api seulement dans M15-14) ; la conformité à la fiche et à G Q67 à Q70 (aucun montant ni statut calculé à l'écran, relecture après écriture, aucun montant hors du module et de la ligne de la fiche patient, « En retard » jamais en danger, aucune action de modification sur une facture émise) ; la fidélité à la maquette ; les six couches ; aucun texte, couleur ou URL en dur ; trois états par bloc ; chaque critère couvert par un test qui échouerait sans le code ; e2e contre l'API réelle avec axe-core ; aucune dépendance npm non annoncée. Classe chaque remarque en bloquant ou non bloquant.
```

## L10. Ce qui reste ouvert

Proposé par ce plan et **non relu par l'utilisateur** (le jalon a été lancé à sa demande le 28 novembre 2026, sans relecture) : les décisions Q83 à Q95, en particulier les centimes entiers (Q84), le tarif du patient rangé dans `billing` et non dans la fiche (Q87), le PDF figé à l'émission (Q93), le plafond de 30 e-mails par heure (Q94), le mot de passe exigé pour l'IBAN (Q95) ; la règle de version du contrat (L6.3) ; l'ordre des écrans web (L6.2).

À trancher par l'utilisateur :

- **Reprise de l'existant.** Les séances closes avant la mise en service n'entrent pas dans « À facturer ». Une reprise (par exemple les séances du mois en cours) demanderait une façade de lecture de plus dans `clinical`.
- **Ancien champ « Tarif » de la fiche patient** (`follow_up.fee`, texte libre) : M15-21 l'affiche en aide et ne le convertit pas. Le supprimer de la base est une autre décision.
- **Ligne « Facturation » de l'agenda** : hors M15 tant qu'un rendez-vous n'est pas relié à sa séance.
- **Nom d'expéditeur des e-mails** : même question que K10.

À faire valider par un expert-comptable ou un juriste (aucune tâche ne le tranche) :

- **Mentions obligatoires** d'une facture et d'un avoir pour un psychologue et pour un coach, textes des deux mentions de TVA, facture acquittée, numérotation par année.
- **Durée de conservation** des factures et des paiements, et ce que devient ce module à la suppression d'un compte.
- **E-mail au patient** : base légale, mention d'information ; hébergement de données de santé (une facture de psychologue nominative en est une).
