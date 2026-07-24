import React from "react";
import LeadsListView from "../components/LeadsListView.jsx";

export default function PremiumLeads() {
  return (
    <div>
      <h1>Premium Leads</h1>
      <LeadsListView premiumOnly viewKey="premium" />
    </div>
  );
}
