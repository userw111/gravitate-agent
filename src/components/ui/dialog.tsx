"use client";

import * as React from "react";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 animate-fade-in-simple"
        onClick={() => onOpenChange(false)}
      />
      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="relative w-full max-w-md rounded-lg border border-foreground/10 bg-background shadow-lg animate-fade-in-simple"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </>
  );
}

type DialogContentProps = {
  children: React.ReactNode;
  className?: string;
};

export function DialogContent({ children, className }: DialogContentProps) {
  return <div className={className}>{children}</div>;
}

type DialogHeaderProps = {
  children: React.ReactNode;
};

export function DialogHeader({ children }: DialogHeaderProps) {
  return <div className="p-6 pb-4">{children}</div>;
}

type DialogTitleProps = {
  children: React.ReactNode;
};

export function DialogTitle({ children }: DialogTitleProps) {
  return <h2 className="text-lg font-light text-foreground">{children}</h2>;
}

type DialogDescriptionProps = {
  children: React.ReactNode;
};

export function DialogDescription({ children }: DialogDescriptionProps) {
  return <p className="mt-2 text-sm text-foreground/60">{children}</p>;
}

type DialogFooterProps = {
  children: React.ReactNode;
};

export function DialogFooter({ children }: DialogFooterProps) {
  return <div className="p-6 pt-4 flex items-center justify-end gap-2">{children}</div>;
}

