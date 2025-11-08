import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";

export default async function Dashboard() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-[600px] animate-blur-focus">
        {/* Header */}
        <div className="mb-16 text-center animate-rotate-fade">
          <h1 className="text-4xl font-light tracking-tight text-foreground mb-3 transition-all duration-150 cursor-default">
            Welcome
          </h1>
          <p className="text-base text-foreground/60 font-light animate-elastic-bounce delay-50">
            {user.email}
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-8 animate-fade-in-simple delay-100">
          {/* Welcome Card */}
          <div className="border border-foreground/10 rounded-lg p-8 transition-all duration-150 hover:border-foreground/20">
            <h2 className="text-xl font-light text-foreground mb-4">
              You're signed in
            </h2>
            <p className="text-sm text-foreground/60 font-light leading-relaxed">
              Your Gravitate Agent dashboard is ready. Start exploring what you can do.
            </p>
          </div>

          {/* Sign Out */}
          <div className="flex justify-center pt-4">
            <SignOutButton />
          </div>
        </div>
      </div>
    </div>
  );
}

