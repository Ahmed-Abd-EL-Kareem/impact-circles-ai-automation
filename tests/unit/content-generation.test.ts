import { describe, it } from "node:test";
import assert from "node:assert";
import { validateGeneratedContentPackage } from "../../src/lib/content/content-validation.ts";
import type { GeneratedContentPackage } from "../../src/lib/types/content.ts";

describe("Phase 3: Content Generation Contracts & Schema Validation", () => {
  const validPackage: GeneratedContentPackage = {
    title: "Clean Water Sensor Field Trial Milestone",
    summary: "Successfully deployed solar biosensors across 12 rural villages with 94.8% accuracy.",
    linkedin: {
      postText: "Exciting milestone at Impact Circles! We have completed our 6-month trial of solar biosensors in rural water networks. Detection accuracy reached 94.8% with 62% turnaround time reduction.",
      hashtags: ["#ImpactCircles", "#CleanWater", "#TechForGood"],
      characterCount: 198,
    },
    newsletter: {
      subject: "Milestone: 94.8% accuracy achieved in clean water field trials",
      previewText: "Biosensor field deployment completes across 12 villages",
      bodyText: "Dear Stakeholders, we are thrilled to announce our latest field trial results from rural water distribution networks across 12 villages.",
      callToAction: "Read the full research summary at impactcircles.org",
    },
    website: {
      title: "Impact Circles Completes 6-Month Field Trial of Solar Biosensors",
      subtitle: "Innovative IoT sensors achieve 94.8% detection accuracy across 12 rural communities.",
      slug: "clean-water-sensor-field-trial",
      bodyMarkdown: "# Clean Water Sensor Field Trial\n\nOur team has finalized deployment...",
      tags: ["Research", "Clean Water", "Field Trial"],
    },
  };

  it("validates a fully formed 3-channel content package producing all 3 usable formats", () => {
    const result = validateGeneratedContentPackage(validPackage);
    assert.strictEqual(result.isValid, true);
    if (!result.isValid) return;

    // Top level
    assert.strictEqual(result.data.title, validPackage.title);
    assert.strictEqual(result.data.summary, validPackage.summary);

    // LinkedIn
    assert.strictEqual(typeof result.data.linkedin.postText, "string");
    assert.ok(result.data.linkedin.postText.length > 0);
    assert.strictEqual(Array.isArray(result.data.linkedin.hashtags), true);
    assert.strictEqual(result.data.linkedin.hashtags.length, 3);
    assert.strictEqual(result.data.linkedin.characterCount, result.data.linkedin.postText.length);

    // Newsletter
    assert.strictEqual(result.data.newsletter.subject, validPackage.newsletter.subject);
    assert.strictEqual(result.data.newsletter.previewText, validPackage.newsletter.previewText);
    assert.strictEqual(result.data.newsletter.bodyText, validPackage.newsletter.bodyText);
    assert.strictEqual(result.data.newsletter.callToAction, validPackage.newsletter.callToAction);

    // Website
    assert.strictEqual(result.data.website.title, validPackage.website.title);
    assert.strictEqual(result.data.website.subtitle, validPackage.website.subtitle);
    assert.strictEqual(result.data.website.slug, validPackage.website.slug);
    assert.strictEqual(result.data.website.bodyMarkdown, validPackage.website.bodyMarkdown);
    assert.strictEqual(Array.isArray(result.data.website.tags), true);
  });

  it("rejects packages with missing or empty top-level title or summary", () => {
    const missingTitle = { ...validPackage, title: "" };
    const res1 = validateGeneratedContentPackage(missingTitle);
    assert.strictEqual(res1.isValid, false);
    if (!res1.isValid) {
      assert.ok(res1.error.includes("'title' is required"));
    }

    const missingSummary = { ...validPackage, summary: "   " };
    const res2 = validateGeneratedContentPackage(missingSummary);
    assert.strictEqual(res2.isValid, false);
    if (!res2.isValid) {
      assert.ok(res2.error.includes("'summary' is required"));
    }
  });

  it("rejects missing or malformed channel objects", () => {
    // Missing linkedin
    const noLinkedin = { ...validPackage, linkedin: null };
    const res1 = validateGeneratedContentPackage(noLinkedin);
    assert.strictEqual(res1.isValid, false);
    if (!res1.isValid) {
      assert.ok(res1.error.includes("linkedin"));
    }

    // Missing newsletter
    const noNewsletter = { ...validPackage, newsletter: undefined };
    const res2 = validateGeneratedContentPackage(noNewsletter);
    assert.strictEqual(res2.isValid, false);
    if (!res2.isValid) {
      assert.ok(res2.error.includes("newsletter"));
    }

    // Missing website
    const noWebsite = { ...validPackage, website: "not an object" };
    const res3 = validateGeneratedContentPackage(noWebsite);
    assert.strictEqual(res3.isValid, false);
    if (!res3.isValid) {
      assert.ok(res3.error.includes("website"));
    }
  });

  it("rejects empty or whitespace-only channel fields", () => {
    const emptyPostText = {
      ...validPackage,
      linkedin: { ...validPackage.linkedin, postText: "   " },
    };
    const res1 = validateGeneratedContentPackage(emptyPostText);
    assert.strictEqual(res1.isValid, false);
    if (!res1.isValid) {
      assert.ok(res1.error.includes("linkedin.postText"));
    }

    const emptyCta = {
      ...validPackage,
      newsletter: { ...validPackage.newsletter, callToAction: "" },
    };
    const res2 = validateGeneratedContentPackage(emptyCta);
    assert.strictEqual(res2.isValid, false);
    if (!res2.isValid) {
      assert.ok(res2.error.includes("newsletter.callToAction"));
    }

    const emptySlug = {
      ...validPackage,
      website: { ...validPackage.website, slug: "   " },
    };
    const res3 = validateGeneratedContentPackage(emptySlug);
    assert.strictEqual(res3.isValid, false);
    if (!res3.isValid) {
      assert.ok(res3.error.includes("website.slug"));
    }
  });

  it("rejects malformed array types for hashtags and tags", () => {
    const invalidHashtags = {
      ...validPackage,
      linkedin: { ...validPackage.linkedin, hashtags: "string instead of array" },
    };
    const res1 = validateGeneratedContentPackage(invalidHashtags);
    assert.strictEqual(res1.isValid, false);
    if (!res1.isValid) {
      assert.ok(res1.error.includes("linkedin.hashtags"));
    }

    const invalidTags = {
      ...validPackage,
      website: { ...validPackage.website, tags: [123, 456] },
    };
    const res2 = validateGeneratedContentPackage(invalidTags);
    assert.strictEqual(res2.isValid, false);
    if (!res2.isValid) {
      assert.ok(res2.error.includes("website.tags"));
    }
  });

  it("accurately calculates and normalizes LinkedIn character count", () => {
    const customText = "Impact Circles announces new collaborative milestone for open-source AI.";
    const pkgWithWrongCount = {
      ...validPackage,
      linkedin: {
        postText: customText,
        hashtags: ["#ImpactCircles"],
        characterCount: 9999, // Intentional mismatch
      },
    };

    const res = validateGeneratedContentPackage(pkgWithWrongCount);
    assert.strictEqual(res.isValid, true);
    if (res.isValid) {
      assert.strictEqual(res.data.linkedin.characterCount, customText.length);
      assert.strictEqual(res.data.linkedin.characterCount, 72);
    }
  });

  it("rejects non-object or null root input cleanly", () => {
    assert.strictEqual(validateGeneratedContentPackage(null).isValid, false);
    assert.strictEqual(validateGeneratedContentPackage(undefined).isValid, false);
    assert.strictEqual(validateGeneratedContentPackage("raw string").isValid, false);
    assert.strictEqual(validateGeneratedContentPackage([1, 2, 3]).isValid, false);
  });
});
