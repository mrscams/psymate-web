import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AdminApi } from '../data/admin.api';
import { entry } from '../data/admin.fixtures';
import { VocabularyPage } from './vocabulary.page';

// Le bundle /ar/ embarque ces données ; le test les enregistre pour les pluriels ICU du gabarit.
registerLocaleData(localeAr);

const FIXED = { modalities: [], languages: [] };
const ENTRIES = [
  entry({ usedByPublishedProfiles: 2 }),
  entry({ kind: 'audience', code: 'adults', labelFr: 'Adultes', labelEn: null }),
];

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }
}

async function render(locale: string, inputs: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    imports: [VocabularyPage],
    providers: [
      provideRouter([]),
      { provide: LOCALE_ID, useValue: locale },
      {
        provide: AdminApi,
        useValue: {
          vocabulary: vi.fn().mockResolvedValue(ENTRIES),
          fixedVocabulary: vi.fn().mockResolvedValue(FIXED),
        },
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(VocabularyPage);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await settle(fixture);
  return { el: fixture.nativeElement as HTMLElement, navigate };
}

function press(el: HTMLElement, key: string): void {
  el.querySelector('[role="tab"][aria-selected="true"]')?.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true }),
  );
}

const toKind = (kind: string | null) => ({
  queryParams: { kind },
  queryParamsHandling: 'merge',
  replaceUrl: true,
});

/** M16-13, sous-onglets du vocabulaire (fiche 28) : flèches inversées en arabe (Q81). */
describe('VocabularyPage, de droite à gauche (M16-13)', () => {
  it('français et anglais : flèche droite vers l’onglet suivant, flèche gauche vers le précédent', async () => {
    for (const locale of ['fr', 'en-US']) {
      const { el, navigate } = await render(locale, { kind: 'audience' });
      press(el, 'ArrowRight');
      expect(navigate).toHaveBeenLastCalledWith([], toKind('modality'));
      press(el, 'ArrowLeft');
      expect(navigate).toHaveBeenLastCalledWith([], toKind(null));
      TestBed.resetTestingModule();
    }
  });

  it('arabe : flèche gauche vers l’onglet suivant, flèche droite vers le précédent ; Début et Fin inchangés', async () => {
    const { el, navigate } = await render('ar', { kind: 'audience' });
    press(el, 'ArrowLeft');
    expect(navigate).toHaveBeenLastCalledWith([], toKind('modality'));
    press(el, 'ArrowRight');
    expect(navigate).toHaveBeenLastCalledWith([], toKind(null));
    press(el, 'End');
    expect(navigate).toHaveBeenLastCalledWith([], toKind('language'));
    press(el, 'Home');
    expect(navigate).toHaveBeenLastCalledWith([], toKind(null));
  });

  it('code en dir="ltr", libellés saisis isolés (<bdi>) ; texte des cellules inchangé', async () => {
    const { el } = await render('fr');
    const cells = [...el.querySelectorAll('tbody tr')[0].querySelectorAll('td')];
    expect(cells[0].querySelector('bdi')?.getAttribute('dir')).toBe('ltr');
    expect(cells[1].querySelector('bdi')?.getAttribute('dir')).toBeNull();
    expect(cells.slice(0, 4).map((td) => td.textContent)).toEqual([
      'anxiety',
      'Anxiété',
      'Anxiety',
      '1',
    ]);
  });
});
