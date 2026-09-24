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
    `}</style>
  );
};

export default BrandBackgroundVideo;
