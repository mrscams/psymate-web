/**
 * `/patients/:id/timeline?focus=<entryId>` : la timeline défile jusqu'à l'entrée et la met en
 * évidence (recherche « Ouvrir dans la timeline », M4-08). Distinct de `?entry=<id>`, réservé à la
 * correction (fiche 05 : le shell ouvre l'éditeur pour tout `?entry`).
 */
export const TIMELINE_FOCUS_PARAM = 'focus';
