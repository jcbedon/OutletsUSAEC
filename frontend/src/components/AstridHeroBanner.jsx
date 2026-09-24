import { useAuth } from "@/App";

/**
 * Inline top hero banner for the "Astrid Shop" tenant only.
 * Renders as a normal-flow block (NOT fixed) at the top of the main
 * dashboards. Uses the desktop image on ≥768px screens and the mobile
 * portrait on <768px. Kept purely visual — no cards or content overlays.
 */
const ASTRID_HERO_DESKTOP =
  "https://customer-assets-wrfwihn1.emergentagent.net/job_eee13a51-72d6-415d-84fa-eb1814606fb6/artifacts/v5kg33qp_ChatGPT%20Image%20Sep%2023%2C%202026%2C%2007_03_07%20PM.webp";
const ASTRID_HERO_MOBILE =
  "https://customer-assets-wrfwihn1.emergentagent.net/job_eee13a51-72d6-415d-84fa-eb1814606fb6/artifacts/kcnov497_unnamed_-_Copy.jpg_2K_20260923182821.webp";

const ASTRID_TENANT_MATCH = /astrid/i;

export const AstridHeroBanner = () => {
  const { user } = useAuth();
  const tenantName = user?.tenant_name || "";
  const tenantSlug = user?.tenant_slug || "";
  const isAstrid =
    ASTRID_TENANT_MATCH.test(tenantName) || ASTRID_TENANT_MATCH.test(tenantSlug);

  if (!isAstrid) return null;

  return (
    <>
      <style>{`
        .astrid-hero {
          width: 100%;
          overflow: hidden;
          background: linear-gradient(135deg, #f5efe6 0%, #eadcc5 45%, #d8bfa1 100%);
        }
        .astrid-hero-img { width: 100%; display: block; object-fit: cover; object-position: center; }
        .astrid-hero-desktop { height: 300px; }
        .astrid-hero-mobile { display: none; }
        @media (max-width: 767px) {
          .astrid-hero-desktop { display: none; }
          .astrid-hero-mobile { display: block; height: 200px; }
        }
        @media (min-width: 1440px) { .astrid-hero-desktop { height: 340px; } }
      `}</style>
      <div className="astrid-hero" data-testid="astrid-hero-banner" aria-hidden="true">
        <img
          className="astrid-hero-img astrid-hero-desktop"
          src={ASTRID_HERO_DESKTOP}
          alt=""
          loading="eager"
          decoding="async"
        />
        <img
          className="astrid-hero-img astrid-hero-mobile"
          src={ASTRID_HERO_MOBILE}
          alt=""
          loading="eager"
          decoding="async"
        />
      </div>
    </>
  );
};

export default AstridHeroBanner;
