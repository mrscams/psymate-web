import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ToastService } from '../../../shared/ui';
import { AdminApi } from '../data/admin.api';
import { accountPage, CLAIRE, dossierOf, queueItem, REMI } from '../data/admin.fixtures';
import { ValidationPage } from './validation.page';

// Le bundle /ar/ embarque ces données ; le test les enregistre pour les pluriels ICU du gabarit.
registerLocaleData(localeAr);

const never = () => new Promise<never>(() => undefined);
const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);
const MISSING = queueItem({
  practitionerId: '33333333-3333-4333-8333-333333333333',
  displayName: 'Inès Valette',
  missingHints: ['diploma', 'identity'],
});

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }
}

async function render(locale: string, api: Partial<AdminApi> = {}) {
  TestBed.configureTestingModule({
    imports: [ValidationPage],
    providers: [
      provideRouter([]),
      { provide: LOCALE_ID, useValue: locale },
      {
        provide: AdminApi,
        useValue: {
          accounts: vi.fn().mockResolvedValue(accountPage([])),
          queue: vi.fn().mockResolvedValue({ items: [CLAIRE, REMI, MISSING], nextCursor: null }),
          dossier: vi.fn().mockResolvedValue(dossierOf()),
          documentUrl: vi.fn(never),
          decide: vi.fn().mockResolvedValue(undefined),
          ...api,
        },
      },
    ],
  });
  vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ValidationPage);
  fixture.componentRef.setInput('practitionerId', CLAIRE.practitionerId);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

/** Texte rendu, blancs normalisés (ce que lit l'œil et un lecteur d'écran). */
const text = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * M16-13, file de validation et dossier (fiche 20) : valeurs saisies isolées, coordonnées en
 * dir="ltr", texte libre en dir="auto", liste des pièces manquantes par la locale en arabe ; en
 * français, les textes d'avant.
 */
describe('ValidationPage, de droite à gauche (M16-13)', () => {
  it('file : nom isolé, pièces manquantes séparées par des virgules en français', async () => {
    const { el } = await render('fr');
    const links = el.querySelectorAll('pm-queue-list a');
    expect(links[0].querySelector('.name bdi')?.textContent).toBe('Claire Moreau');
    expect(text(links[2].querySelector('.missing'))).toBe("Manque : Diplôme, Pièce d'identité");
    expect(text(links[1].querySelector('.missing'))).toBe("Manque : Pièce d'identité");
  });

  it('file : en arabe, la liste des pièces manquantes suit la locale (conjonction, sans virgule latine)', async () => {
    const { el } = await render('ar');
    const missing = text(el.querySelectorAll('pm-queue-list a')[2].querySelector('.missing'));
    expect(missing).toContain('و');
    expect(missing).not.toContain(', ');
  });

  it('en-tête du dossier : nom isolé ; e-mail, téléphone et numéro en dir="ltr" ; textes inchangés', async () => {
    const { el } = await render('fr');
    const header = el.querySelector('pm-dossier-header')!;
    expect(header.querySelector('h2 bdi')?.textContent).toBe('Claire Moreau');
    expect(header.querySelector('h2')?.textContent).toBe('Claire Moreau');
    const values = [...header.querySelectorAll('dd')];
    expect(values.map((dd) => dd.textContent)).toEqual([
      'claire.moreau@example.test',
      '+33600000099',
      '10101010101',
      '12 rue des Lilas, 69001 Lyon',
    ]);
    expect(values.slice(0, 3).map((dd) => dd.querySelector('bdi')?.getAttribute('dir'))).toEqual([
      'ltr',
      'ltr',
      'ltr',
    ]);
    expect(values[3].querySelector('bdi')?.getAttribute('dir')).toBeNull();
  });

  it('justificatifs : intitulé saisi isolé, texte inchangé', async () => {
    const { el } = await render('fr');
    const first = el.querySelector('pm-document-list li')!;
    expect(first.querySelector('.title bdi')?.textContent).toBe(
      'Master 2 Psychologie clinique · Université Lyon 2 · 2019',
    );
    expect(first.querySelector('.title')?.textContent).toBe(
      'Master 2 Psychologie clinique · Université Lyon 2 · 2019',
    );
  });

  it('décision : note interne et message au praticien en dir="auto"', async () => {
    const { el } = await render('fr');
    const areas = [...el.querySelectorAll<HTMLTextAreaElement>('pm-decision-form textarea')];
    expect(areas).toHaveLength(2);
    expect(areas.map((area) => area.getAttribute('dir'))).toEqual(['auto', 'auto']);
  });

  it('toast après une décision : inchangé en français, nom isolé en arabe', async () => {
    for (const [locale, expected] of [
      ['fr', 'Claire Moreau approuvé·e · e-mail envoyé'],
      ['ar', `${FSI}Claire Moreau${PDI} approuvé·e · e-mail envoyé`],
    ]) {
      const { fixture, el } = await render(locale, {
        dossier: vi.fn().mockResolvedValue(dossierOf({ documents: [] })),
      });
      const toast = vi.spyOn(TestBed.inject(ToastService), 'success');
      for (const box of el.querySelectorAll<HTMLInputElement>('.checklist input')) box.click();
      await settle(fixture);
      [...el.querySelectorAll<HTMLButtonElement>('pm-decision-form button')]
        .find((b) => b.textContent?.trim() === 'Approuver')
        ?.click();
      await settle(fixture);
      expect(toast).toHaveBeenCalledWith(expected);
      TestBed.resetTestingModule();
    }
  });
});
