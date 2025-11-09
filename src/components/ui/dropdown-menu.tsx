"use client";

import * as React from "react";
import Link from "next/link";

type DropdownMenuProps = {
  trigger: React.ReactNode;
  items: Array<{ label: string; href: string }>;
};

export function DropdownMenu({ trigger, items }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function cancelCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleClose() {
    cancelCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 200); // small hover-intent delay
  }

  return (
    <div
      ref={menuRef}
      className="relative"
      onMouseEnter={() => {
        cancelCloseTimer();
        setOpen(true);
      }}
      onMouseLeave={() => {
        scheduleClose();
      }}
    >
      <button
        className="outline-none"
        aria-haspopup="menu"
        aria-expanded={open}
        onFocus={() => {
          cancelCloseTimer();
          setOpen(true);
        }}
        onBlur={() => {
          scheduleClose();
        }}
      >
        {trigger}
      </button>
      <div
        className={`absolute right-0 mt-2 min-w-40 rounded-lg border border-foreground/10 bg-background shadow-lg z-50 transition-all ${
          open ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 -translate-y-1"
        }`}
        role="menu"
        onMouseEnter={cancelCloseTimer}
        onMouseLeave={scheduleClose}
      >
        <ul className="py-1">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block px-3 py-2 text-sm text-foreground/90 hover:bg-foreground/5"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


