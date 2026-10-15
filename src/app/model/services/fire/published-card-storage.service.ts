import { Injectable, InjectionToken, inject } from '@angular/core';
import { Storage, StorageReference, deleteObject, getBlob, ref, uploadBytes } from '@angular/fire/storage';
import { PublishedCardPreviewError, publishedCardPreviewErrorCode, publishedCardPreviewMessage } from '../../interfaces/Cards/published-card-preview-error';
import { validateCardId } from '../tools/card-validation';

// A 2048 × 2048 RGBA canvas needs about 16 MiB before PNG overhead.
export const PUBLISHED_CARD_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;

export interface PublishedCardStorageClient {
  upload(path: string, blob: Blob): Promise<void>;
  download(path: string): Promise<Blob>;
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
      download: path => downloadPublishedCardPreview(ref(storage, path)),
      delete: path => deleteObject(ref(storage, path))
    };
  }
});

/** Firebase 10.14 slices limited downloads without preserving MIME. Validate size after download. */
export function downloadPublishedCardPreview(
  reference: StorageReference,
  download: (reference: StorageReference, maxDownloadSizeBytes?: number) => Promise<Blob> = getBlob
): Promise<Blob> {
  return download(reference);
}

export function publishedCardPreviewPath(cardId: string): string {
  validateCardId(cardId);
  return `published-cards/${cardId}/preview.png`;
}

export function publishedPreviewDownloadError(error: unknown): string {
  return publishedCardPreviewMessage(error);
}

@Injectable({ providedIn: 'root' })
export class PublishedCardStorageService {
  private readonly client = inject(PUBLISHED_CARD_STORAGE_CLIENT);

  validatePreview(blob: Blob, cardId = '', path = ''): void {
    if (!(blob instanceof Blob)) throw new PublishedCardPreviewError('preview-invalid', cardId, path, 'A representação publicada precisa ser um Blob PNG válido.');
    if (blob.type !== 'image/png') throw new PublishedCardPreviewError('preview-invalid', cardId, path, 'A representação publicada precisa ser PNG.');
    if (blob.size <= 0 || blob.size > PUBLISHED_CARD_PREVIEW_MAX_BYTES) {
      throw new PublishedCardPreviewError('preview-invalid', cardId, path, 'A representação publicada deve ter conteúdo e no máximo 20 MiB.');
    }
  }

  async uploadPreview(cardId: string, blob: Blob): Promise<void> {
    const path = publishedCardPreviewPath(cardId);
    this.validatePreview(blob, cardId, path);
    await this.client.upload(path, blob);
  }

  async getPreviewBlob(cardId: string): Promise<Blob> {
    const path = publishedCardPreviewPath(cardId);
    try {
      const blob = await this.client.download(path);
      this.validatePreview(blob, cardId, path);
      return blob;
    } catch (error: unknown) {
      throw new PublishedCardPreviewError(publishedCardPreviewErrorCode(error), cardId, path, publishedPreviewDownloadError(error), { cause: error });
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
