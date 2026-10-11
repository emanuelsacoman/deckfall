import { Injectable, OnDestroy, inject, signal, untracked } from '@angular/core';
import { CARD_CANVAS_CONFIG, CardCanvasAsset, CardCanvasData, PendingCardAsset } from '../../interfaces/Cards/card-canvas';
import { CardStorageService } from '../fire/card-storage.service';

export interface CardAssetDownloadError {
  assetId: string;
  fileName: string;
  message: string;
}

interface FailedAssetDownload {
  asset: CardCanvasAsset;
  error: Error;
}

@Injectable()
export class CardEditorAssetsService implements OnDestroy {
  private readonly storage = inject(CardStorageService);
  private readonly files = new Map<string, File>();
  private readonly cache = new Map<string, File>();
  private readonly sources = new Map<string, string>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly failed = new Map<string, FailedAssetDownload>();
  private readonly desired = new Map<string, string>();
  private readonly persisted = new Map<string, string>();
  private readonly urlState = signal<Record<string, string>>({});
  private readonly downloadErrorState = signal<readonly CardAssetDownloadError[]>([]);
  private disposed = false;
  private generation = 0;
  readonly urls = this.urlState.asReadonly();
  readonly downloadErrors = this.downloadErrorState.asReadonly();

  register(asset: CardCanvasAsset, file: File): void {
    this.desired.set(asset.id, this.assetKey(asset));
    this.remember(asset, file, true);
    this.failed.delete(this.assetKey(asset));
    this.publishErrors();
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
    if (!activate || (this.sources.get(asset.id) === cacheKey && this.files.get(asset.id) === file && untracked(this.urlState)[asset.id])) return;
    this.sources.set(asset.id, cacheKey);
    this.files.set(asset.id, file);
    const old = untracked(this.urlState)[asset.id];
    if (old) URL.revokeObjectURL(old);
    this.urlState.update(urls => ({ ...urls, [asset.id]: URL.createObjectURL(file) }));
  }

  async ensure(canvas: CardCanvasData): Promise<void> {
    if (this.disposed) return;
    const generation = this.generation;
    this.setDesired(canvas);
    for (let start = 0; start < canvas.assets.length; start += 4) {
      if (this.disposed || generation !== this.generation) return;
      // Each task records its own failure; one unavailable image must not skip the next batch.
      await Promise.allSettled(canvas.assets.slice(start, start + 4).map(asset => this.ensureAsset(asset, generation)));
    }
    if (this.disposed || generation !== this.generation) return;
    const failure = canvas.assets.find(asset => this.isDesired(asset, generation) && this.failed.has(this.assetKey(asset)));
    if (failure) throw this.failed.get(this.assetKey(failure))!.error;
  }

  retryFailed(): void {
    for (const key of this.desired.values()) this.failed.delete(key);
    this.publishErrors();
  }

  private async ensureAsset(asset: CardCanvasAsset, generation: number): Promise<void> {
    if (!this.isDesired(asset, generation)) return;
    const key = this.assetKey(asset);
    if (this.sources.get(asset.id) === key && this.files.has(asset.id)) return;
    if (this.failed.has(key)) return;
    const cached = this.cache.get(key);
    if (cached) {
      try { this.remember(asset, cached, true); }
      catch (error: unknown) { this.recordFailure(asset, error, generation); }
      return;
    }
    const pending = this.inFlight.get(key);
    if (pending) { await pending; return; }
    const task = (async () => {
      try {
        if (!asset.storagePath) throw new Error(`A imagem ${asset.fileName} não está disponível. Selecione o arquivo novamente.`);
        const blob = await this.storage.getAssetBlob(asset);
        if (this.disposed || generation !== this.generation) return;
        this.remember(asset, new File([blob], asset.fileName, { type: asset.contentType }), this.isDesired(asset, generation));
      } catch (error: unknown) {
        this.recordFailure(asset, error, generation);
      }
    })();
    this.inFlight.set(key, task);
    try { await task; } finally { if (this.inFlight.get(key) === task) this.inFlight.delete(key); }
  }

  private isDesired(asset: CardCanvasAsset, generation: number): boolean {
    return !this.disposed && generation === this.generation && this.desired.get(asset.id) === this.assetKey(asset);
  }

  private setDesired(canvas: CardCanvasData): void {
    this.desired.clear();
    for (const asset of canvas.assets) this.desired.set(asset.id, this.assetKey(asset));
    const urls = { ...untracked(this.urlState) };
    let changed = false;
    for (const [id, source] of this.sources) if (this.desired.get(id) !== source) {
      this.sources.delete(id); this.files.delete(id);
      if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; changed = true; }
    }
    if (changed) this.urlState.set(urls);
    this.publishErrors();
  }

  private recordFailure(asset: CardCanvasAsset, error: unknown, generation: number): void {
    if (!this.isDesired(asset, generation)) return;
    const message = error instanceof Error ? error.message : 'Confira sua conexão, seu acesso e a configuração do Storage.';
    this.failed.set(this.assetKey(asset), { asset, error: new Error(`Não foi possível carregar ${asset.fileName}. ${message}`) });
    this.publishErrors();
  }

  private publishErrors(): void {
    const errors = [...this.desired.values()].flatMap(key => {
      const failure = this.failed.get(key);
      return failure ? [{ assetId: failure.asset.id, fileName: failure.asset.fileName, message: failure.error.message }] : [];
    });
    const previous = untracked(this.downloadErrorState);
    if (previous.length !== errors.length || errors.some((error, index) => error.assetId !== previous[index].assetId
      || error.fileName !== previous[index].fileName || error.message !== previous[index].message)) this.downloadErrorState.set(errors);
  }

  markPersisted(canvas: CardCanvasData): void {
    this.persisted.clear();
    for (const asset of canvas.assets) if (asset.storagePath) {
      this.persisted.set(asset.id, asset.storagePath);
      const file = this.files.get(asset.id);
      if (file) { const key = this.assetKey(asset); this.cache.set(key, file); this.sources.set(asset.id, key); this.desired.set(asset.id, key); this.failed.delete(key); }
    }
    this.publishErrors();
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
    this.files.clear(); this.cache.clear(); this.sources.clear(); this.desired.clear(); this.inFlight.clear(); this.failed.clear(); this.persisted.clear(); this.urlState.set({}); this.downloadErrorState.set([]);
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.reset();
  }
  private assetKey(asset: CardCanvasAsset): string {
    return `${asset.id}:${asset.storagePath ?? 'local'}:${asset.fileName}:${asset.contentType}:${asset.size}`;
  }
}
