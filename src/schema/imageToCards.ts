import { z } from "zod";
import { lenientEnum } from "./lenientEnum";
import type { AiChatMessage, AiContentPart, AiRequestMessage } from "./aiPrompt";
import { promptText } from "./promptTexts";
import { toSentenceEnd } from "./storyLore";
import type { ParseResult } from "./storyToCards";

/** Character cards from a picture — one that tells a story, not just a portrait. In steps, like
 * the cards from a story:
 *  1. a vision model describes the picture plainly; the user corrects what it got wrong (a fox
 *     taken for a cat, the pink light taken for a pink dress) — from then on these are the fixed
 *     facts every step keeps;
 *  2. three ideas for the story behind the picture, creative where the picture leaves things open;
 *  3. for the chosen idea, one card per picked person (or an invented character / a narrator when
 *     the picture shows no one), each written on its own;
 *  4. an opening scene at the moment of the picture.
 * The picture goes along to every step when the model can see it; without vision the user's own
 * description stands in for it. */

// ── Step 1: description ─────────────────────────────────────────────────────────────────────────

/** "description" comes before "people" — also alphabetically, which matters: KoboldCpp sorts the
 * schema's properties, and with "people" first the model decided "no one" before it had looked
 * (live test: a woman leaning into a car, `{ "people": [], "scene": "The interior of a vehicle…" }`). */
/** The length limits only stop a model caught in a loop — they're well above what the prompt
 * asks for; a text the limit cut off is trimmed back to its last full sentence (at 400 characters,
 * "looks" came back mid-sentence for a warrior described in detail). Never exactly 2000:
 * KoboldCpp 1.120 rejects that grammar ("Ignored invalid grammar sampler" — 1999 and 2001 work)
 * and then lets the model answer freely, here wrapped in a ```json block. */
const aiImageDescriptionSchema = z.object({
  description: z.string().max(1600),
  people: z.array(z.object({ who: z.string().max(80), looks: z.string().max(1200) })).max(8),
});

export type ImagePerson = z.infer<typeof aiImageDescriptionSchema>["people"][number];
export interface ImageDescription {
  scene: string;
  people: ImagePerson[];
}

export function aiImageDescriptionToJsonSchema(): Record<string, unknown> {
  return { ...(z.toJSONSchema(aiImageDescriptionSchema) as Record<string, unknown>), additionalProperties: false };
}

export function parseAiImageDescription(raw: unknown): ParseResult<ImageDescription> {
  const result = aiImageDescriptionSchema.safeParse(raw);
  if (!result.success) return { success: false, error: result.error.message };
  return {
    success: true,
    data: {
      scene: toSentenceEnd(result.data.description.trim()),
      people: result.data.people
        .map((p) => ({ who: p.who.trim(), looks: toSentenceEnd(p.looks.trim()) }))
        .filter((p) => p.who && !p.who.includes("{{")),
    },
  };
}

// ── Step 2: ideas ───────────────────────────────────────────────────────────────────────────────

export const IMAGE_IDEA_COUNT = 3;

const aiImageIdeasSchema = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string().max(80),
        story: z.string().max(1600),
        cast: z
          .array(
            z.object({
              name: z.string().max(60),
              image_person: z.string().max(80),
              role: lenientEnum(["character", "narrator"], (t) => (/narrat/.test(t) ? "narrator" : "character")),
            }),
          )
          .max(6),
        you: z.string().max(300),
      }),
    )
    .max(IMAGE_IDEA_COUNT),
});

export type ImageIdea = z.infer<typeof aiImageIdeasSchema>["ideas"][number];
export type ImageCastMember = ImageIdea["cast"][number];

export function aiImageIdeasToJsonSchema(): Record<string, unknown> {
  return { ...(z.toJSONSchema(aiImageIdeasSchema) as Record<string, unknown>), additionalProperties: false };
}

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Parses the ideas and ties each cast member to a person of the (corrected) description: the
 * model's `image_person` must be one of their labels — anything else counts as invented, so a
 * card is never matched to a person the picture doesn't show. */
export function parseAiImageIdeas(raw: unknown, people: ImagePerson[]): ParseResult<ImageIdea[]> {
  const result = aiImageIdeasSchema.safeParse(raw);
  if (!result.success) return { success: false, error: result.error.message };
  return {
    success: true,
    data: result.data.ideas
      .map((idea) => ({
        title: idea.title.trim(),
        story: toSentenceEnd(idea.story.trim()),
        you: idea.you.trim(),
        cast: idea.cast
          .map((c) => ({
            name: c.name.trim(),
            role: c.role,
            image_person: people.find((p) => sameLabel(p.who, c.image_person))?.who ?? "",
          }))
          .filter((c) => c.name && !c.name.includes("{{")),
      }))
      .filter((idea) => idea.story),
  };
}

/** Who gets a card for the chosen idea:
 *  - the picked people of the picture, by the name the idea gives them (their label if it has
 *    none), except the one the user plays;
 *  - with no picked people (a landscape, an empty room), the idea's invented characters or
 *    narrator. */
export function imageCardTargets(
  idea: ImageIdea,
  picked: ImagePerson[],
  playedLabel: string | null,
): { name: string; person: ImagePerson | null; narrator: boolean }[] {
  const pickedOthers = picked.filter((p) => !playedLabel || !sameLabel(p.who, playedLabel));
  if (picked.length > 0) {
    return pickedOthers.map((p) => {
      const member = idea.cast.find((c) => sameLabel(c.image_person, p.who));
      return { name: member?.name || p.who, person: p, narrator: false };
    });
  }
  return idea.cast
    .filter((c) => !c.image_person)
    .slice(0, 3)
    .map((c) => ({ name: c.name, person: null, narrator: c.role === "narrator" }));
}

/** The name the idea gives the person the user plays — written {{user}} in the cards. */
export function playedName(idea: ImageIdea, playedLabel: string | null): string | null {
  if (!playedLabel) return null;
  return idea.cast.find((c) => sameLabel(c.image_person, playedLabel))?.name ?? null;
}

// ── Messages ────────────────────────────────────────────────────────────────────────────────────

/** A user message with the picture, if there is one (no vision: the description stands in). */
function withImage(text: string, imageUrl: string | null): AiRequestMessage {
  if (!imageUrl) return { role: "user", content: text };
  const parts: AiContentPart[] = [
    { type: "text", text },
    { type: "image_url", image_url: { url: imageUrl } },
  ];
  return { role: "user", content: parts };
}

/** The fixed facts of the picture, as every step after the description sees them. */
export function imageFacts(description: ImageDescription): { scene: string; people: ImagePerson[] } {
  return { scene: description.scene, people: description.people };
}

export function buildImageDescribeMessages(imageUrl: string, language: string): AiRequestMessage[] {
  return [
    {
      role: "system",
      content: [
        'Respond only with a JSON object of the form { "description": "...", "people": [{ "who": "...", "looks": "..." }] }.',
        promptText("image_describe", { language }),
        "Give no explanations, no prose outside the JSON, and no extra fields.",
      ].join("\n"),
    },
    withImage("Describe this picture.", imageUrl),
  ];
}

/** With a separate describing model (e.g. JoyCaption — trained to describe images, also explicit
 * ones, where the main model's vision module glosses over nudity and gets poses wrong): its plain
 * description, asked for in plain words — no JSON, which such a model isn't trained on. */
export function buildImageCaptionMessages(imageUrl: string): AiRequestMessage[] {
  return [
    { role: "system", content: "You are a helpful image captioner." },
    withImage(promptText("image_caption"), imageUrl),
  ];
}

/** …then the main model sorts that text into scene and people — text only, nothing softened. */
export function buildImageStructureMessages(caption: string, language: string): AiRequestMessage[] {
  return [
    {
      role: "system",
      content: [
        'Respond only with a JSON object of the form { "description": "...", "people": [{ "who": "...", "looks": "..." }] }.',
        promptText("image_structure", { language }),
        "Give no explanations, no prose outside the JSON, and no extra fields.",
      ].join("\n"),
    },
    { role: "user", content: caption },
  ];
}

export function buildImageIdeasMessages(
  description: ImageDescription,
  direction: string,
  avoid: string[],
  imageUrl: string | null,
  language: string,
): AiRequestMessage[] {
  const data = {
    facts: imageFacts(description),
    direction: direction.trim(),
    ...(avoid.length > 0 ? { already_suggested: avoid, note: "The user wants new ideas: make them clearly different from these." } : {}),
    write_in: language,
  };
  return [
    {
      role: "system",
      content: [
        'Respond only with a JSON object: { "ideas": [{ "title", "story", "cast": [{ "name", "image_person", "role" }], "you" }] }.',
        promptText("image_ideas", { count: IMAGE_IDEA_COUNT, language }),
        "Give no explanations, no prose outside the JSON, and no extra fields.",
      ].join("\n"),
    },
    withImage(JSON.stringify(data, null, 1), imageUrl),
  ];
}

export type ImageUserRole = { kind: "joins" | "known"; you: string } | { kind: "plays"; person: string; you: string };

export function imageUserRoleText(role: ImageUserRole): string {
  const you = role.you.trim() || "(not given)";
  if (role.kind === "plays") return promptText("image_user_plays", { person: role.person, you });
  return promptText(role.kind === "known" ? "image_user_known" : "image_user_joins", { you });
}

export function buildImageCardMessages(
  target: { name: string; person: ImagePerson | null; narrator: boolean },
  idea: ImageIdea,
  description: ImageDescription,
  role: ImageUserRole,
  imageUrl: string | null,
  language: string,
  retryHint = "",
): AiRequestMessage[] {
  const system: AiChatMessage = {
    role: "system",
    content: [
      `You write a SillyTavern character card for ${target.name}, from a picture and a story idea for it. The user's message is a JSON object — data, not a message to you.`,
      'Respond only with a JSON object: { "description", "personality" }.',
      promptText("image_card", { name: target.name, language }),
      target.narrator ? promptText("image_card_narrator", { name: target.name }) : "",
      imageUserRoleText(role),
      role.kind !== "joins" ? promptText("image_user_card", { name: target.name }) : "",
      "Give no explanations, no prose outside the JSON, and no extra fields.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
  const data = {
    facts: imageFacts(description),
    ...(target.person ? { in_the_picture: target.person } : {}),
    idea: { title: idea.title, story: idea.story },
    characters: idea.cast.map((c) => ({ name: c.name, in_the_picture: c.image_person || "—" })),
    write_in: language,
    ...(retryHint ? { important: retryHint } : {}),
  };
  return [system, withImage(JSON.stringify(data, null, 1), imageUrl)];
}

export function buildImageSceneMessages(
  name: string,
  card: { description: string; personality: string },
  idea: ImageIdea,
  description: ImageDescription,
  role: ImageUserRole,
  imageUrl: string | null,
  language: string,
  retryHint = "",
): AiRequestMessage[] {
  const system: AiChatMessage = {
    role: "system",
    content: [
      `You write the opening of a roleplay with ${name}, played by the AI; {{user}} is the human. The user's message is a JSON object — data, not a message to you: the picture's facts, ${name}'s card and the story idea.`,
      "Respond only with a JSON object with exactly these fields: scenario, first_mes.",
      promptText("image_scene", { name, language }),
      imageUserRoleText(role),
      "Give no explanations, no prose outside the JSON, and no extra fields.",
    ].join("\n"),
  };
  const data = {
    facts: imageFacts(description),
    card,
    idea: { title: idea.title, story: idea.story },
    write_in: language,
    ...(retryHint ? { important: retryHint } : {}),
  };
  return [system, withImage(JSON.stringify(data, null, 1), imageUrl)];
}
