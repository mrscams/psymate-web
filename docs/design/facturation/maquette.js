/* Maquettes du module Facturation : script commun.
   Il ne fait que répéter ce qui est identique d'un cadre à l'autre : la coquille de l'application
   (barre de 48 px, rail de 56 px), l'en-tête du module et ses onglets, la feuille de facture, les
   icônes. Aucune logique d'écran : tout le contenu des maquettes est dans le HTML de chaque page. */
(function () {
  var root = document.documentElement;
  var KEY = 'pm-maquette-theme';
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* stockage indisponible : thème du système */ }
  root.dataset.theme = stored || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  var PAGES = [
    ['index.html', 'Index'],
    ['01-factures.html', '01 · Factures'],
    ['02-a-facturer.html', '02 · À facturer'],
    ['03-editeur.html', '03 · Nouvelle facture'],
    ['04-facture.html', '04 · Facture émise'],
    ['05-paiements.html', '05 · Paiements'],
    ['06-dossier-patient.html', '06 · Patient et points d\'entrée'],
    ['07-reglages.html', '07 · Réglages'],
  ];

  // Icônes en trait, même dessin que celles de l'application (24 × 24, trait 1,8).
  var I = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    alert: '<path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".5"/>',
    draft: '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3.2"/>',
    half: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor"/>',
    voided: '<circle cx="12" cy="12" r="8.5"/><path d="m6 18 12-12"/>',
    undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M4.5 11.5H14a5.5 5.5 0 0 1 0 11h-2"/>',
    download: '<path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 19.5h14"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
    doc: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8.5h6M9 12h6M9 15.5h4"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M5 15.5V6a1.5 1.5 0 0 1 1.5-1.5H15"/>',
    cash: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
    bank: '<path d="M3.5 9.5 12 4l8.5 5.5M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3.5 20h17"/>',
    cheque: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><path d="M6.5 14.5c1.5-3 2.5 2 4 0s1.5-1 2.500 0M15 10.500h3"/>',
    user: '<circle cx="12" cy="8.500" r="3.500"/><path d="M5 20c0-3.500 3-6 7-6s7 2.500 7 6"/>',
    external: '<path d="M10 5H5v14h14v-5M13 4h7v7M20 4l-9 9"/>',
  };
  function svg(name, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (I[name] || '') + '</svg>';
  }
  var ST_ICON = { draft: 'draft', due: 'clock', part: 'half', paid: 'check', late: 'alert', void: 'voided', credit: 'undo' };

  var LOGO = '<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 16V8h4.500a3 3 0 0 1 0 6H8"/></svg>';
  var RAIL = {
    patients: '<circle cx="9" cy="8" r="3.2"/><path d="M3.500 19c0-3 2.500-5 5.500-5s5.500 2 5.500 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.500 19c0-2.200 1.600-3.800 3.800-3.800 1 0 1.900.3 2.600.9"/>',
    agenda: I.calendar,
    invoice: I.doc,
  };

  function appbar(crumb, sub) {
    return '<header class="appbar"><span class="brand">' + LOGO + 'PsyMate</span>' +
      '<span class="section"><span aria-hidden="true">·</span>' + crumb + (sub ? '<span aria-hidden="true">/</span><b>' + sub + '</b>' : '') + '</span>' +
      '<span class="spacer"></span>' +
      '<span class="search">' + svg('search') + 'Rechercher<kbd>/</kbd></span>' +
      '<span class="locale">English</span><span class="avatar">CM</span></header>';
  }
  function rail(active) {
    return '<nav class="rail" aria-label="Navigation">' + ['patients', 'agenda', 'invoice'].map(function (k) {
      return '<span class="item' + (k === active ? ' active' : '') + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + RAIL[k] + '</svg></span>';
    }).join('') + '</nav>';
  }

  var TABS = [['factures', 'Factures'], ['a-facturer', 'À facturer', 7], ['paiements', 'Paiements'], ['reglages', 'Réglages']];
  function mhead(node) {
    var cur = node.dataset.tab;
    var actions = cur === 'reglages' ? '' : '<div class="right"><a class="btn primary" href="03-editeur.html">' + svg('plus') + 'Nouvelle facture <kbd>N</kbd></a></div>';
    node.innerHTML = '<div class="mhead-row"><h1>Facturation</h1>' + actions + '</div><nav class="tabs" aria-label="Facturation">' +
      TABS.map(function (t) {
        var end = t[0] === 'reglages' ? ' class="end"' : '';
        return '<a href="#"' + end + (t[0] === cur ? ' aria-current="page"' : '') + '>' + t[1] + (t[2] ? ' <span class="badge">' + t[2] + '</span>' : '') + '</a>';
      }).join('') + '</nav>';
  }

  // Les deux factures d'exemple, dessinées telles que le PDF les montrera.
  var ME = { name: 'Claire Moreau', title: 'Psychologue clinicienne', addr: ['12 rue des Lilas', '75011 Paris'], ids: ['N° ADELI 75 93 0000 0', 'SIRET 000 000 000 00000'], contact: 'claire.moreau@example.test · 01 00 00 00 00' };
  var PAPERS = {
    draft: {
      kind: 'Facture', num: 'attribué à l\'émission', stamp: ['draft', 'Brouillon'],
      to: ['Nour Khalil', '8 avenue Parmentier', '75011 Paris'],
      meta: [['Date', '22 novembre 2026'], ['Échéance', 'à réception']],
      lines: [['12/11/2026', 'Séance de psychothérapie', '1', '60,00 €', '60,00 €'], ['19/11/2026', 'Séance de psychothérapie', '1', '60,00 €', '60,00 €']],
      totals: [['Total', '120,00 €', true]],
      legal: ['TVA non applicable, article 261-4-1° du Code général des impôts.', 'Règlement par virement, chèque ou espèces.'],
    },
    f0144: {
      kind: 'Facture', num: 'F-2026-0144',
      to: ['Léa Martin', '27 rue Oberkampf', '75011 Paris'],
      meta: [['Date', '16 novembre 2026'], ['Échéance', '16 décembre 2026']],
      lines: [['05/10/2026', 'Séance de psychothérapie', '1', '60,00 €', '60,00 €'], ['12/10/2026', 'Séance de psychothérapie', '1', '60,00 €', '60,00 €'], ['19/10/2026', 'Séance de psychothérapie', '1', '60,00 €', '60,00 €'], ['26/10/2026', 'Séance de psychothérapie', '1', '60,00 €', '60,00 €']],
      totals: [['Total', '240,00 €', true], ['Déjà réglé (chèque, 16/11/2026)', '− 120,00 €'], ['Reste à régler', '120,00 €']],
      legal: ['TVA non applicable, article 261-4-1° du Code général des impôts.', 'Règlement par virement, chèque ou espèces, à l\'ordre de Claire Moreau.'],
    },
    f0146: {
      kind: 'Facture acquittée', num: 'F-2026-0146', stamp: ['paid', 'Acquittée'],
      to: ['Hélène Roussel', '3 rue de la Mare', '75020 Paris'],
      meta: [['Date', '19 novembre 2026'], ['Réglée le', '19 novembre 2026']],
      lines: [['19/11/2026', 'Séance de psychothérapie (visio)', '1', '60,00 €', '60,00 €']],
      totals: [['Total', '60,00 €', true], ['Réglé par virement le 19/11/2026', '60,00 €']],
      legal: ['TVA non applicable, article 261-4-1° du Code général des impôts.'],
    },
  };
  function paper(node) {
    var p = PAPERS[node.dataset.inv];
    if (!p) return;
    var h = '<div class="p-head"><div class="p-who"><b>' + ME.name + '</b><span>' + ME.title + '</span><span>' + ME.addr.join(', ') + '</span><span>' + ME.ids.join('</span><span>') + '</span></div>' +
      '<div class="p-title"><b>' + p.kind + '</b><span class="mono">N° ' + p.num + '</span></div></div>';
    h += '<div class="p-meta"><div class="p-to"><div class="p-k">Adressée à</div><b>' + p.to[0] + '</b><span>' + p.to.slice(1).join('</span><span>') + '</span></div>' +
      '<dl>' + p.meta.map(function (m) { return '<dt>' + m[0] + '</dt><dd>' + m[1] + '</dd>'; }).join('') + '</dl></div>';
    h += '<table><thead><tr><th>Date</th><th>Désignation</th><th class="num">Qté</th><th class="num">Prix unitaire</th><th class="num">Montant</th></tr></thead><tbody>' +
      p.lines.map(function (l) { return '<tr><td class="mono">' + l[0] + '</td><td>' + l[1] + '</td><td class="num">' + l[2] + '</td><td class="num">' + l[3] + '</td><td class="num">' + l[4] + '</td></tr>'; }).join('') + '</tbody></table>';
    h += '<div class="p-tot">' + p.totals.map(function (t) { return '<div' + (t[2] ? ' class="big"' : '') + '><span>' + t[0] + '</span><span class="num">' + t[1] + '</span></div>'; }).join('') + '</div>';
    h += '<div class="p-legal">' + p.legal.map(function (l) { return '<p>' + l + '</p>'; }).join('') + '</div>';
    if (p.stamp) h += '<span class="stamp ' + p.stamp[0] + '">' + p.stamp[1] + '</span>';
    h += '<div class="p-foot">' + ME.name + ' · ' + ME.title + ' · ' + ME.contact + '</div>';
    node.innerHTML = h;
  }

  function build() {
    // Navigation du document et choix du thème.
    var here = (location.pathname.split('/').pop() || 'index.html');
    var nav = document.querySelector('.doc-nav');
    if (nav) {
      nav.innerHTML = PAGES.map(function (p) { return '<a href="' + p[0] + '"' + (p[0] === here ? ' class="current"' : '') + '>' + p[1] + '</a>'; }).join('') +
        '<span class="spacer"></span><span class="seg" role="group" aria-label="Thème">' +
        [['light', 'Clair'], ['dark', 'Sombre'], ['soft', 'Doux']].map(function (t) { return '<button type="button" data-theme-set="' + t[0] + '" aria-pressed="' + (root.dataset.theme === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</span>';
      nav.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-theme-set]');
        if (!b) return;
        root.dataset.theme = b.dataset.themeSet;
        try { localStorage.setItem(KEY, b.dataset.themeSet); } catch (e) { /* sans mémoire */ }
        nav.querySelectorAll('[data-theme-set]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
    }
    var pager = document.querySelector('.pager');
    if (pager) {
      var i = PAGES.findIndex(function (p) { return p[0] === here; });
      var prev = PAGES[i - 1], next = PAGES[i + 1];
      pager.innerHTML = (prev ? '<a href="' + prev[0] + '">← ' + prev[1] + '</a>' : '<span></span>') + (next ? '<a href="' + next[0] + '">' + next[1] + ' →</a>' : '<span></span>');
    }

    // Un cadre peut reprendre l'écran d'un autre (data-clone) et n'y ajouter que son panneau.
    document.querySelectorAll('.app[data-clone]').forEach(function (app) {
      var src = document.querySelector(app.dataset.clone);
      if (!src) return;
      var frag = document.createDocumentFragment();
      Array.prototype.forEach.call(src.children, function (k) {
        if (!k.matches('.scrim, .side-panel, .dialog')) frag.appendChild(k.cloneNode(true));
      });
      app.insertBefore(frag, app.firstChild);
    });

    document.querySelectorAll('.app').forEach(function (app) {
      var kids = Array.prototype.slice.call(app.childNodes);
      var bar = document.createElement('div');
      bar.className = 'frame-bar';
      bar.innerHTML = '<i></i><i></i><i></i><span class="url">' + (app.dataset.url || 'psymate.app/facturation') + '</span>';
      var vp = document.createElement('div');
      vp.className = 'viewport';
      vp.innerHTML = appbar(app.dataset.crumb || 'Facturation', app.dataset.sub) + '<div class="shell">' + rail(app.dataset.active || 'invoice') + '<main class="main"></main></div>';
      var main = vp.querySelector('.main');
      kids.forEach(function (k) {
        if (k.nodeType === 1 && k.matches('.scrim, .side-panel, .dialog')) vp.appendChild(k); else main.appendChild(k);
      });
      app.appendChild(bar);
      app.appendChild(vp);
    });

    document.querySelectorAll('.mhead[data-tab]').forEach(mhead);
    document.querySelectorAll('.paper[data-inv]').forEach(paper);
    document.querySelectorAll('i[data-i]').forEach(function (n) {
      var t = document.createElement('template');
      t.innerHTML = svg(n.dataset.i, n.className);
      n.replaceWith(t.content.firstChild);
    });
    document.querySelectorAll('.st').forEach(function (n) {
      var k = Object.keys(ST_ICON).find(function (c) { return n.classList.contains(c); });
      if (k) n.insertAdjacentHTML('afterbegin', svg(ST_ICON[k]));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
