import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface NavbarPortalProps {
  children: React.ReactNode;
}

/**
 * Renders children into the #navbar-actions div in MainLayout's header.
 * Automatically appears/disappears when the page mounts/unmounts.
 */
const NavbarPortal: React.FC<NavbarPortalProps> = ({ children }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById("navbar-actions");
    setContainer(el);
  }, []);

  if (!container) return null;
  return createPortal(children, container);
};

export default NavbarPortal;
