import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PreferencesStore } from '../../../core/preferences';
import { ToastService } from '../../../shared/ui';
import { OverviewViewToggleComponent } from './overview-view-toggle.component';

async function render(problem: unknown = null) {
  const view = signal<'simple' | 'complete'>('simple');
  const set = vi.fn(async (_key: string, value: 'simple' | 'complete') => {
    view.set(value);
    if (problem) view.set('simple');
    return problem;
  });
  const warning = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: PreferencesStore, useValue: { overviewView: view, set } },
      { provide: ToastService, useValue: { warning } },
    ],
  });
  const fixture = TestBed.createComponent(OverviewViewToggleComponent);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (name: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
  return { fixture, el, set, warning, button };
}

describe('OverviewViewToggleComponent', () => {
  it('groupe nommé, deux boutons pressés selon overview.view, mention « mémorisée »', async () => {
    const { el, button } = await render();
    const group = el.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe("Niveau de détail de la vue d'ensemble");
    expect(button('Simple').getAttribute('aria-pressed')).toBe('true');
    expect(button('Complète').getAttribute('aria-pressed')).toBe('false');
    expect(el.textContent).toContain('mémorisée dans vos préférences');
  });

  it('Complète : écrit overview.view tout de suite, sans bouton « enregistrer »', async () => {
    const { fixture, set, button } = await render();
    button('Complète').click();
    await fixture.whenStable();
    expect(set).toHaveBeenCalledWith('overview.view', 'complete');
    expect(button('Complète').getAttribute('aria-pressed')).toBe('true');
    // Le bouton déjà pressé ne réécrit rien.
    button('Complète').click();
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('échec : la valeur serveur revient et un toast le dit', async () => {
    const { fixture, warning, button } = await render({ status: 500, code: 'INTERNAL_ERROR' });
    button('Complète').click();
    await fixture.whenStable();
    expect(warning).toHaveBeenCalledWith(
      "Impossible d'enregistrer ce réglage. La valeur précédente est rétablie.",
    );
    expect(button('Simple').getAttribute('aria-pressed')).toBe('true');
  });
});
