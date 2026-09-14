import { randomUUID } from 'node:crypto';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PHOTO_PATH = new RegExp(`^(${UUID})/${UUID}\\.jpg$`);

/** Photos live in a folder per user, under a random name nobody can guess. */
export function newPhotoPath(userId: string): string {
  return `${userId}/${randomUUID()}.jpg`;
}

/** True only for a path in this user's own folder, in the exact shape newPhotoPath makes. */
export function isOwnPhotoPath(path: string, userId: string): boolean {
  const match = PHOTO_PATH.exec(path);
  return match !== null && match[1] === userId;
}
