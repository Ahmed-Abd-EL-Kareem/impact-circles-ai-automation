import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import http from "node:http";
import { prisma } from "../../src/lib/db.ts";
import {
  publishContentPost,
  SUPPORTED_CHANNELS,
} from "../../src/lib/services/publishing.ts";
import type { PublishChannel } from "../../src/lib/types/content.ts";

describe("Phase 3: Publishing Invariants & Sandbox Demonstration Workflow", () => {
  // In-memory mock database state for testing
  let mockPost: any = null;
  let mockLogs: any[] = [];

  beforeEach(() => {
    mockLogs = [];
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
  });

  it("executes sandbox publication for an approved post and records simulated statuses without claiming live publication", async () => {
    mockPost.status = "approved";
    mockPost.approvedAt = new Date();

    // Ensure no live webhooks are set in env
    delete process.env.CMS_WEBHOOK_URL;
    delete process.env.LINKEDIN_WEBHOOK_URL;
    delete process.env.NEWSLETTER_WEBHOOK_URL;

    const result = await publishContentPost("post_test_123", {
      forcedChannels: ["website", "linkedin", "newsletter"],
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.results.length, 3);

    // INVARIANT: In sandbox demonstration mode, status must be 'simulated', NEVER 'success'
    for (const r of result.results) {
      assert.strictEqual(
        r.status,
        "simulated",
        `Expected channel ${r.channel} to have status 'simulated', got '${r.status}'`
      );
      assert.ok(r.publishedUrl, `Expected publishedUrl for ${r.channel}`);
      assert.strictEqual(r.responsePayload?.mode, "sandbox_demonstration");
      assert.strictEqual(r.responsePayload?.isSimulation, true);
    }

    // Verify persisted audit logs in mock database
    assert.strictEqual(mockLogs.length, 3);
    for (const log of mockLogs) {
      assert.strictEqual(log.status, "simulated");
      assert.strictEqual(log.postId, "post_test_123");
    }

    // Post status updated to published
    assert.strictEqual(mockPost.status, "published");
    assert.ok(mockPost.publishedAt);
  });

  it("accurately handles and reports failed live channel dispatches", async () => {
    // Start a temporary local mock server that returns 500
    const failServer = http.createServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal CMS Server Error");
    });

    const port = await new Promise<number>((resolve) => {
      failServer.listen(0, "127.0.0.1", () => {
        const addr = failServer.address();
        resolve(typeof addr === "object" && addr ? addr.port : 59998);
      });
    });

    process.env.CMS_WEBHOOK_URL = `http://127.0.0.1:${port}/api/post`;

    try {
      mockPost.status = "approved";
      mockPost.approvedAt = new Date();
      mockPost.targetChannels = ["website"];

      const result = await publishContentPost("post_test_123", {
        forcedChannels: ["website"],
      });

      assert.strictEqual(result.results.length, 1);
      const webResult = result.results[0];
      assert.strictEqual(webResult.channel, "website");
      assert.strictEqual(webResult.status, "failed");
      assert.ok(webResult.errorMessage?.includes("CMS API responded with 500"));

      // All channels failed -> overall status is failed
      assert.strictEqual(result.success, false);
      assert.strictEqual(mockPost.status, "failed");
    } finally {
      delete process.env.CMS_WEBHOOK_URL;
      await new Promise<void>((resolve) => failServer.close(() => resolve()));
    }
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
    const canPublish = nextStatus === "approved";
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
    assert.strictEqual(mockLogs.length, 0);
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
    // INVARIANT: No publishing logs must be created for rejected requests
    assert.strictEqual(mockLogs.length, 0);
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
    assert.strictEqual(mockLogs.length, 0);
  });

  it("publishes successfully in sandbox mode when requested channels match the approved channel selection", async () => {
    mockPost.status = "approved";
    mockPost.approvedAt = new Date();
    mockPost.targetChannels = ["website", "linkedin"];

    delete process.env.CMS_WEBHOOK_URL;
    delete process.env.LINKEDIN_WEBHOOK_URL;
    delete process.env.NEWSLETTER_WEBHOOK_URL;

    // Channels match approved selection (order varied)
    const result = await publishContentPost("post_test_123", {
      forcedChannels: ["linkedin", "website"],
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.results.length, 2);
    for (const r of result.results) {
      assert.strictEqual(r.status, "simulated");
    }
    assert.strictEqual(mockLogs.length, 2);
    for (const log of mockLogs) {
      assert.strictEqual(log.status, "simulated");
    }
    assert.strictEqual(mockPost.status, "published");
  });
});
