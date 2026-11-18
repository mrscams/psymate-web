import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { map } from 'rxjs';

import { SidePanelService, StateAction, StateComponent, ToastService } from '../../../shared/ui';
import { stateKind } from '../../../shared/util';
import { PatientShellStore } from '../../patient-shell';
import {
  ADD_QUERY_PARAM,
  CATEGORY_QUERY_PARAM,
  categoryFromParam,
  ProfileItem,
} from '../data/profile360.model';
import { Profile360Store } from '../data/profile360.store';
import {
  ProfileItemPanel,
  ProfileItemPanelData,
  ProfileItemPanelResult,
} from '../panels/profile-item.panel';
import { ProfileAddComponent } from '../ui/profile-add.component';
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
 * n'écrit rien.
 * M13-07 (G Q54) : `?ajouter=1` (lien « Ajouter au profil » de la ligne des onglets, ou de l'état
 * vide) ouvre le panneau en création, rubrique affichée préremplie ; le paramètre est retiré à la
 * fermeture. Un clic sur une information ouvre le panneau en modification. Après une écriture, le
 * store a relu le profil ; la page affiche la rubrique concernée, confirme par un toast et rend le
 * focus au déclencheur (à défaut, à l'information modifiée, puis au titre de la rubrique). Patient
 * archivé (dossier, ou 409 PATIENT_ARCHIVED reçu à l'écriture) : lecture seule, ni panneau ni bouton.
 */
@Component({
  selector: 'pm-profile360-page',
  imports: [ProfileAddComponent, ProfileMenuComponent, ProfileRubricComponent, StateComponent],
  providers: [Profile360Store],
  templateUrl: './profile360.page.html',
  styleUrl: './profile360.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Profile360Page {
  protected readonly store = inject(Profile360Store);
  private readonly shell = inject(PatientShellStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly panels = inject(SidePanelService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  /** La rubrique affichée, lue dans `?rubrique=` (défaut et valeur inconnue : history). */
  protected readonly category = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => categoryFromParam(params.get(CATEGORY_QUERY_PARAM))),
    ),
    {
      initialValue: categoryFromParam(this.route.snapshot.queryParamMap.get(CATEGORY_QUERY_PARAM)),
    },
  );

  /** `?ajouter=1` : le panneau est ouvert en création. */
  private readonly addParam = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get(ADD_QUERY_PARAM))),
    { initialValue: this.route.snapshot.queryParamMap.get(ADD_QUERY_PARAM) },
  );

  /** Le patient du dossier (pour le lien de l'état vide). */
  protected readonly patientId = this.shell.patientId;

  /**
   * Lecture seule : patient archivé connu du dossier (GET /api/patients/{id}), ou 409
   * PATIENT_ARCHIVED reçu à l'écriture. Ni « Ajouter au profil », ni panneau.
   */
  protected readonly readOnly = computed(
    () => this.shell.archived() || this.store.archivedOnWrite(),
  );

  /** Un panneau de cet onglet est ouvert (évite de le rouvrir tant que `?ajouter=1` reste là). */
  private readonly panelOpen = signal(false);

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

    // ?ajouter=1 : panneau en création, une fois le dossier lu (l'archivage est alors connu). En
    // lecture seule, le paramètre est simplement retiré.
    effect(() => {
      const add = this.addParam();
      const patient = this.shell.patient();
      if (!add || !patient || this.panelOpen()) return;
      untracked(() => {
        if (this.readOnly()) void this.navigate({ [ADD_QUERY_PARAM]: null });
        else void this.openPanel(null);
      });
    });
  }

  /** Clic ou Entrée sur une information : panneau en modification. */
  protected edit(item: ProfileItem): void {
    if (this.readOnly()) return;
    void this.openPanel(item);
  }

  /**
   * Ouvre le panneau (création si `item` est null) ; à la fermeture, retire `?ajouter=`, affiche la
   * rubrique concernée, confirme et rend le focus. Le profil a déjà été relu par le store.
   */
  private async openPanel(item: ProfileItem | null): Promise<void> {
    const trigger = this.document.activeElement as HTMLElement | null;
    const ref = this.panels.open<ProfileItemPanel, ProfileItemPanelData, ProfileItemPanelResult>(
      ProfileItemPanel,
      { data: { store: this.store, category: this.category(), item }, width: 480 },
    );
    if (!ref) return;
    this.panelOpen.set(true);
    const result = await ref.closed;
    const params: Params = {};
    if (this.addParam()) params[ADD_QUERY_PARAM] = null;
    if (result && 'category' in result) params[CATEGORY_QUERY_PARAM] = result.category;
    if (Object.keys(params).length > 0) await this.navigate(params);
    this.panelOpen.set(false);
    if (!result) return;
    switch (result.action) {
      case 'created':
        this.toast.success(
          $localize`:Toast après un ajout au profil@@profile360.toast.created:Information ajoutée`,
        );
        break;
      case 'updated':
        this.toast.success(
          $localize`:Toast après une modification du profil@@profile360.toast.updated:Information modifiée`,
        );
        break;
      case 'removed':
        this.toast.success(
          $localize`:Toast après un retrait du profil@@profile360.toast.removed:Information retirée`,
        );
        break;
      case 'gone':
        this.toast.warning(
          $localize`:Toast, information retirée entre-temps@@profile360.toast.gone:Cette information a déjà été retirée du profil. Le profil a été relu.`,
        );
        break;
      case 'archived':
        this.toast.warning(
          $localize`:Toast, patient archivé pendant l'écriture@@profile360.toast.archived:Ce patient est archivé : le profil est en lecture seule.`,
        );
        break;
    }
    this.restoreFocus(trigger, result.action === 'updated' ? (item?.id ?? null) : null);
  }

  /**
   * Après le rendu de la liste relue : le déclencheur s'il est encore là (bouton d'en-tête,
   * information modifiée), sinon l'information modifiée (elle a pu changer de rubrique), sinon le
   * titre de la rubrique affichée (information retirée, état vide disparu).
   */
  private restoreFocus(trigger: HTMLElement | null, itemId: string | null): void {
    afterNextRender(
      () => {
        const root = this.host.nativeElement;
        const target =
          (trigger?.isConnected && !trigger.closest('[aria-hidden="true"]') ? trigger : null) ??
          (itemId ? root.querySelector<HTMLElement>(`[data-item-id="${itemId}"]`) : null) ??
          root.querySelector<HTMLElement>('pm-profile-rubric h3');
        target?.focus();
      },
      { injector: this.injector },
    );
  }

  /** Change la requête de l'onglet sans nouvelle entrée d'historique (les autres paramètres restent). */
  private navigate(params: Params): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
