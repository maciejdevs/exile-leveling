import { atom, useAtom } from "jotai";
import { atomFamily } from "jotai-family";
import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";

const scrollOffsetState = atomFamily((_param: string) => atom(0));

export function withScrollRestoration<P extends {}>(
  Component: React.ComponentType<P>,
): React.ComponentType<P> {
  function ComponentWithScrollPosition(props: P) {
    const location = useLocation();
    const [scrollOffset, setScrollOffset] = useAtom(
      scrollOffsetState(location.pathname),
    );

    useEffect(() => {
      const viewport = document.getElementById("app-scroll");
      if (!viewport) return;
      viewport.scrollTo(0, scrollOffset);

      function handleScroll() {
        setScrollOffset(viewport!.scrollTop);
      }

      viewport.addEventListener("scroll", handleScroll);

      return () => {
        viewport.removeEventListener("scroll", handleScroll);
      };
    }, []);

    useEffect(() => {
      if (location.hash) {
        const element = document.getElementById(location.hash.replace("#", ""));
        if (element) element.scrollIntoView({ behavior: "auto" });
      }
    }, [location]);

    return <Component {...props} />;
  }

  return ComponentWithScrollPosition;
}
