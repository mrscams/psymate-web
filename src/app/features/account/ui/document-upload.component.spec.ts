import { TestBed } from '@angular/core/testing';

import { UploadState } from '../data/verification.store';
import {
  checkFile,
  DocumentUploadComponent,
  DocumentUploadRequest,
} from './document-upload.component';

const IDLE: UploadState = { status: 'idle', percent: 0, problem: null };

async function render(state: UploadState = IDLE, disabled = false) {
  TestBed.configureTestingModule({ imports: [DocumentUploadComponent] });
  const fixture = TestBed.createComponent(DocumentUploadComponent);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('disabled', disabled);
  const emitted: DocumentUploadRequest[] = [];
  fixture.componentInstance.upload.subscribe((request) => emitted.push(request));
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, emitted };
}

function setFile(el: HTMLElement, file: File): void {
  const input = el.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('champ fichier absent');
  // jsdom n'a pas de DataTransfer : on pose la liste de fichiers directement.
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
}

function fill(el: HTMLElement, id: string, value: string): void {
  const field = el.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  if (!field) throw new Error(`champ absent : ${id}`);
  field.value = value;
  field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input'));
}

const pdf = (size: number) =>
  new File([new Uint8Array(size)], 'diplome.pdf', { type: 'application/pdf' });

describe('checkFile', () => {
  it('10 Mo passe, 11 Mo non ; formats par type MIME ou extension', () => {
    expect(checkFile(pdf(10 * 1024 * 1024))).toBeNull();
    expect(checkFile(pdf(11 * 1024 * 1024))).toBe('tooLarge');
    expect(checkFile(new File(['x'], 'a.exe', { type: 'application/x-msdownload' }))).toBe(
      'unsupported',
    );
    expect(checkFile(new File(['x'], 'a.jpg', { type: '' }))).toBeNull();
    expect(checkFile(null)).toBeNull();
  });
});

describe('DocumentUploadComponent', () => {
  it('input type=file réel avec label, types acceptés, liste des six types', async () => {
    const { el } = await render();
    const input = el.querySelector<HTMLInputElement>('input[type=file]');
    expect(input?.accept).toBe('application/pdf,image/jpeg,image/png');
    expect(el.querySelector(`label[for="${input?.id}"]`)).not.toBeNull();
    expect(el.querySelectorAll('select option:not([disabled])')).toHaveLength(6);
  });

  it('UX-C2 : champ fichier masqué (sr-only) mais focalisable, libellé « Choisir un fichier »', async () => {
    const { el } = await render();
    const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
    expect(input.classList.contains('sr-only')).toBe(true);
    expect(input.hidden).toBe(false);
    expect(input.tabIndex).toBe(0);
    const label = el.querySelector(`label[for="${input.id}"]`)!;
    expect(label.textContent).toContain('Choisir un fichier');
    expect(label.textContent).toContain('ou glissez-le ici');
    expect(el.querySelector('.file-name')?.textContent).toContain('Aucun fichier choisi.');
  });

  it('UX-C2 : le fichier choisi s’affiche en mono, relié au champ', async () => {
    const { fixture, el } = await render();
    setFile(el, pdf(1024));
    await fixture.whenStable();
    const name = el.querySelector('#field-document-file-name')!;
    expect(name.querySelector('.mono')?.textContent).toBe('diplome.pdf');
    expect(el.querySelector('input[type=file]')?.getAttribute('aria-describedby')).toContain(
      'field-document-file-name',
    );
  });

  it('PDF de 11 Mo : message sous le champ, rien n’est émis', async () => {
    const { fixture, el, emitted } = await render();
    fill(el, 'field-document-type', 'diploma');
    fill(el, 'field-document-title', 'Master 2');
    setFile(el, pdf(11 * 1024 * 1024));
    await fixture.whenStable();
    expect(el.querySelector('#field-document-file-error')?.textContent).toContain('dépasse 10 Mo');
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await fixture.whenStable();
    expect(emitted).toHaveLength(0);
  });

  it('formulaire valide : émet type, intitulé, établissement, année et le fichier', async () => {
    const { fixture, el, emitted } = await render();
    fill(el, 'field-document-type', 'diploma');
    fill(el, 'field-document-title', ' Master 2 ');
    fill(el, 'field-document-issuer', 'Lyon 2');
    fill(el, 'field-document-year', '2014');
    const file = pdf(1024);
    setFile(el, file);
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await fixture.whenStable();
    expect(emitted).toEqual([
      { input: { type: 'diploma', title: 'Master 2', issuer: 'Lyon 2', year: '2014' }, file },
    ]);
  });

  it('sans fichier : « Choisissez un fichier », rien n’est émis', async () => {
    const { fixture, el, emitted } = await render();
    fill(el, 'field-document-type', 'identity');
    fill(el, 'field-document-title', 'CNI');
    el.querySelector<HTMLButtonElement>('button[type=submit]')?.click();
    await fixture.whenStable();
    expect(el.querySelector('#field-document-file-error')?.textContent).toContain(
      'Choisissez un fichier',
    );
    expect(emitted).toHaveLength(0);
  });

  it('415 du serveur : message format sous le champ ; 413 : message taille', async () => {
    const { fixture, el } = await render({
      status: 'error',
      percent: 0,
      problem: { status: 415, code: 'DOCUMENT_UNSUPPORTED' },
    });
    expect(el.querySelector('#field-document-file-error')?.textContent).toContain(
      'PDF, JPEG et PNG',
    );
    fixture.componentRef.setInput('state', {
      status: 'error',
      percent: 0,
      problem: { status: 413, code: 'DOCUMENT_TOO_LARGE' },
    });
    await fixture.whenStable();
    expect(el.querySelector('#field-document-file-error')?.textContent).toContain('dépasse 10 Mo');
  });

  it('422 sur un champ : message du serveur sous ce champ', async () => {
    // Le 422 arrive après le rendu (réponse à Ajouter au dossier), jamais à la création.
    const { fixture, el } = await render();
    fixture.componentRef.setInput('state', {
      status: 'error',
      percent: 0,
      problem: {
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'year', code: 'INVALID_YEAR', message: 'Année hors de 1950 à 2100.' }],
      },
    });
    await fixture.whenStable();
    expect(el.querySelector('#field-document-year-error')?.textContent).toContain(
      'Année hors de 1950 à 2100.',
    );
    expect(el.querySelector('#field-document-file-error')).toBeNull();
  });

  it('envoi en cours : barre de progression et bouton désactivé', async () => {
    const { el } = await render({ status: 'uploading', percent: 42, problem: null });
    expect(el.querySelector<HTMLProgressElement>('progress')?.value).toBe(42);
    expect(el.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true);
  });

  it('verrou : tout le formulaire est désactivé', async () => {
    const { el } = await render(IDLE, true);
    expect(el.querySelector<HTMLInputElement>('input[type=file]')?.disabled).toBe(true);
    expect(el.querySelector<HTMLSelectElement>('select')?.disabled).toBe(true);
  });
});
