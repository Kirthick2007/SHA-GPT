import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";

import {
  getClaimPrediction,
  getDashboardSummary,
  getProviderRisk,
  getRecentSuspiciousClaims,
} from "../api/client.js";
import RiskBadge from "../components/RiskBadge.jsx";
import StatCard from "../components/StatCard.jsx";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("en-US");

function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [claims, setClaims] = useState([]);
  const [providers, setProviders] = useState([]);
  const [claimId, setClaimId] = useState("1");
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [summaryData, claimData, providerData] = await Promise.all([
          getDashboardSummary(),
          getRecentSuspiciousClaims(),
          getProviderRisk(),
        ]);

        setSummary(summaryData);
        setClaims(claimData);
        setProviders(providerData);
      } catch (err) {
        setError("Backend is not reachable. Keep FastAPI running on port 8000.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  async function runPrediction(event) {
    event.preventDefault();
    setPrediction(null);
    const result = await getClaimPrediction(claimId);
    setPrediction(result);
  }

  const statusItems = useMemo(() => {
    if (!summary) return [];

    return [
      { label: "Approved", value: summary.approved_claims },
      { label: "Rejected", value: summary.rejected_claims },
      { label: "Pending", value: summary.pending_claims },
    ];
  }, [summary]);

  if (loading) {
    return (
      <section className="content">
        <p className="panel">Loading dashboard...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="content">
        <p className="panel error">{error}</p>
      </section>
    );
  }

  return (
    <section className="content">
      <header className="page-header">
        <div>
          <p className="eyebrow">Real-time claim monitoring</p>
          <h2>Insurance Fraud Detection Dashboard</h2>
        </div>
        <div className="status-pill">
          <CheckCircle2 size={18} />
          Backend connected
        </div>
      </header>

      <div className="stats-grid">
        <StatCard label="Total Claims" value={number.format(summary.total_claims)} />
        <StatCard label="Suspicious Claims" value={number.format(summary.suspicious_claims)} tone="danger" />
        <StatCard label="Safe Claims" value={number.format(summary.safe_claims)} tone="success" />
        <StatCard label="Suspicious Rate" value={`${summary.suspicious_rate}%`} tone="warning" />
        <StatCard label="Total Claim Amount" value={money.format(summary.total_claim_amount)} />
        <StatCard label="Average Claim" value={money.format(summary.average_claim_amount)} />
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <h3>Claim Status</h3>
          </div>
          <div className="status-list">
            {statusItems.map((item) => (
              <div className="status-row" key={item.label}>
                <span>{item.label}</span>
                <strong>{number.format(item.value)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Run Claim Check</h3>
          </div>
          <form className="claim-form" onSubmit={runPrediction}>
            <label htmlFor="claimId">Claim ID</label>
            <div className="input-row">
              <input
                id="claimId"
                min="1"
                onChange={(event) => setClaimId(event.target.value)}
                type="number"
                value={claimId}
              />
              <button type="submit">
                <Search size={17} />
                Check
              </button>
            </div>
          </form>

          {prediction && (
            <div className="prediction-card">
              <div>
                <span>Risk Score</span>
                <strong>{prediction.risk_score}%</strong>
              </div>
              <div>
                <span>Risk Level</span>
                <strong>{prediction.risk_level}</strong>
              </div>
              <div>
                <span>Decision</span>
                <strong>{prediction.decision}</strong>
              </div>
              <p>{prediction.reasons.length ? prediction.reasons.join(", ") : "No suspicious reasons found."}</p>
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3>Recent Suspicious Claims</h3>
          <span>
            <AlertTriangle size={16} />
            Review queue
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Claim ID</th>
                <th>Provider</th>
                <th>Specialty</th>
                <th>Claim Amount</th>
                <th>Status</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.claim_id}>
                  <td>{claim.claim_id}</td>
                  <td>{claim.provider_id}</td>
                  <td>{claim.provider_specialty}</td>
                  <td>{money.format(claim.claim_amount)}</td>
                  <td>{claim.claim_status}</td>
                  <td>
                    <RiskBadge value={claim.suspicious_rule_label ?? 1} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Top Risky Providers</h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider ID</th>
                <th>Specialty</th>
                <th>State</th>
                <th>Total Claims</th>
                <th>Suspicious</th>
                <th>Risk Score</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr key={provider.provider_id}>
                  <td>{provider.provider_id}</td>
                  <td>{provider.provider_specialty}</td>
                  <td>{provider.provider_state}</td>
                  <td>{number.format(provider.total_claims)}</td>
                  <td>{number.format(provider.suspicious_claims)}</td>
                  <td>
                    <strong>{provider.risk_score}%</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export default Dashboard;

