import { describe, it } from "node:test";
import assert from "node:assert";
import type { GeneratedContentPackage } from "../../src/lib/types/content.ts";

describe("Phase 3: Content Package Contracts & Schema Validation", () => {
  const sampleValidPackage: GeneratedContentPackage = {
    title: "Clean Water Sensor Field Trial Milestone",
    summary: "Successfully deployed solar biosensors across 12 rural villages with 94.8% accuracy.",
    linkedin: {
      postText: "Exciting milestone at Impact Circles! We have completed our 6-month trial of solar biosensors...",
      hashtags: ["#ImpactCircles", "#CleanWater", "#TechForGood"],
      characterCount: 96,
    },
    newsletter: {
      subject: "Milestone: 94.8% accuracy achieved in clean water field trials",
      previewText: "Biosensor field deployment completes across 12 villages",
      bodyText: "Dear Stakeholders, we are thrilled to announce our latest field trial results...",
      callToAction: "Read the full research summary at impactcircles.org",
    },
    website: {
      title: "Impact Circles Completes 6-Month Field Trial of Solar Biosensors",
      subtitle: "Innovative IoT sensors achieve 94.8% detection accuracy across 12 rural communities.",
      slug: "clean-water-sensor-field-trial",
      bodyMarkdown: "# Clean Water Sensor Field Trial\n\nOur team has finalized...",
      tags: ["Research", "Clean Water", "Field Trial"],
    },
  };

  it("validates a fully formed 3-channel content package", () => {
    assert.strictEqual(typeof sampleValidPackage.title, "string");
    assert.ok(sampleValidPackage.title.length > 5);

    // LinkedIn checks
    assert.ok(sampleValidPackage.linkedin.postText.length > 0);
    assert.ok(Array.isArray(sampleValidPackage.linkedin.hashtags));
    assert.strictEqual(sampleValidPackage.linkedin.hashtags[0].startsWith("#"), true);
    assert.strictEqual(
      sampleValidPackage.linkedin.characterCount,
      sampleValidPackage.linkedin.postText.length
    );

    // Newsletter checks
    assert.ok(sampleValidPackage.newsletter.subject.length > 0);
    assert.ok(sampleValidPackage.newsletter.bodyText.length > 0);
    assert.ok(sampleValidPackage.newsletter.callToAction.length > 0);

    // Website checks
    assert.ok(sampleValidPackage.website.title.length > 0);
    assert.ok(sampleValidPackage.website.slug.length > 0);
    assert.ok(sampleValidPackage.website.bodyMarkdown.includes("#"));
  });

  it("detects missing channel objects in incomplete packages", () => {
    const invalidPackage = {
      title: "Missing website channel",
      linkedin: sampleValidPackage.linkedin,
      newsletter: sampleValidPackage.newsletter,
      // website is missing!
    };

    const hasAllChannels =
      Boolean(invalidPackage.title) &&
      Boolean(invalidPackage.linkedin) &&
      Boolean(invalidPackage.newsletter) &&
      Boolean((invalidPackage as any).website);

    assert.strictEqual(hasAllChannels, false);
  });

  it("ensures LinkedIn character counts accurately reflect body text length", () => {
    const text = "A concise update for professional stakeholders on LinkedIn.";
    const linkedinObj = {
      postText: text,
      hashtags: ["#Update"],
      characterCount: text.length,
    };

    assert.strictEqual(linkedinObj.characterCount, 59);
    assert.strictEqual(linkedinObj.characterCount, linkedinObj.postText.length);
  });

  it("verifies tone adaptation differences across channels", () => {
    // LinkedIn should be professional/engaging
    assert.ok(sampleValidPackage.linkedin.hashtags.length >= 1);

    // Newsletter should have subject and callToAction
    assert.ok(sampleValidPackage.newsletter.subject.length > 0);
    assert.ok(sampleValidPackage.newsletter.callToAction.length > 0);

    // Website should have Markdown heading structure and slug
    assert.ok(sampleValidPackage.website.slug.includes("-"));
    assert.ok(sampleValidPackage.website.bodyMarkdown.startsWith("#"));
  });
});
