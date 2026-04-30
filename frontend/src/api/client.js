const API_BASE_URL = "http://127.0.0.1:8000";

async function request(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

export function getDashboardSummary() {
  return request("/dashboard/summary");
}

export function getRecentSuspiciousClaims() {
  return request("/dashboard/recent-suspicious?limit=8");
}

export function getProviderRisk() {
  return request("/providers/risk?limit=8");
}

export function getClaimPrediction(claimId) {
  return request(`/prediction/claim/${claimId}`);
}

