import { useCallback } from "react";
import { api } from "../api";
import { useOptionList } from "./useOptionList.js";

export function useStages() {
  const fetchStages = useCallback(() => api.stages().then((res) => res.stages), []);
  const { items, ...rest } = useOptionList(fetchStages);
  return { stages: items, ...rest };
}
