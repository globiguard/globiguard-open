export const GLOBIGUARD_DECISIONS = [
  "ALLOW",
  "MODIFY",
  "QUEUE",
  "BLOCK"
] as const;

export type GlobiguardDecision = (typeof GLOBIGUARD_DECISIONS)[number];

