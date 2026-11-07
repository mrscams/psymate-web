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
      expect(el.textContent).toContain('Psychologue');
      expect(el.textContent).toContain('Profil vérifié');
      expect(el.textContent).toContain('Accepte de nouveaux patients');
      expect(el.querySelectorAll('.tags li')).toHaveLength(4);
      expect(el.querySelector('.tags')?.textContent).toContain('Anxiété');
      expect(el.querySelector('.excerpt')?.textContent).toBe(
        'Je reçois des adultes. Premier échange gratuit',
      );
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

    it('fieldset par facette, compteurs de la réponse, facette à 0 désactivée, cochée reste active', async () => {
      const { el } = await renderFilters(
        { ...NO_FACETS, professions: [{ code: 'psychologist', count: 3 }] },
        { ...EMPTY_QUERY, audiences: ['children'] },
      );
      const legends = [...el.querySelectorAll('legend')].map((l) => l.textContent?.trim());
      expect(legends).toEqual(['Profession', 'Publics', 'Modalités', 'Langues', 'Disponibilité']);
      const option = (text: string) =>
        [...el.querySelectorAll('mat-checkbox')].find((box) => box.textContent?.includes(text));
      expect(option('Psychologue')?.textContent).toContain('3');
      expect(option('Psychologue')?.querySelector('input')?.disabled).toBe(false);
      expect(option('Psychiatre')?.querySelector('input')?.disabled).toBe(true);
      expect(option('Enfants')?.querySelector('input')?.checked).toBe(true);
      expect(option('Enfants')?.querySelector('input')?.disabled).toBe(false);
      expect(el.textContent).toContain('Tout effacer');
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
      const box = (text: string) =>
        [...el.querySelectorAll('mat-checkbox')]
          .find((b) => b.textContent?.includes(text))
          ?.querySelector('input') as HTMLInputElement;
      box('En visio').click();
      box('Accepte de nouveaux patients').click();
      [...el.querySelectorAll('button')]
        .find((b) => b.textContent?.includes('Tout effacer'))
        ?.click();
      expect(toggles).toEqual([{ filter: 'modalities', code: 'video', checked: true }]);
      expect(accepting).toEqual([false]);
      expect(cleared).toBe(1);
    });
  });
});
