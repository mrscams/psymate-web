import { documentListText, formatBytes } from './document-labels';

/** Chiffres arabo-indiens (U+0660 à U+0669) : jamais affichés (G Q71). */
const ARABIC_INDIC = /[٠-٩]/;

describe('document-labels (M16-12, version arabe)', () => {
  const items = ['Diplôme', "Pièce d'identité", 'Attestation'];

  it('documentListText : virgules en français et en anglais, comme avant', () => {
    expect(documentListText(items, 'fr')).toBe("Diplôme, Pièce d'identité, Attestation");
    expect(documentListText(items, 'en-US')).toBe("Diplôme, Pièce d'identité, Attestation");
    expect(documentListText(['Diplôme'], 'fr')).toBe('Diplôme');
  });

  it('documentListText : en arabe, la liste de la locale de formatage, sans virgule latine', () => {
    const text = documentListText(['شهادة', 'بطاقة هوية', 'إفادة'], 'ar');
    expect(text).toBe(
      new Intl.ListFormat('ar', { type: 'conjunction' }).format(['شهادة', 'بطاقة هوية', 'إفادة']),
    );
    expect(text).not.toContain(',');
    expect(text).toContain('و');
  });

  it('formatBytes : chiffres latins en arabe, formats inchangés en français', () => {
    expect(formatBytes(1_887_437, 'fr')).toBe('1,8 Mo');
    expect(formatBytes(420 * 1024, 'fr')).toBe('420 Ko');
    const arabic = formatBytes(1_887_437, 'ar');
    expect(arabic).toMatch(/1[.,٫]8/);
    expect(arabic).not.toMatch(ARABIC_INDIC);
  });
});
