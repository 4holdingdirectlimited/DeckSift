// Fully-local, single-user build: no logins, no tokens, no organizations.
// The app always operates as the same local user in the same local org, so the
// API is called without any Authorization header — just the fixed org id.

export const LOCAL_USER_ID = "local-user";
export const LOCAL_ORG_ID = "local-org";
