import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Title } from '@angular/platform-browser';
import { routes } from './app.routes';
import { CardService } from './model/services/cruds/cards/card.service';
import { CardStorageService } from './model/services/fire/card-storage.service';
import { CardTemplateService } from './model/services/cruds/cards/card-template.service';
import { PlayerCollectionService } from './model/services/cruds/collection/player-collection.service';
import { PlayerPackService } from './model/services/cruds/packs/player-pack.service';
import { PackDefinitionService } from './model/services/cruds/packs/pack-definition.service';
import { AuthService } from './model/services/fire/auth.service';
import { PLAYER_INITIALIZATION_CLIENT, PlayerInitializationService } from './model/services/fire/player-initialization.service';
import { PlayerInitializationResult } from './model/interfaces/Players/player-profile';
import { AuthSession, isAuthenticatedSession } from './model/interfaces/Auth/auth-session';
import { LoginComponent } from './view/auth/login/login.component';

describe('Navegação do jogador, administração e editor', () => {
  const currentUser = signal<AuthSession | null>({ uid: 'owner', email: 'owner@example.com', displayName: 'Emanuel', role: 'admin', roleId: 'admin' });
  const member: AuthSession = { uid: 'member', email: 'member@example.com', displayName: 'Jogador', contactEmail: 'contact@example.com', role: 'member', roleId: 'member' };
  let login: jasmine.Spy;
  let initialize: jasmine.Spy;
  let listCollection: jasmine.Spy;
  let getPack: jasmine.Spy;
  beforeEach(() => {
    currentUser.set({ uid: 'owner', email: 'owner@example.com', displayName: 'Emanuel', role: 'admin', roleId: 'admin' });
    login = jasmine.createSpy('login').and.callFake(async () => { currentUser.set(member); });
    initialize = jasmine.createSpy('initialize').and.resolveTo({ initialized: true, alreadyInitialized: false, starterPackGranted: true, starterPackInstanceId: 'starter' });
    listCollection = jasmine.createSpy('listCurrentUser').and.resolveTo([]);
    getPack = jasmine.createSpy('getCurrentUser').and.resolveTo(null);
    TestBed.configureTestingModule({ providers: [
      provideRouter(routes),
      { provide: CardService, useValue: { list: jasmine.createSpy('listCards').and.resolveTo([]) } },
      { provide: PackDefinitionService, useValue: { list: jasmine.createSpy('listPackDefinitions').and.resolveTo([]) } },
      { provide: CardStorageService, useValue: {} },
      { provide: CardTemplateService, useValue: {} },
      { provide: PlayerCollectionService, useValue: { listCurrentUser: listCollection } },
      { provide: PlayerPackService, useValue: {
        listCurrentUser: jasmine.createSpy('listPacks').and.resolveTo([]), getCurrentUser: getPack,
        openCurrentUser: jasmine.createSpy('openPack')
      } },
      { provide: PLAYER_INITIALIZATION_CLIENT, useValue: { initialize } },
      { provide: AuthService, useValue: {
        currentUser, isAdmin: computed(() => currentUser()?.role === 'admin' && currentUser()?.roleId === 'admin'),
        isAuthenticated: computed(() => isAuthenticatedSession(currentUser())),
        sessionError: signal(null), googleError: signal(null), redirecting: signal(false), googleLinked: signal(false), passwordLinked: signal(false),
        completedSignInRedirect: signal(false), clearSignInRedirect: () => {},
        waitForSession: () => Promise.resolve(currentUser()), login
      } }
    ] });
  });

  it('abre o painel após a resolução de uma sessão admin', async () => {
    const harness = await RouterTestingHarness.create('/admin');
    expect(TestBed.inject(Router).url).toBe('/admin/dashboard');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Painel');
  });

  it('abre o gerenciador de pacotes pelo menu administrativo', async () => {
    const harness = await RouterTestingHarness.create('/admin');
    const link = harness.routeNativeElement?.querySelector<HTMLAnchorElement>('nav a[href="/admin/pacotes"]');
    expect(link?.textContent).toContain('Gerenciar pacotes');
    link!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/admin/pacotes');
    expect(TestBed.inject(Title).getTitle()).toBe('Gerenciar pacotes | Deckfall');
    expect(harness.routeNativeElement?.querySelector('app-pack-admin')).not.toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Configurar StarterPack');
  });

  it('nega o gerenciador de pacotes a membros sem consultar suas definições', async () => {
    currentUser.set(member);
    const harness = await RouterTestingHarness.create('/admin/pacotes');
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fadmin%2Fpacotes');
    expect(harness.routeNativeElement?.querySelector('app-pack-admin')).toBeNull();
    expect(TestBed.inject(PackDefinitionService).list).not.toHaveBeenCalled();
  });

  it('abre o editor visual nas rotas existentes de criação', async () => {
    const harness = await RouterTestingHarness.create('/admin/cartas/criar');
    expect(TestBed.inject(Router).url).toBe('/admin/cartas/criar');
    expect(harness.routeNativeElement?.querySelector('app-card-canvas canvas')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('app-element-library')).not.toBeNull();
  });

  it('direciona membro para login e não renderiza o editor administrativo', async () => {
    currentUser.set({ uid: 'member', email: 'member@example.com', displayName: '', role: 'member', roleId: 'member' });
    const harness = await RouterTestingHarness.create('/admin/cartas/criar');
    expect(TestBed.inject(Router).url).toContain('/login');
    expect(harness.routeNativeElement?.querySelector('app-card-editor')).toBeNull();
  });

  for (const role of ['member', 'admin'] as const) {
    it(`permite ${role} em /game e redireciona para /game/home`, async () => {
      currentUser.set({ ...member, role, roleId: role });
      const harness = await RouterTestingHarness.create('/game');
      expect(TestBed.inject(Router).url).toBe('/game/home');
      expect(TestBed.inject(Title).getTitle()).toBe('Início | Deckfall');
      expect(harness.routeNativeElement?.querySelector('nav')).not.toBeNull();
      expect(harness.routeNativeElement?.querySelector('app-card-editor')).toBeNull();
    });
  }

  it('preserva o destino da coleção e volta a ele após login de membro', async () => {
    currentUser.set(null);
    const harness = await RouterTestingHarness.create('/game/colecao');
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fgame%2Fcolecao');
    expect(harness.routeNativeElement?.querySelector('nav')).toBeNull();
    const component = harness.routeDebugElement?.componentInstance as LoginComponent;
    component.form.patchValue({ email: 'member@example.com', password: 'test-password' });
    await component.submit();
    expect(login).toHaveBeenCalledOnceWith('member@example.com', 'test-password');
    expect(component.error()).toBeNull();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/game/colecao');
    expect(TestBed.inject(Title).getTitle()).toBe('Minha coleção | Deckfall');
  });

  it('navega pelas seis páginas do jogador com links ativos e títulos', async () => {
    currentUser.set(member);
    const harness = await RouterTestingHarness.create('/game');
    const destinations = [
      ['home', 'Início'], ['colecao', 'Minha coleção'], ['pacotes', 'Meus pacotes'], ['decks', 'Meus decks'], ['jogar', 'Jogar'], ['perfil', 'Perfil']
    ];
    for (const [path, title] of destinations) {
      const link = harness.routeNativeElement?.querySelector<HTMLAnchorElement>(`nav a[href="/game/${path}"]`);
      expect(link).withContext(`link para ${path}`).not.toBeNull();
      link!.click();
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(TestBed.inject(Router).url).toBe(`/game/${path}`);
      expect(TestBed.inject(Title).getTitle()).toBe(`${title} | Deckfall`);
      expect(link!.getAttribute('aria-current')).toBe('page');
      expect(harness.routeNativeElement?.querySelector('h1')).not.toBeNull();
    }
    expect(harness.routeNativeElement?.textContent).toContain('contact@example.com');
    const account = harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[href="/login"]');
    expect(account?.textContent).toContain('Gerenciar minha conta');
    account!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(harness.routeNativeElement?.textContent).toContain('Minha conta');
  });

  it('nega a área do jogador quando o perfil não foi resolvido ou é inconsistente', async () => {
    const harness = await RouterTestingHarness.create();
    for (const profile of [{ role: null, roleId: null }, { role: 'admin', roleId: 'member' }]) {
      currentUser.set({ ...member, ...profile });
      await harness.navigateByUrl('/game/perfil');
      expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fgame%2Fperfil');
      expect(harness.routeNativeElement?.querySelector('nav')).toBeNull();
    }
  });

  it('revalida o perfil ao trocar de página da área do jogador', async () => {
    currentUser.set(member);
    const harness = await RouterTestingHarness.create('/game/home');
    currentUser.set({ ...member, role: null, roleId: null });
    await harness.navigateByUrl('/game/colecao');
    expect(TestBed.inject(Router).url).toContain('/login');
    expect(harness.routeNativeElement?.querySelector('nav')).toBeNull();
  });

  it('carrega a coleção somente depois do bootstrap e não concede novamente ao navegar', async () => {
    let finish!: (result: PlayerInitializationResult) => void;
    initialize.and.returnValue(new Promise<PlayerInitializationResult>(resolve => { finish = resolve; }));
    currentUser.set(member);
    const harness = await RouterTestingHarness.create('/game/colecao');
    expect(initialize).toHaveBeenCalledOnceWith();
    expect(listCollection).not.toHaveBeenCalled();
    expect(harness.routeNativeElement?.querySelector('app-game-collection')).toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Preparando sua jornada');
    finish({ initialized: true, alreadyInitialized: false, starterPackGranted: true, starterPackInstanceId: 'starter' });
    await TestBed.inject(PlayerInitializationService).initialize();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(listCollection).toHaveBeenCalledTimes(1);
    expect(harness.routeNativeElement?.querySelector('app-game-collection')).not.toBeNull();
    await harness.navigateByUrl('/game/home');
    await harness.navigateByUrl('/game/colecao');
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(listCollection).toHaveBeenCalledTimes(2);
  });

  it('não abre a coleção após falha crítica e carrega dados novos depois de tentar novamente', async () => {
    initialize.and.rejectWith({ code: 'functions/failed-precondition' });
    currentUser.set(member);
    const harness = await RouterTestingHarness.create('/game/colecao');
    await TestBed.inject(PlayerInitializationService).initialize();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('app-game-collection')).toBeNull();
    expect(listCollection).not.toHaveBeenCalled();
    expect(harness.routeNativeElement?.textContent).toContain('Não foi possível preparar sua jornada');
    initialize.and.resolveTo({ initialized: true, alreadyInitialized: true, starterPackGranted: false, starterPackInstanceId: 'starter' });
    harness.routeNativeElement?.querySelector<HTMLButtonElement>('.journey-error button')?.click();
    await TestBed.inject(PlayerInitializationService).initialize();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(listCollection).toHaveBeenCalledTimes(1);
    expect(harness.routeNativeElement?.querySelector('app-game-collection')).not.toBeNull();
  });

  it('oferece navegação entre as áreas somente para administradores', async () => {
    const harness = await RouterTestingHarness.create('/game/home');
    const admin = harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[href="/admin"]');
    expect(admin?.textContent).toContain('Painel administrativo');
    admin!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/admin/dashboard');
    const game = harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[href="/game"]');
    expect(game?.textContent).toContain('Área do jogador');
    game!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/game/home');

    currentUser.set(member);
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('a[href="/admin"]')).toBeNull();
  });

  it('preserva a rota dinâmica de abertura no login e consulta apenas o pack da sessão', async () => {
    currentUser.set(null);
    const harness = await RouterTestingHarness.create('/game/pacotes/abrir/starter');
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fgame%2Fpacotes%2Fabrir%2Fstarter');
    const component = harness.routeDebugElement?.componentInstance as LoginComponent;
    component.form.patchValue({ email: 'member@example.com', password: 'test-password' });
    await component.submit();
    expect(login).toHaveBeenCalledOnceWith('member@example.com', 'test-password');
    expect(component.error()).toBeNull();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/game/pacotes/abrir/starter');
    expect(TestBed.inject(Title).getTitle()).toBe('Abrir pacote | Deckfall');
    expect(getPack).toHaveBeenCalledWith('starter');
    expect(TestBed.inject(PlayerPackService).openCurrentUser).not.toHaveBeenCalled();
  });
});
