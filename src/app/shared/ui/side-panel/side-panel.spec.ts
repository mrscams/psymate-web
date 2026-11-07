import { DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SidePanelComponent } from './side-panel.component';
import { SidePanelService } from './side-panel.service';

@Component({
  selector: 'pm-test-panel',
  imports: [SidePanelComponent],
  template: `
    <pm-side-panel [title]="data.title">
      <label>Texte <input class="first" type="text" /></label>
      <button type="button" class="inside">Lier</button>
      <button pmPanelFooter type="button" class="primary">Enregistrer <kbd>⏎</kbd></button>
    </pm-side-panel>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TestPanel {
  readonly data = inject<{ title: string }>(DIALOG_DATA);
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const dialogs = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
const escape = () =>
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      keyCode: 27,
      bubbles: true,
      cancelable: true,
    } as KeyboardEventInit),
  );

describe('SidePanelService', () => {
  let service: SidePanelService;
  let trigger: HTMLButtonElement;
  let app: HTMLElement;

  beforeEach(() => {
    service = TestBed.inject(SidePanelService);
    app = document.createElement('div');
    app.id = 'app-root';
    trigger = document.createElement('button');
    trigger.textContent = 'Nouvelle entrée';
    app.append(trigger);
    document.body.append(app);
    trigger.focus();
  });

  afterEach(async () => {
    service.closeAll();
    await tick();
    app.remove();
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  it('role dialog, aria-modal, titre relié, 480 px, focus sur le premier champ, page derrière cachée', async () => {
    service.open(TestPanel, { data: { title: 'Nouvelle entrée' } });
    await tick();
    await tick();
    const [dialog] = dialogs();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId!)?.textContent).toBe('Nouvelle entrée');
    const pane = dialog.closest<HTMLElement>('.pm-side-panel-pane');
    expect(pane?.style.width).toBe('480px');
    expect(pane?.classList.contains('pm-side-panel-pane--480')).toBe(true);
    expect(document.querySelector('.pm-side-panel-veil')).not.toBeNull();
    // jsdom n'a pas de géométrie : le piège du CDK ne trouve aucun élément tabulable et garde le
    // focus sur le conteneur ; le focus sur le premier champ est vérifié en e2e (/_demo).
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(app.getAttribute('aria-hidden')).toBe('true');
    expect(service.depth()).toBe(1);
  });

  it('Échap ferme, rend le focus au déclencheur et rend la page aux lecteurs d’écran', async () => {
    const ref = service.open<TestPanel, { title: string }, string>(TestPanel, {
      data: { title: 'Nouvelle entrée' },
    });
    await tick();
    escape();
    await expect(ref!.closed).resolves.toBeUndefined();
    await vi.waitFor(() => expect(dialogs()).toHaveLength(0));
    expect(document.activeElement).toBe(trigger);
    expect(app.hasAttribute('aria-hidden')).toBe(false);
    expect(service.isOpen()).toBe(false);
  });

  it('la croix et le voile ferment ; close(result) rend le résultat', async () => {
    const byCross = service.open(TestPanel, { data: { title: 'A' } });
    await tick();
    dialogs()[0].querySelector<HTMLButtonElement>('button.close')?.click();
    await expect(byCross!.closed).resolves.toBeUndefined();
    await vi.waitFor(() => expect(dialogs()).toHaveLength(0));

    const byVeil = service.open(TestPanel, { data: { title: 'B' } });
    await tick();
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')?.click();
    await expect(byVeil!.closed).resolves.toBeUndefined();
    await vi.waitFor(() => expect(dialogs()).toHaveLength(0));

    const byResult = service.open<TestPanel, { title: string }, string>(TestPanel, {
      data: { title: 'C' },
    });
    await tick();
    byResult!.close('entry-1');
    await expect(byResult!.closed).resolves.toBe('entry-1');
  });

  it('un seul panneau à la fois ; pile de deux avec stack ; le troisième est refusé', async () => {
    service.open(TestPanel, { data: { title: 'Entrée' } });
    await tick();
    service.open(TestPanel, { data: { title: 'Autre entrée' } });
    await vi.waitFor(() => expect(dialogs()).toHaveLength(1));
    expect(dialogs()[0].textContent).toContain('Autre entrée');

    const link = service.open(TestPanel, {
      data: { title: 'Nouveau lien' },
      width: 420,
      stack: true,
    });
    await tick();
    expect(link).not.toBeNull();
    expect(dialogs()).toHaveLength(2);
    expect(service.depth()).toBe(2);
    expect(dialogs()[1].closest<HTMLElement>('.pm-side-panel-pane')?.style.width).toBe('420px');

    expect(service.open(TestPanel, { data: { title: 'Trop' }, stack: true })).toBeNull();

    escape();
    await vi.waitFor(() => expect(dialogs()).toHaveLength(1));
    expect(dialogs()[0].textContent).toContain('Autre entrée');
    expect(service.depth()).toBe(1);
  });
});
