import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { CARD_CANVAS_CONFIG, CardCanvasAsset, CardCanvasData, PendingCardAsset } from '../../interfaces/Cards/card-canvas';
import { CardStorageService } from '../fire/card-storage.service';

@Injectable()
export class CardEditorAssetsService implements OnDestroy {
  private readonly storage = inject(CardStorageService);
  private readonly files = new Map<string, File>();
  private readonly cache = new Map<string, File>();
  private readonly sources = new Map<string, string>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly desired = new Map<string, string>();
  private readonly persisted = new Map<string, string>();
  private readonly urlState = signal<Record<string, string>>({});
  private disposed = false;
  private generation = 0;
  readonly urls = this.urlState.asReadonly();

  register(asset: CardCanvasAsset, file: File): void {
    this.desired.set(asset.id, this.assetKey(asset));
    this.remember(asset, file, true);
  }

  private remember(asset: CardCanvasAsset, file: File, activate: boolean): void {
    this.storage.validateImage(file);
    const cacheKey = this.assetKey(asset);
    const cachedFiles = new Set(this.cache.values());
    const cachedBytes = [...cachedFiles].reduce((total, cached) => total + cached.size, 0);
    if (cachedBytes + (cachedFiles.has(file) ? 0 : file.size) > CARD_CANVAS_CONFIG.assetCacheBytes) {
      throw new Error('O limite de imagens desta sessão foi atingido. Salve e reabra o editor antes de enviar mais arquivos.');
    }
    this.cache.set(cacheKey, file);
    if (!activate || (this.sources.get(asset.id) === cacheKey && this.files.get(asset.id) === file && this.urlState()[asset.id])) return;
    this.sources.set(asset.id, cacheKey);
    this.files.set(asset.id, file);
    const old = this.urlState()[asset.id];
    if (old) URL.revokeObjectURL(old);
    this.urlState.update(urls => ({ ...urls, [asset.id]: URL.createObjectURL(file) }));
  }

  async ensure(canvas: CardCanvasData): Promise<void> {
    const generation = this.generation;
    for (const asset of canvas.assets) this.desired.set(asset.id, this.assetKey(asset));
    for (let start = 0; start < canvas.assets.length; start += 4) {
      await Promise.all(canvas.assets.slice(start, start + 4).map(async asset => {
        const key = this.assetKey(asset);
        if (this.sources.get(asset.id) === key && this.files.has(asset.id)) return;
        const cached = this.cache.get(key);
        if (cached) { this.remember(asset, cached, this.desired.get(asset.id) === key); return; }
        if (!asset.storagePath) throw new Error(`A imagem ${asset.fileName} não está disponível. Selecione o arquivo novamente.`);
        const pending = this.inFlight.get(key);
        if (pending) { await pending; return; }
        const task = (async () => {
          const blob = await this.storage.getAssetBlob(asset);
          if (this.disposed || generation !== this.generation) return;
          this.remember(asset, new File([blob], asset.fileName, { type: asset.contentType }), this.desired.get(asset.id) === key);
        })();
        this.inFlight.set(key, task);
        try { await task; } finally { if (this.inFlight.get(key) === task) this.inFlight.delete(key); }
      }));
    }
  }

  markPersisted(canvas: CardCanvasData): void {
    this.persisted.clear();
    for (const asset of canvas.assets) if (asset.storagePath) {
      this.persisted.set(asset.id, asset.storagePath);
      const file = this.files.get(asset.id);
      if (file) { const key = this.assetKey(asset); this.cache.set(key, file); this.sources.set(asset.id, key); this.desired.set(asset.id, key); }
    }
  }

  pending(canvas: CardCanvasData): PendingCardAsset[] {
    return canvas.assets.flatMap(asset => {
      if (asset.storagePath && this.persisted.get(asset.id) === asset.storagePath) return [];
      const file = this.cache.get(this.assetKey(asset));
      return file ? [{ id: asset.id, file }] : [];
    });
  }

  async snapshotFiles(canvas: CardCanvasData): Promise<PendingCardAsset[]> {
    await this.ensure(canvas);
    return canvas.assets.map(asset => {
      const file = this.cache.get(this.assetKey(asset));
      if (!file) throw new Error(`Arquivo indisponível: ${asset.fileName}.`);
      return { id: asset.id, file };
    });
  }

  restore(files: PendingCardAsset[], canvas: CardCanvasData): void {
    for (const pending of files) {
      const asset = canvas.assets.find(item => item.id === pending.id);
      if (asset) this.register(asset, pending.file);
    }
    this.persisted.clear();
  }

  reset(): void {
    ++this.generation;
    for (const url of Object.values(this.urlState())) URL.revokeObjectURL(url);
    this.files.clear(); this.cache.clear(); this.sources.clear(); this.desired.clear(); this.inFlight.clear(); this.persisted.clear(); this.urlState.set({});
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.reset();
  }
  private assetKey(asset: CardCanvasAsset): string {
    return `${asset.id}:${asset.storagePath ?? 'local'}:${asset.fileName}:${asset.contentType}:${asset.size}`;
  }
}
