import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { subjectLabel, SubjectLabelPipe, SubjectVocabulary } from './subject-label';

@Component({
  selector: 'pm-subject-host',
  imports: [SubjectLabelPipe],
  template: `<p>{{ 'Many' | subjectLabel }} · {{ 'one' | subjectLabel }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HostComponent {}

describe('subjectLabel', () => {
  it('quatre formes pour chaque désignation', () => {
    expect(subjectLabel('patient', 'one')).toBe('patient');
    expect(subjectLabel('patient', 'Many')).toBe('Patients');
    expect(subjectLabel('client', 'many')).toBe('clients');
    expect(subjectLabel('client', 'One')).toBe('Client');
  });

  it('le pipe suit le vocabulaire sans rechargement', async () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const text = (): string => fixture.nativeElement.textContent.trim();
    expect(text()).toBe('Patients · patient');

    TestBed.inject(SubjectVocabulary).set('client');
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(text()).toBe('Clients · client');
  });
});
