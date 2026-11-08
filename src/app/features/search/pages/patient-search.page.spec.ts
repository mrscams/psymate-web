import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { PatientShellStore } from '../../patient-shell';
import { SearchApi } from '../data/search.api';
import { counts, entryPreview, FEELING, hit, searchPage } from '../data/search.fixtures';
import { SearchPage } from '../data/search.model';
import { DossierSearchBar } from '../search-bar';
import { PatientSearchPage } from './patient-search.page';

@Component({ selector: 'pm-blank', template: '' })
class Blank {}

type Api = Pick<SearchApi, 'find' | 'preview' | 'sessions'>;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const never = <T>() => new Promise<T>(() => undefined);

async function render(
  api: Partial<Api> = {},
  url = '/patients/8943f30b-07b2-4933-8a06-7bb3ac736ea7/search?q=entretien',
) {
  const mock: Api = {
    find: api.find ?? vi.fn().mockResolvedValue(searchPage()),
    preview: api.preview ?? vi.fn().mockResolvedValue(entryPreview()),
    sessions:
      api.sessions ??
      vi.fn().mockResolvedValue([{ id: 's-17oct', startedAt: '2026-10-17T08:00:00Z' }]),
  };
  const shell = {
    patientId: signal('8943f30b-07b2-4933-8a06-7bb3ac736ea7'),
    patient: signal({ id: '8943f30b-07b2-4933-8a06-7bb3ac736ea7', displayName: 'Marie D.' }),
    recallTab: vi.fn().mockReturnValue(undefined),
    rememberTab: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'patients/:id/search', component: PatientSearchPage },
        { path: 'patients/:id/timeline', component: Blank },
        { path: 'patients/:id/graph', component: Blank },
        { path: 'patients/:id', component: Blank },
      ]),
      { provide: SearchApi, useValue: mock },
      { provide: PatientShellStore, useValue: shell },
    ],
  });
  const harness = await RouterTestingHarness.create(url);
  await settle(harness);
  return { harness, el: harness.fixture.nativeElement as HTMLElement, api: mock, shell };
}

async function settle(harness: RouterTestingHarness): Promise<void> {
  await tick();
  await harness.fixture.whenStable();
  await tick();
  await harness.fixture.whenStable();
}

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function key(target: EventTarget, name: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('PatientSearchPage', () => {
  it('chargement : squelette, aria-busy', async () => {
    const { el } = await render({ find: vi.fn(() => never<SearchPage>()) });
    expect(el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('pm-search-results')).toBeNull();
  });

  it('vide : « Aucun résultat pour « … » » et l’aide de la syntaxe', async () => {
    const { el } = await render({
      find: vi.fn().mockResolvedValue(searchPage({ exact: [], total: 0, counts: counts() })),
    });
    expect(text(el.querySelector('pm-state'))).toContain('Aucun résultat pour « entretien »');
    expect(el.querySelector('pm-search-syntax-help')).not.toBeNull();
  });

  it('erreur : « Recherche indisponible », Réessayer relance', async () => {
    const find = vi
      .fn()
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce(searchPage());
    const { el, harness } = await render({ find });
    const alert = el.querySelector('[role="alert"]');
    expect(text(alert)).toContain('Recherche indisponible');
    const retry = [...el.querySelectorAll('pm-state button')].find((b) =>
      text(b).includes('Réessayer'),
    ) as HTMLButtonElement;
    retry.click();
    await settle(harness);
    expect(find).toHaveBeenCalledTimes(2);
    expect(el.querySelector('pm-search-results')).not.toBeNull();
  });

  it('400 de syntaxe (avant: invalide) : message précis, pas de Réessayer', async () => {
    const { el } = await render({
      find: vi.fn().mockRejectedValue({
        status: 400,
        code: 'SEARCH_BAD_REQUEST',
        errors: [{ field: 'q', code: 'INVALID_DATE', message: '' }],
      }),
    });
    expect(text(el.querySelector('pm-state'))).toContain('Date invalide dans avant: ou après:');
    expect(el.querySelector('pm-state button')).toBeNull();
  });

  it('sans saisie suffisante : consigne, aucune requête', async () => {
    const { el, api } = await render(
      {},
      '/patients/8943f30b-07b2-4933-8a06-7bb3ac736ea7/search?q=e',
    );
    expect(api.find).not.toHaveBeenCalled();
    expect(text(el.querySelector('.idle'))).toContain('Tapez au moins 2 caractères');
  });

  it('résultats : synthèse, liste <ol>, <mark> sans injection, sélection aria-current, aperçu', async () => {
    const injected = hit({
      entryId: 'e-injection',
      title: [{ text: '<img src=x onerror=alert(1)>', mark: false }],
      snippet: null,
    });
    const { el } = await render({
      find: vi.fn().mockResolvedValue(searchPage({ exact: [hit(), FEELING, injected], total: 3 })),
    });
    expect(text(el.querySelector('.summary'))).toBe(
      '3 résultats pour « entretien » · sans accents, par trigrammes · 42 ms',
    );
    const list = el.querySelector('ol[aria-label="Résultats"]');
    expect(list?.querySelectorAll('li')).toHaveLength(3);
    expect([...el.querySelectorAll('li mark')].map((m) => m.textContent)).toContain('manager');
    expect(el.querySelector('li img')).toBeNull();
    expect(text(el.querySelector('li[data-entry-id="e-injection"] .title'))).toBe(
      '<img src=x onerror=alert(1)>',
    );
    expect(el.querySelector('li[aria-current="true"]')?.getAttribute('data-entry-id')).toBe(
      'e-entretien',
    );
    const aside = el.querySelector('aside');
    expect(aside?.getAttribute('aria-label')).toBe("Aperçu de l'entrée sélectionnée");
    expect(text(aside?.querySelector('h3'))).toBe("Entretien d'évaluation avec le manager");
    expect(text(aside?.querySelector('dl'))).toContain('Séance du 17 oct. 2026');
  });

  it('approchés : section à part sous les exacts', async () => {
    const { el } = await render({
      find: vi.fn().mockResolvedValue(
        searchPage({
          exact: [],
          total: 0,
          approximate: [hit({ approximate: true })],
        }),
      ),
    });
    expect(text(el.querySelector('.summary'))).toContain('Aucun résultat exact');
    expect(el.querySelector('ol[aria-label="Résultats approchés"] li')).not.toBeNull();
    expect(text(el.querySelector('.approximate h3'))).toBe('Résultats approchés');
  });

  it('puce Ressentis : ?types=feeling dans l’URL, puce pressée, compteurs inchangés', async () => {
    const all = counts({ event: 1, feeling: 3 });
    const find = vi
      .fn()
      .mockResolvedValueOnce(searchPage({ counts: all }))
      .mockResolvedValueOnce(searchPage({ exact: [FEELING], counts: all }));
    const { el, harness } = await render({ find });
    const chip = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('pm-search-type-chips button')].find((b) =>
        text(b).startsWith(label),
      ) as HTMLButtonElement;
    expect(text(chip('Ressentis'))).toBe('Ressentis 3');
    chip('Ressentis').click();
    await settle(harness);
    expect(TestBed.inject(Router).url).toContain('types=feeling');
    expect(find.mock.calls[1][1].types).toEqual(['feeling']);
    expect(chip('Ressentis').getAttribute('aria-pressed')).toBe('true');
    expect(text(chip('Ressentis'))).toBe('Ressentis 3');
    expect(text(chip('Tous'))).toBe('Tous 4');
  });

  it('↓ puis Entrée (dans la barre) : timeline positionnée sur l’entrée (?focus=)', async () => {
    const { el, harness } = await render();
    const bar = document.createElement('input');
    bar.id = 'app-bar-search';
    document.body.appendChild(bar);
    try {
      const event = key(bar, 'ArrowDown');
      expect(event.defaultPrevented).toBe(true);
      await settle(harness);
      expect(el.querySelector('li[aria-current="true"]')?.getAttribute('data-entry-id')).toBe(
        'e-anxiete',
      );
      TestBed.inject(DossierSearchBar).submit('entretien');
      await settle(harness);
      expect(TestBed.inject(Router).url).toBe(
        '/patients/8943f30b-07b2-4933-8a06-7bb3ac736ea7/timeline?focus=e-anxiete',
      );
    } finally {
      bar.remove();
    }
  });

  it('↑ ↓ ignorés dans un autre champ (sélecteur de période)', async () => {
    const { el } = await render();
    const select = el.querySelector('#search-period') as HTMLSelectElement;
    expect(key(select, 'ArrowDown').defaultPrevented).toBe(false);
  });

  it('Échap : retour à l’onglet 1 quand on est arrivé directement', async () => {
    const { harness } = await render();
    key(document.body, 'Escape');
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/patients/8943f30b-07b2-4933-8a06-7bb3ac736ea7');
  });

  it('sélection rangée dans la mémoire des onglets ; « Voir dans le graphe » → ?root=', async () => {
    const { el, harness, shell } = await render();
    expect(shell.rememberTab).toHaveBeenCalledWith('search', { selectedId: 'e-entretien' });
    const graph = [...el.querySelectorAll<HTMLButtonElement>('aside button')].find(
      (b) => text(b) === 'Voir dans le graphe',
    ) as HTMLButtonElement;
    graph.click();
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe(
      '/patients/8943f30b-07b2-4933-8a06-7bb3ac736ea7/graph?root=e-entretien',
    );
  });
});
