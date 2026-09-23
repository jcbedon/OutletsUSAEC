import { useAuth } from "@/App";

/**
 * Fixed-position brand background for the "Astrid Shop" tenant only (both
 * employees and clients). Renders a landscape image on desktop and a portrait
 * image on mobile via CSS media query, at 75% opacity behind the app content.
 * A warm gradient fallback stays painted beneath so the screen never flashes
 * white during image loading.
 */
const ASTRID_BG_DESKTOP =
  "https://customer-assets-wrfwihn1.emergentagent.net/job_eee13a51-72d6-415d-84fa-eb1814606fb6/artifacts/xtg58yhw_unnamed_-_Copy.jpg_2K_20260923182716.webp";
const ASTRID_BG_MOBILE =
  "https://customer-assets-wrfwihn1.emergentagent.net/job_eee13a51-72d6-415d-84fa-eb1814606fb6/artifacts/kcnov497_unnamed_-_Copy.jpg_2K_20260923182821.webp";

const ASTRID_TENANT_MATCH = /astrid/i;

export const BrandBackgroundVideo = () => {
  const { user } = useAuth();

  const tenantName = user?.tenant_name || "";
  const tenantSlug = user?.tenant_slug || "";
  const isAstrid =
    ASTRID_TENANT_MATCH.test(tenantName) || ASTRID_TENANT_MATCH.test(tenantSlug);

  if (!isAstrid) return null;

  return (
    <>
      {/* Force-hide the .app-bg::before white overlay for Astrid users so the
          image isn't washed out by the platform wallpaper layer. */}
      <style>{`
        .app-bg::before { display: none !important; }
        .astrid-brand-bg-desktop { display: block; }
        .astrid-brand-bg-mobile { display: none; }
        @media (max-width: 767px) {
          .astrid-brand-bg-desktop { display: none; }
          .astrid-brand-bg-mobile { display: block; }
        }
      `}</style>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{ zIndex: -1 }}
        data-testid="astrid-brand-bg"
      >
        {/* Solid gradient fallback — always painted, keeps screen from ever going white */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #f5efe6 0%, #eadcc5 45%, #d8bfa1 100%)",
          }}
        />
        <img
          src={ASTRID_BG_DESKTOP}
          alt=""
          loading="eager"
          decoding="async"
          className="astrid-brand-bg-desktop absolute inset-0 h-full w-full object-cover"
          style={{ opacity: 0.75 }}
        />
        <img
          src={ASTRID_BG_MOBILE}
          alt=""
          loading="eager"
          decoding="async"
          className="astrid-brand-bg-mobile absolute inset-0 h-full w-full object-cover"
          style={{ opacity: 0.75 }}
        />
      </div>
    </>
  );
};

export default BrandBackgroundVideo;
