# Écran 31 · Prise de rendez-vous publique

> Spécification pour agents. Maquette : `31-prise-de-rendez-vous-publique.html` (toutes les vues, thèmes clair et sombre, 1440 et 390 px ; captures `31-prise-de-rendez-vous-publique.png` et `captures-m14-09/`). Habillage : Fluent 2 (les valeurs sont dans la maquette ; le code n'emploie que les tokens de `src/theme/tokens.css`). Jalon M14, plan `docs/K-plan-prise-de-rendez-vous.md` (K3.1 étapes 1 à 4, K5.1), décisions G Q60 à Q63 (G12). API : jalon M14 de psymate-api, module `agenda`, contrat `contract-v0.15.0`. Tâche web : **M14-12**.
>
> Écrite le 22 novembre 2026 (M14-09). Le contrat l'emporte sur cette fiche ; G l'emporte sur tout.

## Objectif
Un **visiteur sans compte** choisit un créneau offert par un praticien, laisse son prénom, son nom, son e-mail et, s'il le veut, son téléphone, puis envoie sa demande. Rien n'entre dans l'agenda du praticien à ce stade : le visiteur doit d'abord ouvrir le lien reçu par e-mail (fiche 32). La page dit, **avant** l'envoi, si le praticien répondra lui-même ou si le rendez-vous sera confirmé d'office (G Q61), et rappelle que PsyMate n'est pas un service d'urgence (G Q63).

## Route & module
- Route publique : `/praticiens/:slug/rendez-vous`, feature **`public`** (G Q60), chargée à la demande, layout public (bandeau et pied de la fiche 00 §4), **non prérendue**, `noindex` (G Q62), titre d'onglet « Prendre rendez-vous · PsyMate ».
- Entrée : bouton « Prendre rendez-vous » de la fiche du praticien (fiche 09, complément M14).
- Le créneau choisi peut vivre dans l'URL (`?creneau=<instant UTC>`) ; **jamais** le prénom, le nom, l'e-mail ni le téléphone (G Q62). Rien du demandeur n'est écrit dans `localStorage` ni `sessionStorage` : l'état du formulaire vit dans le composant.
- Store : `BookingStore` (SignalStore, `features/public/data`) : réglages publics, créneaux de la fenêtre affichée, chacun avec ses trois états. L'étape, le créneau choisi, la saisie et l'état de l'envoi sont de l'état d'écran, dans le composant.

## Données (contrat `contract-v0.15.0`, routes publiques sans session, `Cache-Control: no-store`)

| Appel | Réponse | Erreurs traitées par l'écran |
| --- | --- | --- |
| `GET /api/public/booking/practitioners/{slug}` | `200 PublicBookingDto { slug, displayName, confirmation: manual \| auto, slotDurationMin, modalities[], timezone, minNoticeHours, horizonDays }` | `404 BOOKING_NOT_AVAILABLE` → redirection vers `/praticiens/:slug` ; `429 RATE_LIMITED` |
| `GET /api/public/booking/practitioners/{slug}/slots?from&to` | `200 PublicSlotsDto { timezone, slots: [{ startsAt, endsAt }] }`, instants UTC triés, **seulement les créneaux offerts** ; liste vide si aucun n'est libre ou si la fenêtre est passée ou au-delà de l'horizon | `404 BOOKING_NOT_AVAILABLE` → redirection ; `422` (`to` `INVALID_VALUE`, `from` / `to` `INVALID_FORMAT`, `WINDOW_TOO_LARGE`) : ne se produit pas si l'écran borne sa fenêtre, traité comme une erreur de chargement ; `429` |
| `POST /api/public/booking/practitioners/{slug}/requests` | `202` sans corps | `400 MALFORMED_REQUEST` ; `404 BOOKING_NOT_AVAILABLE` ; `409 SLOT_NOT_AVAILABLE` ; `422 VALIDATION_FAILED` avec `errors[] { field, code, message }` ; `429 RATE_LIMITED` (`Retry-After`, `retryAfterSeconds`) |

Corps de la demande, `CreateBookingRequest` : `startsAt` (exactement le `startsAt` d'un créneau reçu), `modality` (`in_person` \| `video` \| `phone`, parmi `modalities`), `firstName` (obligatoire, 100 au plus), `lastName` (obligatoire, 100), `email` (obligatoire, 320, format e-mail), `phone` (facultatif, 30 ; chiffres, espaces, `+`, point, tiret, parenthèses, au moins un chiffre ; chaîne vide = aucun), `locale` (`fr` \| `en`, la locale de l'application), `consent` (doit valoir `true`), `website` (pot de miel, toujours vide), `formShownAt` (instant d'affichage du formulaire, comme le formulaire de contact de la fiche 09).

Règles tenues par le serveur, que l'écran ne recalcule pas : découpe des plages en créneaux, délai minimal, horizon, chevauchements. **L'écran n'affiche que les créneaux reçus et n'en calcule aucun.** Le `202` est le même quel que soit le sort de la demande (acceptée, ou ignorée en silence : pot de miel, formulaire envoyé en moins de 3 s, plafond d'e-mails) : l'écran ne peut pas le savoir et ne doit pas le laisser croire.

## Structure
Colonne unique centrée de **720 px** au plus dans le layout public (16 px de marge sous 760 px). De haut en bas :

1. **Fil d'Ariane** : Annuaire › *nom du praticien* (lien vers `/praticiens/:slug`) › Prendre rendez-vous. Le contrat de cette page ne donne ni la profession ni la ville : le fil n'a que ces trois niveaux.
2. **Carte d'en-tête** :
   - `<h1>` « Prendre rendez-vous avec {displayName} » ;
   - ligne de faits : « Créneaux de {slotDurationMin} min » · modalités offertes en clair (« Au cabinet », « En visio », « Par téléphone », dans l'ordre du contrat) ;
   - **phrase du mode** (G Q61), dans un encart d'information, texte exact :
     - `manual` : « Le praticien vous répondra par e-mail. Votre demande n'est pas encore un rendez-vous. »
     - `auto` : « Votre rendez-vous sera confirmé dès que vous aurez validé votre adresse e-mail. »
3. **Mention d'urgence** (G Q63), bandeau placé **au-dessus de l'action principale** de chaque vue, texte exact : « PsyMate n'est pas un service d'urgence. En cas d'urgence, appelez le 112 (urgences) ou le 3114 (prévention du suicide). » Les numéros sont des liens `tel:` et viennent de `public-facts.ts` ; les libellés sont dans `$localize`. Ce n'est pas le pied de page de G Q20, qui reste sans numéros.
4. **Étape 1 · « Choisissez un créneau »** (carte) :
   - indication « Étape 1 sur 2 » ;
   - période affichée : « Du {premier jour} au {dernier jour} » et **fuseau nommé** : « Heures du praticien : {timezone} ({nom long du fuseau par `Intl`}) », par exemple « Europe/Paris (heure normale d'Europe centrale) » ;
   - boutons « Semaines précédentes » et « Semaines suivantes » ;
   - créneaux **groupés par jour**, un jour par ligne (« jeudi 26 novembre » puis ses heures), dans l'ordre de l'API ; seuls les jours qui ont au moins un créneau sont listés ; chaque créneau est un bouton qui porte l'heure de début (« 10:00 »), en chiffres à chasse fixe.
5. **Étape 2 · « Vos coordonnées »** (carte, à la place de l'étape 1 une fois un créneau choisi) :
   - indication « Étape 2 sur 2 » ;
   - rappel du créneau : « {jour, date} · {début} – {fin} ({timezone}) » et bouton « Changer de créneau » ;
   - phrase « Tous les champs sont obligatoires, sauf le téléphone. » ;
   - champs, libellé au-dessus : « Prénom », « Nom » (côte à côte à partir de 600 px), « E-mail » (aide : « Un lien de vérification sera envoyé à cette adresse. »), « Téléphone (facultatif) » ;
   - **Modalité** : groupe de boutons radio quand `modalities` en compte plusieurs (aucune présélection si plusieurs) ; une seule modalité : une ligne de texte « Modalité : au cabinet », sans contrôle, et la valeur est envoyée ;
   - case de consentement : « J'accepte que mes coordonnées soient transmises à {displayName} pour traiter ma demande de rendez-vous. En savoir plus sur la protection des données » (lien vers `/confidentialite`, nouvel onglet annoncé) ;
   - pot de miel `website`, invisible et hors tabulation, comme le formulaire de contact ;
   - rappel de la phrase du mode (même texte qu'en 2), juste au-dessus du bouton ;
   - bouton principal : « Envoyer ma demande » (`manual`) ou « Réserver ce créneau » (`auto`).
6. **Écran d'attente** (à la place de la carte d'en-tête et des étapes après un `202` ; le fil d'Ariane reste, la mention d'urgence passe sous la carte, au-dessus du lien de retour) : `<h1>` « Consultez votre boîte mail », « Le lien est valable 30 minutes. » (durée lue dans `public-facts.ts`), rappel du créneau demandé et de la modalité, « Tant que vous n'avez pas ouvert ce lien, rien n'est transmis au praticien. », « Rien reçu ? Regardez dans le courrier indésirable, puis refaites une demande. », lien « Revenir à la fiche de {displayName} ». **Aucun champ « motif », aucun champ libre** (G Q72 de l'API), ici comme à l'étape 2. L'écran n'affiche ni le nom ni l'adresse saisis.
7. **Pied public** de la fiche 00.

## États

| État | Déclencheur | Ce que montre l'écran |
| --- | --- | --- |
| Chargement | réglages ou créneaux en cours | `shared/ui/state` `loading` : squelette de la carte d'en-tête et de quatre lignes de créneaux, `aria-busy` |
| Créneaux | `slots` non vide | étape 1 |
| Aucun créneau | `slots: []` | dans la carte de l'étape 1 : « Aucun créneau disponible pour l'instant », « Vous pouvez écrire au praticien pour convenir d'un rendez-vous. », lien « Écrire au praticien » vers `/praticiens/:slug#contact` ; les boutons de période restent |
| Fonction non offerte | `404 BOOKING_NOT_AVAILABLE` (réglages, créneaux ou envoi) | **redirection** vers `/praticiens/:slug`, sans message : la fiche affiche son propre état (elle peut elle-même répondre 404) |
| Erreur de chargement | réseau, `5xx`, `422` de la fenêtre | `shared/ui/state` `error` : « Les créneaux n'ont pas pu être chargés. », « Vérifiez votre connexion, puis réessayez. », bouton « Réessayer » |
| Créneau plus disponible | `409 SLOT_NOT_AVAILABLE` à l'envoi | retour à l'étape 1, créneaux **relus**, avertissement en tête de carte : « Ce créneau n'est plus disponible. Choisissez-en un autre : vos coordonnées sont conservées. » ; la saisie est gardée dans le composant et réapparaît à l'étape 2 |
| Champs à corriger | validation de forme, ou `422` | message sous chaque champ ; pour un `422`, résumé `pm-form-errors` en tête du formulaire, qui reçoit le focus |
| Plafond atteint | `429` à l'envoi | sous le formulaire : « Trop de demandes envoyées depuis votre connexion. Réessayez dans {n} min. » (`retryAfterSeconds` arrondi à la minute supérieure) ; saisie conservée |
| Envoi en cours | requête partie | « Envoi en cours… » (`role="status"`), bouton inactif |
| Échec d'envoi | réseau, `5xx`, `400` | « La demande n'a pas pu être envoyée. Votre saisie est conservée : réessayez dans un instant. » |
| Envoyée | `202` | écran d'attente, identique quel que soit le sort de la demande |

Messages de forme (ceux de `shared/forms`) : « Ce champ est obligatoire. », « Adresse e-mail invalide. », « Au plus {n} caractères. », « Format invalide. » (téléphone) ; consentement : « Cochez cette case pour envoyer votre demande. » ; modalité non choisie : « Choisissez une modalité. ».

## Interactions
- **Fenêtre de créneaux** : deux semaines à la fois. Première fenêtre : d'aujourd'hui (dans `timezone`) à aujourd'hui + 13 jours. « Semaines suivantes » avance de 14 jours ; il est inactif quand le premier jour de la fenêtre suivante dépasse aujourd'hui + `horizonDays`. « Semaines précédentes » est inactif sur la première fenêtre. Une fenêtre ne dépasse jamais 31 jours. Chaque changement de fenêtre relit les créneaux.
- **Choisir un créneau** : passe à l'étape 2 et porte le focus sur le titre de l'étape. `formShownAt` est l'instant où le formulaire s'affiche.
- **Changer de créneau** : revient à l'étape 1, saisie conservée.
- **Envoi** : la forme est vérifiée d'abord (aucune requête si un champ obligatoire est vide, si l'e-mail est mal formé ou si le consentement n'est pas coché) ; le focus va sur le premier champ en erreur.
- **Après un `409`** : la liste est relue, jamais corrigée localement ; le créneau perdu n'y figure plus.
- **Heures** : toujours dans le fuseau du praticien (`timezone` de la réponse), quelle que soit l'heure du navigateur ; `Intl` avec la locale de l'application.
- Rien n'est mémorisé : recharger la page efface la saisie (G Q62).

## Tokens
- Surfaces : page `surface-ground`, cartes `surface-raised` avec `border-subtle`, rayon `radius-xl`, ombre `shadow-2`.
- Encart du mode : `info-bg`, icône `info`, texte `text-primary`. Mention d'urgence : `warning-bg`, icône `warning`, texte `text-primary`, liens `tel:` soulignés en `text-primary` ; **jamais rouge**.
- Créneau : bouton à contour (`surface-raised`, `border-strong`, `text-primary`), 40 px de haut et 72 px de large au moins ; survol `border-accessible` ; choisi : `primary` / `primary-on`.
- Bouton principal : plein `primary` ; « Changer de créneau », « Semaines … » : contour. Champs : contour, 40 px, rayon `radius-md`. Erreurs : `danger` et icône, jamais la couleur seule.
- Typographie : `h1` Title 3 (24 / 32, 600) ; titres d'étape Subtitle 1 (20 / 28, 600) ; texte Body 1 (14 / 20) ; aides Caption 1 (12 / 16) ; heures en police à chasse fixe.

## Accessibilité
- Un seul `<h1>` par vue ; les étapes sont des `<section aria-labelledby>` titrées en `<h2>` ; les jours sont des `<h3>`.
- Chaque créneau est un `<button>` dont le nom accessible dit le jour et les heures (« jeudi 26 novembre, 10:00 à 11:00 ») ; les créneaux d'un jour sont dans une liste.
- Le fuseau est écrit en toutes lettres, jamais donné par une icône seule.
- Formulaire : `<label for>` sur chaque champ, `autocomplete` (`given-name`, `family-name`, `email`, `tel`), erreurs reliées par `aria-describedby`, `fieldset` + `legend` pour la modalité ; l'avertissement « Ce créneau n'est plus disponible » et le message de plafond sont en `role="alert"`.
- Mention d'urgence : `role="note"`, lisible avant l'action principale dans l'ordre du document.
- Tout se fait au clavier ; cibles de 24 px au moins ; tient à 390 px et à 200 % de zoom, sans défilement horizontal.

## Critères d'acceptation
- [ ] Sur `/praticiens/claire-martin`, « Prendre rendez-vous » mène à `/praticiens/claire-martin/rendez-vous` ; la page porte `noindex` et le titre « Prendre rendez-vous · PsyMate ».
- [ ] Les créneaux affichés sont exactement ceux de `GET …/slots`, dans le même ordre, groupés par jour, à l'heure de `timezone` (le test compare l'écran à la réponse, avec un navigateur réglé sur un autre fuseau) ; le nom du fuseau est écrit à l'écran.
- [ ] La phrase du mode est celle de `manual` sur `claire-martin` et celle de `auto` sur `karim-haddad`, avec les textes exacts de G Q61 ; le bouton d'envoi dit « Envoyer ma demande » puis « Réserver ce créneau ».
- [ ] La mention « PsyMate n'est pas un service d'urgence » et les numéros 112 et 3114 précèdent, dans le document, les boutons de créneau, le bouton d'envoi et le lien de l'écran d'attente.
- [ ] « Semaines précédentes » est inactif sur la première fenêtre ; « Semaines suivantes » l'est quand la fenêtre suivante commencerait après aujourd'hui + `horizonDays` ; chaque fenêtre demandée fait 14 jours.
- [ ] Une fenêtre sans créneau affiche « Aucun créneau disponible pour l'instant » et le lien vers `/praticiens/:slug#contact`.
- [ ] `404 BOOKING_NOT_AVAILABLE` (slug sans prise de rendez-vous) redirige vers `/praticiens/:slug`.
- [ ] Envoi complet : la requête porte `startsAt` (celui du créneau choisi), `modality`, `firstName`, `lastName`, `email`, `consent = true`, `formShownAt`, `locale`, et `website` vide ; l'écran d'attente s'affiche ; un e-mail arrive dans Mailpit.
- [ ] Champ obligatoire vide, e-mail mal formé ou consentement non coché : aucune requête, message sous le champ, focus sur le premier champ en erreur.
- [ ] `409 SLOT_NOT_AVAILABLE` (test du store et de la page, service simulé) : retour à l'étape 1, texte « Ce créneau n'est plus disponible », créneaux relus par un nouveau `GET`, saisie retrouvée à l'étape 2.
- [ ] `422` simulé sur `email` : message sous le champ et résumé en tête ; `429` simulé : message avec le délai, saisie conservée.
- [ ] Après l'envoi, ni `localStorage`, ni `sessionStorage`, ni l'URL ne contiennent le prénom, le nom, l'e-mail ou le téléphone saisis (e2e).
- [ ] Le formulaire n'a ni champ « motif » ni zone de texte libre (le test compte les champs).
- [ ] Trois états du bloc des créneaux (chargement, vide, erreur avec « Réessayer ») ; parcours complet au clavier ; axe-core 0 violation, thèmes clair et sombre, 390 px et zoom 200 %.

## Points ouverts (repris de K10)
- **Numéros d'urgence** : 112 (urgences, Europe) et 3114 (numéro national français de prévention du suicide), posés par M14-09, **à valider par l'utilisateur**, comme la liste par pays ; ils vivent dans `public-facts.ts`.
- **Texte du consentement et mention d'information** : à faire valider par un juriste ou un DPO (rôles au sens du RGPD, hébergement de données de santé, durées de conservation).
- **Mineurs** : aucune date de naissance n'est demandée.
- **Nom d'expéditeur des e-mails** : celui de l'API, inchangé.

## Écarts entre K et le contrat `0.15.0`
- K3.1 écrivait « Ce créneau vient d'être pris » : le texte est « Ce créneau n'est plus disponible » (`409` sert aussi quand le créneau n'est plus offert pour une autre raison).
- K3.1 nomme le bouton voisin « Écrire au praticien » : dans l'application, il s'appelle « Prendre contact » (fiche 09) ; le lien de l'état vide garde « Écrire au praticien ».
- K5.1 ne citait ni le `400 MALFORMED_REQUEST` de l'envoi, ni le `429` des deux lectures, ni les `422` de la fenêtre (`INVALID_VALUE`, `INVALID_FORMAT`) : ils existent dans le contrat.
- `404 BOOKING_NOT_AVAILABLE` couvre aussi « aucune plage ouverte ».
- Une fenêtre passée ou au-delà de l'horizon rend `slots: []`, pas une erreur.
- Le prompt de M14-12 écrit « Semaine précédente » : la fenêtre recule de deux semaines, le bouton dit « Semaines précédentes ».

## Hors périmètre V1
Compte patient ; choix d'un motif ou d'un type de consultation ; paiement ; liste d'attente ; plusieurs lieux ; déplacement du rendez-vous par le demandeur ; affichage des créneaux pris ; rappel par SMS ; carte ou itinéraire.
