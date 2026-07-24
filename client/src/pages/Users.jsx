import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext.jsx";
import { formatDateTime } from "../utils/followup.js";

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "executive" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", password: "", role: "executive" });
  const [rowError, setRowError] = useState("");

  async function load() {
    const res = await api.listUsers();
    setUsers(res.users);
  }

  useEffect(() => {
    load();
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.createUser(form);
      setForm({ name: "", email: "", password: "", role: "executive" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(u) {
    setRowError("");
    setEditingId(u.id);
    setEditForm({ name: u.name, email: u.email, password: "", role: u.role });
  }

  function updateEdit(field, value) {
    setEditForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSaveEdit(id) {
    setRowError("");
    try {
      const payload = { name: editForm.name, email: editForm.email, role: editForm.role };
      if (editForm.password.trim()) payload.password = editForm.password.trim();
      await api.updateUser(id, payload);
      setEditingId(null);
      await load();
    } catch (err) {
      setRowError(err.message);
    }
  }

  async function handleDelete(u) {
    if (!window.confirm(`Delete ${u.name}? This only works if they have no leads or activity linked to them.`)) return;
    setRowError("");
    try {
      await api.deleteUser(u.id);
      await load();
    } catch (err) {
      setRowError(err.message);
    }
  }

  return (
    <div>
      <div className="card" style={{ maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>Add Executive</h2>
        <form onSubmit={handleSubmit}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Name</label>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Password</label>
            <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Role</label>
            <select value={form.role} onChange={(e) => update("role", e.target.value)}>
              <option value="executive">Executive</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <div className="error-text">{error}</div>}
          <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Create User"}</button>
        </form>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Team</h2>
        {rowError && <div className="error-text">{rowError}</div>}
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Since</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              editingId === u.id ? (
                <tr key={u.id}>
                  <td><input value={editForm.name} onChange={(e) => updateEdit("name", e.target.value)} /></td>
                  <td><input type="email" value={editForm.email} onChange={(e) => updateEdit("email", e.target.value)} /></td>
                  <td>
                    <select value={editForm.role} onChange={(e) => updateEdit("role", e.target.value)}>
                      <option value="executive">Executive</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td colSpan={2}>
                    <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="password"
                        placeholder="New password (optional)"
                        value={editForm.password}
                        onChange={(e) => updateEdit("password", e.target.value)}
                        style={{ width: 170 }}
                      />
                      <button type="button" onClick={() => handleSaveEdit(u.id)}>Save</button>
                      <button type="button" className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
                    </span>
                  </td>
                </tr>
              ) : (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{formatDateTime(u.created_at)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button type="button" className="secondary" onClick={() => startEdit(u)}>Edit</button>{" "}
                    <button
                      type="button"
                      className="danger"
                      disabled={u.id === me?.id}
                      title={u.id === me?.id ? "You can't delete your own account" : ""}
                      onClick={() => handleDelete(u)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
