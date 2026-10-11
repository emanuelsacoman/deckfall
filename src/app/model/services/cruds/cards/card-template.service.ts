import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, getDocFromServer, getDocsFromServer, orderBy, query,
  runTransaction, serverTimestamp, setDoc
} from '@angular/fire/firestore';
import { CardOperationError, CardSaveResult } from '../../../interfaces/Cards/card';
import { CardAssetOwner, CardCanvasAsset, PendingCardAsset } from '../../../interfaces/Cards/card-canvas';
import { CardTemplate, CardTemplateInput } from '../../../interfaces/Cards/card-template';
import { CardStorageService } from '../../fire/card-storage.service';
import { validateCardId } from '../../tools/card-validation';
import {
  artifacts, assertDocumentVersion, assertOwnedCanvas, cleanupArtifacts, emptyCanvas,
  errorMessage, parseTemplate, validateTemplateInput
} from './card-persistence';

@Injectable({ providedIn: 'root' })
export class CardTemplateService {
  private readonly firestore = inject(Firestore);
  private readonly storage = inject(CardStorageService);
  private readonly pending = new Set<string>();

  async list(): Promise<CardTemplate[]> {
    const snapshot = await getDocsFromServer(query(collection(this.firestore, 'cardTemplates'), orderBy('updatedAt', 'desc')));
    return snapshot.docs.map(item => parseTemplate(item.id, item.data()));
  }
  async getById(id: string): Promise<CardTemplate | null> {
    validateCardId(id);
    const snapshot = await getDocFromServer(doc(this.firestore, 'cardTemplates', id));
    return snapshot.exists() ? parseTemplate(snapshot.id, snapshot.data()) : null;
  }
  async create(input: CardTemplateInput, pendingAssets: PendingCardAsset[] = []): Promise<CardSaveResult> {
    const value = validateTemplateInput(input);
    this.storage.validatePendingAssets(value.canvas, pendingAssets);
    const reference = doc(collection(this.firestore, 'cardTemplates'));
    const owner: CardAssetOwner = { kind: 'template', id: reference.id };
    const attempted: CardCanvasAsset[] = [];
    try {
      await setDoc(reference, {
        ...value, canvas: value.canvas.assets.length ? emptyCanvas(value.canvas) : value.canvas,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      if (!value.canvas.assets.length) {
        if (pendingAssets.length) throw new Error('Uploads não pertencem ao template atual.');
        return { id: reference.id, warnings: [] };
      }
      const initial = await this.getById(reference.id);
      if (!initial) throw new Error('O template inicial não foi encontrado.');
      const canvas = await this.storage.materializeAssets(owner, value.canvas, pendingAssets, attempted);
      await this.commitUpdate(initial, { ...value, canvas });
      return { id: reference.id, warnings: [] };
    } catch (error: unknown) {
      const warnings = await cleanupArtifacts(this.firestore, this.storage, owner, artifacts({ canvas: { ...value.canvas, assets: attempted } }));
      throw new CardOperationError(`Não foi possível concluir o template. ${errorMessage(error)} Confira o documento ${reference.id} antes de repetir. ${warnings.join(' ')}`, reference.id);
    }
  }
  async update(original: CardTemplate, input: CardTemplateInput, pendingAssets: PendingCardAsset[] = []): Promise<CardSaveResult> {
    const value = validateTemplateInput(input);
    this.storage.validatePendingAssets(value.canvas, pendingAssets);
    validateCardId(original.id);
    this.begin(original.id);
    const owner: CardAssetOwner = { kind: 'template', id: original.id };
    const attempted: CardCanvasAsset[] = [];
    try {
      const canvas = await this.storage.materializeAssets(owner, value.canvas, pendingAssets, attempted);
      await this.commitUpdate(original, { ...value, canvas });
      const used = new Set(artifacts({ canvas }).map(asset => asset.storagePath));
      return {
        id: original.id,
        warnings: await cleanupArtifacts(this.firestore, this.storage, owner, artifacts(original).filter(asset => !used.has(asset.storagePath)))
      };
    } catch (error: unknown) {
      const warnings = await cleanupArtifacts(this.firestore, this.storage, owner, artifacts({ canvas: { ...value.canvas, assets: attempted } }));
      const previousPaths = artifacts(original).map(asset => asset.storagePath).join(', ');
      throw new CardOperationError(`Não foi possível concluir a edição do template. ${errorMessage(error)} ${warnings.join(' ')} Recarregue antes de repetir.${previousPaths ? ` Confira também as referências anteriores antes de limpar: ${previousPaths}.` : ''}`, original.id);
    } finally { this.pending.delete(original.id); }
  }
  async delete(template: CardTemplate): Promise<void> {
    validateCardId(template.id);
    this.begin(template.id);
    const owner: CardAssetOwner = { kind: 'template', id: template.id };
    const reference = doc(this.firestore, 'cardTemplates', template.id);
    let deleted = false;
    try {
      await runTransaction(this.firestore, async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists()) return;
        assertDocumentVersion(template, snapshot.data());
        transaction.delete(reference);
      });
      deleted = true;
      const warnings = await cleanupArtifacts(this.firestore, this.storage, owner, artifacts(template));
      if (warnings.length) throw new Error(warnings.join(' '));
    } catch (error: unknown) {
      const paths = artifacts(template).map(asset => asset.storagePath).join(', ');
      throw new CardOperationError(`${deleted ? 'Template excluído, com limpeza de arquivos pendente.' : `Exclusão não confirmada; arquivos preservados.${paths ? ` Caminhos: ${paths}.` : ''}`} ${errorMessage(error)}`, template.id);
    } finally { this.pending.delete(template.id); }
  }
  private async commitUpdate(original: CardTemplate, input: CardTemplateInput): Promise<void> {
    assertOwnedCanvas(this.storage, { kind: 'template', id: original.id }, input.canvas);
    const value = validateTemplateInput(input);
    const reference = doc(this.firestore, 'cardTemplates', original.id);
    await runTransaction(this.firestore, async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error('O template foi excluído em outra sessão.');
      assertDocumentVersion(original, snapshot.data());
      transaction.update(reference, { ...value, updatedAt: serverTimestamp() });
    });
  }
  private begin(id: string): void {
    if (this.pending.has(id)) throw new CardOperationError('Já existe uma operação em andamento neste template.', id);
    this.pending.add(id);
  }
}
