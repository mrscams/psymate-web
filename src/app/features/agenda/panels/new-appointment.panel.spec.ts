import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PreferencesStore } from '../../../core/preferences';
import { demoAgenda } from '../data/agenda.fixtures';
import { fromIsoDay, rangeFor } from '../data/agenda.model';
import { NewAppointmentData, NewAppointmentPanel } from './new-appointment.panel';

const week = demoAgenda(rangeFor('week', fromIsoDay('2026-10-26')!));
const marie = week.appointments.find((item) => item.patient.displayName === 'Marie D.')!;

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

async function render(overrides: Partial<NewAppointmentData> = {}) {
  const slot = new Date(2026, 10, 7, 10, 0);
  const data: NewAppointmentData = {
    slot,
    patient: marie.patient,
    lastSessionAt: new Date(2026, 9, 31, 10, 0).toISOString(),
    // Le créneau cliqué est vide : la séance de Marie D. de la démonstration n'y est pas encore.
    appointments: demoAgenda(rangeFor('week', slot)).appointments.filter(
      (item) => item.patient.displayName !== 'Marie D.',
    ),
    busy: demoAgenda(rangeFor('week', slot)).busy,
    ...overrides,
  };
  const dialogRef = { close: vi.fn() };
  TestBed.configureTestingModule({
    imports: [NewAppointmentPanel],
    providers: [
      provideRouter([]),
      { provide: LOCALE_ID, useValue: 'fr' },
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: dialogRef },
      { provide: PreferencesStore, useValue: { defaultDurationMin: () => 60 } },
    ],
  });
  const fixture = TestBed.createComponent(NewAppointmentPanel);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const select = (label: string) =>
    [...el.querySelectorAll<HTMLSelectElement>('select')].find(
      (node) =>
        el.querySelector(`label[for="${node.id}"]`)?.textContent?.includes(label) ||
        node.getAttribute('aria-label') === label,
    )!;
  return { fixture, el, dialogRef, select };
}

describe('NewAppointmentPanel (fiche 15b)', () => {
  it('maquette : titre, créneau cliqué, carte patient, fin et voisinage, modalité, aperçu Google, pied', async () => {
    const { el } = await render();
    expect(text(el.querySelector('.title'))).toBe('Nouveau rendez-vous');
    expect(text(el.querySelector('.subtitle'))).toBe('Créneau cliqué : samedi 7 novembre, 10:00');
    expect(text(el.querySelector('.patient-card .name'))).toBe('Marie D.');
    expect(text(el.querySelector('.patient-card .meta'))).toBe(
      '34 ans · dernière séance le 31 oct. · rythme toutes les 1 à 2 semaines',
    );
    expect(text(el.querySelector('.rhythm'))).toBe(
      'Le créneau respecte le rythme habituel (7 jours après le 31 oct.).',
    );
    expect(el.querySelector('.rhythm')?.classList.contains('ok')).toBe(true);
    expect(el.querySelector<HTMLInputElement>('input.mono')?.value).toBe('10:00');
    expect(text(el.querySelector('.slot + .hint'))).toBe(
      'Se termine à 10:50 · suivi de Théo B. à 11:30, pas de chevauchement.',
    );
    const segments = [...el.querySelectorAll<HTMLButtonElement>('.segment')];
    expect(segments.map((b) => text(b))).toEqual(['Cabinet', 'Visio', 'Téléphone']);
    expect(segments.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(text(el.querySelector('.google-title'))).toBe(
      'Sera copié dans Google Agenda « PsyMate »',
    );
    expect(text(el.querySelector('.preview .mono'))).toBe('Séance · M. D.');
    expect(text(el.querySelector('.preview-text span:last-child'))).toBe(
      'sam. 7 nov. · 10:00–10:50 · Cabinet',
    );
    expect(el.querySelector('.warning')).toBeNull();
    expect(text(el.querySelector('.submit'))).toBe('Planifier le rendez-vous');
    expect(text(el.querySelector('.confirm'))).toBe('À confirmer avec la patiente');
    expect(text(el.querySelector('.cancel'))).toBe('Annuler Échap');
  });

  it('durée, heure et répétition recalculent la fin, les occurrences, l’aperçu et le bouton', async () => {
    const { fixture, el, select } = await render();
    const duration = select('Durée');
    duration.value = [...duration.options].find((o) => o.textContent?.includes('90'))!.value;
    duration.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(text(el.querySelector('.slot + .hint'))).toContain('Se termine à 11:30');
    expect(text(el.querySelector('.slot + .hint'))).toContain('suivi de Théo B. à 11:30');

    const start = el.querySelector<HTMLInputElement>('input.mono')!;
    start.value = '11:00';
    start.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(text(el.querySelector('.slot + .hint'))).toContain('chevauche Théo B. (11:30–12:20)');

    const repeat = select('Répéter');
    repeat.value = [...repeat.options].find((o) => o.textContent?.includes('2 semaines'))!.value;
    repeat.dispatchEvent(new Event('change'));
    await settle(fixture);
    const count = select('Nombre de répétitions');
    expect([...count.options].map((o) => text(o))).toEqual([
      '4 fois (jusqu’au 19 déc.)'.replace('’', "'"),
      '8 fois',
      'Jusqu’à une date…'.replace('’', "'"),
    ]);
    expect(text(el.querySelector('.submit'))).toBe('Planifier 4 rendez-vous');
    expect(text(el.querySelector('.preview-text span:last-child'))).toContain('4 occurrences');
    expect(text(el.querySelector('.repeat + .hint'))).toContain(
      'Chaque occurrence est un rendez-vous distinct',
    );

    el.querySelectorAll<HTMLButtonElement>('.segment')[1].click();
    await settle(fixture);
    expect(el.querySelectorAll('.segment')[1].getAttribute('aria-pressed')).toBe('true');
    expect(text(el.querySelector('.preview-text span:last-child'))).toContain('Visio');
  });

  it('conflit avec un bloc Google : avertissement ambre nommant l’occurrence et le bloc', async () => {
    const { el } = await render({ slot: new Date(2026, 10, 2, 14, 0) });
    expect(text(el.querySelector('.warning'))).toBe(
      "L'occurrence du 2 nov. chevauche un bloc « Occupé · Google Pro » (14:00–16:00). Elle sera créée quand même ; vous pourrez la déplacer depuis l'agenda.",
    );
  });

  it('sans patient prérempli : pas de carte ni de ligne de rythme, durée = préférence ; Annuler ferme', async () => {
    const { el, dialogRef, select } = await render({ patient: null, lastSessionAt: null });
    expect(el.querySelector('.patient-card')).toBeNull();
    expect(el.querySelector('.rhythm')).toBeNull();
    expect(text(select('Durée').selectedOptions[0])).toBe('60 min');
    expect(text(el.querySelector('.preview .mono'))).toBe('Séance');
    el.querySelector<HTMLButtonElement>('.cancel')!.click();
    expect(dialogRef.close).toHaveBeenCalled();
  });
});
