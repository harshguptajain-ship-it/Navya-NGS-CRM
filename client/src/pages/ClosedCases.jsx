import React from "react";
import LeadsListView from "../components/LeadsListView.jsx";

export default function ClosedCases() {
  return (
    <div>
      <h1>Closed Cases</h1>
      <LeadsListView caseStatus="closed" viewKey="closed" />
    </div>
  );
}
