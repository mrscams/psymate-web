/**
 * Clé d'état de navigation (Router `state`) : posée par la création d'un patient (features/patients),
 * elle demande au dossier qui s'ouvre de donner le focus à la barre de capture (B3 flux 2, étape 3 :
 * « la barre de capture est focalisée »). Un état de navigation, pas un paramètre d'URL : un
 * rechargement ou un lien partagé n'y touchent pas.
 */
export const CAPTURE_FOCUS_STATE = 'pmFocusCapture';
