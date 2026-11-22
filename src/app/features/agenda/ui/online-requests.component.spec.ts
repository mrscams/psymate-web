import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { Appointment } from '../data/agenda.model';
import { guestOf, onlineRequestOf } from '../testing/agenda.testing';
import { OnlineRequestsComponent } from './online-requests.component';

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 2; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const sara = onlineRequestOf({
  id: 'req-1',
  startsAt: new Date(2026, 10, 26, 10, 0).toISOString(),
  durationMin: 60,
});
const hugo = onlineRequestOf({
  id: 'req-2',
  startsAt: new Date(2026, 11, 1, 14, 0).toISOString(),
  durationMin: 60,
  modality: 'video',
  guest: guestOf({ firstName: 'Hugo', lastName: 'Lemaire', email: 'hugo@example.test' }),
});

async function render(requests: Loadable<Appointment[]>) {
  TestBed.configureTestingModule({
    imports: [OnlineRequestsComponent],
    providers: [{ provide: LOCALE_ID, useValue: 'fr' }],
  });
  const fixture = TestBed.createComponent(OnlineRequestsComponent);
  document.body.append(fixture.nativeElement);
  fixture.componentRef.setInput('requests', requests);
  fixture.componentRef.setInput('titleId', 'demandes-titre');
  const picked = vi.fn();
  const closed = vi.fn();
  const retried = vi.fn();
  fixture.componentInstance.picked.subscribe(picked);
  fixture.componentInstance.closed.subscribe(closed);
  fixture.componentInstance.retried.subscribe(retried);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, picked, closed, retried };
}

describe('OnlineRequestsComponent (fiche 15, demandes en ligne)', () => {
  afterEach(() => document.querySelectorAll('pm-online-requests').forEach((n) => n.remove()));

  it('liste : panneau nommé par son titre (focus à l’ouverture), phrase du compteur, demandes dans l’ordre reçu', async () => {
    const { el, picked, closed } = await render(loaded([sara, hugo]));
    expect(el.getAttribute('role')).toBe('complementary');
    expect(el.getAttribute('aria-labelledby')).toBe('demandes-titre');
    const title = el.querySelector<HTMLElement>('h2')!;
    expect(title.id).toBe('demandes-titre');
    expect(text(title)).toBe('Demandes en ligne');
    expect(document.activeElement).toBe(title);
    const status = el.querySelector('.count-line')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(text(status)).toBe('2 demandes attendent votre réponse.');

    const buttons = [...el.querySelectorAll<HTMLButtonElement>('ul.req-list li button')];
    expect(
      buttons.map((b) => [text(b.querySelector('.when')), text(b.querySelector('.who'))]),
    ).toEqual([
      ['jeu. 26 nov. · 10:00–11:00', 'Sara Benali · Cabinet'],
      ['mar. 1 déc. · 14:00–15:00', 'Hugo Lemaire · Visio'],
    ]);
    expect(buttons[0].querySelector('.mono')?.textContent).toBe('10:00–11:00');
    buttons[1].click();
    expect(picked).toHaveBeenCalledWith(hugo);
    el.querySelector<HTMLButtonElement>('button.close')!.click();
    expect(closed).toHaveBeenCalled();
    expect(el.querySelector('button.close')!.getAttribute('aria-label')).toBe(
      'Fermer les demandes',
    );
  });

  it('une seule demande : « 1 demande attend votre réponse. »', async () => {
    const { el } = await render(loaded([sara]));
    expect(text(el.querySelector('.count-line'))).toBe('1 demande attend votre réponse.');
  });

  it('vide : pas de phrase de compteur, état vide de shared/ui/state', async () => {
    const { el } = await render(loaded([]));
    expect(el.querySelector('.count-line')).toBeNull();
    expect(el.querySelector('ul.req-list')).toBeNull();
    const state = el.querySelector('pm-state [role="status"]')!;
    expect(text(state)).toContain('Aucune demande en attente');
    expect(text(state)).toContain(
      'Les demandes faites depuis votre page de rendez-vous arrivent ici.',
    );
  });

  it('chargement : squelette de trois lignes ; une relecture garde la liste', async () => {
    const first = await render(idle());
    expect(first.el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    expect(first.el.querySelectorAll('pm-state .piece')).toHaveLength(3);
    TestBed.resetTestingModule();

    const again = await render(loading(loaded([sara])));
    expect(again.el.querySelector('pm-state')).toBeNull();
    expect(again.el.querySelectorAll('ul.req-list button')).toHaveLength(1);
  });

  it('erreur : « Les demandes n’ont pas pu être chargées. » et Réessayer', async () => {
    const { el, retried } = await render(failed({ status: 0, code: 'NETWORK_ERROR' }));
    const alert = el.querySelector('pm-state [role="alert"]')!;
    expect(text(alert)).toContain("Les demandes n'ont pas pu être chargées.");
    expect(text(alert)).not.toContain("Le serveur n'a pas répondu");
    el.querySelector<HTMLButtonElement>('pm-state button')!.click();
    expect(retried).toHaveBeenCalled();
  });
});
