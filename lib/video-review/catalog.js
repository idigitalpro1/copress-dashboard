export function dbRowToCatalogItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    creator: row.creator,
    credit: row.credit,
    publications: row.publications,
    towns: row.towns || [],
    published_at: row.published_at,
    status: 'published',
    kind: row.kind || 'recorded',
    ...(row.live_confirmed_at ? { live_confirmed_at: row.live_confirmed_at } : {}),
    ...(row.poster_url ? { poster_url: row.poster_url } : {}),
    playback: row.playback,
    captions: row.captions || [],
  };
}

export function pendingVideoPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    creator: row.creator,
    credit: row.credit,
    publications: row.publications,
    towns: row.towns || [],
    status: row.status,
    short_code: row.short_code,
    kind: row.kind || 'recorded',
    poster_url: row.poster_url || null,
    playback: row.playback,
    captions: row.captions || [],
    submitted_at: row.submitted_at,
    code_expires_at: row.code_expires_at,
    published_at: row.published_at,
    live_confirmed_at: row.live_confirmed_at || null,
  };
}
