import { useNavigate, useLocation } from "react-router-dom";

const NAV_ITEMS = [
  { path: "/", icon: "💬", label: "对话" },
  { path: "/memory", icon: "🧠", label: "记忆" },
  { path: "/dashboard", icon: "⚙", label: "管理" },
];

export default function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="navbar">
      {NAV_ITEMS.map(({ path, icon, label }) => (
        <button
          key={path}
          className={`navbar-item${location.pathname === path ? " active" : ""}`}
          onClick={() => navigate(path)}
          title={label}
        >
          <span className="navbar-icon">{icon}</span>
          <span className="navbar-label ui-font">{label}</span>
        </button>
      ))}
    </nav>
  );
}
