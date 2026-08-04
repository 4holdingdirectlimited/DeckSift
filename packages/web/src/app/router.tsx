import { lazy, Suspense } from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useRole } from "@/hooks/use-role";
import { Navigate, Outlet, createBrowserRouter } from "react-router-dom";

// Route-level code splitting: each page loads on first visit instead of being
// bundled into one 1.9 MB entry chunk. Layouts/guards stay eager.
const LandingPage = lazy(() => import("@/app/routes/index"));
const BuildGuidePage = lazy(() => import("@/app/routes/build"));
const AppLayout = lazy(() => import("@/app/routes/app/layout"));
const ScannerPage = lazy(() => import("@/app/routes/app/index"));
const CollectionsPage = lazy(() => import("@/app/routes/app/collections"));
const InventoryPage = lazy(() => import("@/app/routes/app/inventory"));
const BinsPage = lazy(() => import("@/app/routes/app/bins"));
const LibraryPage = lazy(() => import("@/app/routes/app/library"));
const CalibratePage = lazy(() => import("@/app/routes/app/calibrate"));
const SettingsPage = lazy(() => import("@/app/routes/app/settings"));
const AdminPage = lazy(() => import("@/app/routes/app/admin"));
const MonitorSessionsPage = lazy(() => import("@/app/routes/app/monitor-sessions"));
const MonitorPage = lazy(() => import("@/app/routes/app/monitor"));

function PageSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="min-h-screen" />}>{children}</Suspense>;
}

// Fully-local single-user build: no sign-in gate — anyone on the local network
// can open the app.
function AdminGuard() {
  const { isAdmin, isPending } = useRole();
  if (isPending) return null;
  if (!isAdmin) return <Navigate to="/app" replace />;
  return <Outlet />;
}

function DesktopOnlyGuard() {
  const isMobile = useIsMobile();
  if (isMobile) return <Navigate to="/app/monitor" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <PageSuspense>
        <LandingPage />
      </PageSuspense>
    ),
  },
  {
    path: "/build",
    element: (
      <PageSuspense>
        <BuildGuidePage />
      </PageSuspense>
    ),
  },
  {
    element: (
      <PageSuspense>
        <AppLayout />
      </PageSuspense>
    ),
    children: [
      {
        element: <DesktopOnlyGuard />,
        children: [
          {
            path: "/app",
            element: (
              <PageSuspense>
                <ScannerPage />
              </PageSuspense>
            ),
          },
          {
            path: "/app/collections",
            element: (
              <PageSuspense>
                <CollectionsPage />
              </PageSuspense>
            ),
          },
          {
            path: "/app/inventory",
            element: (
              <PageSuspense>
                <InventoryPage />
              </PageSuspense>
            ),
          },
          {
            path: "/app/library",
            element: (
              <PageSuspense>
                <LibraryPage />
              </PageSuspense>
            ),
          },
          {
            path: "/app/collections/:collectionGuid/bins",
            element: (
              <PageSuspense>
                <BinsPage />
              </PageSuspense>
            ),
          },
          {
            path: "/app/calibrate",
            element: (
              <PageSuspense>
                <CalibratePage />
              </PageSuspense>
            ),
          },
          {
            path: "/app/settings",
            element: (
              <PageSuspense>
                <SettingsPage />
              </PageSuspense>
            ),
          },
          {
            element: <AdminGuard />,
            children: [
              {
                path: "/app/admin",
                element: (
                  <PageSuspense>
                    <AdminPage />
                  </PageSuspense>
                ),
              },
            ],
          },
        ],
      },
      {
        path: "/app/monitor",
        element: (
          <PageSuspense>
            <MonitorSessionsPage />
          </PageSuspense>
        ),
      },
      {
        path: "/app/monitor/:collectionGuid",
        element: (
          <PageSuspense>
            <MonitorPage />
          </PageSuspense>
        ),
      },
    ],
  },
]);
