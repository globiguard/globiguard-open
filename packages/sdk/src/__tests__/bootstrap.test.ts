import { describe, expect, it } from "vitest";

import {
  buildInstallHeartbeatRequest,
  buildInstallRegistrationRequest,
  resolveBootstrapProfile
} from "../bootstrap.js";

describe("@globiguard/sdk bootstrap profile", () => {
  it("builds install registration and heartbeat payloads from one bootstrap profile", () => {
    const profile = {
      environment: "sandbox" as const,
      deploymentMode: "hosted" as const,
      issuerMode: "globiguard_issued" as const,
      installReporting: "opt_in" as const,
      installLabel: "react-simple",
      installFingerprint: "example-react-simple"
    };

    const registration = buildInstallRegistrationRequest(profile, {
      packageName: "@globiguard/example-react-simple",
      packageVersion: "0.1.0",
      integrationKind: "react",
      runtimeKind: "browser",
      metadata: { example: true }
    });
    const heartbeat = buildInstallHeartbeatRequest(profile, {
      packageVersion: "0.1.0",
      runtimeKind: "browser",
      metadata: { example: true }
    });

    expect(registration).toMatchObject({
      environment: "sandbox",
      deploymentMode: "hosted",
      issuerMode: "globiguard_issued",
      installReporting: "opt_in",
      installLabel: "react-simple",
      installFingerprint: "example-react-simple"
    });
    expect(heartbeat).toMatchObject({
      environment: "sandbox",
      deploymentMode: "hosted",
      issuerMode: "globiguard_issued",
      installReporting: "opt_in",
      installLabel: "react-simple",
      installFingerprint: "example-react-simple"
    });
  });

  it("rejects hosted deployments that try to use customer-issued bootstrap identity", () => {
    expect(() =>
      resolveBootstrapProfile({
        environment: "live",
        deploymentMode: "hosted",
        issuerMode: "customer_issued",
        installReporting: "default"
      })
    ).toThrowError(/globiguard-issued bootstrap credentials/);
  });

  it("rejects sovereign deployments that do not make reporting explicit", () => {
    expect(() =>
      resolveBootstrapProfile({
        environment: "live",
        deploymentMode: "sovereign",
        issuerMode: "customer_issued",
        installReporting: "default"
      })
    ).toThrowError(/must set installReporting to opt_in or disabled explicitly/);
  });

  it("rejects self-hosted deployments that still rely on hosted default reporting", () => {
    expect(() =>
      resolveBootstrapProfile({
        environment: "sandbox",
        deploymentMode: "self_hosted",
        issuerMode: "customer_issued",
        installReporting: "default"
      })
    ).toThrowError(/must set installReporting to opt_in or disabled explicitly/);
  });

  it("rejects runtime-invalid enum values from untyped callers", () => {
    expect(() =>
      resolveBootstrapProfile({
        environment: "local",
        deploymentMode: "foo" as "hosted",
        issuerMode: "customer_issued",
        installReporting: "disabled"
      })
    ).toThrowError(/deploymentMode must be one of/);
  });

  it("rejects install registration builders when reporting is disabled", () => {
    expect(() =>
      buildInstallRegistrationRequest(
        {
          environment: "live",
          deploymentMode: "self_hosted",
          issuerMode: "customer_issued",
          installReporting: "disabled"
        },
        {
          packageName: "@globiguard/example-react-simple",
          packageVersion: "0.1.0",
          integrationKind: "react",
          runtimeKind: "browser"
        }
      )
    ).toThrowError(/disabled for this bootstrap profile/);
  });
});
