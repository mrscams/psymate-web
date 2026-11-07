import { TestBed } from '@angular/core/testing';

import { ProfileFields } from '../../data/profile.api';
import { fields, VOCABULARY } from '../../data/profile.fixtures';
import { ProfilePreviewComponent } from './profile-preview.component';

async function render(values: ProfileFields) {
  const fixture = TestBed.createComponent(ProfilePreviewComponent);
  fixture.componentRef.setInput('fields', values);
  fixture.componentRef.setInput('profession', 'Psychologue');
  fixture.componentRef.setInput('vocabulary', VOCABULARY);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('ProfilePreviewComponent', () => {
  it('profil presque vide : seuls le nom, la profession et les initiales sont rendus', async () => {
    const { el } = await render(fields());
    const card = el.querySelector('[data-testid="preview"]')!;
    expect(card.querySelector('.name')?.textContent).toBe('Claire Martin');
    expect(card.querySelector('.profession')?.textContent).toBe('Psychologue');
    expect(card.querySelector('.avatar')?.textContent?.trim()).toBe('CM');
    expect(card.textContent).not.toContain('Tarif');
    expect(card.querySelector('.contacts')).toBeNull();
    expect(card.querySelector('.bio')).toBeNull();
    expect(card.querySelector('.availability')).toBeNull();
  });

  it('tarif vide absent, tarif rempli affiché', async () => {
    const { fixture, el } = await render(fields({ fees: '   ' }));
    expect(el.textContent).not.toContain('Tarif');
    fixture.componentRef.setInput('fields', fields({ fees: '60 € la séance' }));
    await fixture.whenStable();
    expect(el.textContent).toContain('Tarif :');
    expect(el.textContent).toContain('60 € la séance');
  });

  it('contacts : seulement ceux dont l’interrupteur « Afficher » est actif ; site web à part', async () => {
    const { el } = await render(
      fields({
        contactPhone: '04 00 00 00 00',
        showPhone: false,
        contactEmail: 'cabinet@example.test',
        showEmail: true,
        websiteUrl: 'https://claire.example.test',
        address: '12 rue Vendôme',
        city: 'Lyon',
        postalCode: '69006',
        showAddress: true,
      }),
    );
    const contacts = Array.from(el.querySelectorAll('.contact')).map((c) => c.textContent);
    expect(contacts).toEqual(['cabinet@example.test', '12 rue Vendôme, 69006 Lyon']);
    // Le site web n'est pas un moyen de contact du contrat : ligne à part, dès qu'il est rempli.
    expect(el.textContent).toContain('Site web :');
    expect(el.textContent).toContain('https://claire.example.test');
  });

  it('spécialités : trois libellés puis « +n », ville et modalités, disponibilité', async () => {
    const { el } = await render(
      fields({
        specialties: ['anxiety', 'burnout', 'grief', 'self_esteem', 'cbt'],
        city: 'Lyon',
        modalities: ['in_person', 'video'],
        availability: 'accepting',
        bio: 'x'.repeat(400),
      }),
    );
    const chips = Array.from(el.querySelectorAll('.chips li')).map((c) => c.textContent);
    expect(chips).toEqual(['Anxiété', 'Burn-out', 'Deuil', '+2']);
    expect(el.textContent).toContain('Lyon · Au cabinet, En visio');
    expect(el.querySelector('.availability')?.textContent).toContain(
      'Accepte de nouveaux patients',
    );
    expect(el.querySelector('.bio')?.textContent?.endsWith('…')).toBe(true);
  });

  it('« Rafraîchir l’aperçu » amène le focus sur la carte (pas d’aria-live)', async () => {
    const { el } = await render(fields());
    const card = el.querySelector<HTMLElement>('[data-testid="preview"]')!;
    expect(card.getAttribute('aria-live')).toBeNull();
    el.querySelector<HTMLButtonElement>('.refresh')!.click();
    expect(document.activeElement).toBe(card);
  });
});
