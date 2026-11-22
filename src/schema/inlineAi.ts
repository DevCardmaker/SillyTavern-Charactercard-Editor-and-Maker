import type { AiChatMessage } from "./aiPrompt";
import { promptText, type PromptKey } from "./promptTexts";
import { detectStoryLanguage } from "./storyToCards";
import { protectedTokens } from "./translateCard";

/** The quick actions above a text field. Each one is a prompt section, so its wording can be
 * changed in the prompts file like every other prompt. */
export type InlineActionId = "enhance" | "rephrase" | "shorten" | "lengthen" | "fix" | "deslop" | "vivid" | "emotion";

export const INLINE_ACTIONS: { id: InlineActionId; label: string; title: string; prompt: PromptKey; main: boolean }[] = [
  { id: "enhance", label: "Enhance", title: "Make the text better without changing what it says", prompt: "inline_enhance", main: true },
  { id: "rephrase", label: "Rephrase", title: "Say the same in other words", prompt: "inline_rephrase", main: true },
  { id: "shorten", label: "Shorten", title: "Say the same in fewer words", prompt: "inline_shorten", main: true },
  { id: "lengthen", label: "Lengthen", title: "Add detail in the same spirit", prompt: "inline_lengthen", main: true },
  { id: "fix", label: "Fix", title: "Fix spelling, grammar and punctuation only", prompt: "inline_fix", main: true },
  { id: "deslop", label: "Less AI slop", title: "Replace worn-out AI phrases with plain, concrete wording", prompt: "inline_deslop", main: true },
  { id: "vivid", label: "Vivid", title: "More concrete, sensory detail", prompt: "inline_vivid", main: false },
  { id: "emotion", label: "Emotion", title: "Show more of the feelings", prompt: "inline_emotion", main: false },
];

/** What the request works on: the selected part, or the whole field when nothing is selected. */
export interface InlineTarget {
  start: number;
  end: number;
  part: string;
  selected: boolean;
}

export function inlineTarget(text: string, start: number, end: number): InlineTarget {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(text.length, Math.max(start, end));
  if (from === to || !text.slice(from, to).trim()) return { start: 0, end: text.length, part: text, selected: false };
  return { start: from, end: to, part: text.slice(from, to), selected: true };
}

export interface InlineRequest {
  fieldLabel: string;
  /** The whole field as it is now. */
  text: string;
  target: InlineTarget;
  instruction: string;
  /** What the AI may know about the character (the AI Context selection), may be empty. */
  context: string;
  /** Said once more after a reply the code rejected. */
  problem?: string;
}

export function buildInlineMessages(req: InlineRequest): AiChatMessage[] {
  // A short selection says little about the language; the whole field says more.
  const language = detectStoryLanguage(req.target.part) ?? detectStoryLanguage(req.text);
  const system = [
    promptText("inline_system"),
    // Output format stays in code: the reply replaces the text as it is.
    "Reply with only the new text that replaces it — no quotes around it, no heading, no comment, no explanation.",
  ].join("\n\n");

  const parts: string[] = [];
  if (req.context.trim()) parts.push(`About the character (for context only, don't repeat it):\n${req.context.trim()}`);
  if (req.target.selected) {
    parts.push(`The whole "${req.fieldLabel}" field, for context only:\n<<<\n${req.text}\n>>>`);
    parts.push(`Rewrite only this part of it:\n<<<\n${req.target.part}\n>>>`);
    parts.push("Your text goes back in exactly that place, so it must fit with the text before and after it.");
  } else {
    parts.push(`The "${req.fieldLabel}" field:\n<<<\n${req.target.part}\n>>>`);
  }
  parts.push(`Instruction: ${req.instruction.trim()}`);
  parts.push(
    language
      ? `Write in ${language}, like the text. Keep macros like {{char}} and {{user}} exactly as they are.`
      : "Write in the language of the text. Keep macros like {{char}} and {{user}} exactly as they are.",
  );
  if (req.problem) parts.push(`Your last answer could not be used: ${req.problem}. Try again.`);
  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n\n") },
  ];
}

/** Takes off what models like to wrap around the text: a code fence, the <<< >>> markers from the
 * request, a lead-in line ("Here is the improved text:") and quotes around all of it. */
export function cleanInlineResult(raw: string, original: string): string {
  let text = raw.trim();
  const fence = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(text);
  if (fence) text = fence[1].trim();
  text = text.replace(/^<<<\s*\n?/, "").replace(/\n?\s*>>>$/, "").trim();
  const lines = text.split("\n");
  if (lines.length > 1 && /^(here('s| is)|sure|certainly|okay|hier ist|gerne)\b.*:\s*$/i.test(lines[0].trim())) {
    text = lines.slice(1).join("\n").trim();
  }
  const quoted = /^(["“„«])([\s\S]*)(["”“»])$/.exec(text);
  const originalQuoted = /^["“„«][\s\S]*["”“»]$/.test(original.trim());
  if (quoted && !originalQuoted && !quoted[2].includes(quoted[1])) text = quoted[2].trim();
  return text;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Puts {{char}} back where the model wrote the character's name instead (it reads the name in the
 * context and "helpfully" fills it in — seen in every live test). Only when the field uses {{char}}
 * and never the name itself, so a text that names the character on purpose stays as it is.
 * "Lenas" becomes "{{char}}s", like SillyTavern cards write the possessive. */
export function restoreCharMacro(result: string, fieldText: string, charName: string): string {
  const name = charName.trim();
  if (!name || !fieldText.includes("{{char}}") || new RegExp(`(^|[^\\p{L}])${escapeRegExp(name)}`, "u").test(fieldText)) {
    return result;
  }
  return result.replace(new RegExp(`(^|[^\\p{L}])${escapeRegExp(name)}(?=s?(?![\\p{L}]))`, "gu"), "$1{{char}}");
}

/** Keeps the whitespace around a selected part: models drop leading/trailing spaces and line breaks,
 * which would glue the new text to its neighbours. */
export function keepSurroundingSpace(part: string, result: string): string {
  const lead = /^\s*/.exec(part)?.[0] ?? "";
  const trail = /\s*$/.exec(part)?.[0] ?? "";
  return `${lead}${result.trim()}${trail}`;
}

const plain = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

/** Why a reply can't be used as it is, or null. Checked by the code, since small models often
 * ignore exactly these rules. */
export function inlineProblem(action: InlineActionId | "custom", original: string, result: string): string | null {
  if (!result.trim()) return "it came back empty";
  if (protectedTokens(original).join(" ") !== protectedTokens(result).join(" ")) {
    return "macros like {{char}}/{{user}} or tags like <START> got lost or changed";
  }
  const before = original.trim().length;
  const after = result.trim().length;
  if (action === "shorten" && after >= before) return "it is not shorter than before";
  if (action === "shorten" && after > before * 0.9) return "it is only a little shorter — cut more";
  if (action === "lengthen" && after <= before) return "it is not longer than before";
  if (action !== "fix" && action !== "custom" && plain(original) === plain(result) && before >= 20) {
    return "it came back unchanged";
  }
  if (action !== "shorten" && action !== "custom" && after < before * 0.4) return "it is much shorter than before — probably cut off";
  // The detection needs about 20 words; shorter texts pass unchecked.
  const from = detectStoryLanguage(original);
  const to = from ? detectStoryLanguage(result) : null;
  if (from && to && from !== to) return `it is in ${to} instead of ${from}`;
  return null;
}

/** The field with the target replaced. */
export function applyInline(text: string, target: InlineTarget, replacement: string): string {
  return `${text.slice(0, target.start)}${replacement}${text.slice(target.end)}`;
}
