import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import jpeg from 'jpeg-js';
import { DEMO_PHOTO_FOLDER } from './data';

export interface DemoPhotoStore {
  upload(path: string, body: Buffer): Promise<void>;
  /** Deletes every file under a top-level folder (and one level of subfolders). */
  removeFolder(folder: string): Promise<number>;
}

export function demoPhotoPath(userId: string): string {
  return `${DEMO_PHOTO_FOLDER}/${userId}/${randomUUID()}.jpg`;
}

/**
 * A soft diagonal gradient in the dish's colour family with a gentle vignette:
 * obviously a placeholder, but photo-shaped for designing layouts around.
 */
export function placeholderJpeg(hue: number, width = 640, height = 480): Buffer {
  const data = Buffer.alloc(width * height * 4);
  const [r1, g1, b1] = hslToRgb(hue, 0.55, 0.64);
  const [r2, g2, b2] = hslToRgb(hue + 25, 0.5, 0.3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      const dx = x / width - 0.5;
      const dy = y / height - 0.5;
      const vignette = 1 - Math.min(1, (dx * dx + dy * dy) * 1.2);
      const i = (y * width + x) * 4;
      data[i] = (r1 + (r2 - r1) * t) * vignette;
      data[i + 1] = (g1 + (g2 - g1) * t) * vignette;
      data[i + 2] = (b1 + (b2 - b1) * t) * vignette;
      data[i + 3] = 255;
    }
  }

  return Buffer.from(jpeg.encode({ data, width, height }, 72).data);
}

function hslToRgb(hueDegrees: number, s: number, l: number): [number, number, number] {
  const h = (((hueDegrees % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (offset: number) => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(1 / 3) * 255, channel(0) * 255, channel(-1 / 3) * 255];
}

export function createSupabaseDemoPhotoStore(options: {
  url: string;
  secretKey: string;
  bucket: string;
}): DemoPhotoStore {
  const client = createClient(options.url, options.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = client.storage.from(options.bucket);

  return {
    async upload(path, body) {
      const { error } = await bucket.upload(path, body, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw new Error(`Uploading ${path} failed: ${error.message}`);
    },

    async removeFolder(folder) {
      const top = await bucket.list(folder, { limit: 1000 });
      if (top.error) throw new Error(`Listing ${folder}/ failed: ${top.error.message}`);

      const paths: string[] = [];
      for (const entry of top.data) {
        // Files have ids; "folders" are just shared path prefixes and don't
        if (entry.id) {
          paths.push(`${folder}/${entry.name}`);
          continue;
        }
        const inner = await bucket.list(`${folder}/${entry.name}`, { limit: 1000 });
        if (inner.error)
          throw new Error(`Listing ${folder}/${entry.name}/ failed: ${inner.error.message}`);
        paths.push(
          ...inner.data
            .filter((file) => file.id)
            .map((file) => `${folder}/${entry.name}/${file.name}`),
        );
      }

      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await bucket.remove(paths.slice(i, i + 100));
        if (error) throw new Error(`Removing demo photos failed: ${error.message}`);
      }
      return paths.length;
    },
  };
}
