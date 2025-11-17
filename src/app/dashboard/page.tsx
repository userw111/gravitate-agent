import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import DashboardClient from "@/components/DashboardClient";

export default async function Dashboard() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen px-4 py-12 bg-background">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-12 text-center animate-rotate-fade">
          <h1 className="text-4xl font-light tracking-tight text-foreground mb-3 transition-all duration-150 cursor-default">
            Dashboard
          </h1>
          <p className="text-base text-foreground/60 font-light animate-elastic-bounce delay-50">
            {user.email}
          </p>
        </div>

        {/* Main Content */}
        <div>
            <DashboardClient email={user.email} />
        </div>

      </div>
    </div>
  );
}

