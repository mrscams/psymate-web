import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { SessionStore } from '../../../core/auth';
import { PreferencesStore } from '../../../core/preferences';
import { EntriesApi } from '../data/entries.api';
import { EntryEditorStore } from '../data/entry-editor.store';
import { EMOTIONS } from '../data/entry.fixtures';
import { EmotionComboboxComponent } from './emotion-combobox.component';

@Component({
  selector: 'pm-test-host',
  imports: [ReactiveFormsModule, EmotionComboboxComponent],
  template: `<pm-emotion-combobox [formControl]="control" inputId="emotion" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HostComponent {
  readonly control = new FormControl<string | null>(null);
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function render(api: Partial<Record<keyof EntriesApi, ReturnType<typeof vi.fn>>> = {}) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: EntriesApi,
        useValue: {
          emotions: vi.fn().mockResolvedValue(EMOTIONS),
          tagLabels: vi.fn().mockResolvedValue([]),
          currentSession: vi.fn().mockResolvedValue(null),
          sessionsOf: vi.fn().mockResolvedValue([]),
          createEmotion: vi.fn(),
          ...api,
        },
      },
      { provide: SessionStore, useValue: { me: signal({ id: 'u-claire' }) } },
      {
        provide: PreferencesStore,
        useValue: { defaultVisibility: signal('clinical'), medicationVisible: signal(true) },
      },
    ],
  });
  void TestBed.inject(EntryEditorStore).open({ patientId: 'p-marie' });
  const fixture = TestBed.createComponent(HostComponent);
  await tick();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector<HTMLInputElement>('input[role="combobox"]')!;
  return { fixture, el, input, host: fixture.componentInstance };
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function key(target: HTMLElement, name: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

const options = (el: HTMLElement) =>
  [...el.querySelectorAll('[role="option"] .label')].map((o) =>
    (o.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );

describe('EmotionComboboxComponent', () => {
  it('chargement : « Chargement des émotions… » quand la liste est ouverte', async () => {
    const { fixture, el, input } = await render({
      emotions: vi.fn(() => new Promise(() => undefined)),
    });
    input.click();
    await fixture.whenStable();
    expect(el.querySelector('.hint[role="status"]')?.textContent).toContain(
      'Chargement des émotions',
    );
  });

  it('erreur : état erreur et Réessayer relit le vocabulaire', async () => {
    const emotions = vi
      .fn()
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' })
      .mockResolvedValue(EMOTIONS);
    const { fixture, el } = await render({ emotions });
    expect(el.querySelector('pm-state [role="alert"]')?.textContent).toContain(
      'Impossible de charger les émotions',
    );
    el.querySelector<HTMLButtonElement>('pm-state button')!.click();
    await tick();
    await fixture.whenStable();
    expect(emotions).toHaveBeenCalledTimes(2);
    expect(el.querySelector('pm-state')).toBeNull();
  });

  it('chargé : combobox ARIA, « anx » puis ↓ ⏎ choisit Anxiété (Entrée ne remonte pas)', async () => {
    const { fixture, el, input, host } = await render();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    type(input, 'anx');
    await fixture.whenStable();
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(options(el)).toEqual(['Anxiété', "Créer l'émotion personnalisée « anx »"]);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    key(input, 'ArrowDown');
    await fixture.whenStable();
    expect(input.getAttribute('aria-activedescendant')).toBe(
      el.querySelector('[role="option"]')!.id,
    );
    const enter = key(input, 'Enter');
    await fixture.whenStable();
    expect(enter.defaultPrevented).toBe(true);
    expect(host.control.value).toBe('anxiety');
    expect(input.value).toBe('Anxiété');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    // Liste fermée : Entrée n'est plus pour la liste (le panneau enregistre).
    expect(key(input, 'Enter').defaultPrevented).toBe(false);
  });

  it('Échap referme la liste sans remonter au panneau', async () => {
    const { fixture, input } = await render();
    type(input, 'co');
    await fixture.whenStable();
    const escape = key(input, 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('création en ligne : famille obligatoire, POST puis sélection', async () => {
    const createEmotion = vi
      .fn()
      .mockResolvedValue({ code: 'c_9f8e7d6c', label: 'Rumination', family: 'fear', custom: true });
    const { fixture, el, input, host } = await render({ createEmotion });
    type(input, 'Rumination');
    await fixture.whenStable();
    expect(options(el)).toEqual(["Créer l'émotion personnalisée « Rumination »"]);
    // ⏎ sans option active ne crée rien (jamais de création par mégarde) ; ↓ ⏎ ouvre la création.
    expect(key(input, 'Enter').defaultPrevented).toBe(false);
    key(input, 'ArrowDown');
    key(input, 'Enter');
    await fixture.whenStable();
    const fieldset = el.querySelector<HTMLElement>('fieldset.create')!;
    expect(fieldset.querySelector('legend')?.textContent).toContain('Famille de « Rumination »');
    el.querySelector<HTMLButtonElement>('.create-button')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.error')?.textContent).toContain('Choisissez une famille.');
    expect(createEmotion).not.toHaveBeenCalled();

    const fear = [...fieldset.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(
      (radio) => radio.value === 'fear',
    )!;
    fear.click();
    key(fear, 'Enter');
    await tick();
    await fixture.whenStable();
    expect(createEmotion).toHaveBeenCalledWith('Rumination', 'fear');
    expect(host.control.value).toBe('c_9f8e7d6c');
    expect(el.querySelector('fieldset.create')).toBeNull();
  });

  it('409 EMOTION_LABEL_EXISTS : message sous le champ, rien de sélectionné', async () => {
    const createEmotion = vi.fn().mockRejectedValue({ status: 409, code: 'EMOTION_LABEL_EXISTS' });
    const { fixture, el, input, host } = await render({ createEmotion });
    type(input, 'Rumination');
    await fixture.whenStable();
    key(input, 'ArrowDown');
    key(input, 'Enter');
    await fixture.whenStable();
    el.querySelector<HTMLInputElement>('input[value="sadness"]')!.click();
    el.querySelector<HTMLButtonElement>('.create-button')!.click();
    await tick();
    await fixture.whenStable();
    expect(el.querySelector('.error[role="alert"]')?.textContent).toContain(
      'Une émotion porte déjà ce libellé',
    );
    expect(host.control.value).toBeNull();
  });
});
