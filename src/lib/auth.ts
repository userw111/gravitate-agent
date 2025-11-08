import { cookies } from "next/headers";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("workos_user_id")?.value;
  const userEmail = cookieStore.get("workos_user_email")?.value;

  if (!userId || !userEmail) {
    return null;
  }

  return {
    id: userId,
    email: userEmail,
  };
}

