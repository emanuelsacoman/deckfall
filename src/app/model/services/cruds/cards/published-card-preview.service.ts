import { Injectable, InjectionToken, inject } from '@angular/core';
import { Firestore, Timestamp, doc, getDocFromServer } from '@angular/fire/firestore';
import { Card } from '../../../interfaces/Cards/card';
import { publishedCardPreviewErrorCode, publishedCardPreviewMessage } from '../../../interfaces/Cards/published-card-preview-error';
import { PublishedCardStorageService, publishedCardPreviewPath } from '../../fire/published-card-storage.service';
import { CardPreviewService } from '../../tools/card-preview.service';
import { parseCard } from './card-persistence';

export interface PublishedCardPreviewRepairResult {
  cardId: string;
  name: string;
  path: string;
  status: 'synchronized' | 'failed' | 'skipped';
  message: string;
}

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
        if (!await this.uploadCurrent(card)) return [this.changedWarning(path)];
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
      return [`A carta foi salva, mas a representação publicada em ${path} não pôde ser ${operation}. ${recovery} ${this.safeDiagnostic(error)}`];
    }
  }

  /** Explicit administrative backfill: sequential rendering, without changing any card document. */
  async repairPublished(
    cards: readonly Pick<Card, 'id' | 'name' | 'status'>[],
    onResult: (result: PublishedCardPreviewRepairResult) => void,
    shouldContinue: () => boolean = () => true
  ): Promise<PublishedCardPreviewRepairResult[]> {
    const published = [...new Map(cards.filter(card => card.status === 'published').map(card => [card.id, card])).values()];
    const results: PublishedCardPreviewRepairResult[] = [];
    for (const entry of published) {
      if (!shouldContinue()) break;
      const path = publishedCardPreviewPath(entry.id);
      let result: PublishedCardPreviewRepairResult;
      try {
        const current = await this.reader.getById(entry.id);
        if (!current || current.status !== 'published') {
          result = { cardId: entry.id, name: entry.name, path, status: 'skipped',
            message: 'Ignorada: a carta não está mais publicada. Nenhum arquivo foi alterado.' };
        } else if (!shouldContinue()) {
          break;
        } else if (await this.uploadCurrent(current)) {
          result = { cardId: entry.id, name: current.name, path, status: 'synchronized',
            message: 'PNG publicado regenerado e enviado. A versão da carta foi conferida.' };
        } else {
          result = { cardId: entry.id, name: current.name, path, status: 'failed',
            message: 'A carta mudou durante a sincronização. A imagem pode estar ausente ou desatualizada; tente novamente com a versão atual.' };
        }
      } catch (error: unknown) {
        result = { cardId: entry.id, name: entry.name, path, status: 'failed',
          message: `Não foi possível sincronizar o PNG. Confira o acesso administrativo, os assets da carta e as Rules do Storage. ${this.safeDiagnostic(error)}` };
      }
      results.push(result);
      onResult(result);
    }
    return results;
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
      return [`Limpeza da representação publicada pendente em ${path}. A exclusão da carta já foi confirmada. ${recovery} ${this.safeDiagnostic(error)}`];
    }
  }

  private isStoragePermissionError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error
      && (error.code === 'storage/unauthorized' || error.code === 'storage/unauthenticated');
  }

  private changedWarning(path: string): string {
    return `A carta foi salva, mas mudou em outra sessão durante a sincronização de ${path}. A imagem pode estar ausente ou desatualizada. Reabra a carta e salve a versão atual novamente.`;
  }

  private async uploadCurrent(card: Card): Promise<boolean> {
    const blob = await this.renderer.render(card);
    if (!sameVersion(card, await this.reader.getById(card.id))) return false;
    await this.storage.uploadPreview(card.id, blob);
    // Firestore and Storage are not atomic: report a racing edit instead of claiming success.
    return sameVersion(card, await this.reader.getById(card.id));
  }

  private safeDiagnostic(error: unknown): string {
    const code = publishedCardPreviewErrorCode(error);
    return `${publishedCardPreviewMessage(error)}${code ? ` Código: ${code}.` : ''}`;
  }
}
