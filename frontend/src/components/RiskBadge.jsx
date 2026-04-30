function RiskBadge({ value }) {
  const isRisk = Number(value) === 1;

  return (
    <span className={`risk-badge ${isRisk ? "high" : "low"}`}>
      {isRisk ? "Suspicious" : "Clear"}
    </span>
  );
}

export default RiskBadge;

