// Single source of truth for what each clinic role sees and can do in the UI.
// Database RLS enforces the same rules; this file only shapes the interface.
export type Role = "admin" | "doctor" | "staff";

export const roleLabel: Record<string, string> = { admin: "Administrator", doctor: "Lekarz", staff: "Recepcja" };

export const roleTagline: Record<string, string> = {
  admin: "Zarządzasz gabinetem: zespołem, linkami i wglądem w historię.",
  doctor: "Odbierasz pliki dla siebie i rozdajesz swoje linki do wysyłania.",
  staff: "Obsługujesz wspólną skrzynkę gabinetu i przekazujesz pliki dalej.",
};

export type Capability = { label: string; allowed: boolean };

export function capabilities(role: string): Capability[] {
  const a = role === "admin", d = role === "doctor", s = role === "staff";
  return [
    { label: "Odbieranie plików wysłanych do mnie", allowed: a || d },
    { label: "Wspólna skrzynka gabinetu", allowed: a || s },
    { label: "Przypisywanie plików ze skrzynki lekarzom", allowed: a || s },
    { label: "Przekazywanie swoich plików koledze (np. zastępstwo)", allowed: a || d },
    { label: "Tworzenie własnych linków do wysyłania", allowed: a || d },
    { label: "Linki do skrzynki gabinetu", allowed: a },
    { label: "Wysyłanie plików do skrzynki gabinetu", allowed: true },
    { label: "Usuwanie plików ze skrzynki gabinetu", allowed: a },
    { label: "Zapraszanie osób, zmiana ról i odbieranie dostępu", allowed: a },
    { label: "Historia działań (audyt)", allowed: a },
  ];
}

export const can = {
  ownLinks: (r: string) => r === "admin" || r === "doctor",
  clinicLinks: (r: string) => r === "admin",
  clinicInbox: (r: string) => r === "admin" || r === "staff",
  personalInbox: (r: string) => r === "admin" || r === "doctor",
  manageTeam: (r: string) => r === "admin",
  audit: (r: string) => r === "admin",
  deleteClinicFiles: (r: string) => r === "admin",
};
