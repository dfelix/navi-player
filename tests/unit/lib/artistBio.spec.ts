import { bioToText, parseBio } from "@/lib/artistBio";

const PLUTO =
  'There are multiple artists named Pluto: 1) Pluto, also known as BIG PLUTO, is a rapper from Atlanta making noise with &quot;Whim Whamiee&quot;. 2) Pluto is a Portuguese rock band formed in 2002 after Ornatos Violeta ended. Their debut album, Bom Dia, reached 6th place. 3) Pluto was Rolo McGinty&#39;s club project; the album Rising came out in 1996. 4) Pluto Shervington (born 1950) is a reggae musician. <a href="https://www.last.fm/music/Pluto">Read more on Last.fm</a>';

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
    const bio = parseBio(PLUTO);
    expect(bio).toMatchObject({
      kind: "several",
      intro: "There are multiple artists named Pluto:",
    });
    if (bio?.kind !== "several") throw new Error("expected several");
    expect(bio.entries).toHaveLength(4);
    expect(bio.entries[0]).toBe(
      'Pluto, also known as BIG PLUTO, is a rapper from Atlanta making noise with "Whim Whamiee".',
    );
    // "(born 1950) " is not mistaken for an entry marker.
    expect(bio.entries[3]).toBe("Pluto Shervington (born 1950) is a reggae musician.");
    expect(bio.match).toBeNull();
  });

  it("picks the entry that names one of the library's albums", () => {
    expect(parseBio(PLUTO, ["Bom Dia", "Bom Dia (Live)"])).toMatchObject({ match: 1 });
    // Case doesn't matter.
    expect(parseBio(PLUTO, ["RISING"])).toMatchObject({ match: 2 });
  });

  it("doesn't pick when nothing, or more than one entry, matches", () => {
    expect(parseBio(PLUTO, ["Nothing Here"])).toMatchObject({ match: null });
    expect(parseBio(PLUTO, ["Pluto"])).toMatchObject({ match: null }); // every entry
    expect(parseBio(PLUTO, ["Ri"])).toMatchObject({ match: null }); // too short to count
  });

  it("only matches whole words", () => {
    expect(parseBio(PLUTO, ["Bom Di"])).toMatchObject({ match: null });
    expect(parseBio(PLUTO, ["Dia"])).toMatchObject({ match: 1 });
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
