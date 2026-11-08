import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { SessionStore } from '../../core/auth';
import { SidePanelComponent, SidePanelService } from '../../shared/ui';
import { LinkApi } from './data/link.api';
import { CATALOG, link, source } from './data/link.fixtures';
import { connectLinkEditor, LINK_QUERY_PARAM, openLinkEditor } from './link-editor.launcher';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

@Component({
  selector: 'pm-test-other-panel',
  imports: [SidePanelComponent],
  template: `<pm-side-panel title="Autre" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class OtherPanel {}

const patient = signal<{ id: string; displayName: string } | null>(null);

@Component({
  selector: 'pm-test-shell',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ShellHost {
  constructor() {
    connectLinkEditor(() => patient());
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await tick();
    TestBed.tick();
  }
}

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'patients/:id', component: ShellHost }]),
      {
        provide: LinkApi,
        useValue: {
          linkTypes: vi.fn().mockResolvedValue(CATALOG),
          entry: vi.fn().mockResolvedValue(source()),
          linksOf: vi.fn().mockResolvedValue([link()]),
          targets: vi.fn().mockResolvedValue([]),
        },
      },
      { provide: SessionStore, useValue: { me: signal({ id: 'u-claire' }) } },
    ],
  });
  const harness = await RouterTestingHarness.create();
  return {
    router: TestBed.inject(Router),
    panels: TestBed.inject(SidePanelService),
    go: (url: string) => harness.navigateByUrl(url),
  };
}

const panelCount = () => document.querySelectorAll('pm-link-editor-panel').length;

describe('openLinkEditor, connectLinkEditor', () => {
  afterEach(async () => {
    TestBed.inject(SidePanelService).closeAll();
    await tick();
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
    patient.set(null);
  });

  it('ouvre le panneau 420 px, porte ?link=<id> tant qu’il est ouvert ; seconde demande sans effet', async () => {
    const { router, panels, go } = await setup();
    await go('/patients/p-marie');
    const ref = TestBed.runInInjectionContext(() => openLinkEditor('e-feeling'));
    await settle();
    expect(ref).not.toBeNull();
    expect(document.querySelector('.pm-side-panel-pane--420')).not.toBeNull();
    expect(router.parseUrl(router.url).queryParams[LINK_QUERY_PARAM]).toBe('e-feeling');
    expect(TestBed.runInInjectionContext(() => openLinkEditor('e-feeling'))).toBeNull();
    expect(panels.depth()).toBe(1);
    ref!.close();
    await settle();
    expect(router.parseUrl(router.url).queryParams[LINK_QUERY_PARAM]).toBeUndefined();
  });

  it('s’empile sur le panneau ouvert (éditeur d’entrée)', async () => {
    const { panels, go } = await setup();
    await go('/patients/p-marie');
    panels.open(OtherPanel);
    TestBed.runInInjectionContext(() => openLinkEditor('e-feeling'));
    await settle();
    expect(panels.depth()).toBe(2);
    expect(document.querySelector('pm-test-other-panel')).not.toBeNull();
  });

  it('?link=<id> ouvre l’éditeur une fois le patient chargé', async () => {
    const { go } = await setup();
    await go('/patients/p-marie?link=e-feeling');
    await settle();
    expect(panelCount()).toBe(0);
    patient.set({ id: 'p-marie', displayName: 'Marie D.' });
    await settle();
    expect(panelCount()).toBe(1);
    expect(document.querySelector('pm-link-editor-panel .patient')?.textContent).toContain(
      'Marie D.',
    );
  });

  it('L lie l’entrée ouverte (?entry=<id>) ; sans entrée ouverte, rien', async () => {
    const { router, go } = await setup();
    patient.set({ id: 'p-marie', displayName: 'Marie D.' });
    await go('/patients/p-marie');
    await settle();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
    await settle();
    expect(panelCount()).toBe(0);
    await go('/patients/p-marie?entry=e-feeling');
    await settle();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
    await settle();
    expect(panelCount()).toBe(1);
    expect(router.parseUrl(router.url).queryParams).toEqual({
      entry: 'e-feeling',
      link: 'e-feeling',
    });
  });
});
