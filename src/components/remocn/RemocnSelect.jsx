import React, { useState, useRef, useEffect, useCallback } from "react";

export function RemocnSelect({
  value,
  onChange,
  options = [],
  placeholder = "请选择",
  disabled = false,
  className = "",
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const listboxRef = useRef(null);

  const normalizedOptions = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setOpen((prev) => !prev);
    }
  }, [disabled]);

  const handleSelect = useCallback(
    (optValue) => {
      onChange?.(optValue);
      setOpen(false);
    },
    [onChange]
  );

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className={`remocn-select-root ${className} ${open ? "is-open" : ""}${disabled ? " is-disabled" : ""}`}
    >
      <button
        type="button"
        className="remocn-select-trigger"
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || displayLabel}
        disabled={disabled}
      >
        <span className="remocn-select-value">{displayLabel}</span>
        <svg
          className="remocn-select-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          ref={listboxRef}
          className="remocn-select-panel"
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
        >
          {normalizedOptions.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <div
                key={opt.value}
                className={`remocn-select-item ${isSelected ? "is-selected" : ""}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(opt.value)}
              >
                <span className="remocn-select-item-label">{opt.label}</span>
                <svg
                  className="remocn-select-item-check"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5 12.5l4.5 4.5L19 7"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
