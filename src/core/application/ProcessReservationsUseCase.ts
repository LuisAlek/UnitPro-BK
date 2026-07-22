import { Equivalence } from "../domain/entities/Equivalence";
import { ProcessedReservation, PropertyGroup, ProcessReservationsResult } from "../domain/entities/ProcessedReservation";
import { IEquivalenceRepository } from "../domain/ports/IEquivalenceRepository";
import { IReservationRepository } from "../domain/ports/IReservationRepository";

interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

interface ColumnIndices {
  fecha: number;
  tipo: number;
  confirmationCode: number;
  fechaReservacion: number;
  fechaInicio: number;
  noches: number;
  huesped: number;
  anuncio: number;
  totalPagado: number;
  tarifaServicio: number;
  tarifaLimpieza: number;
  tarifaGestion: number;
  tarifaComunidad: number;
  ingresosBrutos: number;
  impuestosAirbnb: number;
}

interface SplitParams {
  confirmationCode: string;
  guest: string;
  propertyId: string;
  checkInDate: Date;
  checkOutDate: Date;
  nights: number;
  total: number;
  hostFee: number;
  incomeTax: number;
  cleaningFee: number;
  resortFee: number;
  isDuplicate: boolean;
}

const PROPERTY_FEES: Record<string, { cleaningFee: number; resortFee: number }> = {
  "Emilia 401": { cleaningFee: 125, resortFee: 0 },
  "Emilia 301": { cleaningFee: 125, resortFee: 0 },
  "Emilia 502": { cleaningFee: 90, resortFee: 0 },
  "Icon 4506": { cleaningFee: 125, resortFee: 0 },
  "Hyde 1905": { cleaningFee: 160, resortFee: 0 },
  "Club 2120": { cleaningFee: 99, resortFee: 52 },
};

const GUEST_INSURANCE = 30;

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export class ProcessReservationsUseCase {
  constructor(
    private equivalenceRepo: IEquivalenceRepository,
    private reservationRepo: IReservationRepository
  ) {}

  async execute(fileContents: string[], userId: string): Promise<ProcessReservationsResult> {
    if (fileContents.length === 0) {
      throw new Error("No files provided");
    }

    const equivalences = await this.equivalenceRepo.findAll();
    const equivalenceMap = this.buildEquivalenceMap(equivalences);

    const existingKeys = await this.reservationRepo.findExistingByUser(userId);
    const existingSet = new Set(existingKeys);

    const allReservations: ProcessedReservation[] = [];
    const allNewRecords: Array<{
      userId: string;
      confirmationCode: string;
      propertyId: string;
      guest: string;
      checkIn: string;
      total: number;
      month: string;
      monthYear: string;
    }> = [];
    let duplicatesFound = 0;

    for (const fileContent of fileContents) {
      const parsed = this.parseCSV(fileContent);
      if (parsed.headers.length === 0) continue;

      const col = this.findColumnIndices(parsed.headers);

      for (const row of parsed.rows) {
        if (row.length <= Math.max(col.anuncio, col.noches, col.totalPagado)) continue;

        const anuncio = (row[col.anuncio] || "").trim();
        const propertyId = equivalenceMap.get(anuncio);
        if (!propertyId) continue;

        const confirmationCode = (row[col.confirmationCode] || "").trim();
        if (!confirmationCode) continue;

        const checkInRaw = (row[col.fechaInicio] || "").trim();
        const checkInDate = this.parseDate(checkInRaw);
        if (!checkInDate || isNaN(checkInDate.getTime())) continue;

        const nights = parseInt((row[col.noches] || "0").trim(), 10);
        if (nights <= 0) continue;

        const totalStr = (row[col.totalPagado] || "0").replace(",", ".").replace(/[^0-9.\-]/g, "");
        const total = parseFloat(totalStr);
        if (isNaN(total) || total <= 0) continue;

        const guest = (row[col.huesped] || "").trim();
        const hostFeeStr = (row[col.tarifaServicio] || "0").replace(",", ".").replace(/[^0-9.\-]/g, "");
        const hostFee = parseFloat(hostFeeStr) || 0;
        const incomeTaxStr = (row[col.impuestosAirbnb] || "0").replace(",", ".").replace(/[^0-9.\-]/g, "");
        const incomeTax = parseFloat(incomeTaxStr) || 0;

        const fees = PROPERTY_FEES[propertyId] || { cleaningFee: 0, resortFee: 0 };

        const checkOutDate = new Date(checkInDate);
        checkOutDate.setDate(checkOutDate.getDate() + nights);

        const key = confirmationCode + "_" + this.formatMonthYear(checkInDate);
        const isDuplicate = existingSet.has(key);
        if (isDuplicate) duplicatesFound++;

        const processed = this.applyMonthCutoff({
          confirmationCode,
          guest,
          propertyId,
          checkInDate,
          checkOutDate,
          nights,
          total,
          hostFee,
          incomeTax,
          cleaningFee: fees.cleaningFee,
          resortFee: fees.resortFee,
          isDuplicate,
        });

        for (const p of processed) {
          allReservations.push(p);
          if (!isDuplicate) {
            allNewRecords.push({
              userId,
              confirmationCode,
              propertyId,
              guest,
              checkIn: checkInRaw,
              total,
              month: p.month,
              monthYear: p.monthYear,
            });
          }
        }
      }
    }

    if (allNewRecords.length > 0) {
      try {
        await this.reservationRepo.createMany(allNewRecords);
      } catch {
        // Ignore duplicate key errors
      }
    }

    const properties = this.groupByProperty(allReservations);
    const summary = this.calculateSummary(allReservations, properties);

    return {
      success: true,
      properties,
      summary,
    };
  }

  private applyMonthCutoff(params: SplitParams): ProcessedReservation[] {
    const { confirmationCode, guest, propertyId, checkInDate, checkOutDate, nights, total, hostFee, incomeTax, cleaningFee, resortFee, isDuplicate } = params;

    const checkInMonth = checkInDate.getMonth();
    const checkOutMonth = checkOutDate.getMonth();
    const checkInYear = checkInDate.getFullYear();

    if (checkInMonth === checkOutMonth) {
      const monthYear = this.formatMonthYear(checkInDate);
      const month = this.formatMonth(checkInDate);
      const pricePerNight = this.round2(total / nights);

      const totalPayout = total + cleaningFee + GUEST_INSURANCE + resortFee - hostFee - 0 + incomeTax;
      const netIncome = totalPayout - cleaningFee - GUEST_INSURANCE - resortFee;

      return [{
        confirmationCode,
        guest,
        platform: "Airbnb",
        checkIn: this.formatDate(checkInDate),
        checkOut: this.formatDate(checkOutDate),
        nights,
        pricePerNight,
        total,
        cleaningFee,
        guestInsurance: GUEST_INSURANCE,
        resortFee,
        hostFee,
        comisionStripe: 0,
        incomeTax,
        totalPayout: this.round2(totalPayout),
        netIncome: this.round2(netIncome),
        propertyId,
        month,
        monthYear,
        isDuplicate,
      }];
    }

    // End-of-month split
    const lastDayOfMonth = new Date(checkInYear, checkInMonth + 1, 0);
    const nightsThisMonth = Math.min(nights, Math.floor((lastDayOfMonth.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const nightsNextMonth = nights - nightsThisMonth;

    const pricePerNight = this.round2(total / nights);
    const totalThisMonth = this.round2(pricePerNight * nightsThisMonth);
    const totalNextMonth = this.round2(total - totalThisMonth);

    const hostFeeThisMonth = this.round2(hostFee * (nightsThisMonth / nights));
    const hostFeeNextMonth = this.round2(hostFee - hostFeeThisMonth);
    const taxThisMonth = this.round2(incomeTax * (nightsThisMonth / nights));
    const taxNextMonth = this.round2(incomeTax - taxThisMonth);

    const checkInMonthDate = new Date(checkInDate);
    const checkOutMonthDate = new Date(checkOutDate);

    const monthYearThis = this.formatMonthYear(checkInDate);
    const monthThis = this.formatMonth(checkInDate);
    const monthYearNext = this.formatMonthYear(checkOutDate);
    const monthNext = this.formatMonth(checkOutDate);

    const totalPayoutThis = totalThisMonth + 0 + 0 + 0 - hostFeeThisMonth - 0 + taxThisMonth;
    const netIncomeThis = totalPayoutThis - 0 - 0 - 0;

    const totalPayoutNext = totalNextMonth + cleaningFee + GUEST_INSURANCE + resortFee - hostFeeNextMonth - 0 + taxNextMonth;
    const netIncomeNext = totalPayoutNext - cleaningFee - GUEST_INSURANCE - resortFee;

    return [
      {
        confirmationCode,
        guest,
        platform: "Airbnb",
        checkIn: this.formatDate(checkInDate),
        checkOut: this.formatDate(checkOutDate),
        nights: nightsThisMonth,
        pricePerNight,
        total: totalThisMonth,
        cleaningFee: 0,
        guestInsurance: 0,
        resortFee: 0,
        hostFee: hostFeeThisMonth,
        comisionStripe: 0,
        incomeTax: taxThisMonth,
        totalPayout: this.round2(totalPayoutThis),
        netIncome: this.round2(netIncomeThis),
        propertyId,
        month: monthThis,
        monthYear: monthYearThis,
        isDuplicate,
      },
      {
        confirmationCode,
        guest,
        platform: "Airbnb",
        checkIn: this.formatDate(checkInDate),
        checkOut: this.formatDate(checkOutDate),
        nights: nightsNextMonth,
        pricePerNight,
        total: totalNextMonth,
        cleaningFee,
        guestInsurance: GUEST_INSURANCE,
        resortFee,
        hostFee: hostFeeNextMonth,
        comisionStripe: 0,
        incomeTax: taxNextMonth,
        totalPayout: this.round2(totalPayoutNext),
        netIncome: this.round2(netIncomeNext),
        propertyId,
        month: monthNext,
        monthYear: monthYearNext,
        isDuplicate,
      },
    ];
  }

  private groupByProperty(reservations: ProcessedReservation[]): Record<string, PropertyGroup> {
    const groups: Record<string, PropertyGroup> = {};

    for (const r of reservations) {
      if (!groups[r.propertyId]) {
        groups[r.propertyId] = {
          propertyId: r.propertyId,
          reservations: [],
          totals: { totalReservations: 0, totalNights: 0, totalRevenue: 0, totalPayout: 0, totalNetIncome: 0 },
        };
      }
      groups[r.propertyId].reservations.push(r);
    }

    for (const key of Object.keys(groups)) {
      const g = groups[key];
      g.totals.totalReservations = g.reservations.length;
      g.totals.totalNights = g.reservations.reduce((s, r) => s + r.nights, 0);
      g.totals.totalRevenue = this.round2(g.reservations.reduce((s, r) => s + r.total, 0));
      g.totals.totalPayout = this.round2(g.reservations.reduce((s, r) => s + r.totalPayout, 0));
      g.totals.totalNetIncome = this.round2(g.reservations.reduce((s, r) => s + r.netIncome, 0));
    }

    return groups;
  }

  private calculateSummary(all: ProcessedReservation[], properties: Record<string, PropertyGroup>): {
    totalReservations: number;
    totalPayout: number;
    totalNetIncome: number;
    duplicatesFound: number;
    month: string;
  } {
    const totalPayout = this.round2(Object.values(properties).reduce((s, g) => s + g.totals.totalPayout, 0));
    const totalNetIncome = this.round2(Object.values(properties).reduce((s, g) => s + g.totals.totalNetIncome, 0));
    const totalReservations = Object.values(properties).reduce((s, g) => s + g.totals.totalReservations, 0);

    let month = "";
    if (all.length > 0) {
      const d = this.parseDate(all[0].checkIn);
      if (d) month = this.formatMonth(d);
    }

    return { totalReservations, totalPayout, totalNetIncome, duplicatesFound: all.filter((r) => r.isDuplicate).length, month };
  }

  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    // Try ISO format YYYY-MM-DD
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
    let m = dateStr.match(iso);
    if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));

    // Try MM/DD/YYYY
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;
    m = dateStr.match(us);
    if (m) return new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]));

    // Try DD/MM/YYYY
    const eu = /^(\d{1,2})[\/](\d{1,2})[\/](\d{4})/;
    m = dateStr.match(eu);
    if (m) {
      const d = parseInt(m[1]), mo = parseInt(m[2]) - 1, y = parseInt(m[3]);
      if (d > 12) return new Date(y, mo, d);
      return new Date(y, mo, d);
    }

    // Try "Mon DD, YYYY"
    const named = /([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/;
    m = dateStr.match(named);
    if (m) return new Date(parseInt(m[3]), this.monthIndex(m[1]), parseInt(m[2]));

    return null;
  }

  private monthIndex(name: string): number {
    const lower = name.toLowerCase().substring(0, 3);
    const en = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const es = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    for (let i = 0; i < 12; i++) {
      if (en[i] === lower || es[i] === lower) return i;
    }
    return 0;
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return mo + "/" + day + "/" + y;
  }

  private formatMonth(d: Date): string {
    return MONTH_NAMES[d.getMonth()] + " " + d.getFullYear();
  }

  private formatMonthYear(d: Date): string {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  // --- CSV parsing ---

  parseCSV(content: string): ParsedCSV {
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const delimiter = lines[0].includes("\t") ? "\t" : ",";

    const parseLine = (line: string) => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === delimiter && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map(parseLine);
    return { headers, rows };
  }

  findColumnIndices(headers: string[]): ColumnIndices {
    const h = headers.map((x) => x.trim().toLowerCase());

    const find = (names: string[]): number => {
      for (const name of names) {
        const idx = h.findIndex((x) => x === name.toLowerCase());
        if (idx >= 0) return idx;
      }
      return -1;
    };

    return {
      fecha: find(["fecha", "date"]),
      tipo: find(["tipo", "type"]),
      confirmationCode: find(["código de confirmación", "codigo de confirmacion", "confirmation code", "reservation code"]),
      fechaReservacion: find(["fecha de la reservación", "fecha de la reservacion", "reservation date"]),
      fechaInicio: find(["fecha de inicio", "check-in", "checkin", "start date", "llegada"]),
      noches: find(["noches", "nights", "noche"]),
      huesped: find(["huésped", "huesped", "guest"]),
      anuncio: find(["anuncio", "ad", "ad title", "listing"]),
      totalPagado: find(["total pagado", "total paid"]),
      tarifaServicio: find(["tarifa por servicio", "service fee", "host fee"]),
      tarifaLimpieza: find(["tarifa de limpieza", "cleaning fee"]),
      tarifaGestion: find(["tarifa por gestión", "tarifa por gestion", "management fee", "guest insurance"]),
      tarifaComunidad: find(["tarifa de la comunidad", "community fee", "resort fee"]),
      ingresosBrutos: find(["ingresos brutos", "gross revenue"]),
      impuestosAirbnb: find(["impuestos liquidados por airbnb", "impuestos liquidados", "taxes settled", "income tax"]),
    };
  }

  private buildEquivalenceMap(equivalences: Equivalence[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const eq of equivalences) {
      map.set(eq.adTitle, eq.propertyId);
    }
    return map;
  }
}
