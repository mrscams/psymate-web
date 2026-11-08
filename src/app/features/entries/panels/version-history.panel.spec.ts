import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SessionStore } from '../../../core/auth';
import { PreferencesStore } from '../../../core/preferences';
import { SidePanelService } from '../../../shared/ui';
import { EntriesApi } from '../data/entries.api';
import { EntryEditorStore } from '../data/entry-editor.store';
import { EMOTIONS, entry, VERSIONS } from '../data/entry.fixtures';
import { VersionHistoryPanel } from './version-history.panel';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function render(versions: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: EntriesApi,
        useValue: {
          emotions: vi.fn().mockResolvedValue(EMOTIONS),
          tagLabels: vi.fn().mockResolvedValue([]),
          get: vi.fn().mockResolvedValue(entry({ version: 2 })),
          versions,
        },
      },
      { provide: SessionStore, useValue: { me: signal({ id: 'u-claire' }) } },
      { provide: PreferencesStore, useValue: { defaultVisibility: signal('clinical') } },
    ],
  });
  void TestBed.inject(EntryEditorStore).open({ patientId: 'p-marie', entryId: 'e-1' });
  TestBed.inject(SidePanelService).open(VersionHistoryPanel, { width: 420, stack: true });
  for (let i = 0; i < 3; i++) {
    await tick();
    TestBed.tick();
  }
  return document.querySelector<HTMLElement>('pm-version-history-panel')!;
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('VersionHistoryPanel', () => {
  afterEach(async () => {
    TestBed.inject(SidePanelService).closeAll();
    await tick();
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  it('chargement : squelette', async () => {
    const el = await render(vi.fn(() => new Promise(() => undefined)));
    expect(el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
  });

  it('erreur : message et Réessayer', async () => {
    const versions = vi.fn().mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' });
    const el = await render(versions);
    expect(text(el.querySelector('pm-state [role="alert"]'))).toContain(
      "Impossible de charger l'historique",
    );
    el.querySelector<HTMLButtonElement>('pm-state button')!.click();
    await tick();
    expect(versions).toHaveBeenCalledTimes(2);
  });

  it('vide : « Aucune version »', async () => {
    const el = await render(vi.fn().mockResolvedValue([]));
    expect(text(el.querySelector('pm-state'))).toContain('Aucune version');
  });

  it('liste : courante en aria-current, motif, différences en <dl> avec <s>, inchangés', async () => {
    const el = await render(vi.fn().mockResolvedValue(VERSIONS));
    expect(text(el.querySelector('h2'))).toBe('Historique des versions');
    const items = [...el.querySelectorAll('ol.versions > li')];
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute('aria-current')).toBe('true');
    expect(items[1].hasAttribute('aria-current')).toBe(false);
    expect(text(items[0].querySelector('.line'))).toMatch(/^v2 · .+ · vous · courante$/);
    expect(text(items[0].querySelector('.reason'))).toBe('Motif : Précision après la séance');
    expect(text(items[0].querySelector('dt'))).toBe('Texte');
    expect(text(items[0].querySelector('dd s'))).toBe('Évaluation tendue avec la responsable.');
    expect(text(items[0].querySelector('dd .after'))).toBe(
      'Évaluation tendue, objectifs revus à la baisse.',
    );
    expect(text(items[0].querySelector('.unchanged'))).toBe('Inchangés : Titre');
    expect(text(items[1])).toContain("Création de l'entrée.");
  });
});
