import { STUDIO_FOLDER } from './cloudinary.js';

// Studio workspaces: "My properties" (conews.press, 5280.menu, the town papers) plus one per
// client. Each owns its uploads, review queue, publish queue and YouTube channel connection.
// To add a client, add one entry here (and nothing else): ownership, folders and the OAuth
// token row key all derive from it.
export const DEFAULT_WORKSPACE = 'my-properties';

export const WORKSPACES = {
  'my-properties': {
    id: 'my-properties',
    label: 'My properties',
    kind: 'own',
    description: 'conews.press, 5280.menu and the town papers.',
    // Everything not owned by a client belongs here, so it needs no prefixes.
    prefixes: [],
    creatorSlugs: [],
    uploadFolder: STUDIO_FOLDER,
    defaultCreator: null,
    defaultCredit: null,
  },
  'paul-hill': {
    id: 'paul-hill',
    label: 'Paul Hill',
    kind: 'client',
    description: 'Paul Hill: drafts under satcom/paul-hill/ and his own YouTube channel.',
    prefixes: ['satcom/paul-hill/', `${STUDIO_FOLDER}/ws/paul-hill/`],
    creatorSlugs: ['paul-hill'],
    uploadFolder: `${STUDIO_FOLDER}/ws/paul-hill`,
    defaultCreator: 'paul-hill',
    defaultCredit: 'Paul Hill · Colorado News Press',
  },
};

export const WORKSPACE_IDS = Object.keys(WORKSPACES);

export function isWorkspaceId(value) {
  return typeof value === 'string' && Object.hasOwn(WORKSPACES, value);
}

export function getWorkspace(id) {
  return WORKSPACES[isWorkspaceId(id) ? id : DEFAULT_WORKSPACE];
}

export function publicWorkspaces() {
  return Object.values(WORKSPACES).map(w => ({
    id: w.id, label: w.label, kind: w.kind, description: w.description,
    default_creator: w.defaultCreator, default_credit: w.defaultCredit,
  }));
}

// Which workspace owns a Cloudinary asset. Client prefixes win; creator phone uploads
// (satcom/<slug>/incoming) follow their creator slug; everything else is My properties.
export function workspaceForPublicId(publicId) {
  const id = String(publicId || '');
  for (const w of Object.values(WORKSPACES)) {
    if (w.prefixes.some(p => id.startsWith(p))) return w.id;
  }
  const incoming = /^satcom\/([a-z0-9]+(?:-[a-z0-9]+)*)\/incoming\//.exec(id);
  if (incoming) {
    for (const w of Object.values(WORKSPACES)) if (w.creatorSlugs.includes(incoming[1])) return w.id;
  }
  return DEFAULT_WORKSPACE;
}

export function workspaceForCreator(slug) {
  for (const w of Object.values(WORKSPACES)) if (w.creatorSlugs.includes(slug)) return w.id;
  return DEFAULT_WORKSPACE;
}

export function clientWorkspaces() {
  return Object.values(WORKSPACES).filter(w => w.kind === 'client');
}

// Cloudinary Search expression fragment that narrows assets to one workspace. Results are
// ALSO filtered in code with workspaceForPublicId, so this is only a performance hint.
export function workspaceSearchClause(workspaceId) {
  const w = getWorkspace(workspaceId);
  if (w.kind === 'client') {
    const parts = w.prefixes.map(p => `public_id:${p}*`);
    parts.push(`tags=ws-${w.id}`);
    return `(${parts.join(' OR ')})`;
  }
  return clientWorkspaces().map(c => `NOT tags=ws-${c.id}`).join(' AND ');
}

export function assertAssetInWorkspace(publicId, workspaceId) {
  const owner = workspaceForPublicId(publicId);
  if (owner === workspaceId) return;
  const error = new Error(`This clip belongs to the ${getWorkspace(owner).label} workspace. Switch workspaces to work on it.`);
  error.status = 400;
  error.expose = true;
  throw error;
}
