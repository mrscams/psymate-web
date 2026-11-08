import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { EntryType } from '../../../shared/ui';
import { DecadeStatus, periodMonth, Plage, TimelinePeriod } from '../data/timeline-decade.model';
import { monthlySummary, timelineItem, timelinePeriod } from '../data/timeline.fixtures';
import { TimelineItem } from '../data/timeline.model';
import { TimelineDecadeComponent } from './timeline-decade.component';

const m = (period: string) => periodMonth(period)!;

interface Inputs {
  status: DecadeStatus;
  periods: TimelinePeriod[];
  plage: Plage | null;
  types: EntryType[];
  situations?: TimelineItem[];
  followStart?: string | null;
  partialFilters?: boolean;
  problemCode?: string;
}

const ALL: EntryType[] = ['note', 'event', 'situation', 'feeling', 'session', 'medication'];

async function render(inputs: Inputs) {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'fr' }] });
  const fixture = TestBed.createComponent(TimelineDecadeComponent);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  const drills: number[] = [];
  let retries = 0;
  fixture.componentInstance.drill.subscribe((month) => drills.push(month));
  fixture.componentInstance.retry.subscribe(() => retries++);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, drills, retries: () => retries };
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Quatre ans de suivi (48 mois, intensité de 4 à 7) jusqu'en octobre 2026, plus 2014. */
const periods = [timelinePeriod('2014-01', { event: 2 }), ...monthlySummary(48, '2026-10')];
const plage = { start: m('2022-11'), end: m('2026-10') };

describe('TimelineDecadeComponent', () => {
  it('chargement : squelette, pas de graphique', async () => {
    const { el } = await render({ status: 'loading', periods: [], plage: null, types: ALL });
    expect(el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('svg[role="img"]')).toBeNull();
  });

  it('erreur : message, détail technique et Réessayer', async () => {
    const { el, retries } = await render({
      status: 'error',
      periods: [],
      plage: null,
      types: ALL,
      problemCode: 'INTERNAL_ERROR',
    });
    const alert = el.querySelector('pm-state [role="alert"]');
    expect(text(alert)).toContain("Impossible de charger l'agrégat par mois");
    expect(text(alert)).toContain('INTERNAL_ERROR');
    alert!.querySelector<HTMLButtonElement>('button')!.click();
    expect(retries()).toBe(1);
  });

  it('vide : aucun mois non vide pour les types montrés', async () => {
    const { el } = await render({
      status: 'loaded',
      periods: [timelinePeriod('2026-01', { note: 3 })],
      plage: { start: m('2026-01'), end: m('2026-03') },
      types: ['medication'],
    });
    expect(text(el.querySelector('pm-state [role="status"]'))).toContain(
      'Aucune entrée sur cette plage',
    );
  });

  it('chargé : étiquette, plage, comptes, image nommée, une info-bulle par mois, légende', async () => {
    const { el } = await render({
      status: 'loaded',
      periods,
      plage,
      types: ALL,
      followStart: '2025-03-04',
      situations: [
        timelineItem({
          id: 'conflit',
          type: 'situation',
          title: 'Conflit avec la sœur',
          occurred: { from: '2023-06-01T00:00:00Z', to: null, precision: 'month', label: null },
          ongoing: true,
        }),
      ],
    });
    expect(text(el.querySelector('.badge'))).toBe('Agrégé par mois · double-clic pour zoomer');
    // Une unité de traduction par ICU (années, mois, entrées, hors plage) ; mois vides de la durée omis.
    const facts = [...el.querySelectorAll('.facts > span')].map(text);
    expect(facts).toEqual([
      'nov. 2022 → oct. 2026',
      '4 ans',
      '48 mois · 48 non vides ·',
      '192 entrées',
      '2 entrées hors plage',
    ]);

    const svg = el.querySelector('svg[role="img"]')!;
    const label = svg.getAttribute('aria-label')!;
    expect(label).toContain('Agrégats par mois de novembre 2022 à octobre 2026');
    expect(label).toContain('192 entrées sur 48 mois non vides');
    expect(label).toMatch(/Intensité moyenne des ressentis de 4,0 à 7,0/);
    expect(label).toContain('Situations longues : 1.');
    const hits = svg.querySelectorAll('rect.hit');
    expect(hits).toHaveLength(48);
    expect(text(hits[0].querySelector('title'))).toBe(
      'nov. 2022 : Notes 2, Ressentis 1 et Séances 1 · intensité moyenne 4,0',
    );
    expect(svg.querySelectorAll('polyline.curve')).toHaveLength(1);
    expect(text(svg.querySelector('.follow-label'))).toBe('début du suivi · mars 2025');
    expect(text(svg.querySelector('.band-label'))).toContain('Conflit avec la sœur');
    const legend = [...el.querySelectorAll('.legend li')].map(text);
    expect(legend).toContain('Notes');
    expect(legend).toContain('Intensité moyenne des ressentis (axe droit, 0–10)');
    expect(legend).toContain('Situations longues');
  });

  it('couleurs : uniquement des classes de type (tokens --entry-*), aucune couleur en attribut', async () => {
    const { el } = await render({ status: 'loaded', periods, plage, types: ALL });
    const svg = el.querySelector('svg[role="img"]')!;
    const classes = new Set(
      [...svg.querySelectorAll('rect:not(.hit):not(.band)')].map((r) => r.getAttribute('class')),
    );
    expect([...classes].sort()).toEqual(['seg type-feeling', 'seg type-note', 'seg type-session']);
    for (const node of svg.querySelectorAll('*')) {
      expect(node.getAttribute('fill')).toBeNull();
      expect(node.getAttribute('stroke')).toBeNull();
      expect(node.getAttribute('style')).toBeNull();
    }
  });

  it('double-clic sur un mois : demande son détail', async () => {
    const { el, drills } = await render({ status: 'loaded', periods, plage, types: ALL });
    const march = el.querySelector('rect.hit[data-month="2025-03"]')!;
    march.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(drills).toEqual([m('2025-03')]);
  });

  it('tableau des mois : équivalent accessible, Entrée sur un mois demande son détail', async () => {
    const { el, drills } = await render({
      status: 'loaded',
      periods,
      plage,
      types: ['note', 'feeling'],
      partialFilters: true,
    });
    expect(text(el.querySelector('.note'))).toContain("ne s'appliquent pas à l'agrégat par mois");
    const table = el.querySelector('details.months table')!;
    expect([...table.querySelectorAll('thead th')].map(text)).toEqual([
      'Mois',
      'Notes',
      'Ressentis',
      'Intensité moyenne',
    ]);
    const rows = table.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(48);
    expect([...rows[0].querySelectorAll('td')].map(text)).toEqual(['2', '1', '4,0']);
    const button = rows[4].querySelector<HTMLButtonElement>('button.month-button')!;
    expect(button.getAttribute('aria-label')).toBe('mars 2023, voir le détail');
    button.click();
    expect(drills).toEqual([m('2023-03')]);
  });

  it('sans ressentis montrés : ni courbe, ni axe droit, ni colonne d’intensité', async () => {
    const { el } = await render({ status: 'loaded', periods, plage, types: ['note'] });
    expect(el.querySelector('polyline.curve')).toBeNull();
    expect(el.querySelector('text.intensity')).toBeNull();
    expect([...el.querySelectorAll('thead th')].map(text)).toEqual(['Mois', 'Notes']);
  });
});
