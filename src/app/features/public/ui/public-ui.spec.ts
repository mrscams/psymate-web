import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CLAIRE_CARD, NO_FACETS, VOCABULARY } from '../data/directory.fixtures';
import { EMPTY_QUERY } from '../data/directory.models';
import { parseBio, plainText } from './bio';
import { DirectoryFiltersComponent } from './directory-filters.component';
import { professionLabel, vocabularyLabel } from './labels';
import { PaginationComponent, pageSlots } from './pagination.component';
import { PractitionerCardComponent } from './practitioner-card.component';

describe('features/public ui', () => {
  describe('libellés', () => {
    it('professions : Psychologue, Psychiatre, Coach (jamais « personal coach »)', () => {
      expect(professionLabel('psychologist')).toBe('Psychologue');
      expect(professionLabel('psychiatrist')).toBe('Psychiatre');
      expect(professionLabel('coach')).toBe('Coach');
    });

    it('vocabulaire : FR, EN avec repli sur FR, secours sans vocabulaire', () => {
      expect(vocabularyLabel(VOCABULARY, 'specialties', 'anxiety', 'fr')).toBe('Anxiété');
      expect(vocabularyLabel(VOCABULARY, 'specialties', 'anxiety', 'en')).toBe('Anxiety');
      expect(vocabularyLabel(VOCABULARY, 'specialties', 'grief', 'en')).toBe('Deuil');
      expect(vocabularyLabel(null, 'modalities', 'video', 'fr')).toBe('En visio');
      expect(vocabularyLabel(null, 'languages', 'de', 'fr')).toBe('Allemand');
      expect(vocabularyLabel(null, 'audiences', 'adults', 'fr')).toBe('adults');
    });
  });

  describe('présentation (Markdown restreint)', () => {
    it('paragraphes, listes, gras ; jamais de HTML interprété', () => {
      const blocks = parseBio('Bonjour **vous**.\nSuite.\n\n- un\n- deux\n\n<script>x</script>');
      expect(blocks).toEqual([
        {
          kind: 'paragraph',
          spans: [
            { text: 'Bonjour ', strong: false },
            { text: 'vous', strong: true },
            { text: '. Suite.', strong: false },
          ],
        },
        {
          kind: 'list',
          items: [[{ text: 'un', strong: false }], [{ text: 'deux', strong: false }]],
        },
        { kind: 'paragraph', spans: [{ text: '<script>x</script>', strong: false }] },
      ]);
      expect(parseBio(null)).toEqual([]);
      expect(plainText('Je **reçois**.\n- Premier échange')).toBe('Je reçois. Premier échange');
    });
  });

  describe('pagination', () => {
    it('première, dernière, courante et voisines, ellipses', () => {
      expect(pageSlots(1, 1)).toEqual([1]);
      expect(pageSlots(1, 3)).toEqual([1, 2, 3]);
      expect(pageSlots(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12]);
    });

    it('nav « Pagination », page courante aria-current, rien sous deux pages', async () => {
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const fixture = TestBed.createComponent(PaginationComponent);
      fixture.componentRef.setInput('page', 2);
      fixture.componentRef.setInput('totalPages', 3);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Pagination');
      expect(el.querySelector('[aria-current="page"]')?.textContent).toContain('2');
      expect(el.querySelector('a[rel="prev"]')?.getAttribute('href')).toBe('/');
      expect(el.querySelector('a[rel="next"]')?.getAttribute('href')).toBe('/?page=3');
      fixture.componentRef.setInput('totalPages', 1);
      await fixture.whenStable();
      expect(el.querySelector('nav')).toBeNull();
    });
  });

  describe('fiche résumée', () => {
    it('nom, profession, badge vérifié, disponibilité, 4 spécialités, liens fiche et #contact', async () => {
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const fixture = TestBed.createComponent(PractitionerCardComponent);
      fixture.componentRef.setInput('card', CLAIRE_CARD);
      fixture.componentRef.setInput('vocabulary', VOCABULARY);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('h3 a')?.getAttribute('href')).toBe('/praticiens/claire-moreau');
      // Lien du nom à 24 px de haut (UX-G2a, sonde de l'audit : 21 px).
      expect(el.querySelector('h3 a')?.classList).toContain('pm-link-target');
      expect(el.textContent).toContain('Psychologue');
      expect(el.textContent).toContain('Profil vérifié');
      // Une seule puce de disponibilité (UX-D6).
      expect(el.querySelectorAll('.availability')).toHaveLength(1);
      expect(el.querySelector('.availability')?.textContent).toContain(
        'Accepte de nouveaux patients',
      );
      expect(el.querySelectorAll('.tags li')).toHaveLength(4);
      expect(el.querySelector('.tags')?.textContent).toContain('Anxiété');
      // Titre et extrait sur une ligne, puis une ligne de méta (ville, modalités, publics, langues).
      expect(el.querySelector('.excerpt')?.textContent?.trim()).toBe(
        'Psychologue clinicienne · Je reçois des adultes. Premier échange gratuit',
      );
      const meta = [...el.querySelectorAll('.meta dd')].map((dd) => dd.textContent?.trim());
      expect(meta).toEqual(['Paris', 'Au cabinet, En visio', 'Adultes', 'Français, Anglais']);
      const terms = [...el.querySelectorAll('.meta dt')].map((dt) => dt.textContent?.trim());
      expect(terms).toEqual(['Ville', 'Modalités', 'Publics', 'Langues']);
      const contact = [...el.querySelectorAll('a')].find((a) =>
        a.textContent?.includes('Contacter'),
      );
      expect(contact?.getAttribute('href')).toBe('/praticiens/claire-moreau#contact');
      // Sans tarif ni coordonnées en liste (fiche 08, « Écarts »).
      expect(el.textContent).not.toMatch(/€|tarif/i);
    });

    it('non vérifié, disponibilité inconnue : ni badge ni disponibilité', async () => {
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const fixture = TestBed.createComponent(PractitionerCardComponent);
      fixture.componentRef.setInput('card', {
        ...CLAIRE_CARD,
        profession: 'coach',
        verified: false,
        availability: 'unknown',
      });
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('pm-verified-badge')).toBeNull();
      expect(el.querySelector('.availability')).toBeNull();
      expect(el.textContent).toContain('Coach');
    });

    it('un extrait qui commence par le titre ne le répète pas', async () => {
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const fixture = TestBed.createComponent(PractitionerCardComponent);
      fixture.componentRef.setInput('card', {
        ...CLAIRE_CARD,
        bioExcerpt: 'Psychologue clinicienne, je reçois des adultes.',
      });
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.excerpt')?.textContent?.trim()).toBe(
        'Psychologue clinicienne, je reçois des adultes.',
      );
    });
  });

  describe('filtres', () => {
    async function renderFilters(facets = NO_FACETS, query = EMPTY_QUERY) {
      const fixture = TestBed.createComponent(DirectoryFiltersComponent);
      fixture.componentRef.setInput('query', query);
      fixture.componentRef.setInput('facets', facets);
      fixture.componentRef.setInput('vocabulary', VOCABULARY);
      await fixture.whenStable();
      return { fixture, el: fixture.nativeElement as HTMLElement };
    }

    const option = (el: HTMLElement, text: string) =>
      [...el.querySelectorAll('label.option')].find((label) =>
        label.querySelector('.option-label')?.textContent?.trim().startsWith(text),
      );
    const box = (el: HTMLElement, text: string) =>
      option(el, text)?.querySelector('input') as HTMLInputElement;
    const button = (el: HTMLElement, text: string | RegExp) =>
      [...el.querySelectorAll('button')].find((b) =>
        typeof text === 'string' ? b.textContent?.includes(text) : text.test(b.textContent ?? ''),
      ) as HTMLButtonElement;

    it('en-tête « Filtres » + « Tout effacer », compteurs de la réponse, 0 désactivé, cochée active', async () => {
      const { el } = await renderFilters(
        { ...NO_FACETS, professions: [{ code: 'psychologist', count: 3 }] },
        { ...EMPTY_QUERY, audiences: ['children'] },
      );
      expect(el.querySelector('h2')?.textContent?.trim()).toBe('Filtres');
      const legends = [...el.querySelectorAll('legend')].map((l) => l.textContent?.trim());
      // Aucune spécialité dans la réponse : pas de facette Spécialités.
      expect(legends).toEqual(['Profession', 'Publics', 'Modalités', 'Langues', 'Disponibilité']);
      expect(option(el, 'Psychologue')?.querySelector('.count')?.textContent).toBe('3');
      expect(box(el, 'Psychologue').disabled).toBe(false);
      expect(box(el, 'Psychiatre').disabled).toBe(true);
      expect(box(el, 'Enfants').checked).toBe(true);
      expect(box(el, 'Enfants').disabled).toBe(false);
      expect(button(el, 'Tout effacer').disabled).toBe(false);
    });

    it('sans filtre actif, « Tout effacer » est désactivé ; sans réponse, aucun compteur', async () => {
      const { el } = await renderFilters(null as never);
      expect(button(el, 'Tout effacer').disabled).toBe(true);
      expect(el.querySelector('.count')).toBeNull();
    });

    it('publics et langues : valeurs présentes visibles, les autres sous « Autres langues (n) »', async () => {
      const { fixture, el } = await renderFilters({
        ...NO_FACETS,
        audiences: [{ code: 'adults', count: 4 }],
        languages: [{ code: 'fr', count: 4 }],
      });
      expect(option(el, 'Français')).toBeDefined();
      expect(option(el, 'Anglais')).toBeUndefined();
      expect(option(el, 'Enfants')).toBeUndefined();
      const languages = button(el, /Autres langues \(1\)/);
      expect(languages.getAttribute('aria-expanded')).toBe('false');
      expect(button(el, /Autres publics \(1\)/)).toBeDefined();
      languages.click();
      await fixture.whenStable();
      expect(languages.getAttribute('aria-expanded')).toBe('true');
      const panel = el.querySelector(`#${languages.getAttribute('aria-controls')}`);
      expect(panel?.textContent).toContain('Anglais');
      expect(box(el, 'Anglais').disabled).toBe(true);
    });

    it('UX-G2a : chaque bouton « Autres … » dans sa rangée, après la dernière case', async () => {
      const { el } = await renderFilters(
        { ...NO_FACETS, audiences: [{ code: 'adults', count: 4 }] },
        { ...EMPTY_QUERY, languages: ['fr'] },
      );
      for (const name of [/Autres publics/, /Autres langues/]) {
        const toggle = button(el, name);
        const row = toggle.parentElement!;
        // L'écart avec la case précédente est porté par la rangée (marge du bouton forcée par
        // .pm-link-target) ; la rangée suit la dernière valeur de la facette.
        expect(row.classList).toContain('more-row');
        expect(row.previousElementSibling?.matches('label.option')).toBe(true);
      }
    });

    it('spécialités : facette de la réponse, 6 visibles puis « Afficher les n autres »', async () => {
      const codes = ['anxiety', 'burnout', 'grief', 'adhd', 'ocd', 'eating', 'sleep', 'trauma'];
      const { fixture, el } = await renderFilters(
        {
          ...NO_FACETS,
          specialties: codes.map((code, i) => ({ code, count: 10 - i })),
        },
        { ...EMPTY_QUERY, specialties: ['trauma'] },
      );
      const fieldset = [...el.querySelectorAll('fieldset')].find(
        (f) => f.querySelector('legend')?.textContent?.trim() === 'Spécialités',
      )!;
      const visible = () =>
        [...fieldset.querySelectorAll('.option-label')].map((l) => l.textContent?.trim());
      // Six premières + la cochée, toujours visible.
      expect(visible()).toEqual([
        'Anxiété',
        'Burn-out',
        'Deuil',
        'adhd',
        'ocd',
        'eating',
        'trauma',
      ]);
      const more = button(el, 'Afficher 1 autre');
      more.click();
      await fixture.whenStable();
      expect(visible()).toContain('sleep');
      expect(more.textContent).toContain('Afficher moins');
    });

    it('coche → filterToggle ; accepte → acceptingChange ; Tout effacer → clearAll', async () => {
      const { fixture, el } = await renderFilters(
        { ...NO_FACETS, modalities: [{ code: 'video', count: 2 }] },
        { ...EMPTY_QUERY, accepting: true },
      );
      const toggles: unknown[] = [];
      const accepting: boolean[] = [];
      let cleared = 0;
      fixture.componentInstance.filterToggle.subscribe((t) => toggles.push(t));
      fixture.componentInstance.acceptingChange.subscribe((v) => accepting.push(v));
      fixture.componentInstance.clearAll.subscribe(() => cleared++);
      box(el, 'En visio').click();
      box(el, 'Accepte de nouveaux patients').click();
      button(el, 'Tout effacer').click();
      expect(toggles).toEqual([{ filter: 'modalities', code: 'video', checked: true }]);
      expect(accepting).toEqual([false]);
      expect(cleared).toBe(1);
    });
  });
});
