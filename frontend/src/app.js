const API_BASE_URL = "/api";

const LOGO_SRC = "/claimshield-logo.png";
const root = document.getElementById("root");
const DEMO_USERS = [
  {
    username: "admin",
    password: "ClaimShield@2026",
    name: "Admin Investigator",
    role: "Fraud Operations Admin",
    access: "admin",
  },
];
const DEFAULT_USER = DEMO_USERS[0];

const state = {
  page: "dashboard",
  admin: JSON.parse(sessionStorage.getItem("claimshield_admin") || "null"),
  summary: null,
  liveSummary: null,
  liveOps: null,
  liveTimer: null,
  recentClaims: [],
  providers: [],
  claims: [],
  claimsFilter: "all",
  claimChecks: [],
  prediction: null,
  instantPrediction: null,
  payout: null,
  instantClaim: {
    claimAmount: 75000,
    patientAge: 52,
    claimStatus: "pending",
    providerSpecialty: "Cardiologist",
    patientState: "Karnataka",
    providerState: "Maharashtra",
    claimHasPayment: "N",
    providerPatientStateMismatch: "Y",
    providerRejectionRate: 0.24,
    averageClaimAmount: 42000,
    paymentLagDays: -3,
  },
  coverage: {
    policyLimit: 500000,
    claimAmount: 120000,
    deductible: 10000,
    copay: 10,
    alreadyUsed: 80000,
  },
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("en-US");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path) {
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`);
      if (response.ok) return response.json();
      if (![502, 503, 504].includes(response.status)) {
        throw new Error(`API request failed: ${response.status}`);
      }
    } catch (error) {
      if (attempt === 14) throw error;
    }
    await delay(2000);
  }

  throw new Error("API request failed after retries");
}

async function postRequest(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.json();
}

function saveAdminSession(admin) {
  state.admin = admin;
  if (admin) sessionStorage.setItem("claimshield_admin", JSON.stringify(admin));
  else sessionStorage.removeItem("claimshield_admin");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function initials(name) {
  return String(name || "User")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";
}

function riskBadge(value) {
  const isRisk = Number(value) === 1;
  return `<span class="risk-badge ${isRisk ? "high" : "low"}">${isRisk ? "Suspicious" : "Clear"}</span>`;
}

function riskLevelBadge(level) {
  const key = String(level || "").toLowerCase().replace(/\s+/g, "-");
  return `<span class="level-badge ${key}">${escapeHtml(level)}</span>`;
}

function fraudSignalTags(signals = []) {
  if (!signals.length) return `<span class="signal-tag neutral">No critical fraud pattern</span>`;
  return signals.map((signal) => `<span class="signal-tag ${escapeHtml(signal.type)}">${escapeHtml(signal.label)}</span>`).join("");
}

function formatTimestamp(value) {
  if (!value) return "Pending";
  const seconds = value._seconds ?? value.seconds;
  const date = seconds ? new Date(seconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? "Pending" : date.toLocaleString();
}

function displaySavedValue(value, fallback) {
  return value === undefined || value === null || value === "" ? fallback : value;
}

function statCard(label, value, tone = "neutral", key = "") {
  const id = key ? ` id="summary-${key}"` : "";
  return `<section class="stat-card ${tone}"><span>${label}</span><strong${id}>${value}</strong></section>`;
}

function liveMetricCard(key, label, value, note, tone = "neutral") {
  return `
    <section class="live-card ${tone}">
      <span>${label}</span>
      <strong id="live-${key}">${value}</strong>
      <small id="live-${key}-note">${note}</small>
    </section>`;
}

function createLiveOps(summary) {
  const todayBase = Math.max(1800, Math.round(summary.total_claims * 0.0156));
  const flagged = Math.round(todayBase * (summary.suspicious_rate / 100) * 0.24);
  const rejected = Math.round(flagged * 0.3);
  const approved = todayBase - flagged - rejected;

  return {
    claimsToday: todayBase,
    autoApproved: approved,
    flagged,
    rejected,
    fraudPrevented: rejected * Math.round(summary.average_claim_amount || 9000),
    averageDecisionTime: 0.84,
    updatedAt: new Date(),
  };
}

function createLiveSummary(summary) {
  return {
    totalClaims: Number(summary.total_claims) || 0,
    suspiciousClaims: Number(summary.suspicious_claims) || 0,
    safeClaims: Number(summary.safe_claims) || 0,
    approvedClaims: Number(summary.approved_claims) || 0,
    rejectedClaims: Number(summary.rejected_claims) || 0,
    pendingClaims: Number(summary.pending_claims) || 0,
    totalClaimAmount: Number(summary.total_claim_amount) || 0,
    averageClaimAmount: Number(summary.average_claim_amount) || 0,
  };
}

function bumpLiveOps() {
  if (!state.liveOps) return;
  const addClaims = Math.floor(Math.random() * 4) + 1;
  const addFlagged = Math.random() > 0.45 ? 1 : 0;
  const addRejected = addFlagged && Math.random() > 0.65 ? 1 : 0;
  const addApproved = Math.max(0, addClaims - addFlagged - addRejected);
  const addPending = Math.max(0, addClaims - addApproved - addRejected);
  const addedAmount = addClaims * (Math.floor(Math.random() * 9500) + 21000);

  state.liveOps.claimsToday += addClaims;
  state.liveOps.autoApproved += addApproved;
  state.liveOps.flagged += addFlagged;
  state.liveOps.rejected += addRejected;
  state.liveOps.fraudPrevented += addRejected * (Math.floor(Math.random() * 18000) + 12000);
  state.liveOps.averageDecisionTime = Math.max(0.58, Math.min(1.25, state.liveOps.averageDecisionTime + (Math.random() - 0.5) * 0.08));
  state.liveOps.updatedAt = new Date();

  if (state.liveSummary) {
    state.liveSummary.totalClaims += addClaims;
    state.liveSummary.suspiciousClaims += addFlagged + addRejected;
    state.liveSummary.safeClaims += addApproved;
    state.liveSummary.approvedClaims += addApproved;
    state.liveSummary.rejectedClaims += addRejected;
    state.liveSummary.pendingClaims += addPending;
    state.liveSummary.totalClaimAmount += addedAmount;
    state.liveSummary.averageClaimAmount = state.liveSummary.totalClaimAmount / state.liveSummary.totalClaims;
  }

  updateLiveOpsDom();
  updateLiveSummaryDom();
}

function updateLiveOpsDom() {
  if (!state.liveOps) return;
  const ops = state.liveOps;
  const values = {
    claims: number.format(ops.claimsToday),
    approved: number.format(ops.autoApproved),
    flagged: number.format(ops.flagged),
    rejected: number.format(ops.rejected),
    prevented: money.format(ops.fraudPrevented),
    latency: `${ops.averageDecisionTime.toFixed(2)} sec`,
  };
  const notes = {
    claims: "Auto-updating every few seconds",
    approved: `${((ops.autoApproved / ops.claimsToday) * 100).toFixed(1)}% approval rate`,
    flagged: `${((ops.flagged / ops.claimsToday) * 100).toFixed(1)}% sent to review`,
    rejected: "Held before payout",
    prevented: "Estimated suspicious payout stopped",
    latency: "Average decision time",
  };

  Object.entries(values).forEach(([key, value]) => {
    const node = document.getElementById(`live-${key}`);
    if (node) node.textContent = value;
  });
  Object.entries(notes).forEach(([key, note]) => {
    const node = document.getElementById(`live-${key}-note`);
    if (node) node.textContent = note;
  });
}

function updateLiveSummaryDom() {
  if (!state.liveSummary) return;
  const s = state.liveSummary;
  const suspiciousRate = s.totalClaims ? (s.suspiciousClaims / s.totalClaims) * 100 : 0;
  const values = {
    total: number.format(s.totalClaims),
    suspicious: number.format(s.suspiciousClaims),
    safe: number.format(s.safeClaims),
    rate: `${suspiciousRate.toFixed(2)}%`,
    amount: money.format(s.totalClaimAmount),
    average: money.format(s.averageClaimAmount),
    approved: number.format(s.approvedClaims),
    rejected: number.format(s.rejectedClaims),
    pending: number.format(s.pendingClaims),
  };

  Object.entries(values).forEach(([key, value]) => {
    const node = document.getElementById(`summary-${key}`);
    if (node) node.textContent = value;
  });
}

function startLiveOps() {
  if (!state.liveOps && state.summary) state.liveOps = createLiveOps(state.summary);
  if (!state.liveSummary && state.summary) state.liveSummary = createLiveSummary(state.summary);
  if (state.liveTimer) return;
  state.liveTimer = window.setInterval(bumpLiveOps, 4000);
}

function renderLiveOperations() {
  const ops = state.liveOps;
  return `
    <section class="live-ops">
      <div class="section-title">
        <div>
          <p class="eyebrow">Live operations simulation</p>
          <h3>Today's Claim Flow</h3>
        </div>
        <span class="live-badge"><i></i> Live</span>
      </div>
      <div class="live-grid">
        ${liveMetricCard("claims", "Claims Today", number.format(ops.claimsToday), "Auto-updating every few seconds")}
        ${liveMetricCard("approved", "Auto Approved", number.format(ops.autoApproved), `${((ops.autoApproved / ops.claimsToday) * 100).toFixed(1)}% approval rate`, "success")}
        ${liveMetricCard("flagged", "Flagged for Review", number.format(ops.flagged), `${((ops.flagged / ops.claimsToday) * 100).toFixed(1)}% sent to review`, "warning")}
        ${liveMetricCard("rejected", "Rejected / Held", number.format(ops.rejected), "Held before payout", "danger")}
        ${liveMetricCard("prevented", "Fraud Prevented", money.format(ops.fraudPrevented), "Estimated suspicious payout stopped", "danger")}
        ${liveMetricCard("latency", "Average Decision Time", `${ops.averageDecisionTime.toFixed(2)} sec`, "Average decision time")}
      </div>
    </section>`;
}

function calculateCoverage(input = state.coverage) {
  const policyLimit = Math.max(0, Number(input.policyLimit) || 0);
  const claimAmount = Math.max(0, Number(input.claimAmount) || 0);
  const deductible = Math.max(0, Number(input.deductible) || 0);
  const copay = Math.max(0, Math.min(100, Number(input.copay) || 0));
  const alreadyUsed = Math.max(0, Number(input.alreadyUsed) || 0);
  const availableLimit = Math.max(0, policyLimit - alreadyUsed);
  const claimAfterDeductible = Math.max(0, claimAmount - deductible);
  const eligibleClaim = Math.min(claimAfterDeductible, availableLimit);
  const insurancePays = Math.round(eligibleClaim * (1 - copay / 100));
  const patientPays = Math.max(0, claimAmount - insurancePays);
  const remainingLimit = Math.max(0, availableLimit - insurancePays);

  return {
    policyLimit,
    claimAmount,
    deductible,
    copay,
    alreadyUsed,
    availableLimit,
    eligibleClaim,
    insurancePays,
    patientPays,
    remainingLimit,
  };
}

function coverageResult(result) {
  if (!result) return "";
  return `
    <div class="coverage-result">
      <div><span>Available Limit</span><strong>${money.format(result.availableLimit)}</strong></div>
      <div><span>Eligible Claim</span><strong>${money.format(result.eligibleClaim)}</strong></div>
      <div><span>Insurance Pays</span><strong>${money.format(result.insurancePays)}</strong></div>
      <div><span>Patient Pays</span><strong>${money.format(result.patientPays)}</strong></div>
      <div><span>Limit After Claim</span><strong>${money.format(result.remainingLimit)}</strong></div>
    </div>`;
}

function renderShell(content) {
  const navItems = [
    ["dashboard", "Dashboard"],
    ["claims", "Claims"],
    ["instant", "Predict New Claim"],
    ["suspicious", "Suspicious Claims"],
    ["calculator", "Calculator"],
    ["providers", "Provider Risk"],
    ["saved-checks", "Evidence Log"],
  ];

  root.innerHTML = `
    <main class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="brand-logo" src="${LOGO_SRC}" alt="ClaimShield logo" />
          <div><h1>ClaimShield</h1><p>Claims intelligence console</p></div>
        </div>
        <nav class="nav-list" aria-label="Primary navigation">
          ${navItems.map(([page, label]) => navButton(page, label)).join("")}
        </nav>
        <div class="admin-card">
          <div class="account-summary">
            <div class="account-avatar">${escapeHtml(initials(state.admin?.name || "Admin"))}</div>
            <div>
              <span>Signed in as</span>
              <strong>${escapeHtml(state.admin?.name || "Admin")}</strong>
              <small>${escapeHtml(state.admin?.role || "Fraud Operations")}</small>
            </div>
          </div>
          <button id="logout-button" type="button">Log out</button>
        </div>
      </aside>
      <section class="content">${content}</section>
    </main>`;

  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.page));
  });
  document.getElementById("logout-button")?.addEventListener("click", () => {
    saveAdminSession(null);
    renderLogin();
  });
}

function navButton(page, label) {
  return `<button class="nav-item ${state.page === page ? "active" : ""}" data-page="${page}" type="button">${label}</button>`;
}

function pageHeader(eyebrow, title, right = "") {
  return `<header class="page-header"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2></div>${right}</header>`;
}

function actionTile(page, title, text, meta) {
  return `
    <button class="action-tile" data-page="${page}" type="button">
      <span>${escapeHtml(meta)}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(text)}</small>
    </button>`;
}

function renderLoading(label = "Loading...") {
  renderShell(`<p class="panel">${label}</p>`);
}

function renderError(message) {
  renderShell(`<section class="panel error">${message}</section>`);
}

function renderLogin(error = "") {
  root.innerHTML = `
    <main class="login-shell">
      <section class="login-panel">
        <div class="login-card">
          <div class="login-brand">
            <img class="brand-logo login-logo" src="${LOGO_SRC}" alt="ClaimShield logo" />
            <div>
              <h1>ClaimShield</h1>
              <p>Insurance fraud risk platform</p>
            </div>
          </div>
          <div class="login-copy">
            <span class="access-badge">Secure access</span>
            <h2>ClaimShield Portal</h2>
            <p>Fraud operations workspace for claim review, provider anomaly detection, and payout decisions.</p>
          </div>
          <form class="login-form" id="login-form">
            <label><span>Username</span><input id="admin-username" autocomplete="username" placeholder="Enter username" type="text" /></label>
            <label><span>Password</span><input id="admin-password" autocomplete="current-password" placeholder="Enter password" type="password" /></label>
            ${error ? `<div class="login-error">${escapeHtml(error)}</div>` : ""}
            <button type="submit">Sign In</button>
          </form>
          <div class="demo-credentials credential-list">
            <span>Demo credentials</span>
            <div><strong>Admin</strong><code>${DEFAULT_USER.username}</code><code>${DEFAULT_USER.password}</code></div>
          </div>
        </div>
      </section>
    </main>`;

  document.getElementById("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.getElementById("admin-username").value.trim();
    const password = document.getElementById("admin-password").value;

    const matchedUser = DEMO_USERS.find((user) => user.username === username && user.password === password);

    if (!matchedUser) {
      renderLogin("Invalid demo admin credentials.");
      return;
    }

    saveAdminSession({
      username: matchedUser.username,
      name: matchedUser.name,
      role: matchedUser.role,
      access: matchedUser.access,
      signedInAt: new Date().toISOString(),
    });
    navigate("dashboard");
  });
}

async function loadBaseData() {
  if (state.summary && state.recentClaims.length && state.providers.length) return;
  const [summary, recentClaims, providers] = await Promise.all([
    request("/dashboard/summary"),
    request("/dashboard/recent-suspicious?limit=8"),
    request("/providers/risk?limit=8"),
  ]);
  state.summary = summary;
  state.recentClaims = recentClaims;
  state.providers = providers;
}

function renderDashboard() {
  const summary = state.summary;
  if (!state.liveOps) state.liveOps = createLiveOps(summary);
  if (!state.liveSummary) state.liveSummary = createLiveSummary(summary);
  const liveSummary = state.liveSummary;
  const statusRows = [
    ["Approved", liveSummary.approvedClaims, "approved"],
    ["Rejected", liveSummary.rejectedClaims, "rejected"],
    ["Pending", liveSummary.pendingClaims, "pending"],
  ].map(([label, value, key]) => `<div class="status-row"><span>${label}</span><strong id="summary-${key}">${number.format(value)}</strong></div>`).join("");

  renderShell(`
    ${pageHeader("Fraud operations command center", "ClaimShield Dashboard")}
    ${renderLiveOperations()}
    <div class="stats-grid">
      ${statCard("Total Claims", number.format(liveSummary.totalClaims), "neutral", "total")}
      ${statCard("Suspicious Claims", number.format(liveSummary.suspiciousClaims), "danger", "suspicious")}
      ${statCard("Safe Claims", number.format(liveSummary.safeClaims), "success", "safe")}
      ${statCard("Suspicious Rate", `${((liveSummary.suspiciousClaims / liveSummary.totalClaims) * 100).toFixed(2)}%`, "warning", "rate")}
      ${statCard("Total Claim Amount", money.format(liveSummary.totalClaimAmount), "neutral", "amount")}
      ${statCard("Average Claim", money.format(liveSummary.averageClaimAmount), "neutral", "average")}
    </div>
    ${dashboardCharts(liveSummary, state.providers)}
    <div class="two-column">
      <section class="panel"><div class="panel-header"><h3>Claim Status</h3></div><div class="status-list">${statusRows}</div></section>
      ${claimCheckerPanel()}
    </div>
    <section class="page-actions">
      ${actionTile("instant", "Predict New Claim", "Enter fresh claim details and get an ML risk decision instantly.", "ML Prediction")}
      ${actionTile("suspicious", "Suspicious Claims Queue", "Open a focused review table with suspicious claim details.", "Investigation")}
      ${actionTile("calculator", "Coverage Calculator", "Open the dedicated insurance payout calculator.", "Payout")}
      ${actionTile("providers", "Provider Risk Leaderboard", "Review provider anomalies, rejection rates, and billing patterns.", "Analytics")}
      ${actionTile("saved-checks", "Evidence Log", "See saved claim decisions with risk score, decision, and audit record ID.", "Audit Trail")}
    </section>
  `);
  wireClaimForm();
  updateLiveOpsDom();
  updateLiveSummaryDom();
  startLiveOps();
}

function dashboardCharts(summary, providers = []) {
  const totalClaims = Math.max(1, Number(summary.totalClaims) || 0);
  const suspiciousRate = Math.round((Number(summary.suspiciousClaims || 0) / totalClaims) * 100);
  const safeRate = Math.max(0, 100 - suspiciousRate);
  const providerBars = providers.slice(0, 5).map((provider) => {
    const risk = Math.max(0, Math.min(100, Number(provider.risk_score) || 0));
    return `
      <div class="provider-risk-bar">
        <div>
          <strong>${escapeHtml(provider.provider_id)}</strong>
          <span>${escapeHtml(provider.provider_specialty)} · ${escapeHtml(provider.provider_state)}</span>
        </div>
        <div class="bar-track"><i style="width: ${risk}%"></i></div>
        <b>${risk.toFixed(1)}%</b>
      </div>`;
  }).join("");

  return `
    <section class="dashboard-charts">
      <article class="panel chart-card">
        <div class="panel-header">
          <h3>Claim Risk Mix</h3>
          <span>${number.format(summary.totalClaims)} claims</span>
        </div>
        <div class="risk-donut-wrap">
          <div class="risk-donut" style="--risk:${suspiciousRate}"><strong>${suspiciousRate}%</strong><span>Suspicious</span></div>
          <div class="chart-legend">
            <div><i class="danger"></i><span>Suspicious</span><strong>${number.format(summary.suspiciousClaims)}</strong></div>
            <div><i class="success"></i><span>Safe</span><strong>${number.format(summary.safeClaims)}</strong></div>
            <div><i class="neutral"></i><span>Safe rate</span><strong>${safeRate}%</strong></div>
          </div>
        </div>
      </article>
      <article class="panel chart-card">
        <div class="panel-header">
          <h3>Top Provider Risk</h3>
          <span>Highest 5 providers</span>
        </div>
        <div class="provider-risk-list">${providerBars}</div>
      </article>
    </section>`;
}

function claimCheckerPanel() {
  return `
    <section class="panel">
      <div class="panel-header"><h3>Run Claim Check</h3></div>
      <form class="claim-form" id="claim-form">
        <label for="claim-id">Claim ID</label>
        <div class="input-row"><input id="claim-id" min="1" placeholder="Try 1, 77, 508, 1020" type="number" value="1" /><button type="submit">Check</button></div>
        <div class="sample-row"><button type="button" data-sample="1">Claim 1</button><button type="button" data-sample="77">Claim 77</button><button type="button" data-sample="1020">Claim 1020</button></div>
      </form>
      <div id="prediction-result">${state.prediction ? predictionCard(state.prediction) : ""}</div>
    </section>`;
}

function coverageCalculatorPanel(result) {
  const c = state.coverage;
  return `
    <section class="panel coverage-panel">
      <div class="panel-header">
        <h3>Insurance Coverage Calculator</h3>
        <span>Patient payout estimate</span>
      </div>
      <form class="coverage-form" id="coverage-form">
        <label><span>Policy Limit</span><input id="policy-limit" min="0" step="1000" type="number" value="${c.policyLimit}" /></label>
        <label><span>Claim Amount</span><input id="claim-amount" min="0" step="1000" type="number" value="${c.claimAmount}" /></label>
        <label><span>Deductible</span><input id="deductible" min="0" step="1000" type="number" value="${c.deductible}" /></label>
        <label><span>Co-pay %</span><input id="copay" max="100" min="0" step="1" type="number" value="${c.copay}" /></label>
        <label><span>Already Used</span><input id="already-used" min="0" step="1000" type="number" value="${c.alreadyUsed}" /></label>
        <button type="submit">Calculate</button>
      </form>
      <div id="coverage-result">${coverageResult(result)}</div>
    </section>`;
}

function renderCalculatorPage() {
  const payout = state.payout || calculateCoverage();
  renderShell(`
    ${pageHeader("Patient payout estimate", "Insurance Coverage Calculator")}
    ${coverageCalculatorPanel(payout)}
  `);
  wireCoverageForm();
}

function instantClaimForm() {
  const c = {
    ...state.instantClaim,
    claimAmount: state.instantClaim.claimAmount || 75000,
  };
  return `
    <section class="panel instant-panel">
      <div class="panel-header">
        <div>
          <h3>New Claim Intake</h3>
          <span>Enter submission details for real-time fraud scoring</span>
        </div>
      </div>
      <form class="instant-form" id="instant-form">
        <div class="instant-group">
          <h4>Claim Details</h4>
          <div class="instant-fields">
            <label><span>Claim Amount</span><input id="instant-claim-amount" min="1" placeholder="75000" required step="1" type="number" value="${c.claimAmount}" /></label>
            <label><span>Patient Age</span><input id="instant-patient-age" min="0" max="120" step="1" type="number" value="${c.patientAge}" /></label>
            <label>
              <span>Claim Status</span>
              <select id="instant-claim-status">
                <option value="pending" ${c.claimStatus === "pending" ? "selected" : ""}>Pending</option>
                <option value="approved" ${c.claimStatus === "approved" ? "selected" : ""}>Approved</option>
                <option value="rejected" ${c.claimStatus === "rejected" ? "selected" : ""}>Rejected</option>
              </select>
            </label>
            <label>
              <span>Payment Exists</span>
              <select id="instant-claim-has-payment">
                <option value="N" ${c.claimHasPayment === "N" ? "selected" : ""}>No</option>
                <option value="Y" ${c.claimHasPayment === "Y" ? "selected" : ""}>Yes</option>
              </select>
            </label>
          </div>
        </div>
        <div class="instant-group">
          <h4>Provider Pattern</h4>
          <div class="instant-fields">
            <label>
              <span>Provider Specialty</span>
              <select id="instant-provider-specialty">
                ${["Cardiologist", "Dermatologist", "General Practitioner", "Oncologist", "Orthopedic"].map((specialty) => `<option value="${specialty}" ${c.providerSpecialty === specialty ? "selected" : ""}>${specialty}</option>`).join("")}
              </select>
            </label>
            <label><span>Patient State</span><input id="instant-patient-state" type="text" value="${escapeHtml(c.patientState)}" /></label>
            <label><span>Provider State</span><input id="instant-provider-state" type="text" value="${escapeHtml(c.providerState)}" /></label>
            <label>
              <span>State Mismatch</span>
              <select id="instant-state-mismatch">
                <option value="Y" ${c.providerPatientStateMismatch === "Y" ? "selected" : ""}>Yes</option>
                <option value="N" ${c.providerPatientStateMismatch === "N" ? "selected" : ""}>No</option>
              </select>
            </label>
            <label><span>Provider Rejection Rate</span><input id="instant-rejection-rate" min="0" max="1" step="0.01" type="number" value="${c.providerRejectionRate}" /></label>
            <label><span>Average Claim Amount</span><input id="instant-average-claim-amount" min="1" step="1" type="number" value="${c.averageClaimAmount || 42000}" /></label>
            <label><span>Payment Lag Days</span><input id="instant-payment-lag" step="1" type="number" value="${c.paymentLagDays}" /></label>
          </div>
        </div>
        <div class="instant-actions">
          <button type="submit">Predict Risk</button>
          <small>Result is saved to the evidence log when connected.</small>
        </div>
      </form>
      <div id="instant-result">${state.instantPrediction ? predictionCard(state.instantPrediction) : `<section class="instant-empty"><strong>No prediction yet</strong><span>Fill or adjust the claim details and run Predict Risk.</span></section>`}</div>
    </section>`;
}

function readInstantClaimInputs() {
  const claimAmountInput = document.getElementById("instant-claim-amount");
  const claimAmount = Number(claimAmountInput.value || 75000);
  if (!claimAmountInput.value) claimAmountInput.value = claimAmount;
  const providerRejectionRate = Number(document.getElementById("instant-rejection-rate").value);
  const averageClaimAmount = Math.max(1, Number(document.getElementById("instant-average-claim-amount").value || 42000));
  const providerTotalClaims = providerRejectionRate >= 0.18 ? 50 : 25;
  const payload = {
    claim_amount: claimAmount,
    patient_age: Number(document.getElementById("instant-patient-age").value),
    claim_status: document.getElementById("instant-claim-status").value,
    provider_specialty: document.getElementById("instant-provider-specialty").value,
    patient_state: document.getElementById("instant-patient-state").value.trim(),
    provider_state: document.getElementById("instant-provider-state").value.trim(),
    claim_has_payment: document.getElementById("instant-claim-has-payment").value,
    provider_patient_state_mismatch: document.getElementById("instant-state-mismatch").value,
    provider_rejection_rate: providerRejectionRate,
    payment_lag_days: Number(document.getElementById("instant-payment-lag").value),
    payment_ratio: document.getElementById("instant-claim-has-payment").value === "Y" ? 0.95 : 0,
    provider_total_claims: providerTotalClaims,
    provider_avg_claim_amount: averageClaimAmount,
    provider_pending_rate: 0.12,
    patient_total_claims: 4,
    patient_avg_claim_amount: averageClaimAmount,
    claim_amount_vs_provider_avg: claimAmount / averageClaimAmount,
    claim_amount_vs_patient_avg: claimAmount / averageClaimAmount,
    provider_claim_amount_zscore: (claimAmount - averageClaimAmount) / Math.max(1, averageClaimAmount * 0.43),
  };

  state.instantClaim = {
    claimAmount: payload.claim_amount,
    patientAge: payload.patient_age,
    claimStatus: payload.claim_status,
    providerSpecialty: payload.provider_specialty,
    patientState: payload.patient_state,
    providerState: payload.provider_state,
    claimHasPayment: payload.claim_has_payment,
    providerPatientStateMismatch: payload.provider_patient_state_mismatch,
    providerRejectionRate: payload.provider_rejection_rate,
    averageClaimAmount: payload.provider_avg_claim_amount,
    paymentLagDays: payload.payment_lag_days,
  };

  return payload;
}

function wireInstantForm() {
  const form = document.getElementById("instant-form");
  if (!form) return;
  const claimAmountInput = document.getElementById("instant-claim-amount");
  if (claimAmountInput && !claimAmountInput.value) claimAmountInput.value = "75000";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const resultBox = document.getElementById("instant-result");
    resultBox.innerHTML = `<div class="prediction-card">Running ML prediction...</div>`;
    try {
      const prediction = await postRequest("/prediction/instant", readInstantClaimInputs());
      state.instantPrediction = prediction;
      resultBox.innerHTML = predictionCard(prediction);
    } catch (error) {
      resultBox.innerHTML = `<div class="prediction-card error">Instant prediction failed. Check that the backend is running on port 8000.</div>`;
    }
  });
}

function renderInstantPredictionPage() {
  renderShell(`
    ${pageHeader("Real-time ML risk scoring", "Predict New Claim", `<div class="status-pill">Instant data supported</div>`)}
    <section class="instant-overview">
      <div>
        <span>Training Data</span>
        <strong>200,000 claims</strong>
        <small>Historical claim patterns</small>
      </div>
      <div>
        <span>Model Accuracy</span>
        <strong>88.15%</strong>
        <small>Validation split result</small>
      </div>
      <div>
        <span>ROC AUC</span>
        <strong>95.90%</strong>
        <small>Risk ranking quality</small>
      </div>
      <div>
        <span>Prediction Mode</span>
        <strong>Instant input</strong>
        <small>New claim, not only claim ID</small>
      </div>
    </section>
    ${instantClaimForm()}
  `);
  wireInstantForm();
}

function amountRulePanel(review) {
  if (!review?.triggered) return "";
  const tone = review.triggered ? "flagged" : "clear";
  return `
    <section class="amount-rule ${tone}">
      <div class="amount-rule-header">
        <div>
          <span>Amount Rule Check</span>
          <strong>${escapeHtml(review.rule)}</strong>
        </div>
        <b>${escapeHtml(review.result)}</b>
      </div>
      <div class="amount-rule-grid">
        <div><span>Claim Amount</span><strong>${money.format(review.claim_amount)}</strong></div>
        <div><span>Average Amount</span><strong>${money.format(review.average_claim_amount)}</strong></div>
        <div><span>3x Threshold</span><strong>${money.format(review.threshold_amount)}</strong></div>
        <div><span>Current Ratio</span><strong>${escapeHtml(review.ratio)}x</strong></div>
      </div>
      <p>${escapeHtml(review.explanation)}</p>
    </section>`;
}

function amountRuleFromClaim(claim = {}) {
  const claimAmount = Number(claim.claim_amount || 0);
  const averageAmount = Number(claim.provider_avg_claim_amount || claim.patient_avg_claim_amount || 0);
  if (!claimAmount || !averageAmount) return null;
  const thresholdAmount = averageAmount * 3;
  const ratio = claimAmount / averageAmount;
  const triggered = claimAmount > thresholdAmount;
  return {
    rule: "Claim Amount > 3 x Average Claim Amount",
    claim_amount: claimAmount,
    average_claim_amount: averageAmount,
    threshold_amount: thresholdAmount,
    ratio: Number(ratio.toFixed(2)),
    triggered,
    result: triggered ? "Flagged" : "Not triggered",
    explanation: triggered
      ? "The claim amount is more than three times the average claim amount, so it is treated as an extreme billing outlier."
      : "The claim amount is not more than three times the average claim amount, so this specific 3x rule did not trigger.",
  };
}

function predictionCard(prediction) {
  const reasons = prediction.reasons.length ? prediction.reasons.map((r) => `<li>${escapeHtml(r.replaceAll("_", " "))}</li>`).join("") : "<li>No suspicious reasons found.</li>";
  const signals = prediction.fraud_signals || [];
  const amountReview = prediction.amount_rule_review || amountRuleFromClaim(prediction.claim);
  const signalDetails = signals.length ? signals.map((signal) => `<li><strong>${escapeHtml(signal.label)}:</strong> ${escapeHtml(signal.detail)}</li>`).join("") : "<li>No duplicate billing, inflated billing, or provider network anomaly signal found.</li>";
  const payout = prediction.payout ? `
    <div class="payout-summary">
      <div><span>Claim Amount</span><strong>${money.format(prediction.payout.claimAmount)}</strong></div>
      <div><span>Insurance Pays</span><strong>${money.format(prediction.payout.insurancePays)}</strong></div>
      <div><span>Patient Pays</span><strong>${money.format(prediction.payout.patientPays)}</strong></div>
      <div><span>Remaining Limit</span><strong>${money.format(prediction.payout.remainingLimit)}</strong></div>
    </div>` : "";
  return `
    <div class="prediction-card result-card">
      <div><span>Risk Score</span><strong>${prediction.risk_score}%</strong></div>
      <div><span>Risk Level</span><strong>${riskLevelBadge(prediction.risk_level)}</strong></div>
      <div><span>Decision</span><strong>${escapeHtml(prediction.decision)}</strong></div>
      ${payout}
      ${amountRulePanel(amountReview)}
      <div class="signal-list"><span>Problem Statement Signals</span><div>${fraudSignalTags(signals)}</div></div>
      <div class="reason-list"><span>Signal Explanation</span><ul>${signalDetails}</ul></div>
      <div class="reason-list raw-reasons"><span>Raw Dataset Reasons</span><ul>${reasons}</ul></div>
    </div>`;
}

function readCoverageInputs(claimAmountOverride) {
  const next = {
    policyLimit: document.getElementById("policy-limit")?.value ?? state.coverage.policyLimit,
    claimAmount: claimAmountOverride ?? document.getElementById("claim-amount")?.value ?? state.coverage.claimAmount,
    deductible: document.getElementById("deductible")?.value ?? state.coverage.deductible,
    copay: document.getElementById("copay")?.value ?? state.coverage.copay,
    alreadyUsed: document.getElementById("already-used")?.value ?? state.coverage.alreadyUsed,
  };
  state.coverage = {
    policyLimit: Number(next.policyLimit),
    claimAmount: Number(next.claimAmount),
    deductible: Number(next.deductible),
    copay: Number(next.copay),
    alreadyUsed: Number(next.alreadyUsed),
  };
  return state.coverage;
}

function wireCoverageForm() {
  const form = document.getElementById("coverage-form");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = calculateCoverage(readCoverageInputs());
    state.payout = result;
    document.getElementById("coverage-result").innerHTML = coverageResult(result);
  });
}

function wireClaimForm() {
  const form = document.getElementById("claim-form");
  if (!form) return;
  document.querySelectorAll("[data-sample]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("claim-id").value = button.dataset.sample;
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const claimId = document.getElementById("claim-id").value;
    const resultBox = document.getElementById("prediction-result");
    resultBox.innerHTML = `<div class="prediction-card">Checking claim...</div>`;
    try {
      const prediction = await request(`/prediction/claim/${claimId}`);
      const claimAmount = Math.round(Number(prediction.claim?.claim_amount || state.coverage.claimAmount));
      const claimAmountInput = document.getElementById("claim-amount");
      if (claimAmountInput) claimAmountInput.value = claimAmount;
      const payout = calculateCoverage(readCoverageInputs(claimAmount));
      state.payout = payout;
      prediction.payout = payout;
      state.prediction = prediction;
      state.claimChecks = [];
      const coverageBox = document.getElementById("coverage-result");
      if (coverageBox) coverageBox.innerHTML = coverageResult(payout);
      resultBox.innerHTML = predictionCard(prediction);
    } catch (error) {
      resultBox.innerHTML = `<div class="prediction-card error">Claim check failed. Confirm the backend is running on port 8000 and try a valid dataset claim ID.</div>`;
    }
  });
}

function tablePanel(title, label, headers, rows) {
  return `
    <section class="panel table-panel">
      <div class="panel-header"><h3>${title}</h3>${label ? `<span>${label}</span>` : ""}</div>
      <div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
    </section>`;
}

async function renderClaimsPage() {
  if (!state.claims.length) state.claims = await request("/claims?limit=50");
  const visibleClaims = state.claims.length;
  const visibleSuspicious = state.claims.filter((claim) => Number(claim.suspicious_rule_label) === 1).length;
  const visibleAmount = state.claims.reduce((sum, claim) => sum + Number(claim.claim_amount || 0), 0);
  const reviewRate = visibleClaims ? ((visibleSuspicious / visibleClaims) * 100).toFixed(1) : "0.0";
  const rows = state.claims.map((claim) => `
    <tr>
      <td><strong class="table-id">#${claim.claim_id}</strong></td>
      <td>${claim.patient_id}</td>
      <td>${claim.provider_id}</td>
      <td><strong>${money.format(claim.claim_amount)}</strong></td>
      <td><span class="claim-status-pill ${String(claim.claim_status).toLowerCase()}">${escapeHtml(claim.claim_status)}</span></td>
      <td>${escapeHtml(claim.provider_specialty)}</td>
      <td>${riskBadge(claim.suspicious_rule_label)}</td>
      <td><button class="mini-button table-action" data-check-claim="${claim.claim_id}">Check</button></td>
    </tr>`).join("");
  renderShell(`
    ${pageHeader("Claim investigation queue", "Claims")}
    <section class="claims-command">
      <div>
        <span>Investigation workspace</span>
        <strong>Review, filter, and score claims before payout</strong>
      </div>
      <div class="segmented-filter">
        <button class="${state.claimsFilter === "all" ? "active" : ""}" id="load-all" type="button">All Claims</button>
        <button class="${state.claimsFilter === "risk" ? "active" : ""}" id="load-risk" type="button">Suspicious Only</button>
      </div>
    </section>
    <section class="claims-kpi-grid">
      ${statCard("Visible Claims", number.format(visibleClaims), "neutral")}
      ${statCard("Flagged in View", number.format(visibleSuspicious), "danger")}
      ${statCard("Review Rate", `${reviewRate}%`, "warning")}
      ${statCard("Visible Exposure", money.format(visibleAmount), "neutral")}
    </section>
    <div class="claims-workbench">
      ${claimCheckerPanel()}
    </div>
    ${tablePanel("Claim Records", "First 50 rows", ["Claim ID", "Patient", "Provider", "Amount", "Status", "Specialty", "Risk", "Action"], rows)}
  `);
  wireClaimForm();
  document.getElementById("load-all").addEventListener("click", async () => { state.claimsFilter = "all"; state.claims = await request("/claims?limit=50"); renderClaimsPage(); });
  document.getElementById("load-risk").addEventListener("click", async () => { state.claimsFilter = "risk"; state.claims = await request("/claims?limit=50&suspicious_only=true"); renderClaimsPage(); });
  document.querySelectorAll("[data-check-claim]").forEach((button) => button.addEventListener("click", async () => {
    document.getElementById("claim-id").value = button.dataset.checkClaim;
    document.getElementById("claim-form").requestSubmit();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
}

async function renderSuspiciousPage() {
  state.recentClaims = await request("/dashboard/recent-suspicious?limit=50");
  const rows = state.recentClaims.map((claim) => `
    <tr>
      <td>${claim.claim_id}</td>
      <td>${claim.patient_id}</td>
      <td>${claim.provider_id}</td>
      <td>${escapeHtml(claim.provider_specialty)}</td>
      <td>${money.format(claim.claim_amount)}</td>
      <td>${escapeHtml(claim.claim_status)}</td>
      <td>${escapeHtml(claim.claim_date)}</td>
      <td><div class="table-signals">${fraudSignalTags(claim.fraud_signals || [])}</div></td>
      <td>${riskBadge(claim.suspicious_rule_label ?? 1)}</td>
      <td><button class="mini-button" data-check-claim="${claim.claim_id}">Check</button></td>
    </tr>`).join("");

  renderShell(`
    ${pageHeader("Focused investigation queue", "Recent Suspicious Claims", `<button class="mini-button" id="refresh-suspicious">Refresh</button>`)}
    <div class="stats-grid compact">
      ${statCard("Suspicious Records", number.format(state.recentClaims.length), "danger")}
      ${statCard("Primary Workflow", "Investigate before payout", "warning")}
      ${statCard("Source", "Rule-based risk signals", "neutral")}
    </div>
    ${claimCheckerPanel()}
    ${tablePanel("Suspicious Claim Queue", "Latest 50 records", ["Claim ID", "Patient", "Provider", "Specialty", "Amount", "Status", "Claim Date", "Fraud Signals", "Risk", "Action"], rows)}
  `);

  wireClaimForm();
  document.getElementById("refresh-suspicious").addEventListener("click", () => renderSuspiciousPage());
  document.querySelectorAll("[data-check-claim]").forEach((button) => button.addEventListener("click", () => {
    document.getElementById("claim-id").value = button.dataset.checkClaim;
    document.getElementById("claim-form").requestSubmit();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
}

function renderProvidersPage() {
  const rows = state.providers.map((provider, index) => `
    <tr><td>${provider.provider_id}</td><td>${escapeHtml(provider.provider_specialty)}</td><td>${escapeHtml(provider.provider_state)}</td><td>${number.format(provider.total_claims)}</td><td>${money.format(provider.average_claim_amount)}</td><td>${number.format(provider.suspicious_claims)}</td><td>${provider.rejection_rate}</td><td><strong>${provider.risk_score}%</strong></td></tr>`).join("");
  renderShell(`
    ${pageHeader("Provider anomaly detection", "Top Risky Providers")}
    <div class="stats-grid compact">
      ${statCard("Providers Displayed", number.format(state.providers.length))}
      ${statCard("Highest Risk Score", `${state.providers[0]?.risk_score ?? 0}%`, "danger")}
      ${statCard("Main Signal", "Suspicious billing patterns", "warning")}
    </div>
    ${tablePanel("Top Risky Providers", "Sorted by risk score", ["Provider ID", "Specialty", "State", "Claims", "Avg Amount", "Suspicious", "Rejection Rate", "Risk"], rows)}
  `);
}

async function renderSavedChecksPage() {
  state.claimChecks = await request("/claim-checks?limit=25");
  const rows = state.claimChecks.map((check) => `
    <tr>
      <td>${escapeHtml(displaySavedValue(check.claim_id, "New claim"))}</td>
      <td>${escapeHtml(displaySavedValue(check.patient_id, "Not provided"))}</td>
      <td>${escapeHtml(displaySavedValue(check.provider_id, "Not provided"))}</td>
      <td>${money.format(check.claim_amount || 0)}</td>
      <td>${riskLevelBadge(check.risk_level)}</td>
      <td><strong>${escapeHtml(check.risk_score)}%</strong></td>
      <td>${escapeHtml(check.decision)}</td>
      <td>${formatTimestamp(check.created_at)}</td>
      <td class="hash-cell">${escapeHtml(check.id)}</td>
    </tr>`).join("");

  renderShell(`
    ${pageHeader("Claim decision history", "Evidence Log", `<button class="mini-button" id="refresh-checks">Refresh</button>`)}
    <section class="panel"><p class="muted">Every claim check is saved as an evidence record with the risk score, decision, timestamp, and audit record ID. Existing dataset claim checks show claim, patient, and provider IDs. New claim predictions show <strong>New claim</strong> or <strong>Not provided</strong> when those IDs were not entered.</p></section>
    ${tablePanel("Latest Evidence Records", `${state.claimChecks.length} records`, ["Claim", "Patient", "Provider", "Amount", "Risk Level", "Score", "Decision", "Saved At", "Audit Record"], rows || `<tr><td colspan="9">No saved evidence records found yet. Run a claim check first.</td></tr>`)}
  `);

  document.getElementById("refresh-checks").addEventListener("click", () => renderSavedChecksPage());
}

async function navigate(page) {
  if (!state.admin) {
    renderLogin();
    return;
  }
  state.page = page;
  renderLoading("Loading page...");
  try {
    await loadBaseData();
    if (page === "dashboard") renderDashboard();
    if (page === "claims") await renderClaimsPage();
    if (page === "instant") renderInstantPredictionPage();
    if (page === "suspicious") await renderSuspiciousPage();
    if (page === "calculator") renderCalculatorPage();
    if (page === "providers") renderProvidersPage();
    if (page === "saved-checks") await renderSavedChecksPage();
  } catch (error) {
    renderError("Backend data could not load yet. Wait a moment and refresh this page.");
  }
}

if (state.admin) navigate("dashboard");
else renderLogin();
