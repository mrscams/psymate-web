import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { Component, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { ARABIC_FORMAT_LOCALE } from '../../core/i18n';
import { PatientShellStore } from '../patient-shell';
import { SearchApi } from './data/search.api';
import { counts, entryPreview, FEELING, hit, searchPage } from './data/search.fixtures';
import { parseMarked } from './data/search.model';
import { PatientSearchPage } from './pages/patient-search.page';
import { DossierSearchBar } from './search-bar';
import { hasRtlLetter, isolate } from './ui/bidi';
import { MarkedTextComponent } from './ui/marked-text.component';
import { formatDateTime, formatDay, sessionLabel } from './ui/search-labels';

// M16-21, recherche de droite à gauche (G Q71, Q73, Q76, Q77 ; docs/design/arabe.md) : dates par
// la locale de formatage (chiffres latins), valeurs saisies isolées dans leur phrase (<bdi> dans les
// gabarits, U+2068 … U+2069 dans les chaînes), contenu saisi en dir="auto", surlignage sans marge
// intérieure dans un mot arabe. /fr/ et /en/ : textes rendus identiques à avant pour un contenu latin.
// Le rendu (sens calculé, liaison des lettres, captures) est prouvé par e2e/arabe/search.spec.ts.

registerLocaleData(localeAr, 'ar');

const NON_LATIN_DIGITS = /[٠-٩۰-۹]/;
const FSI = '⁨';
const PDI = '⁩';
const PATIENT_ID = '8943f30b-07b2-4933-8a06-7bb3ac736ea7';
/** « قلق » (anxiété) : un mot arabe cherché et surligné. */
const ARABIC_QUERY = 'قلق';

@Component({ selector: 'pm-blank', template: '' })
class Blank {}

type Api = Pick<SearchApi, 'find' | 'preview' | 'sessions'>;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

async function render(
  locale: string,
  options: { q?: string; find?: Api['find']; displayName?: string } = {},
) {
  const api: Api = {
    find: options.find ?? vi.fn().mockResolvedValue(searchPage()),
    preview: vi.fn().mockResolvedValue(entryPreview()),
    sessions: vi.fn().mockResolvedValue([{ id: 's-17oct', startedAt: '2026-10-17T08:00:00Z' }]),
  };
  const shell = {
    patientId: signal(PATIENT_ID),
    patient: signal({ id: PATIENT_ID, displayName: options.displayName ?? 'Marie D.' }),
    recallTab: vi.fn().mockReturnValue(undefined),
    rememberTab: vi.fn(),
    revision: signal(0),
    noteWrite: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'patients/:id/search', component: PatientSearchPage },
        { path: 'patients/:id', component: Blank },
      ]),
      { provide: SearchApi, useValue: api },
      { provide: PatientShellStore, useValue: shell },
      { provide: LOCALE_ID, useValue: locale },
    ],
  });
  const q = encodeURIComponent(options.q ?? 'entretien');
  const harness = await RouterTestingHarness.create(`/patients/${PATIENT_ID}/search?q=${q}`);
  for (let i = 0; i < 2; i++) {
    await tick();
    await harness.fixture.whenStable();
  }
  return { harness, el: harness.fixture.nativeElement as HTMLElement, api };
}

describe('bidi : isolate et hasRtlLetter (Q77)', () => {
  it('fr et en : une valeur latine reste inchangée, caractère pour caractère', () => {
    for (const locale of ['fr', 'en', 'en-US']) {
      for (const value of ['entretien', 'Marie D.', '« manager »', '2026-10', '-mot', '']) {
        expect(isolate(value, locale)).toBe(value);
      }
    }
  });

  it('fr et en : une valeur arabe est isolée', () => {
    expect(isolate(ARABIC_QUERY, 'fr')).toBe(`${FSI}${ARABIC_QUERY}${PDI}`);
    expect(isolate(`note ${ARABIC_QUERY}`, 'en')).toBe(`${FSI}note ${ARABIC_QUERY}${PDI}`);
  });

  it('ar : toute valeur non vide est isolée', () => {
    expect(isolate('entretien', 'ar')).toBe(`${FSI}entretien${PDI}`);
    expect(isolate(ARABIC_QUERY, ARABIC_FORMAT_LOCALE)).toBe(`${FSI}${ARABIC_QUERY}${PDI}`);
    expect(isolate('', 'ar')).toBe('');
  });

  it('hasRtlLetter : lettres arabes et hébraïques, pas les latines ni les chiffres', () => {
    expect(hasRtlLetter('كتاب')).toBe(true);
    expect(hasRtlLetter('שלום')).toBe(true);
    expect(hasRtlLetter('entretien 2026 « » · …')).toBe(false);
  });
});

describe('search-labels : formats par la locale de formatage (Q73)', () => {
  it('fr et en : sorties inchangées', () => {
    expect(formatDay('2026-10-17T08:00:00Z', 'fr')).toBe('17 oct. 2026');
    expect(formatDay('2026-10-17T08:00:00Z', 'en')).toBe('Oct 17, 2026');
    expect(formatDay('pas une date', 'fr')).toBe('');
    expect(formatDateTime('pas une date', 'fr')).toBe('');
    expect(sessionLabel({ id: 's', startedAt: '2026-10-17T08:00:00Z' }, 'fr')).toBe(
      'Séance du 17 oct. 2026',
    );
    // Même résultat qu'Intl avec la locale brute (comportement d'avant).
    const iso = '2026-10-17T08:42:00Z';
    for (const locale of ['fr', 'en']) {
      expect(formatDateTime(iso, locale)).toBe(
        new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(iso),
        ),
      );
    }
  });

  for (const locale of ['ar', ARABIC_FORMAT_LOCALE]) {
    it(`${locale} : chiffres latins, calendrier grégorien, 24 h`, () => {
      // En arabe, le style medium est numérique (« 17‏/10‏/2026 », marques U+200F) et la date-heure
      // porte la virgule arabe « ، » : ni l'une ni l'autre n'est dans JetBrains Mono.
      const day = formatDay('2026-10-17T08:00:00Z', locale);
      const at = formatDateTime('2026-10-17T15:42:00', locale);
      for (const sample of [day, at]) {
        expect(sample, sample).not.toMatch(NON_LATIN_DIGITS);
        expect(sample, sample).toMatch(/2026/);
        expect(sample, sample).toMatch(/17/);
      }
      expect(at).toMatch(/15:42/);
      expect(at).toMatch(/[؀-ۿ]/);
      expect(sessionLabel({ id: 's', startedAt: '2026-10-17T08:00:00Z' }, locale)).not.toMatch(
        NON_LATIN_DIGITS,
      );
    });
  }
});

describe('synthèse rendue en /fr/ et /en/ : texte inchangé pour un terme latin', () => {
  const hits = (count: number) =>
    Array.from({ length: count }, (_, i) => hit({ entryId: `e-${i}` }));
  const expected: [number, number, string][] = [
    [0, 0, 'Aucun résultat pour « entretien »'],
    [1, 0, '1 résultat pour « entretien » · sans accents ni casse · 42 ms'],
    [2, 0, '2 résultats pour « entretien » · sans accents ni casse · 42 ms'],
    [5, 0, '5 résultats pour « entretien » · sans accents ni casse · 42 ms'],
    [0, 1, 'Aucun résultat exact pour « entretien » · 1 résultat approché (trigrammes) · 42 ms'],
    [0, 2, 'Aucun résultat exact pour « entretien » · 2 résultats approchés (trigrammes) · 42 ms'],
    [0, 5, 'Aucun résultat exact pour « entretien » · 5 résultats approchés (trigrammes) · 42 ms'],
  ];
  // Les tests chargent les messages sources (français) : en /en/, seule la locale change, et le
  // texte rendu doit rester celui d'avant, sans caractère d'isolement.
  for (const locale of ['fr', 'en']) {
    for (const [total, approximate, summary] of expected) {
      it(`${locale} : ${total} exact(s), ${approximate} approché(s)`, async () => {
        const page = searchPage({
          exact: hits(total),
          total,
          approximate: hits(approximate).map((item) => ({
            ...item,
            entryId: `a-${item.entryId}`,
            approximate: true,
          })),
        });
        const { el } = await render(locale, { find: vi.fn().mockResolvedValue(page) });
        const rendered = el.querySelector('.summary')?.textContent ?? '';
        expect(rendered.trim()).toBe(summary);
        expect(rendered).not.toMatch(/[⁦-⁩]/);
      });
    }
  }
});

describe('MarkedTextComponent : surlignage et liaison des lettres', () => {
  function marks(segments: string): HTMLElement[] {
    const fixture = TestBed.createComponent(MarkedTextComponent);
    fixture.componentRef.setInput('segments', parseMarked(segments));
    fixture.detectChanges();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('mark')];
  }

  it('latin : <mark> sans classe ajoutée (padding d’origine)', () => {
    const found = marks('Préparé pour l’<mark>entretien</mark>.');
    expect(found).toHaveLength(1);
    expect(found[0].classList.contains('joined')).toBe(false);
  });

  it('arabe : <mark> au milieu d’un mot marqué « joined » (pas de marge intérieure)', () => {
    const found = marks('ال<mark>قلق</mark>ة شديدة');
    expect(found).toHaveLength(1);
    expect(found[0].classList.contains('joined')).toBe(true);
    expect(found[0].textContent).toBe('قلق');
  });
});

describe('PatientSearchPage en /fr/ : textes rendus inchangés', () => {
  it('portée : nom du patient dans un <bdi>, même texte qu’avant', async () => {
    const { el } = await render('fr');
    const scope = el.querySelector('.scope');
    expect(text(scope)).toBe(
      'dans le dossier de Marie D. · champ de recherche en haut de page (/)',
    );
    expect(scope?.querySelector('bdi')?.textContent).toBe('Marie D.');
    expect(scope?.querySelector('kbd')?.getAttribute('dir')).toBe('ltr');
    expect(el.querySelector('.close kbd')?.getAttribute('dir')).toBe('ltr');
    expect(text(el.querySelector('.close'))).toBe('Fermer la recherche Échap');
  });

  it('synthèse et état vide : aucun caractère d’isolement pour un terme latin', async () => {
    const { el } = await render('fr');
    expect(text(el.querySelector('.summary'))).toBe(
      '2 résultats pour « entretien » · sans accents ni casse · 42 ms',
    );
    TestBed.resetTestingModule();
    const empty = await render('fr', {
      find: vi.fn().mockResolvedValue(searchPage({ exact: [], total: 0, counts: counts() })),
    });
    const state = text(empty.el.querySelector('pm-state'));
    expect(state).toContain('Aucun résultat pour « entretien »');
    expect(state).not.toContain(FSI);
  });

  it('fr : un terme arabe est isolé dans la synthèse ; la requête part sans isolement', async () => {
    const { el, api } = await render('fr', { q: ARABIC_QUERY });
    expect(text(el.querySelector('.summary'))).toBe(
      `2 résultats pour « ${FSI}${ARABIC_QUERY}${PDI} » · sans accents ni casse · 42 ms`,
    );
    const request = vi.mocked(api.find).mock.calls[0][1];
    expect(request.q).toBe(ARABIC_QUERY);
  });
});

describe('PatientSearchPage en /ar/', () => {
  it('synthèse, état vide et annonce de sélection : valeurs isolées ; requête intacte', async () => {
    const { el, api, harness } = await render('ar', { q: ARABIC_QUERY });
    expect(text(el.querySelector('.summary'))).toContain(`« ${FSI}${ARABIC_QUERY}${PDI} »`);
    expect(vi.mocked(api.find).mock.calls[0][1].q).toBe(ARABIC_QUERY);
    // Nombres en chiffres latins (pluriels ICU de la locale arabe compris).
    expect(text(el)).not.toMatch(NON_LATIN_DIGITS);

    const bar = document.createElement('input');
    bar.id = 'app-bar-search';
    document.body.appendChild(bar);
    try {
      bar.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      );
      await tick();
      await harness.fixture.whenStable();
      const announced = text(el.querySelector('.sr-only[aria-live="polite"]'));
      expect(announced).toMatch(new RegExp(`^Sélection : ${FSI}.+${PDI}, 2 sur 2$`));
    } finally {
      bar.remove();
    }
    expect(TestBed.inject(DossierSearchBar).query()).toBe(ARABIC_QUERY);

    TestBed.resetTestingModule();
    const empty = await render('ar', {
      q: ARABIC_QUERY,
      find: vi.fn().mockResolvedValue(searchPage({ exact: [], total: 0, counts: counts() })),
    });
    expect(text(empty.el.querySelector('pm-state'))).toContain(
      `Aucun résultat pour « ${FSI}${ARABIC_QUERY}${PDI} »`,
    );
  });

  it('contenu saisi en dir="auto", dates en chasse fixe des textes (--font-mono-text)', async () => {
    const arabicHit = hit({
      title: parseMarked(`نوبة <mark>${ARABIC_QUERY}</mark>`),
      snippet: parseMarked(`ال<mark>${ARABIC_QUERY}</mark> قبل الاجتماع`),
      tags: ['عمل'],
    });
    const { el } = await render('ar', {
      q: ARABIC_QUERY,
      displayName: 'سلمى ب.',
      find: vi.fn().mockResolvedValue(searchPage({ exact: [arabicHit, FEELING], total: 2 })),
    });
    expect(el.querySelector('.scope bdi')?.textContent).toBe('سلمى ب.');
    const item = el.querySelector('li[data-entry-id="e-entretien"]');
    expect(item?.querySelector('button.title')?.getAttribute('dir')).toBe('auto');
    expect(item?.querySelector('.snippet')?.getAttribute('dir')).toBe('auto');
    expect(item?.querySelector('.context span[dir="auto"]')?.textContent).toBe('#عمل');
    const marks = item?.querySelectorAll('mark') ?? [];
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect(mark.classList.contains('joined')).toBe(true);
    }
    const when = item?.querySelector('.meta .mono');
    expect(when?.classList.contains('date')).toBe(true);
    expect(text(when)).toMatch(/2026/);
    expect(text(when)).not.toMatch(NON_LATIN_DIGITS);

    const aside = el.querySelector('aside');
    expect(aside?.querySelector('h3')?.getAttribute('dir')).toBe('auto');
    expect(aside?.querySelector('.body')?.getAttribute('dir')).toBe('auto');
    expect(aside?.querySelector('.links li')?.getAttribute('dir')).toBe('auto');
    const dates = [...(aside?.querySelectorAll('.mono.date') ?? [])];
    expect(dates).toHaveLength(2);
    for (const date of dates) {
      expect(text(date)).toMatch(/2026/);
      expect(text(date)).not.toMatch(NON_LATIN_DIGITS);
    }
    expect(text(aside?.querySelector('dl'))).not.toMatch(NON_LATIN_DIGITS);
    for (const code of aside?.querySelectorAll('pm-search-syntax-help code') ?? []) {
      expect(code.getAttribute('dir')).toBe('auto');
    }
  });
});
