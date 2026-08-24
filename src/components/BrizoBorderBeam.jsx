export function BrizoBorderBeam({ active = true, children, className = "" }) {
  return (
    <div
      className={`brizo-border-beam${active ? "" : " is-paused"}${className ? ` ${className}` : ""}`}
      style={{ "--brizo-beam-strength": 0.7 }}
    >
      {children}
      <div className="brizo-border-beam-bloom" aria-hidden="true" />
    </div>
  );
}
