import { API_BASE } from "@/lib/api/client";
import { LOCAL_ORG_ID } from "@/lib/auth/client";

// Fully-local single-user build: SSE endpoints need only the fixed org id.
function getOrgParams(): URLSearchParams {
  return new URLSearchParams({ orgId: LOCAL_ORG_ID });
}

export async function createSessionEventSource(
  collectionGuid: string,
): Promise<EventSource> {
  const params = getOrgParams();
  return new EventSource(
    `${API_BASE}/api/collections/${encodeURIComponent(collectionGuid)}/stream?${params}`,
  );
}

export async function createLockEventsSource(): Promise<EventSource> {
  const params = getOrgParams();
  return new EventSource(`${API_BASE}/api/collections/lock-events?${params}`);
}
