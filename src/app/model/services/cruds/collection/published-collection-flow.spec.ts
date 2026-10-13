import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import Konva from 'konva';
import { AuthSession, isAdminSession } from '../../../interfaces/Auth/auth-session';
import { Card } from '../../../interfaces/Cards/card';
import { AuthService } from '../../fire/auth.service';
import { CardStorageService } from '../../fire/card-storage.service';
import { PUBLISHED_CARD_STORAGE_CLIENT, PublishedCardStorageClient, publishedCardPreviewPath } from '../../fire/published-card-storage.service';
import { defaultCardData, fantasyBasicCanvas } from '../../tools/card-canvas-factory';
import { CARD_PERSISTENCE_CLIENT, CardPersistenceClient, CardService } from '../cards/card.service';
import { PUBLISHED_CARD_PREVIEW_READER } from '../cards/published-card-preview.service';
import { PLAYER_COLLECTION_CLIENT, PlayerCollectionClient, PlayerCollectionService } from './player-collection.service';

describe('Fluxo de publicação real e concessão de coleção', () => {
  it('salva a composição como PNG, concede duas cópias e resolve a propriedade para o membro', async () => {
    const session = signal<AuthSession>({ uid: 'admin', email: null, displayName: null, role: 'admin', roleId: 'admin' });
    let saved: Card | null = null;
    let owned: Record<string, unknown> | null = null;
    const images = new Map<string, Blob>();
    const timestamp = Timestamp.fromMillis(100);
    const persistence: CardPersistenceClient = {
      newId: () => 'complete', list: async () => saved ? [saved] : [], getById: async () => saved,
      create: async (id, input) => { saved = { ...input, id, createdAt: timestamp, updatedAt: timestamp }; },
      update: async (original, input, art) => { saved = { ...original, ...input, art, updatedAt: Timestamp.fromMillis(200) }; },
      delete: async () => { saved = null; }, cleanup: async () => []
    };
    const published: PublishedCardStorageClient = {
      upload: async (path, blob) => { images.set(path, blob); },
      download: async path => { const blob = images.get(path); if (!blob) throw new Error('Preview ausente.'); return blob; },
      delete: async path => { images.delete(path); }
    };
    const collection: PlayerCollectionClient = {
      list: async () => owned ? [{ id: 'complete', data: owned }] : [], timestamp: () => serverTimestamp(),
      transact: async (_uid, _cardId, _readCard, change) => {
        const mutation = change({ profileExists: true, cardStatus: saved?.status ?? null, entry: owned });
        owned = mutation.kind === 'delete' ? null : {
          quantity: mutation.data.quantity, firstAcquiredAt: timestamp, lastAcquiredAt: timestamp
        };
      }
    };
    const privateDownload = jasmine.createSpy('privateDownload').and.rejectWith(new Error('Asset privado inesperado.'));
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { currentUser: session, isAdmin: computed(() => isAdminSession(session())), waitForSession: async () => session() } },
      { provide: CardStorageService, useValue: { validatePendingAssets: () => {}, getAssetBlob: privateDownload } },
      { provide: CARD_PERSISTENCE_CLIENT, useValue: persistence },
      { provide: PUBLISHED_CARD_PREVIEW_READER, useValue: { getById: async () => saved } },
      { provide: PUBLISHED_CARD_STORAGE_CLIENT, useValue: published },
      { provide: PLAYER_COLLECTION_CLIENT, useValue: collection }
    ] });
    const cards = TestBed.inject(CardService);
    const playerCollection = TestBed.inject(PlayerCollectionService);
    const data = { ...defaultCardData(), name: 'Aurora', rarity: 'legendary' as const, status: 'published' as const, attributes: [] };
    const canvas = { ...fantasyBasicCanvas(data), width: 160, height: 200, elements: [], assets: [],
      background: { kind: 'solid' as const, color: '#123456', color2: '#123456', angle: 0, assetId: null } };
    const initialStages = Konva.stages.length;
    const result = await cards.create({ ...data, canvas });
    expect(result.warnings).toEqual([]);
    const png = images.get(publishedCardPreviewPath(result.id))!;
    expect(png.type).toBe('image/png');
    const bitmap = await createImageBitmap(png);
    expect(bitmap.width).toBe(160); expect(bitmap.height).toBe(200);
    const output = document.createElement('canvas'); output.width = bitmap.width; output.height = bitmap.height;
    const context = output.getContext('2d')!; context.drawImage(bitmap, 0, 0); bitmap.close();
    expect(Array.from(context.getImageData(80, 100, 1, 1).data)).toEqual([18, 52, 86, 255]);
    expect(Konva.stages.length).toBe(initialStages);
    expect(document.querySelector('[data-card-preview-renderer]')).toBeNull();

    await playerCollection.setQuantity('member', result.id, 2, null);
    expect(Object.keys(owned!).sort()).toEqual(['firstAcquiredAt', 'lastAcquiredAt', 'quantity']);
    session.set({ uid: 'member', email: null, displayName: null, role: 'member', roleId: 'member' });
    const ownedCards = await playerCollection.listCurrentUser();
    expect(ownedCards.length).toBe(1);
    expect(ownedCards[0].collection.cardId).toBe('complete');
    expect(ownedCards[0].collection.quantity).toBe(2);
    expect(ownedCards[0].card?.name).toBe('Aurora');
    expect(privateDownload).not.toHaveBeenCalled();
    expect(Konva.stages.length).toBe(initialStages);
    await expectAsync(playerCollection.setQuantity('member', result.id, 3, ownedCards[0].collection)).toBeRejectedWithError(/administradores/);
  });
});
