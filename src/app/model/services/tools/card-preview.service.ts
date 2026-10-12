import { Injectable, OnDestroy, inject } from '@angular/core';
import { Card } from '../../interfaces/Cards/card';
import { CardEditorDocument } from '../../interfaces/Cards/card-canvas';
import { CardStorageService } from '../fire/card-storage.service';
import { validateCardCanvas } from './card-canvas-validation';
import { CardKonvaRenderer } from './card-konva-renderer';
import { savedCardDocument } from './card-saved-document';

interface PreviewJob {
  card: Card;
  controller: AbortController;
  started: boolean;
  settled: boolean;
  resolve(blob: Blob): void;
  reject(reason: unknown): void;
  detach(): void;
}

function cancelled(): DOMException { return new DOMException('A prévia foi cancelada.', 'AbortError'); }
function assertActive(signal: AbortSignal): void { if (signal.aborted) throw cancelled(); }

/** Clones only the rendered content; hidden artwork can still supply a visible art binding. */
function previewDocument(card: Card): CardEditorDocument {
  const document = savedCardDocument(card);
  document.canvas = validateCardCanvas(document.canvas);
  const canvas = document.canvas;
  const primary = canvas.elements.find(element => element.type === 'artwork' && element.properties.assetId !== null);
  const primaryId = primary?.type === 'artwork' ? primary.properties.assetId : null;
  canvas.elements = canvas.elements.filter(element => element.visible && element.opacity > 0).map(element => {
    if (element.type === 'image' && element.properties.binding === 'art') {
      element.properties.assetId = primaryId ?? element.properties.assetId;
      element.properties.binding = null;
    }
    return element;
  });
  const ids = new Set<string>();
  if (canvas.background.kind === 'image' || canvas.background.kind === 'texture') {
    if (canvas.background.assetId) ids.add(canvas.background.assetId);
  } else canvas.background.assetId = null;
  for (const element of canvas.elements) {
    if ((element.type === 'image' || element.type === 'artwork') && element.properties.assetId) ids.add(element.properties.assetId);
  }
  canvas.assets = canvas.assets.filter(asset => ids.has(asset.id));
  return document;
}

@Injectable({ providedIn: 'root' })
export class CardPreviewService implements OnDestroy {
  private readonly storage = inject(CardStorageService);
  private readonly queue: PreviewJob[] = [];
  private readonly jobs = new Set<PreviewJob>();
  private active = 0;
  private disposed = false;

  /** Final Blob ownership belongs to the caller; every temporary image URL and Stage is released here. */
  render(card: Card, signal?: AbortSignal): Promise<Blob> {
    if (this.disposed || signal?.aborted) return Promise.reject(cancelled());
    return new Promise<Blob>((resolve, reject) => {
      const controller = new AbortController();
      const onAbort = () => this.cancel(job);
      const job: PreviewJob = { card, controller, started: false, settled: false, resolve, reject,
        detach: () => signal?.removeEventListener('abort', onAbort) };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.jobs.add(job); this.queue.push(job); this.pump();
    });
  }

  ngOnDestroy(): void {
    this.disposed = true;
    for (const job of [...this.jobs]) this.cancel(job);
  }

  private cancel(job: PreviewJob): void {
    if (job.settled) return;
    job.settled = true; job.controller.abort(); job.reject(cancelled()); job.detach();
    if (!job.started) {
      const index = this.queue.indexOf(job);
      if (index >= 0) this.queue.splice(index, 1);
      this.jobs.delete(job);
    }
  }

  private pump(): void {
    while (!this.disposed && this.active < 2 && this.queue.length) {
      const job = this.queue.shift()!;
      if (job.settled) continue;
      job.started = true; ++this.active;
      void this.generate(job.card, job.controller.signal).then(blob => {
        if (!job.settled) { job.settled = true; job.resolve(blob); }
      }, error => {
        if (!job.settled) { job.settled = true; job.reject(error); }
      }).finally(() => {
        job.detach(); this.jobs.delete(job); --this.active; this.pump();
      });
    }
  }

  private async generate(card: Card, signal: AbortSignal): Promise<Blob> {
    assertActive(signal);
    const document = previewDocument(card);
    const urls: Record<string, string> = {};
    let host: HTMLDivElement | undefined;
    let renderer: CardKonvaRenderer | undefined;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      renderer?.destroy(); host?.remove();
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    };
    signal.addEventListener('abort', release, { once: true });
    try {
      // Sequential within each of the two jobs bounds simultaneous Storage reads too.
      for (const asset of document.canvas.assets) {
        assertActive(signal);
        if (!asset.storagePath) throw new Error(`A imagem ${asset.fileName} não está disponível. Reabra a carta e envie o arquivo novamente.`);
        let blob: Blob;
        try { blob = await this.storage.getAssetBlob(asset); }
        catch (error: unknown) {
          assertActive(signal);
          const message = error instanceof Error ? error.message : 'Confira seu acesso e sua conexão.';
          throw new Error(`Não foi possível carregar ${asset.fileName}. ${message}`);
        }
        assertActive(signal);
        urls[asset.id] = URL.createObjectURL(blob);
      }
      assertActive(signal);
      host = window.document.createElement('div');
      host.setAttribute('aria-hidden', 'true'); host.dataset['cardPreviewRenderer'] = '';
      host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;pointer-events:none;';
      window.document.body.appendChild(host);
      renderer = new CardKonvaRenderer(host, { select: () => {}, change: () => {}, zoom: () => {}, error: () => {} });
      renderer.render(document, { zoom: Math.min(1, 320 / Math.max(document.canvas.width, document.canvas.height)),
        grid: false, snap: false, mode: 'preview', busy: false, selectedId: null }, urls);
      const blob = await renderer.exportImage({ format: 'png', pixelRatio: 1 });
      assertActive(signal);
      return blob;
    } finally {
      signal.removeEventListener('abort', release); release();
    }
  }
}
