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

const DashCrypto = (() => {
  const ITERATIONS = 100000;

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
  }

  async function decrypt(ciphertextB64, ivB64, saltB64, password) {
    const iv = b64ToBytes(ivB64);
    const salt = b64ToBytes(saltB64);
    const ciphertextWithTag = b64ToBytes(ciphertextB64);
    const key = await deriveKey(password, salt);

    // Web Crypto GCM expects ciphertext + auth tag concatenated (which is how we stored it)
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertextWithTag
    );

    return new TextDecoder().decode(decrypted);
  }

  async function decryptDataFile(fileObj, password) {
    const dataJson = await decrypt(
      fileObj.ciphertext,
      fileObj.iv,
      fileObj.salt,
      password
    );
    return {
      format: "plaintext",
      repo: fileObj.repo,
      updated: fileObj.updated,
      forks: fileObj.forks,
      issues: fileObj.issues,
      pullRequests: fileObj.pullRequests,
      data: JSON.parse(dataJson),
    };
  }

  return { decrypt, decryptDataFile };
})();
