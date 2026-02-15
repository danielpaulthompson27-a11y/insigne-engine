import crypto from "crypto";

export function makeToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex"); // 48 chars
}
