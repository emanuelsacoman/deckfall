import { validateGameplayDeckAgainstActiveCatalog } from '../src';
import type {
  GameplayDeckCatalog, GameplayDeckList, GameplayDeckValidationContext, GameplayValidatedDeck,
} from '../src';

declare const catalog: GameplayDeckCatalog;
declare const saved: GameplayDeckList;
declare const unknownSaved: unknown;
declare const owned: Extract<GameplayDeckValidationContext, { readonly kind: 'owned' }>;
declare const training: Extract<GameplayDeckValidationContext, { readonly kind: 'training-reference' }>;
declare const eitherContext: GameplayDeckValidationContext;

const result: GameplayValidatedDeck = validateGameplayDeckAgainstActiveCatalog(saved, owned);
const parsedUnknown: GameplayValidatedDeck = validateGameplayDeckAgainstActiveCatalog(unknownSaved, owned);

// @ts-expect-error Training cannot bypass ownership through the personal compatibility helper.
validateGameplayDeckAgainstActiveCatalog(saved, training);
// @ts-expect-error The caller must narrow the context to personal ownership explicitly.
validateGameplayDeckAgainstActiveCatalog(saved, eitherContext);
// @ts-expect-error Personal validation requires trusted ownership, not only a catalog.
validateGameplayDeckAgainstActiveCatalog(saved, { kind: 'owned', catalog });
// @ts-expect-error A training mode flag is not a trusted personal context.
validateGameplayDeckAgainstActiveCatalog(saved, { kind: 'training-reference', catalog, bypassOwnership: true });
// @ts-expect-error Identity is not an authority field accepted by the compatibility context.
validateGameplayDeckAgainstActiveCatalog(saved, { ...owned, uid: 'chosen-by-client' });
// @ts-expect-error Saved references continue to require an explicit revision.
const missingRevision: GameplayDeckList = { ...saved, entries: [{ cardId: 'card-1', quantity: 2 }] };
// @ts-expect-error The existing validated-deck result remains readonly.
result.entries[0]!.definition.revision = 99;
// @ts-expect-error Compatibility does not mint battle instances or inventory.
result.instances;
// @ts-expect-error Compatibility is not an authentication or admission receipt.
result.authorized;

void [result, parsedUnknown, missingRevision];
