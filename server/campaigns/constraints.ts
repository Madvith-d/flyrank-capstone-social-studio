import type { ConstraintProfile, Platform } from "./types";

export const CONSTRAINT_PROFILES: Record<Platform, ConstraintProfile> = {
  x: {
    platform: "x",
    label: "X-style update",
    maxCharacters: 280,
    minCharacters: 40,
    maxHashtags: 2,
    requiredPhrases: ["Key idea:"],
    forbiddenPhrases: ["buy now", "click here", "guaranteed"],
    tone: "direct and concise",
  },
  linkedin: {
    platform: "linkedin",
    label: "LinkedIn-style post",
    maxCharacters: 1500,
    minCharacters: 160,
    maxHashtags: 3,
    requiredPhrases: ["Why it matters:", "What would you add?"],
    forbiddenPhrases: ["buy now", "click here", "guaranteed"],
    tone: "professional and reflective",
  },
  telegram: {
    platform: "telegram",
    label: "Telegram channel update",
    maxCharacters: 4000,
    minCharacters: 90,
    maxHashtags: 2,
    requiredPhrases: ["Read more:"],
    forbiddenPhrases: ["buy now", "click here", "guaranteed"],
    tone: "informative and community-minded",
  },
};

export type ConstraintIssue = {
  code: "min_length" | "max_length" | "hashtags" | "tone";
  message: string;
};

export type ConstraintValidation = {
  valid: boolean;
  characterCount: number;
  hashtagCount: number;
  profile: ConstraintProfile;
  issues: ConstraintIssue[];
};

export class ConstraintViolation extends Error {
  constructor(public readonly result: ConstraintValidation) {
    super(result.issues.map(issue => issue.message).join(" "));
    this.name = "ConstraintViolation";
  }
}

function countHashtags(content: string) {
  return (content.match(/(^|\s)#[A-Za-z0-9_-]+/g) ?? []).length;
}

export function validateVariant(platform: Platform, content: string): ConstraintValidation {
  const profile = CONSTRAINT_PROFILES[platform];
  const normalized = content.trim();
  const lower = normalized.toLocaleLowerCase();
  const hashtagCount = countHashtags(normalized);
  const issues: ConstraintIssue[] = [];

  if (normalized.length < profile.minCharacters) {
    issues.push({
      code: "min_length",
      message: `${profile.label} must contain at least ${profile.minCharacters} characters.`,
    });
  }

  if (normalized.length > profile.maxCharacters) {
    issues.push({
      code: "max_length",
      message: `${profile.label} must not exceed ${profile.maxCharacters} characters.`,
    });
  }

  if (hashtagCount > profile.maxHashtags) {
    issues.push({
      code: "hashtags",
      message: `${profile.label} allows at most ${profile.maxHashtags} hashtags.`,
    });
  }

  const missingToneMarkers = profile.requiredPhrases.filter(
    phrase => !lower.includes(phrase.toLocaleLowerCase())
  );
  const bannedToneMarkers = profile.forbiddenPhrases.filter(phrase =>
    lower.includes(phrase.toLocaleLowerCase())
  );
  if (missingToneMarkers.length > 0 || bannedToneMarkers.length > 0) {
    const details = [
      missingToneMarkers.length > 0 ? `include ${missingToneMarkers.join(", ")}` : null,
      bannedToneMarkers.length > 0 ? `remove ${bannedToneMarkers.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" and ");
    issues.push({
      code: "tone",
      message: `${profile.label} must remain ${profile.tone}: ${details}.`,
    });
  }

  return {
    valid: issues.length === 0,
    characterCount: normalized.length,
    hashtagCount,
    profile,
    issues,
  };
}

export function assertVariantIsValid(platform: Platform, content: string): ConstraintValidation {
  const result = validateVariant(platform, content);
  if (!result.valid) {
    throw new ConstraintViolation(result);
  }
  return result;
}
