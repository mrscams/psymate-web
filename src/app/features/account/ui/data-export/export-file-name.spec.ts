import { expectedExportFileName } from './export-file-name';

describe('expectedExportFileName (UX-C6, même règle que le serveur)', () => {
  const day = new Date('2026-10-26T22:30:00Z');

  it.each([
    ['Marie D.', 'pdf', 'export-marie-d-20261026.pdf'],
    ['SEED · Quentin S.', 'md', 'export-seed-quentin-s-20261026.md'],
    ['Élodie Ñúñez', 'pdf', 'export-elodie-nunez-20261026.pdf'],
    ['  ', 'pdf', 'export-patient-20261026.pdf'],
    ['···', 'md', 'export-patient-20261026.md'],
  ] as const)('%s (%s) → %s', (name, format, expected) => {
    expect(expectedExportFileName(name, format, day)).toBe(expected);
  });

  it('40 caractères au plus pour le nom, sans tiret final', () => {
    const name = 'Alexandre-Jean Baptiste de la Fontaine-Saint-Martin du Lac';
    const file = expectedExportFileName(name, 'pdf', day);
    const slug = file.replace(/^export-/, '').replace(/-20261026\.pdf$/, '');
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });
});
