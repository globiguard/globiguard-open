import type {
  GlobiguardSdkErrorKind,
  GlobiguardSdkErrorShape
} from "@globiguard/contracts";

export type { GlobiguardSdkErrorKind, GlobiguardSdkErrorShape };

export class GlobiguardAuthorityError extends Error {
  readonly kind: GlobiguardSdkErrorKind;
  readonly authorizationId?: string;
  readonly queueEntryId?: string | null;
  readonly evidencePackageId?: string;
  readonly retryAfterSeconds?: number;
  readonly safeDetails?: Record<string, string | number | boolean | null>;

  constructor(shape: GlobiguardSdkErrorShape) {
    super(shape.message);
    this.name = "GlobiguardAuthorityError";
    this.kind = shape.kind;
    this.authorizationId = shape.authorizationId;
    this.queueEntryId = shape.queueEntryId;
    this.evidencePackageId = shape.evidencePackageId;
    this.retryAfterSeconds = shape.retryAfterSeconds;
    this.safeDetails = shape.safeDetails;
  }

  toJSON(): GlobiguardSdkErrorShape {
    return {
      kind: this.kind,
      message: this.message,
      authorizationId: this.authorizationId,
      queueEntryId: this.queueEntryId,
      evidencePackageId: this.evidencePackageId,
      retryAfterSeconds: this.retryAfterSeconds,
      safeDetails: this.safeDetails
    };
  }
}

export class GlobiguardConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GlobiguardConfigError";
  }
}

export class GlobiguardHttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "GlobiguardHttpError";
    this.status = status;
    this.body = body;
  }
}

