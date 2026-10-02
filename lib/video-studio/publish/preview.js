import { deliveryUrl, ORIGINALS_FOLDER, GENERATED_FOLDER } from '../cloudinary.js';
import { originalFromSidecar, isSyntheticClip } from './gate.js';

export function previewPlayers(cfg, { source, sidecar, draft, tags }) {
  const original = originalFromSidecar(sidecar);
  const sourceAsset = original || source;
  const draftAsset = draft || source;
  const url = (asset, transformation = 'c_limit,w_1280,h_1280/q_auto') => deliveryUrl(cfg, {
    resourceType: 'video',
    type: asset.type || 'upload',
    publicId: asset.public_id,
    ext: 'mp4',
    transformation,
  });
  const synthetic = isSyntheticClip({ tags: tags || source?.tags || [], sidecar });
  return {
    source: {
      public_id: sourceAsset.public_id,
      type: sourceAsset.type,
      preview_url: url(sourceAsset),
      kind: original ? 'original' : 'clip',
      originals_folder: ORIGINALS_FOLDER,
      note: original
        ? `Original referenced in sidecar (${original.public_id}).`
        : sidecar
          ? 'No original public_id in sidecar; showing the selected clip as source.'
          : 'Selected clip.',
    },
    draft: {
      public_id: draftAsset.public_id,
      type: draftAsset.type,
      preview_url: url(draftAsset),
      kind: String(draftAsset.public_id || '').startsWith(`${GENERATED_FOLDER}/`) ? 'generated' : 'draft',
    },
    synthetic,
    disclosure_locked: synthetic,
  };
}
