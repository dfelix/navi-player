/**
 * @jest-environment node
 */
// The bundled server, black-box: started as a real process against a mocked
// Navidrome that lives under a base path (/nd).
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { unzipSync, zipSync } from "fflate";
import type { AddressInfo } from "node:net";

jest.setTimeout(30_000);

let navidrome: Server;
let ndPort = 0;
let proc: ChildProcess;
let base = "";
let dist = "";

// The shell as `vite build` writes it with the default name.
const SHELL = [
  "<!doctype html><html><head>",
  '<meta name="application-name" content="NaviPlayer" />',
  '<meta name="apple-mobile-web-app-title" content="NaviPlayer" />',
  "<title>NaviPlayer</title>",
  "</head><body></body></html>",
].join("");

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

function startServer(
  env: Record<string, string>,
): Promise<{ proc: ChildProcess; output: () => string }> {
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const done = { ok: false };
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (!done.ok && output.includes("listening on port")) {
        done.ok = true;
        resolve({ proc: child, output: () => output });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", () => {
      if (!done.ok) resolve({ proc: child, output: () => output });
    });
    child.on("error", reject);
  });
}

beforeAll(async () => {
  navidrome = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/nd/rest/ping.view") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ "subsonic-response": { status: "ok", seenPath: url.pathname } }));
    } else if (url.pathname === "/nd/rest/big.view") {
      // Navidrome compresses JSON; the proxy's fetch() decodes it.
      const gz = gzipSync(JSON.stringify({ "subsonic-response": { pad: "x".repeat(5000) } }));
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "Content-Length": gz.length,
      });
      res.end(gz);
    } else if (url.pathname === "/nd/rest/stream.view") {
      res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": 1000 });
      res.end(Buffer.alloc(1000, 7));
    } else if (url.pathname === "/nd/api/user") {
      // Admin check used by uploads.
      res.statusCode = req.headers["x-nd-authorization"] === "Bearer admin" ? 200 : 403;
      res.end("[]");
    } else if (url.pathname === "/nd/api/scanner" || url.pathname === "/nd/rest/startScan.view") {
      res.end("{}");
    } else if (url.pathname === "/nd/rest/getAlbum.view") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          "subsonic-response": {
            status: "ok",
            album: { name: "Cash $` $& $1 Album", artist: "A", songCount: 1, coverArt: "al-1" },
          },
        }),
      );
    } else if (url.pathname === "/nd/share/abc") {
      res.setHeader("Content-Type", "text/html");
      res.end("<html>share page</html>");
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => navidrome.listen(0, () => r()));
  ndPort = (navidrome.address() as AddressInfo).port;

  // A minimal built app to serve.
  dist = mkdtempSync(join(tmpdir(), "navi-player-dist-"));
  writeFileSync(join(dist, "index.html"), SHELL);
  writeFileSync(
    join(dist, "manifest.webmanifest"),
    JSON.stringify({ name: "NaviPlayer", short_name: "NaviPlayer", start_url: "/" }),
  );
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "assets", "app.js"), "console.log(1)");

  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  ({ proc } = await startServer({
    PORT: String(port),
    DIST_DIR: dist,
    VITE_NAVIDROME_URL: `http://127.0.0.1:${ndPort}/nd/`,
    // Explicitly unset, whatever a local .env says.
    VITE_APP_NAME: "",
  }));
});

afterAll(() => {
  proc?.kill();
  navidrome?.close();
});

describe("bundled server", () => {
  it("reports proxy mode", async () => {
    const res = await fetch(`${base}/api/config`);
    expect(await res.json()).toEqual({
      proxyMode: true,
      uploadEnabled: false,
      linkPreviews: false,
    });
  });

  it("proxies the Subsonic API, keeping Navidrome's base path", async () => {
    const res = await fetch(`${base}/rest/ping.view?u=x`);
    const body = (await res.json()) as { "subsonic-response": { seenPath: string } };
    expect(body["subsonic-response"].seenPath).toBe("/nd/rest/ping.view");
  });

  it("passes compressed responses on whole", async () => {
    const res = await fetch(`${base}/rest/big.view`);
    const body = (await res.json()) as { "subsonic-response": { pad: string } };
    expect(body["subsonic-response"].pad).toHaveLength(5000);
  });

  it("keeps the length of uncompressed media, which seeking relies on", async () => {
    const res = await fetch(`${base}/rest/stream.view?id=1`);
    expect(res.headers.get("content-length")).toBe("1000");
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });

  it("proxies Navidrome share pages", async () => {
    expect(await (await fetch(`${base}/share/abc`)).text()).toContain("share page");
  });

  it("serves the app with security headers, and falls back to it for client routes", async () => {
    const res = await fetch(`${base}/album/123`);
    expect(await res.text()).toContain("<title>NaviPlayer</title>");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("caches hashed assets forever and the shell never", async () => {
    expect((await fetch(`${base}/assets/app.js`)).headers.get("cache-control")).toContain(
      "immutable",
    );
    expect((await fetch(`${base}/`)).headers.get("cache-control")).toContain("no-store");
  });

  it("relays LRCLIB lookups on its own origin, refusing ones the app wouldn't make", async () => {
    // Only requests the relay rejects itself: nothing here reaches lrclib.net.
    const bad = await fetch(`${base}/lyrics/lrclib/get?track_name=only-a-title`);
    expect(bad.status).toBe(400);
    expect(bad.headers.get("content-type")).toContain("application/json");
    expect(await bad.json()).toEqual({ error: "bad-request" });

    // Not the SPA fallback: an unknown lookup is a JSON 404, not index.html.
    const unknown = await fetch(`${base}/lyrics/lrclib/request?artist_name=a&track_name=b`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "not-found" });
  });

  it("streams a transcoded album as one ZIP, with unique names", async () => {
    const form = new FormData();
    form.append(
      "payload",
      JSON.stringify({
        zipName: "Álbum/One.zip",
        format: "mp3",
        bitRate: 192,
        tracks: [
          { id: "1", name: "01 Song.mp3" },
          { id: "2", name: "01 Song.mp3" },
        ],
        u: "alice",
        t: "tok",
        s: "salt",
      }),
    );
    const res = await fetch(`${base}/download/zip`, { method: "POST", body: form });
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain("filename*=UTF-8''%C3%81lbum_One.zip");
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["01 Song.mp3", "_01 Song.mp3"]);
    expect(files["01 Song.mp3"]).toHaveLength(1000);
  });

  it("refuses a ZIP order without credentials", async () => {
    const form = new FormData();
    form.append("payload", JSON.stringify({ format: "mp3", tracks: [{ id: "1", name: "a" }] }));
    expect((await fetch(`${base}/download/zip`, { method: "POST", body: form })).status).toBe(400);
  });

  it("never serves files outside the app directory", async () => {
    for (const path of ["/..%2f..%2fetc%2fpasswd", "/%2e%2e/%2e%2e/etc/passwd"]) {
      const text = await (await fetch(`${base}${path}`)).text();
      expect(text).not.toContain("root:");
      expect(text).toContain("<title>NaviPlayer</title>");
    }
  });
});

describe("unreachable Navidrome", () => {
  it("answers 502 without revealing the internal address", async () => {
    const port = await freePort();
    const internal = `http://127.0.0.1:${await freePort()}/secret-path`; // nothing listens
    const { proc: down, output } = await startServer({
      PORT: String(port),
      DIST_DIR: dist,
      VITE_NAVIDROME_URL: internal,
      VITE_APP_NAME: "",
    });
    try {
      const res = await fetch(`http://127.0.0.1:${port}/rest/ping.view`);
      expect(res.status).toBe(502);
      const text = await res.text();
      expect(text).toContain("Could not reach the music server");
      expect(text).not.toContain("secret-path");
      expect(text).not.toMatch(/navidrome/i);
      // The operator still gets the address.
      expect(output()).toContain(`Could not reach Navidrome at ${internal}`);
    } finally {
      down.kill();
    }
  });
});

describe("startup validation", () => {
  it("refuses a URL with embedded credentials", async () => {
    const { proc: bad, output } = await startServer({
      PORT: String(await freePort()),
      VITE_NAVIDROME_URL: "https://user:pass@music.example.com",
    });
    await new Promise((r) => (bad.exitCode !== null ? r(null) : bad.on("exit", r)));
    expect(bad.exitCode).toBe(1);
    expect(output()).toMatch(/must be a plain http\(s\) base URL/);
  });
});

describe("display name", () => {
  it("keeps the built name when VITE_APP_NAME is unset", async () => {
    expect(await (await fetch(`${base}/`)).text()).toBe(SHELL);
    const manifest = (await (await fetch(`${base}/manifest.webmanifest`)).json()) as {
      name: string;
    };
    expect(manifest.name).toBe("NaviPlayer");
  });

  it("renames the page and manifest when VITE_APP_NAME is set at startup", async () => {
    const port = await freePort();
    const { proc: named, output } = await startServer({
      PORT: String(port),
      DIST_DIR: dist,
      VITE_NAVIDROME_URL: `http://127.0.0.1:${ndPort}/nd/`,
      VITE_APP_NAME: '  Família <"Music">  ',
    });
    try {
      const url = `http://127.0.0.1:${port}`;
      for (const path of ["/", "/index.html", "/album/1"]) {
        const html = await (await fetch(`${url}${path}`)).text();
        expect(html).toContain("<title>Família &lt;&quot;Music&quot;&gt;</title>");
        expect(html).toContain(
          '<meta name="application-name" content="Família &lt;&quot;Music&quot;&gt;" />',
        );
        expect(html).toContain(
          '<meta name="apple-mobile-web-app-title" content="Família &lt;&quot;Music&quot;&gt;" />',
        );
        expect(html).not.toContain("NaviPlayer");
      }
      const res = await fetch(`${url}/manifest.webmanifest`);
      expect(res.headers.get("content-type")).toContain("application/manifest+json");
      expect(await res.json()).toEqual({
        name: 'Família <"Music">',
        short_name: 'Família <"Music">',
        start_url: "/",
      });
      expect(output()).toContain('Display name: "Família <"Music">"');
    } finally {
      named.kill();
    }
  });
});

describe("uploads and link previews", () => {
  let url = "";
  let music = "";
  let server: ChildProcess;

  const upload = (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${url}/upload`, {
      method: "POST",
      headers: { "x-nd-authorization": "Bearer admin" },
      body: form,
    });
  };
  const target = (name: string) => join(music, "Unknown Artist - Unknown Album", name);

  beforeAll(async () => {
    music = mkdtempSync(join(tmpdir(), "navi-player-music-"));
    const port = await freePort();
    url = `http://127.0.0.1:${port}`;
    const musicDir = relative(process.cwd(), music);
    expect(isAbsolute(musicDir)).toBe(false);
    ({ proc: server } = await startServer({
      PORT: String(port),
      DIST_DIR: dist,
      VITE_NAVIDROME_URL: `http://127.0.0.1:${ndPort}/nd/`,
      VITE_APP_NAME: "",
      // Relative on purpose: it used to make every upload silently do nothing.
      MUSIC_DIR: musicDir,
      UPLOAD_MAX_MB: "0.01", // ~10 KB
      NAVIDROME_OG_USER: "preview",
      NAVIDROME_OG_PASS: "preview-pass",
    }));
  });

  afterAll(() => server?.kill());

  it("writes into a relative MUSIC_DIR", async () => {
    const res = await upload(new File([new Uint8Array(100).fill(1)], "01 First.mp3"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { written: string[] }).written).toEqual([
      "Unknown Artist - Unknown Album/01 First.mp3",
    ]);
    expect(readFileSync(target("01 First.mp3"))).toHaveLength(100);
  });

  it("never overwrites a file already in the library", async () => {
    await upload(new File([new Uint8Array(100).fill(1)], "02 Same.mp3"));
    const res = await upload(new File([new Uint8Array(200).fill(2)], "02 Same.mp3"));
    expect(await res.json()).toMatchObject({
      written: [],
      skipped: ["Unknown Artist - Unknown Album/02 Same.mp3"],
    });
    expect(readFileSync(target("02 Same.mp3"))).toEqual(Buffer.alloc(100, 1));
  });

  it("refuses uploads over UPLOAD_MAX_MB", async () => {
    const res = await upload(new File([new Uint8Array(50_000)], "03 Big.mp3"));
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toContain("0.01 MB");
    expect(existsSync(target("03 Big.mp3"))).toBe(false);
  });

  it("refuses a ZIP that unpacks to more than twice the limit", async () => {
    // Zeros compress to almost nothing: small to send, large to unpack.
    const bomb = zipSync({ "04 Bomb.mp3": new Uint8Array(30_000) });
    expect(bomb.byteLength).toBeLessThan(5_000);
    const res = await upload(new File([bomb], "bomb.zip"));
    expect(res.status).toBe(413);
    expect(existsSync(target("04 Bomb.mp3"))).toBe(false);
  });

  it("still unpacks a ZIP within the limit", async () => {
    const zip = zipSync({ "05 Zipped.mp3": new Uint8Array(1_000).fill(5) });
    const res = await upload(new File([zip], "album.zip"));
    expect(((await res.json()) as { written: string[] }).written).toEqual([
      "Unknown Artist - Unknown Album/05 Zipped.mp3",
    ]);
  });

  const crawl = (headers: Record<string, string> = {}) =>
    fetch(`${url}/album/al-1`, { headers: { "user-agent": "Twitterbot/1.0", ...headers } });

  it("keeps $ sequences in titles literal in link previews", async () => {
    const html = await (await crawl()).text();
    expect(html).toContain("<title>Cash $` $&amp; $1 Album — A · NaviPlayer</title>");
    expect(html).toContain('<meta property="og:description" content="A · 1 track" />');
    expect(html.match(/<title>/g)).toHaveLength(1);
  });

  it("uses well-formed forwarded hosts only, and never lets shared caches keep the page", async () => {
    const good = await crawl({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "music.example.com",
    });
    expect(good.headers.get("cache-control")).toContain("private");
    expect(await good.text()).toContain(
      '<meta property="og:url" content="https://music.example.com/album/al-1" />',
    );

    const forged = await (
      await crawl({ "x-forwarded-proto": "https", "x-forwarded-host": 'evil.example/"><x' })
    ).text();
    expect(forged).not.toContain("evil.example");
    expect(forged).toContain(`<meta property="og:url" content="${url}/album/al-1" />`);
  });

  it("refuses uploads from anyone Navidrome doesn't call an admin", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(10)], "x.mp3"));
    const res = await fetch(`${url}/upload`, {
      method: "POST",
      headers: { "x-nd-authorization": "Bearer someone" },
      body: form,
    });
    expect(res.status).toBe(403);
  });

  it("organizes loose files into album folders, only when asked", async () => {
    writeFileSync(join(music, "Loose One.mp3"), Buffer.alloc(50));
    writeFileSync(join(music, "Loose Two.mp3"), Buffer.alloc(60));
    writeFileSync(join(music, "notes.txt"), "not audio");
    const admin = { "x-nd-authorization": "Bearer admin", "content-type": "application/json" };

    const scan = await fetch(`${url}/cleanup/scan`, { method: "POST", headers: admin });
    const found = (await scan.json()) as {
      totalFiles: number;
      groups: { folder: string; files: { name: string }[] }[];
    };
    expect(found.totalFiles).toBe(2);
    expect(found.groups.map((g) => g.folder)).toEqual(["Unknown Artist - Unknown Album"]);

    const nothing = await fetch(`${url}/cleanup/apply`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ folders: [] }),
    });
    expect(nothing.status).toBe(400);

    const apply = await fetch(`${url}/cleanup/apply`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ folders: ["Unknown Artist - Unknown Album"] }),
    });
    expect(((await apply.json()) as { moved: string[] }).moved.sort()).toEqual([
      "Unknown Artist - Unknown Album/Loose One.mp3",
      "Unknown Artist - Unknown Album/Loose Two.mp3",
    ]);
    expect(existsSync(target("Loose One.mp3"))).toBe(true);
    expect(existsSync(join(music, "Loose One.mp3"))).toBe(false);
    expect(existsSync(join(music, "notes.txt"))).toBe(true);
  });
});

describe("display name with substitution patterns", () => {
  it("is written literally", async () => {
    const port = await freePort();
    const { proc: named } = await startServer({
      PORT: String(port),
      DIST_DIR: dist,
      VITE_NAVIDROME_URL: `http://127.0.0.1:${ndPort}/nd/`,
      VITE_APP_NAME: "Cash $` $& $1",
    });
    try {
      const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
      expect(html).toContain("<title>Cash $` $&amp; $1</title>");
      expect(html).toContain('<meta name="application-name" content="Cash $` $&amp; $1" />');
      expect(html.match(/<title>/g)).toHaveLength(1);
    } finally {
      named.kill();
    }
  });
});
