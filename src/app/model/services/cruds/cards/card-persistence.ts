import { Firestore, Timestamp, doc, getDocFromServer } from '@angular/fire/firestore';
import { Card, CardArt, CardInput } from '../../../interfaces/Cards/card';
import { CardAssetOwner, CardCanvasData } from '../../../interfaces/Cards/card-canvas';
import { CardTemplate, CardTemplateInput } from '../../../interfaces/Cards/card-template';
import { CardStorageService } from '../../fire/card-storage.service';
import { validateCardCanvas, validateCanvasAsset, validateCardDocumentSize } from '../../tools/card-canvas-validation';
import { cardSlug, validateCardAttributes, validateCardInput } from '../../tools/card-validation';

export function parseCard(id: string, data: Record<string, unknown>): Card {
  const input: Record<string, unknown> = {
    name: data['name'], description: data['description'], rarity: data['rarity'], status: data['status'],
    attributes: data['attributes'], setId: data['setId'] ?? null
  };
  for (const key of ['type', 'subtype', 'templateId', 'canvas']) {
    if (data[key] !== undefined) input[key] = data[key];
  }
  const value = validateCardInput(input);
  return {
    ...value, id, slug: typeof data['slug'] === 'string' ? data['slug'] : cardSlug(value.name),
    art: parseArt(data['art']), createdAt: timestamp(data['createdAt']), updatedAt: timestamp(data['updatedAt'])
  };
}

export function validateTemplateInput(value: unknown): CardTemplateInput {
  validateCardDocumentSize(value);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Template inválido.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['name', 'canvas', 'attributes'].includes(key))) throw new Error('Campo desconhecido no template.');
  if (typeof input['name'] !== 'string' || !input['name'].trim() || input['name'].trim().length > 120) throw new Error('O template precisa de um nome com até 120 caracteres.');
  const result = { name: input['name'].trim(), canvas: validateCardCanvas(input['canvas']), attributes: validateCardAttributes(input['attributes']) };
  validateCardDocumentSize(result);
  return result;
}

export function parseTemplate(id: string, data: Record<string, unknown>): CardTemplate {
  return {
    ...validateTemplateInput({ name: data['name'], canvas: data['canvas'], attributes: data['attributes'] }), id,
    createdAt: timestamp(data['createdAt']), updatedAt: timestamp(data['updatedAt'])
  };
}

export function emptyCanvas(canvas: CardCanvasData): CardCanvasData {
  return { ...canvas, elements: [], assets: [], background: { ...canvas.background, kind: 'solid', assetId: null } };
}

export function primaryArt(canvas: CardCanvasData | undefined, fallback: CardArt | null): CardArt | null {
  const element = canvas?.elements.find(item => item.type === 'artwork' && item.properties.assetId !== null);
  if (!element || element.type !== 'artwork') return fallback;
  const asset = canvas?.assets.find(item => item.id === element.properties.assetId);
  return asset?.storagePath ? { storagePath: asset.storagePath, fileName: asset.fileName, contentType: asset.contentType, size: asset.size } : fallback;
}

export function artifacts(document: { art?: CardArt | null; canvas?: CardCanvasData }): CardArt[] {
  const files = new Map<string, CardArt>();
  if (document.art) files.set(document.art.storagePath, document.art);
  for (const asset of document.canvas?.assets ?? []) {
    if (asset.storagePath) files.set(asset.storagePath, { ...asset, storagePath: asset.storagePath });
  }
  return [...files.values()];
}

export function assertDocumentVersion(original: { updatedAt: Timestamp | null }, current: Record<string, unknown>): void {
  const updatedAt = current['updatedAt'];
  if (!(original.updatedAt instanceof Timestamp) || !(updatedAt instanceof Timestamp) || !updatedAt.isEqual(original.updatedAt)) {
    throw new Error('O documento mudou em outra sessão. Recarregue para evitar sobrescrever alterações.');
  }
}

export function assertOwnedCanvas(storage: CardStorageService, owner: CardAssetOwner, canvas: CardCanvasData | undefined): void {
  if (canvas?.assets.some(asset => !asset.storagePath || !storage.isOwnedAsset(owner, asset.storagePath))) {
    throw new Error('Todos os assets precisam estar enviados ao namespace do proprietário antes de salvar.');
  }
}

export async function cleanupArtifacts(firestore: Firestore, storage: CardStorageService, owner: CardAssetOwner,
    files: readonly CardArt[]): Promise<string[]> {
  if (!files.length) return [];
  const unique = [...new Map(files.map(file => [file.storagePath, file])).values()];
  let currentPaths: Set<string>;
  try {
    const snapshot = await getDocFromServer(doc(firestore, owner.kind === 'card' ? 'cards' : 'cardTemplates', owner.id));
    const data = snapshot.data();
    const canvas = data?.['canvas'] !== undefined ? validateCardCanvas(data['canvas']) : undefined;
    const art = owner.kind === 'card' && data ? parseArt(data['art']) : null;
    currentPaths = new Set(artifacts({ canvas, art }).map(file => file.storagePath));
  } catch (error: unknown) {
    return unique.map(file => `A arte em ${file.storagePath} foi preservada: o estado do documento ${owner.id} não pôde ser confirmado. ${errorMessage(error)}`);
  }
  const warnings: string[] = [];
  for (const file of unique) {
    if (!storage.isOwnedAsset(owner, file.storagePath)) {
      warnings.push(`O arquivo ${file.storagePath} não pertence a ${owner.id} e foi preservado. Confira a referência manualmente.`);
    } else if (currentPaths.has(file.storagePath)) {
      warnings.push(`O arquivo ${file.storagePath} ainda está referenciado e foi preservado. Confira o resultado da gravação.`);
    } else {
      try { await storage.deleteAsset(file); }
      catch (error: unknown) { warnings.push(`Limpeza pendente em ${file.storagePath}. Confira e remova manualmente ou repita a operação. ${errorMessage(error)}`); }
    }
  }
  return warnings;
}

export function inputWithCanvas(input: CardInput, canvas: CardCanvasData | undefined): CardInput {
  return canvas ? { ...input, canvas } : input;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Falha inesperada no Firebase.';
}

function parseArt(value: unknown): CardArt | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Metadados da arte inválidos.');
  const asset = validateCanvasAsset({ ...(value as Record<string, unknown>), id: 'legacy-art' });
  if (!asset.storagePath) throw new Error('A arte persistida não possui caminho.');
  return { storagePath: asset.storagePath, fileName: asset.fileName, contentType: asset.contentType, size: asset.size };
}
function timestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}
