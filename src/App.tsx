import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import NavBar from "./components/NavBar";
import ChatPage from "./pages/ChatPage";
import MemoryPage from "./pages/MemoryPage";
import DashboardPage from "./pages/DashboardPage";

// ChatPage holds long-lived per-session state (running chats, queues, the
// hermes:chunk listener). Unmounting it on route change would orphan running
// hermes processes — their output chunks would arrive but no one would
// consume them. Keep ChatPage permanently mounted; toggle visibility via CSS.
function AppShell() {
  const location = useLocation();
  const isChat = location.pathname === "/";

  return (
    <div className="app-shell">
      <NavBar />
      <div className="page-area">
        <div className="chat-page-host" style={{ display: isChat ? "block" : "none" }}>
          <ChatPage />
        </div>
        {!isChat && (
          <Routes>
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
          </Routes>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
