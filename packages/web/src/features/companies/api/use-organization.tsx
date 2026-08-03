import { LOCAL_ORG_ID } from "@/lib/auth/client";
import { useCallback, useMemo } from "react";

// Fully-local single-user build: there is exactly one org and no switching.
const LOCAL_ORG = { id: LOCAL_ORG_ID, name: "Local" };

export function useOrg() {
  const setActiveOrg = useCallback(async (_orgId: string) => {
    // single org — nothing to switch
  }, []);

  return useMemo(
    () => ({
      orgs: [LOCAL_ORG],
      activeOrg: LOCAL_ORG,
      isLoading: false,
      setActiveOrg,
    }),
    [setActiveOrg],
  );
}
