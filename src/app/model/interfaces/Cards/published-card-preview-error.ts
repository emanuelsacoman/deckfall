/** Runtime diagnostic only; never persist an error or its original cause. */
export class PublishedCardPreviewError extends Error {
  constructor(
    readonly code: string | null,
    readonly cardId: string,
    readonly path: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'PublishedCardPreviewError';
  }
}

/** Codes are safe to display/log; original messages and URLs are deliberately excluded. */
export function publishedCardPreviewErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (typeof code === 'string' && /^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?$/.test(code)) return code;
  }
  if (error instanceof DOMException && error.name === 'NetworkError') return 'network';
  if (error instanceof TypeError && /^(Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed)$/i.test(error.message)) return 'network';
  return null;
}

/** User-facing text does not repeat SDK messages, credentials or signed download URLs. */
export function publishedCardPreviewMessage(error: unknown): string {
  switch (publishedCardPreviewErrorCode(error)) {
    case 'storage/object-not-found': return 'A imagem desta carta ainda não foi publicada.';
    case 'storage/unauthorized': return 'Sua conta não possui autorização para carregar esta imagem.';
    case 'storage/unauthenticated': return 'Sua sessão precisa ser renovada para carregar esta imagem.';
    case 'storage/retry-limit-exceeded':
    case 'storage/network-request-failed':
    case 'network-request-failed':
    case 'network': return 'Não foi possível baixar a imagem. Confira sua conexão.';
    case 'preview-invalid': return 'A imagem publicada desta carta está inválida.';
    default: return 'Não foi possível carregar a imagem publicada. Tente novamente.';
  }
}
