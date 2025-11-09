"use client";

import * as React from "react";

type SegmentedControlProps = {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
};

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className="inline-flex rounded-lg border border-foreground/10 bg-background p-1">
      {options.map((option, index) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`
            px-4 py-1.5 text-sm font-light transition-all duration-150
            ${
              value === option.value
                ? "bg-blue-500 text-white rounded-md shadow-sm"
                : "text-foreground/60 hover:text-foreground"
            }
            ${index === 0 ? "rounded-l-md" : ""}
            ${index === options.length - 1 ? "rounded-r-md" : ""}
          `}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

