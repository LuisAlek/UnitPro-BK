import { QuickBooksClient } from "./QuickBooksClient";
import { IQuickBooksCacheRepository } from "../../../core/domain/ports/IQuickBooksCacheRepository";
import { ProcessedReservation } from "../../../core/domain/entities/ProcessedReservation";

interface SyncOptions {
  invoices: boolean;
  bills: boolean;
  journalEntries: boolean;
}

interface SyncResult {
  invoicesCreated: number;
  billsCreated: number;
  journalEntriesCreated: number;
  errors: string[];
}

export class QuickBooksSyncUseCase {
  constructor(
    private qbClient: QuickBooksClient,
    private cacheRepo: IQuickBooksCacheRepository
  ) {}

  async execute(userId: string, reservations: ProcessedReservation[], options: SyncOptions): Promise<SyncResult> {
    let cache = await this.cacheRepo.findByUserId(userId);
    if (!cache) {
      throw new Error("QuickBooks cache not found. Run discovery first.");
    }

    const result: SyncResult = { invoicesCreated: 0, billsCreated: 0, journalEntriesCreated: 0, errors: [] };
    const customerCache: Record<string, string> = { ...cache.customers };

    for (const res of reservations) {
      try {
        if (options.invoices) {
          await this.createInvoice(userId, res, cache.items, cache.classes, customerCache);
          result.invoicesCreated++;
        }
        if (options.bills) {
          await this.createBill(userId, res, cache.items, cache.classes);
          result.billsCreated++;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Reservation ${res.confirmationCode}: ${msg}`);
      }
    }

    await this.cacheRepo.save({ ...cache, customers: customerCache });

    if (options.journalEntries && result.errors.length === 0) {
      try {
        await this.createJournalEntries(userId, reservations, cache.items, cache.classes);
        result.journalEntriesCreated = 1;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Journal entry: ${msg}`);
      }
    }

    return result;
  }

  private async ensureCustomer(userId: string, name: string, customerCache: Record<string, string>): Promise<string> {
    if (customerCache[name]) return customerCache[name];
    const queryResult = await this.qbClient.query<{ QueryResponse: { Customer?: Array<{ Id: string }> } }>(
      userId,
      `SELECT * FROM Customer WHERE DisplayName = '${name.replace(/'/g, "\\'")}'`
    );
    if (queryResult.QueryResponse?.Customer?.length) {
      customerCache[name] = queryResult.QueryResponse.Customer[0].Id;
      return customerCache[name];
    }
    const created = await this.qbClient.post<{ Customer: { Id: string } }>(userId, "/customer", { DisplayName: name });
    customerCache[name] = created.Customer.Id;
    return customerCache[name];
  }

  private async createInvoice(userId: string, res: ProcessedReservation, items: Record<string, string>, classes: Record<string, string>, customerCache: Record<string, string>): Promise<void> {
    const customerId = await this.ensureCustomer(userId, res.guest, customerCache);
    const classId = classes[res.propertyId];
    const lineItems: Array<Record<string, unknown>> = [];

    lineItems.push({
      Amount: res.total,
      DetailType: "SalesItemLineDetail",
      Description: `Rent - ${res.nights} nights @ $${res.pricePerNight}/night`,
      SalesItemLineDetail: {
        ItemRef: { value: items["Rent"] || "1", name: "Rent" },
        Qty: res.nights,
        UnitPrice: res.pricePerNight,
      },
    });

    if (res.cleaningFee > 0 && items["Cleaning Fee"]) {
      lineItems.push({
        Amount: res.cleaningFee,
        DetailType: "SalesItemLineDetail",
        Description: "Cleaning fee",
        SalesItemLineDetail: {
          ItemRef: { value: items["Cleaning Fee"], name: "Cleaning Fee" },
          Qty: 1,
          UnitPrice: res.cleaningFee,
        },
      });
    }
    if (res.guestInsurance > 0 && items["Insurance Waivo"]) {
      lineItems.push({
        Amount: res.guestInsurance,
        DetailType: "SalesItemLineDetail",
        Description: "Guest insurance waiver",
        SalesItemLineDetail: {
          ItemRef: { value: items["Insurance Waivo"], name: "Insurance Waivo" },
          Qty: 1,
          UnitPrice: res.guestInsurance,
        },
      });
    }
    if (res.resortFee > 0 && items["Resolutions"]) {
      lineItems.push({
        Amount: res.resortFee,
        DetailType: "SalesItemLineDetail",
        Description: "Resort fee",
        SalesItemLineDetail: {
          ItemRef: { value: items["Resolutions"], name: "Resolutions" },
          Qty: 1,
          UnitPrice: res.resortFee,
        },
      });
    }
    if (res.hostFee > 0 && items["Service Fee"]) {
      lineItems.push({
        Amount: res.hostFee,
        DetailType: "SalesItemLineDetail",
        Description: "Service fee charged to guest",
        SalesItemLineDetail: {
          ItemRef: { value: items["Service Fee"], name: "Service Fee" },
          Qty: 1,
          UnitPrice: res.hostFee,
        },
      });
    }
    if (res.incomeTax > 0 && items["Hotel Income Tax"]) {
      lineItems.push({
        Amount: res.incomeTax,
        DetailType: "SalesItemLineDetail",
        Description: "Hotel income tax (Booking/Expedia/VRBO)",
        SalesItemLineDetail: {
          ItemRef: { value: items["Hotel Income Tax"], name: "Hotel Income Tax" },
          Qty: 1,
          UnitPrice: res.incomeTax,
        },
      });
    }

    const lineItemsWithClass = lineItems.map((li) => {
      if (li.SalesItemLineDetail && classId) {
        return { ...li, SalesItemLineDetail: { ...(li.SalesItemLineDetail as Record<string, unknown>), TaxCodeRef: { value: "NON" }, ClassRef: { value: classId, name: res.propertyId } } };
      }
      return li;
    });

    await this.qbClient.post(userId, "/invoice", {
      CustomerRef: { value: customerId },
      TxnDate: res.checkIn,
      DueDate: res.checkIn,
      PrivateNote: `CONF-${res.confirmationCode} - ${res.propertyId}`,
      CustomerMemo: { value: `CONF-${res.confirmationCode} | ${res.propertyId}` },
      ClassRef: classId ? { value: classId, name: res.propertyId } : undefined,
      Line: lineItemsWithClass,
      GlobalTaxCalculation: "TaxExcluded",
    });
  }

  private async ensureVendor(userId: string, name: string): Promise<string> {
    const queryResult = await this.qbClient.query<{ QueryResponse: { Vendor?: Array<{ Id: string }> } }>(
      userId,
      `SELECT * FROM Vendor WHERE DisplayName = '${name.replace(/'/g, "\\'")}'`
    );
    if (queryResult.QueryResponse?.Vendor?.length) {
      return queryResult.QueryResponse.Vendor[0].Id;
    }
    const created = await this.qbClient.post<{ Vendor: { Id: string } }>(userId, "/vendor", { DisplayName: name });
    return created.Vendor.Id;
  }

  private async createBill(userId: string, res: ProcessedReservation, items: Record<string, string>, classes: Record<string, string>): Promise<void> {
    const vendorId = await this.ensureVendor(userId, "Airbnb");
    const classId = classes[res.propertyId];
    const lineItems: Array<Record<string, unknown>> = [];

    if (res.hostFee > 0) {
      const lineDetail: Record<string, unknown> = {
        AccountRef: { value: items["Chargers Commission"] || "1", name: "Chargers Commission" },
        BillableStatus: "NotBillable",
        Qty: 1,
        UnitPrice: res.hostFee,
        TaxCodeRef: { value: "NON" },
      };
      if (classId) lineDetail.ClassRef = { value: classId, name: res.propertyId };
      lineItems.push({
        Amount: res.hostFee,
        DetailType: "AccountBasedExpenseLineDetail",
        Description: "Host/service fee - Airbnb commission",
        AccountBasedExpenseLineDetail: lineDetail,
      });
    }

    if (res.incomeTax > 0 && items["Hotel Income Tax"]) {
      const lineDetail: Record<string, unknown> = {
        AccountRef: { value: items["Hotel Income Tax"], name: "Hotel Income Tax" },
        BillableStatus: "NotBillable",
        Qty: 1,
        UnitPrice: res.incomeTax,
        TaxCodeRef: { value: "NON" },
      };
      if (classId) lineDetail.ClassRef = { value: classId, name: res.propertyId };
      lineItems.push({
        Amount: res.incomeTax,
        DetailType: "AccountBasedExpenseLineDetail",
        Description: "Hotel income tax collected",
        AccountBasedExpenseLineDetail: lineDetail,
      });
    }

    if (lineItems.length === 0) return;

    await this.qbClient.post(userId, "/bill", {
      VendorRef: { value: vendorId },
      TxnDate: res.checkIn,
      DueDate: res.checkIn,
      PrivateNote: `CONF-${res.confirmationCode} expenses`,
      ClassRef: classId ? { value: classId, name: res.propertyId } : undefined,
      Line: lineItems,
      GlobalTaxCalculation: "TaxExcluded",
    });
  }

  private async createJournalEntries(userId: string, reservations: ProcessedReservation[], items: Record<string, string>, classes: Record<string, string>): Promise<void> {
    const byProperty: Record<string, ProcessedReservation[]> = {};
    for (const r of reservations) {
      if (!byProperty[r.propertyId]) byProperty[r.propertyId] = [];
      byProperty[r.propertyId].push(r);
    }

    for (const [propertyId, resList] of Object.entries(byProperty)) {
      const classId = classes[propertyId];
      const lines: Array<Record<string, unknown>> = [];

      let debitAmount = 0;
      let creditAmount = 0;

      for (const res of resList) {
        const totalPayout = res.totalPayout;
        const hostFee = res.hostFee;

        lines.push({
          Amount: totalPayout,
          DetailType: "JournalEntryLineDetail",
          Description: `Total payout - CONF-${res.confirmationCode}`,
          JournalEntryLineDetail: {
            PostingType: "Debit",
            AccountRef: { value: "1", name: "Undeposited Funds" },
          },
        });
        debitAmount += totalPayout;

        if (hostFee > 0) {
          lines.push({
            Amount: hostFee,
            DetailType: "JournalEntryLineDetail",
            Description: `Commission expense - CONF-${res.confirmationCode}`,
            JournalEntryLineDetail: {
              PostingType: "Debit",
              AccountRef: { value: items["Chargers Commission"] || "1", name: "Chargers Commission" },
            },
          });
          debitAmount += hostFee;
        }

        lines.push({
          Amount: res.total,
          DetailType: "JournalEntryLineDetail",
          Description: `Rental income - CONF-${res.confirmationCode}`,
          JournalEntryLineDetail: {
            PostingType: "Credit",
            AccountRef: { value: items["Rent"] || "1", name: "Rent" },
          },
        });
        creditAmount += res.total;

        if (res.cleaningFee > 0) {
          lines.push({
            Amount: res.cleaningFee,
            DetailType: "JournalEntryLineDetail",
            Description: "Cleaning fee income",
            JournalEntryLineDetail: {
              PostingType: "Credit",
              AccountRef: { value: items["Cleaning Fee"] || "1", name: "Cleaning Fee" },
            },
          });
          creditAmount += res.cleaningFee;
        }

        if (res.guestInsurance > 0) {
          lines.push({
            Amount: res.guestInsurance,
            DetailType: "JournalEntryLineDetail",
            Description: "Insurance waiver income",
            JournalEntryLineDetail: {
              PostingType: "Credit",
              AccountRef: { value: items["Insurance Waivo"] || "1", name: "Insurance Waivo" },
            },
          });
          creditAmount += res.guestInsurance;
        }

        if (res.resortFee > 0) {
          lines.push({
            Amount: res.resortFee,
            DetailType: "JournalEntryLineDetail",
            Description: "Resort fee income",
            JournalEntryLineDetail: {
              PostingType: "Credit",
              AccountRef: { value: items["Resolutions"] || "1", name: "Resolutions" },
            },
          });
          creditAmount += res.resortFee;
        }
      }

      await this.qbClient.post(userId, "/journalentry", {
        TxnDate: reservations[0]?.checkIn?.split("/")?.slice(-1)?.[0] ? `${reservations[0].checkIn}` : new Date().toISOString().split("T")[0],
        PrivateNote: `Monthly close - ${propertyId}`,
        ClassRef: classId ? { value: classId, name: propertyId } : undefined,
        Line: lines,
      });
    }
  }
}
