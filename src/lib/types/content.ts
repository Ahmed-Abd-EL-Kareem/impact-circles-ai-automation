export type ContentKind =
  | "research_update"
  | "event_announcement"
  | "project_findings";

export type PublishChannel = "linkedin" | "newsletter" | "website";

export type ContentStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "partially_published"
  | "rejected"
  | "failed";

export type PublishLogStatus = "success" | "failed" | "simulated";

export interface LinkedInPostContent {
  postText: string;
  hashtags: string[];
  characterCount: number;
}

export interface NewsletterContent {
  subject: string;
  previewText: string;
  bodyText: string;
  callToAction: string;
}

export interface WebsiteAnnouncementContent {
  title: string;
  subtitle: string;
  slug: string;
  bodyMarkdown: string;
  tags: string[];
}

export interface GeneratedContentPackage {
  title: string;
  summary: string;
  linkedin: LinkedInPostContent;
  newsletter: NewsletterContent;
  website: WebsiteAnnouncementContent;
}

export interface PublishingLogRecord {
  id: string;
  postId: string;
  channel: PublishChannel;
  status: PublishLogStatus;
  publishedUrl: string | null;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface ContentPostRecord {
  id: string;
  title: string;
  sourcePrompt: string;
  contentType: ContentKind;
  status: ContentStatus;
  linkedinContent: string | null;
  newsletterContent: string | null;
  websiteContent: string | null;
  targetChannels: PublishChannel[];
  metadata: Record<string, unknown>;
  rejectionReason?: string | null;
  approvedAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  publishingLogs?: PublishingLogRecord[];
}
