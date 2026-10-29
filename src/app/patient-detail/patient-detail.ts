import { Component, input } from '@angular/core';

// Placeholder for the single-patient view: header, "since last session" summary,
// PHQ-9/GAD-7 trends, daily signals, treatment plan, medications and timeline.
@Component({
  selector: 'app-patient-detail',
  template: `
    <h2>Patient {{ id() }}</h2>
    <p class="hint">Patient summary and outcome trends will appear here.</p>
  `,
  styles: `.hint { color: var(--text-muted); }`,
})
export class PatientDetail {
  readonly id = input.required<string>();
}
