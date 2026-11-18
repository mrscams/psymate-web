import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

import { StateAction, StateComponent } from '../../../shared/ui';
import { stateKind } from '../../../shared/util';
import { PatientShellStore } from '../../patient-shell';
import { CATEGORY_QUERY_PARAM, categoryFromParam } from '../data/profile360.model';
import { Profile360Store } from '../data/profile360.store';
import { ProfileMenuComponent } from '../ui/profile-menu.component';
import { ProfileRubricComponent } from '../ui/profile-rubric.component';

/**
 * Onglet 4 du dossier, /patients/:id/profile (fiche 30, G Q52 à Q57) : ce qui décrit la personne,
 * rangé en quatre rubriques, en lecture (M13-06). Un seul GET /api/patients/{id}/profile-items
 * (Profile360Store) ; deux colonnes, le menu des rubriques (272 px) et la rubrique affichée, lue et
 * écrite dans `?rubrique=` (absente ou inconnue : Histoire et souvenirs) ; une colonne sous 820 px,
 * le menu en rangée défilante au-dessus. Trois états (shared/ui/state) : chargement, erreur avec
 * « Réessayer », profil vide ; une rubrique vide a son propre état dans pm-profile-rubric.
 * Pas de bloc de saisie ici (G Q56) : le shell ne le pose que sur l'onglet Séance. Ouvrir l'onglet
 * n'écrit rien. Le bouton « Ajouter au profil » et le panneau sont M13-07.
 */
@Component({
  selector: 'pm-profile360-page',
  imports: [ProfileMenuComponent, ProfileRubricComponent, StateComponent],
  providers: [Profile360Store],
  templateUrl: './profile360.page.html',
  styleUrl: './profile360.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Profile360Page {
  protected readonly store = inject(Profile360Store);
  private readonly shell = inject(PatientShellStore);
  private readonly route = inject(ActivatedRoute);

  /** La rubrique affichée, lue dans `?rubrique=` (défaut et valeur inconnue : history). */
  protected readonly category = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => categoryFromParam(params.get(CATEGORY_QUERY_PARAM))),
    ),
    {
      initialValue: categoryFromParam(this.route.snapshot.queryParamMap.get(CATEGORY_QUERY_PARAM)),
    },
  );

  /** État du bloc : chargement, erreur ou profil entièrement vide ; null quand le profil s'affiche. */
  protected readonly state = computed(() => stateKind(this.store.profile()));

  protected readonly retryAction: StateAction = {
    label: $localize`:Bouton de l'état erreur du Profil 360@@profile360.error.retry:Réessayer`,
    handler: () => void this.store.refresh(),
  };

  constructor() {
    // Patient du dossier → GET …/profile-items (rien si ce patient est déjà lu).
    effect(() => {
      const id = this.shell.patientId();
      if (!id) return;
      untracked(() => void this.store.load(id));
    });
  }
}
