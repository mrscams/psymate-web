import { CONTRACT_DECISION_KINDS, CONTRACT_JOURNAL_ACTOR_TYPES } from '../data/admin.api';
import { JOURNAL_SECURITY_KINDS } from '../data/admin.model';
import {
  actorLabel,
  decisionLabel,
  journalCategory,
  journalSummary,
  knownDecisionLabel,
  securityKindLabel,
} from './admin-labels';

// UX-G2b : le journal (fiche 22) ne montre jamais une clé technique seule dans la colonne
// Événement. Chaque valeur des énumérations du contrat (DecisionItemDtoKindEnum,
// JournalItemDtoActorTypeEnum, lues du client généré par admin.api.ts) et chaque type d'événement
// nommé par le contrat a un libellé ; un type inconnu reçoit un repli lisible.

const UNKNOWN = /Événement non répertorié/;

describe('libellés du journal', () => {
  it('le contrat déclare des décisions et des auteurs (garde-fou contre une liste vide)', () => {
    expect(CONTRACT_DECISION_KINDS.length).toBeGreaterThanOrEqual(8);
    expect(CONTRACT_JOURNAL_ACTOR_TYPES).toEqual(['admin', 'practitioner', 'system']);
  });

  it.each(CONTRACT_DECISION_KINDS.map((kind) => [kind]))(
    'décision %s : libellé propre, ligne admin.%s lisible',
    (kind) => {
      const label = knownDecisionLabel(kind);
      expect(label, `décision ${kind} sans libellé`).not.toBeNull();
      expect(decisionLabel(kind)).toBe(label);
      // Le serveur renvoie le code de la décision comme résumé quand il n'y a pas de message.
      for (const summary of [kind, `admin.${kind}`, '']) {
        const text = journalSummary(`admin.${kind}`, summary);
        expect(text).toBe(label);
        expect(text).not.toContain(kind);
      }
      // Avec un message au praticien : libellé puis message.
      expect(journalSummary(`admin.${kind}`, 'Pièce d’identité illisible')).toBe(
        `${label} : Pièce d’identité illisible`,
      );
      // Ligne de sécurité admin.decision qui porte cette décision dans details.kind.
      expect(journalSummary('admin.decision', 'admin.decision', kind)).toBe(
        `Décision enregistrée : ${label}`,
      );
      expect(journalCategory(`admin.${kind}`).label).toBe('Décision');
    },
  );

  it.each(JOURNAL_SECURITY_KINDS.map((kind) => [kind]))(
    'événement %s : libellé français, jamais la clé seule',
    (kind) => {
      const label = securityKindLabel(kind);
      expect(label, `type ${kind} sans libellé`).not.toBeNull();
      for (const summary of [kind, '']) {
        const text = journalSummary(kind, summary);
        expect(text).toBe(label);
        expect(text).not.toMatch(UNKNOWN);
        expect(text).not.toBe(kind);
      }
      expect(journalCategory(kind).label).not.toBe('');
    },
  );

  it.each(CONTRACT_JOURNAL_ACTOR_TYPES.map((type) => [type]))('auteur %s : libellé', (type) => {
    const label = actorLabel(type, null);
    expect(label).not.toBe('');
    expect(label).not.toBe(type);
  });

  it('résumé rédigé par le serveur conservé (motif de suspension, recours)', () => {
    expect(journalSummary('admin.suspend', 'Compte suspendu : signalements répétés')).toBe(
      'Compte suspendu : signalements répétés',
    );
    expect(journalSummary('appeal.submitted', 'Recours déposé')).toBe('Recours déposé');
  });

  it('type inconnu : repli lisible qui cite le type, jamais la clé seule', () => {
    const text = journalSummary('system.journal_export', 'system.journal_export');
    expect(text).toMatch(UNKNOWN);
    expect(text).toContain('system.journal_export');
    expect(text).not.toBe('system.journal_export');
    expect(journalSummary('directory.published', '')).toMatch(UNKNOWN);
    // Décision inconnue dans details.kind : libellé générique, pas la clé.
    expect(journalSummary('admin.decision', 'admin.decision', 'future_kind')).toBe(
      'Décision enregistrée',
    );
    // Valeur hors contrat d'une décision : repli « Décision ».
    expect(knownDecisionLabel('future_kind')).toBeNull();
    // Clé d'objet héritée : jamais prise pour un libellé.
    expect(securityKindLabel('toString')).toBeNull();
  });
});
