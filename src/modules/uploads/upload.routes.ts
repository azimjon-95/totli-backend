import { createHash } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '../../config/env.js';
import { requireAdminAuth } from '../../middleware/auth.js';
import { sendSuccess } from '../../shared/response.js';
import { AppError } from '../../shared/errors.js';

type ResourceKind = 'image' | 'video';

const FOLDERS: Record<ResourceKind, string> = {
  image: 'totli/images',
  video: 'totli/videos',
};

/**
 * Signs a direct browser → Cloudinary upload.
 *
 * The file never touches this server: the admin panel asks for a signature,
 * then POSTs the image straight to Cloudinary. That keeps large multipart
 * bodies off the API process entirely (no multer, no temp files, no memory
 * spikes) and means the API secret never leaves the backend.
 *
 * Cloudinary's rule: sign the alphabetically-sorted params that will be sent,
 * joined as `k=v&k=v`, with the API secret appended, hashed as SHA-1.
 */
function signParams(params: Record<string, string | number>, secret: string): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return createHash('sha1').update(canonical + secret).digest('hex');
}

async function getUploadSignature(req: Request, res: Response, next: NextFunction) {
  try {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = env;

    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new AppError(
        503,
        'Rasm yuklash sozlanmagan — CLOUDINARY_* env oʻzgaruvchilarini toʻldiring',
        'UPLOAD_NOT_CONFIGURED'
      );
    }

    const kind: ResourceKind = req.query.kind === 'video' ? 'video' : 'image';
    const folder = FOLDERS[kind];

    const timestamp = Math.floor(Date.now() / 1000);
    // Only the params the browser will actually send get signed — adding one
    // here without sending it (or vice versa) makes Cloudinary reject the upload.
    const params = { folder, timestamp };

    return sendSuccess(res, {
      cloudName: CLOUDINARY_CLOUD_NAME,
      apiKey: CLOUDINARY_API_KEY,
      kind,
      folder,
      timestamp,
      signature: signParams(params, CLOUDINARY_API_SECRET),
      uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${kind}/upload`,
    });
  } catch (err) {
    next(err);
  }
}

const router = Router();

router.use(requireAdminAuth);
router.get('/signature', getUploadSignature);

export default router;
