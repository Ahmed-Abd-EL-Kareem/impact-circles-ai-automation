import { describe, it } from "node:test";
import assert from "node:assert";

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = typeof val === "string" ? val : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

describe("Phase 2: CSV Export Formatting & Invariants", () => {
  it("properly escapes fields containing commas, double quotes, and newlines", () => {
    assert.strictEqual(escapeCsvField("Acme, Inc."), '"Acme, Inc."');
    assert.strictEqual(escapeCsvField('Server "Pro" Model'), '"Server ""Pro"" Model"');
    assert.strictEqual(escapeCsvField("Line 1\nLine 2"), '"Line 1\nLine 2"');
    assert.strictEqual(escapeCsvField(123.45), "123.45");
    assert.strictEqual(escapeCsvField(null), "");
    assert.strictEqual(escapeCsvField(undefined), "");
  });

  it("produces standard RFC 4180 CSV line without data corruption", () => {
    const row = [
      escapeCsvField("id_123"),
      escapeCsvField("2026-03-20"),
      escapeCsvField("Acme Cloud, Inc."),
      escapeCsvField('INV-"9012"'),
      escapeCsvField("Hosting Cluster"),
      escapeCsvField("software"),
      escapeCsvField("165.00"),
      escapeCsvField("USD"),
      escapeCsvField("150.00"),
      escapeCsvField("15.00"),
      escapeCsvField("valid"),
      escapeCsvField(0),
      escapeCsvField("fictional-invoice.pdf"),
      escapeCsvField("2026-03-20T12:00:00.000Z"),
    ].join(",");

    assert.strictEqual(
      row,
      'id_123,2026-03-20,"Acme Cloud, Inc.","INV-""9012""",Hosting Cluster,software,165.00,USD,150.00,15.00,valid,0,fictional-invoice.pdf,2026-03-20T12:00:00.000Z'
    );
  });
});
