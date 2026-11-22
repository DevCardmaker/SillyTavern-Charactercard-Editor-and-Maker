import { describe, expect, it } from "vitest";
import { parseWikiUrl, wikitextToPlain } from "./wikiSource";

describe("parseWikiUrl", () => {
  it("finds the API and the page title of Fandom and Wikipedia links", () => {
    expect(parseWikiUrl("https://sherlock.fandom.com/wiki/Irene_Adler")).toEqual({
      apis: ["https://sherlock.fandom.com/api.php", "https://sherlock.fandom.com/w/api.php"],
      title: "Irene Adler",
    });
    expect(parseWikiUrl("https://de.wikipedia.org/wiki/Gregor_Samsa")).toEqual({ apis: ["https://de.wikipedia.org/w/api.php"], title: "Gregor Samsa" });
    expect(parseWikiUrl("https://x.fandom.com/wiki/Ren%C3%A9e")?.title).toBe("Renée");
    expect(parseWikiUrl("https://example.org/")).toBeNull();
    expect(parseWikiUrl("no link")).toBeNull();
  });
});

describe("wikitextToPlain", () => {
  it("keeps the infobox facts and the article text, without markup", () => {
    const wikitext = `:''For other versions see [[:Category:Versions|here]]''.
{{character
|name = Irene Adler
|image = Adler.jpg
|born = 1858<br>New Jersey, [[United States of America]]
|job = Opera Singer
|died=|spouse=[[Godfrey Norton]] (Husband)}}'''Irene Adler''' is a character{{cite|x}} in "[[A Scandal in Bohemia]]".<ref>Doyle 1891</ref>

== Biography ==
She married [[Godfrey Norton|Norton]].
{| class="wikitable"
| a || b
|}
[[Category:Women]]`;
    const plain = wikitextToPlain(wikitext);
    expect(plain).toContain("name: Irene Adler");
    expect(plain).toContain("born: 1858, New Jersey, United States of America");
    expect(plain).toContain("spouse: Godfrey Norton (Husband)");
    expect(plain).not.toContain("image");
    expect(plain).not.toContain("died");
    expect(plain).toContain('Irene Adler is a character in "A Scandal in Bohemia".');
    expect(plain).toContain("Biography:\nShe married Norton.");
    expect(plain).not.toMatch(/\[\[|\{\{|<ref|Category|wikitable|'''/);
  });
});
