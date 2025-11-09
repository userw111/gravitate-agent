import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import UnlinkedResponses from "@/components/UnlinkedResponses";

export default async function UnlinkedPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-light tracking-tight">Unlinked Responses</h1>
      <UnlinkedResponses email={user.email} />
    </div>
  );
}

