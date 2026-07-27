import { Router, Request, Response } from "express";
import { quickbooksConfig } from "../../../../config/quickbooks";
import { env } from "../../../../config/env";
import { QuickBooksClient } from "../../quickbooks/QuickBooksClient";
import { QuickBooksDiscoveryUseCase } from "../../quickbooks/QuickBooksDiscoveryUseCase";
import { QuickBooksSyncUseCase } from "../../quickbooks/QuickBooksSyncUseCase";
import { MongooseQuickBooksTokenRepository } from "../../persistence/MongooseQuickBooksTokenRepository";
import { MongooseQuickBooksCacheRepository } from "../../persistence/MongooseQuickBooksCacheRepository";
import { AuthRequest, authMiddleware } from "../middleware/auth";

const router = Router();
const tokenRepo = new MongooseQuickBooksTokenRepository();
const cacheRepo = new MongooseQuickBooksCacheRepository();
const qbClient = new QuickBooksClient(tokenRepo);
const discoveryUseCase = new QuickBooksDiscoveryUseCase(qbClient, cacheRepo);
const syncUseCase = new QuickBooksSyncUseCase(qbClient, cacheRepo);

router.get("/auth-url", authMiddleware, (_req: Request, res: Response) => {
  res.json({ url: quickbooksConfig.authUrl });
});

router.get("/callback", async (req: Request, res: Response) => {
  try {
    const { code, realmId, state } = req.query;
    if (!code || !realmId) {
      res.redirect(`${env.FRONTEND_URL}/?error=missing_params`);
      return;
    }

    const tokens = await qbClient.exchangeCodeForTokens(code as string, realmId as string);

    res.redirect(`${env.FRONTEND_URL}/quickbooks/callback?realmId=${realmId}&accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}&expiresAt=${tokens.expiresAt.toISOString()}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.redirect(`${env.FRONTEND_URL}/?error=${encodeURIComponent(message)}`);
  }
});

router.post("/save-tokens", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { realmId, accessToken, refreshToken, expiresAt } = req.body;
    if (!realmId || !accessToken || !refreshToken || !expiresAt) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    const token = await tokenRepo.save({
      userId: authReq.userId!,
      realmId,
      accessToken,
      refreshToken,
      expiresAt: new Date(expiresAt),
    });
    res.json({ success: true, realmId: token.realmId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

router.get("/status", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const token = await tokenRepo.findByUserId(authReq.userId!);
    if (!token) {
      res.json({ connected: false });
      return;
    }
    const expired = new Date() >= token.expiresAt;
    res.json({ connected: true, realmId: token.realmId, expired, expiresAt: token.expiresAt });
  } catch {
    res.json({ connected: false });
  }
});

router.delete("/disconnect", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    await tokenRepo.deleteByUserId(authReq.userId!);
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  }
});

async function ensureItemExists(userId: string, name: string): Promise<string> {
  const queryResult = await qbClient.query<{ QueryResponse: { Item?: Array<{ Id: string; Name: string }> } }>(
    userId,
    `SELECT * FROM Item WHERE Name = '${name.replace(/'/g, "\\'")}'`
  );
  const items = queryResult.QueryResponse?.Item;
  if (items && items.length > 0) {
    return items[0].Id;
  }
  const created = await qbClient.post<{ Item: { Id: string } }>(userId, "/item", {
    Name: name,
    Type: "Service",
    IncomeAccountRef: { value: "1" },
  });
  return created.Item.Id;
}

async function ensureClassExists(userId: string, name: string): Promise<string> {
  const queryResult = await qbClient.query<{ QueryResponse: { Class?: Array<{ Id: string; Name: string }> } }>(
    userId,
    `SELECT * FROM Class WHERE Name = '${name.replace(/'/g, "\\'")}'`
  );
  const classes = queryResult.QueryResponse?.Class;
  if (classes && classes.length > 0) {
    return classes[0].Id;
  }
  const created = await qbClient.post<{ Class: { Id: string } }>(userId, "/class", {
    Name: name,
  });
  return created.Class.Id;
}

async function ensureCustomerExists(userId: string, name: string): Promise<string> {
  const displayName = name.replace(/'/g, "\\'");
  const queryResult = await qbClient.query<{ QueryResponse: { Customer?: Array<{ Id: string; DisplayName: string }> } }>(
    userId,
    `SELECT * FROM Customer WHERE DisplayName = '${displayName}'`
  );
  const customers = queryResult.QueryResponse?.Customer;
  if (customers && customers.length > 0) {
    return customers[0].Id;
  }
  const created = await qbClient.post<{ Customer: { Id: string } }>(userId, "/customer", {
    DisplayName: name,
  });
  return created.Customer.Id;
}

router.post("/discovery", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    await discoveryUseCase.execute(authReq.userId!);
    const cache = await cacheRepo.findByUserId(authReq.userId!);
    res.json({ success: true, items: Object.keys(cache?.items || {}).length, classes: Object.keys(cache?.classes || {}).length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/cache", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const cache = await cacheRepo.findByUserId(authReq.userId!);
    if (!cache) {
      res.json({ discovered: false, items: {}, classes: {} });
      return;
    }
    res.json({ discovered: true, items: cache.items, classes: cache.classes, customers: cache.customers, vendors: cache.vendors });
  } catch {
    res.json({ discovered: false, items: {}, classes: {} });
  }
});

router.post("/sync", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { reservations, invoices = true, bills = true, journalEntries = false } = req.body;
    if (!reservations || !Array.isArray(reservations) || reservations.length === 0) {
      res.status(400).json({ error: "Reservations array is required" });
      return;
    }
    const result = await syncUseCase.execute(authReq.userId!, reservations, { invoices, bills, journalEntries });
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/customers", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const search = (req.query.search as string || "").replace(/'/g, "\\'");
    const query = search
      ? `SELECT * FROM Customer WHERE Active = true AND DisplayName LIKE '%${search}%' MAXRESULTS 20`
      : "SELECT * FROM Customer WHERE Active = true MAXRESULTS 20";
    const result = await qbClient.query<{ QueryResponse: { Customer?: Array<{ Id: string; DisplayName: string; PrimaryEmailAddr?: { Address: string }; BillAddr?: { Line1: string } }> } }>(
      authReq.userId!, query
    );
    res.json(result.QueryResponse?.Customer || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/create-customer", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const created = await qbClient.post<{ Customer: { Id: string; DisplayName: string } }>(authReq.userId!, "/customer", {
      DisplayName: name,
    });
    res.json({ success: true, customer: created.Customer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.put("/customers/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const existing = await qbClient.query<{ QueryResponse: { Customer: Array<{ Id: string; SyncToken: string }> } }>(
      authReq.userId!, `SELECT * FROM Customer WHERE Id = '${id}'`
    );
    const customer = existing.QueryResponse?.Customer?.[0];
    if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
    const updated = await qbClient.post<{ Customer: { Id: string; DisplayName: string } }>(authReq.userId!, "/customer?operation=update", {
      Id: id,
      SyncToken: customer.SyncToken,
      DisplayName: name,
    });
    res.json({ success: true, customer: updated.Customer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.delete("/customers/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const existing = await qbClient.query<{ QueryResponse: { Customer: Array<{ Id: string; SyncToken: string }> } }>(
      authReq.userId!, `SELECT * FROM Customer WHERE Id = '${id}'`
    );
    const customer = existing.QueryResponse?.Customer?.[0];
    if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
    await qbClient.post(authReq.userId!, "/customer?operation=delete", {
      Id: id,
      SyncToken: customer.SyncToken,
    });
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/items", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const search = (req.query.search as string || "").replace(/'/g, "\\'");
    const query = search
      ? `SELECT * FROM Item WHERE Type = 'Service' AND Name LIKE '%${search}%' MAXRESULTS 50`
      : "SELECT * FROM Item WHERE Type = 'Service' MAXRESULTS 50";
    const result = await qbClient.query<{ QueryResponse: { Item?: Array<{ Id: string; Name: string; Type: string }> } }>(
      authReq.userId!, query
    );
    res.json(result.QueryResponse?.Item || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/create-item", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { name, incomeAccountRef = "1" } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const created = await qbClient.post<{ Item: { Id: string; Name: string } }>(authReq.userId!, "/item", {
      Name: name,
      Type: "Service",
      IncomeAccountRef: { value: incomeAccountRef },
    });
    res.json({ success: true, item: created.Item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.put("/items/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const existing = await qbClient.query<{ QueryResponse: { Item: Array<{ Id: string; SyncToken: string }> } }>(
      authReq.userId!, `SELECT * FROM Item WHERE Id = '${id}'`
    );
    const item = existing.QueryResponse?.Item?.[0];
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    const updated = await qbClient.post<{ Item: { Id: string; Name: string } }>(authReq.userId!, "/item?operation=update", {
      Id: id,
      SyncToken: item.SyncToken,
      Name: name,
      Type: "Service",
      IncomeAccountRef: { value: "1" },
    });
    res.json({ success: true, item: updated.Item });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.delete("/items/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const existing = await qbClient.query<{ QueryResponse: { Item: Array<{ Id: string; SyncToken: string }> } }>(
      authReq.userId!, `SELECT * FROM Item WHERE Id = '${id}'`
    );
    const item = existing.QueryResponse?.Item?.[0];
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    await qbClient.post(authReq.userId!, "/item?operation=delete", {
      Id: id,
      SyncToken: item.SyncToken,
    });
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/create-class", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const created = await qbClient.post<{ Class: { Id: string; Name: string } }>(authReq.userId!, "/class", {
      Name: name,
    });
    res.json({ success: true, class: created.Class });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/classes", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const search = (req.query.search as string || "").replace(/'/g, "\\'");
    const query = search
      ? `SELECT * FROM Class WHERE Active = true AND Name LIKE '%${search}%' MAXRESULTS 50`
      : "SELECT * FROM Class WHERE Active = true MAXRESULTS 50";
    const result = await qbClient.query<{ QueryResponse: { Class?: Array<{ Id: string; Name: string; Active: boolean }> } }>(
      authReq.userId!, query
    );
    res.json(result.QueryResponse?.Class || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.put("/classes/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const existing = await qbClient.query<{ QueryResponse: { Class: Array<{ Id: string; SyncToken: string }> } }>(
      authReq.userId!, `SELECT * FROM Class WHERE Id = '${id}'`
    );
    const cls = existing.QueryResponse?.Class?.[0];
    if (!cls) { res.status(404).json({ error: "Class not found" }); return; }
    const updated = await qbClient.post<{ Class: { Id: string; Name: string } }>(authReq.userId!, "/class?operation=update", {
      Id: id,
      SyncToken: cls.SyncToken,
      Name: name,
    });
    res.json({ success: true, class: updated.Class });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.delete("/classes/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const existing = await qbClient.query<{ QueryResponse: { Class: Array<{ Id: string; SyncToken: string }> } }>(
      authReq.userId!, `SELECT * FROM Class WHERE Id = '${id}'`
    );
    const cls = existing.QueryResponse?.Class?.[0];
    if (!cls) { res.status(404).json({ error: "Class not found" }); return; }
    await qbClient.post(authReq.userId!, "/class?operation=delete", {
      Id: id,
      SyncToken: cls.SyncToken,
    });
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/create-invoice", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { customerId, customerName, propertyName, confirmationCode, invoiceDate, dueDate, memo, terms, items } = req.body;

    if ((!customerId && !customerName) || !items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "customerId (or customerName) and items[] are required" });
      return;
    }

    let customerRef = customerId;
    if (!customerRef && customerName) {
      customerRef = await ensureCustomerExists(authReq.userId!, customerName);
    }

    const classId = propertyName ? await ensureClassExists(authReq.userId!, propertyName) : undefined;

    const lineItems = [];
    for (const item of items) {
      const itemId = await ensureItemExists(authReq.userId!, item.itemName);
      const lineDetail: Record<string, unknown> = {
        ItemRef: { value: itemId, name: item.itemName },
        Qty: item.qty,
        UnitPrice: item.rate,
        TaxCodeRef: { value: "NON" },
      };
      if (classId) lineDetail.ClassRef = { value: classId, name: propertyName };
      lineItems.push({
        Amount: Number((item.qty * item.rate).toFixed(2)),
        DetailType: "SalesItemLineDetail",
        Description: item.description || `${item.itemName} - ${item.qty} @ $${item.rate}`,
        SalesItemLineDetail: lineDetail,
      });
    }

    const payload: Record<string, unknown> = {
      CustomerRef: { value: customerRef },
      TxnDate: invoiceDate || new Date().toISOString().split("T")[0],
      DueDate: dueDate || invoiceDate || new Date().toISOString().split("T")[0],
      CustomerMemo: { value: memo || `CONF-${confirmationCode || "N/A"} | ${propertyName || ""}` },
      Line: lineItems,
      GlobalTaxCalculation: "TaxExcluded",
    };
    if (classId) payload.ClassRef = { value: classId, name: propertyName };

    const result = await qbClient.post(authReq.userId!, "/invoice", payload);
    res.json({ success: true, invoice: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("QuickBooks create invoice error:", error);
    res.status(500).json({ error: message });
  }
});

router.get("/vendors", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const search = (req.query.search as string || "").replace(/'/g, "\\'");
    const query = search
      ? `SELECT * FROM Vendor WHERE Active = true AND DisplayName LIKE '%${search}%' MAXRESULTS 20`
      : "SELECT * FROM Vendor WHERE Active = true MAXRESULTS 20";
    const result = await qbClient.query<{ QueryResponse: { Vendor?: Array<{ Id: string; DisplayName: string }> } }>(
      authReq.userId!, query
    );
    res.json(result.QueryResponse?.Vendor || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/create-vendor", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const created = await qbClient.post<{ Vendor: { Id: string; DisplayName: string } }>(authReq.userId!, "/vendor", { DisplayName: name });
    res.json({ success: true, vendor: created.Vendor });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/accounts", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const search = (req.query.search as string || "").replace(/'/g, "\\'");
    const query = search
      ? `SELECT * FROM Account WHERE Active = true AND Name LIKE '%${search}%' MAXRESULTS 50`
      : "SELECT * FROM Account WHERE Active = true MAXRESULTS 50";
    const result = await qbClient.query<{ QueryResponse: { Account?: Array<{ Id: string; Name: string; AccountType: string }> } }>(
      authReq.userId!, query
    );
    res.json(result.QueryResponse?.Account || []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/create-bill", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const { vendorId, vendorName, propertyName, billDate, dueDate, memo, items } = req.body;

    if ((!vendorId && !vendorName) || !items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "vendorId (or vendorName) and items[] are required" });
      return;
    }

    let vendorRef = vendorId;
    if (!vendorRef && vendorName) {
      const queryResult = await qbClient.query<{ QueryResponse: { Vendor?: Array<{ Id: string }> } }>(
        authReq.userId!, `SELECT * FROM Vendor WHERE DisplayName = '${vendorName.replace(/'/g, "\\'")}'`
      );
      if (queryResult.QueryResponse?.Vendor?.length) {
        vendorRef = queryResult.QueryResponse.Vendor[0].Id;
      } else {
        const created = await qbClient.post<{ Vendor: { Id: string } }>(authReq.userId!, "/vendor", { DisplayName: vendorName });
        vendorRef = created.Vendor.Id;
      }
    }

    const classId = propertyName ? await ensureClassExists(authReq.userId!, propertyName) : undefined;

    const lineItems = [];
    for (const item of items) {
      const lineDetail: Record<string, unknown> = {
        AccountRef: { value: item.accountId, name: item.accountName },
        BillableStatus: "NotBillable",
        Qty: item.qty,
        UnitPrice: item.rate,
        TaxCodeRef: { value: "NON" },
      };
      if (classId) lineDetail.ClassRef = { value: classId, name: propertyName };
      lineItems.push({
        Amount: Number((item.qty * item.rate).toFixed(2)),
        DetailType: "AccountBasedExpenseLineDetail",
        Description: item.description || `${item.accountName} - ${item.qty} @ $${item.rate}`,
        AccountBasedExpenseLineDetail: lineDetail,
      });
    }

    const payload: Record<string, unknown> = {
      VendorRef: { value: vendorRef },
      TxnDate: billDate || new Date().toISOString().split("T")[0],
      DueDate: dueDate || billDate || new Date().toISOString().split("T")[0],
      Line: lineItems,
      GlobalTaxCalculation: "TaxExcluded",
    };
    if (classId) payload.ClassRef = { value: classId, name: propertyName };

    const result = await qbClient.post(authReq.userId!, "/bill", payload);
    res.json({ success: true, bill: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("QuickBooks create bill error:", error);
    res.status(500).json({ error: message });
  }
});

router.post("/test-invoice", authMiddleware, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const {
      customerName = "Test Guest",
      propertyName = "Emilia 401",
      confirmationCode = "TEST-001",
      checkIn = "2026-07-01",
      nights = 3,
      pricePerNight = 150,
      cleaningFee = 125,
      guestInsurance = 30,
      resortFee = 0,
      incomeTax = 0,
      platform = "Airbnb",
    } = req.body;

    const customerId = await ensureCustomerExists(authReq.userId!, customerName);
    const classId = await ensureClassExists(authReq.userId!, propertyName);

    const lineItems = [
      {
        Amount: pricePerNight * nights,
        DetailType: "SalesItemLineDetail",
        Description: `Rent - ${nights} nights @ $${pricePerNight}/night`,
        SalesItemLineDetail: {
          ItemRef: { value: await ensureItemExists(authReq.userId!, "Rent"), name: "Rent" },
          Qty: nights,
          UnitPrice: pricePerNight,
        },
      },
    ];
    if (cleaningFee > 0) {
      lineItems.push({
        Amount: cleaningFee,
        DetailType: "SalesItemLineDetail",
        Description: "Cleaning fee",
        SalesItemLineDetail: {
          ItemRef: { value: await ensureItemExists(authReq.userId!, "Cleaning Fee"), name: "Cleaning Fee" },
          Qty: 1,
          UnitPrice: cleaningFee,
        },
      });
    }
    if (guestInsurance > 0) {
      lineItems.push({
        Amount: guestInsurance,
        DetailType: "SalesItemLineDetail",
        Description: "Guest insurance waiver",
        SalesItemLineDetail: {
          ItemRef: { value: await ensureItemExists(authReq.userId!, "Insurance Waivo"), name: "Insurance Waivo" },
          Qty: 1,
          UnitPrice: guestInsurance,
        },
      });
    }
    if (resortFee > 0) {
      lineItems.push({
        Amount: resortFee,
        DetailType: "SalesItemLineDetail",
        Description: "Resort fee",
        SalesItemLineDetail: {
          ItemRef: { value: await ensureItemExists(authReq.userId!, "Resolutions"), name: "Resolutions" },
          Qty: 1,
          UnitPrice: resortFee,
        },
      });
    }
    if (incomeTax > 0) {
      lineItems.push({
        Amount: incomeTax,
        DetailType: "SalesItemLineDetail",
        Description: "Hotel income tax",
        SalesItemLineDetail: {
          ItemRef: { value: await ensureItemExists(authReq.userId!, "Hotel Income Tax"), name: "Hotel Income Tax" },
          Qty: 1,
          UnitPrice: incomeTax,
        },
      });
    }

    const lineItemsWithClass = lineItems.map((li) => {
      if (li.SalesItemLineDetail) {
        return { ...li, SalesItemLineDetail: { ...li.SalesItemLineDetail, TaxCodeRef: { value: "NON" }, ClassRef: { value: classId, name: propertyName } } };
      }
      return li;
    });

    const invoicePayload = {
      CustomerRef: { value: customerId },
      TxnDate: checkIn,
      DueDate: checkIn,
      PrivateNote: `CONF-${confirmationCode} - ${propertyName}`,
      CustomerMemo: { value: `CONF-${confirmationCode} | ${propertyName}` },
      ClassRef: { value: classId, name: propertyName },
      Line: lineItemsWithClass,
      GlobalTaxCalculation: "TaxExcluded",
    };

    const result = await qbClient.post(authReq.userId!, "/invoice", invoicePayload);
    res.json({ success: true, invoice: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("QuickBooks test invoice error:", error);
    res.status(500).json({ error: message });
  }
});

export default router;
