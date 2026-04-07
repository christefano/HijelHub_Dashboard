# GitHub Traffic Dashboard

A self-hosted, static-site dashboard that aggregates GitHub traffic statistics (views, clones, referrers) and release download counts across multiple repositories into a single unified view.

> **⚠️ IMPORTANT: Always fork from the original repository at [github.com/HijelHub/HijelHub_Dashboard](https://github.com/HijelHub/HijelHub_Dashboard) to ensure you have the unmodified, verified version of the workflow and scripts. Do not fork from other users' forks, as their versions may contain modifications that could compromise your security.**

## Why?

- GitHub's built-in traffic data **expires after 14 days**
- There is **no native way** to view traffic across multiple repos on a single page
- Existing solutions require databases, servers, or paid services

This dashboard solves both problems using only GitHub's free tier: Actions, Pages, and the REST API.

## Features

- 📊 **Historical data preservation** — daily cron workflow accumulates traffic data beyond the 14-day API limit
- 📈 **Multi-repo overview** — view all your repos' traffic on one page
- 🔒 **Optional AES-256-GCM encryption** — encrypt traffic data at rest for public repos
- 🌓 **Light/dark mode** — toggle with persistent preference
- 📱 **Responsive** — works on desktop, tablet, and mobile
- 📥 **CSV export** — download per-repo traffic data
- 🎨 **Fully themeable** — customize colors, fonts, and branding via `theme.json`
- 🆓 **100% free** — runs entirely on GitHub Free tier

## Quick Setup

### 1. Fork this repository

Click **Fork** on the [original repository](https://github.com/HijelHub/HijelHub_Dashboard). Do NOT fork from anyone else's copy.

### 2. Create a Personal Access Token

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens?type=beta) → **Fine-grained tokens** → **Generate new token**
2. Set **Resource owner** to your personal account
3. Set **Repository access** to **All repositories**
4. Under **Permissions**, enable:
   - **Administration**: Read-only
   - **Metadata**: Read-only
5. Click **Generate token** and copy the value

> **Why Administration: Read?** GitHub gates the traffic API behind administrative access. Despite the name, read-only administration cannot modify any repository settings.

### 3. Add the token as a secret

1. Go to your forked repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `GHTRAFFIC_TOKEN`
4. Value: paste your token
5. Click **Add secret**

### 4. Configure your repos

Edit `config.json` and list the repositories you want to track:

```json
{
  "repos": [
    "your-username/your-repo",
    "your-org/another-repo"
  ]
}
```

You can track any repo you have write access to, including repos in organizations.

### 5. Enable GitHub Pages

1. Go to your forked repo → **Settings** → **Pages**
2. Set **Source** to **Deploy from a branch**
3. Set **Branch** to `main` and folder to `/ (root)`
4. Click **Save**

Your dashboard will be live at `https://your-username.github.io/HijelHub_Dashboard/`

### 6. Run the workflow

The workflow runs automatically every day at 23:00 UTC. To trigger it immediately:

1. Go to **Actions** → **Collect Traffic Data**
2. Click **Run workflow** → **Run workflow**

### 7. (Optional) Enable encryption

If your repository is public and you want to encrypt traffic data:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add a new secret named `ENCRYPT_KEY` with any password/passphrase
3. The next workflow run will automatically encrypt all data files
4. When you visit the dashboard, you'll be prompted to enter the password

### 8. (Optional) Customize the theme

Edit `theme.json` to change:

- `title` — dashboard title (shown in header and browser tab)
- `logo` — URL to a logo image (leave empty for default icon)
- `defaultMode` — `"light"` or `"dark"` for first-time visitors
- `defaultChartRange` — initial chart viewport: `"1month"`, `"3months"`, `"6months"`, `"12months"`, or `"all"`
- `fonts` — heading, body, and monospace font families (any Google Fonts family)
- `colors` — complete light and dark palettes

## Architecture

```
GitHub Traffic API
       │
       │ (PAT auth, daily cron)
       ▼
GitHub Actions runner
       │
       │ fetch → merge → (encrypt?) → commit
       ▼
Repository data/ directory
       │
       │ (served via GitHub Pages)
       ▼
User's browser
       │
       │ fetch JSON → (decrypt?) → render charts
       ▼
Dashboard UI
```

## Security

This project was designed with security as a primary concern:

| Concern | Mitigation |
|---|---|
| PAT exposure | Token lives only in Actions secrets — never in client-side code |
| Data in public repos | Optional AES-256-GCM encryption with PBKDF2 key derivation |
| Supply chain attacks | Only one third-party Action (`actions/checkout`, SHA-pinned) |
| Malicious PRs | Workflow triggers only on `schedule` + `workflow_dispatch` — no PR triggers |
| Token permissions | Fine-grained PAT with only Administration:Read + Metadata:Read |
| Password exposure | Entered client-side only, cached in `sessionStorage` (tab-scoped) |

## Troubleshooting

**Empty data on first run?**
The traffic API returns up to 14 days of historical data. If a repo is new or has very low traffic, some fields may be empty. Data will accumulate over subsequent runs.

**403 errors in the workflow?**
- Verify your PAT has **Administration: Read** and **Metadata: Read** permissions
- If tracking organization repos, ensure your PAT's resource owner has access and the org hasn't restricted fine-grained PATs
- Check that the token hasn't expired

**Charts are empty?**
- Confirm data files exist in the `data/` directory
- If encryption is enabled, make sure you enter the correct password

**Disabling encryption after enabling it?**
Removing the `ENCRYPT_KEY` secret means the workflow can no longer decrypt existing files. You'll need to either manually decrypt them or delete the `data/` directory to start fresh.

## File Structure

```
├── .github/workflows/collect-traffic.yml   # Daily cron workflow
├── scripts/
│   ├── fetch-traffic.js                    # API fetcher + merge logic
│   └── encrypt.js                          # AES-256-GCM encryption
├── assets/
│   ├── app.js                              # Dashboard rendering + CSV export
│   ├── crypto.js                           # Web Crypto API decryption
│   └── style.css                           # Theme variable bindings
├── data/                                   # Auto-populated traffic data
├── config.json                             # Repo list (edit this)
├── theme.json                              # Visual customization
├── index.html                              # Dashboard entry point
└── LICENSE                                 # Apache 2.0
```

## License

Copyright © 2026 Hijel. Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
