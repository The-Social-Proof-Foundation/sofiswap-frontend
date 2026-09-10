/** Normalize GraphQL / indexer photo and media URLs for <img> / next/image. */
export function resolveSocialMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const t = url.trim();
  if (!t) return null;
  if (t.startsWith('https://') || t.startsWith('http://')) return t;
  if (t.startsWith('//')) return `https:${t}`;
  return t;
}

function urlFromUnknown(entry: unknown): string | null {
  if (typeof entry === 'string') return resolveSocialMediaUrl(entry);
  if (entry && typeof entry === 'object') {
    const rec = entry as Record<string, unknown>;
    const candidate = rec.url ?? rec.src ?? rec.mediaUrl ?? rec.href;
    if (typeof candidate === 'string') return resolveSocialMediaUrl(candidate);
  }
  return null;
}

/** First usable post media URL. `mediaUrls` may be a string[], JSON string, or objects with url/src. */
export function firstMediaUrl(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = urlFromUnknown(entry);
      if (url) return url;
    }
    return null;
  }
  if (typeof value === 'string') {
    try {
      return firstMediaUrl(JSON.parse(value));
    } catch {
      return resolveSocialMediaUrl(value);
    }
  }
  return urlFromUnknown(value);
}

export function profileDirectoryThumbUrl(profilePhoto: string | null | undefined): string | null {
  return resolveSocialMediaUrl(profilePhoto);
}

/** Post cards prefer the first media preview; owner photo is the avatar fallback. */
export function postDirectoryThumbUrl(
  mediaUrls: unknown,
  ownerPhoto?: string | null
): string | null {
  return firstMediaUrl(mediaUrls) ?? resolveSocialMediaUrl(ownerPhoto);
}
