import { HttpInterceptorFn } from '@angular/common/http';
import { inject, LOCALE_ID } from '@angular/core';

import { toAppLocale } from '../i18n';
import { API_PREFIX } from './credentials.interceptor';

export const ACCEPT_LANGUAGE = 'Accept-Language';

/**
 * Langue du bundle annoncée à l'API (Q79) : fr, en ou ar. Le serveur écrit dans la langue d'Accept-Language ses
 * messages d'erreur, les libellés de liens, les exports et les e-mails ; sans cet en-tête, le
 * navigateur envoie la sienne, et un écran en anglais reçoit des messages en français (ou
 * l'inverse). Un appel qui pose déjà l'en-tête le garde.
 */
export const localeInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_PREFIX) || req.headers.has(ACCEPT_LANGUAGE)) return next(req);
  return next(req.clone({ setHeaders: { [ACCEPT_LANGUAGE]: toAppLocale(inject(LOCALE_ID)) } }));
};
