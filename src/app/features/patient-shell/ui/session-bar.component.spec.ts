import { TestBed } from '@angular/core/testing';

import { openSession } from '../data/patient-shell.fixtures';
import { SessionBarComponent } from './session-bar.component';

// Barre de séance (UX-S3, propositions 04 et 04b état 4) : en cours, dépassement, non clôturée.

const start = '2026-11-12T08:08:00Z';
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000 + 34_000);

async function render(minutes: number, notedCount: number | null = 2) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [SessionBarComponent] });
  const fixture = TestBed.createComponent(SessionBarComponent);
  fixture.componentRef.setInput(
    'session',
    openSession({ startedAt: start, modality: 'in_person' }),
  );
  fixture.componentRef.setInput('planned', 50);
  fixture.componentRef.setInput('unclosedAfterMin', 180);
  fixture.componentRef.setInput('notedCount', notedCount);
  fixture.componentRef.setInput('now', at(minutes));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    el,
    bar: el.querySelector('.session-bar')!,
    text: () => (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    buttons: () => [...el.querySelectorAll('button')].map((b) => b.textContent?.trim()),
  };
}

describe('SessionBarComponent', () => {
  it('en cours : modalité, heure de début, minuterie, durée prévue, compte, Clôturer en contour', async () => {
    const { bar, text, buttons, el } = await render(12);
    expect(bar.classList.contains('overtime')).toBe(false);
    expect(bar.classList.contains('unclosed')).toBe(false);
    expect(text()).toContain('Séance en cours · cabinet · démarrée à');
    expect(el.querySelector('.timer')?.textContent).toBe('00:12:34');
    expect(text()).toContain('sur 50 min prévues');
    expect(text()).toContain('2 entrées notées');
    expect(buttons()).toEqual(['Clôturer la séance']);
    expect(el.querySelector('button')?.classList.contains('outline')).toBe(true);
  });

  it('rien de noté encore ; le compte absent tant qu’il n’est pas lu', async () => {
    expect((await render(1, 0)).text()).toContain('rien de noté encore');
    expect((await render(1, null)).text()).not.toContain('noté');
  });

  it('dépassement : teinte warning, « 8 min au-delà des 50 prévues », bouton plein', async () => {
    const { bar, text, el } = await render(58);
    expect(bar.classList.contains('overtime')).toBe(true);
    expect(text()).toContain('8 min au-delà des 50 prévues');
    expect(text()).not.toContain('sur 50 min prévues');
    expect(el.querySelector('button')?.classList.contains('filled')).toBe(true);
  });

  it('à la minute prévue, pas encore de dépassement', async () => {
    const { bar } = await render(50);
    expect(bar.classList.contains('overtime')).toBe(false);
  });

  it('plus de 3 h : barre grise « non clôturée », sans minuterie, Clôturer maintenant et Reprendre', async () => {
    const { bar, text, buttons, el, fixture } = await render(181, 5);
    expect(bar.classList.contains('unclosed')).toBe(true);
    expect(text()).toMatch(/^Séance du 12 nov\. 2026 · démarrée à .* · non clôturée 5 entrées/);
    expect(el.querySelector('.timer')).toBeNull();
    expect(buttons()).toEqual(['Clôturer maintenant', 'Reprendre']);

    const close = vi.fn();
    const resume = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(close);
    fixture.componentInstance.resumeRequested.subscribe(resume);
    el.querySelectorAll('button')[0].click();
    el.querySelectorAll('button')[1].click();
    expect(close).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('busy : Clôturer inactif', async () => {
    const { fixture, el } = await render(10);
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    expect(el.querySelector('button')?.disabled).toBe(true);
  });
});
