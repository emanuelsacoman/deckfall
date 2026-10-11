import { Injectable, inject } from '@angular/core';
import { Storage, deleteObject, getBlob, ref, uploadBytes } from '@angular/fire/storage';
import {
  CARD_IMAGE_TYPES, CARD_LIMITS, CardArt
} from '../../interfaces/Cards/card';
import { validateCardId } from '../tools/card-validation';

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
    if (file.name.length > 255) {
      throw new Error('O nome do arquivo deve ter até 255 caracteres.');
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
    this.validatePath(art.storagePath);
    const blob = await getBlob(ref(this.storage, art.storagePath), CARD_LIMITS.imageBytes);
    return URL.createObjectURL(blob);
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
    if (!/^cards\/[a-zA-Z0-9_-]{1,128}\/art\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(path)) {
      throw new Error('Caminho da arte inválido.');
    }
  }

  private isMissingObject(error: unknown): boolean {
    return typeof error === 'object' && error !== null &&
      'code' in error && error.code === 'storage/object-not-found';
  }
}
