import type { Platform } from "./types";
import { assertVariantIsValid } from "./constraints";

type CanonicalSource = {
  content: string;
  sourceUrl?: string | null;
};

function normalizedSource(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#>*_`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSentenceLength(text: string, max: number) {
  const normalized = text.trim();
  if (normalized.length <= max) return normalized;
  const slice = normalized.slice(0, Math.max(1, max - 1));
  const boundary = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(" "));
  return `${slice.slice(0, boundary > 30 ? boundary : slice.length).trimEnd()}…`;
}

function extractSource(source: CanonicalSource) {
  const content = normalizedSource(source.content);
  if (content.length < 12) {
    throw new Error("Stored source must contain at least 12 readable characters before variants can be generated.");
  }
  const firstSentence = content.match(/^(.{20,}?)(?:[.!?](?:\s|$)|$)/)?.[1] ?? content;
  return {
    title: toSentenceLength(firstSentence, 80),
    excerpt: content,
  };
}

function clipWithSuffix(prefix: string, source: string, suffix: string, max: number) {
  const room = max - prefix.length - suffix.length;
  return `${prefix}${toSentenceLength(source, Math.max(0, room))}${suffix}`.trim();
}

export function generateDeterministicVariant(platform: Platform, source: CanonicalSource) {
  const { title, excerpt } = extractSource(source);
  let content: string;

  if (platform === "x") {
    const prefix = `Key idea: ${title}\n\n`;
    const suffix = "\n\nRead the full post. #ContentStrategy #BuildInPublic";
    content = clipWithSuffix(prefix, excerpt, suffix, 280);
  } else if (platform === "linkedin") {
    const prefix = `${title}\n\n`;
    const suffix = "\n\nWhy it matters: repeatable publishing turns one clear idea into a reliable campaign.\n\nWhat would you add?\n\n#SocialMedia #ContentStrategy #Marketing";
    content = clipWithSuffix(prefix, excerpt, suffix, 1500);
  } else {
    const safeUrl = source.sourceUrl ?? "Open the stored campaign source in Social Media Studio";
    const prefix = `${title}\n\n`;
    const suffix = `\n\nRead more: ${safeUrl}\n\n#SocialMedia #Publishing`;
    content = clipWithSuffix(prefix, excerpt, suffix, 4000);
  }

  const validation = assertVariantIsValid(platform, content);
  return { platform, content, validation };
}

export function generateAllDeterministicVariants(source: CanonicalSource) {
  return (["x", "linkedin", "telegram"] as const).map(platform =>
    generateDeterministicVariant(platform, source)
  );
}
