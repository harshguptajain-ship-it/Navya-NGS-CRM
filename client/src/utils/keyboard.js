// Attach to a textarea's onKeyDown: plain Enter submits (calling handler),
// Shift+Enter falls through to the browser's default behavior and inserts a
// newline instead.
export function submitOnEnter(handler) {
  return (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handler();
    }
  };
}
