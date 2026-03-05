import { Routes, Route, Navigate } from "react-router-dom";
import UploadPage from "./pages/UploadPage";
import ProfilePage from "./pages/ProfilePage";
import ETLPage from "./pages/ETLPage";
import ModelPage from "./pages/ModelPage";
import ReportPage from "./pages/ReportPage";

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Navigate to="/upload" replace />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/profile/:runId" element={<ProfilePage />} />
        <Route path="/etl/:runId" element={<ETLPage />} />
        <Route path="/model/:runId" element={<ModelPage />} />
        <Route path="/report/:runId" element={<ReportPage />} />
      </Routes>
    </div>
  );
}
