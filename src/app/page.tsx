import PlayGame from "@/components/play/PlayGame";
import { curatedBrief } from "@/lib/play/cases";
export const dynamic = "force-dynamic";
export default function Page() {
  return <PlayGame initialCase={curatedBrief(0, "practice")} mode="practice" />;
}
