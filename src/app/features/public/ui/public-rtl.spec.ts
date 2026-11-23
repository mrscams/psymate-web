import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ARABIC_FORMAT_LOCALE } from '../../../core/i18n';
import { BookingSlot } from '../data/booking.models';
import { CLAIRE_CARD, VOCABULARY } from '../data/directory.fixtures';
import { DirectoryVocabulary } from '../data/directory.models';
import { HowItWorksPage } from '../pages/how-it-works.page';
import { PrivacyPage } from '../pages/privacy.page';
import { PUBLIC_FACTS } from '../public-facts';
import { dayLabel, groupByDay, modalitiesSentence, slotRecap, timeLabel } from './booking-format';
import { ContactFormComponent } from './contact-form.component';
import { vocabularyLabel } from './labels';
import { PractitionerCardComponent } from './practitioner-card.component';

// M16-11, features/public de droite à gauche (G Q71, Q73, Q77, Q78 ; docs/design/arabe.md §4, §5,
// §7, §8) : formats par la locale de formatage, libellés de catalogue, contenu saisi isolé, et
// rendu français inchangé des messages passés au pluriel ICU. Le rendu réel en /ar/ est mesuré par
// e2e/arabe/public.spec.ts.

/** Chiffres arabo-indiens (U+0660 à U+0669) et persans (U+06F0 à U+06F9) : jamais (Q71). */
const NON_LATIN_DIGITS = /[٠-٩۰-۹]/;
const ARABIC_LETTERS = /[؀-ۿ]/;
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('formats de la prise de rendez-vous (Q73)', () => {
  const slot: BookingSlot = { startsAt: '2026-12-01T13:00:00Z', endsAt: '2026-12-01T14:00:00Z' };

  it('ar : heures en chiffres latins sur 24 h, comme la locale de formatage', () => {
    expect(timeLabel(slot.startsAt, 'Europe/Paris', 'ar')).toBe('14:00');
    expect(timeLabel(slot.startsAt, 'Europe/Paris', ARABIC_FORMAT_LOCALE)).toBe('14:00');
    expect(slotRecap(slot, 'Europe/Paris', 'ar').hours).toBe('14:00 – 15:00');
  });

  it('ar : jour en lettres arabes, chiffres latins, calendrier grégorien', () => {
    const day = dayLabel('2026-12-01', 'ar', true);
    expect(day).toMatch(ARABIC_LETTERS);
    expect(day).not.toMatch(NON_LATIN_DIGITS);
    expect(day).toContain('2026');
    expect(day).toBe(dayLabel('2026-12-01', ARABIC_FORMAT_LOCALE, true));
    const [first] = groupByDay([slot], 'Europe/Paris', 'ar');
    expect(first.label).not.toMatch(NON_LATIN_DIGITS);
    expect(first.slots[0].start).toBe('14:00');
  });

  it('fr et en : rendu inchangé', () => {
    expect(dayLabel('2026-12-01', 'fr')).toBe('mardi 1er décembre');
    expect(slotRecap(slot, 'Europe/Paris', 'fr')).toEqual({
      day: 'mardi 1er décembre 2026',
      hours: '14:00 – 15:00',
    });
    expect(timeLabel(slot.startsAt, 'Europe/Paris', 'en')).toBe('14:00');
    expect(modalitiesSentence(['in_person', 'video'], 'fr')).toBe('Au cabinet ou en visio');
  });

  it('ar : la phrase des modalités passe par Intl.ListFormat de la locale de formatage', () => {
    const sentence = modalitiesSentence(['in_person', 'video'], 'ar');
    const expected = new Intl.ListFormat(ARABIC_FORMAT_LOCALE, { type: 'disjunction' }).format([
      'Au cabinet',
      'en visio',
    ]);
    expect(sentence).toBe(expected);
  });
});

describe('libellés (Q78, langues de consultation)', () => {
  // labelAr arrive avec le contrat 0.16.0 (M16-25) : le modèle ne le porte pas encore.
  const anxiety = { code: 'anxiety', labelFr: 'Anxiété', labelEn: 'Anxiety', labelAr: 'القلق' };
  const withArabic: DirectoryVocabulary = { ...VOCABULARY, specialties: [anxiety] };

  it('catalogue : arabe s’il existe, sinon français ; anglais inchangé', () => {
    expect(vocabularyLabel(withArabic, 'specialties', 'anxiety', 'ar')).toBe('القلق');
    expect(vocabularyLabel(VOCABULARY, 'specialties', 'anxiety', 'ar')).toBe('Anxiété');
    expect(vocabularyLabel(withArabic, 'specialties', 'anxiety', 'en')).toBe('Anxiety');
    expect(vocabularyLabel(withArabic, 'specialties', 'anxiety', 'fr')).toBe('Anxiété');
  });

  it('langue sans vocabulaire : Intl.DisplayNames en arabe, sans mise en capitale', () => {
    const name = vocabularyLabel(null, 'languages', 'de', 'ar');
    expect(name).toBe(new Intl.DisplayNames([ARABIC_FORMAT_LOCALE], { type: 'language' }).of('de'));
    expect(name).toMatch(ARABIC_LETTERS);
    expect(vocabularyLabel(null, 'languages', 'de', 'fr')).toBe('Allemand');
    expect(vocabularyLabel(null, 'languages', 'de', 'en')).toBe('German');
  });
});

describe('contenu saisi (Q77)', () => {
  it('fiche résumée : nom et extrait en dir="auto", ville isolée', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PractitionerCardComponent);
    fixture.componentRef.setInput('card', { ...CLAIRE_CARD, displayName: 'سلمى بن علي' });
    fixture.componentRef.setInput('vocabulary', VOCABULARY);
    fixture.componentRef.setInput('locale', 'ar');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.name-link')?.getAttribute('dir')).toBe('auto');
    expect(text(el.querySelector('.name-link'))).toBe('سلمى بن علي');
    expect(el.querySelector('.excerpt')?.getAttribute('dir')).toBe('auto');
    expect(text(el.querySelector('.meta bdi'))).toBe(CLAIRE_CARD.city);
  });

  it('formulaire de contact : nom et message en dir="auto", e-mail en dir="ltr", nom isolé', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ContactFormComponent);
    fixture.componentRef.setInput('practitionerName', 'Claire Moreau');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#field-name')?.getAttribute('dir')).toBe('auto');
    expect(el.querySelector('#field-message')?.getAttribute('dir')).toBe('auto');
    expect(el.querySelector('#field-email')?.getAttribute('dir')).toBe('ltr');
    expect(text(el.querySelector('mat-checkbox bdi'))).toBe('Claire Moreau');
    fixture.componentRef.setInput('status', 'sent');
    await fixture.whenStable();
    expect(text(el.querySelector('.sent-title'))).toBe(
      'Votre message a été transmis à Claire Moreau.',
    );
    expect(text(el.querySelector('.sent-title bdi'))).toBe('Claire Moreau');
  });

  it('formulaire de contact, 429 : message au pluriel ICU, rendu français inchangé', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ContactFormComponent);
    fixture.componentRef.setInput('practitionerName', 'Claire Moreau');
    fixture.componentRef.setInput('status', 'rate-limited');
    fixture.componentRef.setInput('retryAt', Date.now() + 3 * 60_000 - 1_000);
    await fixture.whenStable();
    expect(text((fixture.nativeElement as HTMLElement).querySelector('.notice'))).toBe(
      'Trop de messages envoyés depuis votre connexion. Réessayez dans 3 min.',
    );
  });
});

describe('nombres au pluriel ICU : rendu français inchangé', () => {
  afterEach(() =>
    TestBed.inject(DOCUMENT)
      .head.querySelectorAll('[data-pm-public-meta]')
      .forEach((n) => n.remove()),
  );

  it('comment ça marche : jours ouvrés, heures, jours', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(HowItWorksPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const f = PUBLIC_FACTS;
    expect(text(el.querySelector('.sub'))).toBe(
      `La vérification prend au plus ${f.verificationBusinessDays} jours ouvrés. Elle ne bloque pas l'usage de l'outil de suivi.`,
    );
    const steps = [...el.querySelectorAll('.steps ol > li p')].map(text);
    expect(steps[1]).toBe(
      `Un lien valable ${f.emailConfirmationHours} h. Dès ce clic, l'outil de suivi est ouvert : vous pouvez créer vos premiers dossiers.`,
    );
    expect(steps[3]).toContain(
      `examine le dossier sous ${f.verificationBusinessDays} jours ouvrés. Approuvé`,
    );
    const never = text(el.querySelector('.never ul'));
    expect(never).toContain(`il est effacé après ${f.contactRetentionDays} jours.`);
    expect(never).toContain(`supprimés ${f.documentsPurgeDays} jours après la décision.`);
  });

  it('confidentialité : jours', async () => {
    const fixture = TestBed.createComponent(PrivacyPage);
    await fixture.whenStable();
    const all = text(fixture.nativeElement as HTMLElement);
    expect(all).toContain(`il est effacé après ${PUBLIC_FACTS.contactRetentionDays} jours.`);
    expect(all).toContain(`supprimés ${PUBLIC_FACTS.documentsPurgeDays} jours après la décision.`);
  });
});
