import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { CardService } from './model/services/cruds/cards/card.service';
import { CardStorageService } from './model/services/fire/card-storage.service';
import { CardTemplateService } from './model/services/cruds/cards/card-template.service';
import { AuthService } from './model/services/fire/auth.service';
import { AuthSession } from './model/interfaces/Auth/auth-session';

describe('Navegação administrativa e editor', () => {
  const currentUser = signal<AuthSession | null>({ uid: 'owner', email: 'owner@example.com', displayName: 'Emanuel', role: 'admin', roleId: 'admin' });
  beforeEach(() => {
    currentUser.set({ uid: 'owner', email: 'owner@example.com', displayName: 'Emanuel', role: 'admin', roleId: 'admin' });
    TestBed.configureTestingModule({ providers: [
      provideRouter(routes),
      { provide: CardService, useValue: {} },
      { provide: CardStorageService, useValue: {} },
      { provide: CardTemplateService, useValue: {} },
      { provide: AuthService, useValue: {
        currentUser, isAdmin: computed(() => currentUser()?.role === 'admin' && currentUser()?.roleId === 'admin'),
        sessionError: signal(null), waitForSession: () => Promise.resolve(currentUser())
      } }
    ] });
  });

  it('abre o painel após a resolução de uma sessão admin', async () => {
    const harness = await RouterTestingHarness.create('/admin');
    expect(TestBed.inject(Router).url).toBe('/admin/dashboard');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Painel');
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
});
