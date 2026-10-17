import type { GameplayDeckCatalog } from '../gameplay';

/**
 * Trusted global content by explicit immutable version; no UID, active fallback or write API.
 * The future adapter must deeply validate the projection and match its contentVersion to the
 * requested version. null means absence only; malformed/mismatched content and infrastructure
 * failures must reject, never silently become null. No ownership/publication/admission decisions.
 * GameplayDeckCatalog preserves the shared readonly contract; this port implements no validation.
 */
export interface PersonalDeckCatalogReader {
  get(contentVersion: string): Promise<GameplayDeckCatalog | null>;
}
