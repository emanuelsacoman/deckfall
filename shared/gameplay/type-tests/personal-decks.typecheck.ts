import { parsePersonalDeckDraft, PERSONAL_DECK_LIMITS } from '../src';
import type { GameplayDeckEntry, GameplayDeckList, GameplayRulesVersion, PersonalDeckDraft } from '../src';

declare const input: unknown;
const draft: PersonalDeckDraft = parsePersonalDeckDraft(input);
const rules: GameplayRulesVersion = draft.rulesVersion;
const entries: readonly GameplayDeckEntry[] = draft.entries;
const projection: GameplayDeckList = {
  rulesVersion: draft.rulesVersion, contentVersion: draft.contentVersion, entries: draft.entries,
};
const empty: PersonalDeckDraft = { name: 'Rascunho', rulesVersion: '0.1', contentVersion: 'historical-v1', entries: [] };
const partial: PersonalDeckDraft = { ...empty, entries: [{ cardId: 'unrecognized-card', revision: 99, quantity: 1 }] };

// @ts-expect-error Rules versions are not arbitrary strings.
const foreignRules: PersonalDeckDraft = { ...empty, rulesVersion: '0.2' };
// @ts-expect-error Every reference retains its explicit mechanical revision.
const missingRevision: PersonalDeckDraft = { ...empty, entries: [{ cardId: 'card-1', quantity: 1 }] };
// @ts-expect-error Intent has no authenticated identity.
const forgedOwner: PersonalDeckDraft = { ...empty, uid: 'player-1' };
// @ts-expect-error Resource identity belongs to a future persistence boundary.
const resourceId: PersonalDeckDraft = { ...empty, deckId: 'deck-1' };
// @ts-expect-error Timestamps are not part of player intent.
const timestamp: PersonalDeckDraft = { ...empty, createdAt: 0 };
// @ts-expect-error Document versions are not part of player intent.
const documentVersion: PersonalDeckDraft = { ...empty, version: 1 };
// @ts-expect-error Expected versions belong to a future mutation contract.
const mutationVersion: PersonalDeckDraft = { ...empty, expectedVersion: 1 };
// @ts-expect-error Intent does not certify playability.
const validated: PersonalDeckDraft = { ...empty, isPlayable: true };
// @ts-expect-error The player cannot provide ownership authority.
const ownership: PersonalDeckDraft = { ...empty, ownership: [] };
// @ts-expect-error Canonical profiles do not belong to draft references.
const profile: PersonalDeckDraft = { ...empty, entries: [{ cardId: 'card-1', revision: 1, quantity: 1, definition: {} }] };
// @ts-expect-error Training is not a mode of personal intent or an ownership bypass.
const training: PersonalDeckDraft = { ...empty, training: true };
// @ts-expect-error Drafts remain readonly contracts.
draft.name = 'Changed';
// @ts-expect-error Composition entries remain readonly.
draft.entries[0]!.quantity = 2;
// @ts-expect-error A normalized draft does not expose battle instances.
draft.instances;
// @ts-expect-error Revisable limits cannot be mutated by a caller.
PERSONAL_DECK_LIMITS.maxDecks = 99;

void [draft, rules, entries, projection, empty, partial, foreignRules, missingRevision, forgedOwner, resourceId,
  timestamp, documentVersion, mutationVersion, validated, ownership, profile, training];
