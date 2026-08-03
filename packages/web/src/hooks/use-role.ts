// Fully-local single-user build: the local operator is always an admin.
export function useRole() {
  return {
    role: "admin" as const,
    isPending: false,
    isAdmin: true,
    hasRole: (...roles: string[]) => roles.includes("admin"),
  };
}
