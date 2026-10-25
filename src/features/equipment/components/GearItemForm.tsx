import { Button } from "@/components/ui/Button";
import type {
  EquipmentCategory,
  EquipmentItem,
  VehicleDetails,
} from "@/lib/equipment/equipment.service";

const STATUS_OPTIONS: { value: EquipmentItem["status"]; label: string }[] = [
  { value: "AVAILABLE", label: "Dostupné" },
  { value: "IN_SERVICE", label: "V službe" },
  { value: "RESERVED", label: "Rezervované" },
  { value: "DAMAGED", label: "Poškodené" },
  { value: "DISPOSED", label: "Vyradené" },
];

const CONDITION_OPTIONS: { value: EquipmentItem["condition"]; label: string }[] = [
  { value: "NEW", label: "Nové" },
  { value: "GOOD", label: "Dobré" },
  { value: "FAIR", label: "Použité" },
  { value: "POOR", label: "Opotrebované" },
  { value: "UNSERVICEABLE", label: "Neschopné služby" },
];

const FUEL_OPTIONS = [
  { value: "DIESEL", label: "Diesel" },
  { value: "PETROL", label: "Benzín" },
  { value: "ELECTRIC", label: "Elektrina" },
];

const inputCls =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] bg-white";

/**
 * Zdieľaný formulár pre vytvorenie aj úpravu položky inventára.
 * Server komponent – akcia je odovzdaná z parent stránky.
 */
export function GearItemForm({
  categories,
  item,
  vehicle,
  action,
  submitLabel,
}: {
  categories: EquipmentCategory[];
  item?: EquipmentItem;
  vehicle?: VehicleDetails | null;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  return (
    <form
      action={action}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6"
    >
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-1">Základné údaje</h2>
        <p className="text-sm text-gray-500">Povinné sú len kategória a názov.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="category_id" className="block text-sm font-medium text-gray-700 mb-1">
            Kategória *
          </label>
          <select
            id="category_id"
            name="category_id"
            required
            defaultValue={item?.category_id ?? ""}
            className={inputCls}
          >
            <option value="" disabled>Vyberte kategóriu</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Názov *
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={item?.name ?? ""}
            className={inputCls}
            placeholder="Napr. Prilba CAS 30"
          />
        </div>
        <div>
          <label htmlFor="inventory_number" className="block text-sm font-medium text-gray-700 mb-1">
            Inventárne číslo
          </label>
          <input
            id="inventory_number"
            name="inventory_number"
            defaultValue={item?.inventory_number ?? ""}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="serial_number" className="block text-sm font-medium text-gray-700 mb-1">
            Sériové číslo
          </label>
          <input
            id="serial_number"
            name="serial_number"
            defaultValue={item?.serial_number ?? ""}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
            Stav
          </label>
          <select
            id="status"
            name="status"
            defaultValue={item?.status ?? "AVAILABLE"}
            className={inputCls}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="condition" className="block text-sm font-medium text-gray-700 mb-1">
            Opotrebenie
          </label>
          <select
            id="condition"
            name="condition"
            defaultValue={item?.condition ?? "GOOD"}
            className={inputCls}
          >
            {CONDITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
            Umiestnenie
          </label>
          <input
            id="location"
            name="location"
            defaultValue={item?.location ?? ""}
            className={inputCls}
            placeholder="Napr. Zbrojňa A"
          />
        </div>
        <div>
          <label htmlFor="next_inspection_date" className="block text-sm font-medium text-gray-700 mb-1">
            Ďalšia kontrola
          </label>
          <input
            id="next_inspection_date"
            name="next_inspection_date"
            type="date"
            defaultValue={item?.next_inspection_date ?? ""}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="purchase_date" className="block text-sm font-medium text-gray-700 mb-1">
            Dátum nákupu
          </label>
          <input
            id="purchase_date"
            name="purchase_date"
            type="date"
            defaultValue={item?.purchase_date ?? ""}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="purchase_price" className="block text-sm font-medium text-gray-700 mb-1">
            Cena nákupu (€)
          </label>
          <input
            id="purchase_price"
            name="purchase_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={item?.purchase_price ?? ""}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-1">
            Počet kusov
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="0"
            step="1"
            defaultValue={item?.quantity ?? 1}
            className={inputCls}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          name="is_opp"
          defaultChecked={item?.is_opp ?? false}
          className="h-5 w-5 rounded border-gray-300 text-[#C62828] focus:ring-[#C62828]"
        />
        Osobné ochranné pracovné prostriedky (OOPP) – vedie zoznam pridelených členov
      </label>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Poznámky
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={item?.notes ?? ""}
          className={inputCls}
          placeholder="Voliteľné poznámky…"
        />
      </div>

      <div className="border-t border-gray-100 pt-5">
        <h2 className="text-base font-bold text-gray-900 mb-1">Údaje vozidla</h2>
        <p className="text-sm text-gray-500 mb-4">
          Vypĺňajte len pri položkách, ktoré sú vozidlom (CAS, PA, príves…).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="license_plate" className="block text-sm font-medium text-gray-700 mb-1">
              SPZ / EČV
            </label>
            <input
              id="license_plate"
              name="license_plate"
              defaultValue={vehicle?.license_plate ?? ""}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="vin" className="block text-sm font-medium text-gray-700 mb-1">
              VIN
            </label>
            <input id="vin" name="vin" defaultValue={vehicle?.vin ?? ""} className={inputCls} />
          </div>
          <div>
            <label htmlFor="fuel_type" className="block text-sm font-medium text-gray-700 mb-1">
              Palivo
            </label>
            <select
              id="fuel_type"
              name="fuel_type"
              defaultValue={vehicle?.fuel_type ?? ""}
              className={inputCls}
            >
              <option value="">—</option>
              {FUEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="mileage_km" className="block text-sm font-medium text-gray-700 mb-1">
                Km
              </label>
              <input
                id="mileage_km"
                name="mileage_km"
                type="number"
                min="0"
                defaultValue={vehicle?.mileage_km ?? ""}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="engine_hours" className="block text-sm font-medium text-gray-700 mb-1">
                Motohodiny
              </label>
              <input
                id="engine_hours"
                name="engine_hours"
                type="number"
                min="0"
                defaultValue={vehicle?.engine_hours ?? ""}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label htmlFor="stk_valid_until" className="block text-sm font-medium text-gray-700 mb-1">
              STK platná do
            </label>
            <input
              id="stk_valid_until"
              name="stk_valid_until"
              type="date"
              defaultValue={vehicle?.stk_valid_until ?? ""}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="ek_valid_until" className="block text-sm font-medium text-gray-700 mb-1">
              EK platná do
            </label>
            <input
              id="ek_valid_until"
              name="ek_valid_until"
              type="date"
              defaultValue={vehicle?.ek_valid_until ?? ""}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary">{submitLabel}</Button>
      </div>
    </form>
  );
}
