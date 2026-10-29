import { Component } from '@angular/core';

// Placeholder for the clinician caseload overview: action strip (high-risk, not-on-track,
// overdue measures, today's sessions) above a patient table sorted by "needs attention".
@Component({
  selector: 'app-caseload',
  template: `
    <h2>Caseload</h2>
    <p class="hint">Patient list and triage counts will appear here.</p>
  `,
  styles: `.hint { color: var(--text-muted); }`,
})
export class Caseload {}
