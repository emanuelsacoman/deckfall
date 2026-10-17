import type {
  GameplayDeckCatalog, GameplayDeckValidationContext, GameplayValidatedDeck, PersonalDeckDraft,
} from '../src/gameplay';
import * as referenceValidation from '../src/decks/validate-personal-deck-references';
import { validatePersonalDeckDraftReferences } from '../src/decks/validate-personal-deck-references';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

declare const catalog: GameplayDeckCatalog;
declare const value: unknown;
declare const context: GameplayDeckValidationContext;
declare const draft: PersonalDeckDraft;

const apiKeys: Assert<Equal<keyof typeof referenceValidation, 'validatePersonalDeckDraftReferences'>> = true;
const parameterShape: Assert<Equal<Parameters<typeof validatePersonalDeckDraftReferences>, [unknown, GameplayDeckCatalog]>> = true;
const returnShape: Assert<Equal<ReturnType<typeof validatePersonalDeckDraftReferences>, PersonalDeckDraft>> = true;
const checked: PersonalDeckDraft = validatePersonalDeckDraftReferences(value, catalog);
const parsedDraft: PersonalDeckDraft = validatePersonalDeckDraftReferences(draft, catalog);

// @ts-expect-error The already resolved shared catalog is required.
validatePersonalDeckDraftReferences(value);
// @ts-expect-error The catalog parameter cannot be replaced with a UID.
validatePersonalDeckDraftReferences(value, 'backend-uid');
// @ts-expect-error No UID parameter or personal context is part of this pure helper.
validatePersonalDeckDraftReferences(value, catalog, 'backend-uid');
// @ts-expect-error Ownership and training-reference contexts belong to admission, not this helper.
validatePersonalDeckDraftReferences(value, context);
// @ts-expect-error Ownership cannot be passed as a separate third parameter.
validatePersonalDeckDraftReferences(value, catalog, []);
// @ts-expect-error No ownership envelope replaces the shared catalog contract.
validatePersonalDeckDraftReferences(value, { catalog, ownership: [] });
// @ts-expect-error Training-reference validation is not accepted by the historical helper.
validatePersonalDeckDraftReferences(value, { kind: 'training-reference', catalog, referenceId: 'ref', referenceDeck: draft });
// @ts-expect-error A partial projection is not the canonical catalog schema.
validatePersonalDeckDraftReferences(value, { contentVersion: 'v1' });
// @ts-expect-error Recognized drafts are composition intent, not canonical battle-validation results.
const battleResult: GameplayValidatedDeck = checked;
// @ts-expect-error Recognition provides no playability authority.
checked.isPlayable;
// @ts-expect-error Recognition provides no admission validity flag.
checked.isValid;
// @ts-expect-error Canonical mechanical definitions are not copied into a personal draft.
checked.entries[0]!.definition;
// @ts-expect-error There is no automatic revision migration API.
referenceValidation.migratePersonalDeckRevisions(value, catalog);
// @ts-expect-error There is no current-revision substitution API.
referenceValidation.updateToLatestRevision(value, catalog);
// @ts-expect-error Returned pinned references retain the readonly shared contract.
checked.entries[0]!.revision = 999;

void [apiKeys, parameterShape, returnShape, checked, parsedDraft, battleResult];
