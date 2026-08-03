import { createMiddleware } from "hono/factory";

export type OrgRole = "owner" | "admin" | "member";

export type AppVariables = {
  jwtClaims: string;
  userId: string;
  userRole: string;
  orgId: string;
  orgRole: OrgRole;
};
export type AppEnv = { Variables: AppVariables };

// Fully-local, single-user build: no logins, no tokens, no org switching.
// Every request is treated as the same local operator in the same org, so the
// org-scoped queries and RLS still work without any auth ceremony.
export const LOCAL_USER_ID = "local-user";
export const LOCAL_ORG_ID = "local-org";
export const LOCAL_ORG_ROLE: OrgRole = "owner";
export const LOCAL_USER_ROLE = "admin";

// Kept for API compatibility (SSE routes call it); always "succeeds" locally.
export async function verifyToken(
  _token: string,
): Promise<{ sub: string } | null> {
  return { sub: LOCAL_USER_ID };
}

export async function getUserRole(_userId: string): Promise<string> {
  return LOCAL_USER_ROLE;
}

export async function getUserDisplayName(_userId: string): Promise<string> {
  return "Local User";
}

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  c.set("userId", LOCAL_USER_ID);
  c.set("userRole", LOCAL_USER_ROLE);
  c.set(
    "jwtClaims",
    JSON.stringify({ sub: LOCAL_USER_ID, role: "authenticated" }),
  );
  await next();
});

export const requireOrg = createMiddleware<AppEnv>(async (c, next) => {
  c.set("orgId", LOCAL_ORG_ID);
  c.set("orgRole", LOCAL_ORG_ROLE);
  c.set(
    "jwtClaims",
    JSON.stringify({
      sub: LOCAL_USER_ID,
      role: "authenticated",
      org_id: LOCAL_ORG_ID,
    }),
  );
  await next();
});

export function requireRole(..._roles: string[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    await next();
  });
}

export function requireOrgRole(..._roles: OrgRole[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    await next();
  });
}
