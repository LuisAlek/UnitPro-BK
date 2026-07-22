export interface ProcessedReservation {
  confirmationCode: string;
  guest: string;
  platform: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  pricePerNight: number;
  total: number;
  cleaningFee: number;
  guestInsurance: number;
  resortFee: number;
  hostFee: number;
  comisionStripe: number;
  incomeTax: number;
  totalPayout: number;
  netIncome: number;
  propertyId: string;
  month: string;
  monthYear: string;
  isDuplicate: boolean;
}

export interface PropertyGroup {
  propertyId: string;
  reservations: ProcessedReservation[];
  totals: {
    totalReservations: number;
    totalNights: number;
    totalRevenue: number;
    totalPayout: number;
    totalNetIncome: number;
  };
}

export interface ProcessReservationsResult {
  success: boolean;
  properties: Record<string, PropertyGroup>;
  summary: {
    totalReservations: number;
    totalPayout: number;
    totalNetIncome: number;
    duplicatesFound: number;
    month: string;
  };
}
