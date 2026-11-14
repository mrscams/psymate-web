# Écran 16 · Fiche patient (création et modification)

> Spécification pour agents. Maquette : `16-fiche-patient.html` / `.png` (état « modification » ; la création est le même formulaire vide). Palette : Nordique. Document A, module `patients` (`POST /api/patients`, `GET/PATCH /api/patients/{id}`, `POST /api/patients/{id}/archive`).
>
> Mis à jour le 11 novembre 2026 (UX-F1, audit UX du 9 novembre) : carte « risque » en ambre et non en rouge (règle « jamais rouge sur un patient ») ; maquette HTML corrigée.
>
> **Mis à jour le 14 novembre 2026 (UX-S10, proposition `propositions-2026-11/16-fiche-patient.html`)** : la mise en page de cette fiche est remplacée par celle de la proposition 16 ; les champs, validations, appels et critères ci-dessous restent valables. Voir « Proposition 16 (UX-S10) » en fin de fiche.

## Objectif
Un seul formulaire pour créer un patient en trente secondes (seul le **nom affiché** est obligatoire) et pour compléter la fiche au fil du suivi. Rien de ce qui est saisi ici n'est une entrée clinique : la fiche décrit la personne et le cadre du suivi, la timeline décrit ce qui se passe.

## Route & module
- Routes : `/patients/nouveau` (création) et `/patients/{id}/fiche` (modification). Après création → redirection vers la vue d'ensemble, vide, barre de saisie focalisée.
- API : `POST /api/patients` `{ displayName, firstName?, lastName?, birthDate?, pronoun?, phone?, email?, context{situation, activity, referredBy, initialReason, history}, followUp{since, rhythm, modality, durationMin, fee?, prescriber?}, flags[], tags[] }` → `201`. `PATCH` partiel ; chaque modification crée une version (`patient_version`, historique consultable : « 3 versions »).
- À la création, le serveur crée automatiquement une **séance d'accueil** (`session`, type `intake`) datée du jour : toute entrée saisie ensuite a une séance de rattachement.
- `initialReason` renseigné → proposition (non automatique) de créer une **situation** « Motif initial » après l'enregistrement.
- Drapeaux (`patient_flag`) : `watch` (à surveiller, avec raison obligatoire), `risk` (risque : idées suicidaires, mise en danger ; affiché en premier dans la liste), `shared_care` (suivi conjoint). Jamais déduits automatiquement.
- Tags : communs à tous les patients du praticien (`practitioner_tag`) ; un tag identique à une émotion du vocabulaire est refusé (`422`).
- Archivage : `POST /archive` → disparaît de la liste et de l'agenda, dossier conservé intégralement, restauration possible ; aucune suppression physique en V1.

## Structure
1. **Barre d'application** + fil d'Ariane `Patients / Marie D. / Fiche`.
2. **Titre** « Modifier la fiche · Marie D. » (création : « Nouveau patient ») + méta (créée le, n séances, dernière modification).
3. **Colonne principale** (max 880 px), sections en cartes :
   - **Identité** : nom affiché (obligatoire, aide : « un prénom et une initiale suffisent »), prénom, nom, date de naissance (→ âge et phases de vie), pronom/accord (Elle / Il / Iel / Neutre), téléphone, e-mail (« pour les rappels, plus tard »).
   - **Contexte** : situation, activité, adressée par, motif initial, **histoire et éléments à garder en tête** (texte libre, visible dans la vue d'ensemble) + lien « Créer les entrées depuis ce texte » (ouvre la barre de saisie préremplie, ligne par ligne).
   - **Suivi** : suivie depuis (mois), rythme habituel (hebdo / 1 à 2 semaines / mensuel / irrégulier), modalité par défaut (cabinet / visio / téléphone), durée de séance (défaut = préférence `sessions.defaultDurationMin`), tarif `[TARIF]`, médecin / prescripteur.
   - **Drapeaux** : trois cartes-cases (à surveiller avec date et raison, risque, suivi conjoint) ; champ « Raison du drapeau » affiché quand « à surveiller » est coché.
   - **Tags du patient** : chips avec suppression + saisie avec autocomplétion sur les tags existants.
   - Pied : « Enregistrer », « Annuler », mention « chaque modification est horodatée ».
   - **Zone de danger** (bordure pointillée) : « Archiver ce patient » + explication.
4. **Colonne latérale** (320 px) : **aperçu de l'en-tête** (tel qu'il s'affichera : nom, âge, suivie depuis, drapeaux), encart « À la création d'un patient » (séance d'accueil, motif → situation, arrivée sur la vue d'ensemble), encart **Confidentialité** (coordonnées jamais synchronisées avec Google ni exportées dans l'annuaire ; lien historique des versions).

## Interactions
- Validation à la soumission uniquement, erreurs ancrées sous le champ (`aria-describedby`) ; date de naissance future ou > 120 ans → erreur.
- L'aperçu de l'en-tête se met à jour en direct (signal dérivé du formulaire).
- Cocher « risque » n'exige pas de raison mais affiche un rappel : « Les éléments de risque se notent dans la timeline (note privée) ».
- « Archiver… » → boîte de confirmation avec le nom du patient à retaper ; redirection vers la liste avec toast « Marie D. archivée · Restaurer ».
- Création : Ctrl/Cmd+Entrée enregistre depuis n'importe quel champ.

## Tokens
- Cartes de drapeau cochées : « à surveiller » et « risque » `#FBF1DC` / `#7A5A12`, bordure et case `#B8862E` (ambre, distingués par leur libellé et leur aide, jamais par le rouge : fiche 00, `Etude-couleurs-Nordique.md` « Flags praticiens ») ; « suivi conjoint » `#E3EAF8` / `#2C4C99`.
- Champs monospace (`JetBrains Mono`) pour les dates et le téléphone ; placeholders `[TARIF]` en `#8A94A6`.
- Zone d'archivage : bordure `1.5px dashed #B9C2D1`, bouton `#9A2F22` sur fond blanc.

## Accessibilité
- Chaque carte de section est un `<fieldset>` avec `<legend>` (texte visuel en petites capitales).
- Drapeaux = `<input type="checkbox">` réels dans un `<label>` englobant.
- Chips de tags : bouton de suppression avec `aria-label="Retirer le tag #travail"`.

## Critères d'acceptation
- [ ] `POST` avec seulement `displayName` → `201`, une séance `intake` créée le même jour, redirection vers `/patients/{id}` avec barre de saisie focalisée.
- [ ] `displayName` vide → `422` serveur et erreur client sans appel réseau.
- [ ] Tag égal à une émotion (ex. « anxiété ») → refus avec message explicite.
- [ ] Coché « à surveiller » sans raison → erreur ; avec raison → en-tête du patient et liste affichent le drapeau avec sa date.
- [ ] Modifier le rythme → `patient_version` n+1 ; l'historique liste la différence champ par champ.
- [ ] Archiver puis restaurer → aucune entrée ni lien perdu ; l'agenda retrouve les rendez-vous futurs.

## Écarts avec la maquette
- **Carte « risque » (UX-F1)** : la maquette et l'ancienne version de cette fiche la teintaient en rouge (`#9A2F22` / `#FBE9E7`) ; un drapeau est ambre, jamais rouge sur un patient (fiche 00, étude des couleurs). **Maquette corrigée** : case de la carte « Risque » en `#B8862E`. Le rouge reste réservé à l'astérisque d'obligation et au bouton « Archiver… » (action destructive), qui ne qualifient pas le patient.
- **Champs date et mois (UX-F1)** : date de naissance, date du drapeau et dates du suivi passent par `pm-date-field` / `pm-month-field` (fiche 00 §8) : saisie `jj/mm/aaaa` ou `mm/aaaa` en JetBrains Mono, comme la maquette, plus un **bouton calendrier** à droite du champ, non dessiné. Maquette non modifiée.

## Proposition 16 (UX-S10, 14 novembre 2026)
Ce qui change (mêmes champs, mêmes validations, mêmes appels) :
- **Pleine largeur** (`data.contentWidth: 'full'` sur `nouveau` et `:id/fiche`), marges 20 / 24 / 40 px, 16 px sous 600 px.
- **Rail collant à gauche (240 px)** : aperçu de l'en-tête (nom, âge, « suivi·e depuis », drapeaux en puces), liens vers les sections avec le nombre de champs renseignés (Identité, Contexte, Suivi, Drapeaux, Tags, Archivage), section courante marquée au défilement (`aria-current`), **Enregistrer** (`Ctrl+↵`, « Créer le dossier » à la création) toujours visible, « Annuler les modifications » (remet la fiche lue ; à la création « Annuler » revient à la liste), « n champs modifiés · chaque enregistrement crée une version horodatée ». Plus de boutons en bas de page.
- **Formulaire continu** : une surface, sections séparées par un titre 15 / 650 et un filet (toujours des `fieldset` / `legend`), grille `.fgrid` (2 colonnes, 3 pour le suivi), champs de 38 px. **« (facultatif) » disparaît** : seul le nom affiché porte l'astérisque, l'aide d'Identité le dit une fois (« Le reste est facultatif »).
- **Explications repliées** : les encarts « À la création d'un patient » et « Confidentialité » deviennent des notes sous les champs (séance d'accueil sous Suivi, coordonnées sous Téléphone / E-mail, reliées par `aria-describedby`) ; aide de la date de naissance « 35 ans · l'âge et les phases de vie en découlent », de la durée « préférence du compte : 60 min ». Exemples à la place des crochets (`06 12 34 56 78`, `70 €`, `prenom@exemple.fr`, `Dr …`).
- **Drapeaux** : trois cartes compactes ; la raison de « à surveiller » est dans la carte cochée ; le rappel de « risque » est dans l'aide de la carte.
- **Export et historique** : actions de l'en-tête (« Exporter le dossier ▾ », « Historique des versions ») ; l'historique s'ouvre dans un panneau latéral de 420 px (fiche 00 §6), aussi depuis « (n versions) » de la méta « Créée le … · n séances · dernière modification il y a 3 j (n versions) ».
- **Archivage** : zone pointillée sous les tags, cible du lien « Archivage » du rail ; confirmation inchangée.
- **Erreurs** : résumé `pm-form-errors` en tête de page (focus, liens vers les champs), messages sous les champs ; le rail reste visible ; une erreur sans champ (409…) en bandeau.
- **Mobile (sous 900 px)** : puces des sections collées en haut, barre Enregistrer / Annuler collée en bas, une colonne sous 600 px, sans carte.

Écarts constatés (maquette ↔ contrat, règles du produit) :
- **Couleur `text-disabled`** (libellé de l'aperçu, décomptes, lien « Archivage », placeholders) : 3,0:1 sur fond blanc, sous le seuil AA ; remplacée par `text-secondary`.
- **Accords** : la maquette écrit « Adressée par », « Suivie depuis », « suivie depuis » (patiente « Elle ») ; les libellés gardent l'écriture inclusive « Adressé·e par », « Suivi·e depuis » (le libellé d'un champ ne dépend pas d'un autre champ).
- **Placeholder de l'histoire** : la maquette dit « visible dans la vue d'ensemble et au début de chaque séance » ; aucune page n'affiche ce texte au début d'une séance (ni, à ce jour, dans la vue d'ensemble) : le texte garde « visible dans la vue d'ensemble », à confirmer.
- **Fil d'Ariane** : la maquette le place dans la barre d'application, qui n'en a pas (composant partagé, hors tâche) ; il reste en tête de page.
- **Export** : variante compacte de l'en-tête, sans la note « Entrées privées exclues » (rappelée dans Mon compte › Données et export).
- **Carte « suivi conjoint » cochée** : la feuille de la maquette teinte toutes les cartes cochées en ambre ; le suivi conjoint garde le bleu de cette fiche (aucun état coché dessiné).

## Hors périmètre V1
Photo du patient, documents joints, import depuis un autre logiciel, partage avec un confrère.
