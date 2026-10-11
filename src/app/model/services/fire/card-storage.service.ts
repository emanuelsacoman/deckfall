import { Injectable, inject } from '@angular/core';
import { Storage, deleteObject, getBlob, ref, uploadBytes } from '@angular/fire/storage';
import {
  CARD_IMAGE_TYPES, CARD_LIMITS, CardArt
} from '../../interfaces/Cards/card';
import { CardAssetOwner, CardCanvasAsset, CardCanvasData, PendingCardAsset } from '../../interfaces/Cards/card-canvas';
import { validateCardId } from '../tools/card-validation';
import { isCardCanvasAssetPath, validateCanvasAsset, validateCardCanvas } from '../tools/card-canvas-validation';

@Injectable({ providedIn: 'root' })
export class CardStorageService {
  private readonly storage = inject(Storage);

  validateImage(file: File): void {
    if (!CARD_IMAGE_TYPES.some(type => type === file.type)) {
      throw new Error('Selecione uma imagem PNG, JPEG ou WebP.');
    }
    if (file.size <= 0 || file.size > CARD_LIMITS.imageBytes) {
      throw new Error('A imagem deve ter conteúdo e no máximo 5 MiB.');
    }
    if (!file.name.trim() || file.name.length > 255) {
      throw new Error('O nome do arquivo deve ter de 1 a 255 caracteres.');
    }
  }

  prepareArt(cardId: string, file: File): CardArt {
    validateCardId(cardId);
    this.validateImage(file);
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    return {
      storagePath: `cards/${cardId}/art/${crypto.randomUUID()}.${extension}`,
      fileName: file.name, contentType: file.type, size: file.size
    };
  }

  async uploadArt(art: CardArt, file: File): Promise<void> {
    this.validateImage(file);
    this.validatePath(art.storagePath);
    await uploadBytes(ref(this.storage, art.storagePath), file, { contentType: file.type });
  }

  async getArtUrl(art: CardArt): Promise<string> {
    const blob = await this.getAssetBlob(art);
    return URL.createObjectURL(blob);
  }

  prepareAsset(owner: CardAssetOwner, assetId: string, file: File): CardCanvasAsset {
    validateCardId(owner.id);
    validateCardId(assetId);
    if (owner.kind !== 'card' && owner.kind !== 'template') throw new Error('Proprietário do asset inválido.');
    this.validateImage(file);
    const namespace = owner.kind === 'card' ? 'cards' : 'templates';
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    return {
      id: assetId, storagePath: `${namespace}/${owner.id}/assets/${crypto.randomUUID()}.${extension}`,
      fileName: file.name, contentType: file.type, size: file.size
    };
  }

  async uploadAsset(asset: CardCanvasAsset, file: File): Promise<void> {
    const value = validateCanvasAsset(asset);
    this.validateImage(file);
    if (!value.storagePath) throw new Error('O asset ainda não possui caminho de armazenamento.');
    await uploadBytes(ref(this.storage, value.storagePath), file, { contentType: file.type });
  }

  async getAssetBlob(asset: CardCanvasAsset | CardArt): Promise<Blob> {
    if (!asset.storagePath) throw new Error('O asset ainda não foi enviado ao Storage.');
    this.validatePath(asset.storagePath);
    return getBlob(ref(this.storage, asset.storagePath), CARD_LIMITS.imageBytes);
  }

  async deleteAsset(asset: CardCanvasAsset | CardArt): Promise<void> {
    if (!asset.storagePath) return;
    await this.deleteArt({ ...asset, storagePath: asset.storagePath });
  }

  isOwnedAsset(owner: CardAssetOwner, path: string): boolean {
    if (!isCardCanvasAssetPath(path)) return false;
    return owner.kind === 'card'
      ? path.startsWith(`cards/${owner.id}/assets/`) || path.startsWith(`cards/${owner.id}/art/`)
      : path.startsWith(`templates/${owner.id}/assets/`);
  }

  // `attempted` lets callers compensate even when an upload loses its acknowledgement.
  async materializeAssets(owner: CardAssetOwner, canvas: CardCanvasData, pending: readonly PendingCardAsset[],
      attempted: CardCanvasAsset[]): Promise<CardCanvasData> {
    const value = validateCardCanvas(canvas);
    this.validatePendingAssets(value, pending);
    const files = new Map<string, File>(pending.map(entry => [entry.id, entry.file]));
    const assets: CardCanvasAsset[] = [];
    for (const asset of value.assets) {
      let file = files.get(asset.id);
      if (!file && asset.storagePath && this.isOwnedAsset(owner, asset.storagePath)) {
        assets.push(asset);
        continue;
      }
      if (!file && asset.storagePath) {
        const blob = await this.getAssetBlob(asset);
        file = new File([blob], asset.fileName, { type: asset.contentType });
      }
      if (!file) throw new Error(`O arquivo do asset ${asset.id} não está disponível. Selecione a imagem novamente.`);
      const uploaded = this.prepareAsset(owner, asset.id, file);
      attempted.push(uploaded);
      await this.uploadAsset(uploaded, file);
      assets.push(uploaded);
    }
    return validateCardCanvas({ ...value, assets });
  }

  validatePendingAssets(canvas: CardCanvasData, pending: readonly PendingCardAsset[]): void {
    const ids = new Set<string>();
    for (const asset of pending) {
      validateCardId(asset.id);
      this.validateImage(asset.file);
      if (ids.has(asset.id)) throw new Error('Há uploads repetidos para o mesmo asset.');
      if (!canvas.assets.some(item => item.id === asset.id)) throw new Error('Um upload não pertence ao canvas atual.');
      ids.add(asset.id);
    }
  }

  async deleteArt(art: CardArt): Promise<void> {
    this.validatePath(art.storagePath);
    try {
      await deleteObject(ref(this.storage, art.storagePath));
    } catch (error: unknown) {
      if (!this.isMissingObject(error)) throw error;
    }
  }

  private validatePath(path: string): void {
    if (!isCardCanvasAssetPath(path)) {
      throw new Error('Caminho da arte inválido.');
    }
  }

  private isMissingObject(error: unknown): boolean {
    return typeof error === 'object' && error !== null &&
      'code' in error && error.code === 'storage/object-not-found';
  }
}
