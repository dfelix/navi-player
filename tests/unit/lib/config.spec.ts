import { parseNavidromeUrl } from "@/lib/config";

describe("parseNavidromeUrl", () => {
  it.each([
    ["https://music.example.com", "https://music.example.com"],
    ["https://music.example.com/", "https://music.example.com"],
    ["  https://music.example.com//  ", "https://music.example.com"],
    ["http://localhost:4533", "http://localhost:4533"],
    // Navidrome under a base path (ND_BASEURL).
    ["https://example.com/navidrome", "https://example.com/navidrome"],
    ["https://example.com/navidrome/", "https://example.com/navidrome"],
    ["https://example.com/a/b/", "https://example.com/a/b"],
  ])("accepts %j as %s", (input, expected) => {
    expect(parseNavidromeUrl(input)).toEqual({ ok: true, url: expected });
  });

  it("accepts an https server behind an https page", () => {
    expect(parseNavidromeUrl("https://music.example.com", "https:")).toEqual({
      ok: true,
      url: "https://music.example.com",
    });
  });

  it.each([
    [undefined, "not set"],
    ["", "not set"],
    ["   ", "not set"],
    ["music.example.com", "not a valid url"],
    ["ftp://music.example.com", "http:// or https://"],
    ["https://admin:secret@music.example.com", "username or password"],
    ["https://music.example.com/?u=admin", "query string"],
    ["https://music.example.com/#x", "query string"],
  ])("rejects %j, explaining why (%s)", (input, reason) => {
    const result = parseNavidromeUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.toLowerCase()).toContain(reason);
  });

  it("rejects an http server behind an https page (mixed content)", () => {
    const result = parseNavidromeUrl("http://music.example.com", "https:");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/HTTPS/);
  });
});
