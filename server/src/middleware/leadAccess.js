const db = require("../db");

// Admins see/control every lead. Executives only see leads they created, or
// that are currently assigned to them / being handled by them.
function canAccessLead(user, lead) {
  if (!lead) return false;
  if (user.role === "admin") return true;
  return lead.created_by === user.id || lead.assigned_to === user.id || lead.handling_by === user.id;
}

// Middleware factory: 404s unless req.user can see the lead identified by
// req.params[paramName] (defaults to "leadId", used by the followups/calls/
// remarks sub-routers; pass "id" for routes mounted directly under /leads/:id).
function requireLeadAccess(paramName = "leadId") {
  return (req, res, next) => {
    const lead = db
      .prepare("SELECT id, created_by, assigned_to, handling_by FROM leads WHERE id = ?")
      .get(req.params[paramName]);
    if (!canAccessLead(req.user, lead)) {
      return res.status(404).json({ error: "Lead not found" });
    }
    next();
  };
}

// SQL fragment + params restricting a leads-list query to what this user may
// see. `alias` is the table alias the leads table is given in that query.
function visibilityFilter(user, alias = "l") {
  if (user.role === "admin") return { clause: "1=1", params: {} };
  return {
    clause: `(${alias}.created_by = @__visUid OR ${alias}.assigned_to = @__visUid OR ${alias}.handling_by = @__visUid)`,
    params: { __visUid: user.id },
  };
}

module.exports = { canAccessLead, requireLeadAccess, visibilityFilter };
