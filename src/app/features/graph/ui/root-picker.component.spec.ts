import { TestBed } from '@angular/core/testing';

import { RootOption, RootPickerComponent } from './root-picker.component';

const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const OPTIONS: RootOption[] = [
  { id: 'e-sit', type: 'situation', name: 'Surcharge au travail', date: '1 mars' },
  { id: 'e-note', type: 'note', name: 'Note · 24 oct.', date: '24 oct.' },
  { id: 'e-feel', type: 'feeling', name: 'Anxiété 8/10 · 2 nov.', date: '2 nov.' },
];

async function render(selectedId: string | null = 'e-sit') {
  const fixture = TestBed.createComponent(RootPickerComponent);
  fixture.componentRef.setInput('options', OPTIONS);
  fixture.componentRef.setInput('selectedId', selectedId);
  fixture.componentRef.setInput(
    'current',
    selectedId ? { type: 'situation', name: 'Surcharge au travail' } : null,
  );
  fixture.componentRef.setInput('allWarning', "jusqu'à 150 nœuds, étiquettes masquées");
  fixture.autoDetectChanges();
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  const picked: (string | null)[] = [];
  const searched: string[] = [];
  fixture.componentInstance.picked.subscribe((value) => picked.push(value));
  fixture.componentInstance.searched.subscribe((value) => searched.push(value));
  const el = fixture.nativeElement as HTMLElement;
  const trigger = el.querySelector<HTMLButtonElement>('.trigger')!;
  const settle = async () => {
    await tick();
    await fixture.whenStable();
  };
  const key = async (target: Element, k: string) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    await settle();
  };
  return { fixture, el, trigger, picked, searched, settle, key };
}

describe('RootPickerComponent', () => {
  afterEach(() => document.querySelectorAll('pm-graph-root-picker').forEach((n) => n.remove()));

  it('bouton : nom accessible « Centré sur » + racine, icône du type, liste fermée', async () => {
    const { el, trigger } = await render();
    const ids = trigger.getAttribute('aria-labelledby')!.split(' ');
    expect(ids.map((id) => text(el.querySelector(`[id="${id}"]`)))).toEqual([
      'Centré sur',
      'Surcharge au travail',
    ]);
    expect(trigger.querySelector('pm-entry-icon')).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });

  it('flèches : l’option active suit (aria-activedescendant) ; Entrée choisit ; focus rendu au bouton', async () => {
    const { el, trigger, picked, settle, key } = await render();
    trigger.click();
    await settle();
    const input = el.querySelector<HTMLInputElement>('[role="combobox"]')!;
    expect(document.activeElement).toBe(input);
    // L'option cochée (la racine) est active à l'ouverture.
    const active = () =>
      text(el.querySelector(`[id="${input.getAttribute('aria-activedescendant')}"]`));
    expect(active()).toContain('Surcharge au travail');
    await key(input, 'Home');
    expect(active()).toContain('Tout le dossier');
    await key(input, 'End');
    expect(active()).toContain('Anxiété 8/10');
    await key(input, 'ArrowDown');
    expect(active()).toContain('Tout le dossier');
    await key(input, 'ArrowDown');
    await key(input, 'Enter');
    // Ordre des groupes : Note, Situation, Ressenti (ordre des types du produit).
    expect(picked).toEqual(['e-note']);
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Échap ferme la liste sans rien choisir et ne se propage pas', async () => {
    const { el, trigger, picked, settle } = await render(null);
    trigger.click();
    await settle();
    const input = el.querySelector<HTMLInputElement>('[role="combobox"]')!;
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    await settle();
    document.removeEventListener('keydown', outside);
    expect(outside).not.toHaveBeenCalled();
    expect(picked).toEqual([]);
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    expect(text(trigger)).toBe('Tout le dossier');
  });

  it('texte : filtre sur le nom, le type et la date (sans accents), émis pour la recherche du dossier', async () => {
    const { el, trigger, searched, settle } = await render();
    trigger.click();
    await settle();
    const input = el.querySelector<HTMLInputElement>('[role="combobox"]')!;
    input.value = 'anxiete';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(searched).toEqual(['anxiete']);
    expect([...el.querySelectorAll('[role="option"] .option-name')].map(text)).toEqual([
      'Anxiété 8/10 · 2 nov.',
    ]);
    input.value = 'situation';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect([...el.querySelectorAll('[role="option"] .option-name')].map(text)).toEqual([
      'Surcharge au travail',
    ]);
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    expect(text(el.querySelector('.empty'))).toBe('Aucune entrée ne correspond.');
  });
});
