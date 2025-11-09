import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";
import DashboardClient from "@/components/DashboardClient";
import DashboardStats from "@/components/DashboardStats";
import UpcomingScripts from "@/components/UpcomingScripts";
import UnlinkedTranscripts from "@/components/UnlinkedTranscripts";

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

        {/* Stats Cards */}
        <DashboardStats email={user.email} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Clients Section */}
          <div className="lg:col-span-2">
            <DashboardClient email={user.email} />
          </div>

          {/* Upcoming Scripts Section */}
          <div className="lg:col-span-1">
            <UpcomingScripts email={user.email} />
          </div>
        </div>

        {/* Unlinked Transcripts Section */}
        <div className="mt-6">
          <UnlinkedTranscripts email={user.email} />
        </div>

        {/* Sign Out */}
        <div className="flex justify-center pt-8 mt-12 border-t border-foreground/10">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}

