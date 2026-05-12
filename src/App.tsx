import { HashRouter, Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import ChatPage from "./pages/ChatPage";
import MemoryPage from "./pages/MemoryPage";
import DashboardPage from "./pages/DashboardPage";

export default function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <NavBar />
        <div className="page-area">
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
}
