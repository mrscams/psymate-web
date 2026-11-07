import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { toApiProblem } from './api-problem';

/**
 * Toute réponse d'erreur devient un ApiProblem typé (handbook §6.3). Placé au plus près du réseau
 * (dernier de la liste) : les intercepteurs qui suivent au retour, et les stores, ne voient que lui.
 */
export const problemInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((error: unknown) =>
      throwError(() => (error instanceof HttpErrorResponse ? toApiProblem(error) : error)),
    ),
  );
