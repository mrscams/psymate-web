import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { loaded, loading } from '../../../shared/util';
import { activity, OMAR, patient } from '../data/patient.fixtures';
import { PatientActivity, PatientView } from '../data/patient.model';
import { PatientListRow } from '../data/patient-list.store';
import { shortDate, sparkline } from './patient-row';
import { PatientTableComponent } from './patient-table.component';

const NOW = new Date(2026, 10, 14, 10, 0);

function row(p: PatientView, a: PatientActivity | null): PatientListRow {
  return { patient: p, cell: a ? loaded(a) : loading(), activity: a };
}

function render(rows: PatientListRow[], sort: 'name' | 'lastSession' = 'name') {
  TestBed.configureTestingModule({
    imports: [PatientTableComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(PatientTableComponent);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('sort', sort);
  fixture.componentRef.setInput('now', NOW);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('PatientTableComponent', () => {
  it('date seule : « 5 nov. », année ajoutée si autre que l’année en cours (décision 2)', () => {
    expect(shortDate('2026-11-05T09:00:00Z', 'fr', NOW)).toBe('5 nov.');
    expect(shortDate('2025-11-05T09:00:00Z', 'fr', NOW)).toBe('5 nov. 2025');
  });

  it('courbe : jours sans ressenti sautés, pointillés sous 3 ressentis, rien sans point', () => {
    const spark = sparkline(activity({ intensities: [10, null, 0], feelingCount: 2 }), 'fr');
    expect(spark).toEqual({
      path: 'M2 2 L90 20',
      end: { x: 90, y: 20 },
      dashed: true,
      label: 'Intensité moyenne sur 30 jours : de 10 à 0 sur 10',
    });
    expect(sparkline(activity({ intensities: [null, null] }), 'fr')).toBeNull();
  });

  it('colonnes : sept en-têtes, aria-sort selon le tri, ligne lien vers le dossier', () => {
    const el = render([row(patient(), activity())], 'lastSession');
    const heads = [...el.querySelectorAll('thead th')];
    expect(heads.map((th) => th.getAttribute('aria-sort'))).toEqual([
      null,
      'descending',
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(el.querySelector('tbody a.row-link')?.getAttribute('href')).toBe('/patients/p-marie');
  });

  it('tags en ligne : deux puis « +n »', () => {
    const tagged = patient({
      tags: ['a', 'b', 'c', 'd'].map((label) => ({ id: label, label })),
    });
    const el = render([row(tagged, activity())]);
    expect(text(el.querySelector('td.who .sub'))).toMatch(/· #a #b \+2$/);
  });

  it('puce « en cours · n min » à la place de la date quand une séance est ouverte', () => {
    const open = activity({ openSessionAt: new Date(NOW.getTime() - 25 * 60_000).toISOString() });
    const el = render([row(OMAR, open)]);
    expect(text(el.querySelector('td.last'))).toBe('en cours · 25 min');
    expect(text(el.querySelector('.cards .chip.live'))).toBe('25 min');
  });

  it('résumé en chargement : barres d’attente ; sans séance : tiret et libellé lu', () => {
    const el = render([row(patient(), null), row(OMAR, activity({ lastSession: null }))]);
    const [first, second] = [...el.querySelectorAll('tbody tr')];
    expect(first.querySelectorAll('.pending').length).toBe(4);
    expect(text(second.querySelector('td.last'))).toBe('—aucune séance');
  });

  it('carte mobile : nom, date, depuis la séance, attention ; puce « ! » si drapeau', () => {
    const el = render([
      row(
        OMAR,
        activity({
          drafts: 2,
          lastSession: {
            at: '2026-11-05T09:00:00Z',
            closedAt: '2026-11-05T10:00:00Z',
            modality: null,
            entryCount: 0,
            reportMissing: true,
          },
        }),
      ),
    ]);
    const card = el.querySelector('.cards li')!;
    expect(text(card.querySelector('.nm'))).toBe('Omar B.');
    expect(text(card.querySelector('.sub'))).toBe(
      '5 nov. · 5 entrées · anxiété 8/10 · 2 brouillons · compte rendu à écrire',
    );
    expect(text(card.querySelector('.chip.flag'))).toBe('!Drapeau posé : À surveiller');
  });
});
