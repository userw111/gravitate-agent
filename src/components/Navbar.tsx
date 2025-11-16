"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import ThemeToggle from "@/components/ThemeToggle";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import * as React from "react";

type NavbarUser = {
  email: string;
};

function getInitialsFromEmail(email: string): string {
  const namePart = email.split("@")[0] ?? "";
  const parts = namePart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  const initials = (first + second).toUpperCase();
  return initials || (email[0] ?? "U").toUpperCase();
}

export default function Navbar({ user }: { user: NavbarUser | null }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const handleSignOut = React.useCallback(() => {
    window.location.href = "/api/auth/sign-out";
  }, []);
  const unlinkedCount = useQuery(
    api.typeform.getUnlinkedResponsesCountForEmail,
    user ? { email: user.email } : "skip"
  );
  
  if (pathname === "/") return null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-foreground/10 bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
        <Link href="/dashboard" className="flex items-center gap-2 text-foreground">
          <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-foreground text-background">
            {/* Simple AI-ish spark icon */}
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
              <path d="M12 2l1.9 4.6L19 8l-4.1 2.2L12 15l-2.9-4.8L5 8l5.1-1.4L12 2z" />
            </svg>
          </span>
          <span className="text-sm font-medium tracking-tight">Gravitate Agent</span>
        </Link>
          
          <nav className="hidden md:flex items-center gap-4">
            <Link
              href="/dashboard"
              className={`text-sm transition-colors ${
                pathname === "/dashboard"
                  ? "text-foreground font-medium"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/import"
              className={`text-sm transition-colors ${
                pathname === "/import"
                  ? "text-foreground font-medium"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              Import
            </Link>
            <Link
              href="/studio"
              className={`text-sm transition-colors ${
                pathname === "/studio"
                  ? "text-foreground font-medium"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              Studio
            </Link>
            <Link
              href="/unlinked"
              className={`relative inline-flex items-center text-sm transition-colors ${
                pathname === "/unlinked"
                  ? "text-foreground font-medium"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              Review
              {unlinkedCount !== undefined && unlinkedCount > 0 && (
                <span className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-red-500 border border-background" />
              )}
            </Link>
          </nav>
          
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1 text-foreground/60 hover:text-foreground"
            aria-label="Toggle menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {mobileMenuOpen ? (
                <path
                  d="M15 5L5 15M5 5L15 15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M3 5H17M3 10H17M3 15H17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <DropdownMenu
            trigger={
              <Avatar>
                <AvatarFallback>{user ? getInitialsFromEmail(user.email) : "UU"}</AvatarFallback>
              </Avatar>
            }
            items={[
              { label: "Settings", href: "/settings" },
              { label: "Sign out", onClick: handleSignOut, danger: true },
            ]}
          />
        </div>
        
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="absolute top-14 left-0 right-0 md:hidden border-b border-foreground/10 bg-background/95 backdrop-blur">
            <nav className="flex flex-col px-4 py-3 gap-3">
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className={`text-sm transition-colors ${
                  pathname === "/dashboard"
                    ? "text-foreground font-medium"
                    : "text-foreground/60 hover:text-foreground"
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/import"
                onClick={() => setMobileMenuOpen(false)}
                className={`text-sm transition-colors ${
                  pathname === "/import"
                    ? "text-foreground font-medium"
                    : "text-foreground/60 hover:text-foreground"
                }`}
              >
                Import
              </Link>
              <Link
                href="/studio"
                onClick={() => setMobileMenuOpen(false)}
                className={`text-sm transition-colors ${
                  pathname === "/studio"
                    ? "text-foreground font-medium"
                    : "text-foreground/60 hover:text-foreground"
                }`}
              >
                Studio
              </Link>
              <Link
                href="/unlinked"
                onClick={() => setMobileMenuOpen(false)}
                className={`relative inline-flex items-center text-sm transition-colors ${
                  pathname === "/unlinked"
                    ? "text-foreground font-medium"
                    : "text-foreground/60 hover:text-foreground"
                }`}
              >
                Review
                {unlinkedCount !== undefined && unlinkedCount > 0 && (
                  <span className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-red-500 border border-background" />
                )}
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}


