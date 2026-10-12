import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Card } from '../../../../../model/interfaces/Cards/card';
import { defaultCardData, fantasyBasicCanvas } from '../../../../../model/services/tools/card-canvas-factory';
import { CardPreviewService } from '../../../../../model/services/tools/card-preview.service';
import { CardPreviewComponent } from './card-preview.component';

class PreviewObserver implements IntersectionObserver {
  static instances: PreviewObserver[] = [];
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];
  private target?: Element;
  readonly observe = jasmine.createSpy('observe').and.callFake((target: Element) => { this.target = target; });
  readonly unobserve = jasmine.createSpy('unobserve');
  readonly disconnect = jasmine.createSpy('disconnect');
  readonly takeRecords = jasmine.createSpy('takeRecords').and.returnValue([]);

  constructor(private readonly callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? '0px';
    this.thresholds = Array.isArray(options.threshold) ? options.threshold : [options.threshold ?? 0];
    PreviewObserver.instances.push(this);
  }

  emit(isIntersecting: boolean): void {
    if (!this.target) throw new Error('O observador não recebeu um elemento.');
    this.callback([{
      target: this.target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0,
      time: 0, rootBounds: null, boundingClientRect: new DOMRect(), intersectionRect: new DOMRect()
    }], this);
  }
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: Error): void } {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}

describe('CardPreviewComponent', () => {
  const observerDescriptor = Object.getOwnPropertyDescriptor(window, 'IntersectionObserver');
  const png = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5MsAAAAASUVORK5CYII='), character => character.charCodeAt(0))], { type: 'image/png' });
  let fixture: ComponentFixture<CardPreviewComponent>;
  let component: CardPreviewComponent;
  let previews: jasmine.SpyObj<CardPreviewService>;
  let createUrl: jasmine.Spy<typeof URL.createObjectURL>;
  let revokeUrl: jasmine.Spy<typeof URL.revokeObjectURL>;

  function card(id = 'card-1'): Card {
    const data = { ...defaultCardData(), name: 'Dragão' };
    return { ...data, id, slug: 'dragao', art: null, createdAt: null, updatedAt: null,
      canvas: { ...fantasyBasicCanvas(data), width: 800, height: 400 } };
  }

  function observer(): PreviewObserver { return PreviewObserver.instances[0]; }

  async function settle(): Promise<void> {
    await fixture.whenStable(); fixture.detectChanges();
  }

  beforeEach(async () => {
    PreviewObserver.instances = [];
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, writable: true, value: PreviewObserver });
    previews = jasmine.createSpyObj<CardPreviewService>('CardPreviewService', ['render']);
    previews.render.and.resolveTo(png);
    createUrl = spyOn(URL, 'createObjectURL').and.callThrough();
    revokeUrl = spyOn(URL, 'revokeObjectURL').and.callThrough();
    await TestBed.configureTestingModule({
      imports: [CardPreviewComponent], providers: [{ provide: CardPreviewService, useValue: previews }]
    }).compileComponents();
    fixture = TestBed.createComponent(CardPreviewComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('card', card());
  });

  afterEach(() => {
    fixture.destroy();
    if (observerDescriptor) Object.defineProperty(window, 'IntersectionObserver', observerDescriptor);
    else Reflect.deleteProperty(window, 'IntersectionObserver');
  });

  it('aguarda proximidade da tela e inicia apenas uma prévia ao entrar na área observada', async () => {
    fixture.detectChanges();
    expect(previews.render).not.toHaveBeenCalled();
    expect(observer().rootMargin).toBe('200px');
    expect(observer().observe).toHaveBeenCalledWith(fixture.nativeElement.querySelector('.card-preview'));
    observer().emit(false);
    expect(previews.render).not.toHaveBeenCalled();
    observer().emit(true); observer().emit(true);
    await settle();
    expect(previews.render).toHaveBeenCalledTimes(1);
    expect(observer().disconnect).toHaveBeenCalled();
    expect(component.url()).toBeTruthy();
    expect(component.loading()).toBeFalse();
  });

  it('exibe a carta inteira com proporção personalizada e texto alternativo identificável', async () => {
    fixture.detectChanges(); observer().emit(true); await settle();
    const frame: HTMLElement = fixture.nativeElement.querySelector('.card-preview');
    const image: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(component.aspectRatio).toBe('800 / 400');
    expect(frame.style.aspectRatio).toBe('800 / 400');
    expect(image.alt).toBe('Carta completa: Dragão');
    expect(getComputedStyle(image).objectFit).toBe('contain');
    expect(frame.getAttribute('aria-busy')).toBe('false');
  });

  it('adota a proporção do modelo padrão para cartas antigas sem canvas', () => {
    const legacy = card(); delete legacy.canvas;
    fixture.componentRef.setInput('card', legacy); fixture.detectChanges();
    expect(component.aspectRatio).toBe('744 / 1039');
    expect(previews.render).not.toHaveBeenCalled();
  });

  for (const sameId of [false, true]) {
    it(`descarta a resposta antiga ao trocar ${sameId ? 'o design da mesma carta' : 'o ID da carta'}`, async () => {
      const first = deferred<Blob>(), second = deferred<Blob>();
      previews.render.and.returnValues(first.promise, second.promise);
      fixture.detectChanges(); observer().emit(true);
      const originalSignal = previews.render.calls.first().args[1];
      const changed = card(sameId ? 'card-1' : 'card-2'); changed.name = 'Carta alterada';
      fixture.componentRef.setInput('card', changed); fixture.detectChanges();
      expect(originalSignal?.aborted).toBeTrue();
      expect(previews.render).toHaveBeenCalledTimes(2);
      first.resolve(png); await settle();
      expect(createUrl).not.toHaveBeenCalled();
      expect(component.loading()).toBeTrue();
      second.resolve(png); await settle();
      expect(createUrl).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector('img').alt).toBe('Carta completa: Carta alterada');
      expect(component.loading()).toBeFalse();
    });
  }

  it('libera a imagem pronta ao trocar o documento e mantém uma única URL corrente', async () => {
    fixture.detectChanges(); observer().emit(true); await settle();
    const oldUrl = component.url();
    fixture.componentRef.setInput('card', card('card-2')); fixture.detectChanges(); await settle();
    expect(revokeUrl).toHaveBeenCalledWith(oldUrl);
    expect(component.url()).not.toBe(oldUrl);
    expect(createUrl).toHaveBeenCalledTimes(2);
  });

  it('cancela carregamento e ignora resposta após destruir a tela', async () => {
    const pending = deferred<Blob>(); previews.render.and.returnValue(pending.promise);
    fixture.detectChanges(); observer().emit(true);
    const signal = previews.render.calls.first().args[1];
    fixture.destroy();
    expect(signal?.aborted).toBeTrue();
    expect(observer().disconnect).toHaveBeenCalled();
    pending.resolve(png); await Promise.resolve();
    expect(createUrl).not.toHaveBeenCalled();
    observer().emit(true);
    expect(previews.render).toHaveBeenCalledTimes(1);
  });

  it('revoga a URL exibida quando o componente é destruído', async () => {
    fixture.detectChanges(); observer().emit(true); await settle();
    const url = component.url(), signal = previews.render.calls.first().args[1];
    fixture.destroy();
    expect(revokeUrl).toHaveBeenCalledWith(url);
    expect(signal?.aborted).toBeTrue();
    expect(component.url()).toBe('');
  });

  it('mostra erro isolado e permite uma nova tentativa sem duplicar a solicitação', async () => {
    const retry = deferred<Blob>();
    previews.render.and.returnValues(Promise.reject(new Error('Imagem bloqueada pelo CORS.')), retry.promise);
    fixture.detectChanges(); observer().emit(true); await settle();
    expect(component.loading()).toBeFalse();
    const alert: HTMLElement = fixture.nativeElement.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('Imagem bloqueada pelo CORS.');
    const button: HTMLButtonElement = alert.querySelector('button')!;
    button.click(); void component.loadPreview(); fixture.detectChanges();
    expect(previews.render).toHaveBeenCalledTimes(2);
    expect(component.error()).toBe('');
    expect(component.loading()).toBeTrue();
    retry.resolve(png); await settle();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
  });

  it('libera uma imagem que falha ao exibir e oferece nova tentativa', async () => {
    fixture.detectChanges(); observer().emit(true); await settle();
    const url = component.url();
    fixture.nativeElement.querySelector('img').dispatchEvent(new Event('error')); fixture.detectChanges();
    expect(revokeUrl).toHaveBeenCalledWith(url);
    expect(component.url()).toBe('');
    expect(component.error()).toContain('Não foi possível exibir');
    expect(fixture.nativeElement.querySelector('button').textContent).toContain('Tentar novamente');
  });

  it('carrega imediatamente quando o navegador não oferece IntersectionObserver', async () => {
    Object.defineProperty(window, 'IntersectionObserver', { configurable: true, writable: true, value: undefined });
    fixture.detectChanges(); await settle();
    expect(PreviewObserver.instances).toEqual([]);
    expect(previews.render).toHaveBeenCalledTimes(1);
    expect(component.url()).toBeTruthy();
  });
});
