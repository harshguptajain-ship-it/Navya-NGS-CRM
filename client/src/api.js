const TOKEN_KEY = "crm_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  login: (email, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request("/auth/me"),
  listUsers: () => request("/auth/users"),
  createUser: (payload) => request("/auth/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id, payload) => request(`/auth/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteUser: (id) => request(`/auth/users/${id}`, { method: "DELETE" }),

  stages: () => request("/leads/stages"),
  createStage: (payload) => request("/admin/stages", { method: "POST", body: JSON.stringify(payload) }),
  renameStage: (key, payload) => request(`/admin/stages/${key}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteStage: (key) => request(`/admin/stages/${key}`, { method: "DELETE" }),
  reorderStages: (order) => request("/admin/stages/reorder", { method: "PUT", body: JSON.stringify({ order }) }),

  statuses: () => request("/leads/statuses"),
  createStatus: (payload) => request("/admin/statuses", { method: "POST", body: JSON.stringify(payload) }),
  renameStatus: (key, payload) => request(`/admin/statuses/${key}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteStatus: (key) => request(`/admin/statuses/${key}`, { method: "DELETE" }),
  reorderStatuses: (order) => request("/admin/statuses/reorder", { method: "PUT", body: JSON.stringify({ order }) }),

  listSources: () => request("/leads/sources"),
  listLeads: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/leads${qs ? `?${qs}` : ""}`);
  },
  upcomingFollowups: () => request("/leads/followups/upcoming"),
  getLead: (id) => request(`/leads/${id}`),
  createLead: (payload) => request("/leads", { method: "POST", body: JSON.stringify(payload) }),
  updateLead: (id, payload) => request(`/leads/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  updateStage: (id, payload) => request(`/leads/${id}/stage`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteLead: (id) => request(`/leads/${id}`, { method: "DELETE" }),

  listFollowups: (leadId) => request(`/leads/${leadId}/followups`),
  addFollowup: (leadId, payload) =>
    request(`/leads/${leadId}/followups`, { method: "POST", body: JSON.stringify(payload) }),
  updateFollowup: (leadId, followupId, payload) =>
    request(`/leads/${leadId}/followups/${followupId}`, { method: "PUT", body: JSON.stringify(payload) }),

  listCalls: (leadId) => request(`/leads/${leadId}/calls`),
  addCall: (leadId, payload) =>
    request(`/leads/${leadId}/calls`, { method: "POST", body: JSON.stringify(payload) }),

  listRemarks: (leadId) => request(`/leads/${leadId}/remarks`),
  addRemark: (leadId, payload) =>
    request(`/leads/${leadId}/remarks`, { method: "POST", body: JSON.stringify(payload) }),

  async exportLeads(params = {}) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    const token = getToken();
    const res = await fetch(`/api/leads/export${qs ? `?${qs}` : ""}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let message = `Export failed (${res.status})`;
      try {
        const data = await res.json();
        message = data?.error || message;
      } catch {
        // ignore
      }
      throw new Error(message);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
