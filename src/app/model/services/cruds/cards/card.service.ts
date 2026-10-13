import { Injectable, InjectionToken, inject } from '@angular/core';
import {
  Firestore, collection, doc, getDocFromServer, getDocsFromServer, orderBy, query,
  runTransaction, serverTimestamp, setDoc
} from '@angular/fire/firestore';
import { Card, CardArt, CardInput, CardOperationError, CardSaveResult } from '../../../interfaces/Cards/card';
import { CardAssetOwner, CardCanvasAsset, PendingCardAsset } from '../../../interfaces/Cards/card-canvas';
import { CardStorageService } from '../../fire/card-storage.service';
import { validateCardDocumentSize } from '../../tools/card-canvas-validation';
import { cardSlug, validateCardId, validateCardInput } from '../../tools/card-validation';
import {
  artifacts, assertDocumentVersion, assertOwnedCanvas, cleanupArtifacts, emptyCanvas,
  errorMessage, inputWithCanvas, parseCard, primaryArt
} from './card-persistence';
import { PublishedCardPreviewService } from './published-card-preview.service';

export interface CardPersistenceClient {
  newId(): string;
  list(): Promise<Card[]>;
  getById(id: string): Promise<Card | null>;
  create(id: string, input: CardInput & { slug: string; art: CardArt | null }): Promise<void>;
  update(original: Card, input: CardInput, art: CardArt | null): Promise<void>;
  delete(card: Card): Promise<void>;
  cleanup(owner: CardAssetOwner, files: readonly CardArt[]): Promise<string[]>;
}

export const CARD_PERSISTENCE_CLIENT = new InjectionToken<CardPersistenceClient>('Card persistence client', {
  providedIn: 'root',
  factory: () => {
    const firestore = inject(Firestore);
    const storage = inject(CardStorageService);
    return {
      newId: () => doc(collection(firestore, 'cards')).id,
      list: async () => {
        const snapshot = await getDocsFromServer(query(collection(firestore, 'cards'), orderBy('updatedAt', 'desc')));
        return snapshot.docs.map(item => parseCard(item.id, item.data()));
      },
      getById: async id => {
        const snapshot = await getDocFromServer(doc(firestore, 'cards', id));
        return snapshot.exists() ? parseCard(snapshot.id, snapshot.data()) : null;
      },
      create: (id, input) => setDoc(doc(firestore, 'cards', id), {
        ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      }),
      update: async (original, input, art) => {
        const reference = doc(firestore, 'cards', original.id);
        await runTransaction(firestore, async transaction => {
          const snapshot = await transaction.get(reference);
          if (!snapshot.exists()) throw new Error('A carta foi excluída em outra sessão.');
          assertDocumentVersion(original, snapshot.data());
          transaction.update(reference, { ...input, slug: cardSlug(input.name), art, updatedAt: serverTimestamp() });
        });
      },
      delete: async card => {
        const reference = doc(firestore, 'cards', card.id);
        await runTransaction(firestore, async transaction => {
          const snapshot = await transaction.get(reference);
          if (!snapshot.exists()) return;
          assertDocumentVersion(card, snapshot.data());
          transaction.delete(reference);
        });
      },
      cleanup: (owner, files) => cleanupArtifacts(firestore, storage, owner, files)
    };
  }
});

@Injectable({ providedIn: 'root' })
export class CardService {
  private readonly persistence = inject(CARD_PERSISTENCE_CLIENT);
  private readonly storage = inject(CardStorageService);
  private readonly publishedPreview = inject(PublishedCardPreviewService);
  private readonly pending = new Set<string>();

  async list(): Promise<Card[]> {
    return this.persistence.list();
  }

  async getById(id: string): Promise<Card | null> {
    validateCardId(id);
    return this.persistence.getById(id);
  }

  async create(input: CardInput, file?: File, pendingAssets: PendingCardAsset[] = []): Promise<CardSaveResult> {
    const value = validateCardInput(input);
    this.validateUploads(value, file, pendingAssets);
    const id = this.persistence.newId();
    const owner: CardAssetOwner = { kind: 'card', id };
    const attempted: CardCanvasAsset[] = [];
    const legacyArt = file ? this.storage.prepareArt(id, file) : null;
    let draftSaved = false;
    let legacyStarted = false;
    try {
      const hasUploads = !!file || !!value.canvas?.assets.length;
      const initial = hasUploads && value.canvas ? { ...value, canvas: emptyCanvas(value.canvas) } : value;
      await this.persistence.create(id, {
        ...initial, slug: cardSlug(value.name), status: hasUploads ? 'draft' : value.status,
        art: null
      });
      draftSaved = true;
      if (!hasUploads) return { id, warnings: await this.savedWarnings(owner, []) };
      const draft = await this.getById(id);
      if (!draft) throw new Error('O rascunho não foi encontrado após a gravação.');
      const canvas = value.canvas ? await this.storage.materializeAssets(owner, value.canvas, pendingAssets, attempted) : undefined;
      if (legacyArt && file) {
        legacyStarted = true;
        await this.storage.uploadArt(legacyArt, file);
      }
      const finalInput = inputWithCanvas(value, canvas);
      const art = primaryArt(canvas, legacyArt);
      await this.commitUpdate(draft, finalInput, art);
      const unused = this.unreferenced([...attempted.flatMap(asset => asset.storagePath ? [{ ...asset, storagePath: asset.storagePath }] : []), ...(legacyArt ? [legacyArt] : [])], { canvas, art });
      return { id, warnings: await this.savedWarnings(owner, unused) };
    } catch (error: unknown) {
      const files = attempted.flatMap(asset => asset.storagePath ? [{ ...asset, storagePath: asset.storagePath }] : []);
      if (legacyArt && legacyStarted) files.push({ ...legacyArt, id: 'legacy-art' });
      const warnings = await this.persistence.cleanup(owner, files);
      const recovery = draftSaved
        ? ` O documento ${id} foi preservado; abra a edição para conferir e tentar novamente.`
        : ` Confira o ID ${id} antes de repetir: a confirmação da gravação não foi recebida.`;
      throw new CardOperationError(`Não foi possível concluir a criação. ${errorMessage(error)}${recovery} ${warnings.join(' ')}`.trim(), id);
    }
  }

  async update(original: Card, input: CardInput, file?: File, pendingAssets: PendingCardAsset[] = []): Promise<CardSaveResult> {
    const value = validateCardInput(input);
    validateCardId(original.id);
    this.validateUploads(value, file, pendingAssets);
    this.beginOperation(original.id);
    const owner: CardAssetOwner = { kind: 'card', id: original.id };
    const attempted: CardCanvasAsset[] = [];
    let legacyArt: CardArt | null = null;
    let legacyStarted = false;
    try {
      const canvas = value.canvas
        ? await this.storage.materializeAssets(owner, value.canvas, pendingAssets, attempted) : original.canvas;
      if (file) {
        legacyArt = this.storage.prepareArt(original.id, file);
        legacyStarted = true;
        await this.storage.uploadArt(legacyArt, file);
      }
      const finalInput = inputWithCanvas(value, canvas);
      const art = primaryArt(canvas, legacyArt ?? original.art);
      await this.commitUpdate(original, finalInput, art);
      const old = [...artifacts(original), ...attempted.flatMap(asset => asset.storagePath ? [{ ...asset, storagePath: asset.storagePath }] : []), ...(legacyArt ? [legacyArt] : [])];
      return { id: original.id, warnings: await this.savedWarnings(owner, this.unreferenced(old, { canvas, art })) };
    } catch (error: unknown) {
      const files = attempted.flatMap(asset => asset.storagePath ? [{ ...asset, storagePath: asset.storagePath }] : []);
      if (legacyArt && legacyStarted) files.push({ ...legacyArt, id: 'legacy-art' });
      const warnings = await this.persistence.cleanup(owner, files);
      const previousPaths = artifacts(original).map(asset => asset.storagePath).join(', ');
      throw new CardOperationError(`Não foi possível concluir a edição. ${errorMessage(error)} ${warnings.join(' ')} Recarregue a carta antes de tentar novamente.${previousPaths ? ` Confira também as referências anteriores antes de limpar: ${previousPaths}.` : ''}`, original.id);
    } finally { this.pending.delete(original.id); }
  }

  async delete(card: Card): Promise<void> {
    validateCardId(card.id);
    this.beginOperation(card.id);
    const owner: CardAssetOwner = { kind: 'card', id: card.id };
    let deleted = false;
    try {
      // O documento sai primeiro: nenhuma edição normal poderá recriar suas referências.
      await this.persistence.delete(card);
      deleted = true;
      const warnings: string[] = [];
      try { warnings.push(...await this.persistence.cleanup(owner, artifacts(card))); }
      catch (error: unknown) { warnings.push(`Limpeza dos assets pendente. ${errorMessage(error)}`); }
      try { warnings.push(...await this.publishedPreview.cleanupDeleted(card.id)); }
      catch (error: unknown) { warnings.push(`Limpeza da representação publicada pendente em published-cards/${card.id}/preview.png. ${errorMessage(error)}`); }
      if (warnings.length) throw new Error(warnings.join(' '));
    } catch (error: unknown) {
      const paths = artifacts(card).map(asset => asset.storagePath).join(', ');
      throw new CardOperationError(`${deleted ? 'A carta foi excluída, mas a limpeza dos arquivos ainda precisa ser conferida.' : `A exclusão do documento não foi confirmada; confira antes de repetir. Os arquivos foram preservados.${paths ? ` Caminhos: ${paths}.` : ''}`} ${errorMessage(error)}`, card.id);
    } finally { this.pending.delete(card.id); }
  }

  private async commitUpdate(original: Card, input: CardInput, art: CardArt | null): Promise<void> {
    assertOwnedCanvas(this.storage, { kind: 'card', id: original.id }, input.canvas);
    if (art && !this.storage.isOwnedAsset({ kind: 'card', id: original.id }, art.storagePath)) throw new Error('A arte não pertence a esta carta.');
    validateCardDocumentSize({ ...input, art, slug: cardSlug(input.name) });
    await this.persistence.update(original, input, art);
  }

  private async savedWarnings(owner: CardAssetOwner, unused: CardArt[]): Promise<string[]> {
    const warnings: string[] = [];
    // Post-commit errors must never enter upload compensation or invalidate a confirmed save.
    try { warnings.push(...await this.persistence.cleanup(owner, unused)); }
    catch (error: unknown) { warnings.push(`A carta foi salva, mas a limpeza dos arquivos precisa ser conferida. ${errorMessage(error)}`); }
    try { warnings.push(...await this.publishedPreview.synchronize(owner.id)); }
    catch (error: unknown) { warnings.push(`A carta foi salva, mas a representação publicada não pôde ser sincronizada. Reabra a carta e salve novamente. ${errorMessage(error)}`); }
    return warnings;
  }

  private validateUploads(input: CardInput, file: File | undefined, assets: PendingCardAsset[]): void {
    if (file) this.storage.validateImage(file);
    if (!input.canvas && assets.length) throw new Error('Uploads de assets exigem um canvas.');
    if (input.canvas) this.storage.validatePendingAssets(input.canvas, assets);
  }
  private beginOperation(id: string): void {
    if (this.pending.has(id)) throw new CardOperationError('Já existe uma operação em andamento nesta carta.', id);
    this.pending.add(id);
  }
  private unreferenced(files: CardArt[], document: { art: CardArt | null; canvas?: Card['canvas'] }): CardArt[] {
    const used = new Set(artifacts(document).map(file => file.storagePath));
    return files.filter(file => !used.has(file.storagePath));
  }
}
