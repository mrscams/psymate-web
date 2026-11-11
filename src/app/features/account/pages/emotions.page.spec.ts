import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SessionStore } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { ToastService } from '../../../shared/ui';
import { EmotionsApi } from '../data/emotions.api';
import { writeJournal } from '../data/merge-journal';
import {
  ANXIETY,
  CLAIRE,
  EMOTIONS,
  JOY,
  LASSITUDE,
  MERGE,
  MOROSITE,
  SADNESS,
} from '../data/vocabulary.fixtures';
import { EmotionsPage } from './emotions.page';

async function render(api: Partial<EmotionsApi>) {
  TestBed.configureTestingModule({
    imports: [EmotionsPage],
    providers: [
      provideRouter([]),
      { provide: EmotionsApi, useValue: api },
      { provide: SessionApi, useValue: {} },
    ],
  });
  TestBed.inject(SessionStore).signIn(CLAIRE);
  const fixture = TestBed.createComponent(EmotionsPage);
  await settle(fixture);
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    toasts: TestBed.inject(ToastService),
  };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }
}

function button(root: ParentNode, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.trim().startsWith(text),
  );
  if (!found) throw new Error(`bouton absent : ${text}`);
  return found;
}

function type(input: HTMLInputElement | HTMLSelectElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
}

function row(el: HTMLElement, code: string): HTMLTableRowElement {
  const found = el.querySelector<HTMLTableRowElement>(`tr[data-code="${code}"]`);
  if (!found) throw new Error(`ligne absente : ${code}`);
  return found;
}

describe('EmotionsPage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    TestBed.inject(ToastService).clear();
  });

  it('chargement : squelette, formulaire présent, navigation Mon compte', async () => {
    const { el } = await render({ list: vi.fn(() => new Promise<never>(() => undefined)) });
    expect(el.querySelector('pm-state .loading[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('pm-emotion-form form')).not.toBeNull();
    expect(el.querySelector('pm-custom-emotions')).toBeNull();
    expect(el.querySelector('pm-account-nav .name')?.textContent).toBe('Claire Martin');
  });

  it('erreur : bloc erreur, Réessayer relit la liste', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
      .mockResolvedValue(EMOTIONS);
    const { fixture, el } = await render({ list });
    expect(el.querySelector('pm-state .error[role="alert"]')?.textContent).toContain(
      'Impossible de charger vos émotions personnalisées',
    );
    el.querySelector<HTMLButtonElement>('pm-state button.retry')?.click();
    await settle(fixture);
    expect(list).toHaveBeenCalledTimes(2);
    expect(el.querySelectorAll('pm-custom-emotions tbody tr[data-code]')).toHaveLength(2);
  });

  it('vide : aucune personnalisée → état vide, vocabulaire global affiché', async () => {
    const { el } = await render({ list: vi.fn().mockResolvedValue([SADNESS, ANXIETY, JOY]) });
    expect(el.querySelector('pm-state [role="status"]')?.textContent).toContain(
      'Aucune émotion personnalisée',
    );
    expect(el.querySelector('pm-state button')).toBeNull();
    expect(el.querySelector('#h-my-emotions')?.textContent).toContain('Mes émotions · 0');
    expect(el.querySelector('#h-global')?.textContent).toContain('3 émotions');
    expect(el.querySelector('pm-global-vocabulary')?.textContent).toContain('anxiété');
  });

  it('chargé : lignes avec badge perso et famille, Renommer / Fusionner…, jamais « Proposer au global »', async () => {
    const { el } = await render({ list: vi.fn().mockResolvedValue(EMOTIONS) });
    const lassitude = row(el, LASSITUDE.code);
    expect(lassitude.textContent).toContain('Lassitude');
    expect(lassitude.querySelector('.badge-perso')?.textContent).toBe('perso');
    expect(lassitude.textContent).toContain('Tristesse');
    expect(button(lassitude, 'Renommer')).toBeTruthy();
    expect(button(lassitude, 'Fusionner…')).toBeTruthy();
    expect(el.textContent).not.toMatch(/Proposer au global|Désactiver|Supprimer/);
    expect(el.querySelector('#h-my-emotions')?.textContent).toContain('Mes émotions · 2');
    expect(el.querySelector('a[href="/mon-compte/tags"]')).not.toBeNull();
  });

  it('UX-C4 : avertissement dès 3 lettres ; cartes de famille = label englobant le radio', async () => {
    const { fixture, el } = await render({ list: vi.fn().mockResolvedValue(EMOTIONS) });
    const input = el.querySelector<HTMLInputElement>('#field-labelFr')!;
    type(input, 'An');
    await settle(fixture);
    expect(el.querySelector('.proximity')).toBeNull();
    type(input, 'Anx');
    await settle(fixture);
    expect(el.querySelector('.proximity')?.textContent).toContain(
      'Proche de « Anxiété » (vocabulaire global)',
    );

    const cards = el.querySelectorAll<HTMLLabelElement>('fieldset.families label.family');
    expect(cards).toHaveLength(8);
    // Cliquer n'importe où sur la carte coche son radio (label englobant).
    const fear = [...cards].find((card) => card.textContent?.includes('Peur'))!;
    fear.click();
    await settle(fixture);
    expect(fear.querySelector<HTMLInputElement>('input[type=radio]')?.checked).toBe(true);
    expect(fear.classList.contains('checked')).toBe(true);
  });

  it('ajout : avertissement de proximité, 409 sous le champ, puis succès avec toast', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce({ status: 409, code: 'EMOTION_LABEL_EXISTS' })
      .mockResolvedValue({
        ...LASSITUDE,
        code: 'c_new',
        family: 'fear',
        labelFr: 'Appréhension sociale',
      });
    const { fixture, el, toasts } = await render({
      list: vi.fn().mockResolvedValue(EMOTIONS),
      create,
    });
    const input = el.querySelector<HTMLInputElement>('#field-labelFr')!;
    type(input, 'Anxiete');
    await settle(fixture);
    expect(el.querySelector('.proximity')?.textContent).toContain('Proche de « Anxiété »');
    expect(input.getAttribute('aria-describedby')).toContain('field-labelFr-near');

    // Famille obligatoire : rien n'est envoyé sans elle.
    button(el, 'Ajouter à mon vocabulaire').click();
    await settle(fixture);
    expect(create).not.toHaveBeenCalled();
    expect(el.querySelector('#field-family-error')).not.toBeNull();

    [...el.querySelectorAll<HTMLLabelElement>('label.family')]
      .find((label) => label.textContent?.includes('Peur'))!
      .querySelector('input')!
      .click();
    button(el, 'Ajouter à mon vocabulaire').click();
    await settle(fixture);
    expect(create).toHaveBeenCalledWith('Anxiete', 'fear');
    expect(el.querySelector('#field-labelFr-error')?.textContent).toContain('existe déjà');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    type(input, 'Appréhension sociale');
    button(el, 'Ajouter à mon vocabulaire').click();
    await settle(fixture);
    expect(toasts.toasts()[0].message).toBe(
      '« Appréhension sociale » ajoutée à votre vocabulaire.',
    );
    expect(input.value).toBe('');
  });

  it('renommer : édition en place, Entrée enregistre, la liste est relue', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(EMOTIONS)
      .mockResolvedValue([SADNESS, { ...LASSITUDE, labelFr: 'Lassitude profonde' }, MOROSITE]);
    const rename = vi.fn().mockResolvedValue(undefined);
    const { fixture, el } = await render({ list, rename });
    button(row(el, LASSITUDE.code), 'Renommer').click();
    await settle(fixture);
    const input = el.querySelector<HTMLInputElement>(`#rename-input-${LASSITUDE.code}`)!;
    expect(document.activeElement).toBe(input);
    type(input, 'Lassitude profonde');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle(fixture);
    expect(rename).toHaveBeenCalledWith(LASSITUDE.code, 'Lassitude profonde');
    expect(row(el, LASSITUDE.code).textContent).toContain('Lassitude profonde');
    expect(document.activeElement?.id).toBe(`rename-btn-${LASSITUDE.code}`);
  });

  it('fusionner : cible de la même famille, aperçu, autre famille confirmée, toast « Annuler », journal', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce(EMOTIONS)
      .mockResolvedValueOnce(EMOTIONS.filter((e) => e.code !== LASSITUDE.code))
      .mockResolvedValue(EMOTIONS);
    const merge = vi.fn().mockResolvedValue(MERGE);
    const undo = vi.fn().mockResolvedValue({ ...MERGE, undoneAt: '2026-11-08T10:00:00Z' });
    const { fixture, el, toasts } = await render({ list, merge, undo });

    button(row(el, LASSITUDE.code), 'Fusionner…').click();
    await settle(fixture);
    const select = el.querySelector<HTMLSelectElement>(`#merge-target-${LASSITUDE.code}`)!;
    expect(document.activeElement).toBe(select);
    const options = [...select.options].map((o) => o.value).filter(Boolean);
    expect(options).toEqual(['sadness', MOROSITE.code]);
    const confirm = button(el.querySelector('.merge-confirm')!, 'Fusionner');
    expect(confirm.disabled).toBe(true);

    // Autre famille : la confirmation supplémentaire est exigée.
    el.querySelector<HTMLInputElement>('.merge-controls input[type=checkbox]')!.click();
    await settle(fixture);
    type(select, 'joy');
    await settle(fixture);
    expect(el.querySelector('.family-warning')?.textContent).toContain('changeront de couleur');
    expect(confirm.disabled).toBe(true);
    el.querySelector<HTMLInputElement>('.family-warning input')!.click();
    await settle(fixture);
    expect(confirm.disabled).toBe(false);

    type(select, MOROSITE.code);
    await settle(fixture);
    expect(el.querySelector('.family-warning')).toBeNull();
    expect(el.querySelector('.merge-preview')?.textContent).toContain(
      'Fusionner « Lassitude » dans « Morosité » ?',
    );
    expect(el.querySelector('.merge-preview')?.textContent).toContain(
      'réversible pendant 30 jours',
    );
    confirm.click();
    await settle(fixture);
    expect(merge).toHaveBeenCalledWith(LASSITUDE.code, MOROSITE.code);
    expect(el.querySelector(`tr[data-code="${LASSITUDE.code}"]`)).toBeNull();
    expect(document.activeElement?.id).toBe('h-merge-journal');
    const toast = toasts.toasts()[0];
    expect(toast.message).toBe('« Lassitude » fusionnée dans « Morosité » : 3 ressentis déplacés.');
    expect(el.querySelector('pm-merge-journal li')?.textContent).toContain('Lassitude');
    expect(el.querySelector('pm-merge-journal li')?.textContent).toContain('3 ressentis');

    toast.action?.handler();
    await settle(fixture);
    expect(undo).toHaveBeenCalledWith('m-1');
    expect(row(el, LASSITUDE.code)).toBeTruthy();
    expect(el.querySelector('pm-merge-journal li')?.textContent).toContain('annulée le');
    expect(toasts.toasts().at(-1)?.message).toContain('« Lassitude » est de retour');
  });

  it('journal : annulation refusée (délai dépassé) → message en place, plus de bouton', async () => {
    writeJournal(CLAIRE.id, [
      {
        merge: { ...MERGE, undoUntil: '2999-01-01T00:00:00Z' },
        sourceLabel: 'Lassitude',
        targetLabel: 'Morosité',
      },
    ]);
    const undo = vi.fn().mockRejectedValue({ status: 409, code: 'MERGE_UNDO_EXPIRED' });
    const { fixture, el } = await render({ list: vi.fn().mockResolvedValue(EMOTIONS), undo });
    button(el.querySelector('pm-merge-journal')!, 'Annuler la fusion').click();
    await settle(fixture);
    expect(el.querySelector('#h-merge-journal + .error[role="alert"]')?.textContent).toContain(
      '30 jours',
    );
    expect(el.querySelector('pm-merge-journal li')?.textContent).toContain('délai');
    expect(el.querySelector('pm-merge-journal button')).toBeNull();
  });
});
