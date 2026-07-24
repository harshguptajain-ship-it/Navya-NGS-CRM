import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import StageBadge, { colorForIndex } from "./StageBadge.jsx";
import { useStages } from "../hooks/useStages.js";
import { useStatuses } from "../hooks/useStatuses.js";
import { useAuth } from "../AuthContext.jsx";
import { formatFollowUp, formatDateTime } from "../utils/followup.js";
import { createdRangeFor, customRangeFor } from "../utils/dateRange.js";

const CREATED_PRESETS = [
  { key: "", label: "All time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

// Powers the main Dashboard (caseStatus="open"), the Closed Cases tab
// (caseStatus="closed"), and the Premium Leads tab (premiumOnly) — same
// filters, same table, same everything, just scoped to a different slice.
// caseStatus and premiumOnly are independent: a lead can be both closed and
// premium, so the Premium tab isn't restricted to open cases.
export default function LeadsListView({ caseStatus, premiumOnly }) {
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const isAdmin = user?.role === "admin";
  // Neither of these secondary views is where you'd start a brand-new lead —
  // new leads always start open and non-premium — so both hide "+ New Lead".
  const isSecondaryView = caseStatus === "closed" || premiumOnly;

  function filterParams() {
    return {
      case_status: caseStatus,
      is_premium: premiumOnly ? "1" : "",
      stage: stageFilter,
      status: statusFilter,
      assigned_to: assignedFilter,
      handling_by: handlingFilter,
      source: sourceFilter,
      q: search,
      ...(dateFrom || dateTo ? customRangeFor(dateFrom, dateTo) : createdRangeFor(createdFilter)),
    };
  }

  // A custom From/To range and the quick preset are mutually exclusive —
  // picking one clears the other so it's always clear which is in effect.
  function handlePresetChange(value) {
    setCreatedFilter(value);
    if (value) {
      setDateFrom("");
      setDateTo("");
    }
  }
  function handleDateFromChange(value) {
    setDateFrom(value);
    if (value) setCreatedFilter("");
  }
  function handleDateToChange(value) {
    setDateTo(value);
    if (value) setCreatedFilter("");
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
  }, [caseStatus, stageFilter, statusFilter, assignedFilter, handlingFilter, sourceFilter, createdFilter, dateFrom, dateTo]);

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

  async function handleMarkFollowupDone(leadId, followupId, e) {
    e.stopPropagation();
    try {
      await api.updateFollowup(leadId, followupId, { status: "done" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  // Closing a case here just drops it out of this filtered list (case_status
  // no longer matches), which is exactly "moves it to Closed Cases" — no
  // separate move/copy step needed since both tabs read from the same table.
  async function handleToggleCase(leadId, currentCaseStatus, e) {
    e.stopPropagation();
    const next = currentCaseStatus === "closed" ? "open" : "closed";
    try {
      await api.updateLead(leadId, { case_status: next });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleTogglePremium(leadId, currentIsPremium, e) {
    e.stopPropagation();
    try {
      await api.updateLead(leadId, { is_premium: !currentIsPremium });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function clearFilters() {
    setStageFilter("");
    setStatusFilter("");
    setAssignedFilter("");
    setHandlingFilter("");
    setSourceFilter("");
    setCreatedFilter("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  }

  const hasActiveFilters =
    stageFilter || statusFilter || assignedFilter || handlingFilter || sourceFilter ||
    createdFilter || dateFrom || dateTo || search;

  const counts = useMemo(() => {
    const c = {};
    for (const s of stageOrder) c[s] = 0;
    for (const l of leads) c[l.stage] = (c[l.stage] || 0) + 1;
    return c;
  }, [leads, stageOrder]);

  return (
    <div>
      <div className="stat-row">
        {stageOrder.map((s, i) => (
          <div className="stat-box" key={s} style={{ borderTopColor: colorForIndex(i).fg }}>
            <div className="num">{counts[s]}</div>
            <div className="label">{labelOf(s)}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <form className="toolbar" onSubmit={handleSearchSubmit}>
          <select value={createdFilter} onChange={(e) => handlePresetChange(e.target.value)}>
            {CREATED_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>{p.key ? `Created: ${p.label}` : "Created: All time"}</option>
            ))}
          </select>
          <span className="date-range-field">
            From <input type="date" value={dateFrom} onChange={(e) => handleDateFromChange(e.target.value)} />
          </span>
          <span className="date-range-field">
            To <input type="date" value={dateTo} onChange={(e) => handleDateToChange(e.target.value)} />
          </span>
          <input placeholder="Search name / phone / email" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="submit">Search</button>
          {hasActiveFilters && (
            <button type="button" className="secondary" onClick={clearFilters}>Clear Filters</button>
          )}
          {!isSecondaryView && (
            <Link to="/leads/new"><button type="button">+ New Lead</button></Link>
          )}
          <button type="button" className="secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Download Excel"}
          </button>
          {isAdmin && (
            <Link to="/stages"><button type="button" className="secondary">Manage Stages &amp; Status</button></Link>
          )}
        </form>

        {/* Mirrors the column-header dropdowns below — on a phone the table
            becomes a stacked card list and those headers aren't visible, so
            this bar (hidden on desktop) is the only way to filter there. */}
        <div className="mobile-filters">
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="">Stage (All)</option>
            {stageOrder.map((s) => (
              <option key={s} value={s}>{labelOf(s)}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Status (All)</option>
            {statuses.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="">Source (All)</option>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {isAdmin && (
            <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)}>
              <option value="">Assigned To (All)</option>
              <option value="unassigned">Unassigned</option>
              {executives.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
          <select value={handlingFilter} onChange={(e) => setHandlingFilter(e.target.value)}>
            <option value="">Handling By (All)</option>
            {executives.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {error && <div className="error-text">{error}</div>}
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="responsive-table">
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
                    {isAdmin ? (
                      <span className="header-filter-wrap">
                        <select className="header-filter" value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)}>
                          <option value="">Assigned To</option>
                          <option value="unassigned">Unassigned</option>
                          {executives.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </span>
                    ) : (
                      "Assigned To"
                    )}
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
                  <th>Case</th>
                  <th>Premium</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} onClick={() => navigate(`/leads/${l.id}`)} style={{ cursor: "pointer" }}>
                    <td data-label="Name">
                      {l.is_premium ? <span title="Premium" style={{ marginRight: 4 }}>⭐</span> : null}
                      {l.name}
                    </td>
                    <td className="nowrap" data-label="Phone">{l.phone || "-"}</td>
                    <td data-label="Source">{l.source || "-"}</td>
                    <td data-label="Stage"><StageBadge stage={l.stage} label={labelOf(l.stage)} colorIndex={colorIndexOf(l.stage)} /></td>
                    <td data-label="Status">
                      {l.status ? (
                        <StageBadge stage={l.status} label={statusLabelOf(l.status)} colorIndex={statusColorIndexOf(l.status)} />
                      ) : "-"}
                    </td>
                    <td className="nowrap" data-label="Next Follow-up">
                      <span className="followup-cell">
                        {formatFollowUp(l.next_follow_up_date)}
                        {l.next_follow_up_id && (
                          <button
                            type="button"
                            className="secondary mark-done-btn"
                            onClick={(e) => handleMarkFollowupDone(l.id, l.next_follow_up_id, e)}
                          >
                            Done
                          </button>
                        )}
                      </span>
                    </td>
                    <td data-label="Assigned To">{l.assigned_to_name || "Unassigned"}</td>
                    <td data-label="Handling By">{l.handling_by_name || "-"}</td>
                    <td className="remark-cell" title={l.last_remark || ""} data-label="Last Remark">{l.last_remark || "-"}</td>
                    <td className="nowrap" data-label="Updated">{formatDateTime(l.updated_at)}</td>
                    <td data-label="Case">
                      <button
                        type="button"
                        className="secondary mark-done-btn"
                        onClick={(e) => handleToggleCase(l.id, l.case_status, e)}
                      >
                        {l.case_status === "closed" ? "Reopen" : "Close Case"}
                      </button>
                    </td>
                    <td data-label="Premium">
                      <button
                        type="button"
                        className="secondary mark-done-btn"
                        onClick={(e) => handleTogglePremium(l.id, l.is_premium, e)}
                      >
                        {l.is_premium ? "Remove Premium" : "Mark Premium"}
                      </button>
                    </td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr><td colSpan={12} style={{ textAlign: "center", color: "#64748b" }}>No leads found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
