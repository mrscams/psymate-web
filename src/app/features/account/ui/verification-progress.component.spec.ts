import { TestBed } from '@angular/core/testing';

import { VerificationStatus } from '../../../core/auth';
import { VerificationProgressComponent } from './verification-progress.component';

async function render(status: VerificationStatus, documentCount = 0, missingCount = 2) {
  TestBed.configureTestingModule({ imports: [VerificationProgressComponent] });
  const fixture = TestBed.createComponent(VerificationProgressComponent);
  fixture.componentRef.setInput('status', status);
  fixture.componentRef.setInput('documentCount', documentCount);
  fixture.componentRef.setInput('missingCount', missingCount);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('VerificationProgressComponent', () => {
  it('docs_pending : quatre jalons, le troisième courant (aria-current=step)', async () => {
    const el = await render('docs_pending', 1, 1);
    const items = el.querySelectorAll('ol[aria-label] li');
    expect(items).toHaveLength(4);
    expect(items[2].getAttribute('aria-current')).toBe('step');
    expect(items[2].textContent).toContain('1 déposés · 1 manquant(s)');
    expect(items[3].classList.contains('todo')).toBe(true);
  });

  it('under_review : justificatifs faits, validation courante', async () => {
    const el = await render('under_review', 2, 0);
    const items = el.querySelectorAll('li');
    expect(items[2].classList.contains('done')).toBe(true);
    expect(items[3].getAttribute('aria-current')).toBe('step');
  });

  it('approved : tout est fait', async () => {
    const el = await render('approved', 2, 0);
    expect(el.querySelectorAll('li.done')).toHaveLength(4);
    expect(el.querySelector('[aria-current]')).toBeNull();
  });
});
