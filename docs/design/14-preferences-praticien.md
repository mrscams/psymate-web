# Écran 14 · Mon compte › Préférences praticien

> Spécification pour agents. Maquette : `14-preferences-praticien.html` / `.png`. Palette : Nordique. Document A, module `identity` (`practitioner.preferences JSONB`, `/api/me/preferences`, M1-12) ; `vocabulary` pour les émotions personnalisées ; M6-04 pour le thème.
>
> Mis à jour le 29 octobre 2026 (G) : `sessions.defaultDurationMin` vaut **60** par défaut ; `locale` `fr` par défaut, l'anglais pouvant être incomplet (Q23) ; promotion d'une émotion custom au vocabulaire global = V2 (Q8).
>
> Mis à jour le 11 novembre 2026 (UX-F1, audit UX du 9 novembre) : maquette alignée sur le délai de correction de 1 h 15 (G Q31) ; résumé « Compte et sécurité » limité à ce que le contrat fournit (trois tuiles, connexion précédente sans ville ni lien de journal). Voir « Écarts avec la maquette ».
>
> Mis à jour le 22 novembre 2026 (M14-09, jalon M14, G Q64) : section « Prise de rendez-vous en ligne » et ses huit clés `booking.*` (contrat `contract-v0.15.0`). Maquette de la section : `propositions-2026-11/14-preferences-prise-de-rendez-vous.html` ; la maquette `14-preferences-praticien.html` n'est pas modifiée. Voir « Prise de rendez-vous en ligne (M14) ».
>
> Mis à jour le 23 novembre 2026 (M16-29, ouverture de l'arabe, G Q80) : `locale` admet `ar` (contrat `contract-v0.16.0`) ; le choix de langue propose Français, English et العربية, chacune écrite dans sa langue (l'option arabe porte `lang="ar"` et `dir="rtl"`). Sur `main`, l'option anglaise affiche « English », sans mention « traduction partielle » : inchangé.

## Objectif
Un seul endroit pour tout ce qui est mémorisé **par compte** et retrouvé sur tous les appareils : affichage, vocabulaire, émotions personnalisées, sécurité. Chaque réglage s'enregistre immédiatement.

## Route & module
- Route : `/mon-compte/preferences`.
- API : `GET /api/me/preferences` → objet plat ; `PATCH /api/me/preferences` (merge JSON RFC 7396, clés inconnues ignorées). Clés V1 :
  | Clé | Valeurs | Défaut |
  |---|---|---|
  | `overview.view` | `simple` \| `complete` | `simple` |
  | `overview.window` | `30d` \| `90d` \| `12m` | `90d` |
  | `timeline.groupBy` | `session` \| `month` \| `chronological` | `session` |
  | `theme` | `light` \| `soft` \| `dark` \| `system` | `light` |
  | `locale` | `fr` \| `en` \| `ar` | `fr` |
  | `vocabulary.subjectLabel` | `patient` \| `client` | selon profession (`coach` → `client`) |
  | `entryTypes.medicationVisible` | bool | `psychiatrist` → true, sinon false |
  | `entries.defaultVisibility` | `clinical` \| `private` | `clinical` |
  | `sessions.defaultDurationMin` | 15–180 | 60 (G) |
  | `booking.enabled` (M14) | bool | `false` |
  | `booking.confirmation` (M14) | `manual` \| `auto` | `manual` |
  | `booking.windows` (M14) | liste de `{ day: 1–7 (lundi = 1), start: "HH:mm", end: "HH:mm" }`, minutes multiples de 5, fin après le début, 21 plages au plus, sans chevauchement le même jour | `[]` |
  | `booking.slotDurationMin` (M14) | 15–180, multiple de 5 | 60 |
  | `booking.minNoticeHours` (M14) | 1–168 | 24 |
  | `booking.horizonDays` (M14) | 7–90 | 28 |
  | `booking.modalities` (M14) | sous-ensemble non vide, sans doublon, de `in_person`, `video`, `phone` | `["in_person"]` |
  | `booking.timezone` (M14) | identifiant IANA | `Europe/Paris` |
- Store : `PreferencesStore` chargé au login, mis à jour de façon optimiste, repli sur la dernière valeur serveur en cas d'erreur ; `localStorage.prefs` = cache de démarrage uniquement.
- Les bascules présentes ailleurs (vue d'ensemble, fenêtre, regroupement timeline) écrivent **les mêmes clés** : une seule source de vérité.
- Délai de correction sans version (1 h 15, G Q31) : affiché en lecture seule, fixé par `versioning.grace-period` côté serveur en V1.

## Structure
1. **Barre d'application** + **navigation du compte** (Préférences actif).
2. **Affichage** : vue d'ensemble par défaut (Simple / Complète), fenêtre d'analyse (30 j / 90 j / 1 an), timeline (Par séance / Par mois / Chronologique), thème (Clair / Doux / Sombre / Système, avec vignette), langue (Français ; Anglais avec la mention « traduction partielle » tant que les fichiers EN sont en retard ; العربية depuis M16-29).
3. **Vocabulaire et saisie** : désignation (Patient·e / Client·e), type médicament visible (interrupteur), visibilité par défaut (Clinique / Privée), durée de séance par défaut (60 min), délai de correction (lecture seule).
3 bis. **Prise de rendez-vous en ligne** (M14) : entre « Vocabulaire et saisie » et « Émotions personnalisées ». Détail dans la section du même nom ci-dessous.
4. **Émotions personnalisées · n** : tableau (émotion, famille avec pastille couleur, nombre d'utilisations, statut *custom*), lien « Gérer la liste complète » (page dédiée, écran 17 : ajouter, renommer, fusionner ; la promotion au vocabulaire global est V2).
5. **Compte et sécurité** (résumé) : trois tuiles : **e-mail de connexion** (`GET /api/auth/me`) avec *Modifier* ; **double authentification** (état lu dans `twoFactorEnabled` de `GET /api/auth/me`, lien *Codes de secours* sans compteur) ; **sessions actives** (« n appareils », nombre de `sessions[]` de `GET /api/me/security`, action *Déconnecter les autres* = `POST /api/auth/sessions/revoke-others`). Sous les tuiles : « Connexion précédente : date · appareil » (`lastLogin` de `GET /api/me/security`, sans ville) ; lien « Tout voir » vers l'écran 18. Pas de lien « Journal de sécurité » (hors contrat, fiche 18).

## Prise de rendez-vous en ligne (M14, ajouté le 22 novembre 2026)
Complément de M14-09 (plan `docs/K-plan-prise-de-rendez-vous.md` K3.2 étape 1, K2.1 Q75 pour les bornes ; G Q64) ; construit par **M14-11**, à reproduire depuis `propositions-2026-11/14-preferences-prise-de-rendez-vous.html`. Les huit clés `booking.*` entrent dans `core/preferences` avec la PR de contrat (M14-10) ; cette section les lit et les écrit par `PreferencesStore`, sans rien stocker ailleurs.

### Structure de la section
Carte `aria-labelledby`, même gabarit que les autres sections (lignes libellé + aide à gauche, contrôle à droite ; empilées sous 760 px).
1. **En-tête de carte** : titre « Prise de rendez-vous en ligne » ; à droite, lien « Voir ma page de rendez-vous » vers `/praticiens/<slug>/rendez-vous` (nouvel onglet annoncé), **visible seulement quand la fonction est offerte**. Elle l'est quand **quatre** conditions sont vraies : `booking.enabled`, au moins une plage enregistrée, profil public publié, **praticien approuvé**. L'écran lit « approuvé » dans le statut de vérification de la session (`verificationStatus = approved`, `SessionStore` de `core/auth`, déjà chargé), sans nouvel appel.
2. **Ligne d'état** (`role="status"`), une phrase :
   - désactivée : « Désactivée : votre fiche publique n'a pas de bouton « Prendre rendez-vous ». »
   - offerte (les quatre conditions) : « Proposée sur votre fiche publique. »
   - activée, avec des plages, profil publié, praticien non approuvé : pas de ligne d'état ni de lien ; le bandeau d'état global de la fiche 00 §1 dit déjà où en est le dossier professionnel.
   - activée sans plage : « La prise de rendez-vous n'est pas proposée tant qu'il n'y a pas de plage. »
   - activée, avec des plages, profil non publié : pas de ligne d'état, le bandeau ci-dessous la remplace.
3. **Bandeau « profil non publié »** (information, quand le profil public n'est pas publié, que la fonction soit activée ou non) : « Votre profil public n'est pas publié : la prise de rendez-vous ne sera proposée qu'une fois le profil publié. » + lien « Mon profil public » (`/mon-compte/profil-public`). **Tous les réglages restent modifiables**, l'interrupteur compris (G Q64).
4. **Activation** (`booking.enabled`) : aide « Ajoute le bouton « Prendre rendez-vous » à votre fiche publique. » ; interrupteur « Proposer la prise de rendez-vous en ligne ».
5. **Confirmation des demandes** (`booking.confirmation`) : deux boutons radio, chacun avec sa phrase :
   - « Je valide chaque demande » · « Chaque demande attend votre réponse dans l'agenda. Sans réponse sous 72 h, elle est annulée et le demandeur est prévenu. » (`manual`, défaut) ;
   - « Acceptation automatique dans mes plages » · « Le rendez-vous est confirmé dès que le demandeur a validé son adresse e-mail. » (`auto`).
6. **Plages ouvertes** (`booking.windows`) : aide « Les créneaux proposés sont découpés dans ces plages, à partir de leur début. » ; **éditeur de plages** en pleine largeur sous le libellé (composant `ui/preferences/booking-windows-editor`) :
   - sept lignes, lundi à dimanche ; chaque ligne : le jour, ses plages dans l'ordre, puis « Ajouter une plage » ;
   - une plage = deux champs texte à chasse fixe, « Début » et « Fin », au format `HH:MM` (comme le formulaire « Déplacer » de l'agenda), et un bouton « Retirer » ;
   - un jour sans plage affiche « Aucune plage » ;
   - pied de l'éditeur : compteur « n plages sur 21 », bouton **« Enregistrer les plages »** (inactif tant que rien n'a changé ou qu'une plage est invalide), bouton « Annuler les modifications » (visible quand il y a des changements), indicateur « Enregistré » ;
   - sous l'éditeur, en information, quand la fonction est activée et qu'aucune plage n'est enregistrée : « Ajoutez au moins une plage pour que la prise de rendez-vous soit proposée. »
7. **Durée d'un créneau** (`booking.slotDurationMin`) : champ nombre + « min » ; aide « De 15 à 180 minutes, par pas de 5. »
8. **Délai minimal** (`booking.minNoticeHours`) : champ nombre + « h » ; aide « Temps entre la demande et le début du créneau, de 1 à 168 heures. »
9. **Horizon** (`booking.horizonDays`) : champ nombre + « jours » ; aide « Aucun créneau n'est proposé au-delà, de 7 à 90 jours. »
10. **Modalités proposées** (`booking.modalities`) : trois cases « Au cabinet », « En visio », « Par téléphone » ; aide « Le demandeur choisit parmi celles-ci. Au moins une. »
11. **Fuseau horaire** (`booking.timezone`) : liste des fuseaux IANA (`Intl.supportedValuesOf('timeZone')`) ; aide « Les heures des plages sont celles de ce fuseau. » Quand la fonction vient d'être activée, qu'aucune plage n'existe et que le fuseau du navigateur diffère de la valeur enregistrée : « Votre navigateur est réglé sur {fuseau}. » + bouton « Utiliser ce fuseau ». Rien n'est enregistré sans ce geste.

### Enregistrement
- Interrupteur, mode, durée, délai, horizon, modalités et fuseau s'enregistrent **dès le changement**, comme le reste de la page (`PATCH /api/me/preferences`, une clé).
- Les **plages** s'enregistrent par leur bouton, en une fois (`PATCH { "booking.windows": [...] }`) : une plage à moitié saisie ne doit jamais être proposée au public.
- Après chaque écriture, les préférences sont **relues** (G Q64) : la section affiche ce que le serveur renvoie (plages triées par jour puis par début), sans correction locale.
- La section vérifie la forme avant d'envoyer ; le serveur reste juge. Aucune requête ne part quand :
  - une heure n'est pas au format `HH:MM` ou que ses minutes ne sont pas un multiple de 5 : « Heure attendue au format HH:MM, minutes de 5 en 5. » ;
  - la fin n'est pas après le début : « La fin doit être après le début. » ;
  - deux plages du même jour se chevauchent (09:00–12:00 puis 12:00–14:00 sont contiguës, donc admises) : « Cette plage chevauche une autre plage du même jour. » ;
  - une valeur numérique sort de ses bornes : « Entre 15 et 180, par pas de 5. », « Entre 1 et 168. », « Entre 7 et 90. » ;
  - aucune modalité n'est cochée : « Gardez au moins une modalité. » (la dernière case cochée ne se décoche pas sans ce message).
  Le message s'affiche sous la plage ou sous le réglage concerné.
- À 21 plages, « Ajouter une plage » est inactif sur les sept jours et le pied de l'éditeur dit « 21 plages sur 21 · 21 plages au plus. » (vue « 21 plages » de la maquette).
- Une erreur `422` du serveur (`errors[].field` = la clé, codes `INVALID_VALUE` ou `OUT_OF_RANGE`) s'affiche sous le réglage de cette clé, avec le message du serveur ; pour `booking.windows`, sous l'éditeur. La valeur affichée revient à celle du serveur après relecture.

### Accessibilité de la section
- L'interrupteur est un vrai contrôle nommé ; le mode est un `fieldset` + `legend` avec deux `<input type="radio">`, chaque phrase reliée par `aria-describedby`.
- Éditeur : chaque jour est un groupe nommé (« Plages du lundi ») ; chaque champ a un nom complet (« Début de la plage 1 du lundi ») ; « Retirer » dit quelle plage (« Retirer la plage du lundi, 09:00 à 12:00 ») ; après un ajout le focus va sur le nouveau champ « Début », après un retrait sur « Ajouter une plage » du jour ; les messages sous une plage sont reliés par `aria-describedby` et annoncés (`role="alert"`).
- Tout se fait au clavier ; la section tient à 390 px (une plage par ligne, boutons en pleine largeur) et à 200 % de zoom.

### Points ouverts (repris de K10)
- Le délai de 72 h cité dans la phrase du mode manuel est une valeur par défaut de l'API (`app.booking.pending-ttl`), non exposée par le contrat : la phrase vit dans `$localize`, à aligner si la valeur change.
- Reporté après M14 : congés et jours fériés, plusieurs durées ou types de consultation, plafond de demandes en attente, liste de blocage.

## Interactions
- Contrôles segmentés `role="group"` + `aria-pressed` ; thème en `<input type="radio">` réels (vignettes = `<label>`).
- Changement de thème : appliqué immédiatement (`data-theme` sur `<html>`), persistance serveur en arrière-plan.
- Changement de langue : recharge l'application sur la locale (`@angular/localize` build par locale).
- `medicationVisible = false` masque le type dans la barre de commande (`/med` renvoie un message) et la timeline, mais ne supprime rien : les entrées existantes restent visibles avec une mention.
- Désignation « client » : remplace les libellés `patient` partout via les fichiers de traduction (`$localize` avec contexte `subject`), jamais les données.

## Tokens
- Segments actifs `#E3EAF8` / `#2C4C99` ; vignettes de thème : clair `#EEF1F6`, doux `#F4F6F9`, sombre `#1A2130`.
- Familles d'émotions : pastilles aux couleurs `--emo-*` (joie `#D9A426`, peur `#7A68C9`, tristesse `#3C66A6`…).
- Sécurité : état activé `--success`.

## Accessibilité
- Chaque ligne de réglage = libellé + aide (`aria-describedby`) + contrôle.
- Tableau des émotions : `<th scope="col">`.
- Vignettes de thème : le texte (« Clair », « Sombre ») porte l'information, la vignette est `aria-hidden`.

## Critères d'acceptation
- [ ] Changer la vue d'ensemble ici puis ouvrir un patient → vue appliquée ; la bascule sur la page patient et ce réglage restent synchronisés.
- [ ] `PATCH {"theme":"dark"}` → `data-theme="dark"` immédiat, persistant après reconnexion sur un autre navigateur.
- [ ] Clé inconnue dans le `PATCH` → ignorée, `200`, pas d'erreur.
- [ ] Praticien `coach` nouvellement inscrit → `subjectLabel = client`, `medicationVisible = false` sans action ; tout compte neuf lit `sessions.defaultDurationMin = 60` et `locale = fr`.
- [ ] (M16-29) Choisir العربية enregistre `locale = ar` (`PATCH`, réponse du serveur relue) et recharge l'application sous `/ar/` sur la même route ; après déconnexion et reconnexion, l'application revient en `/ar/` ; depuis `/ar/`, revenir au français ou à l'anglais marche de la même façon.
- [ ] Désactiver le type médicament puis `/med sertraline` dans la barre → message « type masqué dans vos préférences » + lien.
- [ ] Tableau des émotions : compteur d'utilisations exact vs `entry_feeling` (test d'intégration).
- [ ] (M14) Activer, choisir « Acceptation automatique dans mes plages », ajouter lundi 09:00–12:00, « Enregistrer les plages », recharger : les valeurs sont relues à l'identique ; le test lit les requêtes `PATCH /api/me/preferences` et leurs clés `booking.enabled`, `booking.confirmation`, `booking.windows`.
- [ ] (M14) Une plage dont la fin précède le début, ou qui chevauche une autre plage du même jour : « Enregistrer les plages » n'envoie aucune requête, le message est sous la plage ; 09:00–12:00 suivie de 12:00–14:00 est acceptée.
- [ ] (M14) Une erreur `422` simulée sur `booking.windows` (test du composant, service simulé) s'affiche sous l'éditeur ; sur `booking.slotDurationMin`, sous ce réglage.
- [ ] (M14) Retirer la dernière plage et enregistrer : la ligne d'état dit « La prise de rendez-vous n'est pas proposée tant qu'il n'y a pas de plage. » et le lien « Voir ma page de rendez-vous » disparaît.
- [ ] (M14) Profil non publié : le bandeau et le lien « Mon profil public » apparaissent, l'interrupteur et les réglages restent utilisables.
- [ ] (M14) Statut de vérification autre que `approved` (test de la page, session simulée), fonction activée, plages et profil publié : ni « Proposée sur votre fiche publique. » ni « Voir ma page de rendez-vous » ne s'affichent.
- [ ] (M14) À 21 plages, les sept boutons « Ajouter une plage » sont inactifs et « 21 plages au plus. » est affiché ; retirer une plage les réactive.
- [ ] (M14) Avec le compte `claire.seed@example.test` du seed, « Voir ma page de rendez-vous » mène à `/praticiens/claire-martin/rendez-vous`.
- [ ] (M14) Chaque réglage numérique refuse une valeur hors bornes sans requête (durée 10, délai 0, horizon 91) ; décocher la dernière modalité n'envoie rien.
- [ ] (M14) La section se parcourt et se règle au clavier ; axe-core 0 violation, thèmes clair et sombre ; mise en page tenue à 390 px et à 200 % de zoom ; les autres sections de la page n'ont pas changé (leurs e2e restent verts).

## Écarts avec la maquette
- **Délai de correction sans version** : 1 h 15 (G Q31, `versioning.grace-period = 75m`), pas 5 min. Maquette corrigée (UX-F1).
- **Résumé sécurité** : `lastLogin.city` vaut toujours `null` en V1 et le journal de sécurité praticien est hors contrat (fiche 18) : la ligne devient « Connexion précédente : date · appareil », sans ville ni lien « Journal de sécurité ». Maquette corrigée (UX-F1). Les trois tuiles sont conservées : chacune s'appuie sur une route du contrat (`GET /api/auth/me`, `GET /api/me/security`, `POST /api/auth/sessions/revoke-others`).

## Hors périmètre V1
Préférences par patient, thèmes personnalisés, délégation de compte (secrétariat), préférences d'agenda (hors V1, G Q25).
