import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { profileItem } from '../data/profile360.fixtures';
import { ProfileCategory, ProfileItem } from '../data/profile360.model';
import { ProfileRubricComponent } from './profile-rubric.component';

// M16-22 (G Q76, Q77 ; docs/design/arabe.md §4 et §5) : contenu saisi dans son sens, pastille de
// Famille par graphème, sans capitale pour une lettre arabe, dans les trois langues. Le sens et la
// position calculés par le navigateur sont vérifiés par e2e/arabe/profile360.spec.ts.

function render(
  category: ProfileCategory,
  items: ProfileItem[],
  locale = 'fr',
  editable = true,
): HTMLElement {
  TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: locale }] });
  const fixture = TestBed.createComponent(ProfileRubricComponent);
  fixture.componentRef.setInput('category', category);
  fixture.componentRef.setInput('items', items);
  fixture.componentRef.setInput('editable', editable);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const ARABIC_FAMILY = profileItem('family', 'مُنى، أخته', { detail: 'تعيش في الرباط' });
const LATIN_FAMILY = profileItem('family', 'Thomas, compagnon', {
  detail: 'Vie commune depuis 2020',
});

describe('ProfileRubricComponent, version arabe (M16-22)', () => {
  for (const locale of ['fr', 'en', 'ar']) {
    it(`Famille en ${locale} : pastille à la première lettre, arabe sans capitale, latine en capitale`, () => {
      const el = render(
        'family',
        [ARABIC_FAMILY, LATIN_FAMILY, profileItem('family', 'élodie')],
        locale,
      );
      const initials = Array.from(el.querySelectorAll('li .av')).map((n) => n.textContent?.trim());
      expect(initials).toEqual(['مُ', 'T', 'É']);
    });
  }

  it('titre et détail en dir="auto", en modification comme en lecture seule', () => {
    for (const editable of [true, false]) {
      const el = render('health', [ARABIC_FAMILY, LATIN_FAMILY], 'ar', editable);
      const rows = Array.from(el.querySelectorAll('li .item'));
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.querySelector('.t')?.getAttribute('dir')).toBe('auto');
        expect(row.querySelector('.d')?.getAttribute('dir')).toBe('auto');
      }
      TestBed.resetTestingModule();
    }
  });

  it('Histoire : la période isolée dans son sens, la colonne sans dir (alignée selon la page)', () => {
    const el = render('history', [
      profileItem('history', 'الطفولة في الرباط', { periodLabel: 'الطفولة', periodYear: 1990 }),
      profileItem('history', 'Souvenir sans date'),
    ]);
    const periods = Array.from(el.querySelectorAll('li .k'));
    expect(periods).toHaveLength(2);
    for (const period of periods) {
      expect(period.hasAttribute('dir')).toBe(false);
      expect(period.querySelector(':scope > span')?.getAttribute('dir')).toBe('auto');
    }
    expect(periods[0].textContent).toBe('الطفولة');
    expect(periods[1].textContent).toBe('');
  });

  it('le texte de chaque information (nom du bouton) est inchangé, caractère pour caractère', () => {
    const el = render('history', [
      profileItem('history', 'Enfance à Nantes', {
        detail: '« Sage, première de classe »',
        periodLabel: '1991 – 2002',
        periodYear: 1991,
      }),
    ]);
    const button = el.querySelector('li button.item')!;
    const parts = Array.from(button.querySelectorAll('.k, .t, .d')).map((n) => n.textContent);
    expect(parts).toEqual(['1991 – 2002', 'Enfance à Nantes', '« Sage, première de classe »']);
    // Aucune espace ajoutée ni retirée autour de la période isolée.
    const period = button.querySelector('.k')!;
    const outside = Array.from(period.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
    expect(outside).toEqual([]);
    expect(period.children).toHaveLength(1);
    expect(period.children[0].textContent).toBe('1991 – 2002');
  });
});
