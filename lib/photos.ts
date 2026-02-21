import type { TelegramPhotoSize } from "wrappergram";
import { getTg } from "./tg.ts";
import { put } from "@vercel/blob";
import type { UserRef } from "../models/user.ts";

/**
 * Hosts Telegram user's profile photo on Vercel Blob, and returns publically
 * accessible photo URL. Returns undefined if user has no profile photos.
 * Throws UserPhotoUploadError if photo cannot be downloaded from Telegram,
 * or cannot be uploaded to Vercel Blob.
 */
export async function hostUserPhoto(ref: UserRef): Promise<string | undefined> {
  const photo = await fetchPhoto(ref.tgId);

  if (!photo) {
    return undefined;
  }

  const digest = ref.digest();
  const url = await uploadToBlob(`photos/${digest}.${photo.ext}`, photo.body);
  return url;
}

export class UserPhotoUploadError extends Error {
  name = "UserPhotoUploadError";
}

// Private

const preferredPhotoSize = 256;

async function fetchPhoto(
  tgUserId: number,
): Promise<{ body: ReadableStream; ext: string } | undefined> {
  const fileId = await getPhotoFileId(tgUserId);

  if (!fileId) {
    return undefined;
  }

  const fileUrl = await getTgFileUrl(fileId);
  const ext = getFileExt(fileUrl) ?? ".jpg";
  const res = await fetch(fileUrl);

  if (!res.ok) {
    const desc = await res.text().catch(() => "Unknown error");
    throw new UserPhotoUploadError(
      `Failed to fetch user profile photo from ${fileUrl}`,
      { cause: desc },
    );
  }

  if (!res.body) {
    throw new UserPhotoUploadError(
      `Failed to fetch user profile photo from ${fileUrl}: response body is empty`,
    );
  }

  return { body: res.body, ext };
}

async function uploadToBlob(
  path: string,
  body: ReadableStream,
): Promise<string> {
  try {
    const blob = await put(path, body, {
      access: "public",
      allowOverwrite: true,
    });

    return blob.url;
  } catch (err) {
    throw new UserPhotoUploadError("Failed to upload to Vercel Blob", {
      cause: err,
    });
  }
}

async function getPhotoFileId(tgUserId: number): Promise<string | undefined> {
  const tg = getTg();
  const res = await tg.api.getUserProfilePhotos({
    user_id: tgUserId,
    limit: 1,
  });

  if (!res.ok) {
    throw new UserPhotoUploadError("Failed to get user profile photos", {
      cause: res,
    });
  }

  if (res.result.total_count) {
    return undefined;
  }

  const sizes = res.result.photos[0];
  const photo = pickPhotoSize(sizes, preferredPhotoSize);
  return photo.file_id;
}

async function getTgFileUrl(fileId: string): Promise<string> {
  const tg = getTg();
  const res = await tg.api.getFile({ file_id: fileId });

  if (!res.ok) {
    throw new UserPhotoUploadError("Failed to get user profile photo file", {
      cause: res,
    });
  }

  const filePath = res.result.file_path;
  return `https://api.telegram.org/file/bot${tg.token}/${filePath}`;
}

/**
 * Picks a photo that's as close to preferred size as possible. Prefers larger
 * photos over smaller ones.
 */
function pickPhotoSize(
  sizes: TelegramPhotoSize[],
  preferredSize: number,
): TelegramPhotoSize {
  let best: TelegramPhotoSize | undefined;

  for (const size of sizes) {
    if (size.width >= preferredSize) {
      if (!best || size.width < best.width) {
        best = size;
      }
    }
  }

  return best ?? sizes[sizes.length - 1];
}

function getFileExt(url: string): string | undefined {
  const match = url.match(/\.[A-Za-z0-9]+/);
  return match?.[0];
}
