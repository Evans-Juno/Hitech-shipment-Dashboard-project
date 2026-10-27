import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Dashboard } from "@/components/dashboard";
import { setLiveData, type Shipment } from "@/data/shipments";

declare global {
  interface Window {
    DATA_URL?: string;
  }
}

type Feed = { project?: string; updated?: string; shipments: Shipment[] };

async function load(): Promise<{ ok: boolean; msg?: string }> {
  const url = (window.DATA_URL || "").trim();
  if (!url || url.startsWith("PASTE")) {
    return { ok: false, msg: "Not connected to the live Google Sheet yet - showing the saved snapshot." };
  }
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const feed = (await res.json()) as Feed;
    if (!feed || !Array.isArray(feed.shipments)) throw new Error("bad feed");
    setLiveData(feed);
    return { ok: true };
  } catch {
    return { ok: false, msg: "Live data could not be loaded - showing the last saved snapshot, which may be out of date." };
  }
}

function App() {
  const [state, setState] = useState<{ ok: boolean; msg?: string } | null>(null);
  useEffect(() => {
    load().then(setState);
  }, []);
  if (!state) {
    return <div className="p-8 text-sm text-muted">Loading shipments…</div>;
  }
  return (
    <>
      {!state.ok && (
        <div className="bg-pending-bg px-4 py-2 text-center text-sm text-pending">{state.msg}</div>
      )}
      <Dashboard />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
