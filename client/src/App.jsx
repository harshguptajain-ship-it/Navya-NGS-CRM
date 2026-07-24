import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import NewLead from "./pages/NewLead.jsx";
import LeadDetail from "./pages/LeadDetail.jsx";
import Users from "./pages/Users.jsx";
import Stages from "./pages/Stages.jsx";
import ClosedCases from "./pages/ClosedCases.jsx";
import PremiumLeads from "./pages/PremiumLeads.jsx";
import FollowUps from "./pages/FollowUps.jsx";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-message">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/leads/new" element={<Protected><NewLead /></Protected>} />
      <Route path="/leads/:id" element={<Protected><LeadDetail /></Protected>} />
      <Route path="/closed-cases" element={<Protected><ClosedCases /></Protected>} />
      <Route path="/premium-leads" element={<Protected><PremiumLeads /></Protected>} />
      <Route path="/follow-ups" element={<Protected><FollowUps /></Protected>} />
      <Route path="/users" element={<Protected><Users /></Protected>} />
      <Route path="/stages" element={<Protected><Stages /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
