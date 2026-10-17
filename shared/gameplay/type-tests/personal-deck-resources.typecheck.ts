import {
  parsePersonalDeckResource, parsePersonalDeckCreateRequest, parsePersonalDeckUpdateRequest,
  parsePersonalDeckRenameRequest, parsePersonalDeckDeleteRequest, parsePersonalDeckDuplicateRequest,
} from '../src';
import type {
  GameplayDeckEntry, GameplayRulesVersion, GameplayValidatedDeck, PersonalDeckDraft, PersonalDeckResource,
  PersonalDeckCreateRequest, PersonalDeckUpdateRequest, PersonalDeckRenameRequest,
  PersonalDeckDeleteRequest, PersonalDeckDuplicateRequest,
} from '../src';

declare const input: unknown;
const resource: PersonalDeckResource = parsePersonalDeckResource(input);
const create: PersonalDeckCreateRequest = parsePersonalDeckCreateRequest(input);
const update: PersonalDeckUpdateRequest = parsePersonalDeckUpdateRequest(input);
const rename: PersonalDeckRenameRequest = parsePersonalDeckRenameRequest(input);
const remove: PersonalDeckDeleteRequest = parsePersonalDeckDeleteRequest(input);
const duplicate: PersonalDeckDuplicateRequest = parsePersonalDeckDuplicateRequest(input);

const draft: PersonalDeckDraft = {
  name: 'Deck pessoal', rulesVersion: '0.1', contentVersion: 'historical-v7',
  entries: [{ cardId: 'card-1', revision: 9, quantity: 1 }],
};
// A document version, a card revision, rules and provenance have independent meanings.
const persisted: PersonalDeckResource = {
  id: 'deck-1', version: 37, draft,
  createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T11:00:00.000Z',
};
const documentVersion: number = persisted.version;
const cardRevision: number = persisted.draft.entries[0]!.revision;
const rulesVersion: GameplayRulesVersion = persisted.draft.rulesVersion;
const contentVersion: string = persisted.draft.contentVersion;
const references: readonly GameplayDeckEntry[] = persisted.draft.entries;
const createdAt: string = persisted.createdAt;
const updatedAt: string = persisted.updatedAt;
const createIntent: PersonalDeckCreateRequest = { deckId: 'deck-2', draft };
const updateIntent: PersonalDeckUpdateRequest = { deckId: 'deck-1', expectedVersion: 37, draft };
const renameIntent: PersonalDeckRenameRequest = { deckId: 'deck-1', expectedVersion: 37, name: 'Novo nome' };
const deleteIntent: PersonalDeckDeleteRequest = { deckId: 'deck-1', expectedVersion: 37 };
const duplicateIntent: PersonalDeckDuplicateRequest = {
  sourceDeckId: 'deck-1', expectedSourceVersion: 37, newDeckId: 'deck-3',
};

// @ts-expect-error A pure resource derives its owner from a future trusted path, not a UID field.
const resourceUid: PersonalDeckResource = { ...persisted, uid: 'player-1' };
// @ts-expect-error A resource does not duplicate ownership as ownerUid.
const resourceOwner: PersonalDeckResource = { ...persisted, ownerUid: 'player-1' };
// @ts-expect-error A resource contains the stored version, not a request precondition.
const resourceExpected: PersonalDeckResource = { ...persisted, expectedVersion: 37 };
// @ts-expect-error Resource identity is named id; request identity is deckId.
const resourceRequestId: PersonalDeckResource = { ...persisted, deckId: 'deck-1' };
// @ts-expect-error Persisted timestamps are serializable strings, not mutable Date instances.
const resourceDate: PersonalDeckResource = { ...persisted, createdAt: new Date() };
// @ts-expect-error Document version does not stand in for the rules literal.
const rulesFromDocument: GameplayRulesVersion = persisted.version;
// @ts-expect-error Provenance is an identifier string, not the document's numeric version.
const contentFromDocument: PersonalDeckDraft = { ...draft, contentVersion: persisted.version };
// @ts-expect-error Mechanical revisions remain numeric and do not become rules-version strings.
const revisionFromRules: GameplayDeckEntry = { cardId: 'card-1', revision: draft.rulesVersion, quantity: 1 };
// @ts-expect-error Persistence timestamps do not belong to a player draft.
const draftCreatedAt: PersonalDeckDraft = { ...draft, createdAt: persisted.createdAt };
// @ts-expect-error Update timestamps also remain outside player intent.
const draftUpdatedAt: PersonalDeckDraft = { ...draft, updatedAt: persisted.updatedAt };

// @ts-expect-error Create cannot choose its new authoritative document version.
const createVersion: PersonalDeckCreateRequest = { ...createIntent, version: 1 };
// @ts-expect-error Create cannot forge creation timestamps.
const createTimestamp: PersonalDeckCreateRequest = { ...createIntent, createdAt };
// @ts-expect-error Create requests carry no authenticated owner.
const createUid: PersonalDeckCreateRequest = { ...createIntent, uid: 'player-1' };
// @ts-expect-error Create requests do not duplicate ownerUid.
const createOwner: PersonalDeckCreateRequest = { ...createIntent, ownerUid: 'player-1' };
// @ts-expect-error Creation has no prior document version to compare.
const createExpected: PersonalDeckCreateRequest = { ...createIntent, expectedVersion: 1 };
// @ts-expect-error A create request must identify the resource independently of the draft name.
const createMissingId: PersonalDeckCreateRequest = { draft };
// @ts-expect-error A create request requires a draft.
const createMissingDraft: PersonalDeckCreateRequest = { deckId: 'deck-2' };

// @ts-expect-error Update supplies the observed version, not a chosen new authoritative version.
const updateVersion: PersonalDeckUpdateRequest = { ...updateIntent, version: 38 };
// @ts-expect-error No request can choose a separate newVersion field.
const updateNewVersion: PersonalDeckUpdateRequest = { ...updateIntent, newVersion: 38 };
// @ts-expect-error Update timestamps remain backend authority.
const updateTimestamp: PersonalDeckUpdateRequest = { ...updateIntent, updatedAt };
// @ts-expect-error Update has no client-supplied UID.
const updateUid: PersonalDeckUpdateRequest = { ...updateIntent, uid: 'player-1' };
// @ts-expect-error Update has no client-supplied ownerUid.
const updateOwner: PersonalDeckUpdateRequest = { ...updateIntent, ownerUid: 'player-1' };
// @ts-expect-error Updating requires an explicit observed document version.
const updateMissingExpected: PersonalDeckUpdateRequest = { deckId: 'deck-1', draft };
// @ts-expect-error Numeric request versions do not accept numeric strings.
const updateStringVersion: PersonalDeckUpdateRequest = { ...updateIntent, expectedVersion: '37' };

// @ts-expect-error Rename carries only a name, not a client replacement composition.
const renameDraft: PersonalDeckRenameRequest = { ...renameIntent, draft };
// @ts-expect-error Rename has no client-supplied UID.
const renameUid: PersonalDeckRenameRequest = { ...renameIntent, uid: 'player-1' };
// @ts-expect-error Rename has no client-supplied ownerUid.
const renameOwner: PersonalDeckRenameRequest = { ...renameIntent, ownerUid: 'player-1' };
// @ts-expect-error Rename cannot choose the authoritative timestamp.
const renameTimestamp: PersonalDeckRenameRequest = { ...renameIntent, updatedAt };
// @ts-expect-error Delete carries only identity and the observed version.
const deleteDraft: PersonalDeckDeleteRequest = { ...deleteIntent, draft };
// @ts-expect-error Delete carries no UID.
const deleteUid: PersonalDeckDeleteRequest = { ...deleteIntent, uid: 'player-1' };
// @ts-expect-error Delete carries no ownerUid.
const deleteOwner: PersonalDeckDeleteRequest = { ...deleteIntent, ownerUid: 'player-1' };
// @ts-expect-error Delete carries no timestamp.
const deleteTimestamp: PersonalDeckDeleteRequest = { ...deleteIntent, createdAt };
// @ts-expect-error Delete requires an explicit observed document version.
const deleteMissingExpected: PersonalDeckDeleteRequest = { deckId: 'deck-1' };

// @ts-expect-error Duplicate identifies its source and destination, not a general deckId.
const duplicateDeckId: PersonalDeckDuplicateRequest = { ...duplicateIntent, deckId: 'deck-1' };
// @ts-expect-error Duplicate uses the source-version precondition specifically.
const duplicateExpected: PersonalDeckDuplicateRequest = { ...duplicateIntent, expectedVersion: 37 };
// @ts-expect-error Duplicate cannot supply the new resource's authoritative version.
const duplicateVersion: PersonalDeckDuplicateRequest = { ...duplicateIntent, version: 1 };
// @ts-expect-error Duplicate cannot copy an arbitrary draft supplied by the client.
const duplicateDraft: PersonalDeckDuplicateRequest = { ...duplicateIntent, draft };
// @ts-expect-error Duplicate cannot copy authoritative timestamps.
const duplicateTimestamp: PersonalDeckDuplicateRequest = { ...duplicateIntent, createdAt };
// @ts-expect-error Duplicate carries no UID.
const duplicateUid: PersonalDeckDuplicateRequest = { ...duplicateIntent, uid: 'player-1' };
// @ts-expect-error Duplicate carries no ownerUid.
const duplicateOwner: PersonalDeckDuplicateRequest = { ...duplicateIntent, ownerUid: 'player-1' };
// @ts-expect-error The minimal duplicate request does not introduce a copy-name override.
const duplicateName: PersonalDeckDuplicateRequest = { ...duplicateIntent, name: 'Copia' };
// @ts-expect-error Duplicate requires the observed source version.
const duplicateMissingExpected: PersonalDeckDuplicateRequest = { sourceDeckId: 'deck-1', newDeckId: 'deck-3' };

// @ts-expect-error Resource metadata is readonly.
resource.version = 38;
// @ts-expect-error Resource identity is readonly.
resource.id = 'deck-2';
// @ts-expect-error Resource timestamps are readonly.
resource.updatedAt = createdAt;
// @ts-expect-error The resource cannot replace its draft through a readonly reference.
resource.draft = draft;
// @ts-expect-error Nested player intent remains readonly.
resource.draft.name = 'Changed';
// @ts-expect-error Mechanical card references remain readonly inside a resource.
resource.draft.entries[0]!.revision = 10;
// @ts-expect-error A readonly composition cannot append a card reference.
resource.draft.entries.push({ cardId: 'card-2', revision: 1, quantity: 1 });
// @ts-expect-error Create identity is readonly.
create.deckId = 'deck-2';
// @ts-expect-error Update preconditions are readonly.
update.expectedVersion = 38;
// @ts-expect-error Rename intent is readonly.
rename.name = 'Changed';
// @ts-expect-error Delete preconditions are readonly.
remove.expectedVersion = 38;
// @ts-expect-error Duplicate source preconditions are readonly.
duplicate.expectedSourceVersion = 38;
// @ts-expect-error Duplicate destination identity is readonly.
duplicate.newDeckId = 'deck-4';

// @ts-expect-error A saved resource is not a canonical deck validated for battle.
const resourceAsValidated: GameplayValidatedDeck = resource;
// @ts-expect-error A creation request does not certify a canonical gameplay composition.
const createAsValidated: GameplayValidatedDeck = create;
// @ts-expect-error An update request does not certify a canonical gameplay composition.
const updateAsValidated: GameplayValidatedDeck = update;
// @ts-expect-error A rename request is not a validated battle deck.
const renameAsValidated: GameplayValidatedDeck = rename;
// @ts-expect-error A delete request is not a validated battle deck.
const deleteAsValidated: GameplayValidatedDeck = remove;
// @ts-expect-error A duplication request is not a validated battle deck.
const duplicateAsValidated: GameplayValidatedDeck = duplicate;

void [resource, create, update, rename, remove, duplicate, documentVersion, cardRevision, rulesVersion,
  contentVersion, references, createdAt, updatedAt, createIntent, updateIntent, renameIntent, deleteIntent,
  duplicateIntent, resourceUid, resourceOwner, resourceExpected, resourceRequestId, resourceDate,
  rulesFromDocument, contentFromDocument, revisionFromRules, draftCreatedAt, draftUpdatedAt, createVersion,
  createTimestamp, createUid, createOwner, createExpected, createMissingId, createMissingDraft, updateVersion,
  updateNewVersion, updateTimestamp, updateUid, updateOwner, updateMissingExpected, updateStringVersion,
  renameDraft, renameUid, renameOwner, renameTimestamp, deleteDraft, deleteUid, deleteOwner, deleteTimestamp,
  deleteMissingExpected, duplicateDeckId, duplicateExpected, duplicateVersion, duplicateDraft,
  duplicateTimestamp, duplicateUid, duplicateOwner, duplicateName, duplicateMissingExpected,
  resourceAsValidated, createAsValidated, updateAsValidated, renameAsValidated, deleteAsValidated, duplicateAsValidated];
