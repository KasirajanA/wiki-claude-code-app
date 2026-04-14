import { describe, it, expect } from "vitest";
import { buildTsQuery, SearchQueryEmptyError, SearchQueryTooLongError } from "./search";

describe("buildTsQuery", () => {
  it("converts a single word to a prefix query", () => {
    expect(buildTsQuery("hello")).toBe("hello:*");
  });

  it("ANDs multiple words with prefix matching", () => {
    expect(buildTsQuery("hello world")).toBe("hello:* & world:*");
  });

  it("collapses extra whitespace", () => {
    expect(buildTsQuery("  hello   world  ")).toBe("hello:* & world:*");
  });

  it("strips single quotes (apostrophe becomes a word separator)", () => {
    const result = buildTsQuery("it's a test");
    // Apostrophe is stripped → "it s a test" → individual terms
    expect(result).not.toContain("'");
    expect(result).toContain("it:*");
    expect(result).toContain("test:*");
  });

  it("strips special characters leaving only safe chars", () => {
    const result = buildTsQuery("hello! @world#");
    expect(result).toBe("hello:* & world:*");
  });

  it("throws SearchQueryEmptyError for empty string", () => {
    expect(() => buildTsQuery("")).toThrow(SearchQueryEmptyError);
  });

  it("throws SearchQueryEmptyError for whitespace-only string", () => {
    expect(() => buildTsQuery("   ")).toThrow(SearchQueryEmptyError);
  });

  it("throws SearchQueryTooLongError for strings over 200 chars", () => {
    expect(() => buildTsQuery("a".repeat(201))).toThrow(SearchQueryTooLongError);
  });

  it("accepts exactly 200 characters", () => {
    expect(() => buildTsQuery("a".repeat(200))).not.toThrow();
  });

  it("SearchQueryEmptyError has statusCode 400", () => {
    let caught: SearchQueryEmptyError | null = null;
    try { buildTsQuery(""); } catch (e) { caught = e as SearchQueryEmptyError; }
    expect(caught?.statusCode).toBe(400);
  });

  it("SearchQueryTooLongError has statusCode 400", () => {
    let caught: SearchQueryTooLongError | null = null;
    try { buildTsQuery("a".repeat(201)); } catch (e) { caught = e as SearchQueryTooLongError; }
    expect(caught?.statusCode).toBe(400);
  });
});
