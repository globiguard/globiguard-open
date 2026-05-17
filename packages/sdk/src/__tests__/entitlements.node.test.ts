import crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import type {
  GlobiguardEntitlementManifestPayload,
  GlobiguardSignedEntitlementManifest
} from "@globiguard/contracts";
import {
  GLOBIGUARD_ENTITLEMENT_MANIFEST_TYPE
} from "@globiguard/contracts";

import { verifySignedEntitlementManifest } from "../entitlements.node.js";

describe("@globiguard/sdk entitlement manifest verifier", () => {
  it("verifies a valid signed manifest", () => {
    const pair = crypto.generateKeyPairSync("ed25519");
    const publicKeyX = exportPublicKeyX(pair.publicKey);
    const manifest = createSignedManifest(pair.privateKey, {
      manifestId: "manifest-1",
      issuer: "https://control-plane.globiguard.test",
      subject: {
        orgId: "org-1",
        workspaceName: "Workspace One",
        orgSlug: "workspace-one",
        projectId: "project-1",
        projectSlug: "sdk-project",
        environment: "live",
        deploymentMode: "self_hosted"
      },
      commercial: {
        commercialPlan: "ENTERPRISE",
        billingStatus: "ACTIVE",
        pilotActive: false
      },
      entitlements: {
        includedQueriesPerMonth: null,
        frameworkSlots: null,
        overageMode: "CONTRACT"
      }
    });

    const payload = verifySignedEntitlementManifest(manifest, {
      publicKeysById: { "kid-1": publicKeyX },
      expectedIssuer: "https://control-plane.globiguard.test",
      expectedOrgId: "org-1",
      expectedProjectId: "project-1",
      expectedEnvironment: "live",
      expectedDeploymentMode: "self_hosted",
      now: new Date("2026-05-10T12:30:00.000Z")
    });

    expect(payload.manifestId).toBe("manifest-1");
    expect(payload.subject.projectId).toBe("project-1");
  });

  it("rejects tampered payloads", () => {
    const pair = crypto.generateKeyPairSync("ed25519");
    const publicKeyX = exportPublicKeyX(pair.publicKey);
    const manifest = createSignedManifest(pair.privateKey, {
      manifestId: "manifest-1",
      issuer: "https://control-plane.globiguard.test",
      subject: {
        orgId: "org-1",
        workspaceName: "Workspace One",
        orgSlug: "workspace-one",
        projectId: "project-1",
        projectSlug: "sdk-project",
        environment: "live",
        deploymentMode: "sovereign"
      },
      commercial: {
        commercialPlan: "ENTERPRISE",
        billingStatus: "ACTIVE",
        pilotActive: false
      },
      entitlements: {
        includedQueriesPerMonth: null,
        frameworkSlots: null,
        overageMode: "CONTRACT"
      }
    });

    manifest.payload.subject.orgId = "org-2";

    expect(() =>
      verifySignedEntitlementManifest(manifest, {
        publicKeysById: { "kid-1": publicKeyX },
        now: new Date("2026-05-10T12:30:00.000Z")
      })
    ).toThrowError(/does not match the signed token/);
  });

  it("rejects expired manifests", () => {
    const pair = crypto.generateKeyPairSync("ed25519");
    const publicKeyX = exportPublicKeyX(pair.publicKey);
    const manifest = createSignedManifest(pair.privateKey, {
      manifestId: "manifest-1",
      issuer: "https://control-plane.globiguard.test",
      issuedAt: "2026-05-10T11:00:00.000Z",
      notBefore: "2026-05-10T11:00:00.000Z",
      expiresAt: "2026-05-10T11:59:59.000Z",
      subject: {
        orgId: "org-1",
        workspaceName: "Workspace One",
        orgSlug: "workspace-one",
        projectId: "project-1",
        projectSlug: "sdk-project",
        environment: "live",
        deploymentMode: "sovereign"
      },
      commercial: {
        commercialPlan: "ENTERPRISE",
        billingStatus: "SUSPENDED",
        pilotActive: false
      },
      entitlements: {
        includedQueriesPerMonth: null,
        frameworkSlots: null,
        overageMode: "CONTRACT"
      }
    });

    expect(() =>
      verifySignedEntitlementManifest(manifest, {
        publicKeysById: { "kid-1": publicKeyX },
        now: new Date("2026-05-10T12:30:00.000Z")
      })
    ).toThrowError(/has expired/);
  });

  it("rejects manifests with invalid issuedAt", () => {
    const pair = crypto.generateKeyPairSync("ed25519");
    const publicKeyX = exportPublicKeyX(pair.publicKey);
    const manifest = createSignedManifest(pair.privateKey, {
      manifestId: "manifest-1",
      issuer: "https://control-plane.globiguard.test",
      issuedAt: "not-a-date",
      notBefore: "2026-05-10T12:00:00.000Z",
      subject: {
        orgId: "org-1",
        workspaceName: "Workspace One",
        orgSlug: "workspace-one",
        projectId: "project-1",
        projectSlug: "sdk-project",
        environment: "sandbox",
        deploymentMode: "self_hosted"
      },
      commercial: {
        commercialPlan: "STARTER",
        billingStatus: "ACTIVE",
        pilotActive: false
      },
      entitlements: {
        includedQueriesPerMonth: 1000000,
        frameworkSlots: 3,
        overageMode: "METERED"
      }
    });

    expect(() =>
      verifySignedEntitlementManifest(manifest, {
        publicKeysById: { "kid-1": publicKeyX },
        now: new Date("2026-05-10T12:30:00.000Z")
      })
    ).toThrowError(/issuedAt/);
  });

  it("rejects manifests with invalid nested commercial state", () => {
    const pair = crypto.generateKeyPairSync("ed25519");
    const publicKeyX = exportPublicKeyX(pair.publicKey);
    const manifest = createSignedManifestFromRawPayload(pair.privateKey, {
      manifestType: GLOBIGUARD_ENTITLEMENT_MANIFEST_TYPE,
      manifestVersion: 1,
      manifestId: "manifest-1",
      issuer: "https://control-plane.globiguard.test",
      issuedAt: "2026-05-10T12:00:00.000Z",
      notBefore: "2026-05-10T12:00:00.000Z",
      expiresAt: "2026-05-11T12:00:00.000Z",
      subject: {
        orgId: "org-1",
        workspaceName: "Workspace One",
        orgSlug: "workspace-one",
        projectId: "project-1",
        projectSlug: "sdk-project",
        environment: "sandbox",
        deploymentMode: "self_hosted"
      },
      commercial: {
        commercialPlan: "ENTERPRISE",
        billingStatus: "BROKEN",
        pilotActive: false
      },
      entitlements: {
        includedQueriesPerMonth: null,
        frameworkSlots: null,
        overageMode: "CONTRACT"
      }
    });

    expect(() =>
      verifySignedEntitlementManifest(manifest, {
        publicKeysById: { "kid-1": publicKeyX },
        now: new Date("2026-05-10T12:30:00.000Z")
      })
    ).toThrowError(/commercial\.billingStatus/);
  });
});

function createSignedManifest(
  privateKey: crypto.KeyObject,
  overrides: Partial<GlobiguardEntitlementManifestPayload>
): GlobiguardSignedEntitlementManifest {
  const protectedHeader = {
    alg: "EdDSA" as const,
    kid: "kid-1",
    typ: GLOBIGUARD_ENTITLEMENT_MANIFEST_TYPE
  };
  const payload: GlobiguardEntitlementManifestPayload = {
    manifestType: GLOBIGUARD_ENTITLEMENT_MANIFEST_TYPE,
    manifestVersion: 1,
    manifestId: overrides.manifestId ?? "manifest-1",
    issuer: overrides.issuer ?? "https://control-plane.globiguard.test",
    issuedAt: overrides.issuedAt ?? "2026-05-10T12:00:00.000Z",
    notBefore: overrides.notBefore ?? "2026-05-10T12:00:00.000Z",
    expiresAt: overrides.expiresAt ?? "2026-05-11T12:00:00.000Z",
    subject: {
      orgId: "org-1",
      workspaceName: "Workspace One",
      orgSlug: "workspace-one",
      projectId: "project-1",
      projectSlug: "sdk-project",
      environment: "sandbox",
      deploymentMode: "self_hosted",
      ...overrides.subject
    },
    commercial: {
      commercialPlan: "STARTER",
      billingStatus: "ACTIVE",
      pilotActive: false,
      ...overrides.commercial
    },
    entitlements: {
      includedQueriesPerMonth: 1000000,
      frameworkSlots: 3,
      overageMode: "METERED",
      ...overrides.entitlements
    }
  };

  const encodedHeader = base64UrlEncode(
    Buffer.from(JSON.stringify(protectedHeader), "utf8")
  );
  const encodedPayload = base64UrlEncode(
    Buffer.from(JSON.stringify(payload), "utf8")
  );
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign(
    null,
    Buffer.from(signingInput, "utf8"),
    privateKey
  );

  return {
    serialization: "jws-compact",
    token: `${signingInput}.${base64UrlEncode(signature)}`,
    protected: protectedHeader,
    payload
  };
}

function createSignedManifestFromRawPayload(
  privateKey: crypto.KeyObject,
  payload: Record<string, unknown>
): GlobiguardSignedEntitlementManifest {
  const protectedHeader = {
    alg: "EdDSA" as const,
    kid: "kid-1",
    typ: GLOBIGUARD_ENTITLEMENT_MANIFEST_TYPE
  };
  const encodedHeader = base64UrlEncode(
    Buffer.from(JSON.stringify(protectedHeader), "utf8")
  );
  const encodedPayload = base64UrlEncode(
    Buffer.from(JSON.stringify(payload), "utf8")
  );
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign(
    null,
    Buffer.from(signingInput, "utf8"),
    privateKey
  );

  return {
    serialization: "jws-compact",
    token: `${signingInput}.${base64UrlEncode(signature)}`,
    protected: protectedHeader,
    payload: payload as unknown as GlobiguardEntitlementManifestPayload
  };
}

function exportPublicKeyX(publicKey: crypto.KeyObject): string {
  const publicKeyDerPrefix = Buffer.from("302a300506032b6570032100", "hex");
  const publicKeyDer = publicKey.export({
    format: "der",
    type: "spki"
  });
  return base64UrlEncode(publicKeyDer.subarray(publicKeyDerPrefix.length));
}

function base64UrlEncode(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
