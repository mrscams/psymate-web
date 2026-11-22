// Adresses des e2e. Les variables E2E_API_URL, E2E_MAILPIT_URL et E2E_WEB_URL permettent de jouer
// les tests contre une seconde pile locale (autre port d'API, autre Mailpit, application servie
// ailleurs) ; sans elles, les valeurs par défaut sont celles de la pile habituelle et de la CI.
export const API = process.env['E2E_API_URL'] ?? 'http://localhost:8080';
export const MAILPIT = process.env['E2E_MAILPIT_URL'] ?? 'http://localhost:8025';
export const WEB = process.env['E2E_WEB_URL'] ?? 'http://localhost:4200';
