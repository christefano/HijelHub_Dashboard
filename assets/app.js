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

const App = (() => {
  let theme = {};
  let rawDataFiles = [];
  let decryptedDataFiles = [];
  let chartInstances = [];

  // ── Helpers ──────────────────────────────────────────────────────────────

  function getCSS(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  function fmt(n) {
    return n != null ? n.toLocaleString() : "0";
  }

  /** Escapes a string for safe insertion into HTML */
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  /**
   * Formats a date string (YYYY-MM-DD) according to the theme dateFormat.
   * dateFormat is any arrangement of D, M, Y (e.g. "DMY", "MDY", "YMD").
   * Produces DD/MM/YY, MM/DD/YY, YY/MM/DD etc. with "/" separator.
   */
  function dateLabel(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(2);

    const format = parseDateFormat(theme.dateFormat);
    const parts = format.map((c) => {
      if (c === "D") return dd;
      if (c === "M") return mm;
      if (c === "Y") return yy;
      return dd;
    });
    return parts.join("/");
  }

  /**
   * Parses a dateFormat string (e.g. "DMY", "MDY", "YMD") into an array of
   * component letters [D, M, Y]. Falls back to ["D","M","Y"] if invalid.
   */
  function parseDateFormat(formatStr) {
    if (!formatStr || typeof formatStr !== "string") return ["D", "M", "Y"];
    const upper = formatStr.toUpperCase().replace(/[^DMY]/g, "");
    const chars = [];
    for (const c of upper) {
      if ((c === "D" || c === "M" || c === "Y") && !chars.includes(c)) {
        chars.push(c);
      }
    }
    if (chars.length !== 3) return ["D", "M", "Y"];
    return chars;
  }

  /**
   * Returns the start date string for the chart viewport.
   * defaultChartRange is a number of days (e.g. 30, 90, 180, 365).
   * 0 means show all data.
   */
  function rangeStartDate(rangeDays) {
    const days = typeof rangeDays === "number" ? rangeDays : parseInt(rangeDays, 10);
    if (!days || days <= 0) return null; // 0 or invalid = show all
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }

  // ── Theme ────────────────────────────────────────────────────────────────

  async function loadTheme() {
    try {
      const res = await fetch("theme.json");
      theme = await res.json();
    } catch {
      theme = {};
    }

    // Apply fonts
    const fonts = theme.fonts || {};
    const fontFamilies = [
      fonts.heading || "DM Sans",
      fonts.body || "DM Sans",
      fonts.mono || "JetBrains Mono",
    ];
    const uniqueFonts = [...new Set(fontFamilies)];
    const fontLink = document.getElementById("google-fonts");
    if (fontLink) {
      const families = uniqueFonts.map((f) => f.replace(/ /g, "+") + ":wght@400;500;600").join("&family=");
      fontLink.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
    }

    document.documentElement.style.setProperty("--font-h", `'${fonts.heading || "DM Sans"}', system-ui, sans-serif`);
    document.documentElement.style.setProperty("--font-b", `'${fonts.body || "DM Sans"}', system-ui, sans-serif`);
    document.documentElement.style.setProperty("--font-m", `'${fonts.mono || "JetBrains Mono"}', monospace`);

    // Title
    const title = theme.title || "Traffic Dashboard";
    document.title = title;
    const titleEl = document.getElementById("header-title");
    if (titleEl) titleEl.textContent = title;

    // Logo — use DOM API to avoid innerHTML XSS
    const logoContainer = document.getElementById("header-logo");
    if (logoContainer) {
      if (theme.logo) {
        logoContainer.innerHTML = "";
        const img = document.createElement("img");
        img.src = theme.logo;
        img.alt = "Logo";
        img.onerror = () => { logoContainer.style.display = "none"; };
        logoContainer.appendChild(img);
        logoContainer.className = "header-logo";
      } else {
        logoContainer.innerHTML = `<svg viewBox="0 0 16 16" fill="none"><rect x="2.5" y="9" width="3" height="5" rx="0.8" fill="white" opacity="0.55"/><rect x="6.5" y="5.5" width="3" height="8.5" rx="0.8" fill="white" opacity="0.75"/><rect x="10.5" y="2.5" width="3" height="11.5" rx="0.8" fill="white"/></svg>`;
        logoContainer.className = "header-logo-default";
      }
    }

    // Default mode
    const saved = localStorage.getItem("theme-mode");
    const mode = saved || theme.defaultMode || "light";
    applyMode(mode);
  }

  function applyMode(mode) {
    const colors = theme.colors || {};
    const palette = mode === "dark" ? colors.dark : colors.light;
    if (palette) {
      document.documentElement.style.setProperty("--bg", palette.bg);
      document.documentElement.style.setProperty("--bg2", palette.bgSecondary);
      document.documentElement.style.setProperty("--bg3", palette.bgTertiary);
      document.documentElement.style.setProperty("--tx", palette.text);
      document.documentElement.style.setProperty("--tx2", palette.textSecondary);
      document.documentElement.style.setProperty("--tx3", palette.textMuted);
      document.documentElement.style.setProperty("--accent", palette.accent);
      document.documentElement.style.setProperty("--accent-soft", palette.accentSoft);
      document.documentElement.style.setProperty("--border", palette.border);
      document.documentElement.style.setProperty("--chart1", palette.chartLine1);
      document.documentElement.style.setProperty("--chart2", palette.chartLine2);
      document.documentElement.style.setProperty("--shadow", palette.shadow);
    }
    document.documentElement.setAttribute("data-theme", mode === "dark" ? "dark" : "");
    localStorage.setItem("theme-mode", mode);
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const mode = isDark ? "light" : "dark";
    applyMode(mode);
    updateAllChartColors();
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  async function loadConfig() {
    try {
      const res = await fetch("config.json");
      return await res.json();
    } catch {
      return { repos: [] };
    }
  }

  async function loadDataFile(repoFullName) {
    const [owner, repo] = repoFullName.split("/");
    const filename = `${owner}--${repo}.json`;
    try {
      const res = await fetch(`data/${filename}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // ── Decrypt flow ─────────────────────────────────────────────────────────

  function hasEncryptedFiles() {
    return rawDataFiles.some((f) => f && f.format === "encrypted");
  }

  async function attemptDecrypt(password) {
    const errEl = document.getElementById("decrypt-err");
    if (!password) {
      errEl.textContent = "Please enter a password";
      return false;
    }

    try {
      const decrypted = [];
      for (const file of rawDataFiles) {
        if (!file) {
          decrypted.push(null);
          continue;
        }
        if (file.format === "encrypted") {
          const d = await DashCrypto.decryptDataFile(file, password);
          decrypted.push(d);
        } else {
          decrypted.push(file);
        }
      }
      decryptedDataFiles = decrypted;
      sessionStorage.setItem("dash-pw", password);
      document.getElementById("decrypt-modal").classList.add("hidden");
      return true;
    } catch {
      errEl.textContent = "Incorrect password. Please try again.";
      document.getElementById("decrypt-pw").value = "";
      document.getElementById("decrypt-pw").focus();
      return false;
    }
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  function showSkeleton(repos) {
    const main = document.getElementById("dashboard-content");
    let html = "";
    for (let i = 0; i < repos.length; i++) {
      html += `<div class="skeleton-row"><div class="skeleton skeleton-header"></div><div class="row g-3"><div class="col-md-4 col-12"><div class="skeleton skeleton-card"></div></div><div class="col-md-4 col-12"><div class="skeleton skeleton-card"></div></div><div class="col-md-4 col-12"><div class="skeleton skeleton-card"></div></div></div></div>`;
    }
    main.innerHTML = html;
  }

  function renderDashboard(config, dataFiles) {
    const main = document.getElementById("dashboard-content");
    chartInstances = [];
    let html = "";

    // Update header timestamp
    let latestUpdate = "";
    for (const f of dataFiles) {
      if (f && f.updated && f.updated > latestUpdate) latestUpdate = f.updated;
    }
    const updatedEl = document.getElementById("header-updated");
    if (updatedEl && latestUpdate) {
      const d = new Date(latestUpdate);
      updatedEl.textContent = `Updated ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} \u00b7 ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
    }

    for (let i = 0; i < config.repos.length; i++) {
      const repoFullName = config.repos[i];
      const data = dataFiles[i];
      const [owner, repo] = repoFullName.split("/");
      const idx = i;

      const forks = data ? data.forks || 0 : 0;
      const issues = data && data.issues ? data.issues : { closed: 0, open: 0 };
      const pullRequests = data && data.pullRequests ? data.pullRequests : { merged: 0, open: 0 };
      const views = data && data.data ? data.data.views || [] : [];
      const clones = data && data.data ? data.data.clones || [] : [];
      const referrers = data && data.data ? data.data.referrers || [] : [];

      // All-time totals for headline numbers
      const totalViews = views.reduce((s, v) => s + v.count, 0);
      const uniqueViews = views.reduce((s, v) => s + v.uniques, 0);
      const totalClones = clones.reduce((s, v) => s + v.count, 0);
      const uniqueClones = clones.reduce((s, v) => s + v.uniques, 0);

      const ownerEsc = esc(owner);
      const repoEsc = esc(repo);
      const ownerInitialEsc = esc(owner.charAt(0).toUpperCase());
      const repoUrl = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

      // Show error message if data file failed to load
      const dataError = !data;

      html += `
      <div class="repo-section">
        <div class="repo-header">
          <div class="repo-avatar">
            <img src="https://avatars.githubusercontent.com/${encodeURIComponent(owner)}?s=60" alt="" onerror="this.style.display='none'; this.parentElement.textContent='${ownerInitialEsc}'">
          </div>
          <a class="repo-name" href="${repoUrl}" target="_blank" rel="noopener noreferrer">
            <span class="owner">${ownerEsc} /</span> ${repoEsc}
          </a>
          <a class="repo-badge" href="${repoUrl}/network/members" target="_blank" rel="noopener noreferrer" title="Forks">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 0-1.5 0v.878H6.75v-.878a2.25 2.25 0 1 0-1.5 0ZM8 13.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Zm0-8.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM4.25 5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm7.5 0a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM8 9v2.5"/></svg>
            ${fmt(forks)}
          </a>
          <a class="repo-badge" href="${repoUrl}/issues" target="_blank" rel="noopener noreferrer" title="Issues">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6"/><path d="M8 4.5v4M8 10.5v.5"/></svg>
            <span title="Closed issues">${fmt(issues.closed)}</span>
            <span class="badge-sep">/</span>
            <span class="${issues.open > 0 ? "badge-accent" : ""}" title="Open issues">${fmt(issues.open)}</span>
          </a>
          <a class="repo-badge" href="${repoUrl}/pulls" target="_blank" rel="noopener noreferrer" title="Pull requests">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M10 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM6 7v6M10 5v4"/></svg>
            <span title="Merged PRs">${fmt(pullRequests.merged)}</span>
            <span class="badge-sep">/</span>
            <span class="${pullRequests.open > 0 ? "badge-accent" : ""}" title="Open PRs">${fmt(pullRequests.open)}</span>
          </a>
          <button class="csv-btn" data-repo-idx="${idx}" onclick="App.exportCSV(${idx})"${dataError ? " disabled" : ""}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12V14H12V12M8 2V10M5 7L8 10L11 7"/></svg>
            CSV
          </button>
        </div>
        <div class="row g-3">
          <!-- Visitors -->
          <div class="col-md-4 col-12">
            <div class="card-dash">
              <div class="card-label">Visitors</div>
              ${dataError
                ? '<div class="no-data-msg">Data not yet collected</div>'
                : `<div class="card-value">${fmt(totalViews)}</div>
              <div class="card-sub"><strong>${fmt(uniqueViews)}</strong> unique</div>
              <div class="chart-wrap"><canvas id="visitors-${idx}"></canvas></div>
              <div class="chart-controls">
                <div class="chart-legend">
                  <div class="chart-legend-item"><div class="legend-line" style="border-color:var(--chart1)"></div>Total</div>
                  <div class="chart-legend-item"><div class="legend-line dashed" style="border-color:var(--chart2)"></div>Unique</div>
                </div>
                <button class="chart-reset" onclick="App.resetZoom('visitors-${idx}')">Reset zoom</button>
              </div>`}
            </div>
          </div>
          <!-- Clones -->
          <div class="col-md-4 col-12">
            <div class="card-dash">
              <div class="card-label">Clones</div>
              ${dataError
                ? '<div class="no-data-msg">Data not yet collected</div>'
                : `<div class="card-value">${fmt(totalClones)}</div>
              <div class="card-sub"><strong>${fmt(uniqueClones)}</strong> unique</div>
              <div class="chart-wrap"><canvas id="clones-${idx}"></canvas></div>
              <div class="chart-controls">
                <div class="chart-legend">
                  <div class="chart-legend-item"><div class="legend-line" style="border-color:var(--chart1)"></div>Total</div>
                  <div class="chart-legend-item"><div class="legend-line dashed" style="border-color:var(--chart2)"></div>Unique</div>
                </div>
                <button class="chart-reset" onclick="App.resetZoom('clones-${idx}')">Reset zoom</button>
              </div>`}
            </div>
          </div>
          <!-- Referrers / Releases -->
          <div class="col-md-4 col-12">
            <div class="card-dash" id="card3-${idx}">
              <div class="tabs">
                <div class="tab active" onclick="App.switchTab('card3-${idx}','ref')">Referrers</div>
                <div class="tab" onclick="App.switchTab('card3-${idx}','rel')">Releases</div>
              </div>
              <div class="tab-content ref">
                ${dataError ? '<div class="no-data-msg">Data not yet collected</div>' : renderReferrersTable(referrers)}
              </div>
              <div class="tab-content rel" style="display:none" id="releases-${idx}">
                <div class="no-data-msg">Loading releases\u2026</div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    }

    main.innerHTML = html;

    // Create charts (skip for repos with no data)
    for (let i = 0; i < config.repos.length; i++) {
      const data = dataFiles[i];
      if (!data || !data.data) continue;
      const views = data.data.views || [];
      const clones = data.data.clones || [];

      createChart(`visitors-${i}`, views);
      createChart(`clones-${i}`, clones);
    }

    // Render releases from data files (fetched by cron, not client-side)
    for (let i = 0; i < config.repos.length; i++) {
      const data = dataFiles[i];
      const container = document.getElementById(`releases-${i}`);
      if (!container) continue;
      const releases = data && data.data && data.data.releases ? data.data.releases : [];
      if (releases.length === 0) {
        container.innerHTML = '<div class="no-data-msg">No releases</div>';
      } else {
        let rows = "";
        for (const r of releases) {
          rows += `<tr><td>${esc(r.tag)}</td><td>${fmt(r.downloads)}</td></tr>`;
        }
        container.innerHTML = `<div class="ref-scroll-container"><table class="ref-table"><thead><tr><th>Release</th><th>Downloads</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      }
    }
  }

  function renderReferrersTable(referrers) {
    if (referrers.length === 0) {
      return '<div class="no-data-msg">No referrer data yet</div>';
    }
    let rows = "";
    for (const r of referrers) {
      rows += `<tr><td>${esc(r.referrer)}</td><td>${fmt(r.count)}</td><td>${fmt(r.uniques)}</td></tr>`;
    }
    return `<div class="ref-scroll-container"><table class="ref-table"><thead><tr><th>Site</th><th>Visits</th><th>Unique</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ── Charts ───────────────────────────────────────────────────────────────

  function createChart(canvasId, dataPoints) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const labels = dataPoints.map((d) => dateLabel(d.date));
    const totals = dataPoints.map((d) => d.count);
    const uniques = dataPoints.map((d) => d.uniques);

    // Compute initial viewport using days-based range
    const defaultRange = theme.defaultChartRange;
    const minDate = rangeStartDate(defaultRange);
    let minIdx = 0;
    if (minDate && dataPoints.length > 0) {
      for (let i = 0; i < dataPoints.length; i++) {
        if (dataPoints[i].date >= minDate) { minIdx = i; break; }
      }
    }

    const zoomOptions = {};
    if (typeof ChartZoom !== "undefined" || (Chart.registry && Chart.registry.getPlugin("zoom"))) {
      zoomOptions.zoom = {
        wheel: { enabled: true },
        pinch: { enabled: true },
        mode: "x",
      };
      zoomOptions.pan = {
        enabled: true,
        mode: "x",
      };
    }

    // Read font families from theme CSS vars for tooltip consistency
    const tooltipHeadingFont = getCSS("--font-h") || "'DM Sans', system-ui, sans-serif";
    const tooltipMonoFont = getCSS("--font-m") || "'JetBrains Mono', monospace";

    const chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Total",
            data: totals,
            borderColor: getCSS("--chart1"),
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: getCSS("--chart1"),
            pointHoverBackgroundColor: getCSS("--chart1"),
            tension: 0.3,
            fill: false,
          },
          {
            label: "Unique",
            data: uniques,
            borderColor: getCSS("--chart2"),
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: getCSS("--chart2"),
            pointHoverBackgroundColor: getCSS("--chart2"),
            tension: 0.3,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(0,0,0,0.8)",
            titleFont: { family: tooltipHeadingFont, size: 12, weight: "500" },
            bodyFont: { family: tooltipMonoFont, size: 11 },
            padding: 10,
            cornerRadius: 6,
            displayColors: true,
            boxWidth: 8,
            boxHeight: 2,
            boxPadding: 4,
            callbacks: {
              title: (items) => items[0].label,
              label: (item) => ` ${item.dataset.label}: ${item.formattedValue}`,
            },
          },
          zoom: zoomOptions,
        },
        scales: {
          x: {
            ticks: {
              color: getCSS("--tx3"),
              font: { family: tooltipMonoFont, size: 9 },
              maxRotation: 0,
              maxTicksLimit: 6,
            },
            grid: { color: getCSS("--border"), lineWidth: 0.5 },
            border: { display: false },
            min: minIdx > 0 ? labels[minIdx] : undefined,
          },
          y: {
            ticks: {
              color: getCSS("--tx3"),
              font: { family: tooltipMonoFont, size: 9 },
              maxTicksLimit: 4,
            },
            grid: { color: getCSS("--border"), lineWidth: 0.5 },
            border: { display: false },
            beginAtZero: true,
          },
        },
      },
    });

    chartInstances.push({ id: canvasId, chart, defaultMinIdx: minIdx, labels });
  }

  function updateAllChartColors() {
    for (const { chart } of chartInstances) {
      chart.options.scales.x.ticks.color = getCSS("--tx3");
      chart.options.scales.y.ticks.color = getCSS("--tx3");
      chart.options.scales.x.grid.color = getCSS("--border");
      chart.options.scales.y.grid.color = getCSS("--border");
      chart.data.datasets[0].borderColor = getCSS("--chart1");
      chart.data.datasets[0].pointBackgroundColor = getCSS("--chart1");
      chart.data.datasets[0].pointHoverBackgroundColor = getCSS("--chart1");
      chart.data.datasets[1].borderColor = getCSS("--chart2");
      chart.data.datasets[1].pointBackgroundColor = getCSS("--chart2");
      chart.data.datasets[1].pointHoverBackgroundColor = getCSS("--chart2");
      chart.update("none");
    }
  }

  function resetZoom(canvasId) {
    const entry = chartInstances.find((c) => c.id === canvasId);
    if (!entry) return;
    const { chart, defaultMinIdx, labels } = entry;
    if (chart.resetZoom) {
      chart.resetZoom();
    }
    chart.options.scales.x.min = defaultMinIdx > 0 ? labels[defaultMinIdx] : undefined;
    chart.update();
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────

  function switchTab(cardId, type) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    card.querySelectorAll(".tab-content").forEach((c) => (c.style.display = "none"));
    if (type === "ref") {
      card.querySelector(".tab:first-child").classList.add("active");
      card.querySelector(".tab-content.ref").style.display = "block";
    } else {
      card.querySelector(".tab:last-child").classList.add("active");
      card.querySelector(".tab-content.rel").style.display = "block";
    }
  }

  // ── CSV export ───────────────────────────────────────────────────────────

  function exportCSV(repoIdx) {
    const data = decryptedDataFiles[repoIdx] || rawDataFiles[repoIdx];
    if (!data || !data.data) return;

    const repoName = data.repo.replace("/", "--");
    const today = new Date().toISOString().slice(0, 10);
    const filename = `${repoName}--traffic--${today}.csv`;

    const views = data.data.views || [];
    const clones = data.data.clones || [];
    const referrers = data.data.referrers || [];

    // Merge views and clones by date
    const dateMap = new Map();
    for (const v of views) {
      dateMap.set(v.date, { views: v.count, unique_views: v.uniques, clones: 0, unique_clones: 0 });
    }
    for (const c of clones) {
      const existing = dateMap.get(c.date) || { views: 0, unique_views: 0, clones: 0, unique_clones: 0 };
      existing.clones = c.count;
      existing.unique_clones = c.uniques;
      dateMap.set(c.date, existing);
    }

    // Use ISO dates (YYYY-MM-DD) in CSV for machine-readability
    const sortedDates = [...dateMap.keys()].sort();
    let csv = "date,views,unique_views,clones,unique_clones\n";
    for (const date of sortedDates) {
      const d = dateMap.get(date);
      csv += `${date},${d.views},${d.unique_views},${d.clones},${d.unique_clones}\n`;
    }

    // Add referrers section
    if (referrers.length > 0) {
      csv += "\nreferrer,count,uniques\n";
      for (const r of referrers) {
        csv += `${r.referrer},${r.count},${r.uniques}\n`;
      }
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    // Delay revoke to allow the download to start in all browsers
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    await loadTheme();

    const config = await loadConfig();
    if (config.repos.length === 0) {
      document.getElementById("dashboard-content").innerHTML =
        '<div class="no-data-msg" style="padding:48px 0">No repositories configured. Edit <code>config.json</code> to add repos.</div>';
      return;
    }

    showSkeleton(config.repos);

    // Load all data files
    rawDataFiles = await Promise.all(config.repos.map(loadDataFile));

    // Check encryption
    if (hasEncryptedFiles()) {
      // Try sessionStorage cache first
      const cachedPw = sessionStorage.getItem("dash-pw");
      if (cachedPw) {
        const ok = await attemptDecrypt(cachedPw);
        if (!ok) {
          sessionStorage.removeItem("dash-pw");
          document.getElementById("decrypt-modal").classList.remove("hidden");
          return;
        }
      } else {
        document.getElementById("decrypt-modal").classList.remove("hidden");
        return;
      }
    } else {
      decryptedDataFiles = rawDataFiles;
    }

    renderDashboard(config, decryptedDataFiles);
  }

  // Public decrypt handler — called after modal password entry
  async function handleDecrypt() {
    const pw = document.getElementById("decrypt-pw").value;
    const ok = await attemptDecrypt(pw);
    if (ok) {
      const config = await loadConfig();
      renderDashboard(config, decryptedDataFiles);
    }
  }

  return {
    init,
    toggleTheme,
    switchTab,
    resetZoom,
    exportCSV,
    handleDecrypt,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
