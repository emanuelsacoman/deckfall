import { Injectable, inject } from '@angular/core';
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

@Injectable({ providedIn: 'root' })
export class CardService {
  private readonly firestore = inject(Firestore);
  private readonly storage = inject(CardStorageService);
  private readonly pending = new Set<string>();

  async list(): Promise<Card[]> {
    const snapshot = await getDocsFromServer(query(collection(this.firestore, 'cards'), orderBy('updatedAt', 'desc')));
    return snapshot.docs.map(item => parseCard(item.id, item.data()));
  }

  async getById(id: string): Promise<Card | null> {
    validateCardId(id);
    const snapshot = await getDocFromServer(doc(this.firestore, 'cards', id));
    return snapshot.exists() ? parseCard(snapshot.id, snapshot.data()) : null;
  }

  async create(input: CardInput, file?: File, pendingAssets: PendingCardAsset[] = []): Promise<CardSaveResult> {
    const value = validateCardInput(input);
    this.validateUploads(value, file, pendingAssets);
    const reference = doc(collection(this.firestore, 'cards'));
    const id = reference.id;
    const owner: CardAssetOwner = { kind: 'card', id };
    const attempted: CardCanvasAsset[] = [];
    const legacyArt = file ? this.storage.prepareArt(id, file) : null;
    let draftSaved = false;
    let legacyStarted = false;
    try {
      const hasUploads = !!file || !!value.canvas?.assets.length;
      const initial = hasUploads && value.canvas ? { ...value, canvas: emptyCanvas(value.canvas) } : value;
      await setDoc(reference, {
        ...initial, slug: cardSlug(value.name), status: hasUploads ? 'draft' : value.status,
        art: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      draftSaved = true;
      if (!hasUploads) return { id, warnings: [] };
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
      return { id, warnings: await cleanupArtifacts(this.firestore, this.storage, owner, unused) };
    } catch (error: unknown) {
      const files = attempted.flatMap(asset => asset.storagePath ? [{ ...asset, storagePath: asset.storagePath }] : []);
      if (legacyArt && legacyStarted) files.push({ ...legacyArt, id: 'legacy-art' });
      const warnings = await cleanupArtifacts(this.firestore, this.storage, owner, files);
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
      return { id: original.id, warnings: await cleanupArtifacts(this.firestore, this.storage, owner, this.unreferenced(old, { canvas, art })) };
    } catch (error: unknown) {
      const files = attempted.flatMap(asset => asset.storagePath ? [{ ...asset, storagePath: asset.storagePath }] : []);
      if (legacyArt && legacyStarted) files.push({ ...legacyArt, id: 'legacy-art' });
      const warnings = await cleanupArtifacts(this.firestore, this.storage, owner, files);
      const previousPaths = artifacts(original).map(asset => asset.storagePath).join(', ');
      throw new CardOperationError(`Não foi possível concluir a edição. ${errorMessage(error)} ${warnings.join(' ')} Recarregue a carta antes de tentar novamente.${previousPaths ? ` Confira também as referências anteriores antes de limpar: ${previousPaths}.` : ''}`, original.id);
    } finally { this.pending.delete(original.id); }
  }

  async delete(card: Card): Promise<void> {
    validateCardId(card.id);
    this.beginOperation(card.id);
    const owner: CardAssetOwner = { kind: 'card', id: card.id };
    const reference = doc(this.firestore, 'cards', card.id);
    let deleted = false;
    try {
      // O documento sai primeiro: nenhuma edição normal poderá recriar suas referências.
      await runTransaction(this.firestore, async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists()) return;
        assertDocumentVersion(card, snapshot.data());
        transaction.delete(reference);
      });
      deleted = true;
      const warnings = await cleanupArtifacts(this.firestore, this.storage, owner, artifacts(card));
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
    const reference = doc(this.firestore, 'cards', original.id);
    await runTransaction(this.firestore, async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('A carta foi excluída em outra sessão.');
      assertDocumentVersion(original, snapshot.data());
      transaction.update(reference, { ...input, slug: cardSlug(input.name), art, updatedAt: serverTimestamp() });
    });
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
