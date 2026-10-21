import { describe, it } from "node:test";
import assert from "node:assert";
import { validateFileBuffer, MAX_FILE_SIZE_BYTES } from "../../src/lib/validation/file.ts";

describe("File Validation & Magic Bytes", () => {
  it("accepts a valid PDF file with standard magic bytes (%PDF-)", () => {
    const pdfBuffer = Buffer.from("%PDF-1.7\nSample PDF body content");
    const result = validateFileBuffer(pdfBuffer, "invoice.pdf");

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.file.mimeType, "application/pdf");
      assert.strictEqual(result.file.fileName, "invoice.pdf");
      assert.strictEqual(result.file.sizeBytes, pdfBuffer.length);
    }
  });

  it("accepts a valid PNG file with standard magic bytes", () => {
    // 8-byte PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    const result = validateFileBuffer(pngHeader, "receipt.png");

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.file.mimeType, "image/png");
    }
  });

  it("accepts a valid JPEG file with standard magic bytes (FF D8 FF)", () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = validateFileBuffer(jpegHeader, "receipt.jpg");

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.file.mimeType, "image/jpeg");
    }
  });

  it("rejects spoofed files whose extension claims to be PDF but magic bytes are text/random", () => {
    const fakeBuffer = Buffer.from("Hello world, I am actually a text file pretending to be PDF");
    const result = validateFileBuffer(fakeBuffer, "fake-invoice.pdf");

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.match(result.error, /File signature verification failed/);
    }
  });

  it("rejects unsupported format (e.g., GIF, ZIP, EXE)", () => {
    const gifBuffer = Buffer.from("GIF89a\x01\x00\x01\x00");
    const result = validateFileBuffer(gifBuffer, "animation.gif");

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.match(result.error, /Unsupported file format/);
    }
  });

  it("rejects empty buffers", () => {
    const emptyBuffer = Buffer.alloc(0);
    const result = validateFileBuffer(emptyBuffer, "empty.pdf");

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error, "Empty file provided.");
    }
  });

  it("accepts file at exact 10 MB limit and rejects file oversized by 1 byte", () => {
    // Exact 10 MB buffer with PDF magic header
    const exactBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES);
    exactBuffer.write("%PDF-", 0);
    const exactResult = validateFileBuffer(exactBuffer, "exact10mb.pdf");
    assert.strictEqual(exactResult.success, true);

    // 10 MB + 1 byte
    const overBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1);
    overBuffer.write("%PDF-", 0);
    const overResult = validateFileBuffer(overBuffer, "over10mb.pdf");
    assert.strictEqual(overResult.success, false);
    if (!overResult.success) {
      assert.match(overResult.error, /File size exceeds the 10 MB limit/);
    }
  });

  it("sanitizes file names to prevent path traversal or shell exploits", () => {
    const pdfBuffer = Buffer.from("%PDF-1.4\nTest dummy invoice");
    const result = validateFileBuffer(
      pdfBuffer,
      "../../etc/passwd;rm -rf 'special\"chars.pdf"
    );

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.doesNotMatch(result.file.fileName, /\.\.\//);
      assert.doesNotMatch(result.file.fileName, /[;'"\\]/);
    }
  });
});
