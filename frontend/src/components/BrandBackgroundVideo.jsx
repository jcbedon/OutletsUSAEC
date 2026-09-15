import { useAuth } from "@/App";

/**
 * Fixed-position background video for the "Astrid Shop" tenant. Sits at
 * z-index:-1 behind the main page content and never blocks interaction.
 * The video loads eagerly, autoplays muted+looped, and is visible from
 * mount so there's no fade-in gap. A warm gradient fallback stays painted
 * beneath it so the screen never flashes white during buffering.
 */
const ASTRID_VIDEO_URL =
  "https://customer-assets-wrfwihn1.emergentagent.net/job_eee13a51-72d6-415d-84fa-eb1814606fb6/artifacts/mor2u6cb_astrid-shop-hero-loop.mp4";

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
          video isn't washed out by the platform wallpaper layer. */}
      <style>{`.app-bg::before { display: none !important; }`}</style>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{ zIndex: -1 }}
        data-testid="astrid-brand-video-bg"
      >
        {/* Solid gradient fallback — always painted, keeps screen from ever going white */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #f5efe6 0%, #eadcc5 45%, #d8bfa1 100%)",
          }}
        />
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={ASTRID_VIDEO_URL} type="video/mp4" />
        </video>
      </div>
    </>
  );
};

export default BrandBackgroundVideo;
