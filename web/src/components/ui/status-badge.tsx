import { Badge } from "@/components/ui/badge";
import { BOOKING_STATUS, INVOICE_STATUS, VEHICLE_STATUS } from "@/lib/format";
import type { BookingStatus, InvoiceStatus, VehicleStatus } from "@/types/db";

export const VehicleBadge = ({ status }: { status: VehicleStatus }) => (
  <Badge tone={VEHICLE_STATUS[status].tone}>{VEHICLE_STATUS[status].label}</Badge>
);
export const BookingBadge = ({ status }: { status: BookingStatus }) => (
  <Badge tone={BOOKING_STATUS[status].tone}>{BOOKING_STATUS[status].label}</Badge>
);
export const InvoiceBadge = ({ status }: { status: InvoiceStatus }) => (
  <Badge tone={INVOICE_STATUS[status].tone}>{INVOICE_STATUS[status].label}</Badge>
);
