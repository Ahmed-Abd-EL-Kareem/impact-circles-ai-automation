export interface ValidatedFile {
  buffer: Buffer;
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
  fileName: string;
  sizeBytes: number;
}

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Validates document buffer by checking actual magic bytes and bounds.
 * Never trusts client-reported MIME type or extension alone.
 */
export function validateFileBuffer(
  buffer: Buffer,
  originalFileName: string
): { success: true; file: ValidatedFile } | { success: false; error: string } {
  if (!buffer || buffer.length === 0) {
    return { success: false, error: "Empty file provided." };
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      error: `File size exceeds the 10 MB limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`,
    };
  }

  // Detect MIME type via magic bytes
  let detectedMime: ValidatedFile["mimeType"] | null = null;

  // PDF magic bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    detectedMime = "application/pdf";
  }
  // PNG magic bytes: \x89PNG\r\n\x1a\n (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
  else if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    detectedMime = "image/png";
  }
  // JPEG magic bytes: FF D8 FF
  else if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    detectedMime = "image/jpeg";
  }

  if (!detectedMime) {
    return {
      success: false,
      error:
        "Unsupported file format. Please upload a genuine PDF, PNG, or JPEG document. File signature verification failed.",
    };
  }

  // Sanitize file name to avoid directory traversal or dangerous characters
  const sanitizedFileName = originalFileName
    .replace(/[^\w.\- ()]/g, "_")
    .slice(0, 255);

  return {
    success: true,
    file: {
      buffer,
      mimeType: detectedMime,
      fileName: sanitizedFileName || "document",
      sizeBytes: buffer.length,
    },
  };
}
