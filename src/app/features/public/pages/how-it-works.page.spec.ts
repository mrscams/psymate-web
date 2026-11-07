import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PUBLIC_FACTS } from '../public-facts';
import { HowItWorksPage } from './how-it-works.page';

async function render() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(HowItWorksPage);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('HowItWorksPage', () => {
  afterEach(() =>
    TestBed.inject(DOCUMENT)
      .head.querySelectorAll('[data-pm-public-meta]')
      .forEach((n) => n.remove()),
  );

  it('un seul h1, deux parcours, quatre étapes en liste ordonnée, FAQ en details (deux ouvertes)', async () => {
    const { el } = await render();
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(el.querySelectorAll('.paths article')).toHaveLength(2);
    expect(el.querySelectorAll('.steps ol > li')).toHaveLength(4);
    const details = [...el.querySelectorAll('details')];
    expect(details).toHaveLength(4);
    expect(details.map((d) => d.open)).toEqual([true, true, false, false]);
    for (const section of el.querySelectorAll('section')) {
      const id = section.getAttribute('aria-labelledby');
      expect(id && el.querySelector(`#${id}`)).toBeTruthy();
    }
  });

  it('liens : annuaire, inscription', async () => {
    const { el } = await render();
    const hrefs = [...el.querySelectorAll('.paths a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/annuaire', '/inscription']);
  });

  it('chiffres lus dans PUBLIC_FACTS (délais, purges ; le contrat ne les expose pas)', async () => {
    const { el } = await render();
    const text = el.textContent ?? '';
    expect(text).toContain(`${PUBLIC_FACTS.verificationBusinessDays} jours ouvrés`);
    expect(text).toContain(`${PUBLIC_FACTS.emailConfirmationHours} h`);
    expect(text).toContain(`${PUBLIC_FACTS.documentsPurgeDays} jours après la décision`);
    expect(text).toContain(`${PUBLIC_FACTS.contactRetentionDays} jours`);
  });

  it('V1 : ni agenda Google, ni signalement, ni numéro d’urgence (G Q20, Q25, Q26)', async () => {
    const { el } = await render();
    expect(el.textContent).not.toMatch(/google|agenda|signal|3114|SAMU|\b15\b/i);
  });

  it('indexable : robots index,follow, description, URL canonique', async () => {
    await render();
    const head = TestBed.inject(DOCUMENT).head;
    expect(head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index,follow');
    expect(head.querySelector('meta[name="description"]')?.getAttribute('content')).toContain(
      'annuaire',
    );
    expect(head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${TestBed.inject(DOCUMENT).location.origin}/fr/comment-ca-marche`,
    );
  });
});
