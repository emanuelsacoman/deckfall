import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { CARD_CANVAS_CONFIG, CardCanvasAsset, CardCanvasData, PendingCardAsset } from '../../interfaces/Cards/card-canvas';
import { CardStorageService } from '../fire/card-storage.service';

@Injectable()
export class CardEditorAssetsService implements OnDestroy {
  private readonly storage = inject(CardStorageService);
  private readonly files = new Map<string, File>();
  private readonly persisted = new Map<string, string>();
  private readonly urlState = signal<Record<string, string>>({});
  private disposed = false;
  private generation = 0;
  readonly urls = this.urlState.asReadonly();

  register(asset: CardCanvasAsset, file: File): void {
    this.storage.validateImage(file);
    const cachedBytes = [...this.files.entries()].reduce((total, [id, cached]) => total + (id === asset.id ? 0 : cached.size), 0);
    if (cachedBytes + file.size > CARD_CANVAS_CONFIG.assetCacheBytes) {
      throw new Error('O limite de imagens desta sessão foi atingido. Salve e reabra o editor antes de enviar mais arquivos.');
    }
    this.files.set(asset.id, file);
    const old = this.urlState()[asset.id];
    if (old) URL.revokeObjectURL(old);
    this.urlState.update(urls => ({ ...urls, [asset.id]: URL.createObjectURL(file) }));
  }

  async ensure(canvas: CardCanvasData): Promise<void> {
    const generation = this.generation;
    for (let start = 0; start < canvas.assets.length; start += 4) {
      await Promise.all(canvas.assets.slice(start, start + 4).map(async asset => {
        if (this.files.has(asset.id)) return;
        if (!asset.storagePath) throw new Error(`A imagem ${asset.fileName} não está disponível. Selecione o arquivo novamente.`);
        const blob = await this.storage.getAssetBlob(asset);
        if (this.disposed || generation !== this.generation) return;
        this.register(asset, new File([blob], asset.fileName, { type: asset.contentType }));
      }));
    }
  }

  markPersisted(canvas: CardCanvasData): void {
    this.persisted.clear();
    for (const asset of canvas.assets) if (asset.storagePath) this.persisted.set(asset.id, asset.storagePath);
  }

  pending(canvas: CardCanvasData): PendingCardAsset[] {
    return canvas.assets.flatMap(asset => {
      if (asset.storagePath && this.persisted.get(asset.id) === asset.storagePath) return [];
      const file = this.files.get(asset.id);
      return file ? [{ id: asset.id, file }] : [];
    });
  }

  async snapshotFiles(canvas: CardCanvasData): Promise<PendingCardAsset[]> {
    await this.ensure(canvas);
    return canvas.assets.map(asset => {
      const file = this.files.get(asset.id);
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
    this.files.clear(); this.persisted.clear(); this.urlState.set({});
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.reset();
  }
}
