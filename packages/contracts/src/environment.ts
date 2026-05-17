export const GLOBIGUARD_ENVIRONMENTS = [
  "local",
  "sandbox",
  "live"
] as const;

export type GlobiguardEnvironment = (typeof GLOBIGUARD_ENVIRONMENTS)[number];

