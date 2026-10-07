import crypto from "crypto";
import { env } from "./env.js";

function getKey(): Buffer | null {
  if (!env.CREDENTIALS_SECRET) return null;
  // Derive a 32-byte key from arbitrary secret string
  return crypto.createHash("sha256").update(env.CREDENTIALS_SECRET, "utf8").digest();
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  if (!key) return `plain:${plain}`;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes256gcm:${iv.toString("base64")}:${ciphertext.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (stored.startsWith("plain:")) return stored.slice("plain:".length);

  const key = getKey();
  if (!key) {
    throw new Error("CREDENTIALS_SECRET is required to decrypt stored secrets");
  }

  const parts = stored.split(":");
  if (parts[0] !== "aes256gcm" || parts.length !== 4) {
    throw new Error("Invalid encrypted secret format");
  }
  const iv = Buffer.from(parts[1], "base64");
  const ciphertext = Buffer.from(parts[2], "base64");
  const tag = Buffer.from(parts[3], "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}
