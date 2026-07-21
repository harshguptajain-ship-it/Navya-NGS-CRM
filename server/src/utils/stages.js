// The full lifecycle a lead moves through. Order matters for the UI stepper,
// but any stage can jump to any other stage (e.g. rejected can happen at any point).
const STAGES = [
  { key: "new", label: "New Lead" },
  { key: "follow_up", label: "Follow-up in Progress" },
  { key: "ready_for_documents", label: "Ready - Documents Requested" },
  { key: "documents_received", label: "Documents Received" },
  { key: "file_logged", label: "File Logged" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const STAGE_KEYS = STAGES.map((s) => s.key);

function isValidStage(key) {
  return STAGE_KEYS.includes(key);
}

module.exports = { STAGES, STAGE_KEYS, isValidStage };
