import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useStatuses } from "../hooks/useStatuses.js";

export default function NewLead() {
  const navigate = useNavigate();
  const { statuses } = useStatuses();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    source: "",
    notes: "",
    status: "",
    assigned_to: "",
    handling_by: "",
  });
  const [executives, setExecutives] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listUsers().then((res) => setExecutives(res.users)).catch(() => {});
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { lead } = await api.createLead(form);
      navigate(`/leads/${lead.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>New Customer / Lead</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="full">
            <label>Customer Name *</label>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} required autoFocus />
          </div>
          <div>
            <label>Phone</label>
            <input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Must be unique — no two leads can share a phone number</div>
          </div>
          <div>
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div className="full">
            <label>Address</label>
            <input value={form.address} onChange={(e) => update("address", e.target.value)} />
          </div>
          <div>
            <label>Lead Source</label>
            <input placeholder="Referral, Walk-in, Website..." value={form.source} onChange={(e) => update("source", e.target.value)} />
          </div>
          <div>
            <label>Status</label>
            <select value={form.status} onChange={(e) => update("status", e.target.value)}>
              <option value="">Not set</option>
              {statuses.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Assign To</label>
            <select value={form.assigned_to} onChange={(e) => update("assigned_to", e.target.value)}>
              <option value="">Unassigned</option>
              {executives.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Handling By</label>
            <select value={form.handling_by} onChange={(e) => update("handling_by", e.target.value)}>
              <option value="">Unassigned</option>
              {executives.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="full">
            <label>Notes</label>
            <textarea rows={3} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Create Lead"}</button>
          <button type="button" className="secondary" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
