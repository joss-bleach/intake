// What the vision model accepts, and what an `<input accept="image/*">`
// realistically produces across iOS and Android. Shared so the client's own
// check and the extract mutation's validator can't drift: the client rejects
// early to give a useful message, the server rejects because mediaType is
// passed straight through to the model provider.
export const SUPPORTED_IMAGE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
] as const;

export type SupportedImageMediaType = (typeof SUPPORTED_IMAGE_MEDIA_TYPES)[number];

export const isSupportedImageMediaType = (
  mediaType: string,
): mediaType is SupportedImageMediaType =>
  (SUPPORTED_IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType);
