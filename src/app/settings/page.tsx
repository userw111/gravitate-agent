import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import TypeformSettingsCard from "@/components/TypeformSettingsCard";
import FirefliesSettingsCard from "@/components/FirefliesSettingsCard";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-light tracking-tight">Settings</h1>
      <div className="space-y-6">
        <TypeformSettingsCard
          email={user.email}
          appUrl={process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}
        />
        <FirefliesSettingsCard
          email={user.email}
          appUrl={process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}
        />
      </div>
    </div>
  );
}


