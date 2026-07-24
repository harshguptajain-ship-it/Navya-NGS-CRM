import React from "react";
import LeadsListView from "../components/LeadsListView.jsx";

export default function FollowUps() {
  return (
    <div>
      <h1>Follow-ups</h1>
      <LeadsListView followupOnly />
    </div>
  );
}
