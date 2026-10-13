import { TestBed } from '@angular/core/testing';
import { FieldValue, Timestamp, serverTimestamp } from 'firebase/firestore';
import { AuthSession } from '../../../interfaces/Auth/auth-session';
import { Card } from '../../../interfaces/Cards/card';
import {
  PLAYER_COLLECTION_MAX_QUANTITY, PlayerCardCollectionEntry
} from '../../../interfaces/Collection/player-card-collection';
import { AuthService } from '../../fire/auth.service';
import { CardService } from '../cards/card.service';
import {
  PLAYER_COLLECTION_CLIENT, PlayerCollectionClient, PlayerCollectionDocument,
  PlayerCollectionMutation, PlayerCollectionService, PlayerCollectionTransactionState
} from './player-collection.service';

const first = Timestamp.fromMillis(100);
const last = Timestamp.fromMillis(200);
const entry = (overrides: Partial<PlayerCardCollectionEntry> = {}): PlayerCardCollectionEntry => ({
  cardId: 'nyra', quantity: 2, firstAcquiredAt: first, lastAcquiredAt: last, ...overrides
});
const card = (id = 'nyra', overrides: Partial<Card> = {}): Card => ({
  id, name: 'Nyra', slug: 'nyra', description: '', rarity: 'legendary', status: 'published',
  attributes: [], setId: null, art: null, createdAt: first, updatedAt: last, ...overrides
});
const session = (role = 'admin', uid = 'admin'): AuthSession => ({
  uid, email: null, displayName: '', role, roleId: role
});

class MemoryCollectionClient implements PlayerCollectionClient {
  readonly entries = new Map<string, Record<string, unknown>>();
  readonly statuses = new Map<string, string>([['nyra', 'published']]);
  profileExists = true;
  listError: unknown;
  lastUid = '';
  readCard = true;
  mutation?: PlayerCollectionMutation;
  transactionCount = 0;
  beforeChange?: () => Promise<void>;

  async list(uid: string): Promise<PlayerCollectionDocument[]> {
    this.lastUid = uid;
    if (this.listError) throw this.listError;
    return [...this.entries].map(([id, data]) => ({ id, data }));
  }

  async transact(uid: string, cardId: string, readCard: boolean,
      change: (state: PlayerCollectionTransactionState) => PlayerCollectionMutation): Promise<void> {
    this.lastUid = uid; this.readCard = readCard; ++this.transactionCount;
    await this.beforeChange?.();
    const mutation = change({
      profileExists: this.profileExists,
      cardStatus: readCard ? this.statuses.get(cardId) ?? null : null,
      entry: this.entries.get(cardId) ?? null
    });
    this.mutation = mutation;
    if (mutation.kind === 'delete') this.entries.delete(cardId);
    else {
      // Emulates the committed server timestamps, not a client timestamp write.
      const committed = Timestamp.fromMillis(1000 + this.transactionCount);
      this.entries.set(cardId, {
        ...mutation.data,
        firstAcquiredAt: mutation.data.firstAcquiredAt instanceof Timestamp ? mutation.data.firstAcquiredAt : committed,
        lastAcquiredAt: committed
      });
    }
  }

  timestamp(): FieldValue { return serverTimestamp(); }

  seed(value = entry()): void {
    this.entries.set(value.cardId, {
      quantity: value.quantity, firstAcquiredAt: value.firstAcquiredAt, lastAcquiredAt: value.lastAcquiredAt
    });
  }
}

describe('PlayerCollectionService', () => {
  let client: MemoryCollectionClient;
  let cards: jasmine.SpyObj<CardService>;
  let currentSession: AuthSession | null;
  let service: PlayerCollectionService;

  beforeEach(() => {
    client = new MemoryCollectionClient();
    cards = jasmine.createSpyObj<CardService>('CardService', ['getById']);
    cards.getById.and.callFake(async id => card(id));
    currentSession = session();
    TestBed.configureTestingModule({ providers: [
      { provide: PLAYER_COLLECTION_CLIENT, useValue: client },
      { provide: AuthService, useValue: { waitForSession: async () => currentSession } },
      { provide: CardService, useValue: cards }
    ] });
    service = TestBed.inject(PlayerCollectionService);
  });

  it('retorna coleção vazia sem consultar o catálogo', async () => {
    expect(await service.listForUser('member')).toEqual([]);
    expect(cards.getById).not.toHaveBeenCalled();
  });

  it('acrescenta cardId do path e resolve dados somente no cliente', async () => {
    client.seed();
    client.entries.get('nyra')!['cardId'] = 'foreign-id';
    const loaded = await service.listForUser('member');
    expect(loaded).toEqual([{ collection: entry(), card: card() }]);
    expect(cards.getById).toHaveBeenCalledOnceWith('nyra');
    expect(client.entries.get('nyra')!['name']).toBeUndefined();
  });

  it('listCurrentUser consulta o UID da sessão válida', async () => {
    currentSession = session('member', 'member');
    client.seed();
    expect((await service.listCurrentUser())[0].collection.quantity).toBe(2);
    expect(client.lastUid).toBe('member');
  });

  it('nega leitura de coleção de outro membro antes de consultar persistência', async () => {
    currentSession = session('member', 'member');
    await expectAsync(service.listForUser('other')).toBeRejectedWithError('Você não possui permissão para consultar esta coleção.');
    expect(client.lastUid).toBe('');
  });

  it('nega leitura sem sessão ou com papéis inconsistentes', async () => {
    for (const denied of [null, { ...session('member'), roleId: 'admin' }]) {
      currentSession = denied;
      await expectAsync(service.listCurrentUser()).toBeRejected();
      await expectAsync(service.listForUser('admin')).toBeRejected();
    }
    expect(client.lastUid).toBe('');
  });

  it('admin consulta coleção de outro usuário', async () => {
    client.seed();
    expect((await service.listForUser('other'))[0].collection.cardId).toBe('nyra');
    expect(client.lastUid).toBe('other');
  });

  it('não devolve metadados de draft ou archived nem para o admin', async () => {
    client.seed();
    for (const status of ['draft', 'archived'] as const) {
      cards.getById.and.resolveTo(card('nyra', { status }));
      expect(await service.listForUser('member')).toEqual([{ collection: entry(), card: null }]);
    }
  });

  it('preserva propriedade de cartas ausentes ou inacessíveis sem quebrar as demais', async () => {
    client.seed();
    client.seed(entry({ cardId: 'available', quantity: 3 }));
    for (const failure of [null, { code: 'permission-denied' }, { code: 'not-found' }]) {
      cards.getById.and.callFake(async id => {
        if (id === 'available') return card(id);
        if (failure) throw failure;
        return null;
      });
      const loaded = await service.listForUser('member');
      expect(loaded.length).toBe(2);
      expect(loaded.find(item => item.collection.cardId === 'available')!.card?.id).toBe('available');
      expect(loaded.find(item => item.collection.cardId === 'nyra')).toEqual({ collection: entry(), card: null });
    }
  });

  it('propaga falha de leitura da coleção', async () => {
    client.listError = new Error('Conexão indisponível');
    await expectAsync(service.listForUser('member')).toBeRejectedWithError('Conexão indisponível');
    expect(cards.getById).not.toHaveBeenCalled();
  });

  it('não disfarça falha de rede na resolução como carta indisponível', async () => {
    client.seed();
    const network = { code: 'unavailable' };
    cards.getById.and.rejectWith(network);
    await expectAsync(service.listForUser('member')).toBeRejectedWith(network);
  });

  it('recusa quantidade inválida persistida em vez de inventar um total', async () => {
    client.seed(entry({ quantity: 0 }));
    await expectAsync(service.listForUser('member')).toBeRejected();
  });

  it('cria entrada com total absoluto e somente três campos persistidos', async () => {
    await service.setQuantity('member', 'nyra', 3, null);
    expect(client.lastUid).toBe('member');
    expect(client.readCard).toBeTrue();
    expect(client.mutation?.kind).toBe('set');
    if (client.mutation?.kind !== 'set') fail('Esperava gravação da propriedade.');
    else {
      expect(Object.keys(client.mutation.data).sort()).toEqual(['firstAcquiredAt', 'lastAcquiredAt', 'quantity']);
      expect(client.mutation.data.quantity).toBe(3);
      expect(client.mutation.data.firstAcquiredAt).toEqual(serverTimestamp());
      expect(client.mutation.data.lastAcquiredAt).toEqual(serverTimestamp());
    }
  });

  it('altera o total e preserva primeira aquisição enquanto renova a última', async () => {
    client.seed();
    await service.setQuantity('member', 'nyra', 3, entry());
    const saved = client.entries.get('nyra')!;
    expect(saved['quantity']).toBe(3);
    expect(saved['firstAcquiredAt']).toBe(first);
    expect(saved['lastAcquiredAt']).not.toEqual(last);
  });

  it('aceita limite técnico máximo, sem vinculá-lo a regras de deck', async () => {
    await service.setQuantity('member', 'nyra', PLAYER_COLLECTION_MAX_QUANTITY, null);
    expect(client.entries.get('nyra')!['quantity']).toBe(9999);
  });

  it('não concede nem altera quantidade de carta draft, archived ou inexistente', async () => {
    for (const status of ['draft', 'archived', null]) {
      if (status) client.statuses.set('nyra', status);
      else client.statuses.delete('nyra');
      await expectAsync(service.setQuantity('member', 'nyra', 2, null)).toBeRejected();
      expect(client.entries.size).toBe(0);
      client.seed();
      await expectAsync(service.setQuantity('member', 'nyra', 3, entry())).toBeRejected();
      expect(client.entries.get('nyra')!['quantity']).toBe(2);
      client.entries.clear();
    }
  });

  it('não cria coleção em perfil inexistente', async () => {
    client.profileExists = false;
    await expectAsync(service.setQuantity('missing', 'nyra', 2, null)).toBeRejectedWithError('Perfil não encontrado. Não é possível criar ou alterar esta coleção.');
    expect(client.entries.size).toBe(0);
  });

  it('zero exclui o documento sem consultar a carta global', async () => {
    client.seed(); client.statuses.delete('nyra');
    await service.setQuantity('member', 'nyra', 0, entry());
    expect(client.readCard).toBeFalse();
    expect(client.mutation).toEqual({ kind: 'delete' });
    expect(client.entries.has('nyra')).toBeFalse();
  });

  it('remove propriedade mesmo quando a carta global está indisponível', async () => {
    client.seed(); client.statuses.set('nyra', 'archived');
    await service.remove('member', 'nyra', entry());
    expect(client.entries.has('nyra')).toBeFalse();
    expect(client.statuses.get('nyra')).toBe('archived');
    expect(cards.getById).not.toHaveBeenCalled();
  });

  it('membros não criam, alteram ou removem a própria coleção', async () => {
    currentSession = session('member', 'member');
    await expectAsync(service.setQuantity('member', 'nyra', 1, null)).toBeRejected();
    client.seed();
    await expectAsync(service.setQuantity('member', 'nyra', 3, entry())).toBeRejected();
    await expectAsync(service.remove('member', 'nyra', entry())).toBeRejected();
    expect(client.transactionCount).toBe(0);
  });

  it('recusa totais negativos, fracionários, infinitos ou acima do limite', async () => {
    for (const quantity of [-1, 1.5, NaN, Infinity, 10000]) {
      await expectAsync(service.setQuantity('member', 'nyra', quantity, null)).toBeRejected();
    }
    expect(client.transactionCount).toBe(0);
  });

  it('valida os IDs e não permite trocar carta da entrada original', async () => {
    await expectAsync(service.setQuantity('invalid/uid', 'nyra', 1, null)).toBeRejected();
    await expectAsync(service.setQuantity('member', 'invalid/card', 1, null)).toBeRejected();
    await expectAsync(service.setQuantity('member', 'other', 1, entry())).toBeRejectedWithError('A carta da entrada original não pode ser alterada.');
    expect(client.transactionCount).toBe(0);
  });

  it('evita sobrescrever concessão que apareceu depois do carregamento', async () => {
    client.seed();
    await expectAsync(service.setQuantity('member', 'nyra', 3, null)).toBeRejectedWithError('A coleção mudou em outra sessão. Recarregue antes de salvar ou remover a carta.');
    expect(client.entries.get('nyra')!['quantity']).toBe(2);
  });

  it('rejeita edição ou remoção stale mesmo quando somente o timestamp mudou', async () => {
    client.seed(entry({ lastAcquiredAt: Timestamp.fromMillis(300) }));
    await expectAsync(service.setQuantity('member', 'nyra', 3, entry())).toBeRejected();
    await expectAsync(service.remove('member', 'nyra', entry())).toBeRejected();
    expect(client.entries.has('nyra')).toBeTrue();
  });

  it('rejeita edição stale após alterar quantidade ou excluir em outra sessão', async () => {
    client.seed(entry({ quantity: 4 }));
    await expectAsync(service.setQuantity('member', 'nyra', 3, entry())).toBeRejected();
    client.entries.clear();
    await expectAsync(service.setQuantity('member', 'nyra', 3, entry())).toBeRejected();
    expect(client.entries.size).toBe(0);
  });

  it('bloqueia mutação local simultânea e libera nova tentativa depois de concluir', async () => {
    let finish!: () => void;
    client.beforeChange = () => new Promise<void>(resolve => { finish = resolve; });
    const creating = service.setQuantity('member', 'nyra', 2, null);
    await Promise.resolve(); await Promise.resolve();
    await expectAsync(service.setQuantity('member', 'nyra', 3, null)).toBeRejectedWithError('Já existe uma operação em andamento para esta carta na coleção.');
    finish(); await creating; client.beforeChange = undefined;
    const original = (await service.listForUser('member'))[0].collection;
    await service.setQuantity('member', 'nyra', 3, original);
    expect(client.entries.get('nyra')!['quantity']).toBe(3);
  });
});
