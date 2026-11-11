import { DOCUMENT } from '@angular/common';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PUBLIC_FACTS } from '../public-facts';
import { AccessibilityPage } from './accessibility.page';
import { LegalNoticePage } from './legal-notice.page';
import { PrivacyPage } from './privacy.page';

async function render(page: Type<unknown>) {
  const fixture = TestBed.createComponent(page);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const PAGES: [string, Type<unknown>, string][] = [
  ['LegalNoticePage', LegalNoticePage, 'Mentions légales'],
  ['PrivacyPage', PrivacyPage, 'Confidentialité'],
  ['AccessibilityPage', AccessibilityPage, 'Accessibilité'],
];

describe('pages du pied public (UX-A6)', () => {
  afterEach(() =>
    TestBed.inject(DOCUMENT)
      .head.querySelectorAll('[data-pm-public-meta]')
      .forEach((n) => n.remove()),
  );

  it.each(PAGES)(
    '%s : un seul h1, sections titrées, contenu provisoire signalé',
    async (_, page, title) => {
      const el = await render(page);
      const h1 = el.querySelectorAll('h1');
      expect(h1).toHaveLength(1);
      expect(h1[0].textContent?.trim()).toBe(title);
      expect(el.querySelector('[role="note"]')?.textContent).toContain(
        'à compléter par le propriétaire',
      );
      const sections = el.querySelectorAll('section');
      expect(sections.length).toBeGreaterThanOrEqual(3);
      for (const section of sections) {
        const id = section.getAttribute('aria-labelledby');
        expect(id && el.querySelector(`h2#${id}`)).toBeTruthy();
      }
    },
  );

  it.each(PAGES)('%s : non indexée tant que le texte est provisoire', async (_, page) => {
    await render(page);
    const robots = TestBed.inject(DOCUMENT).head.querySelector('meta[name="robots"]');
    expect(robots?.getAttribute('content')).toBe('noindex,follow');
  });

  it('confidentialité : durées lues dans PUBLIC_FACTS', async () => {
    const text = (await render(PrivacyPage)).textContent ?? '';
    expect(text).toContain(`effacé après ${PUBLIC_FACTS.contactRetentionDays} jours`);
    expect(text).toContain(`${PUBLIC_FACTS.documentsPurgeDays} jours après la décision`);
  });

  it('accessibilité : objectif WCAG 2.1 AA, aucune conformité déclarée', async () => {
    const text = (await render(AccessibilityPage)).textContent ?? '';
    expect(text).toContain('WCAG 2.1');
    expect(text).toContain("Aucun audit de conformité n'a encore été réalisé");
  });
});
