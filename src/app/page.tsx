import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SignInButton from "@/components/SignInButton";

export default async function SignIn() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-[400px] animate-blur-focus">
        {/* Logo/Brand */}
        <div className="mb-16 text-center animate-rotate-fade">
          <h1 className="text-3xl font-light tracking-tight text-foreground mb-2 transition-all duration-150 hover:tracking-normal cursor-default">
            Gravitate Agent
          </h1>
          <p className="text-sm text-foreground/60 font-light animate-elastic-bounce delay-50">
            Sign in to continue
          </p>
        </div>

        {/* Sign In Button */}
        <SignInButton />
      </div>
    </div>
  );
}
