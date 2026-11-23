import { ARABIC_FORMAT_LOCALE } from '../../../core/i18n';
import { loaded } from '../../../shared/util';
import { activity, patient } from '../data/patient.fixtures';
import { archiveConfirmLabel, shownOneLabel } from './patient-labels';
import { clockTime, rowView, shortDate, sparkline } from './patient-row';

// M16-14 : messages entiers par désignation et par cas (M4.4 point 9), rendu français inchangé ;
// formats de la ligne par la locale de formatage (Q73) : chiffres latins et 24 h en arabe.

const NOW = new Date(2026, 10, 14, 10, 0);
const ARABIC_INDIC = /[٠-٩]/;

describe('patients en arabe (M16-14)', () => {
  it('confirmation d’archivage : un message entier par désignation, français inchangé', () => {
    expect(archiveConfirmLabel('patient')).toBe('Archiver ce patient');
    expect(archiveConfirmLabel('client')).toBe('Archiver ce client');
  });

  it('pied d’une ligne ou aucune : un message entier par désignation, français inchangé', () => {
    expect(shownOneLabel('patient', 1)).toBe('1 patient affiché');
    expect(shownOneLabel('client', 0)).toBe('0 client affiché');
  });

  it('carte mobile : nombre et mot dans un seul message, français inchangé', () => {
    const one = rowView(
      {
        patient: patient(),
        cell: loaded(activity()),
        activity: activity({
          since: { entries: 1, capped: false, strongest: null },
          lastSession: null,
          drafts: 0,
        }),
      },
      '',
      'fr',
      NOW,
    );
    expect(one.cardLine).toBe('1 entrée');
    const many = rowView(
      {
        patient: patient(),
        cell: loaded(activity()),
        activity: activity({
          since: { entries: 20, capped: true, strongest: null },
          lastSession: null,
          drafts: 0,
        }),
      },
      '',
      'fr',
      NOW,
    );
    expect(many.cardLine).toBe('20+ entrées');
  });

  it('émotion dominante : flèche dans un message, français inchangé', () => {
    const view = rowView(
      {
        patient: patient(),
        cell: loaded(activity()),
        activity: activity({ dominant: { label: 'Anxiété', delta: 2 } }),
      },
      '',
      'fr',
      NOW,
    );
    expect(view.dominant?.text).toBe('anxiété ↑');
  });

  it.each(['ar', ARABIC_FORMAT_LOCALE])(
    'formats de la ligne en %s : chiffres latins, mois en arabe, 24 h',
    (locale) => {
      const date = shortDate('2025-11-05T09:00:00Z', locale, NOW);
      expect(date).not.toMatch(ARABIC_INDIC);
      expect(date).toMatch(/5/);
      expect(date).toMatch(/2025/);
      expect(date).toMatch(/[؀-ۿ]/);
      const time = clockTime('2026-11-14T17:05:00', locale);
      expect(time).toBe('17:05');
      const spark = sparkline(activity({ intensities: [6.5, 5] }), locale);
      expect(spark?.label).not.toMatch(ARABIC_INDIC);
      expect(spark?.label).toContain('6.5');
    },
  );
});
