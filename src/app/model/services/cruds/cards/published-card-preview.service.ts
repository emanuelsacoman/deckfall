import { Injectable, InjectionToken, inject } from '@angular/core';
import { Firestore, Timestamp, doc, getDocFromServer } from '@angular/fire/firestore';
import { Card } from '../../../interfaces/Cards/card';
import { PublishedCardStorageService, publishedCardPreviewPath } from '../../fire/published-card-storage.service';
import { CardPreviewService } from '../../tools/card-preview.service';
import { errorMessage, parseCard } from './card-persistence';

export interface PublishedCardPreviewReader {
  getById(id: string): Promise<Card | null>;
}

export const PUBLISHED_CARD_PREVIEW_READER = new InjectionToken<PublishedCardPreviewReader>('Published card preview reader', {
  providedIn: 'root',
  factory: () => {
    const firestore = inject(Firestore);
    return { getById: async id => {
      const snapshot = await getDocFromServer(doc(firestore, 'cards', id));
      return snapshot.exists() ? parseCard(snapshot.id, snapshot.data()) : null;
    } };
  }
});

function sameVersion(first: Card, second: Card | null): boolean {
  return second !== null && first.status === second.status && first.updatedAt instanceof Timestamp &&
    second.updatedAt instanceof Timestamp && first.updatedAt.isEqual(second.updatedAt);
}

@Injectable({ providedIn: 'root' })
export class PublishedCardPreviewService {
  private readonly reader = inject(PUBLISHED_CARD_PREVIEW_READER);
  private readonly renderer = inject(CardPreviewService);
  private readonly storage = inject(PublishedCardStorageService);

  /** Called only after the card write was acknowledged. Failures are warnings, never a failed save. */
  async synchronize(cardId: string): Promise<string[]> {
    const path = publishedCardPreviewPath(cardId);
    let operation = 'sincronizada';
    try {
      const card = await this.reader.getById(cardId);
      if (!card) return [this.changedWarning(path)];
      if (card.status === 'published') {
        const blob = await this.renderer.render(card);
        const current = await this.reader.getById(cardId);
        if (!sameVersion(card, current)) return [this.changedWarning(path)];
        await this.storage.uploadPreview(cardId, blob);
        // Detect a write racing the Storage operation; there is no cross-service transaction.
        if (!sameVersion(card, await this.reader.getById(cardId))) return [this.changedWarning(path)];
      } else {
        operation = 'removida';
        if (!sameVersion(card, await this.reader.getById(cardId))) return [this.changedWarning(path)];
        await this.storage.deletePreview(cardId);
        if (!sameVersion(card, await this.reader.getById(cardId))) return [this.changedWarning(path)];
      }
      return [];
    } catch (error: unknown) {
      const recovery = this.isStoragePermissionError(error)
        ? 'Confira as Rules publicadas do Storage e o perfil administrativo desta conta antes de tentar novamente. Depois de corrigir a permissão, reabra a carta e salve novamente.'
        : 'Abra a carta e salve novamente ou confira o Storage.';
      return [`A carta foi salva, mas a representação publicada em ${path} não pôde ser ${operation}. ${recovery} ${errorMessage(error)}`];
    }
  }

  /** A recreated card is preserved even when a previous deletion already succeeded. */
  async cleanupDeleted(cardId: string): Promise<string[]> {
    const path = publishedCardPreviewPath(cardId);
    try {
      if (await this.reader.getById(cardId)) {
        return [`A representação em ${path} foi preservada: o documento da carta existe novamente. Confira antes de remover.`];
      }
      await this.storage.deletePreview(cardId);
      if (await this.reader.getById(cardId)) {
        return [`O documento da carta foi recriado durante a limpeza de ${path}. A imagem pode estar ausente; reabra a carta e salve a versão atual novamente.`];
      }
      return [];
    } catch (error: unknown) {
      const recovery = this.isStoragePermissionError(error)
        ? 'Confira as Rules publicadas do Storage e o perfil administrativo desta conta antes de tentar a limpeza novamente.'
        : 'Confira o Storage.';
      return [`Limpeza da representação publicada pendente em ${path}. A exclusão da carta já foi confirmada. ${recovery} ${errorMessage(error)}`];
    }
  }

  private isStoragePermissionError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error
      && (error.code === 'storage/unauthorized' || error.code === 'storage/unauthenticated');
  }

  private changedWarning(path: string): string {
    return `A carta foi salva, mas mudou em outra sessão durante a sincronização de ${path}. A imagem pode estar ausente ou desatualizada. Reabra a carta e salve a versão atual novamente.`;
  }
}
