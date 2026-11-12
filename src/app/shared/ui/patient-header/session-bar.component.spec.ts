import { ChangeDetectionStrategy, Component, input, LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { PatientSessionInfo, UNCLOSED_SESSION_AFTER_MIN } from './patient-header.component';
import { formatElapsed, SessionBarComponent } from './session-bar.component';

@Component({
  selector: 'pm-session-bar-host',
  imports: [SessionBarComponent],
  template: `
    <pm-session-bar
      [session]="session()"
      [plannedMin]="plannedMin()"
      [entriesCount]="entriesCount()"
      [busy]="busy()"
      [unclosedAfterMin]="unclosedAfterMin()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly session = input<PatientSessionInfo | null>(null);
  readonly plannedMin = input<number | null>(null);
  readonly entriesCount = input<number | null>(null);
  readonly busy = input(false);
  readonly unclosedAfterMin = input<number | null>(null);
}

const plainText = (node: Element | null | undefined) =>
  node?.textContent?.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

async function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

/** L'heure de début telle que le composant l'écrit (fuseau de la machine, locale des tests). */
function startedAt(iso: string): string {
  return new Intl.DateTimeFormat(TestBed.inject(LOCALE_ID), { timeStyle: 'short' }).format(
    new Date(iso),
  );
}

const open: PatientSessionInfo = {
  kind: 'current',
  startedAt: '2026-10-24T07:08:00Z',
  modality: 'in_person',
};

describe('SessionBarComponent', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());

  it('formatElapsed : hh:mm:ss, jamais négatif', () => {
    const now = new Date('2026-10-24T07:29:07Z');
    expect(formatElapsed('2026-10-24T07:08:00Z', now)).toBe('00:21:07');
    expect(formatElapsed('2026-10-24T05:08:00Z', now)).toBe('02:21:07');
    expect(formatElapsed('2026-10-24T08:00:00Z', now)).toBe('00:00:00');
    expect(formatElapsed('pas une date', now)).toBe('00:00:00');
  });

  it('rien sans séance ouverte (dernière séance, aucune, null)', async () => {
    const { el, fixture } = await render({ session: { kind: 'last', date: '2026-10-17' } });
    expect(el.querySelector('.session-bar')).toBeNull();
    fixture.componentRef.setInput('session', { kind: 'none' });
    await fixture.whenStable();
    expect(el.querySelector('.session-bar')).toBeNull();
  });

  it('séance en cours : libellé avec modalité et heure de début, chronomètre tabulaire, durée prévue, Clôturer', async () => {
    vi.setSystemTime(new Date('2026-10-24T07:29:07Z'));
    const { el } = await render({ session: open, plannedMin: 50 });
    const bar = el.querySelector('.session-bar')!;
    expect(bar.classList.contains('unclosed')).toBe(false);
    expect(bar.querySelector('.pulse')?.getAttribute('aria-hidden')).toBe('true');
    const text = bar.querySelector('.session-text');
    expect(text?.classList.contains('current')).toBe(true);
    expect(plainText(text)).toBe(
      `Séance en cours · cabinet · démarrée à ${startedAt(open.startedAt)}`,
    );
    const timer = bar.querySelector('.timer');
    expect(timer?.getAttribute('role')).toBe('timer');
    expect(timer?.getAttribute('aria-label')).toBe('Temps écoulé');
    expect(timer?.textContent).toBe('00:21:07');
    expect(plainText(bar.querySelector('.planned'))).toBe('sur 50 min prévues');
    // Nombre d'entrées inconnu : rien.
    expect(bar.querySelector('.count')).toBeNull();
    const close = bar.querySelector('button.close-session');
    expect(close?.getAttribute('aria-label')).toBe('Clôturer la séance');
    expect(plainText(close?.querySelector('.long'))).toBe('Clôturer la séance');
    expect(plainText(close?.querySelector('.short'))).toBe('Clôturer');
  });

  it('le chronomètre avance seconde par seconde, et s’arrête quand la séance se ferme', async () => {
    vi.setSystemTime(new Date('2026-10-24T07:29:07Z'));
    const { el, fixture } = await render({ session: open });
    expect(el.querySelector('.timer')?.textContent).toBe('00:21:07');
    vi.advanceTimersByTime(1_000);
    await fixture.whenStable();
    expect(el.querySelector('.timer')?.textContent).toBe('00:21:08');
    vi.advanceTimersByTime(53_000);
    await fixture.whenStable();
    expect(el.querySelector('.timer')?.textContent).toBe('00:22:01');

    fixture.componentRef.setInput('session', { kind: 'last', date: '2026-10-24' });
    await fixture.whenStable();
    expect(el.querySelector('.session-bar')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sans modalité ni durée prévue : « démarrée à » seul, pas de mention « prévues »', async () => {
    vi.setSystemTime(new Date('2026-10-24T07:29:07Z'));
    const { el } = await render({
      session: { kind: 'current', startedAt: '2026-10-24T07:08:00Z' },
      plannedMin: null,
    });
    expect(plainText(el.querySelector('.session-text'))).toBe(
      `Séance en cours · démarrée à ${startedAt(open.startedAt)}`,
    );
    expect(el.querySelector('.planned')).toBeNull();
  });

  it.each([
    [0, 'rien de noté encore'],
    [1, '1 entrée notée'],
    [3, '3 entrées notées'],
  ])('entriesCount %i : « %s »', async (count, expected) => {
    vi.setSystemTime(new Date('2026-10-24T07:29:07Z'));
    const { el } = await render({ session: open, entriesCount: count });
    expect(plainText(el.querySelector('.count'))).toBe(expected);
  });

  it('Clôturer : émet closeSession, inactif pendant une action', async () => {
    vi.setSystemTime(new Date('2026-10-24T07:29:07Z'));
    const { el, fixture } = await render({ session: open });
    const closed = vi.fn();
    const bar = fixture.debugElement.query(By.directive(SessionBarComponent))
      .componentInstance as SessionBarComponent;
    bar.closeSession.subscribe(closed);
    const button = el.querySelector<HTMLButtonElement>('button.close-session')!;
    button.click();
    expect(closed).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    expect(button.disabled).toBe(true);
  });

  it('UX-A8 : au-delà du seuil de 3 h, barre grise « non clôturée », sans chronomètre, Clôturer toujours là', async () => {
    const unclosedAfterMin = UNCLOSED_SESSION_AFTER_MIN;
    vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
    const atThree = await render({ session: open, unclosedAfterMin, plannedMin: 50 });
    expect(atThree.el.querySelector('.session-bar')?.classList.contains('unclosed')).toBe(false);
    expect(atThree.el.querySelector('.timer')?.textContent).toBe('02:52:00');
    TestBed.resetTestingModule();

    // 12 h 37 après le début : la séance reste ouverte (rien de recalculé), seul l'affichage change.
    vi.setSystemTime(new Date('2026-10-24T19:45:00Z'));
    const { el } = await render({ session: open, unclosedAfterMin, plannedMin: 50 });
    const bar = el.querySelector('.session-bar')!;
    expect(bar.classList.contains('unclosed')).toBe(true);
    expect(plainText(bar.querySelector('.session-text'))).toBe(
      `Séance du 24 oct. 2026 · cabinet · démarrée à ${startedAt(open.startedAt)} · non clôturée`,
    );
    expect(bar.querySelector('.timer')).toBeNull();
    expect(bar.querySelector('.planned')).toBeNull();
    expect(bar.querySelector('button.close-session')).not.toBeNull();
  });

  it('UX-S3, 04b état 4 : passé la durée prévue, teinte ambre, « 8 min au-delà des 50 prévues », Clôturer plein', async () => {
    vi.setSystemTime(new Date('2026-10-24T08:06:12Z'));
    const { el } = await render({ session: open, plannedMin: 50, entriesCount: 5 });
    const bar = el.querySelector('.session-bar')!;
    expect(bar.classList.contains('overtime')).toBe(true);
    expect(bar.classList.contains('unclosed')).toBe(false);
    expect(plainText(bar.querySelector('.timer'))).toBe('00:58:12');
    expect(plainText(bar.querySelector('.planned'))).toBe('8 min au-delà des 50 prévues');
    expect(plainText(bar)).not.toContain('sur 50 min prévues');
    expect(plainText(bar.querySelector('.count'))).toBe('5 entrées notées');
    const close = bar.querySelector('button.close-session')!;
    expect(close.classList.contains('filled')).toBe(true);
    expect(close.getAttribute('aria-label')).toBe('Clôturer la séance');
    expect(bar.querySelector('.resume')).toBeNull();
  });

  it('à la minute prévue, pas encore de dépassement ; sans durée prévue, jamais', async () => {
    vi.setSystemTime(new Date('2026-10-24T07:58:30Z'));
    const atPlanned = await render({ session: open, plannedMin: 50 });
    expect(atPlanned.el.querySelector('.session-bar')?.classList.contains('overtime')).toBe(false);
    TestBed.resetTestingModule();
    vi.setSystemTime(new Date('2026-10-24T09:00:00Z'));
    const { el } = await render({ session: open, plannedMin: null });
    expect(el.querySelector('.session-bar')?.classList.contains('overtime')).toBe(false);
  });

  it('UX-S3 : barre grise « non clôturée » : « Clôturer maintenant », « n entrées », Reprendre émet resumeSession', async () => {
    vi.setSystemTime(new Date('2026-10-24T19:45:00Z'));
    const { el, fixture } = await render({
      session: open,
      unclosedAfterMin: UNCLOSED_SESSION_AFTER_MIN,
      plannedMin: 50,
      entriesCount: 5,
    });
    const bar = el.querySelector('.session-bar')!;
    expect(bar.classList.contains('unclosed')).toBe(true);
    expect(bar.classList.contains('overtime')).toBe(false);
    const close = bar.querySelector('button.close-session')!;
    expect(close.getAttribute('aria-label')).toBe('Clôturer maintenant');
    expect(plainText(close.querySelector('.long'))).toBe('Clôturer maintenant');
    expect(plainText(bar.querySelector('.count'))).toBe('5 entrées');
    const resumed = vi.fn();
    const component = fixture.debugElement.query(By.directive(SessionBarComponent))
      .componentInstance as SessionBarComponent;
    component.resumeSession.subscribe(resumed);
    bar.querySelector<HTMLButtonElement>('button.resume')!.click();
    expect(resumed).toHaveBeenCalledTimes(1);
  });

  it('UX-A8 : sans seuil (défaut), le chronomètre continue au-delà de 3 h', async () => {
    vi.setSystemTime(new Date('2026-10-24T19:45:00Z'));
    const { el } = await render({ session: open });
    expect(el.querySelector('.session-bar')?.classList.contains('unclosed')).toBe(false);
    expect(el.querySelector('.timer')?.textContent).toBe('12:37:00');
  });
});
