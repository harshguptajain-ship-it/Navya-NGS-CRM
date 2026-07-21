import React, { useEffect, useState } from "react";
import { api } from "../api";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "executive" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Since</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
