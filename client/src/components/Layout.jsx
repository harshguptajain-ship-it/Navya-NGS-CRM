import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import Logo from "./Logo.jsx";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><Logo size={30} textSize={15} /></div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/leads/new">New Lead</NavLink>
          <NavLink to="/closed-cases">Closed Cases</NavLink>
          <NavLink to="/premium-leads">Premium Leads</NavLink>
          {user?.role === "admin" && <NavLink to="/users">Executives</NavLink>}
          {user?.role === "admin" && <NavLink to="/stages">Stages &amp; Status</NavLink>}
        </nav>
        <div className="user-box">
          <span>{user?.name} <em>({user?.role})</em></span>
          <button onClick={handleLogout}>Log out</button>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
