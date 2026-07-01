# GitHub Traffic Dashboard

A self-hosted, static-site dashboard that aggregates GitHub traffic statistics (views, clones, referrers) and release download counts across multiple repositories into a single unified view.

<br> 

> [!IMPORTANT]
> Always fork from the original repository at [github.com/HijelHub/HijelHub_Dashboard](https://github.com/HijelHub/HijelHub_Dashboard) to ensure you have the unmodified, verified version of the workflow and scripts. Do not fork from other users' forks, as their versions may contain modifications that could compromise your security.

<br>

![Dashboard Example](example.png)

<br> 

### Use password "guest" to view the live demo at [https://hijelhub.github.io/Demo_Dashboard/](https://hijelhub.github.io/Demo_Dashboard/)

<br>

## Why?

- GitHub's built-in traffic data **expires after 14 days**
- There is **no native way** to view traffic across multiple repos on a single page
- Other dashboards have no data privacy options (unless paid)
- Existing solutions require databases, servers, or paid services

This dashboard solves all these problems using only GitHub's free tier: Actions, Pages, and the REST API.

## Features

- 📊 **Historical data preservation** — daily cron workflow accumulates traffic data beyond the 14-day API limit
- 📈 **Multi-repo overview** — view all your repos' traffic on one page, any repo you have write access to.
- 🔒 **Optional AES-256-GCM encryption** — encrypt traffic data at rest for public repos
- 🌓 **Light/dark mode** — toggle with persistent preference
- 📱 **Responsive** — works on desktop, tablet, and mobile
- 📥 **CSV export** — download per-repo traffic data
- 🎨 **Fully themeable** — customize colors, fonts, and branding via `theme.json`
- 🆓 **100% free** — runs entirely on GitHub Free tier

## Quick Setup

> [!NOTE]
> Setup Instructions assume you are working via the GitHub Web Interface.

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

> [!NOTE]
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

Your dashboard will be live at `https://your-username.github.io/HijelHub_Dashboard/` after a few minutes.

### 6. Enable and run the workflow

GitHub automatically disables scheduled workflows on forked repositories. You need to enable it manually:

1. Go to your forked repo → **Actions**
2. You will see a banner saying "Workflows aren't being run on this forked repository." Click **I understand my workflows, go ahead and enable them**
3. In the left sidebar, click **Collect Traffic Data**
4. Click **Enable workflow** if prompted
5. Click **Run workflow** → **Run workflow** to trigger the first data collection immediately

After this, the workflow will run automatically every day at 23:00 UTC. Your first run may take a minute — check the Actions tab to confirm it completed successfully.

> [!NOTE]
> **Changing the schedule:** The default 23:00 UTC cron time can be changed if you wish, edit the `cron` line in `.github/workflows/collect-traffic.yml`. For example, `"0 5 * * *"` runs at 05:00 UTC daily. Use [crontab.guru](https://crontab.guru) to build your expression.

### 7. (Optional) Enable encryption

If your want your traffic data to remain private:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add a new secret named `ENCRYPT_KEY` with any password/passphrase
3. The next workflow run will automatically encrypt all data files
4. When you visit the dashboard, you'll be prompted to enter the password

### 8. (Optional) Customize the theme

Edit `theme.json` to change:

- `title` — dashboard title (shown in header and browser tab)
- `logo` — URL to a logo image (leave empty for default icon)
- `defaultMode` — `"light"` or `"dark"` for first-time visitors
- `defaultChartRange` — number of days to show in the initial chart viewport (e.g. `30`, `90`, `180`, `365`). Set to `0` to show all available data.
- `dateFormat` — order of day/month/year in chart labels, tooltips, and CSV exports. Use any arrangement of the letters `D`, `M`, and `Y`: `"DMY"` (default, e.g. 06/04/26), `"MDY"` (e.g. 04/06/26), `"YMD"` (e.g. 26/04/06). This does not affect the "Updated" timestamp in the header.
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

This project was designed with security in mind:

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
│   ├── style.css                           # Theme variable bindings
│   ├── favicon.png                         # Browser tab icon (32×32)
│   ├── apple-touch-icon.png                # iOS home screen icon (180×180)
│   ├── icon-192.png                        # Android/PWA icon (192×192)
│   └── icon-512.png                        # Android/PWA splash icon (512×512)
├── data/                                   # Auto-populated traffic data
├── config.json                             # Repo list (edit this)
├── theme.json                              # Visual customization
├── manifest.json                           # Web app manifest (home screen icons)
├── index.html                              # Dashboard entry point
└── LICENSE                                 # Apache 2.0
```

## Support this Project

If you found this dashboard useful, your support would mean a lot!

<sub><img width="20" height="20" src="https://raw.githubusercontent.com/HijelHub/GitStrap_SVG_Icons/b674246b8f46d8bc2c75f3cf5cf395a370b86ae2/icons/purple/stripe.svg"></sub>  [Securely Donate with Stripe](https://buy.stripe.com/fZu8wQdt01Oi5wWdKycMM01)

If you are intending to use this dashboard commercially, your support is **expected**.

##

<br>
