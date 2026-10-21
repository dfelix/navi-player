/**
 * @jest-environment node
 */
// The server's LRCLIB relay, against a fake LRCLIB: what it forwards, how it
// handles rate limits, and what it remembers.
import { createLrclibRelay, type RelayOptions } from "../../../server/lrclib";

type Upstream = (url: URL) => Response | Promise<Response>;

function setup(upstream: Upstream, extra: Partial<RelayOptions> = {}) {
  let clock = 1_000_000;
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const logs: string[] = [];
  const sleeps: number[] = [];
  const relay = createLrclibRelay({
    userAgent: "navi-player/9.9.9",
    fetch: (async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      calls.push({ url, headers: init?.headers as Record<string, string> });
      return upstream(url);
    }) as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    log: (m) => logs.push(m),
    ...extra,
  });
  return {
    calls,
    logs,
    sleeps,
    advance: (ms: number) => (clock += ms),
    ask: (endpoint: string, query: Record<string, string>) =>
      relay(endpoint, new URLSearchParams(query)),
  };
}

const ok = (body: unknown = { id: 1 }) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const status = (code: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ code }), { status: code, headers });
const Q = {
  artist_name: "Queen",
  track_name: "A Kind of Magic",
  album_name: "AKOM",
  duration: "262",
};

describe("LRCLIB relay", () => {
  it("forwards a lookup to lrclib.net with a real User-Agent", async () => {
    const { ask, calls } = setup(() => ok());
    const res = await ask("get", Q);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ id: 1 });
    expect(res.headers["content-type"]).toBe("application/json");
    expect(calls[0]?.url.origin + calls[0]?.url.pathname).toBe("https://lrclib.net/api/get");
    expect(calls[0]?.url.searchParams.get("track_name")).toBe("A Kind of Magic");
    expect(calls[0]?.headers["user-agent"]).toBe("navi-player/9.9.9");
  });

  it("only relays the two lookups, with only their parameters", async () => {
    const { ask, calls } = setup(() => ok());
    expect((await ask("request", Q)).status).toBe(404);
    expect((await ask("../admin", Q)).status).toBe(404);
    expect((await ask("constructor", Q)).status).toBe(404);
    await ask("search", { ...Q, q: "anything", extra: "x" });
    expect([...calls[0]!.url.searchParams.keys()].sort()).toEqual(["artist_name", "track_name"]);
    expect(calls).toHaveLength(1);
  });

  it("rejects lookups the app would never make", async () => {
    const { ask, calls } = setup(() => ok());
    expect((await ask("get", { track_name: "x" })).status).toBe(400);
    expect((await ask("get", { ...Q, track_name: "x".repeat(301) })).status).toBe(400);
    expect((await ask("get", { ...Q, duration: "12; drop" })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("passes LRCLIB's 'not found' through", async () => {
    const { ask } = setup(() => status(404, { "content-type": "application/json" }));
    const res = await ask("get", Q);
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toBe("application/json");
  });

  it("waits the Retry-After and tries once more when rate limited", async () => {
    let n = 0;
    const { ask, calls, sleeps } = setup(() =>
      n++ === 0 ? status(429, { "retry-after": "1" }) : ok(),
    );
    expect((await ask("get", Q)).status).toBe(200);
    expect(sleeps).toEqual([1_000]);
    expect(calls).toHaveLength(2);
  });

  it("answers 429 itself, without asking, while LRCLIB wants a pause", async () => {
    const { ask, calls, logs, advance } = setup(() => status(429, { "retry-after": "2" }));
    const first = await ask("get", Q);
    expect(first.status).toBe(429);
    expect(JSON.parse(first.body)).toEqual({ error: "rate-limited", retryAfter: 2 });
    expect(first.headers["retry-after"]).toBe("2");
    expect(logs).toEqual(["LRCLIB rate limited this server; pausing lookups for 2s"]);
    expect(calls).toHaveLength(2);

    expect((await ask("search", Q)).status).toBe(429);
    expect(calls).toHaveLength(2);

    // Once the pause is over it asks again (and, still limited, retries once).
    advance(2_500);
    await ask("search", Q);
    expect(calls).toHaveLength(4);
  });

  it("doesn't hold the request open for a long Retry-After", async () => {
    const { ask, calls, sleeps } = setup(() => status(429, { "retry-after": "60" }));
    expect((await ask("get", Q)).status).toBe(429);
    expect(sleeps).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("caches definite answers and asks again after an hour", async () => {
    const { ask, calls, advance } = setup(() => ok());
    await ask("get", Q);
    // Same lookup, parameters in another order.
    await ask("get", {
      duration: "262",
      track_name: "A Kind of Magic",
      album_name: "AKOM",
      artist_name: "Queen",
    });
    expect(calls).toHaveLength(1);
    advance(60 * 60_000 + 1);
    await ask("get", Q);
    expect(calls).toHaveLength(2);
  });

  it("doesn't cache failures", async () => {
    let n = 0;
    const { ask, calls } = setup(() => (n++ === 0 ? status(500) : ok()));
    expect((await ask("get", Q)).status).toBe(502);
    expect((await ask("get", Q)).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("shares one upstream request between simultaneous identical lookups", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { ask, calls } = setup(async () => {
      await gate;
      return ok();
    });
    const both = Promise.all([ask("get", Q), ask("get", Q)]);
    release();
    const [a, b] = await both;
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("says what went wrong when LRCLIB can't be reached", async () => {
    const down = setup(() => {
      throw new TypeError("fetch failed");
    });
    const res = await down.ask("get", Q);
    expect(res.status).toBe(502);
    expect(JSON.parse(res.body)).toEqual({ error: "unreachable" });
    expect(down.logs).toEqual(["LRCLIB /get unreachable: fetch failed"]);

    const slow = setup(() => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const late = await slow.ask("get", Q);
    expect(late.status).toBe(504);
    expect(JSON.parse(late.body)).toEqual({ error: "timeout" });
  });
});
