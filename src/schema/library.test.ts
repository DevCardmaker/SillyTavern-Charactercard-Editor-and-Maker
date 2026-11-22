import { describe, expect, it } from "vitest";
import { directDownload, downloadRoute, isLorebookJson, sillyTavernImportUrl, fileNameFromDisposition, parseUrlList, placeInLibrary, safeName, stProxyExample } from "./library";

describe("downloadRoute", () => {
  it("sends known sites through SillyTavern and anything else directly", () => {
    expect(downloadRoute("https://chub.ai/characters/someone/anna-1234")).toBe("sillytavern");
    expect(downloadRoute("https://www.characterhub.org/characters/x/y")).toBe("sillytavern");
    expect(downloadRoute("https://janitorai.com/characters/abc")).toBe("sillytavern");
    expect(downloadRoute("https://realm.risuai.net/character/abc")).toBe("sillytavern");
    expect(downloadRoute("https://example.org/cards/anna.png")).toBe("direct");
    expect(downloadRoute("not a link")).toBeNull();
    expect(downloadRoute("file:///home/x/a.png")).toBeNull();
  });
});

describe("parseUrlList", () => {
  it("takes one link per line without blanks, comments and repeats", () => {
    expect(parseUrlList(" https://a\n\n# note\nhttps://b\r\nhttps://a ")).toEqual(["https://a", "https://b"]);
  });
});

describe("safeName", () => {
  it("removes what file systems reject", () => {
    expect(safeName('Anna: "The / Best"?')).toBe("Anna The Best");
    expect(safeName("Familie Berg. ")).toBe("Familie Berg");
    expect(safeName("  ", "group")).toBe("group");
  });
});

describe("fileNameFromDisposition", () => {
  it("prefers the encoded name over a plain stand-in", () => {
    expect(fileNameFromDisposition(`attachment; filename="download.json"; filename*=UTF-8''High%20School%20DxD%20%F0%9F%98%88.json`)).toBe("High School DxD 😈.json");
  });

  it("reads SillyTavern's encoded file name", () => {
    expect(fileNameFromDisposition('attachment; filename="Cassandra%20Vole.png"')).toBe("Cassandra Vole.png");
    expect(fileNameFromDisposition(undefined)).toBeNull();
  });
});

describe("placeInLibrary", () => {
  const a = Uint8Array.from([1, 2, 3]);
  const b = Uint8Array.from([4, 5]);
  it("uses the wanted name when it's free", () => {
    expect(placeInLibrary("Anna.png", new Map(), a)).toEqual({ fileName: "Anna.png", duplicate: false });
  });

  it("writes an identical file again under its own name", () => {
    expect(placeInLibrary("anna.png", new Map([["Anna.png", a]]), a)).toEqual({ fileName: "Anna.png", duplicate: true });
  });

  it("adds a changed one as a second file, or finds an identical second file", () => {
    expect(placeInLibrary("Anna.png", new Map([["Anna.png", b]]), a)).toEqual({ fileName: "Anna-2.png", duplicate: false });
    expect(placeInLibrary("Anna.png", new Map([["Anna.png", b], ["Anna-2.png", a]]), a)).toEqual({ fileName: "Anna-2.png", duplicate: true });
  });
});

describe("stProxyExample", () => {
  it("fills in the proxy and the local model servers as exceptions", () => {
    expect(stProxyExample("http://192.168.1.50:8888", ["http://192.168.1.20:5002", "https://api.deepseek.com", "http://127.0.0.1:5003"])).toBe(
      ["requestProxy:", "  enabled: true", '  url: "http://192.168.1.50:8888"', "  bypass:", "    - localhost", "    - 127.0.0.1", '    - "::1"', "    - 192.168.1.20"].join("\n"),
    );
  });

  it("uses a placeholder without a proxy", () => {
    expect(stProxyExample("", [])).toContain('url: "http://192.168.0.10:8888"');
  });
});

describe("directDownload", () => {
  it("turns Botbooru pages into their downloads and leaves other links alone", () => {
    expect(directDownload("https://botbooru.com/character/99635")).toEqual({ url: "https://botbooru.com/download/png/99635", kind: "card" });
    expect(directDownload("https://www.botbooru.com/character/99635?tab=info").url).toBe("https://botbooru.com/download/png/99635");
    expect(directDownload("https://botbooru.com/lorebook/909")).toEqual({ url: "https://botbooru.com/api/lorebooks/909/download.json", kind: "lorebook" });
    expect(directDownload(" https://example.org/a.png ")).toEqual({ url: "https://example.org/a.png", kind: "card" });
  });
});

describe("more card sites", () => {
  it("knows Character Tavern and WyvernChat pages", () => {
    expect(directDownload("https://character-tavern.com/character/franklin/arisha_velveteen")).toEqual({
      url: "https://ct-cards.storage.character-tavern.com/franklin/arisha_velveteen.png?action=download",
      kind: "card",
    });
    expect(directDownload("https://app.wyvern.chat/characters/_reRYgwMPHhVWtUnVHHjAh")).toEqual({
      url: "https://api.wyvern.chat/characters/_reRYgwMPHhVWtUnVHHjAh",
      kind: "wyvern",
    });
  });

  it("sends JannyAI links to SillyTavern as JanitorAI links", () => {
    expect(downloadRoute("https://jannyai.com/characters/57a9501b-4bdf-4dd3-b095-1386c1d2ffb1_character-anna")).toBe("sillytavern");
    expect(sillyTavernImportUrl("https://jannyai.com/characters/57a9501b-4bdf-4dd3-b095-1386c1d2ffb1_character-anna")).toBe(
      "https://janitorai.com/characters/57a9501b-4bdf-4dd3-b095-1386c1d2ffb1",
    );
    expect(sillyTavernImportUrl(" https://chub.ai/characters/a/b ")).toBe("https://chub.ai/characters/a/b");
  });

  it("tells lorebook JSON from card JSON", () => {
    expect(isLorebookJson({ name: "World", entries: [] })).toBe(true);
    expect(isLorebookJson({ entries: { 0: {} } })).toBe(true);
    expect(isLorebookJson({ spec: "chara_card_v2", data: { character_book: { entries: [] } } })).toBe(false);
    expect(isLorebookJson({ name: "Anna", first_mes: "Hi", entries: [] })).toBe(false);
  });
});
