import { ApiProblem } from '../../../core/http';
import { AppLocale, formatDate, formatLocale, textDirection } from '../../../core/i18n';
import { PatientHeaderInfo, sessionModalityLabel } from '../../../shared/ui';
import { CAPTURE_PREFIXES, CaptureEntryType } from '../../capture';
import { FlagKind, SessionModality, ShellPatient } from '../data/patient-shell.model';

// Libellés de features/patient-shell ($localize, français d'abord). Les codes viennent du contrat ;
// seuls ces libellés changent avec la langue.

export function flagLabel(kind: FlagKind): string {
  switch (kind) {
    case 'watch':
      return $localize`:Drapeau dans l'en-tête patient@@patientShell.flag.watch:À surveiller`;
    case 'risk':
      return $localize`:Drapeau dans l'en-tête patient@@patientShell.flag.risk:Risque`;
    case 'shared_care':
      return $localize`:Drapeau dans l'en-tête patient@@patientShell.flag.sharedCare:Suivi conjoint`;
  }
}

/** « 09:08 » dans le fuseau du navigateur. */
export function formatClock(value: string | null, locale: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(formatLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** « jeudi 12 novembre » (l'année si ce n'est pas l'année en cours). */
export function formatLongDay(value: string, locale: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(formatLocale(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date);
}

/** « 5 nov. » : jour et mois courts. */
export function formatShortDay(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(formatLocale(locale), { day: 'numeric', month: 'short' }).format(
    date,
  );
}

/** Le patient du store et le début de suivi retenu (store.followedSince) → pm-patient-header. */
export function toHeaderInfo(
  patient: ShellPatient,
  followedSince: string | null,
): PatientHeaderInfo {
  return {
    id: patient.id,
    displayName: patient.displayName,
    birthDate: patient.birthDate,
    followedSince,
    flags: patient.flags.map((kind) => ({ code: kind, label: flagLabel(kind) })),
  };
}

/**
 * Un dossier qui ne s'ouvrira pas en réessayant (403 PATIENT_FORBIDDEN, 404, 400 sur un :id qui
 * n'est pas un UUID) : titre et message de l'état erreur du shell, sans « Réessayer » ni
 * redirection. Null pour les autres problèmes, que l'en-tête montre avec « Réessayer ».
 */
export function finalLoadError(
  problem: ApiProblem | null,
): { title: string; message: string } | null {
  switch (problem?.code) {
    case 'PATIENT_FORBIDDEN':
      return {
        title: $localize`:Erreur du dossier, patient d'un autre praticien@@patientShell.error.forbidden.title:Ce dossier n'est pas le vôtre`,
        message: $localize`:Erreur du dossier, patient d'un autre praticien@@patientShell.error.forbidden.message:Il appartient à un autre praticien : vous ne pouvez ni le lire ni y écrire.`,
      };
    case 'PATIENT_NOT_FOUND':
    case 'MALFORMED_REQUEST':
      return {
        title: $localize`:Erreur du dossier introuvable@@patientShell.error.notFound.title:Ce dossier n'existe pas`,
        message: $localize`:Erreur du dossier introuvable@@patientShell.error.notFound.message:Le lien est peut-être incomplet ; retrouvez le dossier depuis la liste.`,
      };
    default:
      return null;
  }
}

/** Message d'une action de séance refusée : celui du serveur (déjà dans la langue), sinon générique. */
export function sessionProblemText(problem: ApiProblem | null): string {
  switch (problem?.code) {
    case 'SESSION_ALREADY_OPEN':
      return $localize`:Toast, séance déjà ouverte ailleurs@@patientShell.session.alreadyOpen:Une séance est déjà ouverte pour ce dossier : l'en-tête a été mis à jour.`;
    case 'SESSION_ALREADY_CLOSED':
      return $localize`:Toast, séance déjà clôturée ailleurs@@patientShell.session.alreadyClosed:Cette séance est déjà clôturée : l'en-tête a été mis à jour.`;
    default:
      return (
        problem?.errors?.[0]?.message ||
        problem?.detail ||
        $localize`:Toast, action de séance échouée@@patientShell.session.failed:L'action sur la séance n'a pas abouti. Réessayez.`
      );
  }
}

/**
 * Toast après la clôture (proposition 04b, état 6) : « Séance clôturée · 48 min · compte rendu
 * enregistré », ou « sans compte rendu ».
 */
export function closedToastText(durationMin: number | null, withSummary: boolean): string {
  const duration = durationMin ?? 0;
  return withSummary
    ? $localize`:Toast après la clôture d'une séance, avec compte rendu@@patientShell.session.closedSummary:Séance clôturée · ${duration}:minutes: min · compte rendu enregistré`
    : $localize`:Toast après la clôture d'une séance, sans compte rendu@@patientShell.session.closedNoSummary:Séance clôturée · ${duration}:minutes: min · sans compte rendu`;
}

/** Une lettre d'une écriture de droite à gauche (hébreu, arabe, syriaque, thaana, formes A et B). */
const RTL_LETTER = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/**
 * Valeur insérée dans une phrase assemblée en TypeScript (sous-titre du panneau, toast, nom
 * accessible), où un `<bdi>` est impossible (Q77) : isolée par les caractères de contrôle Unicode,
 * U+2068 … U+2069 (sens de la valeur) ou U+2066 … U+2069 (de gauche à droite : « 09:08 → 09:56 »,
 * heure de début à gauche de la flèche). En arabe, toujours ; en français et en anglais, seulement
 * une valeur écrite de droite à gauche : une valeur en lettres latines y reste inchangée, caractère
 * pour caractère. Pour l'affichage seulement : rien d'isolé ne part vers l'API ni dans un champ.
 * Même technique que features/agenda (agenda-format.ts), qu'une feature ne peut pas importer.
 */
export function isolate(value: string, locale: string, direction: 'auto' | 'ltr' = 'auto'): string {
  if (textDirection(locale) !== 'rtl' && (direction === 'ltr' || !RTL_LETTER.test(value))) {
    return value;
  }
  return `${direction === 'ltr' ? '\u2066' : '\u2068'}${value}\u2069`;
}

/**
 * « Dernière séance : 17 oct. 2026 » n'est pas ici : l'en-tête partagé le dit. Sous-titre du panneau,
 * sans le nom du patient : pm-side-panel le reçoit par `subject` (isolé dans un <bdi>) et rend
 * « nom · sous-titre », le même texte qu'avant.
 */
export function closePanelSubtitle(
  startedAt: string,
  modality: SessionModality | null,
  locale: string,
  now: Date,
): string {
  const parts = [formatLongDay(startedAt, locale, now)];
  const where = sessionModalityLabel(modality);
  if (where) parts.push(where);
  // La flèche va du début à la fin : la plage se lit de gauche à droite, même en arabe.
  const range = `${formatClock(startedAt, locale)} → ${formatClock(now.toISOString(), locale)}`;
  parts.push(isolate(range, locale, 'ltr'));
  return parts.filter((part) => !!part).join(' · ');
}

/** Date courte d'une séance précédente pour un titre : « Séance précédente · 5 nov. ». */
export function previousHeading(startedAt: string | null, locale: string): string {
  const day = startedAt ? formatShortDay(startedAt, locale) : '';
  return day
    ? $localize`:Titre du bloc séance précédente, avec sa date@@patientShell.session.previousDated:Séance précédente · ${day}:day:`
    : $localize`:Titre du bloc séance précédente@@patientShell.session.previous:Séance précédente`;
}

/** Date complète (« 17 oct. 2026 ») pour les lignes datées des rappels. */
export function dayLabel(value: string, locale: string): string {
  return formatDate(value, locale, 'medium');
}

/** Une rangée de « Raccourcis dans le texte » : les exemples en gras, puis ce qu'ils produisent. */
export interface TextShortcutRow {
  tokens: string[];
  label: string;
}

/**
 * « Raccourcis dans le texte » de la colonne latérale en séance (proposition 04b, état 3) : ce que la
 * grammaire du bloc de saisie reconnaît. Les préfixes viennent du parseur (CAPTURE_PREFIXES).
 * En arabe, l'aide ne promet que ce qui marche : ni dates (Q81, l'analyseur n'en lit aucune en
 * arabe), ni ressenti (une émotion écrite en arabe n'est pas reconnue avant M16-25) ; préfixes et
 * lien restent. Français et anglais : toutes les rangées, inchangées.
 */
export function textShortcutRows(locale: AppLocale): TextShortcutRow[] {
  const prefix = (type: CaptureEntryType): string =>
    CAPTURE_PREFIXES.find((entry) => entry.type === type)?.prefix ?? '';
  const arabic = locale === 'ar';
  const rows: (TextShortcutRow & { unrecognizedInArabic?: boolean })[] = [
    {
      unrecognizedInArabic: true,
      tokens: [
        $localize`:Exemple de ressenti dans la grammaire@@patientShell.ctx.shortcuts.feelingExample:anx 7`,
      ],
      label: $localize`:Raccourci dans le texte@@patientShell.ctx.shortcuts.feeling:ressenti`,
    },
    {
      tokens: [prefix('event')],
      label: $localize`:Raccourci dans le texte@@patientShell.ctx.shortcuts.event:événement`,
    },
    {
      tokens: [prefix('situation')],
      label: $localize`:Raccourci dans le texte@@patientShell.ctx.shortcuts.situation:situation`,
    },
    {
      tokens: [prefix('medication')],
      label: $localize`:Raccourci dans le texte@@patientShell.ctx.shortcuts.medication:médicament`,
    },
    { tokens: [prefix('note')], label: '' },
    {
      unrecognizedInArabic: true,
      tokens: [
        $localize`:Exemple de date dans la grammaire@@patientShell.ctx.shortcuts.dateYesterday:hier`,
        $localize`:Exemple de date dans la grammaire@@patientShell.ctx.shortcuts.dateDay:12 mars`,
        $localize`:Exemple de date dans la grammaire@@patientShell.ctx.shortcuts.dateRelative:il y a 3 j`,
      ],
      label: $localize`:Raccourci dans le texte@@patientShell.ctx.shortcuts.dates:dates`,
    },
    {
      tokens: [
        $localize`:Exemple de lien dans la grammaire@@patientShell.ctx.shortcuts.linkExample:> cible`,
      ],
      label: $localize`:Raccourci dans le texte@@patientShell.ctx.shortcuts.link:lien`,
    },
  ];
  return rows
    .filter((row) => !(arabic && row.unrecognizedInArabic))
    .map(({ tokens, label }) => ({ tokens, label }));
}
