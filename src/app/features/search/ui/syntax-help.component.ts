import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Aide de la recherche (fiche 07, pied de l'aperçu) : touches, puis la syntaxe que le serveur
 * comprend dans q (tag:, émotion:, avant:, après:, guillemets, -mot).
 */
@Component({
  selector: 'pm-search-syntax-help',
  template: `
    <p class="keys" i18n="Aide clavier de la recherche@@search.help.keys">
      ↑ ↓ pour parcourir les résultats · Entrée ouvre dans la timeline · Échap revient à l'écran
      précédent
    </p>
    <dl class="syntax">
      <div>
        <dt><code>tag:travail</code></dt>
        <dd i18n="Aide de la syntaxe@@search.help.tag">entrées portant ce tag</dd>
      </div>
      <div>
        <dt><code>émotion:anxiété</code></dt>
        <dd i18n="Aide de la syntaxe@@search.help.emotion">ressentis de cette émotion</dd>
      </div>
      <div>
        <dt><code>avant:2026-09</code></dt>
        <dd i18n="Aide de la syntaxe@@search.help.before">avant septembre 2026</dd>
      </div>
      <div>
        <dt><code>après:2026-06</code></dt>
        <dd i18n="Aide de la syntaxe@@search.help.after">à partir de juillet 2026</dd>
      </div>
      <div>
        <dt><code>"mot exact"</code></dt>
        <dd i18n="Aide de la syntaxe@@search.help.phrase">expression exacte</dd>
      </div>
      <div>
        <dt><code>-mot</code></dt>
        <dd i18n="Aide de la syntaxe@@search.help.exclude">exclut ce mot</dd>
      </div>
    </dl>
  `,
  styles: `
    :host {
      display: block;
      color: var(--text-secondary);
      font: var(--mat-sys-body-small);
    }
    .keys {
      margin: 0 0 8px;
    }
    .syntax {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 4px 12px;
      margin: 0;
    }
    .syntax div {
      display: flex;
      flex-wrap: wrap;
      gap: 0 6px;
    }
    dd {
      margin: 0;
    }
    code {
      font-family: var(--font-mono);
      color: var(--text-primary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyntaxHelpComponent {}
