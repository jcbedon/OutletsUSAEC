import { useAuth } from "@/App";

/**
 * Global visual reset applied to every authenticated tenant. Replaces the
 * legacy platform wallpaper with a clean solid page background so internal
 * modules render on a professional, readable surface. Also reserves layout
 * space for the persistent sidebar (desktop) / top bar (mobile) when the
 * admin shell is mounted, and hides the legacy in-page sticky header so the
 * sidebar becomes the single source of navigation.
 * The actual hero banner is a separate component (AstridHeroBanner) and only
 * appears on the main dashboards for tenants that uploaded one.
 */
export const BrandBackgroundVideo = () => {
  const { user } = useAuth();

  // Only apply once the user is authenticated. Public routes (login/register)
  // keep the existing look.
  if (!user) return null;

  return (
    <style data-testid="tenant-brand-style">{`
      /* Clean, professional surface for every authenticated tenant. */
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
      /* Hide the legacy in-page sticky top header on admin routes so the
         sidebar is the single source of navigation. */
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
