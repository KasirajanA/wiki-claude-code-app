import { describe, it, expect } from "vitest";
import { slugify, generateSlugSuffix } from "./slug";

describe("slugify", () => {
  it("lowercases the title", () => {
    expect(slugify("Hello World", "abcd1234")).toBe("hello-world-abcd1234");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("multiple   spaces", "x")).toBe("multiple-spaces-x");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugify("a--b", "x")).toBe("a-b-x");
  });

  it("strips special characters", () => {
    expect(slugify("Hello, World!", "x")).toBe("hello-world-x");
  });

  it("strips diacritics", () => {
    expect(slugify("Héllo Wörld", "x")).toBe("hello-world-x");
  });

  it("handles unicode combining characters", () => {
    expect(slugify("café", "x")).toBe("cafe-x");
  });

  it("truncates the base to 60 characters", () => {
    const long = "a".repeat(80);
    const result = slugify(long, "suf");
    // base is 60 chars, suffix adds "-suf" → 64 total
    expect(result).toBe(`${"a".repeat(60)}-suf`);
  });

  it("does not leave a trailing hyphen before the suffix", () => {
    // title that ends with a special char (stripped), leaving trailing space/dash
    expect(slugify("hello!", "suf")).toBe("hello-suf");
  });

  it("handles an all-special-char title gracefully", () => {
    const result = slugify("!!!", "suf");
    expect(result).toBe("-suf");
  });
});

describe("generateSlugSuffix", () => {
  it("returns an 8-character hex string", () => {
    const suffix = generateSlugSuffix();
    expect(suffix).toMatch(/^[0-9a-f]{8}$/);
  });

  it("generates different values on each call", () => {
    const a = generateSlugSuffix();
    const b = generateSlugSuffix();
    expect(a).not.toBe(b);
  });
});
