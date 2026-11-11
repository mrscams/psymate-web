import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';

import {
  EntryIconComponent,
  entryTypeLabel,
  StateAction,
  StateComponent,
} from '../../../shared/ui';
import { formatOccurred, Loadable, stateKind } from '../../../shared/util';
import { EntryPreview, SearchHit, SessionOption } from '../data/search.model';
import {
  formatDateTime,
  precisionLabel,
  sessionLabel,
  titleOf,
  visibilityLabel,
} from './search-labels';
import { SyntaxHelpComponent } from './syntax-help.component';

/**
 * Aperçu du résultat sélectionné (fiche 07, colonne droite) : type, titre, Quand / Séance / Saisi /
 * Visibilité, texte complet, liens, puis « Ouvrir dans la timeline » (primaire), « Voir dans le
 * graphe », « Modifier » ; pied d'aide clavier et syntaxe. L'entrée est relue en entier
 * (GET /api/entries/{id}) : trois états.
 */
@Component({
  selector: 'pm-search-preview',
  imports: [EntryIconComponent, StateComponent, SyntaxHelpComponent],
  templateUrl: './search-preview.component.html',
  styleUrl: './search-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPreviewComponent {
  readonly hit = input<SearchHit | null>(null);
  readonly preview = input.required<Loadable<EntryPreview>>();
  readonly sessions = input<SessionOption[]>([]);
  readonly openTimeline = output<string>();
  readonly openGraph = output<string>();
  readonly edit = output<string>();
  readonly retry = output<void>();

  private readonly locale = inject(LOCALE_ID);

  /** L'aperçu affiché : celui de l'entrée sélectionnée seulement (jamais un aperçu périmé). */
  protected readonly entry = computed(() => {
    const data = this.preview().data;
    return data && data.id === this.hit()?.entryId ? data : null;
  });

  protected readonly state = computed(() => {
    if (this.entry()) return null;
    const preview = this.preview();
    return stateKind({ ...preview, data: null });
  });

  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton de l'état erreur@@search.preview.retry:Réessayer`,
    handler: () => this.retry.emit(),
  };

  protected readonly typeLabel = entryTypeLabel;

  protected title(entry: EntryPreview): string {
    return titleOf(
      { type: entry.type, title: entry.title, occurredFrom: entry.occurred.from },
      entry.occurred.precision,
      this.locale,
    );
  }

  protected when(entry: EntryPreview): string {
    const text = formatOccurred(entry.occurred, this.locale);
    const precision = precisionLabel(entry.occurred.precision);
    return precision ? `${text} · ${precision}` : text;
  }

  protected session(entry: EntryPreview): string | null {
    if (!entry.sessionId) return null;
    const session = this.sessions().find((item) => item.id === entry.sessionId);
    return session ? sessionLabel(session, this.locale) : null;
  }

  protected recorded(entry: EntryPreview): string {
    return entry.recordedAt ? formatDateTime(entry.recordedAt, this.locale) : '';
  }

  protected visibility = visibilityLabel;
}
