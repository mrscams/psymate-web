import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ChecklistItem, PublishCardComponent } from './publish-card.component';

const CHECKLIST: ChecklistItem[] = [
  { id: 'identity', label: 'Nom affiché, profession, ville', state: 'ok' },
  { id: 'photo', label: 'Photo absente : les initiales sont affichées', state: 'warning' },
];

async function render(inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(PublishCardComponent);
  fixture.componentRef.setInput('publicUrl', 'http://localhost/fr/praticiens/claire-martin');
  fixture.componentRef.setInput('checklist', CHECKLIST);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const toggle = el.querySelector<HTMLInputElement>('input[role="switch"]')!;
  return { fixture, el, toggle };
}

describe('PublishCardComponent', () => {
  it('dossier non approuvé : interrupteur inactif avec le motif', async () => {
    const { el, toggle } = await render({ canPublish: false });
    expect(toggle.disabled).toBe(true);
    expect(toggle.getAttribute('aria-describedby')).toBe('publish-locked');
    expect(el.querySelector('#publish-locked')?.textContent).toContain(
      'Dossier en cours de vérification',
    );
  });

  it('publier : émet publish sans basculer l’interrupteur avant la réponse du serveur', async () => {
    const { fixture, toggle } = await render({ canPublish: true });
    const publish = vi.fn();
    fixture.componentInstance.publish.subscribe(publish);
    toggle.click();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(toggle.checked).toBe(false);
  });

  it('dépublier : confirmation inline, puis unpublish', async () => {
    const { fixture, el, toggle } = await render({ canPublish: true, published: true });
    const unpublish = vi.fn();
    fixture.componentInstance.unpublish.subscribe(unpublish);
    expect(el.textContent).toContain('Ouvrir la fiche publique');
    toggle.click();
    await fixture.whenStable();
    expect(unpublish).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Elle disparaît immédiatement');
    const confirm = Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Retirer la fiche'),
    )!;
    confirm.click();
    await fixture.whenStable();
    expect(unpublish).toHaveBeenCalledTimes(1);
    expect(el.textContent).not.toContain('Elle disparaît immédiatement');
  });

  it('refus 409 : une ligne par élément manquant, dossier → lien vers le dossier', async () => {
    const { fixture, el } = await render({
      canPublish: true,
      missing: ['verification', 'contact'],
      problem: { status: 409, code: 'PROFILE_INCOMPLETE' },
    });
    const refused = el.querySelector('[data-testid="publish-refused"]')!;
    expect(refused.getAttribute('role')).toBe('alert');
    const lines = Array.from(refused.querySelectorAll('li')).map((li) => li.textContent?.trim());
    expect(lines[0]).toContain('Votre dossier professionnel doit être approuvé');
    expect(lines[1]).toContain('Affichez au moins un moyen de contact');
    const fix = vi.fn();
    fixture.componentInstance.fix.subscribe(fix);
    refused.querySelector<HTMLButtonElement>('button.link')!.click();
    expect(fix).toHaveBeenCalledWith('contact');
  });

  it('liste de contrôle : état lu par le lecteur d’écran, adresse de la fiche', async () => {
    const { el } = await render({ canPublish: true });
    const items = Array.from(el.querySelectorAll('.checklist li')).map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(items[0]).toContain('Fait : Nom affiché, profession, ville');
    expect(items[1]).toContain('À noter : Photo absente');
    expect(el.querySelector('.url')?.textContent).toBe(
      'http://localhost/fr/praticiens/claire-martin',
    );
    expect(el.textContent).not.toContain('Ouvrir la fiche publique');
  });
});
