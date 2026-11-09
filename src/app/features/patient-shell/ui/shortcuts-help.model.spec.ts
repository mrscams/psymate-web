import { globalShortcuts, ShortcutRegistration } from '../../../core/shortcuts';
import { displayKey, HelpRow, helpRows } from './shortcuts-help.model';

const noop = () => undefined;
const reg = (key: string, description?: string): ShortcutRegistration => ({
  key,
  handler: noop,
  description,
});

const extra: HelpRow[] = [
  { keys: ['Ctrl', 'Entrée'], combo: true, label: 'Enregistrer le formulaire', available: true },
];

const row = (rows: HelpRow[], key: string) => rows.find((r) => r.keys.join(' ') === key);

describe('helpRows (aide des raccourcis alimentée par le registre)', () => {
  it('liste de référence dans l’ordre de la planche, 1 2 3 regroupés, ? en dernier', () => {
    const rows = helpRows(globalShortcuts(), [], extra);
    expect(rows.map((r) => r.keys.join(' '))).toEqual([
      'N',
      '/',
      'L',
      '1 2 3',
      'M',
      'Échap',
      'Ctrl Entrée',
      '?',
    ]);
    expect(row(rows, '1 2 3')?.label).toBe("Vue d'ensemble · Timeline · Graphe");
  });

  it('sans inscription : grisé (indisponible ici), sauf ? et Échap', () => {
    const rows = helpRows(globalShortcuts(), []);
    expect(row(rows, 'N')?.available).toBe(false);
    expect(row(rows, '/')?.available).toBe(false);
    expect(row(rows, '1 2 3')?.available).toBe(false);
    expect(row(rows, '?')?.available).toBe(true);
    expect(row(rows, 'Échap')?.available).toBe(true);
  });

  it('inscription active : disponible, avec la description de l’écran si elle existe', () => {
    const rows = helpRows(globalShortcuts(), [
      reg('n', 'Nouveau patient'),
      reg('/', 'Filtrer mes patients'),
      // Barre d'application, en-tête patient (shared/ui) : inscrits sans description.
      reg('1'),
      reg('l'),
    ]);
    expect(row(rows, 'N')).toEqual({ keys: ['N'], label: 'Nouveau patient', available: true });
    expect(row(rows, '/')?.label).toBe('Filtrer mes patients');
    expect(row(rows, 'L')).toEqual({
      keys: ['L'],
      label: "Lier l'entrée ouverte",
      available: true,
    });
    expect(row(rows, '1 2 3')?.available).toBe(true);
    expect(row(rows, 'M')?.available).toBe(false);
  });

  it('autres inscriptions décrites (timeline : +, -, F) ajoutées ; sans description, ignorées', () => {
    const rows = helpRows(
      globalShortcuts(),
      [reg('+', 'Zoomer'), reg('f', 'Aller aux filtres'), reg('x')],
      extra,
    );
    const keys = rows.map((r) => r.keys.join(' '));
    expect(keys).toContain('+');
    expect(keys).toContain('F');
    expect(keys).not.toContain('X');
    expect(keys.indexOf('Ctrl Entrée')).toBeLessThan(keys.indexOf('+'));
    expect(keys.at(-1)).toBe('?');
  });

  it('displayKey : lettre en capitale, nom de touche tel quel', () => {
    expect(displayKey('f')).toBe('F');
    expect(displayKey('+')).toBe('+');
    expect(displayKey('ArrowUp')).toBe('ArrowUp');
  });
});
