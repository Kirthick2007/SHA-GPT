function StatCard({ label, value, tone = "neutral" }) {
  return (
    <section className={`stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

export default StatCard;

