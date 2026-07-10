import { useState } from "react";
import { clearStoredToken, getStoredToken } from "./api";
import { TokenGate } from "./pages/TokenGate";
import { Today } from "./pages/Today";

export default function App() {
  const [hasToken, setHasToken] = useState(() => getStoredToken() !== null);

  if (!hasToken) {
    return <TokenGate onSaved={() => setHasToken(true)} />;
  }

  return (
    <Today
      onAuthError={() => {
        clearStoredToken();
        setHasToken(false);
      }}
    />
  );
}
