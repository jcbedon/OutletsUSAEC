import { useAuth } from "@/App";

/**
 * Inline top hero banner used on the main dashboards for every tenant that
 * has uploaded a dashboard banner (managed from the superadmin panel).
 * Renders in-flow (not fixed). Uses the SAME image on desktop and mobile —
 * `object-fit: cover` keeps the composition centered on any aspect ratio.
 * If the tenant has no banner configured, nothing renders.
 */
export const AstridHeroBanner = () => {
  const { user } = useAuth();
  const bannerPath = user?.tenant_banner;

  if (!bannerPath) return null;

  // Backend returns a path like "/api/uploads/..."; prepend REACT_APP_BACKEND_URL
  // for absolute-URL rendering that works from any origin.
  const bannerUrl = bannerPath.startsWith("http")
    ? bannerPath
    : `${process.env.REACT_APP_BACKEND_URL}${bannerPath}`;

  return (
    <>
      <style>{`
        .tenant-hero {
          width: 100%;
          overflow: hidden;
          background: linear-gradient(135deg, #f5efe6 0%, #eadcc5 45%, #d8bfa1 100%);
        }
        .tenant-hero-img {
          width: 100%;
          display: block;
          object-fit: cover;
          object-position: center;
          height: 300px;
        }
        @media (min-width: 1440px) { .tenant-hero-img { height: 340px; } }
        @media (max-width: 767px)  { .tenant-hero-img { height: 200px; } }
      `}</style>
      <div className="tenant-hero" data-testid="tenant-hero-banner" aria-hidden="true">
        <img
          className="tenant-hero-img"
          src={bannerUrl}
          alt=""
          loading="eager"
          decoding="async"
        />
      </div>
    </>
  );
};

export default AstridHeroBanner;
