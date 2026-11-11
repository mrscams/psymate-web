import { TestBed } from '@angular/core/testing';

import { DecisionInput } from '../data/admin.model';
import { DecisionFormComponent } from './decision-form.component';

async function render(inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ imports: [DecisionFormComponent] });
  const fixture = TestBed.createComponent(DecisionFormComponent);
  fixture.componentRef.setInput('displayName', 'Claire Moreau');
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  const decided: DecisionInput[] = [];
  fixture.componentInstance.decide.subscribe((value) => decided.push(value));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === text,
    )!;
  const type = async (selector: string, value: string) => {
    const field = el.querySelector<HTMLTextAreaElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const checkAll = async () => {
    for (const box of el.querySelectorAll<HTMLInputElement>('.checklist input')) box.click();
    await fixture.whenStable();
  };
  return { fixture, el, decided, button, type, checkAll };
}

describe('DecisionFormComponent', () => {
  it('sans message : complément et refus actifs, erreur sous le champ et focus au clic ; rien ne part', async () => {
    const { fixture, el, button, type, decided } = await render();
    document.body.appendChild(el);
    expect(button('Demander un complément').disabled).toBe(false);
    expect(button('Refuser et suspendre').disabled).toBe(false);
    await type('#field-messageToPractitioner', '   ');
    button('Refuser et suspendre').click();
    await fixture.whenStable();
    expect(decided).toHaveLength(0);
    const field = el.querySelector<HTMLTextAreaElement>('#field-messageToPractitioner')!;
    expect(el.querySelector('#field-messageToPractitioner-error')?.textContent).toContain(
      'Ce champ est obligatoire.',
    );
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field);
    await type('#field-messageToPractitioner', 'Merci de joindre votre diplôme.');
    expect(el.querySelector('#field-messageToPractitioner-error')).toBeNull();
    button('Demander un complément').click();
    expect(decided).toEqual([
      expect.objectContaining({
        kind: 'needs_more',
        messageToPractitioner: 'Merci de joindre votre diplôme.',
        force: false,
      }),
    ]);
    el.remove();
  });

  it('422 du serveur : le message de l’API s’affiche sous le champ', async () => {
    const { fixture, el } = await render();
    fixture.componentRef.setInput('problem', {
      status: 422,
      code: 'VALIDATION_FAILED',
      errors: [
        {
          field: 'messageToPractitioner',
          code: 'MESSAGE_REQUIRED',
          message: 'Un message au praticien est obligatoire.',
        },
      ],
    });
    await fixture.whenStable();
    expect(el.querySelector('#field-messageToPractitioner-error')?.textContent).toContain(
      'Un message au praticien est obligatoire.',
    );
    expect(el.querySelector('#field-messageToPractitioner')?.getAttribute('aria-invalid')).toBe(
      'true',
    );
  });

  it('approuver, tout coché et conforme : approbation directe, liste de contrôle jointe', async () => {
    const { button, checkAll, decided } = await render({ nonConform: 0 });
    await checkAll();
    button('Approuver').click();
    expect(decided).toEqual([
      {
        kind: 'approved',
        internalNote: '',
        messageToPractitioner: '',
        checklist: {
          nameMatches: true,
          diplomaMatchesProfession: true,
          registryFound: true,
          documentsReadable: true,
        },
        force: false,
      },
    ]);
  });

  it('approuver avec points ouverts : confirmation en ligne, note interne exigée, force si non conforme', async () => {
    const { fixture, el, button, type, decided } = await render({ nonConform: 1 });
    button('Approuver').click();
    await fixture.whenStable();
    expect(decided).toHaveLength(0);
    const confirm = el.querySelector('.confirm[role="alert"]');
    expect(confirm?.textContent).toContain('4 points de contrôle non cochés');
    expect(confirm?.textContent).toContain('1 justificatif non marqué conforme');
    expect(confirm?.textContent).toContain('approuver quand même ?');
    expect(button('Approuver quand même').disabled).toBe(true);
    await type('#field-internalNote', 'Diplôme vérifié auprès de l’université.');
    button('Approuver quand même').click();
    expect(decided[0]).toEqual(
      expect.objectContaining({
        kind: 'approved',
        force: true,
        internalNote: 'Diplôme vérifié auprès de l’université.',
      }),
    );
  });

  it('points de contrôle ouverts mais justificatifs conformes : confirmation, sans force', async () => {
    const { fixture, button, type, decided } = await render({ nonConform: 0 });
    button('Approuver').click();
    await fixture.whenStable();
    await type('#field-internalNote', 'Registre consulté par téléphone.');
    button('Approuver quand même').click();
    expect(decided[0]).toEqual(expect.objectContaining({ kind: 'approved', force: false }));
  });

  it('409 ADMIN_APPROVAL_INCOMPLETE : ouvre la confirmation ; 409 d’état : message lisible', async () => {
    const { fixture, el } = await render();
    fixture.componentRef.setInput('problem', { status: 409, code: 'ADMIN_APPROVAL_INCOMPLETE' });
    await fixture.whenStable();
    expect(el.querySelector('.confirm')).not.toBeNull();
    fixture.componentRef.setInput('problem', { status: 409, code: 'ADMIN_DOSSIER_NOT_REVIEWABLE' });
    await fixture.whenStable();
    expect(el.querySelector('.error[role="alert"]')?.textContent).toContain(
      "n'est plus en attente de décision",
    );
  });
});
