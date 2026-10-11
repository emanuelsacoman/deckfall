import { Injectable } from '@angular/core';
import { CardEditorDocument, PendingCardAsset } from '../../interfaces/Cards/card-canvas';

interface LocalCardDraft {
  document: CardEditorDocument;
  files: PendingCardAsset[];
  savedAt: string;
}

@Injectable({ providedIn: 'root' })
export class CardLocalDraftService {
  private readonly database = 'deckfall-card-editor';

  async save(key: string, document: CardEditorDocument, files: PendingCardAsset[]): Promise<void> {
    const database = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('drafts', 'readwrite');
        transaction.objectStore('drafts').put({ document, files, savedAt: new Date().toISOString() } satisfies LocalCardDraft, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('Não foi possível salvar o rascunho local.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('O navegador interrompeu o salvamento local.'));
      });
    } finally { database.close(); }
  }

  async load(key: string): Promise<LocalCardDraft | null> {
    const database = await this.open();
    try {
      return await new Promise<LocalCardDraft | null>((resolve, reject) => {
        const request = database.transaction('drafts', 'readonly').objectStore('drafts').get(key);
        request.onsuccess = () => resolve(request.result as LocalCardDraft | undefined ?? null);
        request.onerror = () => reject(request.error ?? new Error('Não foi possível ler o rascunho local.'));
      });
    } finally { database.close(); }
  }

  private open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Este navegador não oferece armazenamento local do editor.'));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.database, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o armazenamento local.'));
      request.onblocked = () => reject(new Error('Feche outras abas do editor e tente novamente.'));
    });
  }
}
