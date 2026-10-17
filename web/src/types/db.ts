export type VehicleStatus = "disponible" | "loue" | "maintenance" | "hors_service";
export type BookingStatus = "pending" | "confirmed" | "active" | "completed" | "cancelled";
export type InvoiceStatus = "brouillon" | "emise" | "payee" | "en_retard" | "annulee";
export type PaymentMethod = "especes" | "carte" | "virement" | "cheque";
export type MaintenanceType = "preventive" | "corrective" | "controle_technique";
export type InspectionType = "depart" | "retour";

export type Agency = {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
};

export type Category = { id: string; name: string; daily_rate: number };

export type Vehicle = {
  id: string;
  agency_id: string;
  category_id: string | null;
  plate: string;
  brand: string;
  model: string;
  year: number | null;
  mileage_km: number;
  status: VehicleStatus;
};

export type Customer = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  license_no: string | null;
};

export type Booking = {
  id: string;
  vehicle_id: string;
  customer_id: string;
  agency_id: string;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  daily_rate: number;
  total_amount: number;
  notes: string | null;
};

export type Member = {
  id: string;
  full_name: string | null;
  role: string;
  agency_id: string | null;
};
