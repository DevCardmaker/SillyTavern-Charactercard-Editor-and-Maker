import { describe, expect, it } from "vitest";
import {
  buildStoryCardUserTurn,
  buildStoryLoreSystemPrompt,
  buildStoryPersonaPlaysMessages,
  buildStoryPersonaSelfMessages,
  isReplacedName,
  buildStorySceneSystemPrompt,
  buildStorySceneUserTurn,
  storyLanguageRetryHint,
} from "./aiPrompt";
import {
  type AiStoryLoreThing,
  buildStoryLorebook,
  defaultLorebookName,
  loreExcerpts,
  loreKeys,
  mergeStoryLore,
  parseAiStoryLore,
  parseAiStoryLoreEntry,
} from "./storyLore";
import { cleanPartPeople, wrongLanguage } from "./storyToCards";

const count = (text: string) => text.split(/\s+/).filter(Boolean).length;
const thing = (name: string, kind: AiStoryLoreThing["kind"] = "place", also_called: string[] = [], about = ""): AiStoryLoreThing => ({
  name,
  kind,
  also_called,
  about,
});

describe("parseAiStoryLore", () => {
  it("strips explanations in brackets and drops macros and empty names", () => {
    const parsed = parseAiStoryLore({
      things: [thing("Briony Lodge (Irene's villa)"), thing("{{user}}'s house"), thing("  "), thing("Diogenes Club", "group", ["the Club (London)"])],
    });
    expect(parsed.success && parsed.data.map((t) => [t.name, t.also_called])).toEqual([
      ["Briony Lodge", []],
      ["Diogenes Club", ["the Club"]],
    ]);
  });

  it("rejects an unknown kind", () => {
    expect(parseAiStoryLore({ things: [{ ...thing("X"), kind: "person" }] }).success).toBe(false);
  });

  it("keeps the lore names that are written in the part", () => {
    const part = "They drove to Briony Lodge, a villa in Serpentine Avenue.";
    const cleaned = cleanPartPeople([thing("Briony Lodge", "place", ["the Lodge", "Irene's house"]), thing("Baker Street")], part);
    expect(cleaned).toEqual([thing("Briony Lodge", "place", ["the Lodge"])]);
  });
});

describe("mergeStoryLore", () => {
  const paragraphs = [
    "Holmes went to Briony Lodge.",
    "The Lodge was quiet. Serpentine Avenue lay empty.",
    "Back at Briony Lodge, the photograph was gone.",
    "The King of Bohemia arrived.",
  ];

  it("merges names across parts, takes the kind most parts gave and counts paragraphs", () => {
    const items = mergeStoryLore(
      [[thing("Briony Lodge", "place", [], "Irene's villa")], [thing("Briony Lodge", "group"), thing("Serpentine Avenue")], [thing("Lodge", "place")]],
      paragraphs,
    );
    expect(items.map((i) => [i.name, i.kind, i.mentions])).toEqual([
      ["Briony Lodge", "place", 3],
      ["Serpentine Avenue", "place", 1],
    ]);
  });

  it("drops things that are really people from the people list", () => {
    const items = mergeStoryLore([[thing("the King of Bohemia", "group"), thing("Briony Lodge")]], paragraphs, [
      { name: "King of Bohemia", aliases: [] },
    ]);
    expect(items.map((i) => i.name)).toEqual(["Briony Lodge"]);
  });
});

describe("loreExcerpts", () => {
  const paragraphs = ["a b c", "d e f", "g h i", "j k l", "m n o"];

  it("returns all mentioning paragraphs in story order, joining neighbours", () => {
    expect(loreExcerpts(paragraphs, [0, 1, 3], count)).toEqual(["a b c\n\nd e f", "j k l"]);
  });

  it("keeps the first and last ones when over budget", () => {
    expect(loreExcerpts(paragraphs, [0, 1, 2, 3, 4], count, 6)).toEqual(["a b c", "m n o"]);
    expect(loreExcerpts(paragraphs, [0, 1, 2, 3, 4], count, 9)).toEqual(["a b c\n\nd e f", "m n o"]);
  });
});

describe("loreKeys", () => {
  it("drops leading articles, descriptions and relationship words in aliases", () => {
    expect(loreKeys({ name: "the Diogenes Club", aliases: ["the Club", "the old club", "Gregors Schwester", "Diogenes"] })).toEqual([
      "Diogenes Club",
      "Club",
      "Diogenes",
    ]);
  });

  it("keeps a side character's only name even if it's a relationship word", () => {
    expect(loreKeys({ name: "die Mutter", aliases: [] })).toEqual(["Mutter"]);
    expect(loreKeys({ name: "the innkeeper", aliases: [] })).toEqual(["innkeeper"]);
  });
});

describe("buildStoryLorebook", () => {
  it("makes one labelled entry per pick and skips empty ones", () => {
    const book = buildStoryLorebook("  ", [
      { name: "Briony Lodge", keys: ["Briony Lodge"], content: " Irene's villa. " },
      { name: "Nothing", keys: ["x"], content: "" },
      { name: "No keys", keys: [], content: "text" },
    ]);
    expect(book.name).toBe("Story Lorebook");
    expect(book.entries).toEqual([
      { keys: ["Briony Lodge"], content: "Irene's villa.", comment: "Briony Lodge", extensions: {}, enabled: true, insertion_order: 0 },
    ]);
  });

  it("names the lorebook after the story file, else the main character", () => {
    expect(defaultLorebookName("A Scandal in Bohemia.txt", "Irene Adler")).toBe("A Scandal in Bohemia Lorebook");
    expect(defaultLorebookName(null, "Irene Adler")).toBe("Irene Adler's World");
  });
});

describe("lore prompts", () => {
  it("rejects an empty entry and asks for things, not people", () => {
    expect(parseAiStoryLoreEntry({ content: "  " }).success).toBe(false);
    expect(buildStoryLoreSystemPrompt()).toContain("Not single persons");
  });
});

describe("lore live-test fixes", () => {
  it("cuts an appositive after a comma from the name", () => {
    const parsed = parseAiStoryLore({ things: [thing("John, the coachman", "term")] });
    expect(parsed.success && parsed.data[0].name).toBe("John");
  });

  it("drops people before merging, so a place named in a title survives", () => {
    const paragraphs = ["The King of Bohemia came.", "Bohemia is far away.", "In Bohemia, kings rule.", "Bohemia again."];
    const items = mergeStoryLore(
      [[thing("King of Bohemia", "group"), thing("Bohemia"), thing("Nonconformist clergyman", "term")]],
      paragraphs,
      [{ name: "King of Bohemia", aliases: [] }, { name: "The clergyman", aliases: [] }],
    );
    expect(items.map((i) => i.name)).toEqual(["Bohemia"]);
  });

  it("cuts an entry stopped mid-sentence back to the last full sentence", () => {
    expect(parseAiStoryLoreEntry({ content: "A villa. It has two floors. The garden is" })).toEqual({
      success: true,
      data: "A villa. It has two floors.",
    });
  });
});

describe("lore live-test fixes, round 2", () => {
  it("counts a common noun only as itself or its plural", () => {
    const items = mergeStoryLore([[thing("wit", "term")]], ["He spoke with wit.", "Her wits were sharp.", "With that, he left."], []);
    expect(items[0].mentions).toBe(2);
  });

  it("drops an alias that another part lists as a thing of its own", () => {
    const items = mergeStoryLore([[thing("Egria", "place", ["Bohemia"])], [thing("Bohemia")]], ["Egria lies in Bohemia.", "Bohemia."], []);
    expect(items.map((i) => [i.name, i.aliases])).toEqual([
      ["Bohemia", []],
      ["Egria", []],
    ]);
  });
});

describe("language check", () => {
  const german = "Gregor Samsa erwachte eines Morgens aus unruhigen Träumen und fand sich in seinem Bett zu einem ungeheueren Ungeziefer verwandelt. Er lag auf seinem panzerartig harten Rücken und sah, wenn er den Kopf ein wenig hob, seinen gewölbten Bauch.";
  const english = "Gregor Samsa woke one morning from troubled dreams and found that he had been changed into a monstrous insect in his bed. He lay on his hard back and saw, when he lifted his head a little, his brown belly.";

  it("flags a reply in the story's language instead of the one asked for", () => {
    expect(wrongLanguage(german, "English")).toBe(true);
    expect(wrongLanguage(german, "englisch")).toBe(true);
    expect(wrongLanguage(english, "English")).toBe(false);
    expect(wrongLanguage(german, "Deutsch")).toBe(false);
  });

  it("lets unknown language names and short texts pass", () => {
    expect(wrongLanguage(german, "Klingon")).toBe(false);
    expect(wrongLanguage("Ein kurzer Satz.", "English")).toBe(false);
  });

  it("repeats the language at the end of the user turn", () => {
    const turn = buildStoryCardUserTurn([["a note"]], [], "English", storyLanguageRetryHint("English"));
    const data = JSON.parse(turn.content as string);
    expect(data.write_in).toBe("English");
    expect(data.important).toContain("not in English");
  });
});

describe("story persona prompts", () => {
  it("writes a replacing persona from the wishes, with the characters for time and place", () => {
    const [system, user] = buildStoryPersonaSelfMessages("Gregor Samsa", [{ name: "Grete Samsa", description: "{{user}}'s younger sister." }], "Clara, red hair", "English");
    expect(system.content).toContain("not Gregor Samsa");
    expect(JSON.parse(user.content as string)).toEqual({
      story_characters: [{ name: "Grete Samsa", description: "the persona's younger sister." }],
      wishes: "Clara, red hair",
      write_in: "English",
    });
  });

  it("recognises the replaced character's name coming back", () => {
    expect(isReplacedName("Gregor", ["gregor"])).toBe(true);
    expect(isReplacedName("Gregor Samsa", ["gregor"])).toBe(true);
    // In his place in the family, the family name is right.
    expect(isReplacedName("Clara Samsa", ["gregor"])).toBe(false);
  });

  it("writes a played character's persona from the notes", () => {
    const [system, user] = buildStoryPersonaPlaysMessages("Gregor Samsa", [["a salesman"], ["turned into an insect"]], "", "English");
    expect(system.content).toContain("Don't retell the plot");
    expect(JSON.parse(user.content as string).notes).toEqual([
      { part: 1, notes: ["a salesman"] },
      { part: 2, notes: ["turned into an insect"] },
    ]);
  });

  it("adds the persona to the opening scene only when asked", () => {
    const turn = buildStorySceneUserTurn({ description: "d", personality: "p" }, [], "", "English", "", { name: "Clara", description: "red hair" });
    expect(JSON.parse(turn.content as string).persona).toEqual({ name: "Clara", description: "red hair" });
    expect(buildStorySceneSystemPrompt("Grete", "", "English", true)).toContain("perceives {{user}}");
    expect(buildStorySceneSystemPrompt("Grete", "", "English")).not.toContain("perceives {{user}}");
  });
});
