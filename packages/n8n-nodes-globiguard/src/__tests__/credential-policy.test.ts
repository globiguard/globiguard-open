import { describe, expect, it } from "vitest";

import {
  describeN8nCredentialPolicy,
  isN8nCredentialKindAllowed
} from "../index.js";

describe("n8n credential policy", () => {
  it("describes a control-plane-first action checkpoint package contract", () => {
    const policy = describeN8nCredentialPolicy({
      environment: "sandbox",
      deploymentMode: "hosted",
      issuerMode: "globiguard_issued",
      installReporting: "default"
    });

    expect(policy).toMatchObject({
      environment: "sandbox",
      deploymentMode: "hosted",
      issuerMode: "globiguard_issued",
      installReporting: "default",
      controlPlaneRequired: true,
      defaultConnectionPath: "control_plane_first",
      directBrainAccess: "explicit_opt_in",
      packageDeliveryStage: "governance_checkpoint",
      publishReady: true
    });
    expect(policy.allowedCredentialKinds).toEqual(["secret"]);
    expect(policy.disallowedCredentialKinds).toEqual(["publishable", "local"]);
  });

  it("keeps self-hosted reporting explicit in the credential policy too", () => {
    const policy = describeN8nCredentialPolicy({
      environment: "live",
      deploymentMode: "self_hosted",
      issuerMode: "customer_issued",
      installReporting: "opt_in"
    });

    expect(policy.installReporting).toBe("opt_in");
    expect(policy.issuerMode).toBe("customer_issued");
  });

  it("rejects hosted profiles that drift from the bootstrap contract", () => {
    expect(() =>
      describeN8nCredentialPolicy({
        environment: "live",
        deploymentMode: "hosted",
        issuerMode: "customer_issued",
        installReporting: "default"
      })
    ).toThrowError(/globiguard-issued bootstrap credentials/);
  });

  it("accepts only secret and local credential kinds", () => {
    expect(isN8nCredentialKindAllowed("secret", "sandbox")).toBe(true);
    expect(isN8nCredentialKindAllowed("local", "sandbox")).toBe(false);
    expect(isN8nCredentialKindAllowed("local", "local")).toBe(true);
    expect(isN8nCredentialKindAllowed("publishable", "local")).toBe(false);
  });
});
