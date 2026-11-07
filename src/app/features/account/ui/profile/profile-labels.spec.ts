import { VOCABULARY } from '../../data/profile.fixtures';
import { initialsOf, itemLabel, labelsOf, missingLabel } from './profile-labels';

describe('profile-labels', () => {
  it('initialsOf : prénom et nom, titres ignorés', () => {
    expect(initialsOf('Claire Martin')).toBe('CM');
    expect(initialsOf('Dr Karim Haddad')).toBe('KH');
    expect(initialsOf('Élise')).toBe('É');
    expect(initialsOf('  ')).toBe('?');
  });

  it('itemLabel : anglais si présent, sinon français', () => {
    expect(itemLabel(VOCABULARY.specialties[0], 'en')).toBe('Anxiety');
    expect(itemLabel(VOCABULARY.specialties[4], 'en')).toBe(
      'Thérapie cognitivo-comportementale (TCC)',
    );
    expect(itemLabel(VOCABULARY.specialties[0], 'fr')).toBe('Anxiété');
  });

  it('labelsOf : un code inconnu reste affiché tel quel', () => {
    expect(labelsOf(['anxiety', 'retiree'], VOCABULARY.specialties, 'fr')).toEqual([
      'Anxiété',
      'retiree',
    ]);
  });

  it('missingLabel : dossier et contact', () => {
    expect(missingLabel('verification')).toContain('doit être approuvé');
    expect(missingLabel('contact')).toContain('au moins un moyen de contact');
  });
});
