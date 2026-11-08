import { OverlayContainer } from '@angular/cdk/overlay';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ExportedFile, PatientExportApi } from '../data/patient-export.api';
import { PatientExportMenuComponent } from './export-menu.component';

async function render(api: Partial<PatientExportApi>, compact = false) {
  TestBed.configureTestingModule({
    imports: [PatientExportMenuComponent],
    providers: [provideRouter([]), { provide: PatientExportApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(PatientExportMenuComponent);
  fixture.componentRef.setInput('patientId', 'p-1');
  fixture.componentRef.setInput('compact', compact);
  await settle(fixture);
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    overlay: TestBed.inject(OverlayContainer).getContainerElement(),
  };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

function trigger(el: HTMLElement): HTMLButtonElement {
  const button = el.querySelector<HTMLButtonElement>('button.trigger');
  if (!button) throw new Error('déclencheur absent');
  return button;
}

function item(overlay: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...overlay.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find((b) =>
    b.textContent?.includes(label),
  );
}

describe('PatientExportMenuComponent', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('bouton « Exporter ce dossier » : aria-haspopup menu, menu PDF / Markdown, note privées exclues', async () => {
    const { fixture, el, overlay } = await render({ exportPatient: vi.fn() });
    const button = trigger(el);
    expect(button.textContent).toContain('Exporter ce dossier');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(el.textContent).toContain('Entrées privées exclues');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/mon-compte/donnees');

    button.click();
    await settle(fixture);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(overlay.querySelector('[role=menu]')).not.toBeNull();
    expect(overlay.querySelectorAll('[role=menuitem]')).toHaveLength(2);
    expect(item(overlay, 'PDF')).toBeDefined();
    expect(item(overlay, 'Markdown')).toBeDefined();
  });

  it('Markdown : GET …/export?format=md puis enregistrement du fichier reçu', async () => {
    const file = { blob: new Blob(['# Marie D.']), fileName: 'export-marie-d-20261107.md' };
    const exportPatient = vi.fn().mockResolvedValue(file);
    const { fixture, el, overlay } = await render({ exportPatient });

    trigger(el).click();
    await settle(fixture);
    item(overlay, 'Markdown')?.click();
    await settle(fixture);

    expect(exportPatient).toHaveBeenCalledWith('p-1', 'md');
    expect(URL.createObjectURL).toHaveBeenCalledWith(file.blob);
    expect(el.querySelector('[role=alert]')).toBeNull();
  });

  it('pendant la génération : bouton inactif et statut annoncé ; erreur 500 → message', async () => {
    let fail: (reason: unknown) => void = () => undefined;
    const exportPatient = vi.fn(() => new Promise<ExportedFile>((_, reject) => (fail = reject)));
    const { fixture, el, overlay } = await render({ exportPatient });

    trigger(el).click();
    await settle(fixture);
    item(overlay, 'PDF')?.click();
    await settle(fixture);

    expect(trigger(el).disabled).toBe(true);
    expect(el.querySelector('[role=status]')?.textContent).toContain('Préparation du fichier');

    fail({ status: 500, code: 'INTERNAL_ERROR' });
    await settle(fixture);

    expect(trigger(el).disabled).toBe(false);
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'La génération du fichier a échoué',
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('compact : bouton et menu seulement, sans les notes', async () => {
    const { el } = await render({ exportPatient: vi.fn() }, true);
    expect(trigger(el)).toBeDefined();
    expect(el.textContent).not.toContain('Entrées privées exclues');
  });
});
