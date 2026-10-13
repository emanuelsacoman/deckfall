import { Injectable, InjectionToken, inject } from '@angular/core';
import { Storage, deleteObject, getBlob, ref, uploadBytes } from '@angular/fire/storage';
import { validateCardId } from '../tools/card-validation';

// A 2048 × 2048 RGBA canvas needs about 16 MiB before PNG overhead.
export const PUBLISHED_CARD_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

export interface PublishedCardStorageClient {
  upload(path: string, blob: Blob): Promise<void>;
  download(path: string, maxBytes: number): Promise<Blob>;
  delete(path: string): Promise<void>;
}

export const PUBLISHED_CARD_STORAGE_CLIENT = new InjectionToken<PublishedCardStorageClient>('Published card Storage client', {
  providedIn: 'root',
  factory: () => {
    const storage = inject(Storage);
    if (!Number.isFinite(storage.maxOperationRetryTime) || storage.maxOperationRetryTime > 15_000) {
      storage.maxOperationRetryTime = 15_000;
    }
    return {
      upload: async (path, blob) => {
        await uploadBytes(ref(storage, path), blob, { contentType: 'image/png', cacheControl: 'private, no-store' });
      },
      download: (path, maxBytes) => getBlob(ref(storage, path), maxBytes),
      delete: path => deleteObject(ref(storage, path))
    };
  }
});

export function publishedCardPreviewPath(cardId: string): string {
  validateCardId(cardId);
  return `published-cards/${cardId}/preview.png`;
}

export function publishedPreviewDownloadError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  if (code === 'storage/object-not-found') return 'A imagem publicada ainda não está disponível. Tente novamente mais tarde.';
  if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
    return 'Não foi possível autorizar a imagem publicada. Entre novamente; a carta pode estar indisponível.';
  }
  return 'Não foi possível baixar a imagem publicada. Confira a conexão e o CORS do Storage para este site.';
}

@Injectable({ providedIn: 'root' })
export class PublishedCardStorageService {
  private readonly client = inject(PUBLISHED_CARD_STORAGE_CLIENT);

  validatePreview(blob: Blob): void {
    if (blob.type !== 'image/png') throw new Error('A representação publicada precisa ser PNG.');
    if (blob.size <= 0 || blob.size > PUBLISHED_CARD_PREVIEW_MAX_BYTES) {
      throw new Error('A representação publicada deve ter conteúdo e no máximo 20 MiB.');
    }
  }

  async uploadPreview(cardId: string, blob: Blob): Promise<void> {
    const path = publishedCardPreviewPath(cardId);
    this.validatePreview(blob);
    await this.client.upload(path, blob);
  }

  async getPreviewBlob(cardId: string): Promise<Blob> {
    const path = publishedCardPreviewPath(cardId);
    try {
      const blob = await this.client.download(path, PUBLISHED_CARD_PREVIEW_MAX_BYTES);
      this.validatePreview(blob);
      return blob;
    } catch (error: unknown) {
      throw new Error(publishedPreviewDownloadError(error));
    }
  }

  async deletePreview(cardId: string): Promise<void> {
    const path = publishedCardPreviewPath(cardId);
    try { await this.client.delete(path); }
    catch (error: unknown) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'storage/object-not-found')) throw error;
    }
  }
}
