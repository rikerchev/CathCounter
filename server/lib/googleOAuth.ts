import { getConfig } from "./settings.ts";
import { env } from "../env.ts";

export async function isGoogleConfigured(): Promise<boolean> {
  const clientId = await getConfig("GOOGLE_CLIENT_ID");
  return Boolean(clientId);
}

export async function buildGoogleAuthUrl(state: string): Promise<string> {
  const [clientId, redirectUri] = await Promise.all([
    getConfig("GOOGLE_CLIENT_ID"),
    getConfig("GOOGLE_REDIRECT_URI"),
  ]);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri || env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const [clientId, clientSecret, redirectUri] = await Promise.all([
    getConfig("GOOGLE_CLIENT_ID"),
    getConfig("GOOGLE_CLIENT_SECRET"),
    getConfig("GOOGLE_REDIRECT_URI"),
  ]);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri || env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed: ${await tokenRes.text()}`);
  }
  const { access_token } = await tokenRes.json();

  const profileRes = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    { headers: { Authorization: `Bearer ${access_token}` } },
  );
  if (!profileRes.ok) {
    throw new Error(`Google userinfo fetch failed: ${await profileRes.text()}`);
  }
  return await profileRes.json();
}
