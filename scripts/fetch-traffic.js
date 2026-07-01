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

const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const TOKEN = process.env.GHTRAFFIC_TOKEN;
if (!TOKEN) {
  console.log("No GHTRAFFIC_TOKEN set — skipping data collection.");
  process.exit(0);
}

const ENCRYPT_KEY = process.env.ENCRYPT_KEY || null;

const CONFIG_PATH = path.join(__dirname, "..", "config.json");
const DATA_DIR = path.join(__dirname, "..", "data");

// ── HTTP helper ──────────────────────────────────────────────────────────────

function apiGet(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: endpoint,
      method: "GET",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "github-traffic-dashboard",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Invalid JSON from ${endpoint}: ${body}`));
          }
        } else {
          reject(
            new Error(`API ${res.statusCode} for ${endpoint}: ${body.slice(0, 200)}`)
          );
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

// ── Decrypt helper ───────────────────────────────────────────────────────────

const ITERATIONS = 100000;
const KEY_LENGTH = 32;

function decryptData(ciphertextB64, ivB64, saltB64, password) {
  const salt = Buffer.from(saltB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const ciphertextWithTag = Buffer.from(ciphertextB64, "base64");

  const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);

  const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha256");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

// ── Merge helpers ────────────────────────────────────────────────────────────

function mergeDailyData(existing, incoming) {
  const map = new Map();
  for (const entry of existing) {
    map.set(entry.date, entry);
  }
  for (const entry of incoming) {
    const dateKey = entry.timestamp
      ? entry.timestamp.slice(0, 10)
      : entry.date;
    map.set(dateKey, {
      date: dateKey,
      count: entry.count,
      uniques: entry.uniques,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function mergeReferrers(existing, incoming) {
  const map = new Map();
  for (const entry of existing) {
    map.set(entry.referrer, { ...entry });
  }
  for (const entry of incoming) {
    const current = map.get(entry.referrer);
    if (current) {
      current.count = Math.max(current.count, entry.count);
      current.uniques = Math.max(current.uniques, entry.uniques);
    } else {
      map.set(entry.referrer, { ...entry });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function processRepo(repoFullName) {
  const [owner, repo] = repoFullName.split("/");
  const filename = `${owner}--${repo}.json`;
  const filepath = path.join(DATA_DIR, filename);

  console.log(`\n── ${repoFullName} ──`);

  // Load existing data
  let existing = { data: { views: [], clones: [], referrers: [] } };
  if (fs.existsSync(filepath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(filepath, "utf8"));
      if (raw.format === "encrypted") {
        if (ENCRYPT_KEY) {
          try {
            const decryptedJson = decryptData(raw.ciphertext, raw.iv, raw.salt, ENCRYPT_KEY);
            existing = { data: JSON.parse(decryptedJson) };
            console.log("  ✓  Decrypted existing data for merge.");
          } catch {
            console.log("  ⚠  Could not decrypt existing data — wrong key? Starting fresh.");
            existing = { data: { views: [], clones: [], referrers: [] } };
          }
        } else {
          console.log("  ⚠  Encrypted file detected but no ENCRYPT_KEY set — cannot merge. Starting fresh.");
          existing = { data: { views: [], clones: [], referrers: [] } };
        }
      } else {
        existing = raw;
      }
    } catch {
      console.log("  ⚠  Could not parse existing data file. Starting fresh.");
    }
  }

  // Fetch from API
  let repoMeta, views, clones, referrers, releases;
  try {
    [repoMeta, views, clones, referrers, releases] = await Promise.all([
      apiGet(`/repos/${owner}/${repo}`),
      apiGet(`/repos/${owner}/${repo}/traffic/views`),
      apiGet(`/repos/${owner}/${repo}/traffic/clones`),
      apiGet(`/repos/${owner}/${repo}/traffic/popular/referrers`),
      apiGet(`/repos/${owner}/${repo}/releases`),
    ]);
  } catch (err) {
    console.error(`  ✗  API error for ${repoFullName}: ${err.message}`);
    return;
  }

  // Fetch issue and PR counts via the search API (returns total_count without pagination)
  let closedIssues = 0, openIssues = 0, mergedPRs = 0, openPRs = 0;
  try {
    const [issuesClosed, issuesOpen, prsMerged, prsOpen] = await Promise.all([
      apiGet(`/search/issues?q=repo:${owner}/${repo}+is:issue+is:closed&per_page=1`),
      apiGet(`/search/issues?q=repo:${owner}/${repo}+is:issue+state:open&per_page=1`),
      apiGet(`/search/issues?q=repo:${owner}/${repo}+is:pr+is:merged&per_page=1`),
      apiGet(`/search/issues?q=repo:${owner}/${repo}+is:pr+state:open&per_page=1`),
    ]);
    closedIssues = issuesClosed.total_count || 0;
    openIssues = issuesOpen.total_count || 0;
    mergedPRs = prsMerged.total_count || 0;
    openPRs = prsOpen.total_count || 0;
  } catch (err) {
    console.log(`  ⚠  Could not fetch issue/PR counts: ${err.message}`);
  }

  console.log(`  Views: ${views.count} total, ${views.uniques} unique (${views.views?.length || 0} days)`);
  console.log(`  Clones: ${clones.count} total, ${clones.uniques} unique (${clones.clones?.length || 0} days)`);
  console.log(`  Referrers: ${referrers.length} sources`);
  console.log(`  Releases: ${Array.isArray(releases) ? releases.length : 0} found`);
  console.log(`  Issues: ${closedIssues} closed, ${openIssues} open`);
  console.log(`  PRs: ${mergedPRs} merged, ${openPRs} open`);
  console.log(`  Forks: ${repoMeta.forks_count}`);

  // Build releases summary (tag + total download count across all assets)
  const releaseSummary = Array.isArray(releases)
    ? releases.map((r) => ({
        tag: r.tag_name,
        downloads: (r.assets || []).reduce((sum, a) => sum + (a.download_count || 0), 0),
      }))
    : [];

  // Merge
  const mergedData = {
    format: "plaintext",
    repo: repoFullName,
    updated: new Date().toISOString(),
    forks: repoMeta.forks_count || 0,
    issues: { closed: closedIssues, open: openIssues },
    pullRequests: { merged: mergedPRs, open: openPRs },
    data: {
      views: mergeDailyData(existing.data.views || [], views.views || []),
      clones: mergeDailyData(existing.data.clones || [], clones.clones || []),
      referrers: mergeReferrers(existing.data.referrers || [], referrers || []),
      releases: releaseSummary,
    },
  };

  fs.writeFileSync(filepath, JSON.stringify(mergedData, null, 2), "utf8");
  console.log(`  ✓  Written to ${filename} (${mergedData.data.views.length} view days, ${mergedData.data.clones.length} clone days, ${mergedData.data.referrers.length} referrers)`);
}

async function main() {
  // Read config
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("Error: config.json not found.");
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  if (!config.repos || !Array.isArray(config.repos) || config.repos.length === 0) {
    console.error("Error: config.json has no repos listed.");
    process.exit(1);
  }

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log(`Processing ${config.repos.length} repo(s)...`);

  for (const repo of config.repos) {
    await processRepo(repo);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
