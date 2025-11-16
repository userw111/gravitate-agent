export type AdStrategistBriefing = {
  brandIdentity: {
    brandName: string;
    serviceBeingSold: string;
    brandPersonality: string;
  };
  audienceAndProblem: {
    targetAudience: string;
    geographicLocation: string;
    localEnemies: string;
    obviousProblem: string;
    realProblem: string;
  };
  solutionAndDifferentiators: {
    dreamOutcome: string;
    uniqueMechanism: string;
  };
  proofAndCredibility: {
    guarantee: string;
    trustBadges: string;
    socialProof: string;
  };
  offerAndCTA: {
    offer: string;
    urgency: string;
    ctaButton: string;
  };
};

export function createEmptyBriefing(): AdStrategistBriefing {
  return {
    brandIdentity: {
      brandName: "",
      serviceBeingSold: "",
      brandPersonality: "",
    },
    audienceAndProblem: {
      targetAudience: "",
      geographicLocation: "",
      localEnemies: "",
      obviousProblem: "",
      realProblem: "",
    },
    solutionAndDifferentiators: {
      dreamOutcome: "",
      uniqueMechanism: "",
    },
    proofAndCredibility: {
      guarantee: "",
      trustBadges: "",
      socialProof: "",
    },
    offerAndCTA: {
      offer: "",
      urgency: "",
      ctaButton: "",
    },
  };
}

export function normalizeBriefing(input: unknown): AdStrategistBriefing {
  const empty = createEmptyBriefing();
  if (!input || typeof input !== "object") {
    return empty;
  }

  const obj = input as Record<string, any>;

  return {
    brandIdentity: {
      brandName: String(obj.brandIdentity?.brandName ?? empty.brandIdentity.brandName),
      serviceBeingSold: String(
        obj.brandIdentity?.serviceBeingSold ?? empty.brandIdentity.serviceBeingSold,
      ),
      brandPersonality: String(
        obj.brandIdentity?.brandPersonality ?? empty.brandIdentity.brandPersonality,
      ),
    },
    audienceAndProblem: {
      targetAudience: String(
        obj.audienceAndProblem?.targetAudience ?? empty.audienceAndProblem.targetAudience,
      ),
      geographicLocation: String(
        obj.audienceAndProblem?.geographicLocation ??
          empty.audienceAndProblem.geographicLocation,
      ),
      localEnemies: String(
        obj.audienceAndProblem?.localEnemies ?? empty.audienceAndProblem.localEnemies,
      ),
      obviousProblem: String(
        obj.audienceAndProblem?.obviousProblem ?? empty.audienceAndProblem.obviousProblem,
      ),
      realProblem: String(
        obj.audienceAndProblem?.realProblem ?? empty.audienceAndProblem.realProblem,
      ),
    },
    solutionAndDifferentiators: {
      dreamOutcome: String(
        obj.solutionAndDifferentiators?.dreamOutcome ??
          empty.solutionAndDifferentiators.dreamOutcome,
      ),
      uniqueMechanism: String(
        obj.solutionAndDifferentiators?.uniqueMechanism ??
          empty.solutionAndDifferentiators.uniqueMechanism,
      ),
    },
    proofAndCredibility: {
      guarantee: String(
        obj.proofAndCredibility?.guarantee ?? empty.proofAndCredibility.guarantee,
      ),
      trustBadges: String(
        obj.proofAndCredibility?.trustBadges ?? empty.proofAndCredibility.trustBadges,
      ),
      socialProof: String(
        obj.proofAndCredibility?.socialProof ?? empty.proofAndCredibility.socialProof,
      ),
    },
    offerAndCTA: {
      offer: String(obj.offerAndCTA?.offer ?? empty.offerAndCTA.offer),
      urgency: String(obj.offerAndCTA?.urgency ?? empty.offerAndCTA.urgency),
      // CTA button text is standardized for all briefs
      ctaButton: "Click the button below",
    },
  };
}


