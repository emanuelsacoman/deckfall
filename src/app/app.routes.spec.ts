import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { CardService } from './model/services/cruds/cards/card.service';
import { CardStorageService } from './model/services/fire/card-storage.service';

describe('Navegação sem login', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideRouter(routes),
      { provide: CardService, useValue: {} },
      { provide: CardStorageService, useValue: {} }
    ] });
  });

  it('abre o painel diretamente pela raiz sem providers de autenticação', async () => {
    const harness = await RouterTestingHarness.create('/');
    expect(TestBed.inject(Router).url).toBe('/admin/dashboard');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Painel');
  });

  it('abre o formulário de cartas sem esperar uma sessão ou redirecionar para login', async () => {
    const harness = await RouterTestingHarness.create('/admin/cartas/criar');
    expect(TestBed.inject(Router).url).toBe('/admin/cartas/criar');
    expect(harness.routeNativeElement?.querySelector('#card-name')).not.toBeNull();
  });

  it('mantém /login como placeholder e permite voltar ao painel', async () => {
    const harness = await RouterTestingHarness.create('/login');
    expect(harness.routeNativeElement?.querySelector('form, input')).toBeNull();
    const link = harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[href="/admin/dashboard"]');
    expect(link).not.toBeNull();
    link!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/admin/dashboard');
  });
});
