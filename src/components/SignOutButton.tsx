"use client";

export default function SignOutButton() {
  const handleSignOut = async () => {
    // Use window.location directly to the sign-out endpoint which will redirect
    // This ensures cookies are cleared server-side before redirect
    window.location.href = "/api/auth/sign-out";
  };

  return (
    <button
      onClick={handleSignOut}
      className="px-8 py-3 bg-transparent border border-foreground/20 text-foreground rounded-lg font-light text-sm transition-all duration-150 ease-out hover:border-foreground/40 hover:bg-foreground/5 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
    >
      Sign Out
    </button>
  );
}

