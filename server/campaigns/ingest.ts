type IngestionInput = {
  sourceKind: "url" | "markdown";
  sourceUrl?: string;
  canonicalContent?: string;
};

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function assertSafePublicUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http and https source URLs are supported.");
  }
  const host = url.hostname.toLocaleLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === "::1";
  if (blocked) throw new Error("Private or local URLs cannot be used as a campaign source.");
  return url;
}

export async function resolveCanonicalSource(input: IngestionInput) {
  if (input.sourceKind === "markdown") {
    const content = input.canonicalContent?.trim() ?? "";
    if (content.length < 12) throw new Error("Pasted Markdown/text must contain at least 12 characters.");
    return { sourceKind: "markdown" as const, sourceUrl: undefined, canonicalContent: content };
  }

  const urlText = input.sourceUrl?.trim();
  if (!urlText) throw new Error("A source URL is required for URL ingestion.");
  const url = assertSafePublicUrl(urlText);
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
    headers: { "user-agent": "SocialMediaStudio/1.0 (+canonical-source-ingestion)" },
  });
  if (!response.ok) throw new Error(`Source URL returned ${response.status}.`);
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/") && !type.includes("application/xhtml")) {
    throw new Error("Source URL must return readable text or HTML.");
  }
  const raw = (await response.text()).slice(0, 200_000);
  const canonicalContent = type.includes("html") ? htmlToText(raw) : raw.trim();
  if (canonicalContent.length < 12) throw new Error("The source URL did not contain enough readable text.");
  return { sourceKind: "url" as const, sourceUrl: url.toString(), canonicalContent };
}
