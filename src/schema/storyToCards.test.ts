import { describe, expect, it } from "vitest";
import { buildStoryCardSystemPrompt, buildStoryPeopleUserTurn, storyUserRoleText } from "./aiPrompt";
import {
  type AiStoryPerson,
  cleanPartPeople,
  detectStoryLanguage,
  endingNotes,
  nameToUser,
  notesAbout,
  mentionPattern,
  mergePersonInto,
  mergeStoryPeople,
  paragraphsMentioning,
  parseAiStoryNotes,
  parseAiStoryPeople,
  partsWith,
  personWords,
  storyParagraphs,
  storyParts,
  userStoryPerson,
} from "./storyToCards";

/** One "token" per word is close enough for these tests. */
const count = (text: string) => text.split(/\s+/).filter(Boolean).length;
const found = (name: string, also_called: string[] = [], role = ""): AiStoryPerson => ({ name, also_called, role });

describe("storyParagraphs / storyParts", () => {
  it("splits at blank lines, keeping hard-wrapped lines together", () => {
    expect(storyParagraphs("One line\nwrapped.\n\nTwo.\r\n\r\nThree.", count)).toEqual(["One line\nwrapped.", "Two.", "Three."]);
  });

  it("cuts a text without blank lines at line breaks once it's long", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Line ${i} ${"word ".repeat(10)}`).join("\n");
    expect(storyParagraphs(lines, count)).toHaveLength(50);
  });

  it("cuts a single huge line at sentence ends", () => {
    const line = Array.from({ length: 100 }, () => "This is a sentence with eight words.").join(" ");
    const out = storyParagraphs(line, count);
    expect(out.length).toBeGreaterThan(1);
    expect(out.join(" ")).toBe(line);
  });

  it("packs paragraphs into parts and remembers which paragraphs each part holds", () => {
    const paragraphs = ["a b c", "d e f", "g h i", "j k l"];
    const parts = storyParts(paragraphs, count, 6);
    expect(parts).toEqual([
      { text: "a b c\n\nd e f", first: 0, last: 1 },
      { text: "g h i\n\nj k l", first: 2, last: 3 },
    ]);
  });
});

describe("parseAiStoryPeople / cleanPartPeople", () => {
  it("moves an explanation in brackets from the name to the role and drops {{user}}", () => {
    const parsed = parseAiStoryPeople({
      people: [found("Grete Samsa (Gregor's sister)"), found("{{user}}"), found("Anna", [" Annie "], "maid")],
    });
    expect(parsed.success && parsed.data).toEqual([
      found("Grete Samsa", [], "Gregor's sister"),
      found("Anna", ["Annie"], "maid"),
    ]);
  });

  it("keeps only aliases that are written in the part and aren't someone else's name", () => {
    const part = "Holmes looked at Watson. The King of Bohemia, calling himself Count Von Kramm, entered.";
    const cleaned = cleanPartPeople(
      [
        found("Sherlock Holmes", ["the narrator", "John Watson", "Holmes"]),
        found("Watson"),
        found("King of Bohemia", ["The Count Von Kramm"]),
      ],
      part,
    );
    expect(cleaned.map((p) => p.also_called)).toEqual([["Holmes"], [], ["The Count Von Kramm"]]);
  });

  it("drops an invented name, or replaces it with an alias that is written", () => {
    const part = "Der Prokurist stand im Vorzimmer. Die Mutter weinte.";
    const cleaned = cleanPartPeople(
      [found("Herr Zipes", ["der Prokurist"]), found("the mother"), found("Die Mutter")],
      part,
    );
    expect(cleaned.map((p) => p.name)).toEqual(["der Prokurist", "Die Mutter"]);
  });
});

describe("personWords / mentionPattern", () => {
  it("allows short endings but not longer words", () => {
    const pattern = mentionPattern(["gregor", "anna"])!;
    expect(pattern.test("Gregors Zimmer")).toBe(true);
    expect(pattern.test("Holmes's pipe".replace("Holmes", "Anna"))).toBe(true);
    expect(pattern.test("Die Annahme war falsch.")).toBe(false);
  });

  it("matches a description as a phrase, not word by word", () => {
    expect(personWords({ name: "The elderly woman", aliases: [] })).toEqual(["elderly woman"]);
    expect(personWords({ name: "Several well-dressed young men", aliases: [] })).toEqual(["several well-dressed young men"]);
  });

  it("uses only words that belong to the person alone", () => {
    const family = [
      { name: "Gregor Samsa", aliases: [] },
      { name: "Grete Samsa", aliases: ["die Schwester"] },
      { name: "Herr Samsa", aliases: [] },
    ];
    expect(personWords(family[0], [family[1], family[2]])).toEqual(["gregor"]);
    expect(personWords(family[1], [family[0], family[2]])).toEqual(["grete", "schwester"]);
    // Nothing of their own left: the whole name as a phrase.
    expect(personWords(family[2], [family[0], family[1]])).toEqual(["herr samsa"]);
  });

  it("matches \"X's mother\" as a phrase, and leaves out small words like \"mit\"", () => {
    expect(personWords({ name: "Gregor's mother", aliases: [] })).toEqual(["gregor's mother"]);
    expect(personWords({ name: "Mary Jane", aliases: [] })).toEqual(["mary", "jane"]);
    expect(personWords({ name: "Herr mit dem Bart", aliases: [] })).toEqual(["bart"]);
  });

  it("gives the narrator every paragraph", () => {
    const paragraphs = ["I woke up.", "Holmes smiled.", "We left."];
    expect(paragraphsMentioning(paragraphs, { name: "Watson", aliases: [], narrator: true })).toEqual([0, 1, 2]);
    expect(paragraphsMentioning(paragraphs, { name: "Watson", aliases: [] })).toEqual([]);
  });
});

describe("mergeStoryPeople", () => {
  const paragraphs = [
    "Sherlock Holmes and Dr. John Watson sat in Baker Street.",
    "Watson read the paper. Holmes smoked.",
    "Irene Adler married Godfrey Norton.",
    "Mr. Norton was a lawyer. Mrs. Norton sang.",
    "Mycroft Holmes visited his brother.",
  ];

  it("merges names, aliases, the same words and unique sub-names, sorted by mentions", () => {
    const people = mergeStoryPeople(
      [
        [found("Sherlock Holmes", [], "detective"), found("Dr. John Watson", [], "narrator's friend")],
        [found("Watson", [], "doctor"), found("Holmes"), found("Dr. Watson")],
        [found("Irene Adler", ["Mrs. Norton"]), found("Godfrey Norton"), found("Mr. Godfrey Norton"), found("Mr. Norton")],
      ],
      paragraphs,
    );
    const byName = Object.fromEntries(people.map((p) => [p.name, p]));
    expect(Object.keys(byName).sort()).toEqual(["Dr. John Watson", "Godfrey Norton", "Irene Adler", "Sherlock Holmes"]);
    expect(byName["Sherlock Holmes"].aliases).toEqual(["Holmes"]);
    expect(byName["Dr. John Watson"].aliases.sort()).toEqual(["Dr. Watson", "Watson"]);
    expect(byName["Godfrey Norton"].aliases.sort()).toEqual(["Mr. Godfrey Norton", "Mr. Norton"]);
  });

  it("doesn't fold a name into one of several fitting people", () => {
    const people = mergeStoryPeople([[found("Sherlock Holmes"), found("Mycroft Holmes"), found("Holmes")]], paragraphs);
    expect(people.map((p) => p.name).sort()).toEqual(["Holmes", "Mycroft Holmes", "Sherlock Holmes"]);
  });

  it("keeps Mr. and Mrs. apart", () => {
    const people = mergeStoryPeople([[found("Herr Samsa"), found("Frau Samsa")]], ["Herr Samsa und Frau Samsa."]);
    expect(people).toHaveLength(2);
  });

  it("counts mentions and finds a person's parts", () => {
    const people = mergeStoryPeople([[found("Irene Adler"), found("Sherlock Holmes")]], paragraphs);
    const irene = people.find((p) => p.name === "Irene Adler")!;
    expect(irene.mentions).toBe(1);
    const parts = storyParts(paragraphs, count, 12);
    expect(partsWith(parts, paragraphs, irene, people.filter((p) => p !== irene)).map((p) => p.first)).toEqual([1]);
  });
});

describe("notes and the user's role", () => {
  it("cleans notes and takes the last parts' notes as the ending", () => {
    const parsed = parseAiStoryNotes({
      notes: [
        { who: "Irene", note: "- She sings." },
        { who: "Irene", note: "she sings." },
        { who: "Irene", note: "  " },
        { who: "Holmes", note: "• He smokes." },
        { who: "Irene Adler", note: "She left London." },
        { who: "Irene's maid", note: "She is old." },
      ],
    });
    expect(parsed.success && parsed.data.length).toBe(4);
    const irene = { name: "Irene Adler", aliases: ["Miss Irene"] };
    const holmes = { name: "Sherlock Holmes", aliases: [] };
    expect(notesAbout(parsed.success ? parsed.data : [], irene, [holmes])).toEqual(["She sings.", "She left London."]);
    expect(endingNotes([["a", "b"], ["c"], ["d", "e"]], 3)).toEqual(["c", "d", "e"]);
  });

  it("names the story character {{user}} plays, if any", () => {
    expect(userStoryPerson({ kind: "plays", person: "Watson" })).toBe("Watson");
    expect(userStoryPerson({ kind: "new", mode: "replaces", about: "", person: "Watson" })).toBe("Watson");
    expect(userStoryPerson({ kind: "new", mode: "always", about: "x" })).toBeNull();
  });

  it("builds the role sentence and adds the {{user}} line only when the characters know them", () => {
    expect(storyUserRoleText({ kind: "new", mode: "joins", about: "" })).toContain("(no details given)");
    expect(storyUserRoleText({ kind: "new", mode: "replaces", about: "a bard", person: "Watson" })).toContain(
      "takes the place of Watson",
    );
    expect(buildStoryCardSystemPrompt("Irene", "", true, "English")).toContain("relationship to {{user}}");
    expect(buildStoryCardSystemPrompt("Irene", "", false, "English")).not.toContain("relationship to {{user}}");
  });

  it("writes {{user}} for the character the user plays", () => {
    const gregor = { name: "Gregor Samsa", aliases: ["Gregor"] };
    const grete = { name: "Grete Samsa", aliases: [] };
    expect(nameToUser("Grete loves Gregor Samsa. Gregor's room is dark; Samsa is the family name.", gregor, [grete])).toBe(
      "Grete loves {{user}}. {{user}}'s room is dark; Samsa is the family name.",
    );
    expect(nameToUser("Gregors Zimmer", gregor, [grete])).toBe("{{user}}s Zimmer");
  });

  it("detects the story's language", () => {
    expect(detectStoryLanguage("Als Gregor Samsa eines Morgens aus unruhigen Träumen erwachte, fand er sich in seinem Bett zu einem ungeheueren Ungeziefer verwandelt. Er lag auf seinem panzerartig harten Rücken und sah, wenn er den Kopf ein wenig hob, seinen gewölbten, braunen Bauch.")).toBe("German");
    expect(detectStoryLanguage("To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex.")).toBe("English");
    expect(detectStoryLanguage("Дарья открыла дверь и улыбнулась.")).toBe("Russian");
    expect(detectStoryLanguage("彼女は本を読んでいる。")).toBe("Japanese");
    expect(detectStoryLanguage("123 456")).toBeNull();
  });

  it("sends the story as JSON data", () => {
    expect(JSON.parse(buildStoryPeopleUserTurn('He said "hi".').content)).toEqual({ story_part: 'He said "hi".' });
  });
});

describe("misspelt names (live test, Kafka)", () => {
  it("doesn't take a misspelt name that is only part of a word in the text", () => {
    const part = "Gregor lag im Bett. Grete brachte das Essen.";
    expect(cleanPartPeople([found("Grego"), found("Gregor Samsa")], part).map((p) => p.name)).toEqual(["Gregor Samsa"]);
  });

  it("drops a merged person without a paragraph of their own", () => {
    const paragraphs = ["Grete Samsa spielte Geige.", "Grete weinte.", "Herr Samsa schlief."];
    const people = mergeStoryPeople([[found("Grete Samsa"), found("Greta Samsa")]], paragraphs);
    expect(people.map((p) => p.name)).toEqual(["Grete Samsa"]);
  });
});

describe("mergePersonInto (user merges two entries)", () => {
  const person = (name: string, aliases: string[] = []) => ({ name, aliases, roles: [], mentions: 0, narrator: false });

  it("counts the paragraphs of both names afterwards", () => {
    const paragraphs = ["Grete spielte Geige.", "Die Schwester brachte Milch.", "Die Schwester weinte.", "Der Vater schlief."];
    const grete = mergePersonInto(person("Grete Samsa"), person("die Schwester"));
    expect(grete.aliases).toEqual(["die Schwester"]);
    expect(paragraphsMentioning(paragraphs, grete, [person("der Vater")])).toEqual([0, 1, 2]);
  });

  it("also uses a lowercase description the user assigned", () => {
    const paragraphs = ["Grete played.", "The sister brought milk.", "The father slept."];
    const grete = mergePersonInto(person("Grete Samsa"), person("the sister"));
    expect(paragraphsMentioning(paragraphs, grete, [person("the father")])).toEqual([0, 1]);
    // ...while the model's own lowercase aliases stay unused.
    expect(paragraphsMentioning(paragraphs, person("Grete Samsa", ["the sister"]), [])).toEqual([0]);
  });
});

describe("nameToUser with an assigned description", () => {
  it("replaces the whole description, article included", () => {
    const grete = mergePersonInto({ name: "Grete Samsa", aliases: [], roles: [], mentions: 0, narrator: false }, { name: "the sister", aliases: [], roles: [], mentions: 0, narrator: false });
    expect(nameToUser("The sister smiled. Grete waved.", grete, [])).toBe("{{user}} smiled. {{user}} waved.");
  });
});
