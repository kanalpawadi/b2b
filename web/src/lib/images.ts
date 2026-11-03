import { isWebUrl, LOGO_BUCKET, PRODUCT_BUCKET, supabase } from './supabase';

const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const PHOTO_TYPES = /^image\/(jpeg|png|webp|heic|heif)$/;
/** Logos: the formats the brief asks for. */
export const LOGO_TYPES = ['image/png', 'image/jpeg'];
export const LOGO_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg';
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Re-encodes an image to WebP (longest edge at most maxEdge). Drawing through
 * a canvas drops EXIF — including the GPS position phones embed — and
 * anything that isn't really an image fails to decode here instead of
 * reaching storage. WebP keeps transparency, so logos stay cut out.
 */
async function reencode(file: File, maxEdge: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That file could not be read as an image.');
  });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.88));
  if (!blob) throw new Error('Could not process that image.');
  return blob;
}

async function put(bucket: string, path: string, blob: Blob) {
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function uploadProductImage(productKey: string, file: File): Promise<string> {
  if (!PHOTO_TYPES.test(file.type)) throw new Error('Choose a JPG, PNG or WebP photo.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That photo is larger than 15 MB.');
  return put(PRODUCT_BUCKET, `${productKey}/${crypto.randomUUID()}.webp`, await reencode(file, 1600));
}

/** Uploaded photos are deleted from storage; pasted web addresses are left alone. */
export async function removeProductImages(paths: string[]) {
  const own = paths.filter((p) => !isWebUrl(p));
  if (own.length) await supabase.storage.from(PRODUCT_BUCKET).remove(own);
}

/** Returns an error message for a file that can't be a company logo, or null. */
export function checkLogoFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!LOGO_TYPES.includes(file.type) || !['png', 'jpg', 'jpeg'].includes(ext)) return 'Choose a PNG, JPG or JPEG image.';
  if (file.size > LOGO_MAX_BYTES) return 'That logo is larger than 5 MB.';
  return null;
}

export async function uploadCompanyLogo(file: File): Promise<string> {
  const problem = checkLogoFile(file);
  if (problem) throw new Error(problem);
  return put(LOGO_BUCKET, `${crypto.randomUUID()}.webp`, await reencode(file, 640));
}

export async function removeCompanyLogo(path: string | null | undefined) {
  if (path) await supabase.storage.from(LOGO_BUCKET).remove([path]);
}
