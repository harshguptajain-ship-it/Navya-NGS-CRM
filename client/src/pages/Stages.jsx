import React, { useState } from "react";
import { api } from "../api";
import { useStages } from "../hooks/useStages.js";
import { useStatuses } from "../hooks/useStatuses.js";

// Stages and Status are two separate, admin-managed key/label lists with an
// identical shape (add / rename / reorder / delete), so both panels below are
// rendered by the same generic manager.
function OptionListManager({ title, items, loading, reload, placeholder, helpText, onCreate, onRename, onDelete, onReorder }) {
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editLabel, setEditLabel] = useState("");

  async function handleAdd(e) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      await onCreate(newLabel.trim());
      setNewLabel("");
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMove(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setError("");
    try {
      await onReorder(next.map((s) => s.key));
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(s) {
    setEditingKey(s.key);
    setEditLabel(s.label);
  }

  async function handleRename(key) {
    if (!editLabel.trim()) return;
    setError("");
    try {
      await onRename(key, editLabel.trim());
      setEditingKey(null);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(key, label) {
    if (!window.confirm(`Delete "${label}"? This only works if no leads are currently using it.`)) return;
    setError("");
    try {
      await onDelete(key);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <>
      <div className="card" style={{ maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>Add {title}</h2>
        <form className="inline-form" onSubmit={handleAdd}>
          <div className="field">
            <label>Label</label>
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={placeholder} required />
          </div>
          <button type="submit" disabled={submitting}>{submitting ? "Saving..." : `Add ${title}`}</button>
        </form>
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{title} ({items.length})</h2>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: -8 }}>{helpText}</p>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Order</th>
                <th>Label</th>
                <th style={{ textAlign: "right" }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s, i) => (
                <tr key={s.key}>
                  <td className="nowrap">
                    <button type="button" className="secondary" disabled={i === 0} onClick={() => handleMove(i, -1)} title="Move up">↑</button>{" "}
                    <button type="button" className="secondary" disabled={i === items.length - 1} onClick={() => handleMove(i, 1)} title="Move down">↓</button>
                  </td>
                  <td>
                    {editingKey === s.key ? (
                      <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={{ width: "auto" }} autoFocus />
                        <button type="button" onClick={() => handleRename(s.key)}>Save</button>
                        <button type="button" className="secondary" onClick={() => setEditingKey(null)}>Cancel</button>
                      </span>
                    ) : (
                      s.label
                    )}
                  </td>
                  <td style={{ textAlign: "right" }} className="nowrap">
                    {editingKey !== s.key && (
                      <>
                        <button type="button" className="secondary" onClick={() => startEdit(s)}>Rename</button>{" "}
                        <button type="button" className="danger" onClick={() => handleDelete(s.key, s.label)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default function Stages() {
  const { stages, loading: stagesLoading, reload: reloadStages } = useStages();
  const { statuses, loading: statusesLoading, reload: reloadStatuses } = useStatuses();

  return (
    <div>
      <OptionListManager
        title="Stage"
        items={stages}
        loading={stagesLoading}
        reload={reloadStages}
        placeholder="e.g. Ready - Documents Requested"
        helpText="The pipeline a lead moves through — this order is used everywhere in the app. Use the arrows to rearrange. A stage can only be deleted while no lead is currently on it."
        onCreate={(label) => api.createStage({ label })}
        onRename={(key, label) => api.renameStage(key, { label })}
        onDelete={(key) => api.deleteStage(key)}
        onReorder={(order) => api.reorderStages(order)}
      />

      <OptionListManager
        title="Status"
        items={statuses}
        loading={statusesLoading}
        reload={reloadStatuses}
        placeholder="e.g. Interested, Not Interested"
        helpText="A lead's interest/outcome — separate from its stage, so a lead can be, say, 'Follow-up in Progress' and 'Interested' at the same time. Optional; settable when creating or editing a lead."
        onCreate={(label) => api.createStatus({ label })}
        onRename={(key, label) => api.renameStatus(key, { label })}
        onDelete={(key) => api.deleteStatus(key)}
        onReorder={(order) => api.reorderStatuses(order)}
      />
    </div>
  );
}
