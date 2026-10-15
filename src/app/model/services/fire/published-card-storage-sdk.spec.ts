import { deleteApp, initializeApp } from 'firebase/app';
import { getBlob, getStorage, ref } from 'firebase/storage';
import { downloadPublishedCardPreview, PUBLISHED_CARD_PREVIEW_MAX_BYTES } from './published-card-storage.service';

describe('Published preview: installed Firebase SDK and browser Blob transport', () => {
  it('preserves PNG MIME by omitting the SDK size argument that slices away its type', async () => {
    const app = initializeApp({ projectId: 'demo-preview-sdk', storageBucket: 'demo-preview-sdk.firebasestorage.app' }, 'preview-mime-regression');
    const reference = ref(getStorage(app), 'published-cards/46f5c359-0d1e-423e-911e-4ba592567405/preview.png');
    const png = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII='), character => character.charCodeAt(0))], { type: 'image/png' });
    const localUrl = URL.createObjectURL(png);
    const originalOpen = XMLHttpRequest.prototype.open;
    // Only redirect this demo SDK request to a native browser Blob URL. No live
    // credentials, production requests, mocked SDK, or mocked XHR response are used.
    spyOn(XMLHttpRequest.prototype, 'open').and.callFake(function (this: XMLHttpRequest, method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null): void {
      expect(String(url)).toContain('/b/demo-preview-sdk.firebasestorage.app/o/');
      originalOpen.call(this, method, localUrl, async, username, password);
    });
    try {
      const oldDownload = await getBlob(reference, PUBLISHED_CARD_PREVIEW_MAX_BYTES);
      expect(oldDownload.type).toBe('');
      expect(oldDownload.size).toBe(png.size);
      // Supply the modular SDK directly; this isolated test has no AngularFire app provider.
      const correctedDownload = await downloadPublishedCardPreview(reference, getBlob);
      expect(correctedDownload.type).toBe('image/png');
      expect(correctedDownload.size).toBe(png.size);
      expect(await correctedDownload.arrayBuffer()).toEqual(await png.arrayBuffer());
    } finally {
      URL.revokeObjectURL(localUrl);
      await deleteApp(app);
    }
  });
});
