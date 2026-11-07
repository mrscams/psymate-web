import { TestBed } from '@angular/core/testing';

import { ProfessionalInfo, ProfessionalInfoPatch } from '../data/verification.api';
import { InfoSaveState, ProfessionalInfoFormComponent } from './professional-info-form.component';

const info: ProfessionalInfo = {
  professionalNumber: '',
  phone: '+33600000099',
  remoteOnly: false,
  address: { street: '1 rue A', postalCode: '69001', city: 'Lyon' },
};

const IDLE: InfoSaveState = { status: 'idle', problem: null, savedAt: null };

async function render(state: InfoSaveState = IDLE, profession = 'psychologist') {
  TestBed.configureTestingModule({ imports: [ProfessionalInfoFormComponent] });
  const fixture = TestBed.createComponent(ProfessionalInfoFormComponent);
  fixture.componentRef.setInput('info', info);
  fixture.componentRef.setInput('profession', profession);
  fixture.componentRef.setInput('state', state);
  const saved: ProfessionalInfoPatch[] = [];
  fixture.componentInstance.save.subscribe((patch) => saved.push(patch));
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, saved };
}

function type(el: HTMLElement, id: string, value: string): void {
  const input = el.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`champ absent : ${id}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('ProfessionalInfoFormComponent', () => {
  it('rempli depuis le dossier, numéro recommandé pour un psychologue', async () => {
    const { el } = await render();
    expect(el.querySelector<HTMLInputElement>('#field-info-phone')?.value).toBe('+33600000099');
    expect(el.querySelector<HTMLInputElement>('#field-info-address-city')?.value).toBe('Lyon');
    expect(el.textContent).toContain('Psychologue');
    expect(el.textContent).toContain('recommandé, jamais bloquant');
  });

  it('coach : numéro facultatif', async () => {
    const { el } = await render(IDLE, 'coach');
    expect(el.textContent).toContain('(facultatif)');
  });

  it('Enregistrer émet toutes les valeurs nettoyées (chaîne vide = effacement)', async () => {
    const { fixture, el, saved } = await render();
    type(el, 'field-info-professionalNumber', ' 829300123 ');
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await fixture.whenStable();
    expect(saved).toEqual([
      {
        professionalNumber: '829300123',
        phone: '+33600000099',
        remoteOnly: false,
        address: { street: '1 rue A', postalCode: '69001', city: 'Lyon' },
      },
    ]);
  });

  it('visio uniquement : adresse désactivée', async () => {
    const { fixture, el } = await render();
    el.querySelector<HTMLInputElement>('#field-info-remoteOnly')?.click();
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('#field-info-address-street')?.disabled).toBe(true);
  });

  it('422 : message du serveur sous le champ fautif ; enregistré après succès', async () => {
    // Le 422 arrive après le rendu (réponse à Enregistrer), jamais à la création.
    const { fixture, el } = await render();
    fixture.componentRef.setInput('state', {
      status: 'error',
      savedAt: null,
      problem: {
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'phone', code: 'INVALID_FIELD', message: 'Numéro invalide.' }],
      },
    });
    await fixture.whenStable();
    expect(el.querySelector('#field-info-phone-error')?.textContent).toContain('Numéro invalide.');
    fixture.componentRef.setInput('state', { status: 'idle', problem: null, savedAt: Date.now() });
    fixture.componentRef.setInput('info', { ...info });
    await fixture.whenStable();
    expect(el.querySelector('[role=status]')?.textContent).toContain('Enregistré');
  });
});
