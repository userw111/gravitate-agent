"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { extractClientInfo } from "@/lib/typeform";

type DashboardStatsProps = {
  email: string;
};

function formatCurrency(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

export default function DashboardStats({ email }: DashboardStatsProps) {
  const responses = useQuery(api.typeform.getAllResponsesForEmail, { email });

  if (responses === undefined) {
    return null;
  }

  const totalClients = responses.length;
  
  // Calculate clients added this month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const clientsThisMonth = responses.filter((response) => {
    const submittedAt = (response.payload as { submitted_at?: string })?.submitted_at;
    if (!submittedAt) return false;
    const submittedDate = new Date(submittedAt);
    return submittedDate >= startOfMonth;
  }).length;

  // Calculate scripts generated this week
  const startOfWeek = new Date(now);
  startOfWeek.setDate(startOfWeek.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const scriptsThisWeek = responses.filter((response) => {
    const submittedAt = (response.payload as { submitted_at?: string })?.submitted_at;
    if (!submittedAt) return false;
    const submittedDate = new Date(submittedAt);
    return submittedDate >= startOfWeek;
  }).length;

  // Calculate upcoming scripts (next 7 days)
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const upcomingScripts = responses.filter((response) => {
    const submittedAt = (response.payload as { submitted_at?: string })?.submitted_at;
    if (!submittedAt) return false;
    const submittedDate = new Date(submittedAt);
    const nextScriptDate = new Date(submittedDate);
    nextScriptDate.setDate(nextScriptDate.getDate() + 7);
    return nextScriptDate >= now && nextScriptDate <= sevenDaysFromNow;
  }).length;

  // Calculate average target revenue
  const clientsWithRevenue = responses.map((response) => {
    const clientInfo = extractClientInfo(response.payload as Parameters<typeof extractClientInfo>[0]);
    return clientInfo.targetRevenue;
  }).filter((revenue): revenue is number => revenue !== null);

  const averageRevenue = clientsWithRevenue.length > 0
    ? Math.round(clientsWithRevenue.reduce((sum, rev) => sum + rev, 0) / clientsWithRevenue.length)
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Active Clients Card */}
      <Card className="bg-linear-to-br from-background to-blue-50/30 dark:to-blue-950/10 border-blue-200/30 dark:border-blue-800/20 shadow-md hover:shadow-lg transition-all duration-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-light text-foreground/70">Active Clients</CardTitle>
          <div className="h-10 w-10 rounded-lg bg-blue-500 flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10 10C12.7614 10 15 7.76142 15 5C15 2.23858 12.7614 0 10 0C7.23858 0 5 2.23858 5 5C5 7.76142 7.23858 10 10 10Z"
                fill="white"
              />
              <path
                d="M10 12C6.68629 12 3.58441 13.1589 1.25 15.25C0.449999 15.95 0 16.9 0 17.9V20H20V17.9C20 16.9 19.55 15.95 18.75 15.25C16.4156 13.1589 13.3137 12 10 12Z"
                fill="white"
              />
            </svg>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-foreground">{totalClients}</div>
          <p className="text-xs text-green-600 mt-1 font-light">
            +{clientsThisMonth} this month
          </p>
        </CardContent>
      </Card>

      {/* Scripts Generated Card */}
      <Card className="bg-linear-to-br from-background to-purple-50/30 dark:to-purple-950/10 border-purple-200/30 dark:border-purple-800/20 shadow-md hover:shadow-lg transition-all duration-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-light text-foreground/70">Scripts Generated</CardTitle>
          <div className="h-10 w-10 rounded-lg bg-blue-500 flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 2C2.89543 2 2 2.89543 2 4V16C2 17.1046 2.89543 18 4 18H16C17.1046 18 18 17.1046 18 16V6L12 0H4ZM4 4H11V7H16V16H4V4Z"
                fill="white"
              />
            </svg>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-foreground">{totalClients}</div>
          <p className="text-xs text-green-600 mt-1 font-light">
            +{scriptsThisWeek} this week
          </p>
        </CardContent>
      </Card>

      {/* Upcoming Scripts Card */}
      <Card className="bg-linear-to-br from-background to-orange-50/30 dark:to-orange-950/10 border-orange-200/30 dark:border-orange-800/20 shadow-md hover:shadow-lg transition-all duration-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-light text-foreground/70">Upcoming Scripts</CardTitle>
          <div className="h-10 w-10 rounded-lg bg-blue-500 flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M15 2H5C3.89543 2 3 2.89543 3 4V16C3 17.1046 3.89543 18 5 18H15C16.1046 18 17 17.1046 17 16V4C17 2.89543 16.1046 2 15 2ZM15 16H5V8H15V16ZM15 6H5V4H15V6Z"
                fill="white"
              />
            </svg>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-foreground">{upcomingScripts}</div>
          <p className="text-xs text-red-600 mt-1 font-light">
            Next 7 days
          </p>
        </CardContent>
      </Card>

      {/* Average Target Revenue Card */}
      <Card className="bg-linear-to-br from-background to-green-50/30 dark:to-green-950/10 border-green-200/30 dark:border-green-800/20 shadow-md hover:shadow-lg transition-all duration-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-light text-foreground/70">Avg Target Revenue</CardTitle>
          <div className="h-10 w-10 rounded-lg bg-blue-500 flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10 2L3 7V18H17V7L10 2ZM10 4.5L15 8V16H5V8L10 4.5ZM9 9H11V11H13V13H11V15H9V13H7V11H9V9Z"
                fill="white"
              />
            </svg>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-foreground">
            {averageRevenue > 0 ? formatCurrency(averageRevenue) : "N/A"}
          </div>
          <p className="text-xs text-foreground/50 mt-1 font-light">
            Per client
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

