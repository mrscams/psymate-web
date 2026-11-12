import { composeSummary, splitNextTime } from './next-time';

// « Prochaine fois » (UX-S3) : convention des dernières lignes du compte rendu, écrite à la clôture
// et relue à la séance suivante et dans la vue d'ensemble.

describe('splitNextTime', () => {
  it('sans marqueur : tout est corps, aucune ligne', () => {
    expect(splitNextTime('Reprise du thème du sommeil.\n\nObjectif : agenda.')).toEqual({
      body: 'Reprise du thème du sommeil.\n\nObjectif : agenda.',
      nextTime: [],
    });
    expect(splitNextTime(null)).toEqual({ body: '', nextTime: [] });
    expect(splitNextTime('')).toEqual({ body: '', nextTime: [] });
  });

  it('le marqueur ouvre le bloc : une ligne par ligne non vide, puces retirées, corps sans le bloc', () => {
    const summary =
      'Reprise du thème du sommeil.\n\nProchaine fois :\n– Relire l’agenda du sommeil\n- Demander si le certificat a été fait\n\n• Troisième';
    expect(splitNextTime(summary)).toEqual({
      body: 'Reprise du thème du sommeil.',
      nextTime: ['Relire l’agenda du sommeil', 'Demander si le certificat a été fait', 'Troisième'],
    });
  });

  it('le reste de la ligne du marqueur compte ; casse et espaces tolérés', () => {
    expect(splitNextTime('Thème : sommeil.\nprochaine fois: relire l’agendaagenda')).toEqual({
      body: 'Thème : sommeil.',
      nextTime: ['relire l’agendaagenda'],
    });
    expect(splitNextTime('PROCHAINE FOIS :   ')).toEqual({ body: '', nextTime: [] });
  });

  it('le dernier marqueur fait foi ; un « Prochaine fois » au milieu d’une phrase n’en est pas un', () => {
    const summary =
      'Elle dit : la prochaine fois : on verra.\nProchaine fois :\n– a\nNote tardive.\nProchaine fois :\n– b';
    expect(splitNextTime(summary)).toEqual({
      body: 'Elle dit : la prochaine fois : on verra.\nProchaine fois :\n– a\nNote tardive.',
      nextTime: ['b'],
    });
  });
});

describe('composeSummary', () => {
  it('sans point : le texte seul, espaces de fin retirés', () => {
    expect(composeSummary('Thème : sommeil.  \n', [])).toBe('Thème : sommeil.');
    expect(composeSummary('', ['', '  '])).toBe('');
  });

  it('avec des points : un paragraphe « Prochaine fois : » et un tiret par ligne', () => {
    expect(
      composeSummary('Thème : sommeil.', ['Relire la demande ', '', 'Agenda (s. 3 et 4)']),
    ).toBe('Thème : sommeil.\n\nProchaine fois :\n– Relire la demande\n– Agenda (s. 3 et 4)');
    expect(composeSummary('', ['a'])).toBe('Prochaine fois :\n– a');
  });

  it('aller-retour : ce que la clôture écrit, la séance suivante le relit', () => {
    const written = composeSummary('Objectif : la demande écrite.', [
      'Relire la demande',
      'Agenda',
    ]);
    expect(splitNextTime(written)).toEqual({
      body: 'Objectif : la demande écrite.',
      nextTime: ['Relire la demande', 'Agenda'],
    });
  });
});
