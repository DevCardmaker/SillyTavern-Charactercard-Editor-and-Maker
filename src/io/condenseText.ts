import { buildCondenseSystemPrompt, buildCondenseUserTurn } from "../schema/aiPrompt";
import { looksCutOff, splitForCondense } from "../schema/condense";
import { type AiProviderConfig, requestFieldPatch } from "./aiClient";
import { concurrencyFor, mapConcurrent } from "./concurrency";

/** Condenses one text section by section — the same approach and prompt as the Condense panel
 * (see `splitForCondense` for why), for callers that shorten text outside a card field, e.g. one
 * person's part of a merged group card. A section whose result looks cut off stays as it was;
 * `kept` counts those. */
export async function condenseText(
  config: AiProviderConfig,
  field: "description" | "personality",
  text: string,
  target: number,
  count: (text: string) => number,
): Promise<{ text: string; kept: number }> {
  const pieces = splitForCondense(text, field, count);
  const outputs = pieces.map((p) => p.text);
  let kept = 0;
  const tasks = pieces.flatMap((piece, i) => (piece.condense ? [{ i, text: piece.text }] : []));
  await mapConcurrent(tasks, concurrencyFor(config), async ({ i, text: section }) => {
    const sectionTokens = count(section);
    const patch = await requestFieldPatch(config, [field], [
      { role: "system", content: buildCondenseSystemPrompt(field, sectionTokens, Math.round(sectionTokens * target)) },
      buildCondenseUserTurn(section),
    ]);
    const condensed = String(patch[field] ?? "");
    if (looksCutOff(section, condensed)) kept++;
    else outputs[i] = condensed.trim();
  });
  return { text: outputs.join(""), kept };
}
