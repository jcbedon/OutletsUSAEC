import { useAuth } from "@/App";

/**
 * Global CSS reset for the "Astrid Shop" tenant. Replaces the platform
 * wallpaper with a clean solid page background so internal modules can
 * render on a professional, readable surface. The actual hero banner is
 * a separate component (AstridHeroBanner) and only appears on the main
 * dashboards. This component is rendered once at the App root.
 */
const ASTRID_TENANT_MATCH = /astrid/i;

export const BrandBackgroundVideo = () => {
  const { user } = useAuth();
  const tenantName = user?.tenant_name || "";
  const tenantSlug = user?.tenant_slug || "";
  const isAstrid =
    ASTRID_TENANT_MATCH.test(tenantName) || ASTRID_TENANT_MATCH.test(tenantSlug);

  if (!isAstrid) return null;

  return (
    <style data-testid="astrid-brand-style">{`
      /* Clean, professional surface for Astrid Shop users on every page. */
      body { background-color: #F7F8FA !important; }
      .app-bg {
        background-image: none !important;
        background-color: #F7F8FA !important;
      }
      .app-bg::before { display: none !important; }
      /* Reserve space for the persistent left sidebar on desktop and the
         compact top bar on mobile — only on admin routes where the sidebar
         actually mounts (body carries .astrid-admin-shell then). */
      body.astrid-admin-shell .app-bg { padding-left: 240px; }
      @media (max-width: 1023px) {
        body.astrid-admin-shell .app-bg { padding-left: 0; padding-top: 56px; }
      }
      /* Hide the legacy in-page sticky top header on admin routes for Astrid
         so the sidebar is the single source of navigation. */
      body.astrid-admin-shell .app-bg > .bg-white.sticky { display: none !important; }

      /* Mobile-cards helper: on <768px, force wide row layouts inside admin
         pages to wrap so content never overflows horizontally. Non-destructive
         — desktop layout is untouched. */
      @media (max-width: 767px) {
        body.astrid-admin-shell .app-bg { overflow-x: hidden; }
        body.astrid-admin-shell .app-bg [class*="flex items-center justify-between"] {
          flex-wrap: wrap;
          row-gap: 8px;
        }
        body.astrid-admin-shell .app-bg table {
          display: block;
          overflow-x: auto;
          white-space: nowrap;
        }
      }
    `}</style>
  );
};

export default BrandBackgroundVideo;
