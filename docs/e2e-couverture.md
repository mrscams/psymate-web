# Couverture e2e de la V1

9 novembre 2026 · M7-04 (C2 ; C5 « la bêta est prête quand »). Correspondance entre les cas d'usage V1 (A2, UC-01 à UC-15), les flux de B3 et B8 (1 à 10), les écrans V1 (`couverture-ecrans.md`) et les tests Playwright de `e2e/`. Les références sont `fichier:ligne` (relatif à `e2e/`) suivies du titre du test.

## Règles communes

- **API réelle.** Tous les e2e tournent contre psymate-api (seed `small`, Mailpit). Aucune réponse n'est fabriquée : il n'y a pas de `route.fulfill`. Les états « chargement » retiennent une requête qui part ensuite vers l'API. Les états « erreur » coupent une seule requête (`route.abort`), comme une coupure réseau.
- **Administrateur.** Certains tests exigent l'administrateur e2e local, avec la 2FA. Il se crée par `make admin` dans `../psymate-api`, et ses identifiants passent par `PSYMATE_E2E_ADMIN_EMAIL`, `PSYMATE_E2E_ADMIN_PASSWORD` et `PSYMATE_E2E_ADMIN_TOTP_SECRET`. Sans ces variables, ces tests s'ignorent et le disent. Ils sont marqués **(admin)** ci-dessous. Publier une fiche exige un dossier approuvé par un administrateur (G Q14). C'est pourquoi UC-13, UC-14 et UC-15 dépendent en partie de l'administrateur.
- **Clavier seul.** Les parcours « au clavier » appellent `keyboardOnly(page)` (`support/clavier.ts`). La fonction écoute les gestes de pointeur réels : appui, déplacement, molette, toucher. Le test échoue si un seul de ces gestes a eu lieu, donc ni `click()`, ni `hover()`, ni `page.mouse`.
  - `tabTo()` prouve qu'un élément est dans l'ordre de tabulation : le test y arrive par Tab ou Maj+Tab.
  - Seules exceptions, qui ne sont pas des gestes dans l'application :
    - `page.goto`, pour suivre le lien d'un e-mail ou taper une adresse ;
    - `setInputFiles` sur un champ fichier déjà focalisé, car la boîte de sélection du système n'est pas pilotable.
- **axe-core.** L'analyse porte sur WCAG 2.0 et 2.1, niveaux A et AA. Toutes les gravités comptent : le seuil est 0 violation, au-delà du seul « serious » demandé. Aucune règle n'est désactivée et aucun élément n'est exclu, le canevas du graphe compris. Avant chaque analyse, le test attend la fin des ondulations Material et des fondus de dialogue (`support/axe.ts`).
- **Stabilité.** Les écritures en masse se font par vagues, chacune suivie de la barrière `apiDrained()` (`support/api-drain.ts`). Elles passent sous le verrou `charge-api` (`support/exclusif.ts`), tout comme les fenêtres de mesure de durée. Le journal M7-04 explique pourquoi.

## Cas d'usage → e2e

Chaque cas d'usage a au moins un e2e qui passe sans administrateur. La seule exception est le flux principal de UC-15 : il passe ici sur une fiche déjà publiée, et ses tests complets demandent l'administrateur.

### UC-01 · S'inscrire / se connecter

- **Flux principal :**
  - `flux-9-inscription-dossier/inscription-dossier.spec.ts:31` « inscription complète au clavier → 201, /confirmer-email, e-mail… » ;
  - `flux-1-connexion/connexion.spec.ts:26` « connexion avec un compte du seed → /patients, puis déconnexion ».
- **Alternatives :**
  - A1, e-mail déjà utilisé : `inscription-dossier.spec.ts:58` ;
  - A2, mot de passe oublié : `inscription-dossier.spec.ts:120` et `etats/public-auth.spec.ts` (26 « envoyé ») ;
  - 2FA : `flux-1-connexion/connexion.spec.ts:75` ;
  - message unique : `connexion.spec.ts:53`.
- **Au clavier :** `flux-1-premiere-connexion/clavier.spec.ts:22`, `flux-9-inscription-dossier/clavier.spec.ts:54`, `inscription-dossier.spec.ts:277`.

### UC-02 · Créer / modifier / archiver un patient

- **Flux principal :** `flux-2-creer-patient/creer-patient.spec.ts:23` « créer un patient, le retrouver…, modifier le rythme, archiver, restaurer ».
- **Alternatives :**
  - A1, archivage puis restauration : `creer-patient.spec.ts:147` ;
  - A2, nom dupliqué : non couvert (aucun avertissement en V1, voir « Ce qui n'est pas couvert »).
- **Au clavier :** `flux-2-creer-patient/clavier.spec.ts:12`.

### UC-03 · Ajouter une note, un événement, une situation, un ressenti ou un médicament

- **Flux principal :**
  - `flux-3-saisie/editeur.spec.ts:75` « ressenti 8/10 au clavier en moins de 20 s » ;
  - `flux-3-saisie/barre-commande.spec.ts:92` « chronométré… ressenti lié créé en moins de 12 s ».
- **Alternatives :**
  - A1, brouillon : `editeur.spec.ts:137` et `barre-commande.spec.ts:318` ;
  - A2, séance prérenseignée : `editeur.spec.ts:75` ;
  - A3, entrées récentes proposées à lier : `flux-3-saisie/rail.spec.ts:124`.
- **Au clavier :** `flux-3-saisie/clavier.spec.ts:42`.

### UC-04 · Enregistrer une séance et ses entrées

- **Flux principal :**
  - `shell/shell.spec.ts:108` « Démarrer puis Clôturer la séance » ;
  - `flux-3-saisie/clavier.spec.ts:42` (démarrer, saisir, clôturer).
- **Alternatives :** durée selon la préférence, `shell.spec.ts:173`.
- **Au clavier :** `flux-3-saisie/clavier.spec.ts:42` et `flux-6-vue-ensemble/clavier.spec.ts:14`.

### UC-05 · Corriger une entrée

- **Flux principal :** `flux-3-saisie/editeur.spec.ts:323` « correction après la grâce… version 2 ».
- **Alternatives :** A2, règle de grâce : `editeur.spec.ts:283`.
- **Au clavier :** `flux-5-timeline/timeline.spec.ts:118`, avec « Corriger » dans le menu ouvert au clavier.

### UC-06 · Lier deux entrées

- **Flux principal :** `flux-4-lier/lier.spec.ts:94` « lier deux entrées depuis une entrée ouverte ».
- **Alternatives :**
  - par la touche L : `lier.spec.ts:158` ;
  - glisser-déposer : `flux-6-graphe/graphe.spec.ts:118` ;
  - A1, lien existant (409) : `lier.spec.ts:189`.
- **Au clavier :** `flux-4-lier/clavier.spec.ts:69`.

### UC-07 · Parcourir la timeline

- **Flux principal :** `flux-5-timeline/timeline.spec.ts:68` et `filters.spec.ts:64`.
- **Alternatives :**
  - A1, 10 ans et virtualisation : `timeline.spec.ts:163` (2 000 entrées) et `decade.spec.ts:69` ;
  - ciblage : `timeline.spec.ts:301` (`?focus=`).
- **Au clavier :** `timeline.spec.ts:118`, `decade.spec.ts:167`, `flux-5-recherche/clavier.spec.ts:13`.

### UC-08 · Explorer le graphe

- **Flux principal :** `flux-6-graphe/graphe.spec.ts:30` (150 nœuds) et `graphe.spec.ts:176` (double-clic).
- **Alternatives :** A1, plus de 150 nœuds regroupés : `graphe.spec.ts:262`.
- **Au clavier :** `graphe.spec.ts:210` et `accessibilite/graphe-lecteur.spec.ts:14`.

### UC-09 · Voir la vue d'ensemble

- **Flux principal :** `flux-6-vue-ensemble/vue-ensemble.spec.ts:27` « synthèse en moins de 200 ms côté API ».
- **Alternatives :**
  - relecture après écriture : `vue-ensemble.spec.ts:169` ;
  - vue simple : `vue-simple.spec.ts:29`.
- **Au clavier :** `flux-6-vue-ensemble/clavier.spec.ts:14` et `vue-ensemble.spec.ts:251`.

### UC-10 · Rechercher dans l'historique

- **Flux principal :** `flux-5-recherche/recherche.spec.ts:99` « entretien manager ».
- **Alternatives :**
  - A1, fautes de frappe : `recherche.spec.ts:31` ;
  - A2, aucun résultat : `etats/dossier.spec.ts` (07 vide) ;
  - facettes : `recherche.spec.ts:153`.
- **Au clavier :** `flux-5-recherche/clavier.spec.ts:13` et `recherche.spec.ts:31`.

### UC-11 · Gérer ses tags

- **Flux principal :** `vocabulaire/vocabulaire.spec.ts:45` « fusionner deux tags ».
- **Alternatives :** A1, tag égal à une émotion : `vocabulaire.spec.ts:91`.
- **Au clavier :** `vocabulaire.spec.ts:210`.

### UC-12 · Consulter l'historique des versions

- **Flux principal :**
  - `flux-3-saisie/editeur.spec.ts:323` (2 versions dans le pied et l'historique) ;
  - `flux-2-creer-patient/creer-patient.spec.ts:23` (fiche patient : versions 2 et 3, différence avant → après).
- **Alternatives :** aucune.
- **Au clavier :** `flux-2-creer-patient/clavier.spec.ts:12`, pour la version 2 de la fiche.

### UC-13 · Renseigner et publier son profil public

- **Flux principal :**
  - `flux-8-profil-public/profil-public.spec.ts:25` (remplir, aperçu, interrupteur inactif tant que le dossier n'est pas approuvé) ;
  - `profil-public.spec.ts:203` « compléter, publier… retirer → 404 » **(admin)**.
- **Alternatives :**
  - A1, profil incomplet : `profil-public.spec.ts:170` **(admin)** ;
  - A2, retrait : `profil-public.spec.ts:203` **(admin)**.
- **Au clavier :** `flux-8-profil-public/clavier.spec.ts:59` ; `flux-8-profil-public/clavier.spec.ts:104` **(admin)**.

### UC-14 · Consulter l'annuaire

- **Flux principal :** `flux-7-visiteur/visiteur.spec.ts:52` **(admin)**.
- **Alternatives :**
  - A1, aucun résultat avec suggestions : `flux-7-visiteur/clavier.spec.ts:38` et `etats/public-auth.spec.ts:21` ;
  - annuaire prérendu : `visiteur.spec.ts:279`.
- **Au clavier :** `flux-7-visiteur/clavier.spec.ts:38` ; `flux-7-visiteur/clavier.spec.ts:87` **(admin)**.

### UC-15 · Voir une fiche et contacter un praticien

- **Flux principal :**
  - `flux-7-visiteur/visiteur.spec.ts:52` **(admin)** ;
  - `flux-7-visiteur/clavier.spec.ts:153`, sur une fiche déjà publiée de l'API locale (ignoré sur une base neuve).
- **Alternatives :**
  - A2, spam : `visiteur.spec.ts:197` **(admin)** ;
  - fiche inconnue : `visiteur.spec.ts:226`.
- **Au clavier :** `flux-7-visiteur/clavier.spec.ts:153` ; `flux-7-visiteur/clavier.spec.ts:87` **(admin)**.

### Cas d'usage ajoutés le 25 octobre (A10)

- **UC-16, dossier professionnel :**
  - `flux-9-inscription-dossier/inscription-dossier.spec.ts:150` ;
  - au clavier : `flux-9-inscription-dossier/clavier.spec.ts:54`.
- **UC-17, valider un praticien :**
  - `flux-10-admin/admin.spec.ts:58` **(admin)** ;
  - au clavier : `flux-10-admin/clavier.spec.ts:50` **(admin)**.
- **UC-18, préférences :** `preferences/preferences.spec.ts:27` et `preferences.spec.ts:221` (au clavier).
- **UC-19, 2FA :** `securite/securite.spec.ts:57` et `securite.spec.ts:314` (au clavier).

## Flux B3 / B8 → parcours au clavier

Un e2e par flux, sans aucun geste de pointeur (`keyboardOnly`) et avec axe-core aux étapes clés.

1. **Flux 1, première connexion et état vide.** `flux-1-premiere-connexion/clavier.spec.ts:22`, puis `:108` pour le patient de démonstration ouvert, supprimé et restauré.
   - Parcours : inscription, lien de confirmation, accueil, « Voir les raccourcis » puis Échap, « Nouveau patient », nom, Ctrl+Entrée, « Nouvelle entrée », texte, Ctrl+Entrée, retour à la liste.
2. **Flux 2, créer un patient.** `flux-2-creer-patient/clavier.spec.ts:12`.
   - Parcours : N, nom, pronom, motif, rythme, Ctrl+Entrée. La vue d'ensemble s'ouvre **barre de capture focalisée**. Puis la fiche (version 2) et l'archivage avec le nom retapé.
3. **Flux 3, capture pendant une séance.** `flux-3-saisie/clavier.spec.ts:42`.
   - Parcours : « Démarrer la séance », qui donne le focus à la barre. Puis `/res anxiété 8 …`, Tab jusqu'au rail, Espace, Entrée (enregistrement final). Ensuite Ctrl+S pour un brouillon, et « Clôturer ».
4. **Flux 4, lier deux entrées.** `flux-4-lier/clavier.spec.ts:69`.
   - Parcours : touche 2, une carte, Entrée, L, recherche, choix de la cible, « Inverser le sens », type, justification, Entrée.
   - Variante graphe : « Lier (L) » dans le détail d'une entrée de la liste équivalente.
5. **Flux 5, retrouver dans l'historique.** `flux-5-recherche/clavier.spec.ts:13`.
   - Parcours : /, saisie, facette « Ressentis », ↓, aperçu, « Ouvrir dans la timeline » (l'entrée est positionnée), puis Échap qui rend l'onglet.
6. **Flux 6, préparer une séance.** `flux-6-vue-ensemble/clavier.spec.ts:14`.
   - Parcours : / puis le nom, Entrée, la séance passée dépliée, une situation qui ouvre le graphe centré, touche 1, « Démarrer la séance » (les séances se replient, la capture prend le focus).
7. **Flux 7, un visiteur trouve et contacte.** Trois tests :
   - `flux-7-visiteur/clavier.spec.ts:38` : ville, profession (liste Material au clavier), facette, aucun résultat, critère retiré ;
   - `:153` : sur une fiche publiée, formulaire rempli et envoyé ;
   - `:87` **(admin)** : le parcours complet.
8. **Flux 8, publier son profil.** `flux-8-profil-public/clavier.spec.ts:59`.
   - Parcours : avatar, « Mon compte », « Profil public », champs, aperçu, motif du refus et son lien.
   - `:104` **(admin)** : publier puis retirer à l'Espace.
9. **Flux 9, s'inscrire et faire vérifier son dossier.** `flux-9-inscription-dossier/clavier.spec.ts:54`.
   - Parcours : inscription, confirmation, bandeau et son lien, deux justificatifs, soumission, outil clinique toujours utilisable.
10. **Flux 10, valider un praticien.** `flux-10-admin/clavier.spec.ts:50` **(admin)**.
    - Parcours : connexion 2FA au clavier, la file, les cases « Conforme », la liste de contrôle, « Demander un complément » qui attend un message, puis « Approuver ».

## Écrans V1 → axe-core, deux thèmes

`accessibilite/axe-ecrans.spec.ts` passe tous les écrans en clair (`:50`, `:261`) puis en sombre (les mêmes tests, dans le bloc « thème sombre »). Les fiches publiées (`:370`) et l'administration (`:396`) demandent l'administrateur.

**Forçage du thème.**
- Praticien : préférence `theme` du compte, plus `prefers-color-scheme`.
- Pages sans session : `prefers-color-scheme` seul.

**Résultat.** Chaque écran donne une annotation `axe <thème>` dans le rapport Playwright. Le 9 novembre, les 34 écrans analysés par thème donnent **0 violation, en clair comme en sombre**.

### Écrans praticien

| Fiche | Écran (étape du test) | Autres e2e avec axe |
| --- | --- | --- |
| 01 | liste des patients ; aide des raccourcis (?) | `flux-2-creer-patient/*`, `flux-1-premiere-connexion/*`, `theme/theme.spec.ts` |
| 16 | nouveau patient, fiche patient | `flux-2-creer-patient/creer-patient.spec.ts:23` |
| 02 / 02b | vue d'ensemble complète, vue simple | `flux-6-vue-ensemble/*` (sombre compris) |
| 05 | barre de commande (aperçu ouvert), éditeur d'entrée (correction), nouvelle entrée (combobox des émotions ouverte) | `flux-3-saisie/*` |
| 03 | timeline (séance dépliée) | `flux-5-timeline/*` |
| 04 | graphe (canevas compris), liste équivalente avec détail | `flux-6-graphe/graphe.spec.ts`, `accessibilite/graphe-lecteur.spec.ts` |
| 06 | éditeur de lien | `flux-4-lier/*` |
| 07 | recherche | `flux-5-recherche/*` |
| 14 | préférences, tags | `preferences/preferences.spec.ts`, `vocabulaire/*` |
| 17 | émotions personnalisées | `vocabulaire/*` |
| 13 | dossier professionnel | `flux-9-inscription-dossier/*` |
| 10 | mon profil public | `flux-8-profil-public/*` |
| 18 | compte et sécurité ; panneau 2FA (QR) | `securite/*` |
| 19 | données et export | `export/export.spec.ts` |

### Pages publiques et d'authentification

| Fiche | Écran (étape du test) | Autres e2e avec axe |
| --- | --- | --- |
| 08 | annuaire ; résultats **(admin)** | `etats/public-auth.spec.ts`, `flux-7-visiteur/*` |
| 09 | fiche introuvable ; fiche publiée **(admin)** | `etats/public-auth.spec.ts`, `flux-7-visiteur/clavier.spec.ts:153` |
| 24 | comment ça marche | `flux-7-visiteur/visiteur.spec.ts:235` |
| 11 | connexion ; bloc code 2FA | `flux-9-inscription-dossier/inscription-dossier.spec.ts:277` |
| 12 | inscription ; erreurs (résumé et champs) | `flux-9-inscription-dossier/*` |
| 25 | confirmation d'e-mail, lien expiré | `flux-9-confirmation/*` |
| 26 | mot de passe oublié | `etats/public-auth.spec.ts` |
| 27 | compte suspendu (sans session) | `compte-suspendu/compte-suspendu.spec.ts:143` |
| 18 C | première connexion de l'administrateur (étape 1) | `securite/premiere-connexion.spec.ts:19` |

### Administration et états

| Fiche | Écran | e2e |
| --- | --- | --- |
| 20, 21, 22, 28 | validation, praticiens, journal, vocabulaire **(admin)** | `flux-10-admin/*`, `etats/admin.spec.ts`, `theme/theme.spec.ts` (sombre) |
| 29 | états vide, chargement et erreur de chaque écran ; hors ligne | `etats/*` (thème clair) |

## Zoom 200 %

`accessibilite/zoom-200.spec.ts` simule une fenêtre CSS de 640 × 360 px avec un `deviceScaleFactor` de 2. C'est la fenêtre 1280 × 720 de la configuration vue à 200 %, comme le fait le zoom de Chrome : la largeur CSS est divisée par deux, les media queries se déclenchent et le texte double en pixels physiques. Playwright ne pilote pas le zoom du navigateur en mode sans tête. La propriété CSS `zoom` a été écartée parce qu'elle ne réduit pas la largeur CSS.

Chaque écran vérifie trois choses : aucun défilement horizontal de la page, le titre visible, et l'action principale menée au clavier jusqu'à l'API.

- **Praticien (`:43`).**
  - Écrans : liste, création (N, Ctrl+Entrée), vue d'ensemble, timeline, éditeur, graphe, recherche, Mon compte.
  - Vue d'ensemble : bascule Simple · Complète entière et utilisable.
  - Capture : note enregistrée par Entrée.
  - Éditeur : il tient dans la fenêtre et son bouton d'enregistrement est atteignable.
  - Graphe : la liste équivalente s'ouvre.
  - Mon compte : préférences puis sécurité.
- **Pages publiques (`:170`).**
  - Annuaire : filtres repliés derrière un bouton.
  - Connexion : refus 401.
  - Inscription : le résumé des erreurs prend le focus, et son lien mène au champ fautif.

Les captures ne sont écrites que si `PSYMATE_E2E_CAPTURES` désigne un dossier, toujours hors du dépôt.

## Lecteur d'écran simulé : liste équivalente du graphe

`accessibilite/graphe-lecteur.spec.ts:14` vérifie la liste équivalente par l'arbre d'accessibilité seul, avec `getByRole` et `toMatchAriaSnapshot` :

- le canevas est une `img` nommée (« Graphe des liens : 4 nœuds, 3 liens… ») et le compteur est annoncé (`aria-live`) ;
- le bouton « Liste des liens » porte `aria-expanded` et `aria-controls` ;
- le tableau a une légende, des en-têtes de colonnes et une ligne par lien ; les icônes de type sont muettes ;
- le détail est une région `complementary` nommée par son titre, qui reçoit le focus ; la sélection est annoncée (`aria-live`) ;
- les liens de l'entrée sont des phrases-boutons, qu'on suit au clavier.

## Ce qui n'est pas couvert

- **Tests administrateur.** Ils sont écrits mais ignorés sans `PSYMATE_E2E_ADMIN_*` :
  - flux 10 ;
  - publication (UC-13 A1, A2) ;
  - parcours complet du flux 7 ;
  - axe en administration et sur une fiche publiée ;
  - états 20, 21, 22, 27 et 28.
- **Alternatives sans écran en V1 :**
  - UC-02 A2 (nom dupliqué) ;
  - UC-04 A1 (séance saisie a posteriori) et A2 (rappel de clôture oubliée) ;
  - UC-06 A2 (auto-lien refusé, seulement par l'API).
- **États en sombre.** La planche 29 (`etats/*`) n'est vérifiée qu'en thème clair. Les écrans à l'état chargé, eux, le sont dans les deux thèmes.
