import React from "react";

const STAGE_LABELS = {
  new: "New Lead",
  follow_up: "Follow-up in Progress",
  ready_for_documents: "Ready - Documents Requested",
  documents_received: "Documents Received",
  file_logged: "File Logged",
  approved: "Approved",
  rejected: "Rejected",
};

const STAGE_CLASS = {
  new: "stage-new",
  follow_up: "stage-followup",
  ready_for_documents: "stage-ready",
  documents_received: "stage-docs",
  file_logged: "stage-logged",
  approved: "stage-approved",
  rejected: "stage-rejected",
};

export default function StageBadge({ stage }) {
  return (
    <span className={`badge ${STAGE_CLASS[stage] || ""}`}>
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

export { STAGE_LABELS };
