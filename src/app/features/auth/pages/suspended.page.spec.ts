import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SessionApi } from '../../../core/auth/data/session.api';
import { ExportStatus, SuspendedApi } from '../data/suspended.api';
import { EXPORT_JOB_STORAGE_KEY, SuspendedStore } from '../data/suspended.store';
import { SuspendedPage } from './suspended.page';

const DONE: ExportStatus = {
  jobId: 'job-1',
  status: 'done',
  requestedAt: '2026-11-07T10:00:00Z',
  finishedAt: '2026-11-07T10:01:00Z',
  expiresAt: '2026-11-14T10:01:00Z',
  downloadUrl: '/api/me/export/job-1/file?exp=1794000060&sig=abc',
  error: null,
};

const MESSAGE = 'Le diplôme transmis est bien celui de mon établissement, voici pourquoi.';

async function render(api: Partial<SuspendedApi>) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    imports: [SuspendedPage],
    providers: [
      provideRouter([]),
      { provide: SuspendedApi, useValue: api },
      { provide: SessionApi, useValue: { me: vi.fn().mockResolvedValue(null) } },
    ],
  });
  const fixture = TestBed.createComponent(SuspendedPage);
  await fixture.whenStable();
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    store: TestBed.inject(SuspendedStore),
  };
}

function type(el: HTMLElement, id: string, value: string): void {
  const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  if (!input) throw new Error(`champ absent : ${id}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function fillCredentials(el: HTMLElement): void {
  type(el, 'field-email', 'marc@example.test');
  type(el, 'field-password', 'Secret-Clinique-2026');
}

async function click(fixture: ComponentFixture<SuspendedPage>, el: HTMLElement, text: string) {
  const button = [...el.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  if (!button) throw new Error(`bouton absent : ${text}`);
  button.click();
  await fixture.whenStable();
}

describe('SuspendedPage · structure', () => {
  it('bande role=status, h1 qui la reprend, motif, trois possibilités, identité, recours (fiche 27)', async () => {
    const { el } = await render({});
    expect(el.querySelector('.band')?.getAttribute('role')).toBe('status');
    expect(el.querySelector('.band')?.textContent).toContain('Compte suspendu ou refusé');
    expect(el.querySelector('h1')?.textContent).toContain(
      'Votre compte est suspendu ou votre dossier a été refusé',
    );
    expect(el.querySelector('#reason-title')?.textContent).toContain('Motif communiqué');
    expect(el.textContent).toContain("Aucune donnée patient n'a été consultée");
    expect(el.querySelectorAll('ul.can li')).toHaveLength(3);
    expect(el.querySelector('legend')?.textContent).toContain('Confirmez votre identité');
    expect(el.querySelector('label[for=field-message]')?.textContent).toContain(
      'Votre explication',
    );
    // Sans session : aucun champ code, lien retour à la connexion, aucune mention d'agenda (G Q25).
    expect(el.querySelector('#field-otp')).toBeNull();
    expect([...el.querySelectorAll('a')].map((a) => a.textContent?.trim())).toContain(
      'Retour à la connexion',
    );
    expect(el.textContent?.toLowerCase()).not.toContain('agenda');
  });

  it('état initial : aucune ligne de job, bouton Exporter actif', async () => {
    const { el } = await render({});
    expect(el.querySelector('.job .row')).toBeNull();
    expect(el.querySelector('#export-button')?.getAttribute('aria-disabled')).not.toBe('true');
  });
});

describe('SuspendedPage · export', () => {
  it('identifiants vides : rien ne part, champs marqués', async () => {
    const requestExport = vi.fn();
    const { fixture, el } = await render({ requestExport });
    await click(fixture, el, 'Exporter mes dossiers');
    expect(requestExport).not.toHaveBeenCalled();
    expect(el.querySelector('#field-email-error')?.textContent).toContain('obligatoire');
  });

  it('202 → job en attente (aria-live), bouton aria-disabled avec note ; puis prêt avec lien jusqu’au…', async () => {
    const exportStatus = vi
      .fn()
      .mockResolvedValueOnce({ ...DONE, status: 'queued', downloadUrl: null, expiresAt: null })
      .mockResolvedValue(DONE);
    const { fixture, el, store } = await render({
      requestExport: vi.fn().mockResolvedValue({ kind: 'requested', jobId: 'job-1', token: 't' }),
      exportStatus,
    });
    fillCredentials(el);
    await click(fixture, el, 'Exporter mes dossiers');
    expect(el.querySelector('.job')?.getAttribute('aria-live')).toBe('polite');
    expect(el.querySelector('.job .pill')?.textContent).toContain('En attente');
    const button = el.querySelector<HTMLButtonElement>('#export-button');
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    expect(button?.getAttribute('aria-describedby')).toBe('export-note');
    expect(el.querySelector('#export-note')?.textContent).toContain('Un seul export à la fois');

    await store.refreshExport();
    await fixture.whenStable();
    expect(el.querySelector('.job .pill')?.textContent).toContain('Prêt');
    expect(el.querySelector('.job')?.textContent).toContain("Lien valable jusqu'au");
    expect(el.querySelector('button.download')).not.toBeNull();
    expect(button?.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('running → barre de progression indéterminée', async () => {
    const { fixture, el } = await render({
      requestExport: vi.fn().mockResolvedValue({ kind: 'requested', jobId: 'job-1', token: 't' }),
      exportStatus: vi.fn().mockResolvedValue({ ...DONE, status: 'running', downloadUrl: null }),
    });
    fillCredentials(el);
    await click(fixture, el, 'Exporter mes dossiers');
    expect(el.querySelector('.job .pill')?.textContent).toContain('En préparation');
    expect(el.querySelector('mat-progress-bar')).not.toBeNull();
  });

  it('410 au téléchargement → ligne « Expiré » avec Relancer, sans erreur bloquante', async () => {
    const { fixture, el } = await render({
      requestExport: vi.fn().mockResolvedValue({ kind: 'requested', jobId: 'job-1', token: 't' }),
      exportStatus: vi.fn().mockResolvedValue(DONE),
      downloadExport: vi.fn().mockRejectedValue({ status: 410, code: 'EXPORT_EXPIRED' }),
    });
    fillCredentials(el);
    await click(fixture, el, 'Exporter mes dossiers');
    await click(fixture, el, "Télécharger l'archive");
    expect(el.querySelector('.job .pill')?.textContent).toContain('Expiré');
    expect(el.querySelector('.job')?.textContent).toContain('a expiré (7 jours)');
    expect(el.querySelector('[role=alert]')).toBeNull();
    await click(fixture, el, 'Relancer');
    expect(el.querySelector('.job .row')).toBeNull();
    expect(sessionStorage.getItem(EXPORT_JOB_STORAGE_KEY)).toBeNull();
  });

  it('done sans lien (déjà expiré au retour sur la page) → « Expiré »', async () => {
    sessionStorage.setItem(EXPORT_JOB_STORAGE_KEY, JSON.stringify({ jobId: 'job-1', token: 't' }));
    TestBed.configureTestingModule({
      imports: [SuspendedPage],
      providers: [
        provideRouter([]),
        {
          provide: SuspendedApi,
          useValue: { exportStatus: vi.fn().mockResolvedValue({ ...DONE, downloadUrl: null }) },
        },
        { provide: SessionApi, useValue: { me: vi.fn().mockResolvedValue(null) } },
      ],
    });
    const fixture = TestBed.createComponent(SuspendedPage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.job .pill')?.textContent).toContain('Expiré');
  });

  it('failed → « Échec » avec le message et Relancer', async () => {
    const { fixture, el } = await render({
      requestExport: vi.fn().mockResolvedValue({ kind: 'requested', jobId: 'job-1', token: 't' }),
      exportStatus: vi
        .fn()
        .mockResolvedValue({ ...DONE, status: 'failed', downloadUrl: null, error: 'disk full' }),
    });
    fillCredentials(el);
    await click(fixture, el, 'Exporter mes dossiers');
    expect(el.querySelector('.job .pill')?.textContent).toContain('Échec');
    expect(el.querySelector('.job')?.textContent).toContain('disk full');
    expect(el.querySelector('.job button')?.textContent).toContain('Relancer');
  });

  it('suivi en erreur sans donnée → pm-state erreur avec Réessayer', async () => {
    const exportStatus = vi
      .fn()
      .mockRejectedValueOnce({ status: 0, code: 'NETWORK_ERROR' })
      .mockResolvedValueOnce(DONE);
    const { fixture, el } = await render({
      requestExport: vi.fn().mockResolvedValue({ kind: 'requested', jobId: 'job-1', token: 't' }),
      exportStatus,
    });
    fillCredentials(el);
    await click(fixture, el, 'Exporter mes dossiers');
    expect(el.querySelector('pm-state [role=alert]')?.textContent).toContain(
      "Impossible de lire l'état de l'export",
    );
    await click(fixture, el, 'Réessayer');
    expect(el.querySelector('.job .pill')?.textContent).toContain('Prêt');
  });

  it('401 → message unique ; 409 ACCOUNT_NOT_SUSPENDED → message et lien Se connecter', async () => {
    const requestExport = vi
      .fn()
      .mockRejectedValueOnce({ status: 401, code: 'INVALID_CREDENTIALS' })
      .mockRejectedValueOnce({ status: 409, code: 'ACCOUNT_NOT_SUSPENDED' });
    const { fixture, el } = await render({ requestExport });
    fillCredentials(el);
    await click(fixture, el, 'Exporter mes dossiers');
    expect(el.querySelector('.export [role=alert]')?.textContent).toContain(
      'E-mail, mot de passe ou code incorrect.',
    );
    await click(fixture, el, 'Exporter mes dossiers');
    const alert = el.querySelector('.export [role=alert]');
    expect(alert?.textContent).toContain('connectez-vous normalement');
    expect(alert?.querySelector('a')?.textContent).toContain('Se connecter');
  });

  it('409 EXPORT_IN_PROGRESS → « déjà en préparation »', async () => {
    const { fixture, el } = await render({
      requestExport: vi.fn().mockRejectedValue({ status: 409, code: 'EXPORT_IN_PROGRESS' }),
    });
    fillCredentials(el);
    await click(fixture, el, 'Exporter mes dossiers');
    expect(el.querySelector('.export [role=alert]')?.textContent).toContain('déjà en préparation');
  });

  it('202 otpRequired → champ code (one-time-code) ; le code part avec la requête suivante', async () => {
    const requestExport = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'otp-required' })
      .mockResolvedValueOnce({ kind: 'requested', jobId: 'job-1', token: 't' });
    const { fixture, el } = await render({
      requestExport,
      exportStatus: vi.fn().mockResolvedValue(DONE),
    });
    fillCredentials(el);
    await click(fixture, el, 'Exporter mes dossiers');
    const otp = el.querySelector<HTMLInputElement>('#field-otp');
    expect(otp?.getAttribute('autocomplete')).toBe('one-time-code');
    type(el, 'field-otp', '123456');
    await click(fixture, el, 'Exporter mes dossiers');
    expect(requestExport).toHaveBeenLastCalledWith({
      email: 'marc@example.test',
      password: 'Secret-Clinique-2026',
      otp: '123456',
    });
  });

  it('423 → bouton aria-disabled et compte à rebours', async () => {
    const { fixture, el } = await render({
      requestExport: vi
        .fn()
        .mockRejectedValue({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 900 }),
    });
    fillCredentials(el);
    await click(fixture, el, 'Exporter mes dossiers');
    expect(el.querySelector('#export-button')?.getAttribute('aria-disabled')).toBe('true');
    expect(el.querySelector('#export-note')?.textContent).toContain("Trop d'essais");
  });
});

describe('SuspendedPage · recours', () => {
  it('message trop court : rien ne part (20 caractères au moins), compteur affiché', async () => {
    const submitAppeal = vi.fn();
    const { fixture, el } = await render({ submitAppeal });
    fillCredentials(el);
    type(el, 'field-message', 'Trop court.');
    await click(fixture, el, 'Envoyer le recours');
    expect(submitAppeal).not.toHaveBeenCalled();
    expect(el.querySelector('#field-message-error')?.textContent).toContain('Au moins 20');
    expect(el.querySelector('#message-count')?.textContent).toContain('11 / 4000');
  });

  it('201 → le formulaire laisse place à « Recours envoyé le … »', async () => {
    const submitAppeal = vi
      .fn()
      .mockResolvedValue({ kind: 'submitted', id: 'a1', submittedAt: '2026-11-07T10:05:00Z' });
    const { fixture, el } = await render({ submitAppeal });
    fillCredentials(el);
    type(el, 'field-message', MESSAGE);
    await click(fixture, el, 'Envoyer le recours');
    expect(submitAppeal).toHaveBeenCalledWith(
      { email: 'marc@example.test', password: 'Secret-Clinique-2026' },
      MESSAGE,
    );
    expect(el.querySelector('form.appeal')).toBeNull();
    const status = el.querySelector('aside .appeal-card [role=status]');
    expect(status?.textContent).toContain('Recours envoyé le');
    expect(status?.textContent).toContain('2026');
  });

  it('409 APPEAL_ALREADY_OPEN → « Un recours est déjà en cours », formulaire remplacé', async () => {
    const { fixture, el } = await render({
      submitAppeal: vi.fn().mockRejectedValue({ status: 409, code: 'APPEAL_ALREADY_OPEN' }),
    });
    fillCredentials(el);
    type(el, 'field-message', MESSAGE);
    await click(fixture, el, 'Envoyer le recours');
    expect(el.querySelector('form.appeal')).toBeNull();
    expect(el.querySelector('aside .appeal-card [role=status]')?.textContent).toContain(
      "Un recours est déjà en cours d'examen",
    );
  });

  it('422 TOO_SHORT du serveur relié au champ message', async () => {
    const { fixture, el } = await render({
      submitAppeal: vi.fn().mockRejectedValue({
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'message', code: 'TOO_SHORT', message: 'Vingt caractères au moins.' }],
      }),
    });
    fillCredentials(el);
    type(el, 'field-message', MESSAGE);
    await click(fixture, el, 'Envoyer le recours');
    expect(el.querySelector('#field-message-error')?.textContent).toBe(
      'Vingt caractères au moins.',
    );
    expect(el.querySelector('form.appeal')).not.toBeNull();
  });

  it('401 → message unique sous le formulaire, qui reste', async () => {
    const { fixture, el } = await render({
      submitAppeal: vi.fn().mockRejectedValue({ status: 401, code: 'INVALID_CREDENTIALS' }),
    });
    fillCredentials(el);
    type(el, 'field-message', MESSAGE);
    await click(fixture, el, 'Envoyer le recours');
    expect(el.querySelector('form.appeal [role=alert]')?.textContent).toContain(
      'E-mail, mot de passe ou code incorrect.',
    );
  });
});
