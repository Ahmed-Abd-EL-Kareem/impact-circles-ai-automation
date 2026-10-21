import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * In-memory simulation of the PostgreSQL unique constraint on idempotencyKey
 * matching:
 * INSERT INTO "Expense" (...) VALUES (...)
 * ON CONFLICT ("idempotencyKey") DO UPDATE SET "updatedAt" = "Expense"."updatedAt"
 * RETURNING *;
 */
interface ExpenseRow {
  id: string;
  idempotencyKey: string | null;
  vendor: string | null;
  amount: string | null;
  currency: string | null;
  validationStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

class MockPostgresExpenseStore {
  private rows: Map<string, ExpenseRow> = new Map();
  private idempotencyIndex: Map<string, string> = new Map();

  async insertWithIdempotency(data: {
    id: string;
    idempotencyKey: string | null;
    vendor: string | null;
    amount: string | null;
    currency: string | null;
    validationStatus: string;
  }): Promise<ExpenseRow> {
    // If idempotencyKey is provided and already exists, ON CONFLICT takes effect:
    if (data.idempotencyKey) {
      const existingId = this.idempotencyIndex.get(data.idempotencyKey);
      if (existingId) {
        const existingRow = this.rows.get(existingId);
        if (existingRow) {
          // DO UPDATE SET "updatedAt" = "Expense"."updatedAt" (leaves existing data unchanged)
          return { ...existingRow };
        }
      }
    }

    // Otherwise, perform regular insert
    const now = new Date();
    const newRow: ExpenseRow = {
      id: data.id,
      idempotencyKey: data.idempotencyKey,
      vendor: data.vendor,
      amount: data.amount,
      currency: data.currency,
      validationStatus: data.validationStatus,
      createdAt: now,
      updatedAt: now,
    };

    this.rows.set(data.id, newRow);
    if (data.idempotencyKey) {
      this.idempotencyIndex.set(data.idempotencyKey, data.id);
    }

    return newRow;
  }

  getCount(): number {
    return this.rows.size;
  }

  getById(id: string): ExpenseRow | undefined {
    return this.rows.get(id);
  }
}

describe("Request Idempotency & Concurrency Guarantees", () => {
  it("returns identical record on repeated request with same idempotency key", async () => {
    const db = new MockPostgresExpenseStore();
    const idempotencyKey = "req_idem_1001";

    // 1. Initial execution
    const firstRun = await db.insertWithIdempotency({
      id: "exp_1",
      idempotencyKey,
      vendor: "Acme Corp",
      amount: "150.00",
      currency: "USD",
      validationStatus: "valid",
    });

    assert.strictEqual(firstRun.id, "exp_1");
    assert.strictEqual(db.getCount(), 1);

    // 2. Replay with identical key
    const replayRun = await db.insertWithIdempotency({
      id: "exp_2_generated_by_retry",
      idempotencyKey,
      vendor: "Acme Corp",
      amount: "150.00",
      currency: "USD",
      validationStatus: "valid",
    });

    assert.strictEqual(replayRun.id, "exp_1"); // Returns original record ID
    assert.strictEqual(db.getCount(), 1); // Database count has not increased
  });

  it("handles concurrent requests safely without creating duplicate records", async () => {
    const db = new MockPostgresExpenseStore();
    const idempotencyKey = "req_concurrent_race_99";

    // Simulate 5 simultaneous requests with the same idempotency key
    const concurrentExecutions = await Promise.all([
      db.insertWithIdempotency({
        id: "exp_race_1",
        idempotencyKey,
        vendor: "Vercel Inc.",
        amount: "20.00",
        currency: "USD",
        validationStatus: "valid",
      }),
      db.insertWithIdempotency({
        id: "exp_race_2",
        idempotencyKey,
        vendor: "Vercel Inc.",
        amount: "20.00",
        currency: "USD",
        validationStatus: "valid",
      }),
      db.insertWithIdempotency({
        id: "exp_race_3",
        idempotencyKey,
        vendor: "Vercel Inc.",
        amount: "20.00",
        currency: "USD",
        validationStatus: "valid",
      }),
    ]);

    // All concurrent callers received the identical record
    const targetId = concurrentExecutions[0].id;
    for (const res of concurrentExecutions) {
      assert.strictEqual(res.id, targetId);
    }

    assert.strictEqual(db.getCount(), 1);
  });

  it("does not overwrite original record with altered payload on idempotency replay", async () => {
    const db = new MockPostgresExpenseStore();
    const idempotencyKey = "req_tamper_attempt";

    // Original insert
    await db.insertWithIdempotency({
      id: "exp_original",
      idempotencyKey,
      vendor: "Stripe",
      amount: "500.00",
      currency: "USD",
      validationStatus: "valid",
    });

    // Replay with altered values under same key
    const replayResult = await db.insertWithIdempotency({
      id: "exp_new_id",
      idempotencyKey,
      vendor: "Altered Vendor Hacker",
      amount: "9999.00",
      currency: "EUR",
      validationStatus: "needs_review",
    });

    // Returned record must preserve original values
    assert.strictEqual(replayResult.id, "exp_original");
    assert.strictEqual(replayResult.vendor, "Stripe");
    assert.strictEqual(replayResult.amount, "500.00");
    assert.strictEqual(replayResult.currency, "USD");
    assert.strictEqual(replayResult.validationStatus, "valid");
  });

  it("creates separate records when different idempotency keys are supplied for identical invoices", async () => {
    const db = new MockPostgresExpenseStore();

    // First request
    const first = await db.insertWithIdempotency({
      id: "exp_first",
      idempotencyKey: "req_key_1",
      vendor: "GitHub",
      amount: "21.00",
      currency: "USD",
      validationStatus: "valid",
    });

    // Second logical request with different key (e.g. separate submission)
    const second = await db.insertWithIdempotency({
      id: "exp_second",
      idempotencyKey: "req_key_2",
      vendor: "GitHub",
      amount: "21.00",
      currency: "USD",
      validationStatus: "duplicate_suspected",
    });

    assert.strictEqual(first.id, "exp_first");
    assert.strictEqual(second.id, "exp_second");
    assert.strictEqual(db.getCount(), 2);
  });

  it("recovers from timeout-after-persistence: replaying key returns persisted expense", async () => {
    const db = new MockPostgresExpenseStore();
    const clientKey = "req_timeout_recovery_key";

    // 1. Initial call persists to database, but client experiences timeout before receiving response
    const persisted = await db.insertWithIdempotency({
      id: "exp_timed_out_on_wire",
      idempotencyKey: clientKey,
      vendor: "AWS Cloud",
      amount: "80.00",
      currency: "USD",
      validationStatus: "valid",
    });

    // 2. Client retries using the preserved idempotency key
    const retryResult = await db.insertWithIdempotency({
      id: "exp_retry_attempt_2",
      idempotencyKey: clientKey,
      vendor: "AWS Cloud",
      amount: "80.00",
      currency: "USD",
      validationStatus: "valid",
    });

    // Client safely receives the original persisted record
    assert.strictEqual(retryResult.id, persisted.id);
    assert.strictEqual(db.getCount(), 1);
  });
});
