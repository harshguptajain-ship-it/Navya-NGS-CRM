import React, { useState } from "react";
import { api } from "../api";
import { useStages } from "../hooks/useStages.js";

export default function Stages() {
  const { stages, loading, reload } = useStages();
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
      await api.createStage({ label: newLabel.trim() });
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
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    setError("");
    try {
      await api.reorderStages(next.map((s) => s.key));
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
      await api.renameStage(key, { label: editLabel.trim() });
      setEditingKey(null);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(key, label) {
    if (!window.confirm(`Delete stage "${label}"? This only works if no leads are currently on it.`)) return;
    setError("");
    try {
      await api.deleteStage(key);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <div className="card" style={{ maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>Add Stage</h2>
        <form className="inline-form" onSubmit={handleAdd}>
          <div className="field">
            <label>Label</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Interested, Not Interested"
              required
            />
          </div>
          <button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Add Stage"}</button>
        </form>
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Stages ({stages.length})</h2>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: -8 }}>
          This is the order leads move through everywhere in the app. Use the arrows to rearrange.
          A stage can only be deleted while no lead is currently on it.
        </p>
        <table>
          <thead>
            <tr>
              <th style={{ width: 90 }}>Order</th>
              <th>Label</th>
              <th style={{ textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s, i) => (
              <tr key={s.key}>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    disabled={i === 0}
                    onClick={() => handleMove(i, -1)}
                    title="Move up"
                  >
                    ↑
                  </button>{" "}
                  <button
                    type="button"
                    className="secondary"
                    disabled={i === stages.length - 1}
                    onClick={() => handleMove(i, 1)}
                    title="Move down"
                  >
                    ↓
                  </button>
                </td>
                <td>
                  {editingKey === s.key ? (
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        style={{ width: "auto" }}
                        autoFocus
                      />
                      <button type="button" onClick={() => handleRename(s.key)}>Save</button>
                      <button type="button" className="secondary" onClick={() => setEditingKey(null)}>Cancel</button>
                    </span>
                  ) : (
                    s.label
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
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
  );
}
