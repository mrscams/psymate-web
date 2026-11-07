// expect: none
// Permis : shared lit core (http, i18n) et shared.
import { CORE_HTTP } from '../../core/http/imports-feature';
import { SHARED_UI } from '../ui/imports-feature';

export const SHARED_FORMS = [CORE_HTTP, SHARED_UI];
