const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { admin, getFirebaseStatus, initializeFirebase } = require("./firebase");

const PORT = Number(process.env.PORT || 8000);
const DATA_PATH = path.join(__dirname, "backend", "data", "cleaned_insurance_hackathon_ready.csv");
const MODEL_PATH = path.join(__dirname, "backend", "models", "claim_fraud_model.json");
const LOCAL_CHECKS_PATH = path.join(__dirname, "backend", "local-claim-checks.json");
const FRONTEND_DIR = path.join(__dirname, "frontend");
const PUBLIC_DIR = path.join(FRONTEND_DIR, "public");
const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
let rows;
let mlModel;
const db = initializeFirebase();
let firebaseRuntimeDisabledReason = "";

function splitCsv(line) {
  const out = [];
  let cur = "";
  let quote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && quote && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      quote = !quote;
    } else if (ch === "," && !quote) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function value(v) {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

function loadRows() {
  if (rows) return rows;
  if (!fs.existsSync(DATA_PATH)) throw new Error("CSV dataset not found. Run backend/prepare_data.py first.");
  console.log("Loading CSV dataset...");
  const lines = fs.readFileSync(DATA_PATH, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = splitCsv(lines[0]);
  rows = lines.slice(1).map((line) => {
    const vals = splitCsv(line);
    const row = {};
    headers.forEach((h, i) => row[h] = value(vals[i]));
    return row;
  });
  console.log(`Loaded ${rows.length} claims.`);
  return rows;
}

function loadModel() {
  if (mlModel) return mlModel;
  if (!fs.existsSync(MODEL_PATH)) {
    throw new Error("ML model not found. Run backend/train_model.py first.");
  }
  mlModel = JSON.parse(fs.readFileSync(MODEL_PATH, "utf8"));
  return mlModel;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large"));
      }
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON request body"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, data, code = 200) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }

    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

function serveFrontend(req, res) {
  const requestedPath = new URL(req.url, `http://127.0.0.1:${PORT}`).pathname;
  const safePath = requestedPath === "/" ? "/index.html" : requestedPath;
  let filePath = path.normalize(path.join(FRONTEND_DIR, safePath));

  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("Forbidden");
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return sendFile(res, filePath);
  }

  filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return sendFile(res, filePath);
  }

  return sendFile(res, path.join(FRONTEND_DIR, "index.html"));
}

function sigmoid(value) {
  const clipped = Math.max(-35, Math.min(35, value));
  return 1 / (1 + Math.exp(-clipped));
}

function summary(data) {
  const total = data.length;
  const suspicious = data.filter(r => Number(r.suspicious_rule_label) === 1).length;
  const approved = data.filter(r => String(r.claim_status).toLowerCase() === "approved").length;
  const rejected = data.filter(r => String(r.claim_status).toLowerCase() === "rejected").length;
  const pending = data.filter(r => String(r.claim_status).toLowerCase() === "pending").length;
  const amount = data.reduce((s, r) => s + Number(r.claim_amount || 0), 0);
  return {
    total_claims: total,
    suspicious_claims: suspicious,
    safe_claims: total - suspicious,
    approved_claims: approved,
    rejected_claims: rejected,
    pending_claims: pending,
    total_claim_amount: Number(amount.toFixed(2)),
    average_claim_amount: Number((amount / total).toFixed(2)),
    suspicious_rate: Number(((suspicious / total) * 100).toFixed(2))
  };
}

function recentSuspicious(data, limit) {
  return data.filter(r => Number(r.suspicious_rule_label) === 1)
    .sort((a, b) => new Date(b.claim_date) - new Date(a.claim_date))
    .slice(0, limit)
    .map(r => ({
      claim_id: r.claim_id,
      patient_id: r.patient_id,
      provider_id: r.provider_id,
      claim_date: r.claim_date,
      claim_amount: r.claim_amount,
      claim_status: r.claim_status,
      provider_specialty: r.provider_specialty,
      suspicious_rule_label: r.suspicious_rule_label,
      suspicious_reasons: r.suspicious_reasons,
      fraud_signals: fraudSignals(r)
    }));
}

function providerRisk(data, limit) {
  const map = new Map();
  for (const r of data) {
    const id = r.provider_id;
    if (!map.has(id)) {
      map.set(id, { provider_id: id, provider_specialty: r.provider_specialty, provider_state: r.provider_state, total_claims: 0, total_amount: 0, suspicious_claims: 0, rejection_total: 0, z_total: 0 });
    }
    const p = map.get(id);
    p.total_claims++;
    p.total_amount += Number(r.claim_amount || 0);
    p.suspicious_claims += Number(r.suspicious_rule_label || 0);
    p.rejection_total += Number(r.provider_rejection_rate || 0);
    p.z_total += Number(r.provider_claim_amount_zscore || 0);
  }
  return [...map.values()].map(p => {
    const rejection = p.rejection_total / p.total_claims;
    const suspiciousRate = p.suspicious_claims / p.total_claims;
    return {
      provider_id: p.provider_id,
      provider_specialty: p.provider_specialty,
      provider_state: p.provider_state,
      total_claims: p.total_claims,
      average_claim_amount: Number((p.total_amount / p.total_claims).toFixed(2)),
      suspicious_claims: p.suspicious_claims,
      rejection_rate: Number(rejection.toFixed(4)),
      average_zscore: Number((p.z_total / p.total_claims).toFixed(4)),
      risk_score: Number((suspiciousRate * 70 + rejection * 30).toFixed(2))
    };
  }).sort((a, b) => b.risk_score - a.risk_score).slice(0, limit);
}

function fraudSignals(claim) {
  const rawReasons = claim.suspicious_reasons ? String(claim.suspicious_reasons).split("|").filter(Boolean) : [];
  const signals = [];
  const add = (type, label, detail) => {
    if (!signals.some(signal => signal.type === type)) signals.push({ type, label, detail });
  };

  if (rawReasons.includes("payment_on_non_approved_claim")) {
    add("claim_integrity", "Claim integrity issue", "Payment activity exists even though the claim was not approved.");
  }

  if (rawReasons.includes("payment_before_claim_date")) {
    add("timeline_anomaly", "Timeline anomaly", "Payment date appears before the claim submission date.");
  }

  if (Number(claim.claim_amount_vs_patient_avg || 0) >= 2) {
    add("duplicate_billing", "Possible duplicate billing", "Claim amount is unusually high compared with this patient's claim history.");
  }

  if (Number(claim.provider_claim_amount_zscore || 0) >= 2 || Number(claim.claim_amount_vs_provider_avg || 0) >= 2) {
    add("inflated_billing", "Inflated billing anomaly", "Claim amount is above the provider's normal billing pattern.");
  }

  if (Number(claim.provider_rejection_rate || 0) >= 0.18 || Number(claim.provider_total_claims || 0) >= 50) {
    add("provider_network", "Provider network anomaly", "Provider shows elevated rejection volume or unusual claim concentration.");
  }

  if (claim.provider_patient_state_mismatch === "Y") {
    add("network_mismatch", "Provider-patient location mismatch", "Provider state differs from patient state and may require verification.");
  }

  return signals;
}

function instantFraudSignals(claim) {
  const signals = fraudSignals(claim);
  const add = (type, label, detail) => {
    if (!signals.some(signal => signal.type === type)) signals.push({ type, label, detail });
  };

  if (String(claim.claim_status || "").toLowerCase() === "approved" && String(claim.claim_has_payment || "").toUpperCase() !== "Y") {
    add("claim_integrity", "Approval-payment mismatch", "Claim is marked approved but payment confirmation is missing.");
  }

  if (Number(claim.payment_lag_days || 0) < 0) {
    add("timeline_anomaly", "Timeline anomaly", "Payment date or payment lag suggests payout activity before claim submission.");
  }

  if (Number(claim.payment_ratio || 0) > 1.1) {
    add("inflated_billing", "High payout ratio", "Payment amount is higher than the submitted claim amount.");
  }

  if (Number(claim.claim_amount_vs_provider_avg || 0) > 3 || Number(claim.claim_amount_vs_patient_avg || 0) > 3) {
    add("extreme_amount_outlier", "Claim amount above 3x average", "Claim amount is more than three times the average claim amount entered for comparison.");
  }

  return signals;
}

function classifyRisk(riskScore) {
  const risk_level = riskScore >= 85
    ? "High Risk"
    : riskScore >= 56
      ? "Medium Risk"
      : "Low Risk";
  const decision = risk_level === "High Risk"
    ? "Send for investigation"
    : risk_level === "Medium Risk"
      ? "Manual review"
      : "Fast-track payout";

  return { risk_level, decision };
}

function amountRuleReview(claim) {
  const claimAmount = Number(claim.claim_amount || 0);
  const averageAmount = Number(claim.provider_avg_claim_amount || claim.patient_avg_claim_amount || 0);
  const ratio = averageAmount > 0 ? claimAmount / averageAmount : 0;
  const thresholdAmount = averageAmount * 3;
  const triggered = averageAmount > 0 && claimAmount > thresholdAmount;

  return {
    rule: "Claim Amount > 3 x Average Claim Amount",
    claim_amount: claimAmount,
    average_claim_amount: averageAmount,
    threshold_amount: Number(thresholdAmount.toFixed(2)),
    ratio: Number(ratio.toFixed(2)),
    triggered,
    result: triggered ? "Flagged" : "Not triggered",
    explanation: triggered
      ? "The claim amount is more than three times the average claim amount, so it is treated as an extreme billing outlier."
      : "The claim amount is not more than three times the average claim amount, so this specific 3x rule did not trigger.",
  };
}

function localTimestamp(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  if (value._seconds) return new Date(value._seconds * 1000).toISOString();
  return value;
}

function localClaimCheckDoc(predictionResult) {
  return {
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    claim_id: predictionResult.claim_id ?? null,
    source: predictionResult.source || "existing_claim_check",
    risk_score: predictionResult.risk_score,
    risk_level: predictionResult.risk_level,
    decision: predictionResult.decision,
    reasons: predictionResult.reasons,
    fraud_signals: predictionResult.fraud_signals,
    claim_amount: Number(predictionResult.claim?.claim_amount || 0),
    claim_status: predictionResult.claim?.claim_status || null,
    provider_id: predictionResult.claim?.provider_id || null,
    patient_id: predictionResult.claim?.patient_id || null,
    created_at: new Date().toISOString(),
    storage_provider: "local",
  };
}

function readLocalClaimChecks() {
  try {
    if (!fs.existsSync(LOCAL_CHECKS_PATH)) return [];
    const saved = JSON.parse(fs.readFileSync(LOCAL_CHECKS_PATH, "utf8"));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.warn(`Local evidence read failed: ${error.message}`);
    return [];
  }
}

function writeLocalClaimChecks(checks) {
  fs.writeFileSync(LOCAL_CHECKS_PATH, JSON.stringify(checks, null, 2));
}

function saveLocalClaimCheck(predictionResult, firebaseReason = "") {
  const doc = localClaimCheckDoc(predictionResult);
  const checks = readLocalClaimChecks();
  checks.unshift(doc);
  writeLocalClaimChecks(checks.slice(0, 250));
  return {
    saved: true,
    id: doc.id,
    provider: "local",
    warning: firebaseReason ? `Firebase unavailable, saved locally instead: ${firebaseReason}` : "Saved locally",
  };
}

function featureValue(claim, feature, model) {
  const medians = model.model_state.numeric_medians || {};
  const means = model.model_state.numeric_means || {};
  const stds = model.model_state.numeric_stds || {};
  const raw = Number(claim[feature]);
  const value = Number.isFinite(raw) ? raw : Number(medians[feature] || 0);
  return (value - Number(means[feature] || 0)) / (Number(stds[feature] || 1) || 1);
}

function modelFeatureVector(claim, model) {
  const values = [];
  for (const feature of model.numeric_features) {
    values.push(featureValue(claim, feature, model));
  }

  for (const feature of model.categorical_features) {
    const categories = model.model_state.category_values?.[feature] || [];
    const rawValue = claim[feature] === undefined || claim[feature] === null || claim[feature] === "" ? "Unknown" : String(claim[feature]).trim();
    for (const category of categories) {
      values.push(rawValue === category ? 1 : 0);
    }
  }

  return values;
}

function instantPrediction(input) {
  const model = loadModel();
  const optionalNumber = (...keys) => {
    for (const key of keys) {
      if (input[key] !== undefined && input[key] !== null && input[key] !== "") {
        const parsed = Number(input[key]);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
    }
    return undefined;
  };
  const claim = {
    claim_amount: optionalNumber("claim_amount", "claimAmount"),
    patient_age: optionalNumber("patient_age", "patientAge"),
    payment_lag_days: optionalNumber("payment_lag_days", "paymentLagDays"),
    payment_ratio: optionalNumber("payment_ratio", "paymentRatio"),
    provider_total_claims: optionalNumber("provider_total_claims", "providerTotalClaims"),
    provider_avg_claim_amount: optionalNumber("provider_avg_claim_amount", "providerAvgClaimAmount"),
    provider_rejection_rate: optionalNumber("provider_rejection_rate", "providerRejectionRate"),
    provider_pending_rate: optionalNumber("provider_pending_rate", "providerPendingRate"),
    provider_claim_amount_zscore: optionalNumber("provider_claim_amount_zscore", "providerClaimAmountZscore"),
    patient_total_claims: optionalNumber("patient_total_claims", "patientTotalClaims"),
    patient_avg_claim_amount: optionalNumber("patient_avg_claim_amount", "patientAvgClaimAmount"),
    claim_amount_vs_provider_avg: optionalNumber("claim_amount_vs_provider_avg", "claimAmountVsProviderAvg"),
    claim_amount_vs_patient_avg: optionalNumber("claim_amount_vs_patient_avg", "claimAmountVsPatientAvg"),
    claim_status: input.claim_status ?? input.claimStatus ?? "pending",
    patient_gender: input.patient_gender ?? input.patientGender ?? "Unknown",
    patient_state: input.patient_state ?? input.patientState ?? "Unknown",
    provider_specialty: input.provider_specialty ?? input.providerSpecialty ?? "Unknown",
    provider_state: input.provider_state ?? input.providerState ?? "Unknown",
    claim_has_payment: input.claim_has_payment ?? input.claimHasPayment ?? "N",
    provider_patient_state_mismatch: input.provider_patient_state_mismatch ?? input.providerPatientStateMismatch ?? "N",
    patient_id: input.patient_id ?? input.patientId ?? null,
    provider_id: input.provider_id ?? input.providerId ?? null,
  };

  if (!claim.claim_amount || claim.claim_amount <= 0) {
    throw new Error("claim_amount is required for instant prediction");
  }

  const vector = modelFeatureVector(claim, model);
  const weights = model.weights;
  let rawScore = Number(weights[0] || 0);
  for (let index = 0; index < vector.length; index++) {
    rawScore += vector[index] * Number(weights[index + 1] || 0);
  }

  const probability = sigmoid(rawScore);
  const risk_score = Math.round(probability * 100);
  const fraud_signals = instantFraudSignals(claim);
  const { risk_level, decision } = classifyRisk(risk_score);
  const amount_rule_review = amountRuleReview(claim);

  return {
    source: "instant_ml_prediction",
    model_type: model.metrics?.model_type || "ML model",
    model_trained_rows: model.metrics?.dataset_rows,
    risk_probability: Number(probability.toFixed(4)),
    risk_score,
    risk_level,
    decision,
    prediction: probability >= 0.5 ? "Suspicious" : "Likely genuine",
    fraud_signals,
    amount_rule_review,
    reasons: fraud_signals.map(signal => signal.label),
    claim,
  };
}

function prediction(data, id) {
  const claim = data.find(r => Number(r.claim_id) === Number(id));
  if (!claim) return null;
  const reasons = claim.suspicious_reasons ? String(claim.suspicious_reasons).split("|").filter(Boolean) : [];
  const signals = fraudSignals(claim);
  let score = Math.min(98, 20 + reasons.length * 25);
  if (Number(claim.suspicious_rule_label) === 0) score = Math.min(score, 35);
  if (signals.length >= 4) score = Math.max(score, 80);
  if (signals.some(signal => signal.type === "inflated_billing")) score = Math.max(score, 55);
  const { risk_level, decision } = classifyRisk(score);
  return { claim_id: Number(id), risk_score: score, risk_level, decision, reasons, fraud_signals: signals, claim };
}

async function saveClaimCheck(predictionResult) {
  if (!predictionResult) return { saved: false, reason: "No prediction result to save" };
  if (!db) return saveLocalClaimCheck(predictionResult, "Firebase is not connected");
  if (firebaseRuntimeDisabledReason) return saveLocalClaimCheck(predictionResult, firebaseRuntimeDisabledReason);

  const doc = {
    claim_id: predictionResult.claim_id ?? null,
    source: predictionResult.source || "existing_claim_check",
    risk_score: predictionResult.risk_score,
    risk_level: predictionResult.risk_level,
    decision: predictionResult.decision,
    reasons: predictionResult.reasons,
    fraud_signals: predictionResult.fraud_signals,
    claim_amount: Number(predictionResult.claim?.claim_amount || 0),
    claim_status: predictionResult.claim?.claim_status || null,
    provider_id: predictionResult.claim?.provider_id || null,
    patient_id: predictionResult.claim?.patient_id || null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const saved = await db.collection("claim_checks").add(doc);
    return { saved: true, id: saved.id, provider: "firebase" };
  } catch (error) {
    console.warn(`Firebase save failed: ${error.message}`);
    firebaseRuntimeDisabledReason = error.message;
    return saveLocalClaimCheck(predictionResult, error.message);
  }
}

async function listClaimChecks(limit) {
  if (!db) return readLocalClaimChecks().slice(0, limit);
  if (firebaseRuntimeDisabledReason) return readLocalClaimChecks().slice(0, limit);

  try {
    const snapshot = await db
      .collection("claim_checks")
      .orderBy("created_at", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      storage_provider: "firebase",
      ...doc.data(),
      created_at: localTimestamp(doc.data().created_at),
    }));
  } catch (error) {
    console.warn(`Firebase read failed: ${error.message}`);
    firebaseRuntimeDisabledReason = error.message;
    return readLocalClaimChecks().slice(0, limit);
  }
}

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, {});
  try {
    const data = loadRows();
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const limit = Number(url.searchParams.get("limit") || 10);
    const rawPath = url.pathname;
    const usesApiPrefix = rawPath === "/api" || rawPath.startsWith("/api/");
    const p = usesApiPrefix ? (rawPath === "/api" ? "/" : rawPath.slice(4)) : rawPath;

    if (!usesApiPrefix && (rawPath === "/" || path.extname(rawPath))) {
      return serveFrontend(req, res);
    }

    if (p === "/") return send(res, { message: "ClaimShield AI backend is running", dataset_found: fs.existsSync(DATA_PATH), dataset_path: DATA_PATH });
    if (p === "/health") return send(res, { status: "ok", app: "ClaimShield AI" });
    if (p === "/firebase/status") return send(res, getFirebaseStatus());
    if (p === "/model/status") {
      const model = loadModel();
      return send(res, {
        enabled: true,
        model_path: MODEL_PATH,
        model_type: model.metrics?.model_type,
        trained_rows: model.metrics?.dataset_rows,
        accuracy: model.metrics?.accuracy,
        roc_auc: model.metrics?.roc_auc,
        target_column: model.target_column,
      });
    }
    if (p === "/dashboard/summary") return send(res, summary(data));
    if (p === "/dashboard/recent-suspicious") return send(res, recentSuspicious(data, limit));
    if (p === "/providers/risk") return send(res, providerRisk(data, limit));
    if (p === "/claims") {
      const list = url.searchParams.get("suspicious_only") === "true" ? data.filter(r => Number(r.suspicious_rule_label) === 1) : data;
      return send(res, list.slice(0, limit));
    }
    const claim = p.match(/^\/claims\/(\d+)$/);
    if (claim) {
      const item = data.find(r => Number(r.claim_id) === Number(claim[1]));
      return item ? send(res, item) : send(res, { detail: "Claim not found" }, 404);
    }
    const pred = p.match(/^\/prediction\/claim\/(\d+)$/);
    if (pred) {
      const item = prediction(data, pred[1]);
      if (!item) return send(res, { detail: "Claim not found" }, 404);
      const firebase = await saveClaimCheck(item);
      return send(res, { ...item, firebase });
    }
    if (p === "/prediction/instant") {
      if (req.method !== "POST") return send(res, { detail: "Use POST with new claim JSON data" }, 405);
      const body = await readJsonBody(req);
      const item = instantPrediction(body);
      const firebase = await saveClaimCheck(item);
      return send(res, { ...item, firebase });
    }
    if (p === "/claim-checks") return send(res, await listClaimChecks(limit));
    if (!usesApiPrefix) return serveFrontend(req, res);
    send(res, { detail: "Not found" }, 404);
  } catch (err) {
    console.error(err);
    send(res, { detail: err.message }, 500);
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`ClaimShield AI running at http://127.0.0.1:${PORT}`);
});
