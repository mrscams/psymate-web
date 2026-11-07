import { fileNameOf, tokenOf } from './suspended.api';

describe('suspended.api · lecture des URL du contrat', () => {
  it('tokenOf : le jeton du statusUrl, null sans URL ou sans jeton', () => {
    expect(tokenOf('/api/me/export/0b1c-2d3e?token=abc.def_GHI')).toBe('abc.def_GHI');
    expect(tokenOf('/api/me/export/0b1c-2d3e')).toBeNull();
    expect(tokenOf(undefined)).toBeNull();
  });

  it('fileNameOf : Content-Disposition simple, entre guillemets, UTF-8 ; null sinon', () => {
    expect(fileNameOf('attachment; filename=export-psymate-20261107.zip')).toBe(
      'export-psymate-20261107.zip',
    );
    expect(fileNameOf('attachment; filename="export-psymate-20261107.zip"')).toBe(
      'export-psymate-20261107.zip',
    );
    expect(fileNameOf("attachment; filename*=UTF-8''export-psymate-%C3%A9.zip")).toBe(
      'export-psymate-é.zip',
    );
    expect(fileNameOf(null)).toBeNull();
    expect(fileNameOf('inline')).toBeNull();
  });
});
