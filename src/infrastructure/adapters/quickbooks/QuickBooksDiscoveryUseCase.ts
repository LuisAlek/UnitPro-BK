import { QuickBooksClient } from "./QuickBooksClient";
import { IQuickBooksCacheRepository } from "../../../core/domain/ports/IQuickBooksCacheRepository";

export class QuickBooksDiscoveryUseCase {
  constructor(
    private qbClient: QuickBooksClient,
    private cacheRepo: IQuickBooksCacheRepository
  ) {}

  async execute(userId: string): Promise<void> {
    const items = await this.fetchItems(userId);
    const classes = await this.fetchClasses(userId);
    const customers = await this.fetchCustomers(userId);
    const vendors = await this.fetchVendors(userId);

    await this.cacheRepo.save({
      userId,
      items,
      classes,
      customers,
      vendors,
    });
  }

  private async fetchItems(userId: string): Promise<Record<string, string>> {
    const result = await this.qbClient.query<{ QueryResponse: { Item?: Array<{ Id: string; Name: string }> } }>(
      userId,
      "SELECT * FROM Item MAXRESULTS 200"
    );
    const map: Record<string, string> = {};
    for (const item of result.QueryResponse?.Item || []) {
      map[item.Name] = item.Id;
    }
    return map;
  }

  private async fetchClasses(userId: string): Promise<Record<string, string>> {
    const result = await this.qbClient.query<{ QueryResponse: { Class?: Array<{ Id: string; Name: string }> } }>(
      userId,
      "SELECT * FROM Class MAXRESULTS 200"
    );
    const map: Record<string, string> = {};
    for (const cls of result.QueryResponse?.Class || []) {
      map[cls.Name] = cls.Id;
    }
    return map;
  }

  private async fetchCustomers(userId: string): Promise<Record<string, string>> {
    const result = await this.qbClient.query<{ QueryResponse: { Customer?: Array<{ Id: string; DisplayName: string }> } }>(
      userId,
      "SELECT * FROM Customer MAXRESULTS 200"
    );
    const map: Record<string, string> = {};
    for (const c of result.QueryResponse?.Customer || []) {
      map[c.DisplayName] = c.Id;
    }
    return map;
  }

  private async fetchVendors(userId: string): Promise<Record<string, string>> {
    const result = await this.qbClient.query<{ QueryResponse: { Vendor?: Array<{ Id: string; DisplayName: string }> } }>(
      userId,
      "SELECT * FROM Vendor MAXRESULTS 200"
    );
    const map: Record<string, string> = {};
    for (const v of result.QueryResponse?.Vendor || []) {
      map[v.DisplayName] = v.Id;
    }
    return map;
  }
}
