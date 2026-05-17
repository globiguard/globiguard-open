export interface GlobiguardServiceTargets {
  controlPlane: string;
  brain?: string;
  gateway?: string;
  sidecar?: string;
}

export type GlobiguardServiceName =
  | "controlPlane"
  | "brain"
  | "gateway"
  | "sidecar";

export const GLOBIGUARD_BROWSER_CAPABILITIES = {
  directBrainAccess: false,
  directControlPlaneAccess: true,
  directActionAuthority: false
} as const;

