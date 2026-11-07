import { TestBed } from '@angular/core/testing';

import { VerificationDocument } from '../data/verification.api';
import { DocumentListComponent } from './document-list.component';

const docs: VerificationDocument[] = [
  {
    id: 'd1',
    type: 'diploma',
    title: 'Master 2 Psychologie clinique',
    issuer: 'Université Lyon 2',
    year: 2014,
    mime: 'application/pdf',
    sizeBytes: 1_900_000,
    uploadedAt: '2026-10-24T09:00:00Z',
    reviewedStatus: 'pending',
    purged: false,
  },
  {
    id: 'd2',
    type: 'identity',
    title: 'CNI',
    issuer: null,
    year: null,
    mime: 'image/png',
    sizeBytes: 420_000,
    uploadedAt: '2026-10-25T09:00:00Z',
    reviewedStatus: 'non_conform',
    purged: false,
  },
];

async function render(editable: boolean) {
  TestBed.configureTestingModule({ imports: [DocumentListComponent] });
  const fixture = TestBed.createComponent(DocumentListComponent);
  fixture.componentRef.setInput('documents', docs);
  fixture.componentRef.setInput('editable', editable);
  const removed: string[] = [];
  fixture.componentInstance.remove.subscribe((id) => removed.push(id));
  await fixture.whenStable();
  return { el: fixture.nativeElement as HTMLElement, removed };
}

describe('DocumentListComponent', () => {
  it('chaque document : intitulé · établissement · année, type, taille, statut', async () => {
    const { el } = await render(true);
    const items = el.querySelectorAll('li.document');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Master 2 Psychologie clinique');
    expect(items[0].textContent).toContain('Université Lyon 2');
    expect(items[0].textContent).toContain('2014');
    expect(items[0].textContent).toContain('Diplôme');
    expect(items[0].textContent).toMatch(/1,8 Mo/);
    expect(items[0].querySelector('.status')?.textContent).toContain('En attente');
    expect(items[1].querySelector('.status')?.textContent).toContain('Non conforme');
    expect(items[1].textContent).toMatch(/410 Ko/);
  });

  it('Retirer nomme le document et émet son identifiant', async () => {
    const { el, removed } = await render(true);
    const button = el.querySelector<HTMLButtonElement>('li.document button.remove');
    expect(button?.getAttribute('aria-label')).toBe('Retirer Master 2 Psychologie clinique');
    button?.click();
    expect(removed).toEqual(['d1']);
  });

  it('dossier verrouillé : aucun bouton Retirer', async () => {
    const { el } = await render(false);
    expect(el.querySelector('button.remove')).toBeNull();
    expect(el.querySelectorAll('li.document')).toHaveLength(2);
  });
});
