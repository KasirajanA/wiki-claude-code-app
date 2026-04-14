import { randomBytes } from "crypto";

/**
 * Converts a title into a URL-safe slug with a random 8-char hex suffix
 * to guarantee uniqueness.
 *
 * @example slugify("Hello World!", "a1b2c3d4") → "hello-world-a1b2c3d4"
 */
export function slugify(title: string, suffix: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/-$/, ""); // trim trailing dash before appending suffix

  return `${base}-${suffix}`;
}

/** Returns a cryptographically random 8-char hex string for use as a slug suffix. */
export function generateSlugSuffix(): string {
  return randomBytes(4).toString("hex");
}
