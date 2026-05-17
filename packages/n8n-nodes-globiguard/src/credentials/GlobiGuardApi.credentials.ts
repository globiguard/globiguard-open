import type { ICredentialType, INodeProperties } from "n8n-workflow";

export class GlobiGuardApi implements ICredentialType {
  name = "globiGuardApi";

  displayName = "GlobiGuard API";

  documentationUrl =
    "https://github.com/globiguard/globiguard-open/tree/main/packages/n8n-nodes-globiguard#credential-policy";

  properties: INodeProperties[] = [
    {
      displayName: "Control Plane URL",
      name: "controlPlaneUrl",
      type: "string",
      default: "",
      placeholder: "https://api.globiguard.io",
      description:
        "GlobiGuard control-plane URL used for install registration and heartbeat."
    },
    {
      displayName: "Environment",
      name: "environment",
      type: "options",
      default: "sandbox",
      description:
        "Local credentials are only valid when Environment is set to Local.",
      options: [
        { name: "Local", value: "local" },
        { name: "Sandbox", value: "sandbox" },
        { name: "Live", value: "live" }
      ]
    },
    {
      displayName: "Credential Kind",
      name: "credentialKind",
      type: "options",
      default: "secret",
      options: [
        { name: "Secret", value: "secret" },
        { name: "Local", value: "local" }
      ],
      description:
        "n8n uses the server credential contract only; publishable credentials are not valid here, and local credentials are only valid with the local environment."
    },
    {
      displayName: "Project ID",
      name: "projectId",
      type: "string",
      default: "",
      displayOptions: {
        show: {
          credentialKind: ["secret"]
        }
      }
    },
    {
      displayName: "Token",
      name: "token",
      type: "string",
      typeOptions: {
        password: true
      },
      default: "",
      description:
        "Secret token for hosted or private deployments, or optional local token for local runtime testing."
    },
    {
      displayName: "Webhook Signing Secret",
      name: "webhookSigningSecret",
      type: "string",
      typeOptions: {
        password: true
      },
      default: "",
      description:
        "Optional GlobiGuard trust-webhook signing secret. It is only used by the Verify GlobiGuard Webhook operation and must not be reused as an API token."
    },
    {
      displayName: "Deployment Mode",
      name: "deploymentMode",
      type: "options",
      default: "hosted",
      options: [
        { name: "Hosted", value: "hosted" },
        { name: "Self Hosted", value: "self_hosted" },
        { name: "Sovereign", value: "sovereign" }
      ]
    },
    {
      displayName: "Issuer Mode",
      name: "issuerMode",
      type: "options",
      default: "globiguard_issued",
      options: [
        { name: "GlobiGuard Issued", value: "globiguard_issued" },
        { name: "Customer Issued", value: "customer_issued" }
      ]
    },
    {
      displayName: "Install Reporting",
      name: "installReporting",
      type: "options",
      default: "default",
      options: [
        { name: "Default", value: "default" },
        { name: "Opt In", value: "opt_in" },
        { name: "Disabled", value: "disabled" }
      ],
      description:
        "Hosted may use default reporting. Self-hosted and sovereign must choose opt_in or disabled explicitly."
    },
    {
      displayName: "Trusted Decision Engine URL",
      name: "brainUrl",
      type: "string",
      default: "",
      placeholder: "https://decision.globiguard.internal",
      description:
        "Optional trusted decision-engine endpoint. Leave empty for the control-plane-first default."
    },
    {
      displayName: "Install Label",
      name: "installLabel",
      type: "string",
      default: "",
      description: "Optional stable human-readable label for this n8n install."
    },
    {
      displayName: "Install Fingerprint",
      name: "installFingerprint",
      type: "string",
      default: "",
      description:
        "Optional stable machine fingerprint for this n8n install surface."
    }
  ];
}
