import type { GameplayDeckCatalog, PersonalDeckDraft } from '../src/gameplay';
import type { PersonalDeckCatalogReader } from '../src/decks/personal-deck-catalog';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

declare const reader: PersonalDeckCatalogReader;
declare const catalog: GameplayDeckCatalog;
declare const draft: PersonalDeckDraft;

const readerKeys: Assert<Equal<keyof PersonalDeckCatalogReader, 'get'>> = true;
const getShape: Assert<Equal<PersonalDeckCatalogReader['get'],
  (contentVersion: string) => Promise<GameplayDeckCatalog | null>>> = true;
const returnShape: Assert<Equal<Awaited<ReturnType<PersonalDeckCatalogReader['get']>>, GameplayDeckCatalog | null>> = true;
const resolved: Promise<GameplayDeckCatalog | null> = reader.get(draft.contentVersion);
const present: Awaited<ReturnType<PersonalDeckCatalogReader['get']>> = catalog;
const absent: Awaited<ReturnType<PersonalDeckCatalogReader['get']>> = null;

// @ts-expect-error Version is explicit; there is no implicit active-catalog lookup.
reader.get();
// @ts-expect-error Global content reads have no UID parameter.
reader.get('backend-uid', draft.contentVersion);
// @ts-expect-error The reader takes an identifier, not an entire player intent.
reader.get(draft);
// @ts-expect-error No ownership or personal validation context is accepted.
reader.get({ contentVersion: draft.contentVersion, ownership: [], catalog });
// @ts-expect-error No alternate version envelope or infrastructure reference is exposed.
reader.get({ contentVersion: draft.contentVersion });
// @ts-expect-error There is no content write API.
reader.create(catalog);
// @ts-expect-error There is no content replacement API.
reader.update(catalog);
// @ts-expect-error There is no deletion API.
reader.delete(draft.contentVersion);
// @ts-expect-error Activation is a separate privileged future flow.
reader.activate(draft.contentVersion);
// @ts-expect-error There is no active-config read or write capability.
reader.setActive(draft.contentVersion);
// @ts-expect-error No publication operation is offered.
reader.publish(catalog);
// @ts-expect-error The shared catalog cannot be replaced with raw partial content.
const partialReader: PersonalDeckCatalogReader = { get: async () => ({ contentVersion: 'v1' }) };
// @ts-expect-error Personal context is not another catalog schema or reader result.
const personalReader: PersonalDeckCatalogReader = { get: async () => ({ catalog, ownership: [] }) };

async function readonlyCatalogBoundary(): Promise<void> {
  const result = await reader.get(draft.contentVersion);
  if (result === null) return;
  const sharedCatalog: GameplayDeckCatalog = result;
  // @ts-expect-error Catalog metadata retains the existing shared readonly contract.
  result.contentVersion = 'other-version';
  // @ts-expect-error The canonical card list cannot be appended to by a consumer.
  result.cards.push(result.cards[0]!);
  // @ts-expect-error Eligibility belongs to the trusted content projection.
  result.cards[0]!.eligible = true;
  // @ts-expect-error Canonical definitions are readonly, not client-editable authority.
  result.cards[0]!.definition.revision = 2;
  const definition = result.cards[0]!.definition;
  if (definition.kind === 'action') {
    // @ts-expect-error Nested effects retain the shared readonly contract as well.
    definition.effect.amount = 1;
  }
  void sharedCatalog;
}

void [readerKeys, getShape, returnShape, resolved, present, absent, partialReader, personalReader, readonlyCatalogBoundary];
