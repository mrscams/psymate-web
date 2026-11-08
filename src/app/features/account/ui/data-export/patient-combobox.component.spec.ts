import { TestBed } from '@angular/core/testing';

import { PATIENT_OPTIONS } from '../../data/data-export.fixtures';
import { PATIENT_SEARCH_DEBOUNCE_MS, PatientComboboxComponent } from './patient-combobox.component';

function render() {
  TestBed.configureTestingModule({ imports: [PatientComboboxComponent] });
  const fixture = TestBed.createComponent(PatientComboboxComponent);
  fixture.componentRef.setInput('label', 'Patient');
  fixture.componentRef.setInput('options', PATIENT_OPTIONS);
  const search = vi.fn();
  const selected = vi.fn();
  fixture.componentInstance.queryChange.subscribe(search);
  fixture.componentInstance.selectedChange.subscribe(selected);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector<HTMLInputElement>('input')!;
  const key = (name: string) => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    fixture.detectChanges();
  };
  const type = (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  return { fixture, el, input, key, type, search, selected };
}

describe('PatientComboboxComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('combobox lié à sa liste : libellé, aria-controls, fermé au départ', () => {
    const { el, input } = render();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(el.querySelector('label')?.getAttribute('for')).toBe(input.id);
    const list = el.querySelector('[role=listbox]');
    expect(input.getAttribute('aria-controls')).toBe(list?.id);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(list?.hasAttribute('hidden')).toBe(true);
  });

  it('↓ ↓ ↑ déplace l’option active, Entrée choisit, Échap ferme', () => {
    const { el, input, key, selected } = render();
    key('ArrowDown');
    key('ArrowDown');
    key('ArrowUp');
    key('ArrowDown');
    const options = el.querySelectorAll('[role=option]');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);
    expect(options[1].getAttribute('aria-selected')).toBe('true');

    key('Escape');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(selected).not.toHaveBeenCalled();

    key('ArrowDown');
    key('ArrowDown');
    key('Enter');
    expect(selected).toHaveBeenCalledWith(PATIENT_OPTIONS[1]);
    expect(input.value).toBe('Marius D.');
  });

  it('frappe : recherche après le délai, choix annulé quand le texte change', () => {
    vi.useFakeTimers();
    const { input, key, type, search, selected } = render();
    key('ArrowDown');
    key('Enter');
    expect(selected).toHaveBeenLastCalledWith(PATIENT_OPTIONS[0]);

    type('Pau');
    expect(selected).toHaveBeenLastCalledWith(null);
    expect(search).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PATIENT_SEARCH_DEBOUNCE_MS);
    expect(search).toHaveBeenCalledWith('Pau');
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('aucun résultat pour un texte : message de statut', () => {
    const { fixture, el, type } = render();
    fixture.componentRef.setInput('options', []);
    type('Zoé');
    expect(el.querySelector('[role=status]')?.textContent).toContain('Aucun dossier ne correspond');
  });
});
