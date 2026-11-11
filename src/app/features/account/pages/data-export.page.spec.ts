import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SessionStore } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { ConfirmDialogService } from '../../../shared/ui';
import { DataExportApi } from '../data/data-export.api';
import {
  EXPORT_USER,
  JOB_DONE,
  JOB_QUEUED,
  JOB_RUNNING,
  PATIENT_OPTIONS,
} from '../data/data-export.fixtures';
import { EXPORT_JOB_STORAGE_KEY } from '../data/export.store';
import { DataExportPage, EXPORT_POLL_MS } from './data-export.page';

const never = () => new Promise<never>(() => undefined);

async function render(api: Partial<DataExportApi>, confirm = vi.fn().mockResolvedValue(true)) {
  TestBed.configureTestingModule({
    imports: [DataExportPage],
    providers: [
      provideRouter([]),
      {
        provide: DataExportApi,
        useValue: { searchPatients: vi.fn().mockResolvedValue([]), ...api },
      },
      { provide: SessionApi, useValue: { me: vi.fn().mockResolvedValue(EXPORT_USER) } },
      { provide: ConfirmDialogService, useValue: { confirm } },
    ],
  });
  TestBed.inject(SessionStore).signIn(EXPORT_USER);
  const fixture = TestBed.createComponent(DataExportPage);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, confirm };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

function button(el: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

function remember(jobId = 'job-1'): void {
  localStorage.setItem(EXPORT_JOB_STORAGE_KEY, JSON.stringify({ jobId, owner: 'user-1' }));
}

function key(target: HTMLElement, name: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
}

describe('DataExportPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('chargement : squelettes des deux blocs (patients, dernier export), navigation Mon compte', async () => {
    remember();
    const { el } = await render({ searchPatients: vi.fn(never), exportStatus: vi.fn(never) });
    expect(el.querySelectorAll('pm-state [aria-busy="true"]')).toHaveLength(2);
    expect(el.querySelector('nav[aria-label="Mon compte"]')).not.toBeNull();
    expect(el.querySelector('h1')?.textContent).toContain('Données et export');
  });

  it('erreur : deux blocs en erreur, Réessayer relance la lecture', async () => {
    remember();
    const searchPatients = vi
      .fn()
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce(PATIENT_OPTIONS);
    const exportStatus = vi
      .fn()
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce(JOB_DONE);
    const { fixture, el } = await render({ searchPatients, exportStatus });
    expect(el.querySelectorAll('pm-state [role=alert]')).toHaveLength(2);

    el.querySelectorAll<HTMLButtonElement>('pm-state button').forEach((b) => b.click());
    await settle(fixture);

    expect(searchPatients).toHaveBeenCalledTimes(2);
    expect(exportStatus).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role=combobox]')).not.toBeNull();
    expect(el.textContent).toContain('Prêt');
  });

  it('vide : aucun dossier à exporter, aucun export de compte connu', async () => {
    const { el } = await render({ searchPatients: vi.fn().mockResolvedValue([]) });
    expect(el.textContent).toContain('Aucun dossier à exporter');
    expect(el.textContent).toContain('Aucun export de compte en cours');
    expect(el.querySelector('[role=combobox]')).toBeNull();
    expect(button(el, "Préparer l'export")?.disabled).toBe(false);
  });

  it('export patient au clavier : ↓ Entrée choisit, Markdown, Exporter télécharge le fichier', async () => {
    const file = { blob: new Blob(['# Marie D.']), fileName: 'export-marie-d-20261107.md' };
    const exportPatient = vi.fn().mockResolvedValue(file);
    const { fixture, el } = await render({
      searchPatients: vi.fn().mockResolvedValue(PATIENT_OPTIONS),
      exportPatient,
    });
    const exporter = button(el, 'Exporter');
    expect(exporter?.disabled).toBe(true);
    expect(el.textContent).toContain('Les entrées privées ne sont jamais exportées');

    const input = el.querySelector<HTMLInputElement>('[role=combobox]');
    if (!input) throw new Error('combobox absent');
    key(input, 'ArrowDown');
    fixture.detectChanges();
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const options = el.querySelectorAll('[role=option]');
    expect(options).toHaveLength(3);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[2].classList).toContain('archived');
    expect(options[2].textContent).toContain('archivé');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);

    key(input, 'Enter');
    fixture.detectChanges();
    expect(input.value).toBe('Marie D.');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(exporter?.disabled).toBe(false);

    const markdown = button(el, 'Markdown');
    markdown?.click();
    fixture.detectChanges();
    expect(markdown?.getAttribute('aria-pressed')).toBe('true');
    expect(button(el, 'PDF')?.getAttribute('aria-pressed')).toBe('false');

    exporter?.click();
    await settle(fixture);
    expect(exportPatient).toHaveBeenCalledWith('p-1', 'md');
    expect(URL.createObjectURL).toHaveBeenCalledWith(file.blob);
  });

  it('UX-C6 : aide sous le sélecteur, note du bouton inactif, puis nom du fichier attendu en mono', async () => {
    const { fixture, el } = await render({
      searchPatients: vi.fn().mockResolvedValue(PATIENT_OPTIONS),
    });
    const input = el.querySelector<HTMLInputElement>('[role=combobox]')!;
    const hint = el.querySelector(`#${input.getAttribute('aria-describedby')}`);
    expect(hint?.textContent).toBe('Tapez un nom ; les dossiers archivés sont en gris.');

    const exporter = button(el, 'Exporter')!;
    expect(exporter.disabled).toBe(true);
    expect(exporter.getAttribute('aria-describedby')).toBe('export-choose');
    expect(el.querySelector('#export-choose')?.textContent).toBe(
      'Choisissez un patient pour exporter.',
    );

    key(input, 'ArrowDown');
    fixture.detectChanges();
    key(input, 'Enter');
    fixture.detectChanges();
    expect(exporter.getAttribute('aria-describedby')).toBe('export-file');
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    expect(el.querySelector('#export-file .mono')?.textContent).toBe(`export-marie-d-${today}.pdf`);
    button(el, 'Markdown')?.click();
    fixture.detectChanges();
    expect(el.querySelector('#export-file .mono')?.textContent).toBe(`export-marie-d-${today}.md`);
  });

  it('export patient refusé (403) : message sous le bouton, rien n’est téléchargé', async () => {
    const { fixture, el } = await render({
      searchPatients: vi.fn().mockResolvedValue(PATIENT_OPTIONS),
      exportPatient: vi.fn().mockRejectedValue({ status: 403, code: 'UNKNOWN_ERROR' }),
    });
    const input = el.querySelector<HTMLInputElement>('[role=combobox]');
    if (!input) throw new Error('combobox absent');
    key(input, 'ArrowDown');
    key(input, 'Enter');
    fixture.detectChanges();
    button(el, 'Exporter')?.click();
    await settle(fixture);
    expect(el.querySelector('p[role=alert]')?.textContent).toContain(
      "Ce dossier n'est pas accessible",
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('Préparer l’export → dialogue → Lancer : ligne « En attente », bouton désactivé avec sa note', async () => {
    const requestExport = vi.fn().mockResolvedValue('job-1');
    const { fixture, el, confirm } = await render({
      requestExport,
      exportStatus: vi.fn().mockResolvedValue(JOB_QUEUED),
    });

    button(el, "Préparer l'export")?.click();
    await settle(fixture);

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Préparer l'export du compte",
        confirmLabel: "Lancer l'export",
      }),
    );
    expect(requestExport).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[aria-live=polite]')?.textContent).toContain('En attente');
    const prepare = button(el, "Préparer l'export");
    expect(prepare?.disabled).toBe(true);
    expect(prepare?.getAttribute('aria-describedby')).toBe('prepare-note');
    expect(el.querySelector('#prepare-note')?.textContent).toContain('Un seul export à la fois');
  });

  it('dialogue annulé : aucun POST', async () => {
    const requestExport = vi.fn();
    const { fixture, el } = await render({ requestExport }, vi.fn().mockResolvedValue(false));
    button(el, "Préparer l'export")?.click();
    await settle(fixture);
    expect(requestExport).not.toHaveBeenCalled();
  });

  it('409 EXPORT_IN_PROGRESS : message affiché, Préparer l’export désactivé', async () => {
    const { fixture, el } = await render({
      requestExport: vi.fn().mockRejectedValue({ status: 409, code: 'EXPORT_IN_PROGRESS' }),
    });
    button(el, "Préparer l'export")?.click();
    await settle(fixture);
    expect(el.querySelector('p[role=alert]')?.textContent).toContain(
      'Un export de votre compte est déjà en préparation',
    );
    expect(button(el, "Préparer l'export")?.disabled).toBe(true);
  });

  describe('suivi du job (setTimeout enchaînés, horloge simulée)', () => {
    async function fakeSettle(fixture: ComponentFixture<unknown>): Promise<void> {
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(0);
        await fixture.whenStable();
        fixture.detectChanges();
      }
    }

    async function renderFake(api: Partial<DataExportApi>) {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      TestBed.configureTestingModule({
        imports: [DataExportPage],
        providers: [
          provideRouter([]),
          {
            provide: DataExportApi,
            useValue: { searchPatients: vi.fn().mockResolvedValue([]), ...api },
          },
          { provide: SessionApi, useValue: { me: vi.fn().mockResolvedValue(EXPORT_USER) } },
          { provide: ConfirmDialogService, useValue: { confirm: vi.fn() } },
        ],
      });
      TestBed.inject(SessionStore).signIn(EXPORT_USER);
      const fixture = TestBed.createComponent(DataExportPage);
      await fakeSettle(fixture);
      return { fixture, el: fixture.nativeElement as HTMLElement };
    }

    it('en préparation : indicateur indéterminé, relu 3 s après la réponse, plus rien après done', async () => {
      remember();
      const exportStatus = vi.fn().mockResolvedValueOnce(JOB_RUNNING).mockResolvedValue(JOB_DONE);
      const { fixture, el } = await renderFake({ exportStatus });
      expect(el.querySelector('[role=progressbar]')).not.toBeNull();
      expect(el.textContent).toContain('En préparation');
      expect(exportStatus).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(EXPORT_POLL_MS - 1);
      expect(exportStatus).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await fakeSettle(fixture);

      expect(exportStatus).toHaveBeenCalledTimes(2);
      expect(el.textContent).toContain('Prêt');
      expect(el.querySelector('[role=progressbar]')).toBeNull();

      await vi.advanceTimersByTimeAsync(EXPORT_POLL_MS * 4);
      await fakeSettle(fixture);
      expect(exportStatus).toHaveBeenCalledTimes(2);
    });

    it('en file tant qu’il faut : une lecture toutes les 3 s, arrêt à la sortie de la page', async () => {
      remember();
      const exportStatus = vi.fn().mockResolvedValue(JOB_QUEUED);
      const { fixture } = await renderFake({ exportStatus });

      await vi.advanceTimersByTimeAsync(EXPORT_POLL_MS);
      await fakeSettle(fixture);
      await vi.advanceTimersByTimeAsync(EXPORT_POLL_MS);
      await fakeSettle(fixture);
      expect(exportStatus).toHaveBeenCalledTimes(3);

      fixture.destroy();
      await vi.advanceTimersByTimeAsync(EXPORT_POLL_MS * 4);
      expect(exportStatus).toHaveBeenCalledTimes(3);
    });
  });

  it('Prêt → Télécharger : 410 bascule la ligne en « Expiré » avec « Relancer »', async () => {
    remember();
    const { fixture, el } = await render({
      exportStatus: vi.fn().mockResolvedValue(JOB_DONE),
      downloadExport: vi.fn().mockRejectedValue({ status: 410, code: 'UNKNOWN_ERROR' }),
    });
    expect(el.textContent).toContain('lien valable jusqu');

    button(el, 'Télécharger')?.click();
    await settle(fixture);

    expect(el.textContent).toContain('Expiré');
    expect(button(el, 'Relancer')).toBeDefined();
    expect(button(el, 'Télécharger')).toBeUndefined();
    expect(el.querySelector('p[role=alert]')).toBeNull();
  });
  it('effacer une recherche sans résultat : le sélecteur reste en place et garde le focus', async () => {
    let resolveEmpty: (value: typeof PATIENT_OPTIONS) => void = () => undefined;
    const searchPatients = vi
      .fn()
      .mockResolvedValueOnce(PATIENT_OPTIONS)
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(new Promise((resolve) => (resolveEmpty = resolve)))
      .mockRejectedValueOnce({ status: 503, code: 'INTERNAL_ERROR' });
    const { fixture, el } = await render({ searchPatients });
    const page = fixture.componentInstance as unknown as { search(query: string): void };

    page.search('zzz');
    await settle(fixture);
    const input = el.querySelector<HTMLInputElement>('[role=combobox]');
    input?.focus();

    // Champ effacé : la recherche '' part (chargement, données vides) sans retirer le champ.
    page.search('');
    fixture.detectChanges();
    expect(el.querySelector('[aria-labelledby=patient-export-title] pm-state')).toBeNull();
    expect(el.querySelector('[role=combobox]')).toBe(input);
    expect(document.activeElement).toBe(input);
    resolveEmpty(PATIENT_OPTIONS);
    await settle(fixture);
    expect(el.querySelector('[role=combobox]')).toBe(input);

    // Erreur d'une recherche suivante : message sous le champ, pas de bloc erreur.
    page.search('');
    await settle(fixture);
    expect(el.querySelector('[aria-labelledby=patient-export-title] pm-state')).toBeNull();
    expect(el.querySelector('[role=combobox]')).toBe(input);
    expect(el.querySelector('p[role=alert]')?.textContent).toContain("La recherche n'a pas abouti");
  });

  it('409 pour un job lancé ailleurs : le bloc « Dernier export » ne dit pas « aucun export »', async () => {
    const { fixture, el } = await render({
      requestExport: vi.fn().mockRejectedValue({ status: 409, code: 'EXPORT_IN_PROGRESS' }),
    });
    button(el, "Préparer l'export")?.click();
    await settle(fixture);
    const block = el.querySelector('[aria-live=polite]');
    expect(block?.textContent).toContain('Un export est en préparation ailleurs');
    expect(block?.textContent).not.toContain('Aucun export de compte en cours');
  });

  it('403 au téléchargement (lien signé refusé) : état du job relu, message dédié', async () => {
    remember();
    const exportStatus = vi.fn().mockResolvedValue(JOB_DONE);
    const { fixture, el } = await render({
      exportStatus,
      downloadExport: vi.fn().mockRejectedValue({ status: 403, code: 'UNKNOWN_ERROR' }),
    });
    button(el, 'Télécharger')?.click();
    await settle(fixture);
    expect(exportStatus).toHaveBeenCalledTimes(2);
    expect(el.querySelector('p[role=alert]')?.textContent).toContain(
      "Le lien de téléchargement n'était plus valide",
    );
    expect(button(el, 'Télécharger')).toBeDefined();
  });
});
