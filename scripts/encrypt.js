// Copyright (c) 2026 Hijel. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, this software
// is provided "AS IS", WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
// express or implied. The author(s) accept no liability for any damages,
// loss, or consequences arising from the use or misuse of this software.
// See the License for the full terms governing permissions and limitations.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ENCRYPT_KEY = process.env.ENCRYPT_KEY;
if (!ENCRYPT_KEY) {
  console.log("ENCRYPT_KEY not set — skipping encryption.");
  process.exit(0);
}

const DATA_DIR = path.join(__dirname, "..", "data");
const ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16;

// ── Crypto helpers ───────────────────────────────────────────────────────────

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha256");
}

function encrypt(plaintext, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Append auth tag to ciphertext (GCM standard practice)
  const ciphertextWithTag = Buffer.concat([encrypted, authTag]);

  return {
    iv: iv.toString("base64"),
    salt: salt.toString("base64"),
    ciphertext: ciphertextWithTag.toString("base64"),
  };
}

function decrypt(ciphertextB64, ivB64, saltB64, password) {
  const salt = Buffer.from(saltB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const ciphertextWithTag = Buffer.from(ciphertextB64, "base64");

  // Last 16 bytes are the auth tag
  const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);

  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

// ── Main ─────────────────────────────────────────────────────────────────────

function processFile(filepath) {
  const filename = path.basename(filepath);
  let raw;

  try {
    raw = JSON.parse(fs.readFileSync(filepath, "utf8"));
  } catch {
    console.log(`  ⚠  Could not parse ${filename} — skipping.`);
    return;
  }

  let dataToEncrypt;

  if (raw.format === "plaintext") {
    // Encrypt the data object
    dataToEncrypt = JSON.stringify(raw.data);
  } else if (raw.format === "encrypted") {
    // Already encrypted — decrypt first to re-encrypt with potentially updated data
    // (The fetch step would have written plaintext if it could merge, so if it's
    //  still encrypted here, we just re-encrypt with a fresh IV/salt for rotation)
    try {
      const decrypted = decrypt(raw.ciphertext, raw.iv, raw.salt, ENCRYPT_KEY);
      dataToEncrypt = decrypted;
    } catch {
      console.log(`  ⚠  Could not decrypt ${filename} — password may have changed. Skipping.`);
      return;
    }
  } else {
    console.log(`  ⚠  Unknown format in ${filename} — skipping.`);
    return;
  }

  const { iv, salt, ciphertext } = encrypt(dataToEncrypt, ENCRYPT_KEY);

  const encryptedFile = {
    format: "encrypted",
    repo: raw.repo,
    updated: raw.updated,
    forks: raw.forks,
    issues: raw.issues,
    pullRequests: raw.pullRequests,
    iv,
    salt,
    ciphertext,
  };

  fs.writeFileSync(filepath, JSON.stringify(encryptedFile, null, 2), "utf8");
  console.log(`  ✓  Encrypted ${filename}`);
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.log("No data directory found — nothing to encrypt.");
    return;
  }

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    console.log("No data files found — nothing to encrypt.");
    return;
  }

  console.log(`Encrypting ${files.length} data file(s)...`);

  for (const file of files) {
    processFile(path.join(DATA_DIR, file));
  }

  console.log("Done.");
}

main();
