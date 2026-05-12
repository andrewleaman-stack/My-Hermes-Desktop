import { useNavigate, useLocation } from "react-router-dom";
import { useTheme, type Theme } from "../hooks/useTheme";
import Icon from "./Icon";

const NAV_ITEMS = [
  { path: "/", icon: "message", label: "对话" },
  { path: "/memory", icon: "brain", label: "记忆" },
  { path: "/dashboard", icon: "dashboard", label: "管理" },
] as const;

const THEME_META: Record<Theme, { icon: "command" | "spark"; title: string }> = {
  claude: { icon: "spark", title: "切换到 Apple 风格" },
  apple:  { icon: "command", title: "切换到 Claude 风格" },
};

export default function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggle } = useTheme();

  return (
    <nav className="navbar">
      {NAV_ITEMS.map(({ path, icon, label }) => (
        <button
          key={path}
          className={`navbar-item${location.pathname === path ? " active" : ""}`}
          onClick={() => navigate(path)}
          title={label}
        >
          <Icon name={icon} className="navbar-icon" size={17} />
          <span className="navbar-label ui-font">{label}</span>
        </button>
      ))}

      <div className="navbar-spacer" />

      <button
        className="navbar-theme-btn"
        onClick={toggle}
        title={THEME_META[theme].title}
      >
        <Icon name={THEME_META[theme].icon} size={17} />
        <span className="theme-dot" />
      </button>
    </nav>
  );
}
