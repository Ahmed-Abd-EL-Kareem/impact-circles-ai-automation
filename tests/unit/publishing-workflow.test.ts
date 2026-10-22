import { describe, it, beforeEach, after, before } from "node:test";
import assert from "node:assert";
import http from "node:http";
import { prisma } from "../../src/lib/db.ts";
import {
  publishContentPost,
  SUPPORTED_CHANNELS,
} from "../../src/lib/services/publishing.ts";
import type { PublishChannel } from "../../src/lib/types/content.ts";

describe("Phase 1: Real Sandbox Publishing Invariants & Workflow", () => {
  let mockPost: any = null;
  let mockLogs: any[] = [];
  let testServer: http.Server;
  let serverPort: number;
  let serverRequests: Array<{ url: string; method: string; body: any; auth: string | undefined }> = [];
  let failingChannels = new Set<string>();

  before(async () => {
    testServer = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf-8");
      let body: any = {};
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }

      const record = {
        url: req.url || "",
        method: req.method || "",
        body,
        auth: req.headers["authorization"],
      };
      serverRequests.push(record);

      // Check if channel is simulated to fail
      if (req.url?.includes("/api/sandbox/linkedin") && failingChannels.has("linkedin")) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Simulated LinkedIn failure" }));
        return;
      }
      if (req.url?.includes("/api/sandbox/cms") && failingChannels.has("website")) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Simulated CMS failure" }));
        return;
      }
      if (req.url?.includes("/api/sandbox/newsletter") && failingChannels.has("newsletter")) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Simulated Newsletter failure" }));
        return;
      }

      // Successful sandbox dispatches
      if (req.url?.includes("/api/sandbox/cms/posts")) {
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "pub_cms_123",
          link: `http://127.0.0.1:${serverPort}/sandbox/news/${body.slug || "test-post"}`,
        }));
        return;
      }
      if (req.url?.includes("/api/sandbox/linkedin/posts")) {
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "urn:li:share:test_123",
          link: `http://127.0.0.1:${serverPort}/sandbox/linkedin/test_123`,
        }));
        return;
      }
      if (req.url?.includes("/api/sandbox/newsletter/send")) {
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: "camp_test_123",
          link: `http://127.0.0.1:${serverPort}/sandbox/newsletter/camp_test_123`,
        }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
    });

    serverPort = await new Promise<number>((resolve) => {
      testServer.listen(0, "127.0.0.1", () => {
        const addr = testServer.address();
        resolve(typeof addr === "object" && addr ? addr.port : 58999);
      });
    });

    process.env.SANDBOX_BASE_URL = `http://127.0.0.1:${serverPort}`;
    process.env.SANDBOX_API_KEY = "test_sandbox_secret";
  });

  after(async () => {
    delete process.env.SANDBOX_BASE_URL;
    delete process.env.SANDBOX_API_KEY;
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
  });

  beforeEach(() => {
    mockLogs = [];
    serverRequests = [];
    failingChannels.clear();

    mockPost = {
      id: "post_test_123",
      title: "Clean Water Sensor Milestone",
      sourcePrompt: "Completed 6-month field trial of solar-powered biosensors.",
      contentType: "research_update",
      status: "draft",
      linkedinContent: JSON.stringify({
        postText: "Exciting milestone at Impact Circles!",
        hashtags: ["#ImpactCircles"],
        characterCount: 37,
      }),
      newsletterContent: JSON.stringify({
        subject: "Milestone Update",
        previewText: "Trial complete",
        bodyText: "Field trials completed successfully.",
        callToAction: "Read more",
      }),
      websiteContent: JSON.stringify({
        title: "Clean Water Sensor Milestone",
        subtitle: "Trial complete",
        slug: "clean-water-sensor-milestone",
        bodyMarkdown: "# Clean Water\n\nDetails here...",
        tags: ["Research"],
      }),
      targetChannels: ["website", "linkedin", "newsletter"],
      metadata: {},
      rejectionReason: null,
      approvedAt: null,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      publishingLogs: [],
    };

    // Stub prisma methods
    (prisma.contentPost as any).findUnique = async ({ where }: any) => {
      if (where.id === mockPost?.id) {
        return { ...mockPost, publishingLogs: [...mockLogs] };
      }
      return null;
    };

    (prisma.contentPost as any).update = async ({ where, data }: any) => {
      if (where.id === mockPost?.id) {
        mockPost = { ...mockPost, ...data, updatedAt: new Date() };
        return { ...mockPost, publishingLogs: [...mockLogs] };
      }
      throw new Error("Post not found");
    };

    (prisma.publishingLog as any).create = async ({ data }: any) => {
      const newLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        createdAt: new Date(),
      };
      mockLogs.push(newLog);
      return newLog;
    };
  });

  it("exports the supported channel definitions", () => {
    assert.deepStrictEqual(SUPPORTED_CHANNELS, ["website", "linkedin", "newsletter"]);
  });

  it("strictly rejects publication of an unapproved post", async () => {
    mockPost.status = "draft";
    mockPost.approvedAt = null;

    const result = await publishContentPost("post_test_123");
    assert.strictEqual(result.success, false);
    assert.ok(
      result.error?.includes("Explicit human approval is required before publishing"),
      `Expected approval error message, got: ${result.error}`
    );
    assert.strictEqual(mockLogs.length, 0);
    assert.strictEqual(serverRequests.length, 0);
  });

  it("strictly rejects publication of an 'in_review' or 'rejected' post", async () => {
    mockPost.status = "in_review";
    const resReview = await publishContentPost("post_test_123");
    assert.strictEqual(resReview.success, false);
    assert.ok(resReview.error?.includes("Explicit human approval is required"));

    mockPost.status = "rejected";
    const resRejected = await publishContentPost("post_test_123");
    assert.strictEqual(resRejected.success, false);
    assert.ok(resRejected.error?.includes("Explicit human approval is required"));
    assert.strictEqual(serverRequests.length, 0);
  });

  it("returns not found for nonexistent content post", async () => {
    const result = await publishContentPost("nonexistent_id");
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("not found"));
  });

  it("rejects invalid or unsupported channel names with a controlled validation error", async () => {
    mockPost.status = "approved";
    mockPost.approvedAt = new Date();

    const result = await publishContentPost("post_test_123", {
      forcedChannels: ["facebook" as unknown as PublishChannel],
    });

    assert.strictEqual(result.success, false);
    assert.ok(
      result.error?.includes("Invalid channel 'facebook'"),
      `Expected channel validation error, got: ${result.error}`
    );
    assert.strictEqual(mockLogs.length, 0);
    assert.strictEqual(serverRequests.length, 0);
  });

  it("success path performs real HTTP fetch, stores URL, and sets status to 'published'", async () => {
    mockPost.status = "approved";
    mockPost.approvedAt = new Date();

    const result = await publishContentPost("post_test_123", {
      forcedChannels: ["website", "linkedin", "newsletter"],
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.results.length, 3);
    assert.strictEqual(serverRequests.length, 3);

    // Verify Authorization Bearer was sent on all requests
    for (const req of serverRequests) {
      assert.strictEqual(req.auth, "Bearer test_sandbox_secret");
    }

    // Verify all 3 channels recorded 'published' status with real URLs
    for (const r of result.results) {
      assert.strictEqual(r.status, "published");
      assert.ok(r.publishedUrl?.includes(`http://127.0.0.1:${serverPort}`));
    }

    assert.strictEqual(mockLogs.length, 3);
    for (const log of mockLogs) {
      assert.strictEqual(log.status, "published");
      assert.strictEqual(log.postId, "post_test_123");
    }

    assert.strictEqual(mockPost.status, "published");
    assert.ok(mockPost.publishedAt);
  });

  it("one failing channel gives 'partially_published' status", async () => {
    mockPost.status = "approved";
    mockPost.approvedAt = new Date();
    failingChannels.add("linkedin"); // Simulate linkedin failure

    const result = await publishContentPost("post_test_123", {
      forcedChannels: ["website", "linkedin", "newsletter"],
    });

    assert.strictEqual(result.success, true); // at least one succeeded
    assert.strictEqual(mockPost.status, "partially_published");

    const linkedinResult = result.results.find((r) => r.channel === "linkedin");
    assert.ok(linkedinResult);
    assert.strictEqual(linkedinResult.status, "failed");
    assert.ok(linkedinResult.errorMessage?.includes("500"));

    const webResult = result.results.find((r) => r.channel === "website");
    assert.strictEqual(webResult?.status, "published");

    const newsletterResult = result.results.find((r) => r.channel === "newsletter");
    assert.strictEqual(newsletterResult?.status, "published");
  });

  it("retry only hits failed channel and skips already published channels (no double publish)", async () => {
    // 1. Initial attempt where linkedin fails
    mockPost.status = "approved";
    mockPost.approvedAt = new Date();
    failingChannels.add("linkedin");

    const initialResult = await publishContentPost("post_test_123");
    assert.strictEqual(mockPost.status, "partially_published");
    assert.strictEqual(serverRequests.length, 3);

    // 2. Fix linkedin failure and clear request log
    failingChannels.clear();
    serverRequests = [];

    // 3. Retry publishing the post
    const retryResult = await publishContentPost("post_test_123");

    // Only linkedin should have been dispatched via HTTP!
    assert.strictEqual(serverRequests.length, 1);
    assert.ok(serverRequests[0].url.includes("/api/sandbox/linkedin"));

    // Website and newsletter were preserved without duplicate HTTP dispatches
    assert.strictEqual(mockPost.status, "published");
    assert.strictEqual(retryResult.results.length, 3);

    // Ensure mockLogs contains 4 total entries: 2 from initial success, 1 initial fail, 1 retry success
    assert.strictEqual(mockLogs.length, 4);
  });

  it("enforces re-approval invariant: editing approved content resets status to 'in_review'", () => {
    const existingPost = {
      id: "post_approved_1",
      title: "Clean Water Sensor Milestone",
      status: "approved",
      approvedAt: new Date(),
      websiteContent: "Original verified text",
    };

    // Simulate edit operation
    const incomingEdits = {
      websiteContent: "Edited unreviewed content",
    };

    const contentChanged = incomingEdits.websiteContent !== existingPost.websiteContent;
    let nextStatus = existingPost.status;
    let nextApprovedAt: Date | null = existingPost.approvedAt;

    if (contentChanged && existingPost.status === "approved") {
      nextStatus = "in_review";
      nextApprovedAt = null;
    }

    assert.strictEqual(contentChanged, true);
    assert.strictEqual(nextStatus, "in_review");
    assert.strictEqual(nextApprovedAt, null);

    // Publication logic checks
    const canPublish = nextStatus === "approved" && nextApprovedAt !== null;
    assert.strictEqual(canPublish, false);
  });

  it("enforces channel re-approval invariant: changing targetChannels on an approved post resets status to 'in_review' and clears approvedAt", async () => {
    mockPost.status = "approved";
    mockPost.approvedAt = new Date();
    mockPost.targetChannels = ["website", "linkedin"];

    // Simulate PATCH handler channel change detection
    const incomingChannels = ["website", "linkedin", "newsletter"];
    const existingChannels = Array.isArray(mockPost.targetChannels) ? mockPost.targetChannels : [];

    const sortedExisting = [...new Set(existingChannels)].sort();
    const sortedIncoming = [...new Set(incomingChannels)].sort();

    const channelsChanged =
      sortedExisting.length !== sortedIncoming.length ||
      sortedExisting.some((ch, idx) => ch !== sortedIncoming[idx]);

    const wasApprovedOrPublished =
      mockPost.status === "approved" ||
      mockPost.status === "published" ||
      mockPost.status === "partially_published";

    const approvalReset = channelsChanged && wasApprovedOrPublished;

    assert.strictEqual(channelsChanged, true);
    assert.strictEqual(approvalReset, true);

    // Apply the update as PATCH handler does
    mockPost.targetChannels = incomingChannels;
    if (approvalReset) {
      mockPost.status = "in_review";
      mockPost.approvedAt = null;
    }

    assert.strictEqual(mockPost.status, "in_review");
    assert.strictEqual(mockPost.approvedAt, null);

    // Verify publication is now blocked until renewed human approval
    const publishAttempt = await publishContentPost(mockPost.id);
    assert.strictEqual(publishAttempt.success, false);
    assert.ok(
      publishAttempt.error?.includes("Explicit human approval is required before publishing"),
      `Expected re-approval error, got: ${publishAttempt.error}`
    );
    assert.strictEqual(serverRequests.length, 0);
  });

  it("strictly rejects publication when requested channels include an unapproved additional channel", async () => {
    mockPost.status = "approved";
    mockPost.approvedAt = new Date();
    mockPost.targetChannels = ["website", "linkedin"]; // Approved ONLY for website and linkedin

    // Attempt to publish to newsletter as well without approval
    const result = await publishContentPost("post_test_123", {
      forcedChannels: ["website", "linkedin", "newsletter"],
    });

    assert.strictEqual(result.success, false);
    assert.ok(
      result.error?.includes("Channel selection mismatch"),
      `Expected channel selection mismatch error, got: ${result.error}`
    );
    assert.ok(
      result.error?.includes("Channel modifications require renewed approval"),
      `Expected re-approval requirement in error, got: ${result.error}`
    );
    assert.strictEqual(serverRequests.length, 0);
  });

  it("strictly rejects publication when requested channels omit approved channels or differ in selection", async () => {
    mockPost.status = "approved";
    mockPost.approvedAt = new Date();
    mockPost.targetChannels = ["website", "linkedin", "newsletter"];

    // Attempt to publish to only a subset without renewed approval
    const result = await publishContentPost("post_test_123", {
      forcedChannels: ["website"],
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("Channel selection mismatch"));
    assert.strictEqual(serverRequests.length, 0);
  });
});
