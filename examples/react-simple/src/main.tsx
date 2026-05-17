import React from "react";
import ReactDOM from "react-dom/client";

import { GlobiguardProvider } from "@globiguard/react";
import { createBrowserClient } from "@globiguard/sdk";

import { App } from "./App.js";

const controlPlaneUrl = import.meta.env.VITE_GLOBIGUARD_CONTROL_PLANE_URL;
const realtimeBearerToken =
  import.meta.env.VITE_GLOBIGUARD_REALTIME_BEARER_TOKEN;
const realtimeQueueOrgId =
  import.meta.env.VITE_GLOBIGUARD_REALTIME_QUEUE_ORG_ID;
const bootstrapProfile = {
  environment: "local",
  deploymentMode: "self_hosted",
  issuerMode: "customer_issued",
  installReporting: "opt_in"
} as const;

const client = createBrowserClient({
  environment: bootstrapProfile.environment,
  credential: { kind: "local" },
  services: {
    controlPlane: controlPlaneUrl ?? "http://127.0.0.1:3000"
  },
  realtime: realtimeBearerToken
    ? {
        auth: {
          kind: "bearer",
          token: realtimeBearerToken
        }
      }
    : undefined
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GlobiguardProvider client={client}>
      <App
        bootstrapProfile={bootstrapProfile}
        controlPlaneUrl={controlPlaneUrl}
        realtimeQueueOrgId={realtimeQueueOrgId}
      />
    </GlobiguardProvider>
  </React.StrictMode>
);

