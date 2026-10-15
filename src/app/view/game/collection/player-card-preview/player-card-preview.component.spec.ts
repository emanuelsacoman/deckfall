import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Card } from '../../../../model/interfaces/Cards/card';
import { PublishedCardPreviewError } from '../../../../model/interfaces/Cards/published-card-preview-error';
import {
  PUBLISHED_CARD_STORAGE_CLIENT, PublishedCardStorageClient, PublishedCardStorageService
} from '../../../../model/services/fire/published-card-storage.service';
import { defaultCardData, fantasyBasicCanvas } from '../../../../model/services/tools/card-canvas-factory';
import { PlayerCardPreviewComponent } from './player-card-preview.component';

class PreviewObserver implements IntersectionObserver {
  static instances: PreviewObserver[] = [];
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[] = [0];
  private target?: Element;
  readonly observe = jasmine.createSpy('observe').and.callFake((target: Element) => { this.target = target; });
  readonly unobserve = jasmine.createSpy('unobserve');
  readonly disconnect = jasmine.createSpy('disconnect');
  readonly takeRecords = jasmine.createSpy('takeRecords').and.returnValue([]);
  constructor(private readonly callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    this.root = options.root ?? null; this.rootMargin = options.rootMargin ?? '0px'; PreviewObserver.instances.push(this);
  }
  emit(isIntersecting = true): void {
    this.callback([{ target: this.target!, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0,
      time: 0, rootBounds: null, boundingClientRect: new DOMRect(), intersectionRect: new DOMRect() }], this);
  }
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

describe('PlayerCardPreviewComponent', () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'IntersectionObserver');
  const png = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5MsAAAAASUVORK5CYII='), character => character.charCodeAt(0))], { type: 'image/png' });
  let fixture: ComponentFixture<PlayerCardPreviewComponent>;
  let component: PlayerCardPreviewComponent;
  let storage: jasmine.SpyObj<PublishedCardStorageService>;
  let createUrl: jasmine.Spy;
  let revokeUrl: jasmine.Spy;
  let diagnostic: jasmine.Spy;
  function card(id = 'nyra'): Card {
    const data = { ...defaultCardData(), name: 'Nyra', status: 'published' as const };
    return { ...data, id, slug: id, art: null, createdAt: null, updatedAt: null, canvas: { ...fantasyBasicCanvas(data), width: 800, height: 400 } };
  }
  async function settle(): Promise<void> { await fixture.whenStable(); fixture.detectChanges(); }
  function observer(): PreviewObserver { return PreviewObserver.instances[0]; }

  beforeEach(async () => {
    PreviewObserver.instances = [];
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, writable: true, value: PreviewObserver });
    storage = jasmine.createSpyObj<PublishedCardStorageService>('PublishedCardStorageService', ['getPreviewBlob']);
    storage.getPreviewBlob.and.resolveTo(png);
    createUrl = spyOn(URL, 'createObjectURL').and.callThrough();
    revokeUrl = spyOn(URL, 'revokeObjectURL').and.callThrough();
    diagnostic = spyOn(console, 'warn');
    await TestBed.configureTestingModule({ imports: [PlayerCardPreviewComponent], providers: [{ provide: PublishedCardStorageService, useValue: storage }] }).compileComponents();
    fixture = TestBed.createComponent(PlayerCardPreviewComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('card', card());
  });

  afterEach(() => {
    fixture.destroy();
    if (descriptor) Object.defineProperty(window, 'IntersectionObserver', descriptor);
    else Reflect.deleteProperty(window, 'IntersectionObserver');
  });

  it('baixa apenas a preview publicada ao aproximar da tela e evita requisições duplicadas', async () => {
    fixture.detectChanges();
    expect(storage.getPreviewBlob).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.player-card-preview').style.aspectRatio).toBe('800 / 400');
    expect(observer().rootMargin).toBe('200px');
    observer().emit(false); expect(storage.getPreviewBlob).not.toHaveBeenCalled();
    observer().emit(); observer().emit(); await settle();
    expect(storage.getPreviewBlob).toHaveBeenCalledOnceWith('nyra');
    expect(observer().disconnect).toHaveBeenCalled();
    const image: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(image.alt).toBe('Carta completa: Nyra');
    expect(getComputedStyle(image).objectFit).toBe('contain');
  });

  it('usa as dimensões reais do PNG e limpa a proporção anterior ao trocar a carta', async () => {
    fixture.detectChanges(); observer().emit(); await settle();
    const image: HTMLImageElement = fixture.nativeElement.querySelector('img');
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1086 },
      naturalHeight: { configurable: true, value: 1448 }
    });
    image.dispatchEvent(new Event('load')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.player-card-preview').style.aspectRatio).toBe('1086 / 1448');
    expect(storage.getPreviewBlob).toHaveBeenCalledTimes(1);

    const pending = deferred<Blob>(); storage.getPreviewBlob.and.returnValue(pending.promise);
    fixture.componentRef.setInput('card', card('other')); fixture.detectChanges();
    expect(component.aspectRatio).toBe('800 / 400');
    pending.resolve(png); await settle();
  });

  it('mostra loading durante download sem renderer ou assets privados', async () => {
    const pending = deferred<Blob>(); storage.getPreviewBlob.and.returnValue(pending.promise);
    fixture.detectChanges(); observer().emit(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Carregando carta');
    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
    expect(component.loading()).toBeTrue();
    pending.resolve(png); await settle(); expect(component.loading()).toBeFalse();
  });

  it('oferece retry isolado quando a imagem publicada está ausente', async () => {
    storage.getPreviewBlob.and.rejectWith({ code: 'storage/object-not-found' });
    fixture.detectChanges(); observer().emit(); await settle();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('A imagem desta carta ainda não foi publicada');
    storage.getPreviewBlob.and.resolveTo(png);
    fixture.nativeElement.querySelector('button').click(); await settle();
    expect(storage.getPreviewBlob).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
  });

  for (const [code, message] of [
    ['storage/object-not-found', 'A imagem desta carta ainda não foi publicada.'],
    ['storage/unauthorized', 'Sua conta não possui autorização para carregar esta imagem.'],
    ['storage/unauthenticated', 'Sua sessão precisa ser renovada para carregar esta imagem.'],
    ['storage/retry-limit-exceeded', 'Não foi possível baixar a imagem. Confira sua conexão.'],
    ['network', 'Não foi possível baixar a imagem. Confira sua conexão.'],
    ['preview-invalid', 'A imagem publicada desta carta está inválida.'],
    ['storage/unknown', 'Não foi possível carregar a imagem publicada. Tente novamente.']
  ]) {
    it(`mostra mensagem específica para ${code} sem expor a causa original`, async () => {
      const cardId = '46f5c359-0d1e-423e-911e-4ba592567405';
      const path = `published-cards/${cardId}/preview.png`;
      const cause = new Error('Authorization: secret https://example.test/image?token=private');
      fixture.componentRef.setInput('card', card(cardId));
      storage.getPreviewBlob.and.rejectWith(new PublishedCardPreviewError(code, cardId, path, 'mensagem não destinada à UI', { cause }));
      fixture.detectChanges(); observer().emit(); await settle();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(message);
      expect(diagnostic).toHaveBeenCalledOnceWith('[Deckfall preview]', { cardId, path, code });
      expect(fixture.nativeElement.textContent).not.toContain('Authorization');
      expect(JSON.stringify(diagnostic.calls.allArgs())).not.toContain('token');
      expect(storage.getPreviewBlob).toHaveBeenCalledOnceWith(cardId);
    });
  }

  it('remove Promise rejeitada do cache e retry cria um download e uma Promise novos', async () => {
    const cache = new Map<string, Promise<Blob>>();
    storage.getPreviewBlob.and.rejectWith({ code: 'storage/object-not-found' });
    fixture.componentRef.setInput('previewCache', cache); fixture.detectChanges(); observer().emit();
    const rejected = cache.get('nyra'); expect(rejected).toBeDefined();
    await settle(); expect(cache.has('nyra')).toBeFalse();
    storage.getPreviewBlob.and.resolveTo(png);
    fixture.nativeElement.querySelector('button').click(); await settle();
    expect(storage.getPreviewBlob.calls.allArgs()).toEqual([['nyra'], ['nyra']]);
    expect(cache.get('nyra')).not.toBe(rejected);
    expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
  });

  it('descarta download antigo ao trocar o documento da carta', async () => {
    const first = deferred<Blob>(), second = deferred<Blob>(); storage.getPreviewBlob.and.returnValues(first.promise, second.promise);
    fixture.detectChanges(); observer().emit();
    fixture.componentRef.setInput('card', { ...card('other'), name: 'Outra carta' }); fixture.detectChanges();
    second.resolve(png); await settle(); const url = component.url();
    first.resolve(png); await settle();
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(component.url()).toBe(url);
    expect(fixture.nativeElement.querySelector('img').alt).toBe('Carta completa: Outra carta');
  });

  it('revoga URLs ao trocar a carta e ao destruir o componente', async () => {
    fixture.detectChanges(); observer().emit(); await settle(); const first = component.url();
    fixture.componentRef.setInput('card', card('other')); fixture.detectChanges(); await settle();
    expect(revokeUrl).toHaveBeenCalledWith(first);
    const second = component.url(); fixture.destroy();
    expect(revokeUrl).toHaveBeenCalledWith(second);
    expect(component.url()).toBe('');
  });

  it('ignora conclusão de download e observer após destruir a tela', async () => {
    const pending = deferred<Blob>(); storage.getPreviewBlob.and.returnValue(pending.promise);
    fixture.detectChanges(); observer().emit(); fixture.destroy();
    pending.resolve(png); await Promise.resolve(); observer().emit();
    expect(createUrl).not.toHaveBeenCalled();
    expect(storage.getPreviewBlob).toHaveBeenCalledTimes(1);
    expect(observer().disconnect).toHaveBeenCalled();
  });

  it('revoga imagem que não pode ser decodificada e mantém retry', async () => {
    fixture.detectChanges(); observer().emit(); await settle(); const url = component.url();
    fixture.nativeElement.querySelector('img').dispatchEvent(new Event('error')); fixture.detectChanges();
    expect(revokeUrl).toHaveBeenCalledWith(url);
    expect(component.url()).toBe('');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('A imagem publicada desta carta está inválida');
    expect(fixture.nativeElement.querySelector('button').textContent).toContain('Tentar novamente');
  });

  it('reutiliza a imagem em um cache fornecido pela tela sem compartilhar object URLs', async () => {
    const cache = new Map<string, Promise<Blob>>();
    fixture.componentRef.setInput('previewCache', cache); fixture.detectChanges(); observer().emit(); await settle();
    const firstUrl = component.url(); fixture.destroy();
    fixture = TestBed.createComponent(PlayerCardPreviewComponent); component = fixture.componentInstance;
    fixture.componentRef.setInput('card', card()); fixture.componentRef.setInput('previewCache', cache); fixture.detectChanges();
    PreviewObserver.instances[1].emit(); await settle();
    expect(storage.getPreviewBlob).toHaveBeenCalledOnceWith('nyra');
    expect(component.url()).not.toBe(firstUrl); expect(revokeUrl).toHaveBeenCalledWith(firstUrl);
    expect(createUrl).toHaveBeenCalledTimes(2);
  });

  it('descarta a imagem em cache quando a decodificação falha e permite novo download', async () => {
    const cache = new Map<string, Promise<Blob>>();
    fixture.componentRef.setInput('previewCache', cache); fixture.detectChanges(); observer().emit(); await settle();
    expect(cache.has('nyra')).toBeTrue();
    fixture.nativeElement.querySelector('img').dispatchEvent(new Event('error')); fixture.detectChanges();
    expect(cache.has('nyra')).toBeFalse();
    fixture.nativeElement.querySelector('button').click(); await settle();
    expect(storage.getPreviewBlob).toHaveBeenCalledTimes(2); expect(cache.has('nyra')).toBeTrue();
  });

  it('usa proporção padrão e carrega sem IntersectionObserver quando ele não existe', async () => {
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, writable: true, value: undefined });
    const legacy = card(); delete legacy.canvas;
    fixture.componentRef.setInput('card', legacy); fixture.detectChanges();
    expect(component.aspectRatio).toBe('744 / 1039');
    await settle();
    expect(storage.getPreviewBlob).toHaveBeenCalledOnceWith('nyra');
    expect(PreviewObserver.instances.length).toBe(0);
  });
});

describe('Retry da preview com o serviço de Storage real', () => {
  it('propaga a falha tipada até a UI e refaz o download autenticado no caminho da Nyra', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'IntersectionObserver');
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, writable: true, value: undefined });
    spyOn(console, 'warn');
    const client = jasmine.createSpyObj<PublishedCardStorageClient>('Storage client', ['upload', 'download', 'delete']);
    client.download.and.rejectWith({ code: 'storage/unauthenticated' });
    await TestBed.configureTestingModule({ imports: [PlayerCardPreviewComponent], providers: [
      { provide: PUBLISHED_CARD_STORAGE_CLIENT, useValue: client }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(PlayerCardPreviewComponent);
    try {
      const cardId = '46f5c359-0d1e-423e-911e-4ba592567405';
      const cache = new Map<string, Promise<Blob>>();
      fixture.componentRef.setInput('card', { id: cardId, name: 'Nyra' });
      fixture.componentRef.setInput('previewCache', cache); fixture.detectChanges();
      await fixture.whenStable(); fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Sua sessão precisa ser renovada');
      expect(cache.has(cardId)).toBeFalse();
      const png = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5MsAAAAASUVORK5CYII='), value => value.charCodeAt(0))], { type: 'image/png' });
      client.download.and.resolveTo(png);
      fixture.nativeElement.querySelector('button').click(); await fixture.whenStable(); fixture.detectChanges();
      expect(client.download.calls.allArgs()).toEqual([
        [`published-cards/${cardId}/preview.png`],
        [`published-cards/${cardId}/preview.png`]
      ]);
      expect(cache.has(cardId)).toBeTrue();
      expect(fixture.nativeElement.querySelector('img').alt).toBe('Carta completa: Nyra');
    } finally {
      fixture.destroy();
      if (descriptor) Object.defineProperty(window, 'IntersectionObserver', descriptor);
      else Reflect.deleteProperty(window, 'IntersectionObserver');
    }
  });
});
