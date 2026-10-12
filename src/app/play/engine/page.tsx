import { notFound } from "next/navigation";
import EngineMatch from "@/components/engine-mode/EngineMatch";
import { FEATURE_ENGINE_MODE } from "@/lib/config/features";

export default function EnginePage() {
  if (!FEATURE_ENGINE_MODE) notFound();
  return <EngineMatch />;
}
