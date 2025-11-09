import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { MessageSquare } from "lucide-react";
import ChatPageContent from "@/components/ChatPageContent";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center justify-between px-2">
            <span className="text-sm font-medium">Chat History</span>
            <SidebarTrigger />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <MessageSquare />
                    <span>New Chat</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {/* Chat history items will be added here later */}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <ChatPageContent />
      </SidebarInset>
    </SidebarProvider>
  );
}
