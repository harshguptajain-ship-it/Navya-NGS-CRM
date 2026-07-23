import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import StageBadge from "../components/StageBadge.jsx";
import { useStages } from "../hooks/useStages.js";
import { useStatuses } from "../hooks/useStatuses.js";
import { useAuth } from "../AuthContext.jsx";
import { formatFollowUp, formatDateTime } from "../utils/followup.js";
import { createdRangeFor } from "../utils/dateRange.js";

const CREATED_PRESETS = [
  { key: "", label: "All time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { stages, labelOf, colorIndexOf } = useStages();
  const stageOrder = useMemo(() => stages.map((s) => s.key), [stages]);
  const { statuses, labelOf: statusLabelOf, colorIndexOf: statusColorIndexOf } = useStatuses();
  const [leads, setLeads] = useState([]);
  const [executives, setExecutives] = useState([]);
  const [sources, setSources] = useState([]);
  const [stageFilter, setStageFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [handlingFilter, setHandlingFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [createdFilter, setCreatedFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  function filterParams() {
    return {
      stage: stageFilter,
      status: statusFilter,
      assigned_to: assignedFilter,
      handling_by: handlingFilter,
      source: sourceFilter,
      q: search,
      ...createdRangeFor(createdFilter),
    };
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await api.listLeads(filterParams());
      setLeads(res.leads);
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
  }, [stageFilter, statusFilter, assignedFilter, handlingFilter, sourceFilter, createdFilter]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    load();
  }

  async function handleExport() {
    setExporting(true);
    setError("");
    try {
      await api.exportLeads(filterParams());
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  function clearFilters() {
    setStageFilter("");
    setStatusFilter("");
    setAssignedFilter("");
    setHandlingFilter("");
    setSourceFilter("");
    setCreatedFilter("");
    setSearch("");
  }

  const hasActiveFilters =
    stageFilter || statusFilter || assignedFilter || handlingFilter || sourceFilter || createdFilter || search;

  const counts = useMemo(() => {
    const c = {};
    for (const s of stageOrder) c[s] = 0;
    for (const l of leads) c[l.stage] = (c[l.stage] || 0) + 1;
    return c;
  }, [leads, stageOrder]);

  return (
    <div>
      <div className="stat-row">
        {stageOrder.map((s) => (
          <div className="stat-box" key={s}>
            <div className="num">{counts[s]}</div>
            <div className="label">{labelOf(s)}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <form className="toolbar" onSubmit={handleSearchSubmit}>
          <select value={createdFilter} onChange={(e) => setCreatedFilter(e.target.value)}>
            {CREATED_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>{p.key ? `Created: ${p.label}` : "Created: All time"}</option>
            ))}
          </select>
          <input placeholder="Search name / phone / email" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="submit">Search</button>
          {hasActiveFilters && (
            <button type="button" className="secondary" onClick={clearFilters}>Clear Filters</button>
          )}
          <Link to="/leads/new"><button type="button">+ New Lead</button></Link>
          <button type="button" className="secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Download Excel"}
          </button>
          {user?.role === "admin" && (
            <Link to="/stages"><button type="button" className="secondary">Manage Stages &amp; Status</button></Link>
          )}
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
                  <th>
                    <span className="header-filter-wrap">
                      <select className="header-filter" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                        <option value="">Source</option>
                        {sources.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </span>
                  </th>
                  <th>
                    <span className="header-filter-wrap">
                      <select className="header-filter" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                        <option value="">Stage</option>
                        {stageOrder.map((s) => (
                          <option key={s} value={s}>{labelOf(s)}</option>
                        ))}
                      </select>
                    </span>
                  </th>
                  <th>
                    <span className="header-filter-wrap">
                      <select className="header-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="">Status</option>
                        {statuses.map((s) => (
                          <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                      </select>
                    </span>
                  </th>
                  <th>Next Follow-up</th>
                  <th>
                    <span className="header-filter-wrap">
                      <select className="header-filter" value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)}>
                        <option value="">Assigned To</option>
                        {executives.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </span>
                  </th>
                  <th>
                    <span className="header-filter-wrap">
                      <select className="header-filter" value={handlingFilter} onChange={(e) => setHandlingFilter(e.target.value)}>
                        <option value="">Handling By</option>
                        {executives.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </span>
                  </th>
                  <th>Last Remark</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} onClick={() => navigate(`/leads/${l.id}`)} style={{ cursor: "pointer" }}>
                    <td>{l.name}</td>
                    <td className="nowrap">{l.phone || "-"}</td>
                    <td>{l.source || "-"}</td>
                    <td><StageBadge stage={l.stage} label={labelOf(l.stage)} colorIndex={colorIndexOf(l.stage)} /></td>
                    <td>
                      {l.status ? (
                        <StageBadge stage={l.status} label={statusLabelOf(l.status)} colorIndex={statusColorIndexOf(l.status)} />
                      ) : "-"}
                    </td>
                    <td className="nowrap">{formatFollowUp(l.next_follow_up_date)}</td>
                    <td>{l.assigned_to_name || "Unassigned"}</td>
                    <td>{l.handling_by_name || "-"}</td>
                    <td className="remark-cell" title={l.last_remark || ""}>{l.last_remark || "-"}</td>
                    <td className="nowrap">{formatDateTime(l.updated_at)}</td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: "center", color: "#64748b" }}>No leads found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
