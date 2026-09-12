import { getConfig } from "./settings.js";

/**
 * Replaces base44's `integrations.Core.InvokeLLM`. Since this feature isn't
 * actively used yet, it's a working stub rather than a full provider
 * integration — it returns a clearly-marked placeholder instead of silently
 * pretending to be a real model. Set LLM_PROVIDER/LLM_API_KEY (Admin → Setup,
 * or server/.env) when/if you're ready to use it for real.
 */
export async function invokeLLM(opts: {
  prompt: string;
  response_json_schema?: unknown;
}): Promise<{ output: string; stubbed: boolean }> {
  const [provider, apiKey] = await Promise.all([
    getConfig("LLM_PROVIDER"),
    getConfig("LLM_API_KEY"),
  ]);

  if (!provider || provider === "none" || !apiKey) {
    return {
      stubbed: true,
      output: "[LLM not configured — set it up in Admin → Setup]",
    };
  }

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: opts.prompt }],
      }),
    });
    const data = await res.json();
    return { stubbed: false, output: data.content?.[0]?.text ?? "" };
  }

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: opts.prompt }],
      }),
    });
    const data = await res.json();
    return { stubbed: false, output: data.choices?.[0]?.message?.content ?? "" };
  }

  return { stubbed: true, output: `[Unknown LLM_PROVIDER: ${provider}]` };
}
