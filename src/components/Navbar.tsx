"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import ThemeToggle from "@/components/ThemeToggle";

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
  if (pathname === "/") return null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-foreground/10 bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-foreground">
          <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-foreground text-background">
            {/* Simple AI-ish spark icon */}
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
              <path d="M12 2l1.9 4.6L19 8l-4.1 2.2L12 15l-2.9-4.8L5 8l5.1-1.4L12 2z" />
            </svg>
          </span>
          <span className="text-sm font-medium tracking-tight">Gravitate Agent</span>
        </Link>

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
            ]}
          />
        </div>
      </div>
    </header>
  );
}


