# Écran 32 · Rendez-vous par lien (vérification de l'e-mail, gestion)

> Spécification pour agents. Maquette : `32-rendez-vous-par-lien.html` (une vue par état, thèmes clair et sombre, 1440 et 390 px ; captures `32-rendez-vous-par-lien.png` et `captures-m14-09/`). Habillage : Fluent 2 (les valeurs sont dans la maquette ; le code n'emploie que les tokens de `src/theme/tokens.css`). Jalon M14, plan `docs/K-plan-prise-de-rendez-vous.md` (K3.1 étapes 5 à 7, K3.3, K3.4, K5.1), décisions G Q60 à Q63 (G12). API : jalon M14 de psymate-api, module `agenda`, contrat `contract-v0.15.0`. Tâche web : **M14-13**.
>
> Écrite le 22 novembre 2026 (M14-09). Le contrat l'emporte sur cette fiche ; G l'emporte sur tout.

## Objectif
Deux pages qu'un demandeur **sans compte** ouvre depuis un e-mail. La première valide son adresse : c'est à ce moment, et pas avant, que sa demande entre dans l'agenda du praticien. La seconde lui montre où en est son rendez-vous et lui permet de l'annuler. Chaque réponse de l'API a sa vue, avec une phrase qui dit ce qui s'est passé et ce qu'il peut faire.

## Routes & module
- `/rendez-vous/confirmer/:token` : suite du lien de vérification (valable 30 minutes).
- `/rendez-vous/gerer/:token` : lien de gestion. Le contrat ne lui donne **aucune échéance** : il répond tant que la demande n'est pas purgée (30 jours après la fin ou l'annulation du rendez-vous), puis `404 BOOKING_TOKEN_INVALID`. Chaque e-mail de suivi qui porte un lien remplace le précédent. Il n'y a **pas d'état « expiré »** pour ce lien : un lien purgé ou remplacé donne la vue « Lien inconnu ».
- Feature **`public`** (G Q60), chargées à la demande, layout public (bandeau et pied de la fiche 00 §4), **non prérendues**, `noindex` (G Q62). Titres d'onglet : « Votre demande de rendez-vous · PsyMate » et « Votre rendez-vous · PsyMate ».
- Le jeton n'est lu **que** dans le chemin, n'est envoyé **que** dans le corps d'un `POST`, n'est jamais écrit dans `localStorage` ni `sessionStorage`, ni dans l'URL d'une requête vers `/api` (G Q62). La navigation vers la page porte forcément le jeton dans son chemin : pour qu'il ne parte dans aucun en-tête `Referer`, les deux pages posent `<meta name="referrer" content="no-referrer">` (par le même mécanisme que `noindex`, `pages/page-meta.ts`, balise retirée quand la page est quittée) et les liens sortants de ces pages (annuaire, fiche du praticien, créneaux) portent `rel="noreferrer"`. La feature `auth` n'est pas importée (la fiche 25 est un modèle à lire, pas un code à réutiliser).
- Store : celui de la fiche 31 (`features/public/data`), étendu : `verification` et `managed`, chacun avec ses trois états ; l'ouverture du dialogue d'annulation est de l'état d'écran.

## Données (contrat `contract-v0.15.0`, routes publiques sans session, `Cache-Control: no-store`)

Corps des trois appels : `BookingTokenRequest { token }` (200 caractères au plus).

| Appel | Réponse | Erreurs |
| --- | --- | --- |
| `POST /api/public/booking/requests/verify` | `200 PublicAppointmentDto`, avec `manageToken` à la première vérification réussie, `manageToken: null` ensuite | `404 BOOKING_TOKEN_INVALID` ; `410 BOOKING_TOKEN_EXPIRED` ; `404 BOOKING_NOT_AVAILABLE` ; `409 BOOKING_ALREADY_ACTIVE` ; `409 SLOT_TAKEN` ; `422` (`token` `REQUIRED` ou `OUT_OF_RANGE`) ; `429 RATE_LIMITED` |
| `POST /api/public/booking/manage` | `200 PublicAppointmentDto` (`manageToken` toujours `null`) | `404 BOOKING_TOKEN_INVALID` ; `422` ; `429` |
| `POST /api/public/booking/manage/cancel` | `200 PublicAppointmentDto` (annulé, ou déjà annulé) | `404 BOOKING_TOKEN_INVALID` ; `409 APPOINTMENT_NOT_ACTIVE` (rendez-vous commencé ou terminé) ; `422` ; `429` |

`PublicAppointmentDto { status: pending | confirmed | cancelled | past, cancelledBy: visitor | practitioner | expired | null, startsAt, endsAt, durationMin, modality, practitioner: { slug, displayName }, canCancel, manageToken }`. Il ne porte ni le nom, ni l'e-mail, ni le téléphone du demandeur, ni aucune note : les pages n'en affichent donc aucun.

Ce que le contrat fixe et que les pages respectent :
- `verify` vérifie dans cet ordre : jeton inconnu (`404`), déjà vérifié (`200`), expiré (`410`), fonction plus offerte (`404`), rendez-vous déjà actif (`409`), créneau plus offert (`409`). Une demande **déjà vérifiée** répond donc `200` avec l'état courant, **même après les 30 minutes** : la page rechargée plus tard n'affiche pas « lien expiré ».
- `practitioner.slug` et `practitioner.displayName` valent `null` quand la fiche n'est plus publiée : la page affiche alors le rendez-vous **sans nom de praticien et sans lien vers sa fiche**.
- `manageToken` et `cancelledBy` valent `null` plutôt que d'être absents.
- Les réponses d'erreur (`ProblemDetail`) ne portent pas le slug du praticien : un état d'erreur ne peut pas renvoyer vers ses créneaux, il renvoie vers l'annuaire.
- `PublicAppointmentDto` ne porte pas de fuseau : les heures sont affichées dans le **fuseau du navigateur**, nommé à l'écran.

## Structure commune
Une carte de **520 px** au plus, centrée dans le layout public (comme la fiche 25), une seule vue à la fois :
1. Pictogramme de l'état (décoratif), `<h1>`, une ou deux phrases.
2. **Détail du rendez-vous**, quand une réponse `200` le donne : liste de définitions « Praticien » (lien vers `/praticiens/{slug}` ; ligne absente si `slug` est `null`), « Date », « Heure » (début – fin, suivi du fuseau : « heure de votre appareil, Europe/Paris »), « Durée », « Modalité » (« Au cabinet », « En visio », « Par téléphone »).
3. **Mention d'urgence** (G Q63), au-dessus de l'action principale, même bandeau et même texte que la fiche 31 : « PsyMate n'est pas un service d'urgence. En cas d'urgence, appelez le 112 (urgences) ou le 3114 (prévention du suicide). »
4. Action principale de la vue, puis liens secondaires.

## Vues de `/rendez-vous/confirmer/:token`

| Vue | Réponse | Titre et texte | Action |
| --- | --- | --- | --- |
| Vérification en cours | requête partie | squelette de la carte (`shared/ui/state` `loading`), annoncé « Vérification de votre adresse… » | — |
| Demande transmise | `200`, `status = pending` | « Votre demande est transmise » · « Le praticien vous répondra par e-mail. Votre demande n'est pas encore un rendez-vous. » + détail | « Gérer ma demande » → `/rendez-vous/gerer/{manageToken}` si `manageToken` n'est pas `null` ; sinon la phrase « Pour suivre ou annuler votre demande, utilisez le lien de l'e-mail que nous vous avons envoyé. » |
| Rendez-vous confirmé | `200`, `status = confirmed` | « Votre rendez-vous est confirmé » · « Vous recevez un e-mail de confirmation avec le lien pour le gérer. » + détail | « Gérer mon rendez-vous », ou la même phrase de repli |
| Déjà traité, annulé | `200`, `status = cancelled` (lien rouvert) | « Ce rendez-vous est annulé » + cause (voir « Annulé » ci-dessous) + détail | « Choisir un autre créneau » → `/praticiens/{slug}/rendez-vous` si `slug` n'est pas `null` |
| Déjà traité, passé | `200`, `status = past` (lien rouvert) | « Ce rendez-vous est passé » + détail | — |
| Lien expiré | `410 BOOKING_TOKEN_EXPIRED` | « Ce lien n'est plus valable » · « Le lien de vérification est valable 30 minutes : celui-ci a expiré. Aucune demande n'a été transmise au praticien. » | « Retrouver le praticien dans l'annuaire » → `/annuaire` |
| Lien inconnu | `404 BOOKING_TOKEN_INVALID`, ou `422` sur `token` | « Ce lien n'est plus valable » · « Nous ne reconnaissons pas ce lien : il est peut-être incomplet, ou la demande a été effacée. » | « Retrouver le praticien dans l'annuaire » |
| Créneau plus disponible | `409 SLOT_TAKEN` | « Ce créneau n'est plus disponible » · « Aucun rendez-vous n'a été créé. Choisissez un autre créneau sur la page du praticien. » | « Retrouver le praticien dans l'annuaire » |
| Rendez-vous déjà actif | `409 BOOKING_ALREADY_ACTIVE` | « Vous avez déjà un rendez-vous à venir avec ce praticien » · « Aucune nouvelle demande n'a été créée. Pour suivre ou annuler votre rendez-vous, utilisez le lien du dernier e-mail reçu. » | — |
| Fonction fermée | `404 BOOKING_NOT_AVAILABLE` | « Ce praticien ne propose plus la prise de rendez-vous en ligne » · « Aucun rendez-vous n'a été créé. » | « Retrouver le praticien dans l'annuaire » |
| Plafond atteint | `429` | « La vérification n'a pas abouti » · avertissement « Trop de tentatives depuis votre connexion. Réessayez dans {n} min. » (`retryAfterSeconds` arrondi à la minute supérieure) | « Réessayer » |
| Erreur | réseau, `5xx` | « La vérification n'a pas abouti » · « Vérifiez votre connexion, puis réessayez : votre lien reste valable. » | « Réessayer » (le même appel : `verify` est idempotent) |

## Vues de `/rendez-vous/gerer/:token`

| Vue | Réponse | Titre, état et texte | Action |
| --- | --- | --- | --- |
| Chargement | requête partie | `shared/ui/state` `loading` | — |
| En attente de réponse | `200`, `status = pending` | « Votre demande de rendez-vous » · pastille « En attente de réponse » · « Le praticien vous répondra par e-mail. » + détail | « Annuler ma demande » si `canCancel` |
| Confirmé | `200`, `status = confirmed` | « Votre rendez-vous » · pastille « Confirmé » + détail | « Annuler mon rendez-vous » si `canCancel` |
| Annulé | `200`, `status = cancelled` | « Votre rendez-vous » · pastille « Annulé » · cause selon `cancelledBy` : `visitor` « Vous avez annulé ce rendez-vous. » ; `practitioner` « Le praticien a annulé ce rendez-vous. » ; `expired` « La demande a expiré : le praticien n'a pas répondu à temps. » + détail | « Choisir un autre créneau » → `/praticiens/{slug}/rendez-vous` si `slug` n'est pas `null` ; aucun bouton d'annulation |
| Passé | `200`, `status = past` | « Votre rendez-vous » · pastille « Passé » + détail | aucun bouton d'annulation |
| Confirmation d'annulation | clic sur le bouton d'annulation | dialogue partagé (`shared/ui/confirm-dialog`) : « Annuler ce rendez-vous ? » (ou « Annuler cette demande ? ») · « Le praticien sera prévenu par e-mail. Pour un autre créneau, il faudra refaire une demande. » | « Annuler le rendez-vous » (ou « Annuler la demande ») · « Garder » ; **aucun motif demandé** |
| Trop tard pour annuler | `409 APPOINTMENT_NOT_ACTIVE` à l'annulation | message `role="alert"` : « Ce rendez-vous a commencé ou est terminé : il ne peut plus être annulé. », puis état relu | — |
| Annulation en échec | réseau ou `5xx` sur `manage/cancel` | l'état affiché ne change pas (pastille, détail et bouton d'annulation restent) ; message `role="alert"` sous le titre : « L'annulation n'a pas pu être enregistrée. » | « Réessayer » dans le message (renvoie l'annulation, sans rouvrir le dialogue) |
| Annulation, plafond atteint | `429` sur `manage/cancel` | l'état affiché ne change pas ; avertissement `role="alert"` : « L'annulation n'a pas pu être enregistrée. Trop de tentatives depuis votre connexion : réessayez dans {n} min. » (`retryAfterSeconds` arrondi à la minute supérieure) | le bouton d'annulation reste |
| Annulation, lien remplacé | `404 BOOKING_TOKEN_INVALID` sur `manage/cancel` | « Ce lien n'est plus valable » · « Votre rendez-vous n'a pas été annulé depuis cette page. Utilisez le lien du dernier e-mail reçu. » | « Retrouver le praticien dans l'annuaire » |
| Lien inconnu | `404 BOOKING_TOKEN_INVALID`, ou `422` sur `token` | « Ce lien n'est plus valable » · « Utilisez le lien du dernier e-mail reçu. » | « Retrouver le praticien dans l'annuaire » |
| Plafond atteint | `429` | « Votre rendez-vous n'a pas pu être chargé » · avertissement « Trop de tentatives depuis votre connexion. Réessayez dans {n} min. » | « Réessayer » |
| Erreur | réseau, `5xx` | « Votre rendez-vous n'a pas pu être chargé » · « Vérifiez votre connexion, puis réessayez. » | « Réessayer » |

## Interactions
- **Vérification** : la page envoie le jeton une seule fois par affichage, sans geste du visiteur. Recharger renvoie le même appel et affiche le même état, sans second rendez-vous.
- **« Gérer ma demande » / « Gérer mon rendez-vous »** : construit avec le `manageToken` de la réponse, qui n'existe que dans la mémoire de la page ; il n'est écrit nulle part ailleurs que dans le lien.
- **Annuler** : dialogue de confirmation ; « Garder » ferme sans rien changer ; la confirmation appelle `POST …/manage/cancel`, puis **relit l'état** par `POST …/manage` (jamais de correction locale) ; le focus revient sur le titre, la pastille passe à « Annulé ».
- **Pas de modification** : le demandeur annule et refait une demande (K1). Aucun bouton « Déplacer ».
- Dates par `Intl` avec la locale de l'application, dans le fuseau du navigateur.

## Tokens
- Carte `surface-raised`, `border-subtle`, `radius-xl`, `shadow-2`, sur `surface-ground`.
- Pictogramme d'état sur un carré de 48 px : succès `success` / `success-bg` ; attente et information `info` / `info-bg` ; lien invalide, créneau indisponible, plafond `warning` / `warning-bg` ; annulé et passé : neutre `text-secondary` / `surface-sunken`. **Jamais rouge** sur ces pages, sauf le bouton de confirmation du dialogue d'annulation (`danger`).
- Pastilles d'état (`radius-pill`) : « En attente de réponse » `info`, « Confirmé » `success`, « Annulé » et « Passé » neutres ; le libellé porte l'information, la couleur l'accompagne.
- Mention d'urgence : comme la fiche 31 (`warning-bg`, icône `warning`, texte `text-primary`).
- Typographie : `h1` Title 3 (24 / 32, 600) ; détail en Body 1 ; termes de la liste en `text-secondary` ; dates et heures en police à chasse fixe.

## Accessibilité
- Un `<h1>` par vue ; à l'arrivée d'une réponse, le focus va sur le `<h1>` (`tabindex="-1"`) et l'état est annoncé (`role="status"` pour un succès, `role="alert"` pour un refus).
- Détail en `<dl>` ; la pastille d'état est du texte.
- Dialogue d'annulation : `role="dialog"`, `aria-modal`, piège de focus, `Échap` = « Garder », retour du focus au bouton.
- Mention d'urgence en `role="note"`, avant l'action principale dans l'ordre du document.
- Tout se fait au clavier (ordre et touches : critères d'acceptation) ; à 390 px et à 720 px de large (l'équivalent d'un zoom de 200 % sur 1440 px), aucun défilement horizontal : `scrollWidth <= clientWidth` sur l'élément racine.

## Critères d'acceptation
- [ ] Parcours réel, mode manuel : demande sur `claire-martin`, lien lu dans Mailpit, la page affiche « Votre demande est transmise », le détail (date, heure, durée, modalité, praticien) et « Gérer ma demande » ; le test lit `POST …/requests/verify` avec le jeton **dans le corps**.
- [ ] Parcours réel, mode automatique : même parcours sur `karim-haddad`, la page affiche « Votre rendez-vous est confirmé ».
- [ ] Recharger la page de vérification affiche le même état, sans second rendez-vous (un seul dans `GET /api/agenda`), et sans lien de gestion construit (`manageToken: null` → phrase de repli).
- [ ] Chaque erreur de `verify` a sa vue (tests de page, service simulé) : `410` « Ce lien n'est plus valable » avec la phrase des 30 minutes ; `404 BOOKING_TOKEN_INVALID` avec la phrase « Nous ne reconnaissons pas ce lien » ; `409 SLOT_TAKEN` « Ce créneau n'est plus disponible » ; `409 BOOKING_ALREADY_ACTIVE` ; `404 BOOKING_NOT_AVAILABLE` ; `429` avec le délai ; erreur réseau avec « Réessayer ».
- [ ] `verify` qui répond `200` avec `status = cancelled` ou `past` affiche cet état, pas « lien expiré ».
- [ ] Gestion : pour chacun des quatre `status`, la pastille et le titre correspondent à la réponse ; `cancelledBy` donne la bonne phrase pour ses trois valeurs.
- [ ] `practitioner.slug = null` : ni ligne « Praticien », ni lien vers une fiche, ni « Choisir un autre créneau ».
- [ ] Annuler : le dialogue s'ouvre ; « Garder » n'envoie aucune requête ; confirmer envoie `POST …/manage/cancel` puis `POST …/manage`, et la pastille devient « Annulé » ; un rendez-vous annulé ou passé (`canCancel = false`) n'a pas de bouton d'annulation.
- [ ] `409 APPOINTMENT_NOT_ACTIVE` à l'annulation : message, puis état relu.
- [ ] Échecs de l'annulation (tests de page, service simulé) : réseau ou `5xx` → « L'annulation n'a pas pu être enregistrée. », bouton « Réessayer » qui renvoie `POST …/manage/cancel`, pastille inchangée ; `429` → le même début de phrase et le délai en minutes ; `404 BOOKING_TOKEN_INVALID` → « Ce lien n'est plus valable ».
- [ ] Lien de gestion inconnu : « Ce lien n'est plus valable » et « Utilisez le lien du dernier e-mail reçu. ».
- [ ] Le jeton n'apparaît ni dans `localStorage`, ni dans `sessionStorage`, ni dans l'URL d'aucune requête vers `/api`, ni dans leur en-tête `Referer` : le test e2e inspecte l'URL et les en-têtes de chaque requête `/api` émise depuis ces pages.
- [ ] Les deux pages portent `noindex` et `<meta name="referrer" content="no-referrer">` ; les liens de la carte portent `rel="noreferrer"` ; la balise a disparu une fois la page quittée.
- [ ] Un lien de gestion purgé ou remplacé (`404`) donne la vue « Lien inconnu » ; aucune vue ne dit « expiré » pour ce lien.
- [ ] La mention « PsyMate n'est pas un service d'urgence », avec le 112 et le 3114, précède l'action principale sur les deux pages.
- [ ] Aucune page ne propose de modifier le rendez-vous ni ne demande un motif d'annulation.
- [ ] Parcours d'annulation au clavier seul (garde `keyboardOnly`), dans cet ordre : à l'arrivée de la réponse le focus est sur le `<h1>` ; Tab atteint le lien du praticien, les liens 112 et 3114, puis « Annuler mon rendez-vous » ; Entrée ou Espace ouvre le dialogue, focus dans le dialogue ; Tab ne sort pas du dialogue ; Échap le ferme sans requête et rend le focus au bouton ; rouvert, Entrée sur « Annuler le rendez-vous » envoie l'annulation, puis le focus est sur le `<h1>` et la pastille dit « Annulé ».
- [ ] axe-core 0 violation, thèmes clair et sombre, dialogue ouvert compris ; à 390 px et à 720 px de large (équivalent 200 % sur 1440), aucun défilement horizontal : `scrollWidth <= clientWidth`.

## Points ouverts (repris de K10)
- **Numéros d'urgence** : 112 (urgences, Europe) et 3114 (numéro national français de prévention du suicide), **à valider par l'utilisateur**, comme la liste par pays ; ils vivent dans `public-facts.ts`.
- **Nom d'expéditeur des e-mails** : celui de l'API, inchangé ; les pages n'en dépendent pas.
- **Durées de conservation** (K3.5) et mention d'information : à faire valider par un juriste ou un DPO ; les pages ne les affichent pas.

## Écarts entre K et le contrat `0.15.0`
- **Slug inconnu en cas d'erreur** : K3.1 et le prompt de M14-13 prévoyaient « un lien vers les créneaux » après un créneau perdu. Les réponses d'erreur ne portent pas le praticien : le lien mène à l'annuaire.
- **`verify` idempotent après l'échéance** : K5.1 écrivait « tant que le jeton est valable ». Le contrat répond `200` pour toute demande déjà vérifiée ; `410` ne concerne qu'une demande jamais vérifiée.
- **« Ce créneau n'est plus disponible »** remplace « vient d'être pris » : `409 SLOT_TAKEN` couvre aussi un créneau qui n'est plus offert.
- **`practitioner`** : `slug` et `displayName` peuvent être `null` ; `manageToken` et `cancelledBy` sont `null` plutôt qu'absents.
- **`confirmed`** couvre un rendez-vous à venir **ou en cours** ; `canCancel` est faux dès que le rendez-vous a commencé, et `409 APPOINTMENT_NOT_ACTIVE` vaut pour « commencé ou terminé » (K : « passé »).
- **`422` sur `token`** et **`429`** existent sur les trois routes ; K5.1 ne les citait pas.
- **Lien de gestion sans échéance** : K2.1 Q80 dit « valable jusqu'à la fin du rendez-vous » ; le contrat ne fixe aucune échéance, le lien cesse de répondre à la purge de la demande (30 jours après la fin ou l'annulation) et répond alors `404 BOOKING_TOKEN_INVALID` (note en K10).
- **Lien de gestion après un refus** : les e-mails sans lien (refus, annulation, expiration) laissent le dernier lien valable ; le demandeur peut encore y lire « Annulé ».
- **Refus ou annulation par le praticien** : `cancelledBy = practitioner` dans les deux cas ; la page ne peut pas les distinguer et dit « Le praticien a annulé ce rendez-vous. ».

## Hors périmètre V1
Déplacement du rendez-vous par le demandeur ; motif d'annulation ; ajout à un agenda (fichier `.ics`) ; renvoi du lien de gestion depuis la page ; compte patient ; rappel avant le rendez-vous.
