import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

// Placeholder – v ďalšom kroku nahradiť databázovými dátami.
const DEMO_EVENTS = [
  { date: "10.10.2026", time: "18:00", title: "Tréning – dospelí" },
  { date: "12.10.2026", time: "09:00", title: "Brigáda – hasičská zbrojnica" },
  { date: "18.10.2026", time: "14:00", title: "Súťaž – okresné kolo" },
];

export function UpcomingEvents() {
  return (
    <Card title="Najbližšie udalosti" subtitle="DEMO dáta – neskôr z databázy">
      <ul className="divide-y divide-gray-100">
        {DEMO_EVENTS.map((e) => (
          <li key={e.title} className="py-3 flex items-center gap-4 first:pt-0 last:pb-0">
            <div className="shrink-0 w-20 text-center rounded-lg bg-gray-50 border border-gray-100 py-1.5">
              <p className="text-xs font-bold text-gray-900">{e.date}</p>
              <p className="text-xs text-gray-500">{e.time}</p>
            </div>
            <p className="text-sm font-medium text-gray-800">{e.title}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const DEMO_ALERTS = [
  { level: "yellow" as const, text: "3 revízie sa blížia k termínu" },
  { level: "red" as const, text: "1 otvorená porucha" },
  { level: "yellow" as const, text: "2 školenia expirujú do 30 dní" },
];

export function AlertsCard() {
  return (
    <Card title="Aktuálne upozornenia" subtitle="DEMO dáta – neskôr z databázy">
      <ul className="space-y-2.5">
        {DEMO_ALERTS.map((a) => (
          <li
            key={a.text}
            className="flex items-center gap-3 text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${a.level === "red" ? "bg-[#C62828]" : "bg-[#F9A825]"}`}
              aria-hidden="true"
            />
            {a.text}
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <Badge tone="gray">Demo</Badge>
      </div>
    </Card>
  );
}
