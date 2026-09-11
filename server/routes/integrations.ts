import { sendEmail } from "../lib/email.ts";
import { invokeLLM } from "../lib/llm.ts";
import type { AuthUser } from "../middleware/auth.ts";
import { isAdmin } from "../middleware/auth.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleIntegrationsRoute(
  req: Request,
  path: string[], // ["send-email"] | ["invoke-llm"]
  user: AuthUser | null,
): Promise<Response> {
  if (!user) return json({ error: "Not authenticated" }, 401);
  const [action] = path;

  if (action === "send-email" && req.method === "POST") {
    // Only admins send arbitrary email from the client today (AdminAdRequests) —
    // tighten this further if a non-admin flow starts using it.
    if (!isAdmin(user)) return json({ error: "Forbidden" }, 403);
    const body = await req.json();
    await sendEmail(body);
    return json({ success: true });
  }

  if (action === "invoke-llm" && req.method === "POST") {
    const body = await req.json();
    const result = await invokeLLM(body);
    return json(result);
  }

  return json({ error: "Not found" }, 404);
}
