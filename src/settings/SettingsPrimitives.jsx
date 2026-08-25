import { ArrowSquareOut, CaretRight, Check, Key } from "@phosphor-icons/react";
import { useState } from "react";

export function PendingLabel({ children }) {
  return (
    <>
      {children}
      <span className="brizo-settings-pending">（待定）</span>
    </>
  );
}

export function SettingsGroup({ children, title }) {
  return (
    <section className="brizo-settings-group">
      {title ? <h3>{title}</h3> : null}
      <div className="brizo-settings-card">{children}</div>
    </section>
  );
}

export function SettingsRow({
  action,
  children,
  description,
  external = false,
  label,
  onClick,
  pending = false,
}) {
  const content = (
    <>
      <span className="brizo-settings-row-copy">
        <strong>{pending ? <PendingLabel>{label}</PendingLabel> : label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <span className="brizo-settings-row-control">
        {children}
        {action ? <span>{action}</span> : null}
        {onClick ? <CaretRight size={16} aria-hidden="true" /> : null}
        {external ? <ArrowSquareOut size={15} aria-hidden="true" /> : null}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button className={`brizo-settings-row is-action${pending ? " is-pending" : ""}`} type="button" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={`brizo-settings-row${pending ? " is-pending" : ""}`}>{content}</div>;
}

export function SettingsToggle({ ariaLabel, checked, disabled = false, onChange }) {
  return (
    <input
      aria-label={ariaLabel}
      checked={Boolean(checked)}
      className="brizo-settings-toggle"
      disabled={disabled}
      role="switch"
      type="checkbox"
      onChange={(event) => onChange?.(event.target.checked)}
    />
  );
}

export function SettingsSelect({ ariaLabel, disabled = false, onChange, options, value }) {
  return (
    <select
      aria-label={ariaLabel}
      className="brizo-settings-select"
      disabled={disabled}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

export function PendingToggleRow({ checked = false, description, label }) {
  return (
    <SettingsRow label={label} description={description} pending>
      <SettingsToggle ariaLabel={`${label}（待定）`} checked={checked} disabled />
    </SettingsRow>
  );
}

function KeyStatus({ configured, keyMask }) {
  return (
    <span className={`brizo-settings-key-status${configured ? " is-configured" : ""}`}>
      {configured ? <Check size={12} weight="bold" aria-hidden="true" /> : null}
      {configured ? keyMask || "已配置" : "未配置"}
    </span>
  );
}

export function ApiKeyRow({ configured, keyMask, label, onSave, provider }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const apiKey = value.trim();
    if (!apiKey || state === "saving") return;
    setState("saving");
    setMessage("");
    try {
      const result = await onSave?.(apiKey);
      if (result?.status !== "saved") {
        setState("error");
        setMessage(result?.message || "保存失败");
        return;
      }
      setValue("");
      setState("saved");
      setMessage("已保存");
    } catch {
      setState("error");
      setMessage("保存失败");
    }
  };

  return (
    <form className="brizo-settings-api-row" onSubmit={submit}>
      <span className="brizo-settings-row-icon" aria-hidden="true"><Key size={17} /></span>
      <span className="brizo-settings-row-copy">
        <strong>{label}</strong>
        <small>{provider}</small>
      </span>
      <KeyStatus configured={configured} keyMask={keyMask} />
      <input
        aria-label={`${label}（${provider}）`}
        autoComplete="off"
        placeholder={configured ? "输入新 Key" : "输入 API Key"}
        spellCheck="false"
        type="password"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (state !== "idle") {
            setState("idle");
            setMessage("");
          }
        }}
      />
      <button type="submit" disabled={!value.trim() || state === "saving"}>
        {state === "saving" ? "保存中" : "保存"}
      </button>
      <span className={`brizo-settings-save-state is-${state}`} role="status">{message}</span>
    </form>
  );
}
