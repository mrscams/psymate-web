import { TestBed } from '@angular/core/testing';
import { MatDialogModule } from '@angular/material/dialog';

import { ConfirmDialogService } from './confirm-dialog.service';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function dialog(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!el) throw new Error('aucune boîte ouverte');
  return el;
}

describe('ConfirmDialogService', () => {
  let service: ConfirmDialogService;
  let trigger: HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MatDialogModule] });
    service = TestBed.inject(ConfirmDialogService);
    trigger = document.createElement('button');
    trigger.textContent = 'Archiver';
    document.body.append(trigger);
    trigger.focus();
  });

  afterEach(() => {
    trigger.remove();
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  it('simple : role dialog, aria-modal, confirmation active d’emblée, retour du focus', async () => {
    const result = service.confirm({ title: 'Supprimer le patient démo ?' });
    await tick();
    const box = dialog();
    expect(box.getAttribute('aria-modal')).toBe('true');
    expect(box.querySelector('h2')?.textContent).toBe('Supprimer le patient démo ?');
    expect(box.querySelector('input')).toBeNull();
    const confirm = box.querySelector<HTMLButtonElement>('button.confirm');
    expect(confirm?.disabled).toBe(false);
    expect(confirm?.classList.contains('danger')).toBe(false);

    confirm?.click();
    await expect(result).resolves.toBe(true);
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('destructive avec le nom à retaper : bouton inactif jusqu’au mot exact', async () => {
    const result = service.confirm({
      title: 'Archiver Marie D. ?',
      description: 'Le dossier passe en lecture seule.',
      confirmLabel: 'Archiver',
      destructive: true,
      confirmWord: 'Marie D.',
    });
    await tick();
    const box = dialog();
    const input = box.querySelector<HTMLInputElement>('input');
    const confirm = box.querySelector<HTMLButtonElement>('button.confirm');
    expect(confirm?.textContent?.trim()).toBe('Archiver');
    expect(confirm?.classList.contains('danger')).toBe(true);
    expect(confirm?.disabled).toBe(true);
    expect(box.textContent).toContain('Tapez « Marie D. » pour confirmer');
    await vi.waitFor(() => expect(document.activeElement).toBe(input));

    input!.value = 'Marie';
    input!.dispatchEvent(new Event('input'));
    await tick();
    expect(confirm?.disabled).toBe(true);

    input!.value = 'Marie D.';
    input!.dispatchEvent(new Event('input'));
    await tick();
    expect(confirm?.disabled).toBe(false);
    confirm?.click();
    await expect(result).resolves.toBe(true);
  });

  it('Annuler et Échap renvoient false', async () => {
    const cancelled = service.confirm({ title: 'A' });
    await tick();
    dialog().querySelector<HTMLButtonElement>('button.cancel')?.click();
    await expect(cancelled).resolves.toBe(false);
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());

    const escaped = service.confirm({ title: 'B' });
    await tick();
    dialog();
    // Le CDK lit encore keyCode : on le fournit avec key.
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        keyCode: 27,
        bubbles: true,
        cancelable: true,
      } as KeyboardEventInit),
    );
    await expect(escaped).resolves.toBe(false);
  });
});
