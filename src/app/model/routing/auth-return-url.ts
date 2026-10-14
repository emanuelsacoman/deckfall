import { Router } from '@angular/router';
import { AuthSession, isAdminSession, isAuthenticatedSession } from '../interfaces/Auth/auth-session';
import { PACK_INSTANCE_ID_PATTERN } from '../interfaces/Packs/player-pack';

/** Only known internal destinations, with a bounded ID for dynamic pack routes. */
export function validAuthReturnUrl(router: Pick<Router, 'parseUrl'>, value: string | null, user: AuthSession): string | null {
  if (!isAuthenticatedSession(user) || !value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return null;
  try {
    const tree = router.parseUrl(value);
    const primary = tree.root.children['primary'];
    if (!primary || Object.keys(tree.root.children).some(outlet => outlet !== 'primary') || Object.keys(primary.children).length) return null;
    if (primary.segments.some(segment => Object.keys(segment.parameters).length)) return null;
    const segments = primary.segments.map(segment => segment.path);
    if (segments.some(segment => segment === '.' || segment === '..' || /[\\/\u0000-\u0020]/.test(segment))) return null;
    const path = segments.join('/').replace(/\/$/, '');
    const gamePath = /^game(?:\/(?:home|colecao|pacotes|decks|jogar|perfil))?$/.test(path);
    const packOpeningPath = segments.length === 4 && segments[0] === 'game' && segments[1] === 'pacotes'
      && segments[2] === 'abrir' && PACK_INSTANCE_ID_PATTERN.test(segments[3]);
    const adminPath = /^admin(?:\/(?:dashboard|pacotes|cartas(?:\/(?:lista|criar|editar\/[a-zA-Z0-9_-]{1,128}))?|usuarios(?:\/(?:lista|criar|editar\/[a-zA-Z0-9_-]{1,128}))?))?$/.test(path);
    return gamePath || packOpeningPath || (adminPath && isAdminSession(user)) ? value : null;
  } catch {
    return null;
  }
}
