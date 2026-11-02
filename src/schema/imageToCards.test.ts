import { describe, expect, it } from "vitest";
import { messageText } from "./aiPrompt";
import {
  buildImageCaptionMessages,
  buildImageCardMessages,
  buildImageDescribeMessages,
  buildImageIdeasMessages,
  buildImageStructureMessages,
  type ImageIdea,
  imageCardTargets,
  imageUserRoleText,
  parseAiImageDescription,
  parseAiImageIdeas,
  playedName,
} from "./imageToCards";

const fox = { who: "the woman with fox ears", looks: "fox ears, white dress, pushing a luggage cart" };
const man = { who: "the man on the left", looks: "suit, holding a camera" };
const idea = (cast: ImageIdea["cast"]): ImageIdea => ({ title: "T", story: "S", you: "a hotel guest", cast });

describe("parseAiImageDescription", () => {
  it("trims and drops unnamed people and macros", () => {
    const parsed = parseAiImageDescription({ description: " A street. ", people: [{ who: " the fox girl ", looks: "ears" }, { who: "", looks: "x" }, { who: "{{user}}", looks: "x" }] });
    expect(parsed.success && parsed.data).toEqual({ scene: "A street.", people: [{ who: "the fox girl", looks: "ears" }] });
  });


  it("cuts a text the length limit stopped mid-sentence back to its last full sentence", () => {
    const parsed = parseAiImageDescription({ description: "A battlefield.", people: [{ who: "the warrior", looks: "Red hair. Holds a sword. She stands on the rocky ground with her body in" }] });
    expect(parsed.success && parsed.data.people[0].looks).toBe("Red hair. Holds a sword.");
  });
});

describe("parseAiImageIdeas", () => {
  it("ties cast members to people of the description, else counts them as invented", () => {
    const parsed = parseAiImageIdeas(
      {
        ideas: [
          {
            title: " Runaway ",
            story: "She flees.",
            you: "a guest",
            cast: [
              { name: "Rin", image_person: "THE WOMAN WITH FOX EARS", role: "character" },
              { name: "Kenji", image_person: "a man not in the picture", role: "character" },
            ],
          },
        ],
      },
      [fox],
    );
    expect(parsed.success && parsed.data[0].cast).toEqual([
      { name: "Rin", image_person: fox.who, role: "character" },
      { name: "Kenji", image_person: "", role: "character" },
    ]);
  });

  it("reads a role outside the schema as a character, unless it names a narrator", () => {
    const parsed = parseAiImageIdeas(
      {
        ideas: [
          {
            title: "Night shift",
            story: "She waits.",
            you: "a guest",
            cast: [
              { name: "Rin", image_person: "the woman with fox earS", role: "protagonist" },
              { name: "The Voice", image_person: "", role: "Narrator of the scene" },
              { name: "Mika", image_person: "" },
            ],
          },
        ],
      },
      [fox],
    );
    expect(parsed.success && parsed.data[0].cast.map((c) => c.role)).toEqual(["character", "narrator", "character"]);
  });
});

describe("imageCardTargets", () => {
  const twoPeople = idea([
    { name: "Rin", image_person: fox.who, role: "character" },
    { name: "Taro", image_person: man.who, role: "character" },
  ]);

  it("gives each picked person a card by the idea's name for them", () => {
    expect(imageCardTargets(twoPeople, [fox, man], null).map((t) => t.name)).toEqual(["Rin", "Taro"]);
  });

  it("leaves out the person the user plays, whose name becomes {{user}}", () => {
    expect(imageCardTargets(twoPeople, [fox, man], man.who).map((t) => t.name)).toEqual(["Rin"]);
    expect(playedName(twoPeople, man.who)).toBe("Taro");
  });

  it("falls back to the label when the idea gave a picked person no name", () => {
    expect(imageCardTargets(idea([]), [fox], null).map((t) => t.name)).toEqual([fox.who]);
  });

  it("uses the invented character or narrator for a picture without people", () => {
    const landscape = idea([
      { name: "The Keeper", image_person: "", role: "character" },
      { name: "The Coast", image_person: "", role: "narrator" },
    ]);
    expect(imageCardTargets(landscape, [], null)).toEqual([
      { name: "The Keeper", person: null, narrator: false },
      { name: "The Coast", person: null, narrator: true },
    ]);
  });
});

describe("messages", () => {
  const url = "data:image/jpeg;base64,AAAA";

  it("sends the picture as an image part and shows it as [image]", () => {
    const [, user] = buildImageDescribeMessages(url, "German");
    expect(Array.isArray(user.content)).toBe(true);
    expect(JSON.stringify(user.content)).toContain(url);
    expect(messageText(user)).toBe("Describe this picture.\n[image]");
  });

  it("sends text only without vision, with the facts and earlier ideas to avoid", () => {
    const [, user] = buildImageIdeasMessages({ scene: "A street.", people: [fox] }, "a star", ["Runaway"], null, "German");
    const data = JSON.parse(user.content as string);
    expect(data.facts.people).toEqual([fox]);
    expect(data.already_suggested).toEqual(["Runaway"]);
    expect(data.direction).toBe("a star");
  });

  it("asks a narrator card for the world and voice, and a known user for a relationship line", () => {
    const target = { name: "The Coast", person: null, narrator: true };
    const [system] = buildImageCardMessages(target, idea([]), { scene: "", people: [] }, { kind: "known", you: "a guest" }, null, "English");
    expect(system.content).toContain("narrator of this scene");
    expect(system.content).toContain("relationship to {{user}}");
    expect(imageUserRoleText({ kind: "plays", person: "Taro", you: "" })).toContain("{{user}} is Taro");
  });
});

describe("separate describing model", () => {
  it("asks the describer in plain words with the picture, and the main model to sort the text without the picture", () => {
    const [, caption] = buildImageCaptionMessages("data:image/jpeg;base64,AAAA");
    expect(messageText(caption)).toContain("without euphemisms");
    expect(messageText(caption)).toContain("[image]");
    const [system, user] = buildImageStructureMessages("A woman leans in through the car window.", "German");
    expect(system.content).toContain("Don't soften");
    expect(user.content).toBe("A woman leans in through the car window.");
  });
});
