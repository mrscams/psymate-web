import {
  ActorType,
  DecisionKind,
  Profession,
  ReviewedStatus,
  VerificationStatus,
} from '../data/admin.model';

/** Ton d'une pastille : texte toujours écrit, la couleur ne porte jamais seule l'état. */
export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

export function professionLabel(profession: Profession): string {
  switch (profession) {
    case 'psychiatrist':
      return $localize`:Profession@@admin.profession.psychiatrist:Psychiatre`;
    case 'coach':
      return $localize`:Profession@@admin.profession.coach:Coach`;
    default:
      return $localize`:Profession@@admin.profession.psychologist:Psychologue`;
  }
}

export function statusLabel(status: VerificationStatus): string {
  switch (status) {
    case 'email_pending':
      return $localize`:Statut de vérification@@admin.status.emailPending:E-mail à confirmer`;
    case 'docs_pending':
      return $localize`:Statut de vérification@@admin.status.docsPending:Justificatifs à déposer`;
    case 'under_review':
      return $localize`:Statut de vérification@@admin.status.underReview:En vérification`;
    case 'approved':
      return $localize`:Statut de vérification@@admin.status.approved:Approuvé`;
    case 'needs_more':
      return $localize`:Statut de vérification@@admin.status.needsMore:Complément demandé`;
    case 'rejected':
      return $localize`:Statut de vérification@@admin.status.rejected:Refusé`;
    case 'suspended':
      return $localize`:Statut de vérification@@admin.status.suspended:Suspendu`;
    case 'closed':
      return $localize`:Statut de vérification@@admin.status.closed:Clos`;
  }
}

export function statusTone(status: VerificationStatus): Tone {
  switch (status) {
    case 'approved':
      return 'success';
    case 'under_review':
      return 'info';
    case 'needs_more':
    case 'docs_pending':
    case 'email_pending':
      return 'warning';
    case 'rejected':
    case 'suspended':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function documentTypeLabel(type: string): string {
  switch (type) {
    case 'diploma':
      return $localize`:Type de justificatif@@admin.doc.diploma:Diplôme`;
    case 'registration':
      return $localize`:Type de justificatif@@admin.doc.registration:Inscription au registre`;
    case 'certification':
      return $localize`:Type de justificatif@@admin.doc.certification:Certification`;
    case 'professional_card':
      return $localize`:Type de justificatif@@admin.doc.professionalCard:Carte professionnelle`;
    case 'identity':
      return $localize`:Type de justificatif@@admin.doc.identity:Pièce d'identité`;
    default:
      return $localize`:Type de justificatif@@admin.doc.other:Autre pièce`;
  }
}

export function reviewedLabel(status: ReviewedStatus): string {
  switch (status) {
    case 'conform':
      return $localize`:Qualification d'un justificatif@@admin.doc.conform:Conforme`;
    case 'non_conform':
      return $localize`:Qualification d'un justificatif@@admin.doc.nonConform:Non conforme`;
    default:
      return $localize`:Qualification d'un justificatif@@admin.doc.pending:À examiner`;
  }
}

export function decisionLabel(kind: DecisionKind): string {
  switch (kind) {
    case 'approved':
      return $localize`:Décision d'administration@@admin.decision.approved:Dossier approuvé`;
    case 'needs_more':
      return $localize`:Décision d'administration@@admin.decision.needsMore:Complément demandé`;
    case 'rejected':
      return $localize`:Décision d'administration@@admin.decision.rejected:Dossier refusé`;
    case 'suspended':
      return $localize`:Décision d'administration@@admin.decision.suspended:Compte suspendu`;
    case 'reactivated':
      return $localize`:Décision d'administration@@admin.decision.reactivated:Compte réactivé`;
    case 'appeal_accepted':
      return $localize`:Décision d'administration@@admin.decision.appealAccepted:Recours accepté`;
    case 'appeal_rejected':
      return $localize`:Décision d'administration@@admin.decision.appealRejected:Recours écarté`;
    default:
      return $localize`:Décision d'administration@@admin.decision.other:Décision`;
  }
}

export function actorLabel(type: ActorType, name: string | null): string {
  switch (type) {
    case 'admin':
      return (
        name ?? $localize`:Auteur d'une ligne du journal@@admin.journal.actor.admin:administrateur`
      );
    case 'practitioner':
      return $localize`:Auteur d'une ligne du journal@@admin.journal.actor.practitioner:praticien·ne`;
    default:
      return $localize`:Auteur d'une ligne du journal@@admin.journal.actor.system:système`;
  }
}

/** Catégorie d'un type d'événement du journal (badge de la fiche 22). */
export function journalCategory(kind: string): { label: string; tone: Tone } {
  if (kind === 'admin.document_read') {
    return {
      label: $localize`:Type de ligne du journal@@admin.journal.type.document:Accès document`,
      tone: 'info',
    };
  }
  if (kind.startsWith('admin.')) {
    return {
      label: $localize`:Type de ligne du journal@@admin.journal.type.decision:Décision`,
      tone: 'info',
    };
  }
  if (kind.startsWith('appeal')) {
    return {
      label: $localize`:Type de ligne du journal@@admin.journal.type.appeal:Recours`,
      tone: 'warning',
    };
  }
  if (kind.startsWith('directory')) {
    return {
      label: $localize`:Type de ligne du journal@@admin.journal.type.directory:Annuaire`,
      tone: 'success',
    };
  }
  if (kind.startsWith('system')) {
    return {
      label: $localize`:Type de ligne du journal@@admin.journal.type.system:Système`,
      tone: 'neutral',
    };
  }
  const warning = /fail|lock|revok|suspend/.test(kind);
  return {
    label: $localize`:Type de ligne du journal@@admin.journal.type.security:Sécurité`,
    tone: warning ? 'warning' : 'success',
  };
}

/** Phrase lisible pour les types courants ; à défaut, le résumé du serveur. */
export function journalSummary(kind: string, summary: string): string {
  const known: Record<string, string> = {
    login_ok: $localize`:Événement du journal@@admin.journal.kind.loginOk:Connexion réussie`,
    login_failed: $localize`:Événement du journal@@admin.journal.kind.loginFailed:Échec de connexion`,
    locked: $localize`:Événement du journal@@admin.journal.kind.locked:Compte verrouillé après plusieurs échecs`,
    logout: $localize`:Événement du journal@@admin.journal.kind.logout:Déconnexion`,
    email_confirmed: $localize`:Événement du journal@@admin.journal.kind.emailConfirmed:Adresse e-mail confirmée`,
    consent_given: $localize`:Événement du journal@@admin.journal.kind.consent:Conditions d'utilisation acceptées`,
    password_changed: $localize`:Événement du journal@@admin.journal.kind.passwordChanged:Mot de passe changé`,
    '2fa_enabled': $localize`:Événement du journal@@admin.journal.kind.twoFactorOn:Double authentification activée`,
    '2fa_disabled': $localize`:Événement du journal@@admin.journal.kind.twoFactorOff:Double authentification désactivée`,
    recovery_code_used: $localize`:Événement du journal@@admin.journal.kind.recoveryUsed:Code de secours utilisé`,
    recovery_codes_regenerated: $localize`:Événement du journal@@admin.journal.kind.recoveryRegenerated:Codes de secours régénérés`,
    session_revoked: $localize`:Événement du journal@@admin.journal.kind.sessionRevoked:Session révoquée`,
    verification_submitted: $localize`:Événement du journal@@admin.journal.kind.submitted:Dossier soumis pour vérification`,
    admin_bootstrap: $localize`:Événement du journal@@admin.journal.kind.bootstrap:Compte administrateur créé`,
    'admin.document_read': $localize`:Événement du journal@@admin.journal.kind.documentRead:Ouverture d'un justificatif (URL signée 5 min)`,
    'appeal.submitted': $localize`:Événement du journal@@admin.journal.kind.appealSubmitted:Recours déposé`,
  };
  if (known[kind] && (summary === kind || summary === '')) return known[kind];
  return summary || kind;
}

/** « 12 nov. 2026 » dans la locale de l'interface ; « — » si absent. */
export function formatDay(iso: string | null, locale: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * Horodatage du journal, secondes incluses (fiche 22, UX-E3) : « 9 nov. 2026 · 11:14:46 » en
 * français, même jour que le reste du produit (jamais 09/11, ambigu entre locales).
 */
export function formatTimestamp(iso: string, locale: string): string {
  const date = new Date(iso);
  const day = formatDay(iso, locale);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return `${day} · ${time}`;
}

/** Heure et minute d'un horodatage (« 11:05 »), pour la plage d'un groupe du journal. */
export function formatMinute(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** Ancienneté courte en chiffres (« il y a 3 j »), comme la maquette 20 ; « — » si absente. */
export function formatAge(iso: string | null, locale: string, now: Date = new Date()): string {
  if (!iso) return '—';
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' });
  const abs = Math.abs(seconds);
  if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), 'hour');
  return format.format(Math.round(seconds / 86_400), 'day');
}

/** Taille d'un fichier (« 124 o », « 2,4 Mo »). */
export function formatSize(bytes: number, locale: string): string {
  const units = ['byte', 'kilobyte', 'megabyte'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

/** Format d'un justificatif à partir de son type MIME. */
export function mimeLabel(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'JPEG';
    case 'image/png':
      return 'PNG';
    default:
      return 'PDF';
  }
}
