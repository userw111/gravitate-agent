"use client";

export default function SignInButton() {
  const handleSignIn = () => {
    // Use window.location for external redirects to avoid Next.js prefetching
    window.location.href = "/api/auth/sign-in";
  };

  return (
    <button
      onClick={handleSignIn}
      className="w-full py-4 bg-foreground text-background rounded-lg font-light text-base transition-all duration-150 ease-out hover:scale-[1.02] hover:shadow-lg hover:shadow-foreground/20 active:scale-[0.98] active:shadow-md focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:ring-offset-2 focus:ring-offset-background animate-fade-in-simple delay-100 cursor-pointer"
    >
      Sign In
    </button>
  );
}

