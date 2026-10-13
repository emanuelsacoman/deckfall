import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Card } from '../../../../model/interfaces/Cards/card';
import { PublishedCardStorageService } from '../../../../model/services/fire/published-card-storage.service';
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
    expect(observer().rootMargin).toBe('200px');
    observer().emit(false); expect(storage.getPreviewBlob).not.toHaveBeenCalled();
    observer().emit(); observer().emit(); await settle();
    expect(storage.getPreviewBlob).toHaveBeenCalledOnceWith('nyra');
    expect(observer().disconnect).toHaveBeenCalled();
    const frame: HTMLElement = fixture.nativeElement.querySelector('.player-card-preview');
    const image: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(image.alt).toBe('Carta completa: Nyra');
    expect(frame.style.aspectRatio).toBe('800 / 400');
    expect(getComputedStyle(image).objectFit).toBe('contain');
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
    storage.getPreviewBlob.and.rejectWith(new Error('storage/object-not-found'));
    fixture.detectChanges(); observer().emit(); await settle();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('A imagem publicada não está disponível');
    storage.getPreviewBlob.and.resolveTo(png);
    fixture.nativeElement.querySelector('button').click(); await settle();
    expect(storage.getPreviewBlob).toHaveBeenCalledTimes(2);
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
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Não foi possível exibir');
    expect(fixture.nativeElement.querySelector('button').textContent).toContain('Tentar novamente');
  });

  it('usa proporção padrão e carrega sem IntersectionObserver quando ele não existe', async () => {
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, writable: true, value: undefined });
    const legacy = card(); delete legacy.canvas;
    fixture.componentRef.setInput('card', legacy); fixture.detectChanges(); await settle();
    expect(component.aspectRatio).toBe('744 / 1039');
    expect(storage.getPreviewBlob).toHaveBeenCalledOnceWith('nyra');
    expect(PreviewObserver.instances.length).toBe(0);
  });
});
