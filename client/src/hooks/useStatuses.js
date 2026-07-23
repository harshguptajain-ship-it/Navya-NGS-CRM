import { useCallback } from "react";
import { api } from "../api";
import { useOptionList } from "./useOptionList.js";

export function useStatuses() {
  const fetchStatuses = useCallback(() => api.statuses().then((res) => res.statuses), []);
  const { items, ...rest } = useOptionList(fetchStatuses);
  return { statuses: items, ...rest };
}
