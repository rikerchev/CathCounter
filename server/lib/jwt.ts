import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface AuthTokenPayload {
  sub: string; // user id
  email: string;
  role: string;
}

const EXPIRES_IN = "30d";

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}
