# Glossaire arabe de PsyMate (proposé, non relu)

23 novembre 2026, tâche M16-07 du plan `docs/M-plan-version-arabe.md`. Décisions : G Q71 (tranchée par l'utilisateur), Q72 à Q81 (proposées par le plan M, non relues). Règles d'habillage : `docs/design/arabe.md`.

**Statut.** Toutes les propositions ci-dessous sont faites par l'agent, en arabe standard moderne (Q72). **Aucune n'est relue.** La colonne « Relu par » reste vide jusqu'à la relecture par une personne arabophone, idéalement un clinicien, qui a lieu avant l'ouverture (M16-29, Q80). Les tâches qui traduisent (API : M16-03, M16-04, M16-05 ; web : M16-26 à M16-28) emploient la colonne « Proposition » **sans attendre cette relecture** ; quand le relecteur retient une variante ou corrige un terme, il modifie la colonne « Proposition », signe « Relu par », et la correction est reportée dans les fichiers déjà traduits par la tâche suivante du couloir (ou par M16-29).

**Qui s'en sert.**

- psymate-api : libellés `label_ar` des catalogues globaux (M16-03 : sections 4, 5, 6, 9), `messages_ar.properties` (M16-04), e-mails (M16-05).
- psymate-web : `src/locale/messages.ar.xlf` (M16-26 à M16-28), et toute tâche de feature qui doit nommer une chose en arabe dans un test ou une PR.

**Règle d'emploi.** Un terme métier absent de ce glossaire n'est pas inventé dans une traduction : la tâche le signale dans sa PR, avec sa proposition, et la ligne est ajoutée ici par la tâche suivante du couloir de documentation (ou par M16-29).

Colonnes : **Clé** (code du catalogue ou préfixe d'identifiant dans `messages.fr.xlf`), **Français** (texte source), **Anglais**, **Proposition** (arabe standard moderne, à employer), **Variante** (quand l'usage hésite, d'un pays ou d'un milieu à l'autre), **Remarque**, **Relu par** (vide).

## 1. Règles de registre

Elles valent pour l'interface web, les messages de l'API et les e-mails.

1. **Arabe standard moderne** (فصحى معاصرة), sans dialecte ni tournure propre à un pays (Q72). Phrases courtes, vocabulaire courant d'une application de santé.
2. **Boutons et actions au nom verbal** (مصدر), jamais à l'impératif : « إضافة » et non « أضف » ou « أضيفي » ; « حفظ », « إلغاء », « حذف », « تعديل », « بحث », « تصدير », « ربط », « بدء الجلسة ». L'impératif arabe est genré ; le nom verbal ne l'est pas.
3. **Aucun accord de genre pour le praticien.** On ne s'adresse pas à lui par un verbe ou un adjectif accordé. On préfère le nom verbal, la tournure impersonnelle ou le passif : « تم الحفظ » (enregistré), « يتعذّر تحميل الملف » (impossible de charger), « يُرجى إدخال… » (veuillez saisir), « لديك 3 مواعيد » (vous avez 3 rendez-vous, « لديك » sans voyelle finale reste neutre à l'écrit). Pas de « ·e » à la française, pas de barre oblique (« مسجّل/ة »).
4. **Aucun accord de genre pour la personne suivie.** « Suivi·e depuis » devient « بداية المتابعة » (début du suivi) ; « Archivé·e le » devient « تاريخ الأرشفة » ; « Adressé·e par » devient « جهة الإحالة ». Les désignations (« مريض », « عميل ») sont au masculin grammatical, qui sert de forme générique en arabe comme dans les formulaires administratifs ; on ne leur accorde pas de verbe quand une tournure nominale existe.
5. **Les verbes des liens s'accordent au masculin**, parce que leur sujet grammatical est toujours « المُدخَل » (l'entrée, masculin) : « يُثير », « يُخفِّف », « يلي ». Voir section 6.
6. **Six formes de pluriel.** Angular (ICU, règles CLDR) distingue pour l'arabe `zero` (0), `one` (1), `two` (2), `few` (3 à 10), `many` (11 à 99) et `other` (le reste). Le classement se fait sur les deux derniers chiffres : 103 à 110 sont `few`, 111 à 199 sont `many`, 100, 101, 102, 200… sont `other`, comme les nombres décimaux. Côté psymate-api, `messages_*.properties` emploie `{0,choice,…}` (`java.text.ChoiceFormat`), qui ne connaît pas ces catégories : M16-04 écrit les plages à la main (0, 1, 2, 3 à 10, 11 et plus, en reformulant au besoin) ou adopte un format ICU, et le dit dans sa PR. Chaque message au pluriel porte les six formes, chacune juste. Exemple avec « séance » :

   | Forme | Nombres | Texte |
   | --- | --- | --- |
   | `zero` | 0 | لا جلسات |
   | `one` | 1 | جلسة واحدة |
   | `two` | 2 | جلستان |
   | `few` | 3 à 10 | {n} جلسات |
   | `many` | 11 à 99 | {n} جلسة |
   | `other` | 100, 101, 102, 200… | {n} جلسة |

   Pour « entrée » : لا مُدخَلات · مُدخَل واحد · مُدخَلان · {n} مُدخَلات · {n} مُدخَلًا · {n} مُدخَل. Pour « jour » : لا أيام · يوم واحد · يومان · {n} أيام · {n} يومًا · {n} يوم. Quand l'accord rend une phrase lourde, on la reformule avec une étiquette : « عدد الجلسات: {n} » (nombre de séances : n).
7. **Chiffres latins** partout (0 à 9), calendrier grégorien, semaine commençant le lundi (Q71). Les dates sont mises en forme par `Intl` avec la locale `ar-u-ca-gregory-hc-h23-nu-latn` (Q73) : on n'écrit jamais une date à la main dans un texte.
8. **Ponctuation arabe** : virgule « ، », point-virgule « ؛ », point d'interrogation « ؟ ». Les guillemets « » restent. Le point final et les deux-points sont les mêmes qu'en français. Pas d'espace avant « : », « ؟ » ni « ! ».
9. **Restent en caractères latins** : « PsyMate », les codes d'erreur, les noms de champs, les adresses e-mail, les URL, les codes de double authentification et de secours, les sigles officiels sans équivalent arabe d'usage (ADELI, RPPS, EMDR, ICF, EMCC, RNCP, SIRET, IBAN), les noms de format (PDF, Markdown, JPG, PNG), les touches du clavier (Ctrl, Maj, Échap restent « Ctrl », « Shift », « Esc »).
10. **Unités** : minute « دقيقة » (abrégée « د » seulement si la place manque), heure « ساعة » (« س »), jour « يوم » (« ي »), mégaoctet « ميغابايت » (abrégé « MB »), kilooctet « كيلوبايت » (« KB »). L'abréviation française « 30 j » devient « 30 يومًا » en toutes lettres ; « 1 h 15 » devient « ساعة و15 دقيقة ».
11. **Pas de majuscule** : l'arabe n'en a pas. Les messages qui distinguent « patient » et « Patient » (`subject.patient.one` et `subject.patient.One`) reçoivent la même traduction.
12. **Phrases assemblées.** Quand une phrase française insère un nom de type ou d'émotion en minuscules, la traduction arabe ne compte pas sur l'insertion : la tâche de feature crée un message entier par cas (M4.4 point 9), et c'est ce message qu'on traduit.

## 2. Produit, personnes et rôles

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| — | PsyMate | PsyMate | PsyMate | — | Toujours en caractères latins, isolé par `<bdi>` dans une phrase. | |
| `subject.patient.*` | patient, patients | patient, patients | مريض، مرضى | مُراجِع، مُراجِعون | « مريض » est le terme le plus compris ; « مراجع » (celui qui consulte) est employé dans les cliniques du Golfe et évite la connotation de maladie. À trancher par le relecteur. | |
| `subject.client.*` | client, clients | client, clients | عميل، عملاء | مستفيد، مستفيدون | Désignation choisie par les coachs (préférence `vocabulary.subjectLabel`). | |
| `preferences.subject.label` | Désignation des personnes suivies | — | تسمية الأشخاص المتابَعين | — | | |
| — | personne suivie | person being followed | الشخص المتابَع | — | Forme générique, sans accord. | |
| — | praticien, praticiens | practitioner, practitioners | الممارس، الممارسون | المختص، المختصون | Désigne ensemble psychologues, psychiatres et coachs. « مختص » est très employé au Maghreb (« مختص نفسي »). | |
| `profession.psychologist` | Psychologue | Psychologist | أخصائي نفسي | مختص نفسي، معالج نفسي | Forme masculine générique, comme dans les registres officiels. | |
| `profession.psychiatrist` | Psychiatre | Psychiatrist | طبيب نفسي | أخصائي الطب النفسي | | |
| `profession.coach` | Coach | Coach | مدرّب | كوتش | « كوتش » est répandu mais emprunté ; « مدرّب » est compris partout. | |
| — | administrateur | administrator | مسؤول | مشرف | « مسؤول النظام » si une précision est utile. | |
| — | visiteur | visitor | زائر | — | Personne sans compte sur les pages publiques. | |
| `agenda.detail.guest`, `agenda.guest.purged` | invité (rendez-vous pris en ligne) | guest | ضيف | زائر | Personne sans dossier qui a demandé un rendez-vous. | |
| — | compte | account | حساب | — | | |
| — | espace praticien | practitioner area | مساحة الممارس | فضاء الممارس | « فضاء » est l'usage du Maghreb. | |

## 3. Écrans, navigation et sections

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `navRail.patients` | Patients (liste) | Patients | المرضى | قائمة المرضى | Suit la désignation choisie (section 2). | |
| `navRail.agenda` | Agenda | Calendar | المواعيد | الأجندة | « الأجندة » est courant au Maghreb ; « المواعيد » se comprend partout. | |
| `shortcuts.1` | Vue d'ensemble | Overview | نظرة عامة | ملخّص الملف | | |
| `shortcuts.2` | Timeline | Timeline | الخط الزمني | التسلسل الزمني | | |
| `shortcuts.3` | Graphe | Graph | شبكة الروابط | المخطط | Évite « رسم بياني », qui désigne une courbe ou un histogramme. | |
| `search.*` | Recherche dans le dossier | Search | البحث في الملف | — | | |
| `profile360.heading` | Profil 360 | 360 profile | الملف الشامل 360 | الملف 360 | Le nombre reste en chiffres latins. | |
| — | Dossier patient | Patient record | ملف المريض | الملف السريري | | |
| `patients.*` | Fiche patient | Patient details | بطاقة المريض | بيانات المريض | Écran d'identité et de cadre (fiche 16). | |
| `accountNav.label` | Mon compte | My account | حسابي | — | | |
| `accountNav.profile` | Profil public | Public profile | الملف العام | الصفحة العامة | | |
| `accountNav.preferences` | Préférences | Preferences | التفضيلات | الإعدادات | | |
| `accountNav.emotions` | Émotions personnalisées | Custom emotions | المشاعر المخصّصة | — | | |
| `accountNav.verification` | Dossier professionnel | Professional file | الملف المهني | — | | |
| `accountNav.security` | Compte et sécurité | Account and security | الحساب والأمان | — | | |
| `accountNav.data` | Données et export | Data and export | البيانات والتصدير | — | | |
| `adminBar.nav.label` | Administration | Administration | الإدارة | لوحة الإدارة | | |
| `adminBar.tab.validation` | Validation | Validation | التحقّق | المصادقة | File des dossiers professionnels à vérifier. | |
| `adminBar.tab.practitioners` | Praticiens | Practitioners | الممارسون | المختصون | | |
| `adminBar.tab.journal` | Journal | Log | السجلّ | سجلّ الإجراءات | | |
| `adminBar.tab.vocabulary` | Vocabulaire | Vocabulary | المفردات | قوائم المصطلحات | Vocabulaire de l'annuaire et catalogues. | |
| `public.*` | Annuaire (des praticiens) | Directory | دليل الممارسين | الدليل | | |
| `public.*` | Comment ça marche | How it works | كيف يعمل PsyMate | طريقة العمل | | |
| `public.*` | Mentions légales | Legal notice | الإشعار القانوني | المعلومات القانونية | | |
| `public.*` | Confidentialité | Privacy | الخصوصية | سياسة الخصوصية | | |
| `public.*` | Accessibilité | Accessibility | إمكانية الوصول | سهولة الاستخدام | | |
| `auth.*` | Connexion | Sign in | تسجيل الدخول | الدخول | | |
| `auth.*` | Inscription, créer un compte | Sign up | إنشاء حساب | التسجيل | | |
| `appBar.menu.logout` | Déconnexion | Sign out | تسجيل الخروج | الخروج | | |
| `shortcuts.help.title` | Raccourcis clavier | Keyboard shortcuts | اختصارات لوحة المفاتيح | — | | |
| `appBar.skip` | Aller au contenu | Skip to content | الانتقال إلى المحتوى | — | | |

## 4. Types d'entrée (catalogue global `entry_type`)

Le masculin de « مُدخَل » (entrée) sert de sujet grammatical aux verbes des liens (règle 5). Les types eux-mêmes gardent leur genre propre dans les phrases qui les nomment.

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| — | entrée, entrées | entry, entries | مُدخَل، مُدخَلات | قيد، قيود | « مدخل » est le terme des logiciels de dossier ; « قيد » est plus administratif. | |
| `note` | Note | Note | ملاحظة | — | Regard du praticien, pas un fait de la personne suivie. | |
| `event` | Événement | Event | حدث | واقعة | | |
| `situation` | Situation | Situation | وضعية | ظرف | Contexte qui dure (chômage, séparation). « موقف » désigne plutôt une scène ponctuelle ; « حالة » se confondrait avec le cas clinique. | |
| `feeling` | Ressenti | Feeling | شعور | إحساس | Pluriel : مشاعر. | |
| `session` | Séance | Session | جلسة | — | | |
| `medication` | Médicament | Medication | دواء | علاج دوائي | Pluriel : أدوية. | |

## 5. Émotions du catalogue global (`emotion`, E5.2)

### 5.1 Familles (Plutchik)

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `joy` | Joie | Joy | الفرح | البهجة | | |
| `trust` | Confiance | Trust | الثقة | — | | |
| `fear` | Peur | Fear | الخوف | — | | |
| `surprise` | Surprise | Surprise | المفاجأة | الدهشة | | |
| `sadness` | Tristesse | Sadness | الحزن | — | | |
| `disgust` | Dégoût | Disgust | الاشمئزاز | النفور | | |
| `anger` | Colère | Anger | الغضب | — | | |
| `anticipation` | Anticipation | Anticipation | الترقّب | التوقّع | | |
| `vocabulary.table.family` | Famille (d'émotions) | Family | فئة | عائلة | « عائلة » est littéral mais se confond avec la rubrique « Famille et entourage ». | |

Les libellés de famille prennent l'article (« الفرح ») ; les libellés d'émotion n'en prennent pas, pour s'insérer dans une liste ou une puce.

### 5.2 Émotions (24 + 5)

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `serenity` | Sérénité | Serenity | صفاء | سكينة | Joie, niveau 1. | |
| `joy` | Joie | Joy | فرح | بهجة | Joie, niveau 2. | |
| `ecstasy` | Extase | Ecstasy | نشوة | غبطة | Joie, niveau 3. | |
| `acceptance` | Acceptation | Acceptance | تقبّل | قبول | Confiance, niveau 1. | |
| `trust` | Confiance | Trust | ثقة | — | Confiance, niveau 2. | |
| `admiration` | Admiration | Admiration | إعجاب | — | Confiance, niveau 3. | |
| `apprehension` | Appréhension | Apprehension | توجّس | خشية | Peur, niveau 1. | |
| `fear` | Peur | Fear | خوف | — | Peur, niveau 2. | |
| `terror` | Terreur | Terror | رعب | ذعر | Peur, niveau 3. | |
| `distraction` | Distraction | Distraction | شرود | تشتّت | Surprise, niveau 1. | |
| `surprise` | Surprise | Surprise | مفاجأة | — | Surprise, niveau 2. | |
| `amazement` | Stupéfaction | Amazement | ذهول | دهشة | Surprise, niveau 3. | |
| `pensiveness` | Mélancolie | Pensiveness | شجن | كآبة خفيفة | Tristesse, niveau 1. « سوداوية » est le terme psychiatrique de la mélancolie (forme grave) : à éviter ici. | |
| `sadness` | Tristesse | Sadness | حزن | — | Tristesse, niveau 2. | |
| `grief` | Chagrin | Grief | أسى | لوعة | Tristesse, niveau 3. Ne pas confondre avec le deuil de l'annuaire (« الحِداد »). | |
| `boredom` | Ennui | Boredom | ملل | ضجر | Dégoût, niveau 1. | |
| `disgust` | Dégoût | Disgust | اشمئزاز | — | Dégoût, niveau 2. | |
| `loathing` | Répulsion | Loathing | نفور | تقزّز | Dégoût, niveau 3. « نفور » est aussi la variante de la famille : si le relecteur la retient pour la famille, prendre « تقزّز » ici. | |
| `annoyance` | Agacement | Annoyance | انزعاج | ضيق | Colère, niveau 1. | |
| `anger` | Colère | Anger | غضب | — | Colère, niveau 2. | |
| `rage` | Rage | Rage | هياج | غضب عارم | Colère, niveau 3. « هياج » tire vers l'agitation ; « غضب عارم » est plus sûr pour le sens. | |
| `interest` | Intérêt | Interest | اهتمام | — | Anticipation, niveau 1. | |
| `anticipation` | Anticipation | Anticipation | ترقّب | توقّع | Anticipation, niveau 2. | |
| `vigilance` | Vigilance | Vigilance | يقظة | حذر | Anticipation, niveau 3. | |
| `anxiety` | Anxiété | Anxiety | قلق | — | Ajout clinique, famille peur. | |
| `guilt` | Culpabilité | Guilt | شعور بالذنب | ذنب | Ajout clinique, famille tristesse. | |
| `shame` | Honte | Shame | خزي | عار | Ajout clinique, famille dégoût. « خجل » veut dire timidité ou gêne : à éviter. | |
| `emptiness` | Vide | Emptiness | شعور بالفراغ | خواء | Ajout clinique, famille tristesse. | |
| `calm` | Calme | Calm | هدوء | سكون | Ajout clinique, famille confiance. | |

Une émotion créée par un praticien n'a qu'un libellé, celui qu'il a saisi : elle ne se traduit pas (M9).

## 6. Types de lien (catalogue global `link_type`, E5.3)

Les verbes sont au présent, au masculin (règle 5). L'inverse se lit de la cible vers la source. Ce tableau n'a pas de colonne « Remarque » : la colonne « Inverse proposé » la remplace. Ils sont rendus par le serveur selon `Accept-Language` (M16-03).

| Clé | Français | Anglais | Proposition | Inverse proposé (fr : inverse) | Variante | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `triggers` | déclenche | triggers | يُثير | يُثيره (déclenché par) | يُثار بـ (inverse) ؛ يُطلِق (sens direct) | |
| `caused_by` | est causé par | is caused by | ناتج عن | يُسبِّب (cause) | سببه | |
| `worsens` | aggrave | worsens | يُفاقِم | يتفاقم بسبب (aggravé par) | يزيد من حدّة | |
| `relieves` | soulage | relieves | يُخفِّف | يخفّ بفضل (soulagé par) | يُهدّئ | |
| `co_occurs` | survient avec | co-occurs with | يتزامن مع | — (lien non orienté) | يحدث مع | |
| `follows` | fait suite à | follows | يلي | يليه (suivi de) | يأتي بعد | |
| `part_of` | fait partie de | is part of | جزء من | يتضمّن (comprend) | يشمل | |
| `treats` | traite | treats | يُعالِج | يُعالَج بـ (traité par) | — | |

Autres termes des liens :

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `links.*` | lien, liens | link, links | رابط، روابط | صلة، صلات | | |
| `links.*` | Lier, lier deux entrées | Link | ربط | — | Nom verbal. | |
| `graph.*` | Source | Source | المصدر | — | | |
| `graph.*` | Cible | Target | الهدف | الوجهة | | |
| `links.*` | Inverser le sens | Reverse direction | عكس الاتجاه | — | | |
| `graph.*` | Nom des liens | Link names | أسماء الروابط | — | | |
| `graph.*` | Chaîne causale | Causal chain | السلسلة السببية | — | Lecture du graphe (G Q58). | |
| `graph.*` | Colonnes par type | Columns by type | أعمدة حسب النوع | — | | |
| `graph.*` | Chronologie | Chronology | التسلسل الزمني | — | | |
| `graph.*` | Gauche → droite | Left → right | في اتجاه القراءة | من اليمين إلى اليسار | En arabe, le sens horizontal suit la lecture (Q75) : le libellé ne parle plus de gauche ni de droite. | |
| `graph.*` | Haut → bas | Top → bottom | من الأعلى إلى الأسفل | — | | |
| `graph.*` | Recentrer | Recenter | إعادة التوسيط | — | | |
| `graph.*` | Racine | Root | الجذر | نقطة الانطلاق | Entrée sur laquelle le graphe est centré. | |
| `graph.*` | Profondeur | Depth | العمق | — | | |
| `links.editor.relation` | Relation (type de lien choisi) | Relation | العلاقة | نوع الرابط | | |
| `links.rationale.title` | Pourquoi (justification du lien) | Why | السبب | المبرّر | | |
| `graph.legend.group` | Groupe d'entrées | Entry group | مجموعة مُدخَلات | — | Bloc d'entrées sœurs (G Q58). | |
| `graph.*` | nœud, nœuds | node, nodes | عقدة، عُقد | — | Employé par M16-27 ; le nombre suit une étiquette (« العُقد: 12 ») pour éviter l'accord. | |
| `graph.root.label` | Centré sur (sélecteur de la racine) | Centred on | المركز | — | Employé par M16-27 ; un nom plutôt qu'un participe, pour éviter l'accord. | |
| `graph.detail.expand`, `graph.table.expand` | Déplier (un groupe) | Expand | توسيع | — | Employé par M16-27 ; « à déplier » : « قابلة للتوسيع ». | |
| `graph.reading.label`, `graph.direction.label` | Lecture, Sens (du graphe) | Reading, Direction | القراءة، الاتجاه | — | Employé par M16-27. | |
| `graph.legend.toggle` | Légende | Legend | مفتاح الرسم | — | Employé par M16-27, comme dans la timeline (M16-27, première moitié). | |
| `graph.legend.*Name` | trait plein, tirets longs, tirets courts, pointillé, trait fin, trait double | solid, long dash, short dash, dotted, thin, double | خط متّصل، شرطات طويلة، شرطات قصيرة، خط منقّط، خط رفيع، خط مزدوج | — | Employé par M16-27 ; « flèche vers la cible » : « سهم نحو الهدف ». | |
| `graph.table.provenance`, `graph.provenance.*` | Provenance : manuel, suggéré, suggéré et confirmé | Provenance | الأصل: يدوي، مقترح، مقترح ومؤكَّد | — | Employé par M16-27 ; « المصدر » est déjà pris par la source du lien. | |
| `graph.table.status`, `graph.status.*` | Statut : accepté, suggéré | Status | الحالة: مقبول، مقترح | — | Employé par M16-27 (accord avec « الرابط », masculin). | |
| `graph.column.responses` | Réponses (traitements, séances) | Responses | الاستجابات | — | Employé par M16-27 (colonne de la lecture par type). | |
| `graph.group.emotion` | majoritaire (émotion d'un groupe) | dominant | الغالب: … | — | Employé par M16-27 ; l'étiquette précède l'émotion pour éviter l'accord. | |
| `links.leave.*` | Abandonner (un lien en cours) | Discard | تجاهل | — | Employé par M16-27 ; « إلغاء » reste réservé à Annuler. | |
| `links.saved.undo` | Annuler (défaire, dans un toast) | Undo | تراجع | — | Employé par M16-27 ; « Lien annulé » : « تم التراجع عن الرابط ». | |
| `links.editor.*` | Éditeur de lien | Link editor | محرّر الروابط | — | Employé par M16-27. | |

## 7. Dossier, séance et suivi

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `patientShell.*` | Démarrer la séance | Start session | بدء الجلسة | — | | |
| `patientShell.*` | Clôturer la séance | Close session | إنهاء الجلسة | اختتام الجلسة | | |
| `sessionBar.*` | Séance en cours | Session in progress | جلسة جارية | — | | |
| `patientShell.*` | Hors séance | Outside session | خارج الجلسة | — | | |
| `patientShell.*` | Compte rendu | Session notes | محضر الجلسة | تقرير الجلسة | | |
| `patientShell.context.label` | Contexte de la séance | Session context | سياق الجلسة | — | | |
| `patientShell.close.prompt.*` | Objectif, thème (à la clôture) | Goal, theme | هدف، محور | موضوع (thème) | Boutons « + Objectif », « + Thème » : « + هدف »، « + محور ». | |
| `overview.*` | Synthèse | Summary | الخلاصة | الملخّص | | |
| `overview.*` | Dernière séance | Last session | آخر جلسة | — | | |
| `overview.*` | Depuis la dernière séance | Since last session | منذ آخر جلسة | — | | |
| `overview.*` | Prochaine fois | Next time | في الجلسة القادمة | — | | |
| `overview.*` | En bref | In brief | باختصار | — | Résumé rédigé par le serveur (en français tant que M16-30 n'est pas faite). | |
| `overview.*` | Cadre du suivi | Care framework | إطار المتابعة | — | | |
| `overview.*` | Suivi | Follow-up | المتابعة | — | | |
| `overview.*` | Suivi conjoint | Joint care | متابعة مشتركة | — | | |
| `patients.*` | Suivi·e depuis, début du suivi | Followed since | بداية المتابعة | — | Tournure sans accord (règle 4). | |
| `patients.*` | Motif initial | Initial reason | سبب الاستشارة الأولي | سبب المراجعة | | |
| `patients.*` | Adressé·e par | Referred by | جهة الإحالة | مُحال من طرف | Tournure sans accord. | |
| `patients.*` | Phase de vie | Life stage | المرحلة العمرية | مرحلة الحياة | | |
| `patients.*` | Date de naissance | Date of birth | تاريخ الميلاد | — | | |
| `patients.*` | Pronom / accord | Pronoun | الضمير وصيغة المخاطبة | — | Les valeurs « Il », « Elle », « Iel » restent celles de la langue de saisie du dossier. | |
| `patients.*` | Prénom, Nom de famille | First name, Last name | الاسم الأول، اسم العائلة | الاسم، اللقب | « اللقب » est l'usage du Maghreb pour le nom de famille. | |
| `overview.*` | Drapeau, drapeaux | Flag | علامة تنبيه، علامات تنبيه | إشارة | Point clinique signalé par le praticien. | |
| `overview.*` | Risque | Risk | خطر | — | | |
| `overview.*` | Point d'attention | Point of attention | نقطة تستدعي الانتباه | — | | |
| `overview.*` | À surveiller | To watch | للمتابعة الدقيقة | يستدعي المراقبة | | |
| `overview.*` | À compléter | To complete | يحتاج إلى استكمال | — | | |
| `patients.*` | Tag, tags | Tag | وسم، وسوم | تصنيف | Étiquette libre du praticien. | |
| `patients.*` | Archiver, archivé | Archive, archived | أرشفة، مؤرشف | — | « تاريخ الأرشفة » pour « Archivé·e le ». | |
| `patients.*` | Restaurer | Restore | استعادة | — | | |
| `vocabulary.merge.*` | Fusionner, fusion | Merge | دمج | — | Fusion de deux émotions ou étiquettes du praticien. | |
| `vocabulary.journal.*` | Journal des fusions | Merge log | سجلّ الدمج | — | | |
| `vocabulary.rename.*` | Renommer | Rename | إعادة التسمية | — | | |
| `patients.*` | Afficher les archivés | Show archived | عرض الملفات المؤرشفة | — | | |
| `patients.*` | Patient de démonstration | Demo patient | ملف تجريبي | ملف للعرض | Le nom « DEMO » reste en caractères latins. | |
| `entries.*` | Brouillon | Draft | مسودّة | — | | |
| `entries.*` | Version, historique des versions | Version history | نسخة، سجلّ النسخ | — | | |
| `entries.*` | Corriger l'entrée | Correct entry | تصحيح المُدخَل | — | | |
| `entries.*` | Intensité, intensité moyenne | Intensity | الشدّة، متوسّط الشدّة | — | | |
| `entries.*` | Quand, précision de la date | When, date precision | متى، دقّة التاريخ | — | | |
| `entries.*` | Durée | Duration | المدّة | — | | |
| `entries.*` | Molécule | Molecule | المادّة الفعّالة | الدواء | | |
| `entries.*` | Posologie, dose | Dosage, dose | الجرعة، جرعة | طريقة الاستعمال (posologie) | | |
| `entries.*` | Médecin / prescripteur | Prescriber | الطبيب الواصف | — | | |
| `entries.*` | Début de traitement, fin de traitement | Treatment start, end | بداية العلاج، نهاية العلاج | — | | |
| `overview.*` | Traitement en cours | Current treatment | علاج جارٍ | — | | |
| `entries.*` | Visibilité : clinique, privée | Clinical, private | سريري، خاص | — | Une entrée privée n'est jamais exportée. | |
| `timeline.*` | Chronologique, par séance, décennie | Chronological, by session, decade | حسب التسلسل الزمني، حسب الجلسة، العَقد | — | Vues de la timeline. | |
| `timeline.*` | Filtres | Filters | عوامل التصفية | الفلاتر | | |
| `timeline.*` | Période | Period | الفترة | — | | |
| `preferences.window.*` | Fenêtre d'analyse | Analysis window | فترة التحليل | — | | |
| `capture.*` | Noter quelque chose | Note something | تدوين ملاحظة | — | Bloc de saisie. | |
| `capture.*` | Nouvelle entrée | New entry | مُدخَل جديد | — | | |
| `search.*` | Résultats approchés | Approximate results | نتائج تقريبية | — | | |
| `account.data.*` | Exporter, exporter le dossier | Export | تصدير، تصدير الملف | — | | |
| `subject.*` | patient, client insérés dans une phrase | — | مريض، عميل (singulier) ; المرضى، العملاء (pluriel) | — | Employé par M16-27. Le singulier reste indéfini (« مريض جديد », « إضافة أول مريض ») ; le pluriel porte l'article, parce qu'il suit toujours un nom ou un verbe (« قائمة المرضى », « تصفية المرضى »). Capitale et minuscule identiques (règle 11). | |
| `overview.*`, `timeline.*` | émotion (dans l'interface) | emotion | شعور، مشاعر | انفعال، انفعالات | Employé par M16-27. Le glossaire n'a qu'un terme pour « ressenti » et « émotion » (« المشاعر المخصّصة ») : les deux se confondent en arabe. « انفعال » les distinguerait ; à trancher par le relecteur. | |
| `patientShell.*`, `timeline.*` | Clôturer (bouton court), non clôturée | Close, not closed | إنهاء، لم تُنهَ | — | Employé par M16-27, sur le modèle de « إنهاء الجلسة ». | |
| `sessionBar.*`, `patients.*` | Reprendre (une séance ouverte) | Resume | استئناف | — | Employé par M16-27. | |
| `patientShell.*` | Noter, noté (en séance) | Note, noted | تدوين، مدوَّن | — | Employé par M16-27, sur le modèle de « تدوين ملاحظة ». | |
| `overview.session.kind.*`, `timeline.sessionKind.*` | Accueil, séance d'accueil ; contact | Intake ; contact | جلسة استقبال، استقبال ؛ تواصل | — | Employé par M16-27 : natures de séance. | |
| `patientHeader.*`, `patients.preview.*` | En-tête (du dossier) | Header | الترويسة | رأس الملف | Employé par M16-27. | |
| `patients.field.*` | Situation, activité (champs de la fiche) | Situation, occupation | الوضعية، النشاط | الوضع الاجتماعي، المهنة | Employé par M16-27. « الوضعية » reprend le type d'entrée ; à distinguer si le relecteur le juge utile. | |
| `patients.field.history` | Histoire et éléments à garder en tête | History | السيرة وعناصر للتذكّر | — | Employé par M16-27. | |
| `patients.field.rhythm` | Rythme habituel (hebdomadaire, mensuel, irrégulier) | Usual rhythm | الوتيرة المعتادة (أسبوعي، شهري، غير منتظم) | — | Employé par M16-27. | |
| `patients.rail.flags.*`, `patients.form.flag.setAt` | Drapeau posé, posé le | Flag set | علامة مُفعّلة، تاريخ التفعيل | — | Employé par M16-27. | |
| `overview.*` | Repère de médicament | Medication marker | علامة الدواء | — | Employé par M16-27 (courbe des ressentis). | |
| `timeline.decade.*` | Agrégat par mois | Monthly aggregate | التجميع الشهري | — | Employé par M16-27 (vue décennie). | |
| `timeline.*` | Zoom avant, zoom arrière | Zoom in, zoom out | تكبير، تصغير | — | Employé par M16-27. | |
| — | min (abréviation de durée) | min | د | — | Employé par M16-27 dans les puces et les barres étroites (règle 10) ; évite l'accord du nom après le nombre. | |
| `entries.*`, `capture.*`, `search.*` | Visibilité (d'une entrée) | Visibility | الظهور | — | Employé par M16-27 ; valeurs « سريري »، « خاص » au masculin, accordées à « المُدخَل ». | |
| `entries.*`, `capture.*` | Éditeur (d'entrée) | Editor | المحرّر | محرّر المُدخَل | Employé par M16-27. | |
| `entries.*`, `capture.*`, `patientShell.*` | Barre de capture, barre de saisie | Capture bar | شريط الإدخال | — | Employé par M16-27 (les deux moitiés). | |
| `capture.*`, `entries.rail.*` | Lié à… (rangée des liens) | Linked to… | مرتبط بـ… | — | Employé par M16-27 ; masculin, accordé à « المُدخَل ». | |
| `capture.warning.*` | Préfixe (de saisie : /evt, /sit, /med) | Prefix | البادئة | — | Employé par M16-27 ; les préfixes restent en caractères latins. | |
| `capture.precision.*`, `entries.precision.*` | Précision : exacte, au jour, au mois, à l'année | Precision | الدقّة: دقيق، يوم، شهر، سنة ؛ « على مستوى اليوم » dans l'aperçu | — | Employé par M16-27. | |
| `entries.grace.*` | Fenêtre de grâce (1 h 15) | Grace period | مهلة التصحيح | — | Employé par M16-27, forme courte de « مهلة التصحيح دون نسخة جديدة » (section 11). | |
| `entries.reason.label` | Motif de la correction | Reason for correction | سبب التصحيح | — | Employé par M16-27. | |
| `entries.emotion.level*` | faible, forte (niveau d'une émotion) | low, high | شدّة منخفضة، شدّة عالية | — | Employé par M16-27 ; un nom plutôt qu'un adjectif, pour éviter l'accord. | |
| `entries.emotion.customTag` | personnalisée (émotion) | custom | مخصّص | — | Employé par M16-27, accordé à « شعور ». | |
| `search.*` | Aperçu (de l'entrée sélectionnée) | Preview | معاينة | — | Employé par M16-27. | |
| `search.preview.recorded` | Saisi (date d'enregistrement) | Recorded | تاريخ الإدخال | — | Employé par M16-27. | |
| `search.*` | trigrammes ; sans accents ni casse | trigrams | مقاطع ثلاثية ؛ دون اعتبار للنبرات ولا لحالة الأحرف | — | Employé par M16-27. Ne promet pas que l'API ignore les voyelles brèves de l'arabe (تشكيل) : non vérifié. | |
| `search.help.example.*` | Jetons de recherche (tag:, émotion:, avant:, après:) | Search tokens | tag:، emotion:، before:، after: | — | Employé par M16-27 : les jetons restent en caractères latins, sous leur forme anglaise acceptée par l'API ; l'exemple d'émotion emploie le code (« emotion:anxiety »). | |
| `profile360.*` | Profil (forme courte de Profil 360) | Profile | الملف الشامل | — | Employé par M16-27. | |
| `vocabulary.*` | Vocabulaire global (des émotions) | Global vocabulary | المفردات العامة | — | Employé par M16-28 ; « مفرداتي » pour « mon vocabulaire ». | |
| `vocabulary.*` | Libellé (d'une émotion, d'un tag) | Label | التسمية | — | Employé par M16-28. | |
| `vocabulary.tags.*` | Réétiqueter (après une fusion de tags) ; mot-clé | Relabel ; keyword | إعادة الوسم ؛ كلمة مفتاحية | — | Employé par M16-28. | |
| `vocabulary.intro` | Plutchik (modèle des émotions) | Plutchik | بلوتشيك | — | Employé par M16-28 : nom propre transcrit. | |

## 8. Profil 360

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `profile360.category.history` | Histoire et souvenirs | History and memories | السيرة والذكريات | التاريخ الشخصي والذكريات | | |
| `profile360.category.family` | Famille et entourage | Family and circle | العائلة والمحيط | الأسرة والمقرّبون | | |
| `profile360.category.health` | Santé et antécédents | Health and history | الصحّة والسوابق | الصحّة والتاريخ المرضي | | |
| `profile360.category.values_goals` | Valeurs et projets | Values and goals | القيم والمشاريع | القيم والأهداف | | |
| `profile360.panel.category` | Rubrique | Section | باب | قسم | | |
| `profile360.panel.title` | Information | Item | معلومة | — | | |
| `profile360.panel.detail` | Précision | Detail | تفصيل | — | | |

## 9. Annuaire et profil public (catalogue global `directory_vocabulary`)

### 9.1 Spécialités (`specialty`)

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `anxiety` | Anxiété | Anxiety | القلق | — | | |
| `depression` | Dépression | Depression | الاكتئاب | — | | |
| `cbt` | Thérapie cognitivo-comportementale (TCC) | Cognitive behavioural therapy (CBT) | العلاج المعرفي السلوكي | العلاج المعرفي السلوكي (CBT) | Pas de sigle arabe d'usage. | |
| `emdr` | EMDR | EMDR | EMDR | إزالة التحسّس وإعادة المعالجة بحركة العين (EMDR) | Sigle conservé en caractères latins. | |
| `couple_therapy` | Thérapie de couple | Couple therapy | العلاج الزوجي | العلاج الأسري للأزواج | | |
| `burnout` | Burn-out | Burnout | الاحتراق النفسي | الإنهاك المهني | | |
| `adhd` | TDAH | ADHD | اضطراب فرط الحركة وتشتّت الانتباه | ADHD | | |
| `addictions` | Addictions | Addictions | الإدمان | — | | |
| `trauma_ptsd` | Traumatismes et stress post-traumatique | Trauma and PTSD | الصدمات النفسية واضطراب ما بعد الصدمة | — | | |
| `phobias` | Phobies | Phobias | الرهاب | المخاوف المرضية | | |
| `ocd` | TOC | OCD | الوسواس القهري | اضطراب الوسواس القهري | | |
| `eating_disorders` | Troubles du comportement alimentaire | Eating disorders | اضطرابات الأكل | اضطرابات السلوك الغذائي | | |
| `bipolar` | Troubles bipolaires | Bipolar disorders | الاضطراب ثنائي القطب | — | | |
| `grief` | Deuil | Grief | الحِداد | الفقد | | |
| `self_esteem` | Estime de soi | Self-esteem | تقدير الذات | — | | |
| `stress_management` | Gestion du stress | Stress management | إدارة الضغط النفسي | إدارة التوتّر | | |
| `sleep_disorders` | Troubles du sommeil | Sleep disorders | اضطرابات النوم | — | | |
| `autism_spectrum` | Troubles du spectre autistique | Autism spectrum | اضطراب طيف التوحّد | — | | |
| `parenting` | Parentalité | Parenting | الوالدية | دعم الوالدين | | |
| `career_coaching` | Accompagnement professionnel | Career coaching | التوجيه المهني | الإرشاد المهني | | |
| `mindfulness` | Pleine conscience | Mindfulness | اليقظة الذهنية | التأمّل الواعي | | |
| `psychodynamic` | Approche psychodynamique | Psychodynamic approach | المقاربة الدينامية النفسية | العلاج النفسي الدينامي | | |

### 9.2 Publics (`audience`)

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `adults` | Adultes | Adults | البالغون | الكبار | | |
| `young_adults` | Jeunes adultes | Young adults | الشباب | البالغون الشباب | | |
| `adolescents` | Adolescents | Adolescents | المراهقون | — | | |
| `children` | Enfants | Children | الأطفال | — | | |
| `couples_families` | Couples et familles | Couples and families | الأزواج والعائلات | — | | |

### 9.3 Modalités, disponibilité, profil

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `in_person` | Présentiel, au cabinet | In person | حضوريًا | في العيادة | | |
| `video` | En visio | Video | عبر الفيديو | عن بُعد بالفيديو | | |
| `phone` | Par téléphone | Phone | عبر الهاتف | — | | |
| `email` | Par e-mail | Email | عبر البريد الإلكتروني | — | Modalité d'une séance (V05) seulement. | |
| `home` | À domicile | At home | في المنزل | — | Employé par M16-26 (`public.modality.home`). | |
| `public.*` | Modalités (titre de facette ou de section) | Modalities | طرق الاستشارة | — | Employé par M16-26 ; « Modalité par défaut » de la fiche patient : « طريقة الاستشارة الافتراضية » (M16-27). | |
| `public.*` | Publics (titre de facette ou de section) | Audiences | الفئات المستهدفة | — | Employé par M16-26. | |
| `public.*` | Spécialités (titre) | Specialties | التخصّصات | — | Employé par M16-26. | |
| `public.practitioner.*` | Fiche praticien | Practitioner page | بطاقة الممارس | — | Employé par M16-26, sur le modèle de « بطاقة المريض ». | |
| `profile.availability.accepting` | Accepte de nouveaux patients | Accepting new patients | قبول مرضى جدد | يستقبل مرضى جددًا | Le nom verbal évite l'accord avec le praticien (règle 3). | |
| `profile.availability.waitlist` | Liste d'attente | Waitlist | قائمة انتظار | — | | |
| `profile.availability.closed` | Complet | Full | لا أماكن متاحة | مكتمل | | |
| `profile.availability.unknown` | Non précisée | Not specified | غير محدّدة | — | Accordé à « الإتاحة » (féminin), le nom du champ. | |
| `profile.availability` | Disponibilité | Availability | الإتاحة | التوفّر | | |
| `public.*` | Profil vérifié (badge) | Verified profile | ملف موثَّق | ملف تم التحقق منه | | |
| `public.*` | Prendre rendez-vous | Book an appointment | حجز موعد | طلب موعد | | |
| `public.*` | Langues de consultation | Languages | لغات الاستشارة | — | Noms des langues donnés par `Intl.DisplayNames` (Q73). | |
| `public.*` | Tarifs | Fees | الأسعار | الأتعاب | | |
| `public.*` | Formulaire de contact | Contact form | نموذج التواصل | — | | |

## 10. Agenda et prise de rendez-vous

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `agenda.*` | rendez-vous | appointment | موعد، مواعيد | — | | |
| `agenda.*` | Nouveau rendez-vous | New appointment | موعد جديد | — | | |
| `agenda.*` | Planifier le rendez-vous | Schedule | تحديد الموعد | جدولة الموعد | | |
| `agenda.*` | Déplacer le rendez-vous | Reschedule | تغيير الموعد | نقل الموعد | | |
| `agenda.*` | Annuler le rendez-vous | Cancel appointment | إلغاء الموعد | — | | |
| `agenda.*` | Confirmer le rendez-vous | Confirm appointment | تأكيد الموعد | — | | |
| `agenda.*` | à confirmer | tentative | بانتظار التأكيد | — | Statut. | |
| `agenda.*` | Confirmé | Confirmed | مؤكَّد | — | Accordé à « الموعد » (masculin). | |
| `agenda.*` | Annulé | Cancelled | ملغى | — | | |
| `agenda.*` | Passé | Past | منقضٍ | سابق | | |
| `agenda.*` | Créneau | Slot | فترة زمنية | موعد متاح | | |
| `preferences.booking.*` | Plage (horaires ouverts à la réservation) | Booking window | فترة الإتاحة | — | | |
| `agenda.*` | Récurrence, répéter, ne pas répéter | Repeat | التكرار، تكرار، دون تكرار | — | | |
| `agenda.*` | Hebdomadaire, mensuel | Weekly, monthly | أسبوعي، شهري | — | | |
| `agenda.*` | Jusqu'au, nombre de répétitions | Until, occurrences | حتى تاريخ، عدد المرات | — | Six formes de pluriel pour « مرة ». | |
| `agenda.*` | Conflit (chevauchement) | Conflict | تعارض | تداخل | | |
| `agenda.*` | Demande en ligne, demandes en ligne | Online request | طلب عبر الإنترنت، طلبات عبر الإنترنت | — | | |
| `agenda.*` | Refuser la demande | Decline request | رفض الطلب | — | | |
| `agenda.*` | Rattacher à un patient | Attach to patient | ربط بملف مريض | — | | |
| `agenda.*` | Invité purgé | Guest purged | ضيف محذوفة بياناته | — | | |
| `agenda.*` | Jour, semaine, mois, liste | Day, week, month, list | يوم، أسبوع، شهر، قائمة | — | Vues de l'agenda. | |
| `agenda.*` | Aujourd'hui | Today | اليوم | — | | |
| `agenda.*` | Fuseau horaire | Time zone | المنطقة الزمنية | — | | |
| `preferences.booking.*` | Délai minimal, horizon | Minimum notice, horizon | أدنى مهلة، أقصى مدى للحجز | — | | |
| `preferences.booking.mode.*` | Confirmation des demandes (manuelle, automatique) | Request confirmation | تأكيد الطلبات (يدوي، تلقائي) | — | | |
| `preferences.booking.*` | Demandeur (personne qui demande un rendez-vous en ligne) | Requester | مقدّم الطلب | صاحب الطلب | Employé par M16-28 ; masculin générique (règle 4). | |
| `preferences.booking.*` | Plage, plages ouvertes | Booking window | فترة إتاحة، فترات الإتاحة | — | Employé par M16-28 sous la forme indéfinie « فترة إتاحة » pour la distinguer du créneau (« فترة زمنية »). | |
| `public.*` | PsyMate n'est pas un service d'urgence | PsyMate is not an emergency service | PsyMate ليس خدمة طوارئ | — | Les numéros d'urgence restent en chiffres latins. | |
| `agenda.new.note`, `agenda.detail.note` | Note de planification | Scheduling note | ملاحظة الموعد | ملاحظة التخطيط | Employé par M16-28 ; distincte du type d'entrée « ملاحظة ». | |
| `agenda.new.count*`, `agenda.new.countLabel` | Nombre de répétitions, « 5 fois » | Occurrences | عدد المرات، « عدد المرات: 5 » | — | Employé par M16-28 : le code n'a pas de message ICU, le nombre suit une étiquette (règle 6). | |
| `agenda.new.repeat.*` | Toutes les semaines, toutes les 2 semaines, toutes les 4 semaines | Weekly, every 2 weeks | كل أسبوع، كل أسبوعين، كل 4 أسابيع | — | Employé par M16-28. | |
| `agenda.detail.duplicate` | Dupliquer (un rendez-vous) | Duplicate | إنشاء نسخة | — | Employé par M16-28 ; « تكرار » reste réservé à la récurrence. | |
| `agenda.detail.cancelKeep` | Garder (le rendez-vous) | Keep | الإبقاء على الموعد | — | Employé par M16-28. | |
| `agenda.detail.kicker.*`, `agenda.status.done` | Séance planifiée, séance faite ; fait | Planned, done | جلسة مقرَّرة، جلسة منجزة ؛ منجز | — | Employé par M16-28 ; « منجز » s'accorde à « الموعد ». | |
| `agenda.detail.prepare` | Préparer (bloc du détail) | Prepare | التحضير | — | Employé par M16-28. | |
| `agenda.busy.*` | Occupé, indisponible (agenda externe) | Busy | وقت مشغول، فترة انشغال | — | Employé par M16-28 ; un nom plutôt qu'un adjectif accordé au praticien. | |
| `agenda.grid.off` | Non travaillé (jour) | Day off | يوم عطلة | — | Employé par M16-28. | |
| `agenda.calendars.*` | Mes agendas, Google Agenda | My calendars, Google Calendar | تقاويمي، تقويم Google | — | Employé par M16-28 ; « Google » en caractères latins. | |
| `agenda.calendars.phone` | Contacts (appels) | Contacts (calls) | التواصل (مكالمات) | — | Employé par M16-28, comme la nature de séance « تواصل ». | |

Jours de la semaine, du lundi au dimanche : الاثنين، الثلاثاء، الأربعاء، الخميس، الجمعة، السبت، الأحد. Les noms de mois viennent d'`Intl` avec la locale de formatage (يناير، فبراير، مارس…) ; l'usage levantin (كانون الثاني، شباط…) et l'usage maghrébin (جانفي، فيفري…) ne sont pas employés, faute de variante par pays (Q72). À confirmer par le relecteur.

## 11. Compte, sécurité et préférences

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `auth.*` | Adresse e-mail | Email address | البريد الإلكتروني | عنوان البريد الإلكتروني | L'adresse elle-même est en `dir="ltr"`. | |
| `auth.*` | Mot de passe, mot de passe oublié | Password, forgot password | كلمة المرور، هل نسيت كلمة المرور؟ | استعادة كلمة المرور | « نسيت » sans voyelles reste neutre à l'écrit, comme « لديك » (règle 3) ; le nom verbal évite toute lecture genrée. | |
| `preferences.security.twoFactor` | Double authentification | Two-factor authentication | المصادقة الثنائية | التحقّق بخطوتين | | |
| `preferences.security.recoveryCodes` | Codes de secours | Recovery codes | رموز الاسترداد | رموز الاحتياط | Les codes restent en caractères latins, en `dir="ltr"`. | |
| `auth.*` | Code de vérification | Verification code | رمز التحقّق | — | | |
| `preferences.security.sessions` | Sessions actives | Active sessions | الجلسات النشطة | الأجهزة المتّصلة | Risque de confusion avec la séance clinique (« جلسة »). | |
| `preferences.security.revokeOthers` | Déconnecter les autres | Sign out others | تسجيل الخروج من الأجهزة الأخرى | — | | |
| `auth.*` | Journal de sécurité | Security log | سجلّ الأمان | — | Employé par M16-26. | |
| `auth.*` | Sessions ouvertes (connexion) | Open sessions | الجلسات المفتوحة | الجلسات النشطة | Employé par M16-26 ; même risque de confusion avec la séance que « الجلسات النشطة » (section 14). | |
| `auth.firstLogin.*` | Mot de passe temporaire | Temporary password | كلمة المرور المؤقتة | — | Employé par M16-26. | |
| `auth.*` | Compte suspendu | Account suspended | حساب موقوف | — | | |
| `preferences.theme.*` | Thème : clair, doux, sombre, système | Theme | المظهر: فاتح، هادئ، داكن، حسب النظام | — | « Doux » est le contraste doux (étude couleurs). | |
| `preferences.locale.label` | Langue | Language | اللغة | — | Chaque langue est écrite dans sa langue : Français, English, العربية (M16-29). | |
| `preferences.duration.label` | Durée de séance par défaut | Default session length | مدّة الجلسة الافتراضية | — | | |
| `preferences.grace.label` | Délai de correction sans version | Grace period | مهلة التصحيح دون نسخة جديدة | — | | |
| `preferences.visibility.label` | Visibilité par défaut des nouvelles entrées | Default visibility | الظهور الافتراضي للمُدخَلات الجديدة | — | | |
| `account.data.*` | Archive (zip) | Archive | أرشيف مضغوط | ملف zip | | |
| `account.data.yours.hosting.title` | Hébergement (des données de santé) | Hosting | الاستضافة | استضافة البيانات | « Hébergement en France » : « استضافة في فرنسا ». | |
| `public.booking.summary.consent` | Consentement | Consent | الموافقة | الموافقة المسبقة | | |
| `profile.*` | N° professionnel | Professional number | الرقم المهني | — | | |
| `profile.*` | Adresse du cabinet | Practice address | عنوان العيادة | عنوان المكتب | Pour un coach, « المكتب » convient mieux. | |
| `profile.*` | Publier, publié | Publish, published | نشر، منشور | — | | |
| `account.security.*` | Activer, désactiver (la double authentification) ; activée, non activée | Enable, disable | تفعيل، تعطيل ؛ مفعّلة، غير مفعّلة | — | Employé par M16-28 ; l'état s'accorde à « المصادقة » (féminin). | |
| `account.security.*` | Régénérer (les codes de secours) | Regenerate | إعادة توليد | — | Employé par M16-28. | |
| `account.security.*` | Secret (TOTP), QR code | Secret, QR code | المفتاح السرّي، رمز QR | — | Employé par M16-28 ; « QR », « TOTP », « SHA-1 » restent en caractères latins. | |
| `account.security.*` | Application d'authentification | Authenticator app | تطبيق المصادقة | — | Employé par M16-28 (déjà dans `auth.*`). | |
| `account.security.sessions.*` | Appareil, appareils | Device, devices | جهاز، أجهزة | — | Employé par M16-28 ; six formes dans le sous-message ICU (جهاز واحد، جهازان، 3 أجهزة، 11 جهازًا). | |
| `account.security.sessions.revoke` | Déconnecter (une session, un appareil) | Sign out | تسجيل الخروج | — | Employé par M16-28 ; « إنهاء الجلسة » est réservé à la séance clinique. | |
| `account.security.lastLogin.*` | Connexion précédente | Previous sign-in | تسجيل الدخول السابق | — | Employé par M16-28. | |
| `account.data.*` | Préparer, lancer, relancer l'export | Prepare, start, restart export | تحضير التصدير، إطلاق التصدير، إعادة الإطلاق | — | Employé par M16-28, sur le modèle de « إعادة إطلاق التصدير » (M16-26). | |
| `account.data.yours.journal.title` | Journal des accès | Access log | سجلّ الوصول | — | Employé par M16-28. | |
| `profile.*` | Fiche publique, retirer la fiche de l'annuaire | Public page, unpublish | البطاقة العامة، سحب البطاقة من دليل الممارسين | — | Employé par M16-28, sur le modèle de « بطاقة الممارس ». | |
| `profile.*` | Nom affiché, titre affiché, présentation | Display name, title, bio | الاسم المعروض، اللقب المعروض، التعريف | — | Employé par M16-28. | |
| `profile.responseDelay` | Délai de réponse | Response time | مهلة الرد | — | Employé par M16-28. | |
| `profile.checklist.label` | Liste de contrôle (avant publication) | Checklist | قائمة التحقّق | — | Employé par M16-28. | |
| `profile.photo.*` | Recadrer (la photo) | Crop | قصّ | اقتصاص | Employé par M16-28. | |
| `preferences.save*`, `profile.save.*` | Enregistré automatiquement | Saved automatically | حفظ تلقائي | — | Employé par M16-28. | |

## 12. Vérification des praticiens et administration

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `account.verification.*` | Justificatif, justificatifs | Supporting document | مستند إثبات، مستندات إثبات | وثيقة داعمة | | |
| `account.verification.type.diploma` | Diplôme | Diploma | شهادة | دبلوم | | |
| `account.verification.type.identity` | Pièce d'identité | ID document | وثيقة هوية | بطاقة هوية | | |
| `account.verification.type.registration` | Attestation d'inscription (ADELI / RPPS) | Registration certificate | شهادة تسجيل (ADELI / RPPS) | — | Les sigles restent en caractères latins. | |
| `account.verification.type.certification` | Certification (coaching) | Certification | شهادة اعتماد (التدريب) | — | | |
| `account.verification.type.professionalCard` | Carte professionnelle | Professional card | بطاقة مهنية | — | | |
| `account.verification.submit` | Soumettre le dossier pour vérification | Submit for review | إرسال الملف للتحقّق | تقديم الملف | | |
| `account.verification.lock.docsPending` | Justificatifs attendus | Documents expected | بانتظار المستندات | — | Statut. | |
| `account.verification.lock.underReview` | En cours de vérification | Under review | قيد التحقّق | قيد المراجعة | Statut. | |
| `account.verification.lock.needsMore` | Complément demandé | More information requested | مطلوب استكمال | — | Statut. | |
| `account.verification.lock.approved` | Approuvé | Approved | مقبول | تمّت الموافقة | Accordé à « الملف » (masculin). | |
| `account.verification.lock.rejected` | Refusé | Rejected | مرفوض | — | | |
| `account.verification.review.conform` | Conforme, non conforme | Compliant, non-compliant | مطابق، غير مطابق | — | | |
| `admin.*` | Approuver | Approve | موافقة | قبول | Nom verbal sans article (règle 2). | |
| `admin.*` | Refuser | Reject | رفض | — | | |
| `admin.*` | Demander un complément | Request more | طلب استكمال | — | | |
| `admin.*` | Suspendre, suspension | Suspend | إيقاف، إيقاف الحساب | تعليق | | |
| `admin.*` | Réactiver, réactivation | Reactivate | إعادة التفعيل | — | | |
| `admin.*` | Recours, contester la décision | Appeal | تظلّم، الاعتراض على القرار | طعن | « طعن » est juridique ; « تظلّم » est la réclamation administrative. | |
| `admin.*` | Motif, motif communiqué | Reason | السبب، السبب المُبلَّغ | الدافع | | |
| `admin.*` | Décision | Decision | القرار | — | | |
| `admin.*` | File de validation | Review queue | قائمة انتظار التحقّق | — | | |
| `admin.*` | Visionneuse de document | Document viewer | عارض المستندات | — | | |
| `adminBar.reminder` | Aucune donnée patient n'est accessible depuis l'administration. | — | لا يمكن الوصول إلى أي بيانات للمرضى من الإدارة. | — | | |
| `accountNav.badge.pending` | en attente (pastille du dossier) | pending | قيد الانتظار | — | Employé par M16-28 ; couvre « justificatifs attendus » et « en cours de vérification ». | |
| `account.verification.*` | Déposer, déposé (un justificatif) ; retirer | Upload, uploaded ; remove | إيداع، مُودَع ؛ إزالة | — | Employé par M16-28, comme « إيداع » de M16-26. | |
| `account.verification.*` | Soumettre, soumis (le dossier) | Submit, submitted | إرسال، مُرسَل | — | Employé par M16-28, sur le modèle de « إرسال الملف للتحقّق ». | |
| `account.verification.progress.validation` | Validation (jalon du dossier) | Validation | التحقّق | — | Employé par M16-28, comme `adminBar.tab.validation`. | |
| `account.verification.*` | Profession déclarée | Declared profession | المهنة المصرَّح بها | — | Employé par M16-28. | |
| `admin.*` | Libellé FR, libellé EN, libellé AR | FR label | التسمية بالفرنسية، بالإنجليزية، بالعربية | — | Champ ajouté par M16-25. | |
| `admin.appeals.*`, `admin.decision.appeal*` | Accepter, écarter un recours ; recours accepté, écarté | Accept, dismiss an appeal | قبول التظلّم، رفض التظلّم | ردّ التظلّم (écarter) | Employé par M16-28. | |
| `admin.journal.kind.appealDecided`, `admin.reason.*` | Recours tranché ; examiner un recours | Appeal decided ; review | البتّ في تظلّم ؛ دراسة التظلّم | — | Employé par M16-28, « دراسة » comme dans `auth.suspended.*`. | |
| `admin.status.*` | Suspendu, clos, e-mail à confirmer | Suspended, closed | موقوف، مغلق، بانتظار تأكيد البريد الإلكتروني | — | Employé par M16-28 ; accordés à « الحساب » (masculin), comme `auth.suspended.*`. | |
| `admin.suspend.*`, `admin.decision.effects` | Sessions révoquées (à la suspension) | Sessions revoked | تسجيل الخروج من جميع الجلسات | إبطال الجلسات | Employé par M16-28, comme `account.security.sessions.*` ; même risque de confusion avec la séance (section 14). | |
| `admin.decision.*` | Note interne ; message au praticien | Internal note ; message | ملاحظة داخلية ؛ رسالة إلى الممارس | — | Employé par M16-28. | |
| `admin.checklist.*`, `admin.decision.unchecked` | Point de contrôle (coché, non coché) | Checkpoint | نقطة تحقّق (مؤشَّر عليها، غير مؤشَّر عليها) | — | Employé par M16-28. | |
| `admin.validation.reviewError` | Qualification (d'un justificatif) | Review | تقييم المستند | — | Employé par M16-28 ; valeurs « مطابق »، « غير مطابق ». | |
| `admin.queue.overdue` | Hors délai | Overdue | تجاوز المهلة | متأخّر | Employé par M16-28. | |
| `admin.decision.reportResolved` | Signalement (traité) | Report | بلاغ (معالجة بلاغ) | — | Employé par M16-28 ; aucun écran de signalement (G Q26). | |
| `admin.journal.*` | Par (auteur), horodatage, journal en ajout seul | By, timestamp, append-only log | المنفِّذ، التوقيت، سجلّ للإضافة فقط | — | Employé par M16-28. | |
| `admin.vocabulary.*` | Entrée (d'une liste du vocabulaire), désactivée, active | Item | عنصر، معطّل، نشط | — | Employé par M16-28 ; « مُدخَل » reste réservé à l'entrée du dossier. | |
| `admin.vocabulary.*` | Code, ordre ; liste fixe | Code, order ; fixed list | الرمز، الترتيب ؛ قائمة ثابتة | — | Employé par M16-28. | |
| `admin.*` | Purge, purgé (données, justificatif) | Purge | حذف، حُذف | — | Employé par M16-28, comme `public.how.never.*`. | |
| `admin.checklist.*` | Registre public ; annuaire santé (RPPS) | Public registry | السجلّ العام ؛ دليل الصحة (RPPS) | — | Employé par M16-28. | |
| `admin.viewer.*` | Pivoter ; zoom +, zoom − | Rotate ; zoom | تدوير ؛ تكبير +، تصغير − | — | Employé par M16-28. | |

## 13. Socle : états, messages, actions

| Clé | Français | Anglais | Proposition | Variante | Remarque | Relu par |
| --- | --- | --- | --- | --- | --- | --- |
| `confirm.confirm`, `confirm.cancel` | Confirmer, Annuler | Confirm, Cancel | تأكيد، إلغاء | — | | |
| — | Enregistrer, enregistré | Save, saved | حفظ، تمّ الحفظ | — | | |
| — | Modifier | Edit | تعديل | — | | |
| — | Supprimer, retirer | Delete, remove | حذف، إزالة | — | « حذف » pour une suppression définitive, « إزالة » pour un retrait. | |
| — | Ajouter | Add | إضافة | — | | |
| — | Rechercher | Search | بحث | — | | |
| — | Fermer, ouvrir | Close, open | إغلاق، فتح | — | | |
| — | Continuer, retour | Continue, back | متابعة، رجوع | — | « متابعة » veut aussi dire « suivi » : préférer « التالي » sur un bouton d'étape. | |
| — | Précédent, suivant | Previous, next | السابق، التالي | — | Les chevrons qui les accompagnent sont retournés en RTL (`design/arabe.md`). | |
| `state.error.retry` | Réessayer | Retry | إعادة المحاولة | — | | |
| `state.loading` | Chargement… | Loading… | جارٍ التحميل… | — | | |
| `state.error.title` | Impossible de charger ce bloc | Could not load | تعذّر تحميل هذا القسم | — | Tournure impersonnelle (règle 3). | |
| `state.empty.title` | Rien à afficher pour le moment | Nothing to show | لا شيء لعرضه حاليًا | — | | |
| `state.error.message` | Le serveur n'a pas répondu. Rien n'a été modifié. | — | لم يستجب الخادم. لم يتغيّر شيء. | — | | |
| `banner.offline.message` | Connexion perdue · vos brouillons sont conservés… | — | انقطع الاتصال · مسودّاتك محفوظة… | — | | |
| `toast.level.*` | Succès, information, avertissement | Success, info, warning | نجاح، معلومة، تنبيه | — | | |
| `forms.error.required` | Ce champ est obligatoire. | Required. | هذا الحقل مطلوب. | — | | |
| `forms.error.email` | Adresse e-mail invalide. | Invalid email. | عنوان البريد الإلكتروني غير صالح. | — | | |
| `forms.summary.*` | {n} champs à corriger | {n} fields to fix | حقول تحتاج إلى تصحيح: {n} | — | Étiquette suivie du nombre, pour éviter l'accord (règle 6). | |
| `shortcuts.escapeKey` | Échap | Esc | Esc | — | Nom de touche en caractères latins. | |
| `navRail.label`, `appBar.navigation.open` | Navigation | Navigation | التنقّل | — | Employé par M16-28. | |
| `navRail.later`, `agenda.calendars.later` | à réaliser, à venir (fonction pas encore disponible) | coming soon | قريبًا | — | Employé par M16-28. | |
| `navRail.invoice` | Facture (carreau) | Invoice | الفواتير | الفوترة | Employé par M16-28 ; à revoir avec le module de facturation. | |
| `shared.dateField.*` | Calendrier ; jj/mm/aaaa, mm/aaaa | Calendar ; dd/mm/yyyy | التقويم ؛ يوم/شهر/سنة، شهر/سنة | — | Employé par M16-28. | |
| `state.error.details` | Détail technique | Technical details | التفاصيل التقنية | — | Employé par M16-28. | |
| `toast.reconnected.*` | Connexion rétablie, brouillons renvoyés | Reconnected | عاد الاتصال، المسودّات المُعاد إرسالها | — | Employé par M16-28. | |
| `confirm.word.label` | Tapez « … » pour confirmer | Type … to confirm | يُرجى كتابة « … » للتأكيد | — | Employé par M16-28. | |

## 14. Termes laissés ouverts pour le relecteur

Les choix les plus discutables, à regarder en premier :

1. **« مريض » ou « مراجع »** pour « patient » (section 2) : connotation de maladie contre usage régional.
2. **« مُدخَل » ou « قيد »** pour « entrée » (section 4), et la règle 5 qui en découle pour l'accord des verbes de lien.
3. **« وضعية »** pour « situation » (section 4).
4. **Mélancolie, Chagrin, Rage, Honte** (section 5.2) : intensité et registre clinique.
5. **Les inverses des types de lien** (section 6), en particulier « يُثيره » et « يتفاقم بسبب ».
6. **Noms de mois** donnés par `Intl` (section 10) : usage du Golfe et de l'Égypte, pas celui du Levant ni du Maghreb.
7. **« الجلسات النشطة »** (sessions de connexion) à côté de « جلسة » (séance clinique), section 11.
