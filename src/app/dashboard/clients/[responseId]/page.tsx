import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ClientDetails from "@/components/ClientDetails";

type PageProps = {
  params: Promise<{ responseId: string }>;
};

export default async function ClientDetailsPage({ params }: PageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  const { responseId } = await params;

  return <ClientDetails email={user.email} responseId={responseId} />;
}

