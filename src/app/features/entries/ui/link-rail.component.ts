import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  LOCALE_ID,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { EntryIconComponent, EntryType, entryTypeLabel } from '../../../shared/ui';
import { formatOccurred } from '../../../shared/util';
import { LinkTypeOption } from '../../graph';
import {
  Emotion,
  LinkCandidate,
  LinkChoice,
  linkChoices,
  RailLink,
  sameChoice,
} from '../data/entry.model';

/** Une ligne du rail : la cible, son nom, sa ligne de contexte et les types permis pour le couple. */
export interface RailRow {
  candidate: LinkCandidate;
  name: string;
  meta: string;
  choices: LinkChoice[];
}

/**
 * Rail « Lié à… » de l'éditeur d'entrée (fiche 05 §7, B5, M2-05) : les cibles proposées (situations
 * en cours, puis entrées récentes), chacune avec une case à cocher et le type de lien proposé par la
 * matrice E5.3 pour le couple (type de l'entrée en cours, type de la cible), modifiable dans la
 * liste des types permis. `Tab` atteint la case, `Espace` la coche (case native). Une cible sans
 * type permis n'est pas proposée. La valeur (contrôle `links` du formulaire) est la liste des liens
 * cochés : cible, type, sens vus depuis la nouvelle entrée. Le type proposé est en pointillé tant
 * que la case n'est pas cochée, plein une fois confirmé.
 */
@Component({
  selector: 'pm-link-rail',
  imports: [EntryIconComponent],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => LinkRailComponent), multi: true },
  ],
  templateUrl: './link-rail.component.html',
  styleUrl: './link-rail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkRailComponent implements ControlValueAccessor {
  private readonly locale = inject(LOCALE_ID);

  readonly candidates = input.required<readonly LinkCandidate[]>();
  readonly linkTypes = input.required<readonly LinkTypeOption[]>();
  /** Type de l'entrée en cours de saisie (source ou cible selon le type proposé). */
  readonly entryType = input.required<EntryType>();
  /** Vocabulaire des émotions : nom d'un ressenti sans titre (« Anxiété 6/10 »). */
  readonly emotions = input<readonly Emotion[]>([]);
  /** Message d'erreur sous le rail (422 sur un lien), relié aux cases. */
  readonly describedBy = input<string | null>(null);

  protected readonly value = signal<RailLink[]>([]);
  protected readonly disabled = signal(false);

  protected readonly rows = computed<RailRow[]>(() => {
    const types = this.linkTypes();
    const entryType = this.entryType();
    const emotions = this.emotions();
    return this.candidates()
      .map((candidate) => ({
        candidate,
        name: candidateName(candidate, emotions),
        meta: this.metaOf(candidate),
        choices: linkChoices(types, entryType, candidate.type),
      }))
      .filter((row) => row.choices.length > 0);
  });

  private onChange: (value: RailLink[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: RailLink[] | null): void {
    this.value.set(value ? [...value] : []);
  }

  registerOnChange(fn: (value: RailLink[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected linkOf(row: RailRow): RailLink | null {
    return this.value().find((link) => link.targetId === row.candidate.id) ?? null;
  }

  /** Le type affiché : celui du lien coché, sinon le premier permis (proposé). */
  protected selectedIndex(row: RailRow): number {
    const link = this.linkOf(row);
    if (!link) return 0;
    const index = row.choices.findIndex((choice) => sameChoice(choice, link));
    return index < 0 ? 0 : index;
  }

  protected checkboxId(row: RailRow): string {
    return `pm-rail-${row.candidate.id}`;
  }

  protected typeLabel(row: RailRow): string {
    const name = row.name;
    return $localize`:Liste du type de lien d'une cible du rail@@entries.rail.typeLabel:Type de lien avec « ${name}:name: »`;
  }

  /** Cocher pose le type affiché ; décocher retire le lien. */
  protected toggle(row: RailRow, checked: boolean): void {
    const rest = this.value().filter((link) => link.targetId !== row.candidate.id);
    if (checked) {
      const choice = row.choices[this.selectedIndex(row)];
      rest.push({
        targetId: row.candidate.id,
        linkType: choice.linkType,
        direction: choice.direction,
      });
    }
    this.commit(rest);
  }

  /** Changer le type confirme le lien : la cible est cochée avec ce type. */
  protected choose(row: RailRow, index: number): void {
    const choice = row.choices[index];
    if (!choice) return;
    const link: RailLink = {
      targetId: row.candidate.id,
      linkType: choice.linkType,
      direction: choice.direction,
    };
    const list = this.value();
    const position = list.findIndex((item) => item.targetId === row.candidate.id);
    this.commit(
      position < 0 ? [...list, link] : list.map((item, i) => (i === position ? link : item)),
    );
  }

  protected touched(): void {
    this.onTouched();
  }

  private commit(list: RailLink[]): void {
    this.value.set(list);
    this.onChange(list);
    this.onTouched();
  }

  private metaOf(candidate: LinkCandidate): string {
    const parts = [entryTypeLabel(candidate.type)];
    const when = formatOccurred(candidate.occurred, this.locale);
    if (when) parts.push(when);
    if (candidate.ongoing) {
      parts.push($localize`:Situation sans fin dans le rail@@entries.rail.ongoing:en cours`);
    }
    return parts.join(' · ');
  }
}

/** Nom d'une cible : son titre, sinon « Anxiété 6/10 » pour un ressenti, sinon son type. */
export function candidateName(candidate: LinkCandidate, emotions: readonly Emotion[]): string {
  if (candidate.title) return candidate.title;
  if (candidate.type === 'feeling' && candidate.emotionCode) {
    const emotion =
      emotions.find((item) => item.code === candidate.emotionCode)?.label ?? candidate.emotionCode;
    return candidate.intensity === null ? emotion : `${emotion} ${candidate.intensity}/10`;
  }
  return entryTypeLabel(candidate.type);
}
