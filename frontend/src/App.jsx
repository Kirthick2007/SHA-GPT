import { Activity, FileSearch, LayoutDashboard, ShieldCheck } from "lucide-react";

import Dashboard from "./pages/Dashboard.jsx";

function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <ShieldCheck size={28} />
          <div>
            <h1>ClaimShield AI</h1>
            <p>Fraud risk console</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          <button className="nav-item active" type="button">
            <LayoutDashboard size={18} />
            Dashboard
          </button>
          <button className="nav-item" type="button">
            <FileSearch size={18} />
            Claims
          </button>
          <button className="nav-item" type="button">
            <Activity size={18} />
            Providers
          </button>
        </nav>
      </aside>

      <Dashboard />
    </main>
  );
}

export default App;

