import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import StageBadge from "../components/StageBadge.jsx";
import { useStages } from "../hooks/useStages.js";
import { formatFollowUp, followUpDueState } from "../utils/followup.js";
import { useAuth } from "../AuthContext.jsx";

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { stages, labelOf, colorIndexOf } = useStages();
  const stageOrder = stages.map((s) => s.key);
  const [lead, setLead] = useState(null);
  const [followups, setFollowups] = useState([]);
  const [calls, setCalls] = useState([]);
  const [stageHistory, setStageHistory] = useState([]);
  const [remarks, setRemarks] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [tab, setTab] = useState("followups");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.getLead(id);
      setLead(res.lead);
      setFollowups(res.followups);
      setCalls(res.calls);
      setStageHistory(res.stageHistory);
      setRemarks(res.remarks || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    api.listUsers().then((res) => setExecutives(res.users)).catch(() => {});
  }, []);

  async function handleStageChange(stage) {
    if (stage === lead.stage) return;
    const remarksText = window.prompt(`Move to "${labelOf(stage)}". Optional remarks:`, "");
    if (remarksText === null) return; // cancelled
    try {
      await api.updateStage(id, { stage, remarks: remarksText });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAssignmentChange(field, value) {
    setError("");
    try {
      await api.updateLead(id, { [field]: value });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteLead() {
    if (!window.confirm("Delete this lead permanently? This cannot be undone.")) return;
    try {
      await api.deleteLead(id);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p>Loading...</p>;
  if (!lead) return <p>Lead not found.</p>;

  return (
    <div>
      <div className="card">
        <div className="lead-header">
          <div>
            <h1>{lead.name}</h1>
            <div className="meta-line">{lead.phone || "no phone"} · {lead.email || "no email"}</div>
            <div className="meta-line">{lead.address}</div>
            <div className="meta-line">Source: {lead.source || "-"}</div>
            <div className="meta-line" style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 6 }}>
              <span>
                Assigned To{" "}
                <select
                  value={lead.assigned_to || ""}
                  onChange={(e) => handleAssignmentChange("assigned_to", e.target.value)}
                  style={{ width: "auto", display: "inline-block" }}
                >
                  <option value="">Unassigned</option>
                  {executives.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </span>
              <span>
                Handling By{" "}
                <select
                  value={lead.handling_by || ""}
                  onChange={(e) => handleAssignmentChange("handling_by", e.target.value)}
                  style={{ width: "auto", display: "inline-block" }}
                >
                  <option value="">Unassigned</option>
                  {executives.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </span>
            </div>
            <div className="meta-line">Created {lead.created_at} by {lead.created_by_name || "-"} · Last updated {lead.updated_at}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <StageBadge stage={lead.stage} label={labelOf(lead.stage)} colorIndex={colorIndexOf(lead.stage)} />
            <div className="meta-line">since {lead.stage_updated_at}</div>
            {user?.role === "admin" && (
              <button className="danger" style={{ marginTop: 8 }} onClick={handleDeleteLead}>Delete Lead</button>
            )}
          </div>
        </div>

        <div className="stage-picker">
          {stageOrder.map((s) => (
            <button
              key={s}
              className={s === lead.stage ? "current" : ""}
              onClick={() => handleStageChange(s)}
            >
              {labelOf(s)}
            </button>
          ))}
        </div>
        {lead.notes && <p style={{ marginTop: 14 }}>{lead.notes}</p>}
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="card">
        <div className="tabs">
          <button className={tab === "followups" ? "active" : ""} onClick={() => setTab("followups")}>
            Follow-ups ({followups.length})
          </button>
          <button className={tab === "calls" ? "active" : ""} onClick={() => setTab("calls")}>
            Call Log ({calls.length})
          </button>
          <button className={tab === "remarks" ? "active" : ""} onClick={() => setTab("remarks")}>
            Remarks ({remarks.length})
          </button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
            Stage History ({stageHistory.length})
          </button>
        </div>

        {tab === "followups" && (
          <FollowupsPanel leadId={id} followups={followups} onChange={load} />
        )}
        {tab === "calls" && <CallsPanel leadId={id} calls={calls} onChange={load} />}
        {tab === "remarks" && <RemarksPanel leadId={id} remarks={remarks} onChange={load} />}
        {tab === "history" && <HistoryPanel history={stageHistory} labelOf={labelOf} />}
      </div>
    </div>
  );
}

function FollowupsPanel({ leadId, followups, onChange }) {
  const [date, setDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");

  async function handleAdd(e) {
    e.preventDefault();
    if (!date) return;
    setError("");
    try {
      await api.addFollowup(leadId, { follow_up_date: date, remarks });
      setDate("");
      setRemarks("");
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function markDone(followupId) {
    try {
      await api.updateFollowup(leadId, followupId, { status: "done" });
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <form className="inline-form" onSubmit={handleAdd}>
        <div className="field" style={{ maxWidth: 220 }}>
          <label>Follow-up date &amp; time</label>
          <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field">
          <label>Remarks</label>
          <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="What to discuss / why" />
        </div>
        <button type="submit">Add Follow-up</button>
      </form>
      {error && <div className="error-text">{error}</div>}

      {followups.map((f) => {
        const due = followUpDueState(f.follow_up_date);
        return (
          <div className="list-item" key={f.id}>
            <div className="top-row">
              <span className={f.status === "pending" && due.isDue ? "pending" : f.status === "done" ? "done" : ""}>
                {formatFollowUp(f.follow_up_date)} · {f.status}
              </span>
              <span>{f.created_by_name}</span>
            </div>
            {f.remarks && <div className="body-text">{f.remarks}</div>}
            {f.status === "pending" && (
              <button className="secondary" style={{ marginTop: 6 }} onClick={() => markDone(f.id)}>
                Mark Done
              </button>
            )}
          </div>
        );
      })}
      {followups.length === 0 && <p style={{ color: "#64748b" }}>No follow-ups yet.</p>}
    </div>
  );
}

function CallsPanel({ leadId, calls, onChange }) {
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");

  async function handleAdd(e) {
    e.preventDefault();
    if (!response.trim()) return;
    setError("");
    try {
      await api.addCall(leadId, { customer_response: response });
      setResponse("");
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <form className="inline-form" onSubmit={handleAdd}>
        <div className="field">
          <label>What did the customer say?</label>
          <input value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Log the outcome of your call" />
        </div>
        <button type="submit">Log Call</button>
      </form>
      {error && <div className="error-text">{error}</div>}

      {calls.map((c) => (
        <div className="list-item" key={c.id}>
          <div className="top-row">
            <span>{c.call_date}</span>
            <span>{c.executive_name}</span>
          </div>
          <div className="body-text">{c.customer_response}</div>
        </div>
      ))}
      {calls.length === 0 && <p style={{ color: "#64748b" }}>No calls logged yet.</p>}
    </div>
  );
}

// Every submission adds a brand-new remark row rather than overwriting the last one,
// so the lead keeps a running, timestamped history of everything noted about it.
function RemarksPanel({ leadId, remarks, onChange }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      await api.addRemark(leadId, { remark_text: text });
      setText("");
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form className="inline-form" onSubmit={handleAdd}>
        <div className="field">
          <label>Add a new remark</label>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a new remark..." />
        </div>
        <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Add Remark"}</button>
      </form>
      {error && <div className="error-text">{error}</div>}

      {remarks.map((r) => (
        <div className="list-item" key={r.id}>
          <div className="top-row">
            <span>{r.created_at}</span>
            <span>{r.created_by_name}</span>
          </div>
          <div className="body-text">{r.remark_text}</div>
        </div>
      ))}
      {remarks.length === 0 && <p style={{ color: "#64748b" }}>No remarks yet.</p>}
    </div>
  );
}

function HistoryPanel({ history, labelOf }) {
  return (
    <div>
      {history.map((h) => (
        <div className="list-item" key={h.id}>
          <div className="top-row">
            <span>{h.changed_at}</span>
            <span>{h.changed_by_name}</span>
          </div>
          <div className="body-text">
            {h.old_stage ? `${labelOf(h.old_stage)} → ` : ""}
            {labelOf(h.new_stage)}
          </div>
          {h.remarks && <div className="body-text">{h.remarks}</div>}
        </div>
      ))}
      {history.length === 0 && <p style={{ color: "#64748b" }}>No history yet.</p>}
    </div>
  );
}
