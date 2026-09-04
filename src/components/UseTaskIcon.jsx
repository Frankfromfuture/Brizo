import { MonitorIcon } from "./remocn/icon-monitor";

export function UseTaskIcon({ size = 20, animate = false, className = "" }) {
  return (
    <span className={`use-task-icon ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <MonitorIcon size={size} strokeWidth={1.9} animate={animate} />
    </span>
  );
}
