"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import type { AdStrategistBriefing } from "@/lib/adBriefing";
import { normalizeBriefing, createEmptyBriefing } from "@/lib/adBriefing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type AdBriefingFormProps = {
  ownerEmail: string;
  clientId: Id<"clients">;
};

type LoadState = "idle" | "loading" | "error";
type SaveState = "idle" | "saving" | "error" | "saved";

export function AdBriefingForm({ ownerEmail, clientId }: AdBriefingFormProps) {
  const [briefing, setBriefing] = useState<AdStrategistBriefing>(
    createEmptyBriefing(),
  );
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [source, setSource] = useState<"saved" | "llm" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const upsertBriefing = useMutation(api.adBriefings.upsertBriefing);

  async function fetchBriefing(forceRegenerate: boolean) {
    try {
      setLoadState("loading");
      setErrorMessage(null);

      const res = await fetch("/api/ads/client-briefing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId,
          forceRegenerate,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { detail?: string; error?: string } | null;
        const detail = data?.detail || data?.error || res.statusText;
        throw new Error(detail);
      }

      const data = (await res.json()) as {
        source: "saved" | "llm";
        briefing: unknown;
      };

      setBriefing(normalizeBriefing(data.briefing));
      setSource(data.source);
      setLoadState("idle");
    } catch (error) {
      setLoadState("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load briefing",
      );
    }
  }

  useEffect(() => {
    void fetchBriefing(false);
  }, [clientId]);

  async function handleSave() {
    try {
      setSaveState("saving");
      setErrorMessage(null);

      await upsertBriefing({
        ownerEmail,
        clientId,
        briefing,
      });

      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch (error) {
      setSaveState("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save briefing",
      );
    }
  }

  const isLoading = loadState === "loading";
  const isSaving = saveState === "saving";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-foreground/70">
            This brief will be used as the core input for ad creation. It is
            auto-generated from your Typeform responses, client data, and
            transcripts, and you can refine anything manually.
          </p>
          {source && (
            <p className="text-xs text-foreground/50">
              Source:{" "}
              {source === "saved"
                ? "Last saved briefing"
                : "Generated from client data"}
            </p>
          )}
          {errorMessage && (
            <p className="text-xs text-destructive">{errorMessage}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchBriefing(true)}
            disabled={isLoading || isSaving}
            className="cursor-pointer"
          >
            {isLoading ? "Regenerating..." : "Regenerate from data"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="cursor-pointer"
          >
            {isSaving ? "Saving..." : saveState === "saved" ? "Saved" : "Save"}
          </Button>
        </div>
      </div>

      {/* 1. Brand & Service Identity */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">
          1. Brand &amp; Service Identity
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="brandName">Brand Name</Label>
            <Input
              id="brandName"
              placeholder={`e.g., "Sleekview", "Blitz Window Cleaning"`}
              value={briefing.brandIdentity.brandName}
              onChange={(e) =>
                setBriefing((prev) => ({
                  ...prev,
                  brandIdentity: {
                    ...prev.brandIdentity,
                    brandName: e.target.value,
                  },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="serviceBeingSold">Service Being Sold</Label>
            <Input
              id="serviceBeingSold"
              placeholder='e.g., "Pet-friendly synthetic turf"'
              value={briefing.brandIdentity.serviceBeingSold}
              onChange={(e) =>
                setBriefing((prev) => ({
                  ...prev,
                  brandIdentity: {
                    ...prev.brandIdentity,
                    serviceBeingSold: e.target.value,
                  },
                }))
              }
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="brandPersonality">Brand Personality</Label>
          <Input
            id="brandPersonality"
            placeholder='e.g., "Professional & reliable", "Premium & luxury"'
            value={briefing.brandIdentity.brandPersonality}
            onChange={(e) =>
              setBriefing((prev) => ({
                ...prev,
                brandIdentity: {
                  ...prev.brandIdentity,
                  brandPersonality: e.target.value,
                },
              }))
            }
          />
        </div>
      </section>

      {/* 2. Audience & Problem */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">
          2. Audience &amp; Problem
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="targetAudience">Target Audience</Label>
            <Input
              id="targetAudience"
              placeholder='e.g., "Suburban homeowners", "Pet owners"'
              value={briefing.audienceAndProblem.targetAudience}
              onChange={(e) =>
                setBriefing((prev) => ({
                  ...prev,
                  audienceAndProblem: {
                    ...prev.audienceAndProblem,
                    targetAudience: e.target.value,
                  },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="geographicLocation">Geographic Location</Label>
            <Input
              id="geographicLocation"
              placeholder='e.g., "Charleston, SC"'
              value={briefing.audienceAndProblem.geographicLocation}
              onChange={(e) =>
                setBriefing((prev) => ({
                  ...prev,
                  audienceAndProblem: {
                    ...prev.audienceAndProblem,
                    geographicLocation: e.target.value,
                  },
                }))
              }
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="localEnemies">Local "Enemies"</Label>
          <Input
            id="localEnemies"
            placeholder='e.g., "Georgia pollen", "Houston humidity", "Arizona hard water"'
            value={briefing.audienceAndProblem.localEnemies}
            onChange={(e) =>
              setBriefing((prev) => ({
                ...prev,
                audienceAndProblem: {
                  ...prev.audienceAndProblem,
                  localEnemies: e.target.value,
                },
              }))
            }
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="obviousProblem">The Obvious Problem</Label>
            <Textarea
              id="obviousProblem"
              placeholder='e.g., "Dirty windows", "Patchy grass", "Tangled light strands"'
              value={briefing.audienceAndProblem.obviousProblem}
              onChange={(e) =>
                setBriefing((prev) => ({
                  ...prev,
                  audienceAndProblem: {
                    ...prev.audienceAndProblem,
                    obviousProblem: e.target.value,
                  },
                }))
              }
              className="min-h-[60px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="realProblem">The Real Problem (Frustration)</Label>
            <Textarea
              id="realProblem"
              placeholder='e.g., "Wasting their weekends", "Feeling embarrassed in front of guests"'
              value={briefing.audienceAndProblem.realProblem}
              onChange={(e) =>
                setBriefing((prev) => ({
                  ...prev,
                  audienceAndProblem: {
                    ...prev.audienceAndProblem,
                    realProblem: e.target.value,
                  },
                }))
              }
              className="min-h-[60px]"
            />
          </div>
        </div>
      </section>

      {/* 3. Solution & Differentiators */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">
          3. Solution &amp; Differentiators
        </h3>
        <div className="space-y-2">
          <Label htmlFor="dreamOutcome">The "Dream Outcome"</Label>
          <Textarea
            id="dreamOutcome"
            placeholder='e.g., "The best-looking house on the block", "More free time with family"'
            value={briefing.solutionAndDifferentiators.dreamOutcome}
            onChange={(e) =>
              setBriefing((prev) => ({
                ...prev,
                solutionAndDifferentiators: {
                  ...prev.solutionAndDifferentiators,
                  dreamOutcome: e.target.value,
                },
              }))
            }
            className="min-h-[60px]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="uniqueMechanism">Unique Mechanism / USP</Label>
          <Textarea
            id="uniqueMechanism"
            placeholder='e.g., "We use a deionized pure-water system", "We are the only all-inclusive (install, maintenance, removal) service"'
            value={briefing.solutionAndDifferentiators.uniqueMechanism}
            onChange={(e) =>
              setBriefing((prev) => ({
                ...prev,
                solutionAndDifferentiators: {
                  ...prev.solutionAndDifferentiators,
                  uniqueMechanism: e.target.value,
                },
              }))
            }
            className="min-h-[60px]"
          />
        </div>
      </section>

      {/* 4. Proof & Credibility */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">
          4. Proof &amp; Credibility
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="guarantee">Guarantee</Label>
            <Input
              id="guarantee"
              placeholder={`e.g., "100% Satisfaction Guarantee", "You don't pay until it's perfect"`}
              value={briefing.proofAndCredibility.guarantee}
              onChange={(e) =>
                setBriefing((prev) => ({
                  ...prev,
                  proofAndCredibility: {
                    ...prev.proofAndCredibility,
                    guarantee: e.target.value,
                  },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trustBadges">Trust Badges</Label>
            <Input
              id="trustBadges"
              placeholder='e.g., "Licensed & Insured, Family-Owned, Certified Installers"'
              value={briefing.proofAndCredibility.trustBadges}
              onChange={(e) =>
                setBriefing((prev) => ({
                  ...prev,
                  proofAndCredibility: {
                    ...prev.proofAndCredibility,
                    trustBadges: e.target.value,
                  },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="socialProof">Social Proof</Label>
            <Input
              id="socialProof"
              placeholder='e.g., "500+ 5-star reviews", "Trusted for 18 years"'
              value={briefing.proofAndCredibility.socialProof}
              onChange={(e) =>
                setBriefing((prev) => ({
                  ...prev,
                  proofAndCredibility: {
                    ...prev.proofAndCredibility,
                    socialProof: e.target.value,
                  },
                }))
              }
            />
          </div>
        </div>
      </section>

      {/* 5. Offer & CTA */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">
          5. Offer &amp; Call to Action (CTA)
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="offer">The Offer</Label>
            <Input
              id="offer"
              placeholder='e.g., "$100 off first service", "Free screen cleaning"'
              value={briefing.offerAndCTA.offer}
              onChange={(e) =>
                setBriefing((prev) => ({
                  ...prev,
                  offerAndCTA: {
                    ...prev.offerAndCTA,
                    offer: e.target.value,
                  },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="urgency">Urgency</Label>
            <Input
              id="urgency"
              placeholder='e.g., "This week only", "Before spots fill up"'
              value={briefing.offerAndCTA.urgency}
              onChange={(e) =>
                setBriefing((prev) => ({
                  ...prev,
                  offerAndCTA: {
                    ...prev.offerAndCTA,
                    urgency: e.target.value,
                  },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ctaButton">CTA Button Text</Label>
            <Input
              id="ctaButton"
              placeholder='e.g., "Get My Free Estimate", "Book Now"'
              value={briefing.offerAndCTA.ctaButton}
              onChange={(e) =>
                setBriefing((prev) => ({
                  ...prev,
                  offerAndCTA: {
                    ...prev.offerAndCTA,
                    ctaButton: e.target.value,
                  },
                }))
              }
            />
          </div>
        </div>
      </section>
    </div>
  );
}


