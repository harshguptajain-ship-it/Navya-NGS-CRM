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

  // `overrides` lets a click handler (e.g. clicking a phone number) apply a
  // filter value immediately without waiting for React to re-render state first.
  async function load(overrides = {}) {
    setLoading(true);
    setError("");
    try {
      const res = await api.listLeads({ ...filterParams(), ...overrides });
      setLeads(res.leads);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.listUsers().then((res) => setExecutives(res.users)).catch(() => {});
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
    load({ stage: "", status: "", assigned_to: "", handling_by: "", source: "", q: "", created_from: "", created_to: "" });
  }

  const hasActiveFilters =
    stageFilter || statusFilter || assignedFilter || handlingFilter || sourceFilter || createdFilter || search;

  // Clicking a value inside a row (stage/status badge, source, assigned/handling
  // name) applies it as a filter directly, same as clicking a stat box —
  // stopPropagation so it doesn't also navigate to the lead's detail page.
  function filterClick(setter, value) {
    return (e) => {
      e.stopPropagation();
      setter((prev) => (prev === String(value) ? "" : String(value)));
    };
  }

  // Phone doesn't have its own filter state — clicking it just runs it through
  // the same name/phone/email search the box above uses.
  function phoneFilterClick(phone) {
    return (e) => {
      e.stopPropagation();
      setSearch(phone);
      load({ q: phone });
    };
  }

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
          <div
            className="stat-box clickable"
            key={s}
            style={{ outline: stageFilter === s ? "2px solid #2563eb" : "none" }}
            onClick={() => setStageFilter(stageFilter === s ? "" : s)}
          >
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
        <p style={{ color: "#64748b", fontSize: 13, marginTop: -8 }}>
          Tip: use the dropdown in the Stage / Status / Assigned To / Handling By column headers to filter by any value,
          or click a Phone / Source value in a row to filter by exactly that.
        </p>

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
                  <th>
                    <select
                      className="header-filter"
                      value={stageFilter}
                      onChange={(e) => setStageFilter(e.target.value)}
                      style={{ color: stageFilter ? "#2563eb" : undefined }}
                    >
                      <option value="">Stage (All)</option>
                      {stageOrder.map((s) => (
                        <option key={s} value={s}>{labelOf(s)}</option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <select
                      className="header-filter"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      style={{ color: statusFilter ? "#2563eb" : undefined }}
                    >
                      <option value="">Status (All)</option>
                      {statuses.map((s) => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </th>
                  <th>Next Follow-up</th>
                  <th>
                    <select
                      className="header-filter"
                      value={assignedFilter}
                      onChange={(e) => setAssignedFilter(e.target.value)}
                      style={{ color: assignedFilter ? "#2563eb" : undefined }}
                    >
                      <option value="">Assigned To (All)</option>
                      {executives.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </th>
                  <th>
                    <select
                      className="header-filter"
                      value={handlingFilter}
                      onChange={(e) => setHandlingFilter(e.target.value)}
                      style={{ color: handlingFilter ? "#2563eb" : undefined }}
                    >
                      <option value="">Handling By (All)</option>
                      {executives.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </th>
                  <th>Last Remark</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} onClick={() => navigate(`/leads/${l.id}`)} style={{ cursor: "pointer" }}>
                    <td>{l.name}</td>
                    <td className="nowrap">
                      {l.phone ? (
                        <span className="clickable-cell" onClick={phoneFilterClick(l.phone)}>{l.phone}</span>
                      ) : "-"}
                    </td>
                    <td>
                      {l.source ? (
                        <span className="clickable-cell" onClick={filterClick(setSourceFilter, l.source)}>{l.source}</span>
                      ) : "-"}
                    </td>
                    <td>
                      <span className="badge-clickable" onClick={filterClick(setStageFilter, l.stage)}>
                        <StageBadge stage={l.stage} label={labelOf(l.stage)} colorIndex={colorIndexOf(l.stage)} />
                      </span>
                    </td>
                    <td>
                      {l.status ? (
                        <span className="badge-clickable" onClick={filterClick(setStatusFilter, l.status)}>
                          <StageBadge stage={l.status} label={statusLabelOf(l.status)} colorIndex={statusColorIndexOf(l.status)} />
                        </span>
                      ) : "-"}
                    </td>
                    <td className="nowrap">{formatFollowUp(l.next_follow_up_date)}</td>
                    <td>
                      {l.assigned_to ? (
                        <span className="clickable-cell" onClick={filterClick(setAssignedFilter, l.assigned_to)}>{l.assigned_to_name}</span>
                      ) : "Unassigned"}
                    </td>
                    <td>
                      {l.handling_by ? (
                        <span className="clickable-cell" onClick={filterClick(setHandlingFilter, l.handling_by)}>{l.handling_by_name}</span>
                      ) : "-"}
                    </td>
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
