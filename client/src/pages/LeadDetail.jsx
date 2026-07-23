import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import StageBadge from "../components/StageBadge.jsx";
import { useStages } from "../hooks/useStages.js";
import { useStatuses } from "../hooks/useStatuses.js";
import { formatFollowUp, followUpDueState } from "../utils/followup.js";
import { submitOnEnter } from "../utils/keyboard.js";
import { useAuth } from "../AuthContext.jsx";

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { stages, labelOf, colorIndexOf } = useStages();
  const { statuses } = useStatuses();
  const stageOrder = stages.map((s) => s.key);
  const [lead, setLead] = useState(null);
  const [followups, setFollowups] = useState([]);
  const [calls, setCalls] = useState([]);
  const [stageHistory, setStageHistory] = useState([]);
  const [remarks, setRemarks] = useState([]);
  const [adminNotes, setAdminNotes] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [tab, setTab] = useState("notes");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Executives can hand a lead up to an admin but not sideways to a peer —
  // this list is what they get to choose from in the Assigned To picker.
  // Admins keep the full team.
  const assignableExecutives = isAdmin ? executives : executives.filter((u) => u.role === "admin");

  // Every remark-like note about this lead — from the Remarks tab (which now
  // also gets an auto-generated entry for every field edit and stage change),
  // a follow-up's note, or a call's logged response — merged into one
  // reverse-chronological view so nothing gets missed by only checking one tab.
  // (Stage History entries aren't included here since every one of them now
  // has an equivalent auto-generated remark, avoiding duplicate entries.)
  const allNotes = useMemo(() => {
    const items = [];
    remarks.forEach((r) =>
      items.push({ id: `remark-${r.id}`, type: "Remark", ts: r.created_at, by: r.created_by_name, text: r.remark_text })
    );
    followups.forEach((f) => {
      if (f.remarks) items.push({ id: `followup-${f.id}`, type: "Follow-up", ts: f.created_at, by: f.created_by_name, text: f.remarks });
    });
    calls.forEach((c) => {
      if (c.customer_response) items.push({ id: `call-${c.id}`, type: "Call", ts: c.call_date, by: c.executive_name, text: c.customer_response });
    });
    return items.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  }, [remarks, followups, calls]);

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

  // Admin notes are a completely separate, admin-only endpoint — an executive
  // never even issues this request, let alone sees a response from it.
  async function loadAdminNotes() {
    try {
      const res = await api.listAdminNotes(id);
      setAdminNotes(res.notes);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (isAdmin) loadAdminNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin]);

  useEffect(() => {
    api.listUsers().then((res) => setExecutives(res.users)).catch(() => {});
  }, []);

  const [pendingStage, setPendingStage] = useState(null);
  const [stageRemarksText, setStageRemarksText] = useState("");

  function openStageChange(stage) {
    if (stage === lead.stage) return;
    setPendingStage(stage);
    setStageRemarksText("");
  }

  async function confirmStageChange() {
    try {
      await api.updateStage(id, { stage: pendingStage, remarks: stageRemarksText });
      setPendingStage(null);
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

  async function handleSaveDetails(form) {
    await api.updateLead(id, form);
    setEditing(false);
    await load();
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
        {editing ? (
          <EditLeadForm lead={lead} onSave={handleSaveDetails} onCancel={() => setEditing(false)} />
        ) : (
          <div className="lead-header">
            <div>
              <h1>{lead.name}</h1>
              <div className="meta-line">{lead.phone || "no phone"} · {lead.email || "no email"}</div>
              <div className="meta-line">{lead.address}</div>
              <div className="meta-line">Source: {lead.source || "-"}</div>
              <div className="meta-line" style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                <span>
                  Assigned To{" "}
                  <select
                    value={lead.assigned_to || ""}
                    onChange={(e) => handleAssignmentChange("assigned_to", e.target.value)}
                    style={{ width: "auto", display: "inline-block" }}
                  >
                    <option value="">Unassigned</option>
                    {assignableExecutives.map((u) => (
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
                <span>
                  Status{" "}
                  <select
                    value={lead.status || ""}
                    onChange={(e) => handleAssignmentChange("status", e.target.value)}
                    style={{ width: "auto", display: "inline-block" }}
                  >
                    <option value="">Not set</option>
                    {statuses.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </span>
              </div>
              <div className="meta-line">Created {lead.created_at} by {lead.created_by_name || "-"} · Last updated {lead.updated_at}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <StageBadge stage={lead.stage} label={labelOf(lead.stage)} colorIndex={colorIndexOf(lead.stage)} />
              <div className="meta-line">since {lead.stage_updated_at}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                <button className="secondary" onClick={() => setEditing(true)}>Edit Details</button>
                {user?.role === "admin" && (
                  <button className="danger" onClick={handleDeleteLead}>Delete Lead</button>
                )}
              </div>
            </div>
          </div>
        )}

        {!editing && (
          <>
            <div className="stage-picker">
              {stageOrder.map((s) => (
                <button
                  key={s}
                  className={s === lead.stage ? "current" : ""}
                  onClick={() => openStageChange(s)}
                >
                  {labelOf(s)}
                </button>
              ))}
            </div>
            {lead.notes && <p style={{ marginTop: 14 }}>{lead.notes}</p>}
          </>
        )}
      </div>

      {pendingStage && (
        <StageChangeModal
          stageLabel={labelOf(pendingStage)}
          text={stageRemarksText}
          onTextChange={setStageRemarksText}
          onConfirm={confirmStageChange}
          onCancel={() => setPendingStage(null)}
        />
      )}

      {error && <div className="error-text">{error}</div>}

      <div className="card">
        <div className="tabs">
          <button className={tab === "notes" ? "active" : ""} onClick={() => setTab("notes")}>
            All Notes ({allNotes.length})
          </button>
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
          {isAdmin && (
            <button className={tab === "adminNotes" ? "active" : ""} onClick={() => setTab("adminNotes")}>
              Admin Notes ({adminNotes.length})
            </button>
          )}
        </div>

        {tab === "notes" && <AllNotesPanel notes={allNotes} />}
        {tab === "followups" && (
          <FollowupsPanel leadId={id} followups={followups} onChange={load} />
        )}
        {tab === "calls" && <CallsPanel leadId={id} calls={calls} onChange={load} />}
        {tab === "remarks" && (
          <RemarksPanel leadId={id} remarks={remarks} onChange={load} isAdmin={isAdmin} />
        )}
        {tab === "history" && <HistoryPanel history={stageHistory} labelOf={labelOf} />}
        {tab === "adminNotes" && isAdmin && (
          <AdminNotesPanel leadId={id} notes={adminNotes} onChange={loadAdminNotes} />
        )}
      </div>
    </div>
  );
}

// Saving here always goes through PUT /leads/:id, which auto-generates a
// remark describing exactly which fields changed and what they changed from/to.
function EditLeadForm({ lead, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: lead.name || "",
    phone: lead.phone || "",
    email: lead.email || "",
    address: lead.address || "",
    source: lead.source || "",
    notes: lead.notes || "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 style={{ marginTop: 0 }}>Edit Lead Details</h2>
      <div className="form-grid">
        <div className="full">
          <label>Customer Name *</label>
          <input value={form.name} onChange={(e) => update("name", e.target.value)} required autoFocus />
        </div>
        <div>
          <label>Phone</label>
          <input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
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
          <input value={form.source} onChange={(e) => update("source", e.target.value)} />
        </div>
        <div className="full">
          <label>Notes</label>
          <textarea rows={3} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save Changes"}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function StageChangeModal({ stageLabel, text, onTextChange, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Move to &quot;{stageLabel}&quot;</h3>
        <label>Optional remarks</label>
        <textarea
          rows={4}
          autoFocus
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={submitOnEnter(onConfirm)}
          placeholder="What's the update? (Shift+Enter for a new line)"
        />
        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <button type="button" onClick={onConfirm}>Confirm</button>
          <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AllNotesPanel({ notes }) {
  return (
    <div>
      {notes.map((n) => (
        <div className="list-item" key={n.id}>
          <div className="top-row">
            <span><strong>{n.type}</strong> · {n.ts}</span>
            <span>{n.by}</span>
          </div>
          <div className="body-text">{n.text}</div>
        </div>
      ))}
      {notes.length === 0 && <p style={{ color: "#64748b" }}>No remarks, follow-up notes, or call notes yet.</p>}
    </div>
  );
}

function FollowupsPanel({ leadId, followups, onChange }) {
  const [date, setDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");

  async function handleAdd(e) {
    if (e) e.preventDefault();
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
          <textarea
            rows={1}
            className="autosize-textarea"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            onKeyDown={submitOnEnter(() => handleAdd())}
            placeholder="What to discuss / why (Shift+Enter for a new line)"
          />
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
    if (e) e.preventDefault();
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
          <textarea
            rows={1}
            className="autosize-textarea"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            onKeyDown={submitOnEnter(() => handleAdd())}
            placeholder="Log the outcome of your call (Shift+Enter for a new line)"
          />
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
// Editing/deleting an existing remark is admin-only — anyone can add one.
function RemarksPanel({ leadId, remarks, onChange, isAdmin }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  async function handleAdd(e) {
    if (e) e.preventDefault();
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

  function startEdit(r) {
    setEditingId(r.id);
    setEditText(r.remark_text);
  }

  async function handleSaveEdit(remarkId) {
    if (!editText.trim()) return;
    setError("");
    try {
      await api.updateRemark(leadId, remarkId, { remark_text: editText.trim() });
      setEditingId(null);
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(remarkId) {
    if (!window.confirm("Delete this remark permanently?")) return;
    setError("");
    try {
      await api.deleteRemark(leadId, remarkId);
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <form className="inline-form" onSubmit={handleAdd}>
        <div className="field">
          <label>Add a new remark</label>
          <textarea
            rows={1}
            className="autosize-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={submitOnEnter(() => handleAdd())}
            placeholder="Write a new remark... (Shift+Enter for a new line)"
          />
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
          {editingId === r.id ? (
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <textarea
                rows={2}
                className="autosize-textarea"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={submitOnEnter(() => handleSaveEdit(r.id))}
                autoFocus
              />
              <button type="button" onClick={() => handleSaveEdit(r.id)}>Save</button>
              <button type="button" className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          ) : (
            <>
              <div className="body-text">{r.remark_text}</div>
              {isAdmin && (
                <div style={{ marginTop: 6 }}>
                  <button className="secondary" onClick={() => startEdit(r)}>Edit</button>{" "}
                  <button className="danger" onClick={() => handleDelete(r.id)}>Delete</button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
      {remarks.length === 0 && <p style={{ color: "#64748b" }}>No remarks yet.</p>}
    </div>
  );
}

// This whole tab only ever renders for an admin (gated in the parent), so
// there's no per-item permission check here the way RemarksPanel needs one —
// anyone who can see this panel at all can add/edit/delete freely.
function AdminNotesPanel({ leadId, notes, onChange }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  async function handleAdd(e) {
    if (e) e.preventDefault();
    if (!text.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      await api.addAdminNote(leadId, { note_text: text });
      setText("");
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(n) {
    setEditingId(n.id);
    setEditText(n.note_text);
  }

  async function handleSaveEdit(noteId) {
    if (!editText.trim()) return;
    setError("");
    try {
      await api.updateAdminNote(leadId, noteId, { note_text: editText.trim() });
      setEditingId(null);
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(noteId) {
    if (!window.confirm("Delete this note permanently?")) return;
    setError("");
    try {
      await api.deleteAdminNote(leadId, noteId);
      onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <p style={{ color: "#64748b", fontSize: 13, marginTop: -4 }}>
        Only admins can see this tab — executives have no visibility into these notes at all.
      </p>
      <form className="inline-form" onSubmit={handleAdd}>
        <div className="field">
          <label>Add an admin note</label>
          <textarea
            rows={1}
            className="autosize-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={submitOnEnter(() => handleAdd())}
            placeholder="Write a private note... (Shift+Enter for a new line)"
          />
        </div>
        <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Add Note"}</button>
      </form>
      {error && <div className="error-text">{error}</div>}

      {notes.map((n) => (
        <div className="list-item" key={n.id}>
          <div className="top-row">
            <span>{n.created_at}</span>
            <span>{n.created_by_name}</span>
          </div>
          {editingId === n.id ? (
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <textarea
                rows={2}
                className="autosize-textarea"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={submitOnEnter(() => handleSaveEdit(n.id))}
                autoFocus
              />
              <button type="button" onClick={() => handleSaveEdit(n.id)}>Save</button>
              <button type="button" className="secondary" onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          ) : (
            <>
              <div className="body-text">{n.note_text}</div>
              <div style={{ marginTop: 6 }}>
                <button className="secondary" onClick={() => startEdit(n)}>Edit</button>{" "}
                <button className="danger" onClick={() => handleDelete(n.id)}>Delete</button>
              </div>
            </>
          )}
        </div>
      ))}
      {notes.length === 0 && <p style={{ color: "#64748b" }}>No admin notes yet.</p>}
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
