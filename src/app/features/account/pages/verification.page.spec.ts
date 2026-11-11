import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { ConfirmDialogService, ToastService } from '../../../shared/ui';
import { Verification, VerificationApi } from '../data/verification.api';
import { DOSSIER } from '../data/verification.fixtures';
import { VerificationPage } from './verification.page';

const alix: SessionUser = {
  id: '1',
  email: 'alix@example.test',
  displayName: 'Alix Essai',
  profession: 'psychologist',
  verificationStatus: 'docs_pending',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

async function render(api: Partial<VerificationApi>, confirm = vi.fn().mockResolvedValue(true)) {
  TestBed.configureTestingModule({
    imports: [VerificationPage],
    providers: [
      provideRouter([]),
      { provide: VerificationApi, useValue: api },
      { provide: SessionApi, useValue: { me: vi.fn().mockResolvedValue(alix) } },
      { provide: ConfirmDialogService, useValue: { confirm } },
    ],
  });
  TestBed.inject(SessionStore).signIn(alix);
  const fixture = TestBed.createComponent(VerificationPage);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, toast: TestBed.inject(ToastService) };
}

describe('VerificationPage', () => {
  it('chargement : squelette aria-busy, navigation Mon compte présente', async () => {
    const load = vi.fn().mockReturnValue(new Promise<Verification>(() => undefined));
    const { el } = await render({ load });
    expect(el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('nav[aria-label="Mon compte"]')).not.toBeNull();
  });

  it('erreur : bloc erreur avec Réessayer qui relance GET', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce(DOSSIER);
    const { fixture, el } = await render({ load });
    expect(el.querySelector('pm-state [role=alert]')?.textContent).toContain(
      'Impossible de charger votre dossier professionnel',
    );
    el.querySelector<HTMLButtonElement>('pm-state button')?.click();
    await fixture.whenStable();
    expect(load).toHaveBeenCalledTimes(2);
    expect(el.querySelector('pm-document-list')).not.toBeNull();
  });

  it('dossier vide : état vide compact, formulaire d’ajout, Soumettre désactivé avec la liste des manques', async () => {
    const empty: Verification = { ...DOSSIER, documents: [], missing: ['diploma', 'identity'] };
    const { el } = await render({ load: vi.fn().mockResolvedValue(empty) });
    expect(el.querySelector('pm-state [role=status]')?.textContent).toContain(
      'Aucun justificatif déposé',
    );
    expect(el.querySelector('pm-document-upload')).not.toBeNull();
    const submit = el.querySelector<HTMLButtonElement>('section.actions button');
    expect(submit?.disabled).toBe(true);
    expect(el.querySelector('.missing')?.textContent).toContain(
      'Il manque : diplôme, pièce d’identité'.replace('’', "'"),
    );
  });

  it('diplôme sans pièce d’identité : « Il manque : pièce d’identité », encart conseillé (ADELI, G Q14)', async () => {
    const { el } = await render({ load: vi.fn().mockResolvedValue(DOSSIER) });
    expect(el.querySelector('.missing')?.textContent).toContain("Il manque : pièce d'identité");
    expect(el.querySelector('.recommended')?.textContent).toContain('attestation ADELI / RPPS');
    expect(el.querySelector<HTMLButtonElement>('section.actions button')?.disabled).toBe(true);
    expect(
      el.querySelector('ol[aria-label="Progression du dossier"] [aria-current=step]')?.textContent,
    ).toContain('Justificatifs');
  });

  it('complet : Soumettre actif ; après submit, under_review, dossier verrouillé, bandeau de session à jour', async () => {
    const complete: Verification = { ...DOSSIER, missing: [] };
    const reviewed: Verification = {
      ...complete,
      status: 'under_review',
      submittedAt: '2026-11-07T10:00:00Z',
    };
    const submit = vi.fn().mockResolvedValue(reviewed);
    const me = vi.fn().mockResolvedValue({ ...alix, verificationStatus: 'under_review' });
    TestBed.overrideProvider(SessionApi, { useValue: { me } });
    const { fixture, el, toast } = await render({
      load: vi.fn().mockResolvedValue(complete),
      submit,
      refreshSession: vi.fn().mockResolvedValue(undefined),
    });
    const button = el.querySelector<HTMLButtonElement>('section.actions button');
    expect(button?.disabled).toBe(false);
    expect(el.querySelector('.missing')).toBeNull();
    button?.click();
    // submit → refreshSession → session.load : trois promesses hors des tâches suivies par le fixture.
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(submit).toHaveBeenCalled();
    expect(TestBed.inject(SessionStore).verificationStatus()).toBe('under_review');
    expect(el.querySelector('.notice.info')?.textContent).toContain('en cours de vérification');
    expect(el.querySelector('pm-document-upload')).toBeNull();
    expect(el.querySelector('section.actions')).toBeNull();
    expect(el.querySelector('pm-document-list button.remove')).toBeNull();
    expect(toast.toasts()[0]?.message).toContain('Dossier soumis');
  });

  it('submit 409 VERIFICATION_INCOMPLETE : message sous le bouton et dossier relu', async () => {
    const complete: Verification = { ...DOSSIER, missing: [] };
    const load = vi.fn().mockResolvedValue(complete);
    const submit = vi.fn().mockRejectedValue({
      status: 409,
      code: 'VERIFICATION_INCOMPLETE',
      extra: { missing: ['identity'] },
    });
    const { fixture, el } = await render({ load, submit });
    el.querySelector<HTMLButtonElement>('section.actions button')?.click();
    await fixture.whenStable();
    expect(el.querySelector('section.actions [role=alert]')?.textContent).toContain(
      "il manque : pièce d'identité",
    );
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('Retirer : confirmation puis DELETE et relecture', async () => {
    const load = vi.fn().mockResolvedValue(DOSSIER);
    const remove = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.fn().mockResolvedValue(true);
    const { fixture, el } = await render({ load, remove }, confirm);
    el.querySelector<HTMLButtonElement>('pm-document-list button.remove')?.click();
    await fixture.whenStable();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }));
    expect(remove).toHaveBeenCalledWith('d1');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('needs_more : le message de l’administrateur est affiché', async () => {
    const needsMore: Verification = {
      ...DOSSIER,
      status: 'needs_more',
      adminMessage: 'Le diplôme est illisible.',
    };
    const { el } = await render({ load: vi.fn().mockResolvedValue(needsMore) });
    expect(el.querySelector('.notice.warning')?.textContent).toContain('Le diplôme est illisible.');
    expect(el.querySelector('pm-document-upload')).not.toBeNull();
  });
});
