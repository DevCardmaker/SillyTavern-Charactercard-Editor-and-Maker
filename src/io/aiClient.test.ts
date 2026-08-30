import { describe, expect, it, vi } from "vitest";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const { requestFieldPatch, requestImagePrompt, requestLorebookEntries, testConnection } = await import("./aiClient");

const CONFIG = { baseUrl: "http://localhost:5001/", apiKey: "", model: "test-model" };

describe("requestFieldPatch", () => {
  it("returns a validated patch on a well-formed reply", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: JSON.stringify({ description: "A wanderer from the north." }),
    });

    const patch = await requestFieldPatch(CONFIG, ["description"], []);
    expect(patch).toEqual({ description: "A wanderer from the north." });

    const [, args] = mockInvoke.mock.calls[0] as [string, { req: Record<string, unknown> }];
    expect(args.req.base_url).toBe("http://localhost:5001");
    expect(args.req.api_key).toBeNull();
  });

  it("throws a readable error when the reply isn't valid JSON", async () => {
    mockInvoke.mockResolvedValueOnce({ content: "Sure, here's the description: ..." });
    await expect(requestFieldPatch(CONFIG, ["description"], [])).rejects.toThrow(/not valid JSON/);
  });

  it("throws a readable error when the reply doesn't match the schema", async () => {
    mockInvoke.mockResolvedValueOnce({ content: JSON.stringify({ tags: "not an array" }) });
    await expect(requestFieldPatch(CONFIG, ["tags"], [])).rejects.toThrow(/did not match/);
  });

  it("propagates a rejected invoke call", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Server responded with 500"));
    await expect(requestFieldPatch(CONFIG, ["description"], [])).rejects.toThrow(/500/);
  });
});

describe("requestLorebookEntries", () => {
  it("returns a validated list of entries on a well-formed reply", async () => {
    mockInvoke.mockResolvedValueOnce({
      content: JSON.stringify({ entries: [{ keys: ["Elara"], content: "The mother.", comment: "Mother Elara" }] }),
    });

    const entries = await requestLorebookEntries(CONFIG, []);
    expect(entries).toEqual([{ keys: ["Elara"], content: "The mother.", comment: "Mother Elara" }]);
  });

  it("throws a readable error when the reply isn't valid JSON", async () => {
    mockInvoke.mockResolvedValueOnce({ content: "not JSON" });
    await expect(requestLorebookEntries(CONFIG, [])).rejects.toThrow(/not valid JSON/);
  });

  it("throws a readable error when the reply doesn't match the schema", async () => {
    mockInvoke.mockResolvedValueOnce({ content: JSON.stringify({ entries: [{ keys: ["x"] }] }) });
    await expect(requestLorebookEntries(CONFIG, [])).rejects.toThrow(/did not match/);
  });
});

describe("requestImagePrompt", () => {
  it("returns the validated prompt string on a well-formed reply", async () => {
    mockInvoke.mockResolvedValueOnce({ content: JSON.stringify({ prompt: "a young woman with red hair" }) });

    const prompt = await requestImagePrompt(CONFIG, []);
    expect(prompt).toBe("a young woman with red hair");
  });

  it("throws a readable error when the reply isn't valid JSON", async () => {
    mockInvoke.mockResolvedValueOnce({ content: "not JSON" });
    await expect(requestImagePrompt(CONFIG, [])).rejects.toThrow(/not valid JSON/);
  });

  it("throws a readable error when the reply doesn't match the schema", async () => {
    mockInvoke.mockResolvedValueOnce({ content: JSON.stringify({ wrong_field: "x" }) });
    await expect(requestImagePrompt(CONFIG, [])).rejects.toThrow(/did not match/);
  });
});

describe("testConnection", () => {
  it("returns the raw reply content on success", async () => {
    mockInvoke.mockResolvedValueOnce({ content: '{"ok": true}' });

    const content = await testConnection(CONFIG);
    expect(content).toBe('{"ok": true}');

    const [, args] = mockInvoke.mock.calls[mockInvoke.mock.calls.length - 1] as [string, { req: Record<string, unknown> }];
    expect((args.req.messages as unknown[]).length).toBe(1);
  });

  it("propagates a rejected invoke call", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Connection failed"));
    await expect(testConnection(CONFIG)).rejects.toThrow(/Connection failed/);
  });
});
