import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  LOCALE_ID,
  output,
} from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';

import { SubjectLabelPipe } from '../../../core/i18n';
import { PatientExportFormat } from '../data/patient-export.api';
import { PatientSort, PatientView } from '../data/patient.model';
import { PatientListRow } from '../data/patient-list.store';
import { liveShort, liveText, reportText, rowView, RowView } from './patient-row';

/** Export demandé depuis le menu d'une ligne. */
export interface RowExport {
  patient: PatientView;
  format: PatientExportFormat;
}

/**
 * Tableau des patients (fiche 01, maquette 01, UX-S7) : vrai `<table>`, en-têtes `scope="col"`, tri
 * annoncé par `aria-sort`. Colonnes Patient (avatar, nom, âge · suivi depuis · tags) · Dernière
 * séance (la date seule, puce « en cours » si une séance est ouverte, décision 2 du 14 novembre
 * 2026) · Depuis la séance · Ressentis · 30 j (courbe et émotion dominante) · Situations · Attention
 * (drapeaux, brouillons, compte rendu à écrire), puis les actions révélées au survol et au focus
 * (✎ Fiche, menu … : Ouvrir, Fiche, Exporter, Archiver ou Restaurer). Le nom est un lien vers le
 * dossier étendu à toute la ligne (pseudo-élément, pas de clic en JavaScript) ; ↑ ↓ passent d'une
 * ligne à l'autre et Entrée ouvre. Sous 600 px, une carte par patient (maquette `.phone`). Le patient
 * de démonstration garde son badge, son avatar pointillé et « Supprimer » / « Restaurer ».
 */
@Component({
  selector: 'pm-patient-table',
  imports: [RouterLink, MatMenuModule, SubjectLabelPipe],
  templateUrl: './patient-table.component.html',
  styleUrl: './patient-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ↑ ↓ entre les liens des lignes (les liens portent le focus, l'hôte n'écoute que la touche).
  host: { '(keydown)': 'onKeydown($event)' },
})
export class PatientTableComponent {
  readonly rows = input.required<PatientListRow[]>();
  readonly query = input('');
  readonly sort = input<PatientSort>('name');
  /** Instant de référence (séance en cours depuis n min), rafraîchi par la page. */
  readonly now = input<Date>(new Date());
  /** Rechargement en cours avec la liste précédente affichée : grisée. */
  readonly refreshing = input(false);
  /** « Supprimer » sur la ligne d'un patient de démonstration actif. */
  readonly removeDemo = output<PatientView>();
  /** « Restaurer » sur la ligne d'un patient de démonstration archivé. */
  readonly restoreDemo = output<PatientView>();
  readonly archive = output<PatientView>();
  readonly restore = output<PatientView>();
  readonly exportFile = output<RowExport>();

  private readonly locale = inject(LOCALE_ID);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly view = computed<RowView[]>(() => {
    const now = this.now();
    const query = this.query();
    return this.rows().map((row) => rowView(row, query, this.locale, now));
  });

  protected readonly nameSort = computed(() => (this.sort() === 'name' ? 'ascending' : null));
  protected readonly lastSort = computed(() =>
    this.sort() === 'lastSession' ? 'descending' : null,
  );

  protected readonly liveText = liveText;
  protected readonly liveShort = liveShort;
  protected readonly unavailable = $localize`:Cellule de la liste sans résumé@@patients.table.unavailable:Résumé indisponible`;
  protected readonly loadingLabel = $localize`:Cellule de la liste en cours de chargement@@patients.table.loading:Chargement…`;
  protected readonly ficheTitle = $localize`:Infobulle du lien vers la fiche d'une ligne@@patients.table.ficheTitle:Fiche`;
  protected readonly watchLabel = $localize`:Nom accessible de la puce « ! » des cartes mobiles@@patients.card.flagged:Drapeau posé`;
  protected readonly reportLabel = reportText();

  /** Première ligne affichée (↓ depuis le filtre). */
  focusFirst(): void {
    this.links()[0]?.focus();
  }

  /** ↑ ↓ sur un lien de ligne : ligne précédente ou suivante ; Entrée suit le lien (natif). */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const links = this.links();
    const index = links.indexOf(event.target as HTMLAnchorElement);
    if (index === -1) return;
    event.preventDefault();
    const next = links[index + (event.key === 'ArrowDown' ? 1 : -1)];
    next?.focus();
  }

  /** Liens des lignes visibles : ceux du tableau, ou des cartes sous 600 px. */
  private links(): HTMLAnchorElement[] {
    const all = [...this.host.nativeElement.querySelectorAll<HTMLAnchorElement>('a.row-link')];
    const shown = all.filter((link) => link.getClientRects().length > 0);
    return shown.length > 0 ? shown : all.filter((link) => !link.closest('.cards'));
  }

  protected removeLabel(name: string): string {
    return $localize`:Nom accessible du retrait du patient de démonstration@@patients.demo.removeLabel:Supprimer la démo : ${name}:name:`;
  }

  protected restoreLabel(name: string): string {
    return $localize`:Nom accessible de la restauration du patient de démonstration@@patients.demo.restoreLabel:Restaurer le patient de démonstration ${name}:name:`;
  }

  /** Nom accessible d'une carte mobile : « DEMO · » puis le nom, comme le lien de la ligne. */
  protected cardName(row: RowView): string {
    return row.demo ? `DEMO · ${row.patient.displayName}` : row.patient.displayName;
  }

  /** Identifiants des descriptions d'une carte (seconde ligne, drapeau), ou null sans aucune. */
  protected cardDescribedBy(row: RowView): string | null {
    const ids: string[] = [];
    if (row.cardLine) ids.push(`card-${row.patient.id}-sub`);
    if (row.flags.length > 0) ids.push(`card-${row.patient.id}-flag`);
    return ids.length > 0 ? ids.join(' ') : null;
  }

  protected moreLabel(name: string): string {
    return $localize`:Bouton du menu d'actions d'une ligne@@patients.table.moreLabel:Plus d'actions pour ${name}:name:`;
  }

  protected editLabel(name: string): string {
    return $localize`:Lien vers la fiche d'un patient@@patients.table.editLabel:Fiche de ${name}:name:`;
  }
}
