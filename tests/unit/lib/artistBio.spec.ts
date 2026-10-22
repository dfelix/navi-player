import { bioToText, parseBio } from "@/lib/artistBio";

const LUMEN =
  'There are multiple artists named Lumen: 1) Lumen, also known as BIG LUMEN, is a rapper from Atlanta making noise with &quot;Neon Rain&quot;. 2) Lumen is a Portuguese rock band formed in 2002 after The Quiet Hours ended. Their debut album, Bom Dia, reached 6th place. 3) Lumen was Ray Dunmore&#39;s club project; the album Rising came out in 1996. 4) Lumen Hartley (born 1950) is a reggae musician. <a href="https://www.last.fm/music/Lumen">Read more on Last.fm</a>';

describe("bioToText", () => {
  it("drops links and tags, decodes entities and keeps paragraphs", () => {
    expect(
      bioToText(
        'Rock &amp; roll<br>since&nbsp;1999.</p><p>Second &#x2014; part. <a href="x">Read more</a>',
      ),
    ).toBe("Rock & roll\nsince 1999.\n\nSecond — part.");
  });

  it("leaves unknown entities alone", () => {
    expect(bioToText("A &bogus; name")).toBe("A &bogus; name");
  });
});

describe("parseBio", () => {
  it("returns null for an empty or link-only bio", () => {
    expect(parseBio(undefined)).toBeNull();
    expect(parseBio(' <a href="x">Read more on Last.fm</a> ')).toBeNull();
  });

  it("splits a disambiguation text into its entries", () => {
    const bio = parseBio(LUMEN);
    expect(bio).toMatchObject({
      kind: "several",
      intro: "There are multiple artists named Lumen:",
    });
    if (bio?.kind !== "several") throw new Error("expected several");
    expect(bio.entries).toHaveLength(4);
    expect(bio.entries[0]).toBe(
      'Lumen, also known as BIG LUMEN, is a rapper from Atlanta making noise with "Neon Rain".',
    );
    // "(born 1950) " is not mistaken for an entry marker.
    expect(bio.entries[3]).toBe("Lumen Hartley (born 1950) is a reggae musician.");
    expect(bio.match).toBeNull();
  });

  it("picks the entry that names one of the library's albums", () => {
    expect(parseBio(LUMEN, ["Bom Dia", "Bom Dia (Live)"])).toMatchObject({ match: 1 });
    // Case doesn't matter.
    expect(parseBio(LUMEN, ["RISING"])).toMatchObject({ match: 2 });
  });

  it("doesn't pick when nothing, or more than one entry, matches", () => {
    expect(parseBio(LUMEN, ["Nothing Here"])).toMatchObject({ match: null });
    expect(parseBio(LUMEN, ["Lumen"])).toMatchObject({ match: null }); // every entry
    expect(parseBio(LUMEN, ["Ri"])).toMatchObject({ match: null }); // too short to count
  });

  it("only matches whole words", () => {
    expect(parseBio(LUMEN, ["Bom Di"])).toMatchObject({ match: null });
    expect(parseBio(LUMEN, ["Dia"])).toMatchObject({ match: 1 });
  });

  it("splits entries on line breaks too", () => {
    const bio = parseBio("There are 2 artists with this name:\n\n1) A band.\n\n2) A singer.");
    expect(bio).toMatchObject({ kind: "several", entries: ["A band.", "A singer."] });
  });

  it("keeps an ordinary bio, even one with a numbered list, as paragraphs", () => {
    expect(
      parseBio("Their hits include 1) Song One and 2) Song Two.</p><p>They split in 2001."),
    ).toEqual({
      kind: "single",
      paragraphs: ["Their hits include 1) Song One and 2) Song Two.", "They split in 2001."],
    });
  });
});
