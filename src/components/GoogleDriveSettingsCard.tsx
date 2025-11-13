"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSearchParams } from "next/navigation";

export default function GoogleDriveSettingsCard({ email }: { email: string }) {
  const searchParams = useSearchParams();
  const cfg = useQuery(api.googleDrive.getConfigForEmail, { email });
  const disconnectAccount = useMutation(api.googleDrive.disconnectAccount);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);

  // Check for success message in URL on mount
  React.useEffect(() => {
    const success = searchParams.get("success");
    if (success === "google_drive_connected") {
      setShowSuccess(true);
      // Clear the param from URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
      // Hide success message after 5 seconds
      setTimeout(() => setShowSuccess(false), 5000);
    }
  }, [searchParams]);

  const handleConnect = () => {
    window.location.href = "/api/google-drive/auth";
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect your Google Drive account? This will prevent scripts from being uploaded to Drive.")) {
      return;
    }
    setDisconnecting(true);
    try {
      await disconnectAccount({ email });
    } catch (error) {
      console.error("Failed to disconnect Google Drive:", error);
      alert(error instanceof Error ? error.message : "Failed to disconnect account");
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = !!(cfg?.accessToken && cfg?.refreshToken);

  return (
    <div className="rounded-lg border border-foreground/10 p-6 space-y-4">
      <h2 className="text-lg font-light">Google Drive Integration</h2>
      
      <div className="space-y-2">
        <p className="text-sm text-foreground/70">
          Connect your Google Drive account to automatically upload generated scripts to Drive.
        </p>

        {showSuccess && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3">
            <p className="text-sm text-green-500">Google Drive account connected successfully!</p>
          </div>
        )}
        
        {searchParams.get("error") === "invalid_client_credentials" && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-sm text-red-500 font-medium mb-1">Invalid Client Credentials</p>
            <p className="text-xs text-red-500/80">
              Please check that GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are correctly set in your environment variables.
            </p>
          </div>
        )}
        
        {searchParams.get("error") === "redirect_uri_mismatch" && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-sm text-red-500 font-medium mb-1">Redirect URI Mismatch</p>
            <p className="text-xs text-red-500/80">
              The redirect URI in your Google Cloud Console must match: {typeof window !== "undefined" ? `${window.location.origin}/api/google-drive/callback` : "/api/google-drive/callback"}
            </p>
          </div>
        )}
        
        {searchParams.get("error") === "token_exchange_failed" && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-sm text-red-500 font-medium mb-1">Token Exchange Failed</p>
            <p className="text-xs text-red-500/80">
              Failed to exchange authorization code. Please try connecting again.
            </p>
          </div>
        )}
        
        {isConnected ? (
          <div className="space-y-3">
            <div className="rounded-md border border-foreground/10 p-3 bg-green-500/10">
              <div className="flex items-center gap-2 mb-2">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-green-500"
                >
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                    fill="currentColor"
                  />
                </svg>
                <span className="text-sm font-medium text-green-500">Connected</span>
              </div>
              {cfg.userEmail && (
                <div className="text-xs text-foreground/70">
                  Account: {cfg.userEmail}
                </div>
              )}
              {cfg.userName && (
                <div className="text-xs text-foreground/70">
                  Name: {cfg.userName}
                </div>
              )}
              {cfg.tokenExpiry && (
                <div className="text-xs text-foreground/60 mt-1">
                  Token expires: {new Date(cfg.tokenExpiry).toLocaleString()}
                </div>
              )}
            </div>
            
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-4 py-2 text-sm rounded-md border border-red-500/30 text-red-500 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 font-light"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect Account"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-foreground/10 p-3 bg-background/50">
              <div className="flex items-center gap-2 mb-2">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-foreground/50"
                >
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                    fill="currentColor"
                  />
                </svg>
                <span className="text-sm text-foreground/60">Not Connected</span>
              </div>
              <p className="text-xs text-foreground/60">
                Connect your Google Drive account to enable automatic script uploads.
              </p>
            </div>
            
            <button
              onClick={handleConnect}
              className="px-4 py-2 text-sm rounded-md border border-foreground/15 bg-background hover:bg-foreground/5 transition-all duration-150 font-light flex items-center gap-2"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Connect Google Drive
            </button>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-foreground/10">
        <p className="text-xs text-foreground/60">
          When connected, generated scripts will be automatically uploaded to your Google Drive.
          The integration requires access to create and manage files in your Drive.
        </p>
      </div>
    </div>
  );
}

