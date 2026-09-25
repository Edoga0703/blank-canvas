import * as React from "react";

/** true quando o app está rodando instalado como PWA (standalone) */
export function useStandalone() {
  const [standalone, setStandalone] = React.useState(false);

  React.useEffect(() => {
    const check = () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    setStandalone(check());
    const mql = window.matchMedia("(display-mode: standalone)");
    const onChange = () => setStandalone(check());
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return standalone;
}
