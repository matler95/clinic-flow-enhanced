import { ShieldAlert } from "lucide-react";

export function PocBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-center text-xs font-medium text-warning-foreground">
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      Tryb POC: nie wysyłaj plików z danymi pacjentów.
    </div>
  );
}
