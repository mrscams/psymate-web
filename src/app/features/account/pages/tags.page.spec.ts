import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SessionStore } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { ToastService } from '../../../shared/ui';
import { TagsApi } from '../data/tags.api';
import { BOULOT, CLAIRE, SANTE, TAG_IS_EMOTION, TAGS, TRAVAIL } from '../data/vocabulary.fixtures';
import { TagsPage } from './tags.page';

async function render(api: Partial<TagsApi>) {
  TestBed.configureTestingModule({
    imports: [TagsPage],
    providers: [
      provideRouter([]),
      { provide: TagsApi, useValue: api },
      { provide: SessionApi, useValue: {} },
    ],
  });
  TestBed.inject(SessionStore).signIn(CLAIRE);
  const fixture = TestBed.createComponent(TagsPage);
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

function row(el: HTMLElement, label: string): HTMLTableRowElement {
  const found = el.querySelector<HTMLTableRowElement>(`tr[data-tag="${label}"]`);
  if (!found) throw new Error(`ligne absente : ${label}`);
  return found;
}

describe('TagsPage', () => {
  afterEach(() => TestBed.inject(ToastService).clear());

  it('chargement : squelette, formulaire présent', async () => {
    const { el } = await render({ list: vi.fn(() => new Promise<never>(() => undefined)) });
    expect(el.querySelector('pm-state .loading[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('pm-tag-form form')).not.toBeNull();
    expect(el.querySelector('pm-tag-table')).toBeNull();
  });

  it('erreur puis Réessayer ; vide : « Aucun tag »', async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
      .mockResolvedValue([]);
    const { fixture, el } = await render({ list });
    expect(el.querySelector('pm-state .error[role="alert"]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('pm-state button.retry')?.click();
    await settle(fixture);
    expect(el.querySelector('pm-state [role="status"]')?.textContent).toContain('Aucun tag');
  });

  it('chargé : libellé et date, sans colonne d’usages ; lien vers les émotions', async () => {
    const { el } = await render({ list: vi.fn().mockResolvedValue(TAGS) });
    expect(el.querySelectorAll('pm-tag-table tbody tr[data-tag]')).toHaveLength(3);
    const travail = row(el, 'travail');
    expect(travail.textContent).toContain('#travail');
    expect(travail.querySelectorAll('td')[1].textContent?.trim()).toBe('1 nov. 2026');
    expect(el.querySelector('pm-tag-table thead')?.textContent).not.toContain('Usages');
    expect(el.querySelector('#h-my-tags')?.textContent).toContain('Mes tags · 3');
    expect(el.querySelector('a[href="/mon-compte/emotions"]')).not.toBeNull();
  });

  it('créer « anxiété » : 422 TAG_IS_EMOTION → « utiliser l’émotion Anxiété ? »', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(TAG_IS_EMOTION)
      .mockResolvedValue({ ...SANTE, id: 't-new', label: 'famille' });
    const { fixture, el, toasts } = await render({ list: vi.fn().mockResolvedValue(TAGS), create });
    const input = el.querySelector<HTMLInputElement>('#field-tag-label')!;
    button(el, 'Créer le tag').click();
    await settle(fixture);
    expect(create).not.toHaveBeenCalled();
    expect(el.querySelector('#field-tag-label-error')?.textContent).toContain('Saisissez');

    type(input, 'anxiété');
    await settle(fixture);
    button(el, 'Créer le tag').click();
    await settle(fixture);
    expect(create).toHaveBeenCalledWith('anxiété');
    const error = el.querySelector('#field-tag-label-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain("utiliser l'émotion Anxiété ?");
    expect(input.getAttribute('aria-invalid')).toBe('true');

    type(input, 'famille');
    await settle(fixture);
    button(el, 'Créer le tag').click();
    await settle(fixture);
    expect(toasts.toasts()[0].message).toBe('Tag « famille » créé.');
    expect(input.value).toBe('');
  });

  it('renommer : refus affiché sous la ligne, Échap rend le focus', async () => {
    const rename = vi.fn().mockRejectedValue({ status: 409, code: 'TAG_EXISTS' });
    const { fixture, el } = await render({ list: vi.fn().mockResolvedValue(TAGS), rename });
    button(row(el, 'boulot'), 'Renommer').click();
    await settle(fixture);
    const input = el.querySelector<HTMLInputElement>(`#tag-rename-input-${BOULOT.id}`)!;
    type(input, 'Travail');
    button(row(el, 'boulot'), 'Enregistrer').click();
    await settle(fixture);
    expect(rename).toHaveBeenCalledWith(BOULOT.id, 'Travail');
    expect(el.querySelector(`#tag-row-error-${BOULOT.id}`)?.textContent).toContain('porte déjà');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle(fixture);
    expect(document.activeElement?.id).toBe(`tag-rename-btn-${BOULOT.id}`);
  });

  it('fusionner : aperçu « réétiquette N usages », confirmation, toast, liste relue', async () => {
    const merged = { ...TRAVAIL, usageCount: 6 };
    const list = vi.fn().mockResolvedValueOnce(TAGS).mockResolvedValue([SANTE, merged]);
    const merge = vi.fn().mockResolvedValue(merged);
    const { fixture, el, toasts } = await render({ list, merge });
    button(row(el, 'boulot'), 'Fusionner…').click();
    await settle(fixture);
    const select = el.querySelector<HTMLSelectElement>(`#tag-merge-target-${BOULOT.id}`)!;
    expect(document.activeElement).toBe(select);
    expect([...select.options].map((o) => o.textContent?.trim()).slice(1)).toEqual([
      'santé',
      'travail',
    ]);
    type(select, TRAVAIL.id);
    await settle(fixture);
    const preview = el.querySelector('.merge-preview')?.textContent ?? '';
    expect(preview).toContain('Fusionner « boulot » dans « travail » ?');
    expect(preview).toContain('Réétiquette 2 usages');
    expect(preview).toContain("ne s'annule pas");
    button(el.querySelector('.merge-confirm')!, 'Fusionner').click();
    await settle(fixture);
    expect(merge).toHaveBeenCalledWith(BOULOT.id, TRAVAIL.id);
    expect(el.querySelector('tr[data-tag="boulot"]')).toBeNull();
    expect(toasts.toasts()[0].message).toContain('« boulot » fusionné dans « travail »');
  });
});
