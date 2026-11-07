import { TestBed } from '@angular/core/testing';

import { StateComponent } from './state.component';

async function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ imports: [StateComponent] });
  const fixture = TestBed.createComponent(StateComponent);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('StateComponent', () => {
  it('loading : role status, aria-busy, texte lu une fois, squelettes cachés aux lecteurs', async () => {
    const { el } = await render({ kind: 'loading', skeleton: 'row', lines: 6 });
    const block = el.querySelector('.loading');
    expect(block?.getAttribute('role')).toBe('status');
    expect(block?.getAttribute('aria-busy')).toBe('true');
    expect(block?.querySelector('.sr-only')?.textContent).toBe('Chargement…');
    const skeleton = el.querySelector('.skeleton');
    expect(skeleton?.getAttribute('aria-hidden')).toBe('true');
    expect(skeleton?.classList.contains('skeleton-row')).toBe(true);
    expect(skeleton?.querySelectorAll('.piece')).toHaveLength(6);
  });

  it('empty : role status, titre, phrase, une action avec sa touche', async () => {
    const handler = vi.fn();
    const { el } = await render({
      kind: 'empty',
      title: 'Aucune entrée dans cette période',
      message: 'Élargissez la période.',
      action: { label: 'Saisir une entrée', shortcut: 'N', handler },
    });
    const block = el.querySelector('.empty');
    expect(block?.getAttribute('role')).toBe('status');
    expect(block?.querySelector('.title')?.textContent).toBe('Aucune entrée dans cette période');
    expect(block?.querySelector('.message')?.textContent).toBe('Élargissez la période.');
    expect(block?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    const button = block?.querySelector<HTMLButtonElement>('button.action');
    expect(button?.textContent).toContain('Saisir une entrée');
    expect(button?.querySelector('kbd')?.textContent).toBe('N');
    button?.click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('error : role alert, Réessayer, détail technique replié', async () => {
    const handler = vi.fn();
    const { el } = await render({
      kind: 'error',
      title: 'Impossible de charger la timeline',
      message: 'Le serveur n’a pas répondu.',
      action: { label: 'Réessayer', handler },
      details: '503 · service indisponible',
    });
    const block = el.querySelector('.error');
    expect(block?.getAttribute('role')).toBe('alert');
    expect(block?.querySelector('.title')?.textContent).toBe('Impossible de charger la timeline');
    const details = block?.querySelector('details');
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.querySelector('pre')?.textContent).toBe('503 · service indisponible');
    block?.querySelector<HTMLButtonElement>('button.retry')?.click();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('error sans textes : titre et phrase par défaut ; null ne rend rien', async () => {
    const { el, fixture } = await render({ kind: 'error' });
    expect(el.querySelector('.title')?.textContent).toBe('Impossible de charger ce bloc');
    expect(el.querySelector('.message')?.textContent).toContain(
      'Rien n’a été modifié.'.replace('’', "'"),
    );
    expect(el.querySelector('button')).toBeNull();
    fixture.componentRef.setInput('kind', null);
    await fixture.whenStable();
    expect(el.querySelector('.state')).toBeNull();
  });
});
