import { describe, expect, it } from "vitest";
import { createBlankCard, type NormalizedCard } from "./normalize";
import {
  buildTestChatPrompt,
  cleanReply,
  nextSpeaker,
  startMessages,
  stopSequencesFor,
  substituteMacros,
  type TestChatMember,
  type TestChatMessage,
} from "./testChat";

const count = (text: string) => text.split(/\s+/).filter(Boolean).length;

function card(patch: Partial<NormalizedCard>): NormalizedCard {
  return { ...createBlankCard(), ...patch };
}

function member(id: string, patch: Partial<NormalizedCard>): TestChatMember {
  return { id, card: card({ name: id, ...patch }) };
}

function msg(speakerId: string | null, name: string, content: string): TestChatMessage {
  return { id: crypto.randomUUID(), speakerId, name, content };
}

const entry = (keys: string[], content: string, extra: Record<string, unknown> = {}) => ({
  keys,
  content,
  extensions: {},
  enabled: true,
  insertion_order: 100,
  ...extra,
});

describe("substituteMacros", () => {
  it("replaces {{char}}/{{user}} and the legacy spellings, case-insensitively", () => {
    expect(substituteMacros("{{char}} greets {{User}}. <BOT> and <user>", "Mira", "Tom")).toBe("Mira greets Tom. Mira and Tom");
  });
});

describe("startMessages", () => {
  it("starts a single chat with the chosen greeting", () => {
    const alice = member("Alice", { first_mes: "Hi {{user}}", alternate_greetings: ["Hey there"] });
    expect(startMessages([alice], "Tom", 0)[0].content).toBe("Hi Tom");
    expect(startMessages([alice], "Tom", 1)[0].content).toBe("Hey there");
  });

  it("starts a group chat with every member's first message, skipping empty ones", () => {
    const messages = startMessages([member("A", { first_mes: "a" }), member("B", {}), member("C", { first_mes: "c" })], "Tom");
    expect(messages.map((m) => m.speakerId)).toEqual(["A", "C"]);
  });
});

describe("nextSpeaker", () => {
  it("goes round robin after whoever of the members spoke last", () => {
    const history = [msg("A", "A", "x"), msg(null, "Tom", "y")];
    expect(nextSpeaker(["A", "B", "C"], history)).toBe("B");
    expect(nextSpeaker(["A", "B", "C"], [msg("C", "C", "x")])).toBe("A");
    expect(nextSpeaker(["A", "B"], [])).toBe("A");
  });
});

describe("buildTestChatPrompt", () => {
  it("puts definitions in the system message and maps a single chat's history to user/assistant", () => {
    const alice = member("Alice", {
      description: "{{char}} is a pilot.",
      personality: "brave",
      scenario: "A storm over the sea",
      post_history_instructions: "Stay in character as {{char}}.",
    });
    const { messages } = buildTestChatPrompt({
      speakerId: "Alice",
      members: [alice],
      userName: "Tom",
      personaDescription: "{{user}} is a sailor.",
      history: [msg("Alice", "Alice", "Hello"), msg(null, "Tom", "Hi")],
      count,
    });
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("fictional chat between Alice and Tom");
    expect(messages[0].content).toContain("Alice is a pilot.");
    expect(messages[0].content).toContain("Alice's personality: brave");
    expect(messages[0].content).toContain("Scenario: A storm over the sea");
    expect(messages[0].content).toContain("About Tom: Tom is a sailor.");
    expect(messages.slice(1)).toEqual([
      { role: "assistant", content: "Hello" },
      { role: "user", content: "Hi" },
      { role: "system", content: "Stay in character as Alice." },
    ]);
  });

  it("uses the card's system prompt, with {{original}} standing for the default one", () => {
    const alice = member("Alice", { system_prompt: "{{original}} Be terse." });
    const { messages } = buildTestChatPrompt({ speakerId: "Alice", members: [alice], userName: "Tom", personaDescription: "", history: [], count });
    expect(messages[0].content.startsWith("Write Alice's next reply in a fictional chat between Alice and Tom. Be terse.")).toBe(true);
  });

  it("in a group, uses only the speaker's card and prefixes everyone else's lines with their name", () => {
    const a = member("A", { description: "desc A" });
    const b = member("B", { description: "desc B" });
    const { messages } = buildTestChatPrompt({
      speakerId: "B",
      members: [a, b],
      userName: "Tom",
      personaDescription: "",
      history: [msg("A", "A", "one"), msg(null, "Tom", "two"), msg("B", "B", "three")],
      count,
    });
    expect(messages[0].content).toContain("desc B");
    expect(messages[0].content).not.toContain("desc A");
    // A's and Tom's lines merge into one user turn, so the roles keep alternating.
    expect(messages[1]).toEqual({ role: "user", content: "A: one\n\nTom: two" });
    expect(messages[2]).toEqual({ role: "assistant", content: "three" });
    expect(messages[messages.length - 1].content).toContain("Reply only as B");
  });

  it("activates lorebook entries from the last messages only and reports them", () => {
    const alice = member("Alice", {
      character_book: {
        extensions: {},
        entries: [
          entry(["castle"], "The castle is old.", { comment: "Castle" }),
          entry(["dragon"], "Dragons are extinct.", { comment: "Dragons" }),
          entry([], "Magic is rare.", { constant: true, comment: "Magic" }),
        ],
      },
    });
    const { messages, activeLore } = buildTestChatPrompt({
      speakerId: "Alice",
      members: [alice],
      userName: "Tom",
      personaDescription: "",
      history: [msg(null, "Tom", "a dragon!"), msg("Alice", "Alice", "x"), msg(null, "Tom", "the castle")],
      count,
    });
    expect(activeLore.sort()).toEqual(["Castle", "Magic"]);
    expect(messages[0].content).toContain("The castle is old.");
    expect(messages[0].content).not.toContain("Dragons");
  });

  it("inserts the Character's Note at its depth", () => {
    const alice = member("Alice", { extensions: { depth_prompt: { prompt: "NOTE", depth: 1, role: "system" } } });
    const { messages } = buildTestChatPrompt({
      speakerId: "Alice",
      members: [alice],
      userName: "Tom",
      personaDescription: "",
      history: [msg("Alice", "Alice", "a"), msg(null, "Tom", "b")],
      count,
    });
    expect(messages.map((m) => m.content)).toEqual([expect.any(String), "a", "NOTE", "b"]);
  });

  it("drops the example dialogue first, then the oldest messages, when the context is full", () => {
    const alice = member("Alice", { mes_example: "<START>\n{{char}}: example words here" });
    const history = Array.from({ length: 10 }, (_, i) => msg(i % 2 ? null : "Alice", "x", "word ".repeat(10)));
    const settings = { contextSize: 120, responseLength: 20, worldInfoPercent: 25 };
    const result = buildTestChatPrompt({ speakerId: "Alice", members: [alice], userName: "Tom", personaDescription: "", history, count, settings });
    expect(result.examplesIncluded).toBe(false);
    expect(result.droppedMessages).toBeGreaterThan(0);
    expect(result.droppedMessages).toBeLessThan(10);

    const roomy = buildTestChatPrompt({ speakerId: "Alice", members: [alice], userName: "Tom", personaDescription: "", history, count });
    expect(roomy.examplesIncluded).toBe(true);
    expect(roomy.messages[0].content).toContain("Alice: example words here");
  });
});

describe("cleanReply / stopSequencesFor", () => {
  it("drops the speaker's own name prefix and cuts where someone else's line starts", () => {
    expect(cleanReply("Alice: Hello!\nTom: hi\nAlice: more", "Alice", ["Tom", "Bob"])).toBe("Hello!");
    expect(cleanReply("*waves*\n\nbob: hey", "Alice", ["Tom", "Bob"])).toBe("*waves*");
    expect(cleanReply("No names here.", "Alice", ["Tom"])).toBe("No names here.");
  });

  it("builds newline-name stop sequences", () => {
    expect(stopSequencesFor(["Tom", " ", "Bob"])).toEqual(["\nTom:", "\nBob:"]);
  });
});
