import type { GlobiguardEnvironment } from "./environment.js";

export type GlobiguardCredentialKind = "publishable" | "secret" | "local";

export interface GlobiguardCredentialBase {
  projectId?: string;
  token?: string;
}

export interface GlobiguardPublishableCredential extends GlobiguardCredentialBase {
  kind: "publishable";
  token: string;
  projectId: string;
}

export interface GlobiguardSecretCredential extends GlobiguardCredentialBase {
  kind: "secret";
  token: string;
  projectId: string;
  environment: Exclude<GlobiguardEnvironment, "local">;
}

export interface GlobiguardLocalCredential extends GlobiguardCredentialBase {
  kind: "local";
}

export type GlobiguardCredential =
  | GlobiguardPublishableCredential
  | GlobiguardSecretCredential
  | GlobiguardLocalCredential;

