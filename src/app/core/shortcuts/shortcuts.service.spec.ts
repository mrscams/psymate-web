import { TestBed } from '@angular/core/testing';

import { globalShortcuts, isEditableTarget, ShortcutService } from './shortcuts.service';

function press(key: string, target: EventTarget = document.body, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('ShortcutService', () => {
  let service: ShortcutService;

  beforeEach(() => {
    service = TestBed.inject(ShortcutService);
  });

  it('appelle le dernier inscrit d’une touche et empêche l’action par défaut', () => {
    const first = vi.fn();
    const second = vi.fn();
    service.register('N', first);
    const unregister = service.register('n', second);

    const event = press('n');
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);

    unregister();
    press('N');
    expect(first).toHaveBeenCalledOnce();
    expect(service.active()).toHaveLength(1);
  });

  it('reste inactif dans un champ, sauf Échap', () => {
    const handler = vi.fn();
    const escape = vi.fn();
    service.register('/', handler);
    service.register('Escape', escape);
    const input = document.createElement('input');
    document.body.append(input);

    press('/', input);
    expect(handler).not.toHaveBeenCalled();
    press('Escape', input);
    expect(escape).toHaveBeenCalledOnce();

    const editable = document.createElement('div');
    editable.setAttribute('role', 'textbox');
    document.body.append(editable);
    press('/', editable);
    expect(handler).not.toHaveBeenCalled();

    press('/');
    expect(handler).toHaveBeenCalledOnce();
    input.remove();
    editable.remove();
  });

  it('ignore les modificateurs, la répétition, un événement déjà traité et l’état désactivé', () => {
    const handler = vi.fn();
    service.register('1', handler);
    press('1', document.body, { ctrlKey: true });
    press('1', document.body, { metaKey: true });
    press('1', document.body, { altKey: true });
    press('1', document.body, { repeat: true });
    const handled = new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true });
    handled.preventDefault();
    document.body.dispatchEvent(handled);
    expect(handler).not.toHaveBeenCalled();

    service.enabled.set(false);
    press('1');
    expect(handler).not.toHaveBeenCalled();
    service.enabled.set(true);
    press('1');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('? avec Maj passe (le navigateur donne la touche produite)', () => {
    const help = vi.fn();
    service.register('?', help);
    press('?', document.body, { shiftKey: true });
    expect(help).toHaveBeenCalledOnce();
  });

  it('liste de référence : les neuf touches de B2 et de la fiche 00', () => {
    expect(globalShortcuts().map((s) => s.key)).toEqual([
      'n',
      '/',
      'l',
      '1',
      '2',
      '3',
      'm',
      'Escape',
      '?',
    ]);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
