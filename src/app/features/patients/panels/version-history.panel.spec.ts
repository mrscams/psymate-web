import { DIALOG_DATA } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { StateKind } from '../../../shared/util';
import { VersionDiff } from '../data/patient.model';
import { PatientVersionsPanel, PatientVersionsPanelData } from './version-history.panel';

const DIFF: VersionDiff = {
  version: 2,
  createdAt: '2026-11-10T09:00:00Z',
  reason: null,
  baseUnknown: false,
  changes: [{ field: 'followUp.rhythm', before: 'weekly', after: 'monthly' }],
} as VersionDiff;

async function render(state: StateKind | null, history: VersionDiff[] = []) {
  const retry = vi.fn();
  const data: PatientVersionsPanelData = {
    name: 'Nour K.',
    history: signal(history),
    state: signal(state),
    retry,
  };
  TestBed.configureTestingModule({ providers: [{ provide: DIALOG_DATA, useValue: data }] });
  const fixture = TestBed.createComponent(PatientVersionsPanel);
  await fixture.whenStable();
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, retry };
}

describe('PatientVersionsPanel', () => {
  it('titre, nom du patient, versions champ par champ', async () => {
    const { el } = await render(null, [DIFF]);
    expect(el.querySelector('pm-side-panel h2')?.textContent).toContain('Historique des versions');
    expect(el.querySelector('pm-side-panel .subtitle')?.textContent).toBe('Nour K.');
    const version = el.querySelector('.version')!;
    expect(version.textContent).toContain('Version 2');
    expect(version.querySelector('del')?.textContent).toBe('Hebdomadaire');
    expect(version.querySelector('ins')?.textContent).toBe('Mensuel');
  });

  it('chargement, vide, erreur avec Réessayer', async () => {
    let { el } = await render('loading');
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    TestBed.resetTestingModule();
    ({ el } = await render('empty'));
    expect(el.textContent).toContain('Aucune modification depuis la création');
    TestBed.resetTestingModule();
    const rendered = await render('error');
    expect(rendered.el.textContent).toContain("Impossible de charger l'historique");
    rendered.el.querySelector<HTMLButtonElement>('pm-version-history button')!.click();
    expect(rendered.retry).toHaveBeenCalled();
  });
});
