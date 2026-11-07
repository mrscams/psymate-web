import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  LOCALE_ID,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { VerificationStatus } from '../core/auth';
import { ApiProblem, HttpNotices } from '../core/http';
import { SubjectLabelPipe, SubjectVocabulary, toAppLocale } from '../core/i18n';
import { ShortcutService } from '../core/shortcuts';
import { THEME_PREFERENCES, ThemePreference, ThemeService } from '../core/theme';
import {
  applyProblem,
  FieldErrorsComponent,
  fieldId,
  PmValidators,
  ProblemSummaryComponent,
} from '../shared/forms';
import {
  AccountNavComponent,
  AdminBarComponent,
  AppBarComponent,
  ConfirmDialogService,
  ENTRY_TYPES,
  EntryIconComponent,
  entryTypeLabel,
  PatientHeaderComponent,
  PatientHeaderInfo,
  PublicLayoutComponent,
  SidePanelService,
  StateComponent,
  StatusBannerComponent,
  ToastService,
  VerificationBannerComponent,
} from '../shared/ui';
import { formatOccurred, OCCURRED_PRECISIONS } from '../shared/util';
import { DemoEntryPanelComponent, DemoHelpPanelComponent } from './demo-panels';

const PROBLEM_422: ApiProblem = {
  status: 422,
  code: 'VALIDATION_FAILED',
  errors: [
    { field: 'displayName', code: 'REQUIRED', message: 'Le nom affiché est obligatoire.' },
    {
      field: 'birthDate',
      code: 'INVALID_VALUE',
      message: 'La date de naissance ne peut pas être dans le futur.',
    },
  ],
};

/**
 * /_demo : chaque composant partagé dans ses états, pour la revue visuelle et axe-core (critères de
 * la fiche 00 et de C10 M0-09). Hors du produit : aucun lien n'y mène, la route est chargée à part.
 */
@Component({
  selector: 'pm-demo-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    SubjectLabelPipe,
    FieldErrorsComponent,
    ProblemSummaryComponent,
    AccountNavComponent,
    AdminBarComponent,
    AppBarComponent,
    EntryIconComponent,
    PatientHeaderComponent,
    PublicLayoutComponent,
    StateComponent,
    StatusBannerComponent,
    VerificationBannerComponent,
  ],
  templateUrl: './demo.page.html',
  styleUrl: './demo.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoPage {
  protected readonly theme = inject(ThemeService);
  protected readonly vocabulary = inject(SubjectVocabulary);
  protected readonly notices = inject(HttpNotices);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly panels = inject(SidePanelService);
  private readonly locale = toAppLocale(inject(LOCALE_ID));

  protected readonly themes = THEME_PREFERENCES;
  protected readonly entryTypes = ENTRY_TYPES;
  protected readonly entryTypeLabel = entryTypeLabel;
  protected readonly switchLang = this.locale === 'fr' ? 'en' : 'fr';
  protected readonly switchHref = `/${this.switchLang}/_demo`;

  protected readonly verificationStatus = signal<VerificationStatus>('under_review');
  protected readonly sessionCurrent = signal(false);
  protected readonly lastConfirm = signal<string>('');
  protected readonly lastPanel = signal<string>('');

  protected readonly marie: PatientHeaderInfo = {
    id: 'demo',
    displayName: 'Marie D.',
    birthDate: '1992-05-10',
    followedSince: '2025-03-04T00:00:00Z',
    flags: [{ code: 'watch', label: 'à surveiller' }],
  };
  protected readonly startedAt = new Date(Date.now() - 18 * 60_000).toISOString();

  protected readonly occurredExamples = OCCURRED_PRECISIONS.map((precision) => ({
    precision,
    text: formatOccurred(
      {
        from: '2026-10-20T19:00:00Z',
        to: precision === 'exact' ? '2026-10-20T20:00:00Z' : '2026-11-01T00:00:00Z',
        precision,
        label:
          precision === 'period' ? 'rentrée 2026' : precision === 'life_phase' ? 'enfance' : null,
      },
      this.locale,
    ),
  }));

  protected readonly form = inject(NonNullableFormBuilder).group({
    displayName: ['Marie D.', [Validators.required, Validators.maxLength(120)]],
    birthDate: ['1992-05-10', [PmValidators.date, PmValidators.notFutureDate()]],
  });
  protected readonly fieldId = fieldId;
  protected readonly formLabels = { displayName: 'Nom affiché', birthDate: 'Date de naissance' };
  protected readonly problem = signal<ApiProblem | null>(null);

  protected readonly noop = (): void => undefined;

  constructor() {
    const shortcuts = inject(ShortcutService);
    const release = shortcuts.register('?', () => this.openHelp());
    inject(DestroyRef).onDestroy(release);
  }

  protected setTheme(theme: ThemePreference): void {
    this.theme.set(theme);
  }

  protected toast(level: 'success' | 'info' | 'warning'): void {
    const message = {
      success: 'Entrée enregistrée',
      info: "Vue d'ensemble en cours de mise à jour, quelques secondes",
      warning: 'Dossier en cours de vérification',
    }[level];
    this.toasts.show({
      level,
      message,
      action: level === 'success' ? { label: 'Annuler', handler: this.noop } : undefined,
    });
  }

  protected async confirmSimple(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Supprimer le patient démo ?',
      description: 'Les 20 séances fictives disparaissent. Vos vrais patients ne bougent pas.',
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    this.lastConfirm.set(ok ? 'confirmé' : 'annulé');
  }

  protected async confirmWord(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Archiver Marie D. ?',
      description:
        'Le dossier passe en lecture seule dans « Archivés ». Aucune entrée ni aucun lien n’est perdu.',
      confirmLabel: 'Archiver',
      destructive: true,
      confirmWord: 'Marie D.',
    });
    this.lastConfirm.set(ok ? 'confirmé' : 'annulé');
  }

  protected openPanel(): void {
    const ref = this.panels.open<DemoEntryPanelComponent, { title: string }, string>(
      DemoEntryPanelComponent,
      { data: { title: 'Nouvelle entrée' } },
    );
    void ref?.closed.then(() => this.lastPanel.set('fermé'));
    this.lastPanel.set('ouvert');
  }

  protected openHelp(): void {
    this.panels.open(DemoHelpPanelComponent, { width: 420 });
  }

  protected simulate422(): void {
    const { unmatched } = applyProblem(this.form, PROBLEM_422);
    this.problem.set({ ...PROBLEM_422, errors: [...(PROBLEM_422.errors ?? []), ...unmatched] });
  }

  protected clearProblem(): void {
    applyProblem(this.form, null);
    this.problem.set(null);
  }

  protected toggleOffline(): void {
    if (this.notices.offline()) this.notices.backOnline();
    else this.notices.wentOffline();
  }
}
