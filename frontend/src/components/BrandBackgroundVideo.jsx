import { useState } from "react";
import { useAuth } from "@/App";

/**
 * Fixed-position background video, only visible for the "Astrid Shop" tenant
 * and only for `client` or `employee` roles. Uses a solid gradient fallback
 * while the video buffers so the screen is never white during load.
 *
 * The video is muted + autoplay + loop and sits at z-index:-10, so it never
 * blocks pointer events on any UI on top of it.
 */
const ASTRID_VIDEO_URL =
  "https://customer-assets-wrfwihn1.emergentagent.net/job_eee13a51-72d6-415d-84fa-eb1814606fb6/artifacts/mor2u6cb_astrid-shop-hero-loop.mp4";

const ASTRID_TENANT_MATCH = /astrid/i;

export const BrandBackgroundVideo = () => {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);

  const tenantName = user?.tenant_name || "";
  const tenantSlug = user?.tenant_slug || "";
  const isAstrid =
    ASTRID_TENANT_MATCH.test(tenantName) || ASTRID_TENANT_MATCH.test(tenantSlug);

  // Always log so users can diagnose visibility issues on production.
  // eslint-disable-next-line no-console
  console.log("[BrandBackgroundVideo]", { tenantName, tenantSlug, role: user?.role, isAstrid });

  if (!isAstrid) return null;

  return (
    <>
      {/* Force-hide the .app-bg::before white overlay for Astrid users so the
          video isn't washed out by the platform wallpaper layer. */}
      <style>{`.app-bg::before { display: none !important; }`}</style>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{ zIndex: 0 }}
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
        preload="metadata"
        onCanPlay={() => setReady(true)}
        onError={(e) => {
          // eslint-disable-next-line no-console
          console.error("[BrandBackgroundVideo] video failed to load", e?.target?.error);
        }}
        onLoadedData={() => {
          // eslint-disable-next-line no-console
          console.log("[BrandBackgroundVideo] video loaded, playing");
        }}
        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
        style={{ opacity: ready ? 1 : 0 }}
      >
        <source src={ASTRID_VIDEO_URL} type="video/mp4" />
      </video>
      {/* Subtle overlay to keep foreground text readable on any frame */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(255, 255, 255, 0.35)" }}
      />
      </div>
    </>
  );
};

export default BrandBackgroundVideo;
