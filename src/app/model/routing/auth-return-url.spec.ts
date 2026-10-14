import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthSession } from '../interfaces/Auth/auth-session';
import { validAuthReturnUrl } from './auth-return-url';

describe('Destinos seguros após autenticação', () => {
  const member: AuthSession = { uid: 'member', email: null, displayName: null, role: 'member', roleId: 'member' };
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    router = TestBed.inject(Router);
  });

  it('preserva listagem e abertura de packs para member e admin', () => {
    for (const role of ['member', 'admin'] as const) {
      for (const url of ['/game/pacotes', '/game/pacotes/abrir/starter', '/game/pacotes/abrir/pack_123-A?review=1#card']) {
        expect(validAuthReturnUrl(router, url, { ...member, role, roleId: role })).toBe(url);
      }
    }
  });

  it('limita IDs de packs e rejeita redirecionamentos, traversal, controles e outlets', () => {
    const invalid = [null, '', 'https://example.test/game/pacotes', '//example.test/game', '/game/pacotes/abrir',
      '/game/pacotes/abrir/..', '/game/pacotes/abrir/%2E%2E', '/game/pacotes/abrir/%2Fother',
      '/game/pacotes/abrir/%5Cother', '/game/pacotes/abrir/%00', '/game/pacotes/abrir/%20',
      '/game/pacotes/abrir/https:evil', `/game/pacotes/abrir/${'a'.repeat(129)}`,
      '/game/pacotes/abrir/starter/extra', '/game/pacotes/abrir/starter;uid=another',
      '/game/(pacotes//other:admin)', '/game/pacotes\\evil', '/login', '/game/loja'];
    for (const url of invalid) expect(validAuthReturnUrl(router, url, member)).withContext(String(url)).toBeNull();
  });

  it('preserva rotas existentes e exige papel admin para o painel', () => {
    expect(validAuthReturnUrl(router, '/game/colecao?rarity=rare#cards', member)).toBe('/game/colecao?rarity=rare#cards');
    expect(validAuthReturnUrl(router, '/admin/cartas/editar/card-A', member)).toBeNull();
    expect(validAuthReturnUrl(router, '/admin/cartas/editar/card-A', { ...member, role: 'admin', roleId: 'admin' })).toBe('/admin/cartas/editar/card-A');
    expect(validAuthReturnUrl(router, '/game/pacotes', { ...member, roleId: 'admin' })).toBeNull();
  });

  it('permite o gerenciador de pacotes apenas como destino administrativo conhecido', () => {
    const admin: AuthSession = { ...member, role: 'admin', roleId: 'admin' };
    expect(validAuthReturnUrl(router, '/admin/pacotes', admin)).toBe('/admin/pacotes');
    expect(validAuthReturnUrl(router, '/admin/pacotes', member)).toBeNull();
    expect(validAuthReturnUrl(router, '/admin/pacotes/abrir/starter', admin)).toBeNull();
  });
});
