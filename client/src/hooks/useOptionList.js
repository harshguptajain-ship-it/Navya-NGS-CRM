import { useCallback, useEffect, useState } from "react";

// Shared shape behind useStages/useStatuses: both are admin-managed
// (add/rename/delete/reorder) key+label lists that can change at any time, so
// every screen fetches the current list rather than relying on a hardcoded map.
// `fetchItems` must be a stable (e.g. useCallback with no deps) function
// returning a promise of an array of { key, label }.
export function useOptionList(fetchItems) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    return fetchItems()
      .then(setItems)
      .finally(() => setLoading(false));
  }, [fetchItems]);

  useEffect(() => {
    reload();
  }, [reload]);

  const labelOf = useCallback((key) => items.find((s) => s.key === key)?.label || key, [items]);

  // Badge color is based on position in the current order, so every option
  // visible at once gets a distinct color instead of colliding by chance.
  const colorIndexOf = useCallback(
    (key) => Math.max(0, items.findIndex((s) => s.key === key)),
    [items]
  );

  return { items, loading, reload, labelOf, colorIndexOf };
}
