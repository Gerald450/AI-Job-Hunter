"use client";

import { applyOutreachUpdate, type OutreachFlags, type OutreachPatch } from "@/lib/reachout";
import { cn } from "@/lib/utils";

function stopRowToggle(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export function OutreachCheck({
  name,
  label,
  checked,
  disabled,
  auto,
  showLabel,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  auto?: boolean;
  showLabel: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 text-sm text-slate-700",
        disabled && "text-slate-500",
      )}
      onClick={stopRowToggle}
    >
      <input
        type="checkbox"
        className="size-4 accent-blue-600 disabled:cursor-not-allowed"
        checked={checked}
        disabled={disabled}
        aria-label={`${label} ${name}`}
        onChange={onChange}
        onClick={stopRowToggle}
      />
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
      {auto ? <span className="text-xs text-slate-500">(auto)</span> : null}
    </label>
  );
}

export function OutreachChecks({
  name,
  flags,
  showLabels,
  variant = "inline",
  onPatch,
}: {
  name: string;
  flags: OutreachFlags;
  showLabels: boolean;
  variant?: "inline" | "cells";
  onPatch: (patch: OutreachPatch) => void;
}) {
  const view = applyOutreachUpdate(flags, {});
  const items = [
    {
      key: "reached_out" as const,
      label: "Reached out",
      checked: view.reached_out,
      disabled: false,
      auto: false,
    },
    {
      key: "responded" as const,
      label: "Responded",
      checked: view.responded,
      disabled: false,
      auto: false,
    },
    {
      key: "followed_up" as const,
      label: "Followed up",
      checked: view.followed_up,
      disabled: view.responded,
      auto: view.responded,
    },
  ];

  const checks = items.map((item) => (
    <OutreachCheck
      key={item.key}
      name={name}
      label={item.label}
      checked={item.checked}
      disabled={item.disabled}
      auto={item.auto}
      showLabel={showLabels}
      onChange={() => onPatch({ [item.key]: !item.checked })}
    />
  ));

  if (variant === "cells") {
    return (
      <>
        {items.map((item) => (
          <td key={item.key} className="px-2 py-3 text-center align-middle">
            <OutreachCheck
              name={name}
              label={item.label}
              checked={item.checked}
              disabled={item.disabled}
              auto={item.auto}
              showLabel={false}
              onChange={() => onPatch({ [item.key]: !item.checked })}
            />
          </td>
        ))}
      </>
    );
  }

  return <div className="flex flex-wrap gap-x-4 gap-y-2">{checks}</div>;
}
