import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const KEY_LEN = 32;

function keyFromMaster(masterHex: string): Buffer {
  const raw = Buffer.from(masterHex.replace(/\s/g, ""), "hex");
  if (raw.length === KEY_LEN) return raw;
  return scryptSync(masterHex, "mercury-cloud-console", KEY_LEN);
}

/** Returns hex: iv + authTag + ciphertext */
export function encryptSecret(plain: string, masterKeyHex: string): string {
  const key = keyFromMaster(masterKeyHex);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("hex");
}

export function getMasterKey(): string | null {
  return process.env.CONSOLE_ENCRYPTION_MASTER_KEY ?? null;
}

export function decryptSecret(cipherHex: string, masterKeyHex: string): string {
  const key = keyFromMaster(masterKeyHex);
  const buf = Buffer.from(cipherHex, "hex");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const data = buf.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
