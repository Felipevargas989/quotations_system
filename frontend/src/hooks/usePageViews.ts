import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { trackPageView } from "../lib/analytics.ts";

export function usePageViews() {
  const location = useLocation();

  useEffect(() => {
    // Track page view with both path and title
    trackPageView(location.pathname);

    // Additional event tracking for more detailed analytics
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", "page_view", {
        page_title: document.title,
        page_path: location.pathname,
        page_location: window.location.href,
      });
    }
  }, [location]);
}
