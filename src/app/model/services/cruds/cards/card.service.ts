import { Injectable, inject } from '@angular/core';
import {
  Firestore, Timestamp, collection, doc, getDocFromServer, getDocsFromServer,
  orderBy, query, runTransaction, serverTimestamp, setDoc
} from '@angular/fire/firestore';
import {
  Card, CardArt, CardInput, CardOperationError, CardSaveResult
} from '../../../interfaces/Cards/card';
import { CardStorageService } from '../../fire/card-storage.service';
import { cardSlug, validateCardId, validateCardInput } from '../../tools/card-validation';

@Injectable({ providedIn: 'root' })
export class CardService {
  private readonly firestore = inject(Firestore);
  private readonly storage = inject(CardStorageService);
  private readonly pending = new Set<string>();

  async list(): Promise<Card[]> {
    const snapshot = await getDocsFromServer(query(collection(this.firestore, 'cards'), orderBy('updatedAt', 'desc')));
    return snapshot.docs.map(item => ({ ...item.data(), id: item.id } as Card));
  }

  async getById(id: string): Promise<Card | null> {
    validateCardId(id);
    const snapshot = await getDocFromServer(doc(this.firestore, 'cards', id));
    return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as Card : null;
  }

  async create(input: CardInput, file?: File): Promise<CardSaveResult> {
    const value = validateCardInput(input);
    if (file) this.storage.validateImage(file);
    const reference = doc(collection(this.firestore, 'cards'));
    const id = reference.id;
    const art = file ? this.storage.prepareArt(id, file) : null;
    let draftSaved = false;
    let uploadStarted = false;
    let committed = false;
    try {
      await setDoc(reference, {
        ...value, slug: cardSlug(value.name), status: file ? 'draft' : value.status,
        art: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      draftSaved = true;
      if (art && file) {
        const draft = await this.getById(id);
        if (!draft) throw new Error('O rascunho não foi encontrado após a gravação.');
        uploadStarted = true;
        await this.storage.uploadArt(art, file);
        await this.commitUpdate(draft, value, art);
      }
      committed = true;
      return { id, warnings: [] };
    } catch (error: unknown) {
      const cleanup = art && uploadStarted && !committed ? await this.cleanupUnreferencedArt(id, art) : null;
      const recovery = draftSaved
        ? ` A carta ${id} foi preservada; abra a edição para conferir e tentar novamente.`
        : ` Verifique a carta ${id} antes de repetir, pois a confirmação da gravação não foi recebida.`;
      throw new CardOperationError(`Não foi possível concluir a criação. ${this.errorMessage(error)}${recovery}${cleanup ? ` ${cleanup}` : ''}`, id);
    }
  }

  async update(original: Card, input: CardInput, file?: File): Promise<CardSaveResult> {
    const value = validateCardInput(input);
    validateCardId(original.id);
    if (file) this.storage.validateImage(file);
    this.beginOperation(original.id);
    let newArt: CardArt | null = null;
    let committed = false;
    try {
      if (file) {
        newArt = this.storage.prepareArt(original.id, file);
        await this.storage.uploadArt(newArt, file);
      }
      await this.commitUpdate(original, value, newArt ?? original.art);
      committed = true;
      const warnings: string[] = [];
      if (newArt && original.art && newArt.storagePath !== original.art.storagePath) {
        const warning = await this.cleanupUnreferencedArt(original.id, original.art);
        if (warning) warnings.push(warning);
      }
      return { id: original.id, warnings };
    } catch (error: unknown) {
      const cleanup = newArt && !committed ? await this.cleanupUnreferencedArt(original.id, newArt) : null;
      throw new CardOperationError(`Não foi possível concluir a edição. ${this.errorMessage(error)}${cleanup ? ` ${cleanup}` : ''} Recarregue a carta antes de tentar novamente.`, original.id);
    } finally {
      this.pending.delete(original.id);
    }
  }

  async delete(card: Card): Promise<void> {
    validateCardId(card.id);
    this.beginOperation(card.id);
    const reference = doc(this.firestore, 'cards', card.id);
    let artRemoved = false;
    try {
      // Confere a versão antes de tocar no Storage; a exclusão final volta a conferir.
      await runTransaction(this.firestore, async transaction => {
        const snapshot = await transaction.get(reference);
        if (snapshot.exists()) this.assertSameVersion(card, snapshot.data());
      });
      if (card.art) {
        if (!card.art.storagePath.startsWith(`cards/${card.id}/art/`)) {
          throw new Error('A referência de arte não pertence a esta carta; confira os dados antes de excluir.');
        }
        await this.storage.deleteArt(card.art);
        artRemoved = true;
      }
      await runTransaction(this.firestore, async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists()) return;
        this.assertSameVersion(card, snapshot.data());
        transaction.delete(reference);
      });
    } catch (error: unknown) {
      const partial = artRemoved
        ? ' A arte já foi removida; recarregue a carta e conclua a exclusão ou envie uma nova arte.'
        : ` A exclusão não foi concluída. Confira a carta e o caminho ${card.art?.storagePath ?? '(sem arte)'} antes de tentar novamente.`;
      throw new CardOperationError(`Não foi possível concluir a exclusão. ${this.errorMessage(error)}${partial}`, card.id);
    } finally {
      this.pending.delete(card.id);
    }
  }

  private async commitUpdate(original: Card, input: CardInput, art: CardArt | null): Promise<void> {
    const reference = doc(this.firestore, 'cards', original.id);
    await runTransaction(this.firestore, async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('A carta foi excluída em outra sessão.');
      this.assertSameVersion(original, snapshot.data());
      transaction.update(reference, {
        ...input, slug: cardSlug(input.name), art, updatedAt: serverTimestamp()
      });
    });
  }

  private assertSameVersion(original: Card, current: Record<string, unknown>): void {
    const timestamp = current['updatedAt'];
    const art = current['art'] as CardArt | null | undefined;
    if (!(original.updatedAt instanceof Timestamp) || !(timestamp instanceof Timestamp) ||
        !timestamp.isEqual(original.updatedAt) || (art?.storagePath ?? null) !== (original.art?.storagePath ?? null)) {
      throw new Error('A carta mudou em outra sessão. Recarregue para evitar sobrescrever alterações.');
    }
  }

  private beginOperation(id: string): void {
    if (this.pending.has(id)) throw new CardOperationError('Já existe uma operação em andamento nesta carta.', id);
    this.pending.add(id);
  }

  private async cleanupUnreferencedArt(cardId: string, art: CardArt): Promise<string | null> {
    if (!art.storagePath.startsWith(`cards/${cardId}/art/`)) {
      return `O caminho ${art.storagePath} não pertence à carta ${cardId} e foi preservado. Confira a referência manualmente antes de qualquer limpeza.`;
    }
    try {
      const current = await this.getById(cardId);
      if (current?.art?.storagePath === art.storagePath) {
        return `A arte em ${art.storagePath} continua vinculada à carta e foi preservada. Recarregue para conferir o resultado.`;
      }
    } catch (error: unknown) {
      return `Não foi possível confirmar o estado da carta. A arte em ${art.storagePath} foi preservada; confira a referência no Firestore antes de removê-la. ${this.errorMessage(error)}`;
    }
    try {
      await this.storage.deleteArt(art);
      return null;
    } catch (error: unknown) {
      return `Não foi possível limpar a arte em ${art.storagePath}. Remova esse arquivo manualmente no Storage após conferir a carta. ${this.errorMessage(error)}`;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Falha inesperada no Firebase.';
  }
}
