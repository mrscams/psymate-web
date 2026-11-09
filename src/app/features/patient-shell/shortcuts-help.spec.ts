import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ShortcutService } from '../../core/shortcuts';
import { SidePanelService } from '../../shared/ui';
import {
  formShortcuts,
  helpContext,
  ShortcutsHelp,
  ShortcutsHelpComponent,
} from './shortcuts-help';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  await tick();
  await tick();
};
const dialogs = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
const help = () => dialogs().find((d) => d.querySelector('pm-shortcuts-help-panel'));
/** Le panneau est chargé à la demande (import dynamique) : on attend qu'il soit là. */
async function opened(): Promise<void> {
  await vi.waitFor(() => {
    if (!help()) throw new Error('aide pas encore ouverte');
  });
  await settle();
}

function press(key: string, target: EventTarget = document.body): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    keyCode: key === 'Escape' ? 27 : 0,
    bubbles: true,
    cancelable: true,
  } as KeyboardEventInit);
  target.dispatchEvent(event);
  return event;
}

describe('helpContext', () => {
  it.each([
    ['/patients', { folder: false, form: false }],
    ['/patients?q=ma', { folder: false, form: false }],
    ['/patients/nouveau', { folder: false, form: true }],
    ['/patients/p-1/fiche', { folder: false, form: true }],
    ['/patients/p-1', { folder: true, form: false }],
    ['/patients/p-1/timeline?entry=e-1', { folder: true, form: false }],
    ['/mon-compte/preferences', { folder: false, form: false }],
  ])('%s', (url, expected) => {
    expect(helpContext(url)).toEqual(expected);
  });

  it('gestes de formulaire : Entrée et Ctrl+S dans le dossier, Ctrl+Entrée aussi sur la fiche', () => {
    const list = formShortcuts({ folder: false, form: false });
    expect(list.map((r) => r.keys.join('+'))).toEqual(['Entrée', 'Ctrl+Entrée', 'Ctrl+S']);
    expect(list.every((r) => !r.available)).toBe(true);
    const form = formShortcuts({ folder: false, form: true });
    expect(form.map((r) => r.available)).toEqual([false, true, false]);
    expect(formShortcuts({ folder: true, form: false }).every((r) => r.available)).toBe(true);
  });
});

describe('ShortcutsHelpComponent et ShortcutsHelp (touche ?)', () => {
  let shortcuts: ShortcutService;
  let input: HTMLInputElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/patients');
    shortcuts = TestBed.inject(ShortcutService);
    input = document.createElement('input');
    document.body.append(input);
    TestBed.createComponent(ShortcutsHelpComponent);
    await settle();
  });

  afterEach(async () => {
    TestBed.inject(SidePanelService).closeAll();
    await settle();
    input.remove();
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  it('inscrit ? avec sa description, la désinscrit à la destruction', () => {
    const help = shortcuts.active().find((r) => r.key === '?');
    expect(help?.description).toBe('Afficher cette aide');
    TestBed.resetTestingModule();
    expect(shortcuts.active().some((r) => r.key === '?')).toBe(false);
  });

  it('? ouvre le panneau « Raccourcis clavier » (role dialog), alimenté par le registre', async () => {
    const release = shortcuts.register('n', () => undefined, 'Nouveau patient');
    press('?');
    await opened();
    const dialog = help();
    expect(dialog).toBeDefined();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog?.getAttribute('aria-labelledby');
    expect(document.getElementById(titleId ?? '')?.textContent).toBe('Raccourcis clavier');
    const rows = [...(dialog?.querySelectorAll('tbody tr') ?? [])].map((tr) => ({
      key: tr.querySelector('th')?.textContent?.replace(/\s+/g, ' ').trim(),
      text: tr.querySelector('td')?.textContent?.replace(/\s+/g, ' ').trim(),
      off: tr.classList.contains('unavailable'),
    }));
    expect(rows[0]).toEqual({ key: 'N', text: 'Nouveau patient', off: false });
    expect(rows.find((r) => r.key === 'L')).toEqual({
      key: 'L',
      text: "Lier l'entrée ouverte indisponible ici",
      off: true,
    });
    expect(rows.find((r) => r.key?.replace(/\s/g, '') === 'Ctrl+Entrée')?.off).toBe(true);
    expect(rows.at(-1)).toEqual({ key: '?', text: 'Afficher cette aide', off: false });
    expect(dialog?.querySelector('caption')?.textContent).toContain('Raccourcis disponibles');
    expect(dialog?.querySelectorAll('th[scope="row"]').length).toBe(rows.length);
    release();
  });

  it('? dans un champ ne fait rien (le caractère s’écrit)', async () => {
    input.focus();
    const event = press('?', input);
    await settle();
    expect(help()).toBeUndefined();
    expect(event.defaultPrevented).toBe(false);
  });

  it('Échap ferme l’aide ; ? une seconde fois la ferme aussi', async () => {
    const service = TestBed.inject(ShortcutsHelp);
    press('?');
    await opened();
    expect(service.isOpen()).toBe(true);
    press('Escape');
    await settle();
    expect(help()).toBeUndefined();
    expect(service.isOpen()).toBe(false);

    press('?');
    await opened();
    expect(help()).toBeDefined();
    press('?');
    await settle();
    expect(help()).toBeUndefined();
  });

  it('open() depuis une autre feature (« Voir les raccourcis ») : un seul panneau d’aide', async () => {
    const service = TestBed.inject(ShortcutsHelp);
    void service.open();
    void service.open();
    await opened();
    expect(dialogs().filter((d) => d.querySelector('pm-shortcuts-help-panel'))).toHaveLength(1);
  });
});
