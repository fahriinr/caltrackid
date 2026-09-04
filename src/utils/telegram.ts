import { Api } from "grammy";

/**
 * Downloads a file from Telegram by file_id and returns it as a Buffer.
 */
export async function downloadTelegramPhoto(
  api: Api,
  fileId: string,
  botToken: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const file = await api.getFile(fileId);
  if (!file.file_path) {
    throw new Error("Telegram did not return a valid file_path");
  }

  const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error(`Failed to download image from Telegram: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Determine mime-type based on extension
  let mimeType = "image/jpeg";
  if (file.file_path.endsWith(".png")) {
    mimeType = "image/png";
  } else if (file.file_path.endsWith(".webp")) {
    mimeType = "image/webp";
  }

  return { buffer, mimeType };
}
