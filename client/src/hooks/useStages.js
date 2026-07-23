import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

// Stages are admin-managed (add / rename / delete / reorder) and can change at
// any time, so every screen that needs them fetches the current list rather
// than relying on a hardcoded map.
export function useStages() {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    return api
      .stages()
      .then((res) => setStages(res.stages))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const labelOf = useCallback(
    (key) => stages.find((s) => s.key === key)?.label || key,
    [stages]
  );

  // Badge color is based on position in the current stage order, so every
  // stage visible at once gets a distinct color instead of colliding by chance.
  const colorIndexOf = useCallback(
    (key) => Math.max(0, stages.findIndex((s) => s.key === key)),
    [stages]
  );

  return { stages, loading, reload, labelOf, colorIndexOf };
}
