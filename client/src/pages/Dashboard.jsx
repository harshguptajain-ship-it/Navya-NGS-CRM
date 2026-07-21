import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import StageBadge, { STAGE_LABELS } from "../components/StageBadge.jsx";
import { formatFollowUp, followUpDueState } from "../utils/followup.js";

const STAGE_ORDER = Object.keys(STAGE_LABELS);

export default function Dashboard() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [sources, setSources] = useState([]);
  const [stageFilter, setStageFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [handlingFilter, setHandlingFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [leadsRes, upcomingRes] = await Promise.all([
        api.listLeads({
          stage: stageFilter,
          assigned_to: assignedFilter,
          handling_by: handlingFilter,
          source: sourceFilter,
          q: search,
        }),
        api.upcomingFollowups(),
      ]);
      setLeads(leadsRes.leads);
      setUpcoming(upcomingRes.followups);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.listUsers().then((res) => setExecutives(res.users)).catch(() => {});
    api.listSources().then((res) => setSources(res.sources)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageFilter, assignedFilter, handlingFilter, sourceFilter]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    load();
  }

  async function handleExport() {
    setExporting(true);
    setError("");
    try {
      await api.exportLeads({
        stage: stageFilter,
        assigned_to: assignedFilter,
        handling_by: handlingFilter,
        source: sourceFilter,
        q: search,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  const counts = useMemo(() => {
    const c = {};
    for (const s of STAGE_ORDER) c[s] = 0;
    for (const l of leads) c[l.stage] = (c[l.stage] || 0) + 1;
    return c;
  }, [leads]);

  return (
    <div>
      <div className="stat-row">
        {STAGE_ORDER.map((s) => (
          <div
            className="stat-box"
            key={s}
            style={{ cursor: "pointer", outline: stageFilter === s ? "2px solid #2563eb" : "none" }}
            onClick={() => setStageFilter(stageFilter === s ? "" : s)}
          >
            <div className="num">{counts[s]}</div>
            <div className="label">{STAGE_LABELS[s]}</div>
          </div>
        ))}
      </div>

      {upcoming.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Upcoming / Overdue Follow-ups</h3>
          {upcoming.slice(0, 8).map((f) => {
            const due = followUpDueState(f.follow_up_date);
            return (
              <div className="list-item" key={f.id}>
                <div className="top-row">
                  <span className={due.isDue ? "pending" : ""}>
                    {formatFollowUp(f.follow_up_date)} {due.label ? `(${due.label})` : ""}
                  </span>
                  <Link to={`/leads/${f.lead_id}`}>{f.lead_name} ({f.lead_phone})</Link>
                </div>
                {f.remarks && <div className="body-text">{f.remarks}</div>}
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <form className="toolbar" onSubmit={handleSearchSubmit}>
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="">All stages</option>
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
            ))}
          </select>
          <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)}>
            <option value="">All executives (assigned to)</option>
            {executives.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select value={handlingFilter} onChange={(e) => setHandlingFilter(e.target.value)}>
            <option value="">All executives (handling by)</option>
            {executives.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input placeholder="Search name / phone / email" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="submit">Search</button>
          <Link to="/leads/new"><button type="button">+ New Lead</button></Link>
          <button type="button" className="secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Download Excel"}
          </button>
        </form>

        {error && <div className="error-text">{error}</div>}
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Source</th>
                  <th>Stage</th>
                  <th>Next Follow-up</th>
                  <th>Assigned To</th>
                  <th>Handling By</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} onClick={() => navigate(`/leads/${l.id}`)} style={{ cursor: "pointer" }}>
                    <td>{l.name}</td>
                    <td>{l.phone || "-"}</td>
                    <td>{l.source || "-"}</td>
                    <td><StageBadge stage={l.stage} /></td>
                    <td>{formatFollowUp(l.next_follow_up_date)}</td>
                    <td>{l.assigned_to_name || "Unassigned"}</td>
                    <td>{l.handling_by_name || "-"}</td>
                    <td>{l.updated_at}</td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: "center", color: "#64748b" }}>No leads found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
