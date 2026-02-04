export type CreatePortalSessionInput = {
  userId: string;
  returnUrl: string;
  idempotencyKey?: string;
};

export type CreatePortalSessionOutput = { url: string };
