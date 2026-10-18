import { PhoneCall, Truck, MapPin, Home } from "lucide-react";
import type { Incident } from "@/types/incidents";
import { formatDateTime } from "./IncidentBadges";

const STEPS = [
  {
    key: "reported_at",
    label: "Ohlásenie",
    icon: PhoneCall,
    get: (i: Incident) => i.reported_at,
  },
  {
    key: "dispatched_at",
    label: "Výjazd",
    icon: Truck,
    get: (i: Incident) => i.dispatched_at,
  },
  {
    key: "arrived_at",
    label: "Príchod",
    icon: MapPin,
    get: (i: Incident) => i.arrived_at,
  },
  {
    key: "returned_at",
    label: "Návrat",
    icon: Home,
    get: (i: Incident) => i.returned_at,
  },
] as const;

export function IncidentTimeline({ incident }: { incident: Incident }) {
  return (
    <ol className="space-y-0">
      {STEPS.map((step, index) => {
        const value = step.get(incident);
        const done = value !== null;
        const Icon = step.icon;
        const isLast = index === STEPS.length - 1;
        return (
          <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast ? (
              <span
                aria-hidden
                className={`absolute left-[15px] top-8 bottom-0 w-0.5 ${done ? "bg-green-200" : "bg-gray-200"}`}
              />
            ) : null}
            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                done ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-300"
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 pt-1">
              <p className={`text-sm font-semibold ${done ? "text-gray-900" : "text-gray-400"}`}>
                {step.label}
              </p>
              <p className={`text-sm tabular-nums ${done ? "text-gray-600" : "text-gray-400"}`}>
                {done ? formatDateTime(value) : "neupresnené"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
