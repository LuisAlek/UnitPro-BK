import { Router, Request, Response } from "express";
import multer from "multer";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { MongooseEquivalenceRepository } from "../../persistence/MongooseEquivalenceRepository";
import { MongooseReservationRepository } from "../../persistence/MongooseReservationRepository";
import { ProcessReservationsUseCase } from "../../../../core/application/ProcessReservationsUseCase";
import { defaultEquivalences } from "../../../../config/defaultEquivalences";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const equivRepo = new MongooseEquivalenceRepository();
const reservationRepo = new MongooseReservationRepository();
const processUseCase = new ProcessReservationsUseCase(equivRepo, reservationRepo);

function parseLine(line: string, delimiter: string): string[] {
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
}

async function buildEquivalenceMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const eq of defaultEquivalences) {
    map.set(eq.adTitle, eq.propertyId);
  }
  try {
    const dbEquivalences = await equivRepo.findAll();
    for (const eq of dbEquivalences) {
      map.set(eq.adTitle, eq.propertyId);
    }
  } catch {}
  return map;
}

// ─── Legacy: POST /process-multiple (Payout grouping) ───

interface ReservationRow {
  tipo: string;
  anuncio: string;
  monto: string;
  totalPagado: string;
  huesped: string;
  raw: string[];
}
function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = lines[0].includes("\t") ? "\t" : ",";

  const headers = parseLine(lines[0], delimiter);
  const rows = lines.slice(1).map((l) => parseLine(l, delimiter));
  return { headers, rows };
}

function findColumnIndex(headers: string[], names: string[]): number {
  for (const name of names) {
    const idx = headers.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function buildExcel(headers: string[], allRows: string[][]): Promise<Buffer> {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Reservas");

  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0097A7" } };

  for (const row of allRows) {
    sheet.addRow(row);
  }

  sheet.columns.forEach((column: any, i: number) => {
    const maxLen = Math.max(
      (headers[i] || "").length,
      ...allRows.map((r) => (r[i] || "").length)
    );
    column.width = Math.min(Math.max(maxLen + 2, 10), 50);
  });

  return workbook.xlsx.writeBuffer() as Promise<Buffer>;
}

router.post("/process-multiple", authMiddleware, upload.array("files", 20), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const equivalences = await equivRepo.findAll();
    const equivalenceMap = new Map<string, string>();
    for (const eq of equivalences) {
      equivalenceMap.set(eq.adTitle, eq.propertyId);
    }

    const allHeaders: string[] = [];
    const allRows: string[][] = [];

    for (const file of files) {
      const content = file.buffer.toString("utf-8");
      const { headers, rows } = parseCSV(content);
      if (headers.length === 0) continue;

      const colTipo = findColumnIndex(headers, ["tipo", "type"]);
      const colAnuncio = findColumnIndex(headers, ["anuncio", "ad", "ad title", "listing"]);
      const colMonto = findColumnIndex(headers, ["monto", "amount", "total"]);
      const colTotalPagado = findColumnIndex(headers, ["total pagado del payout", "total pagado", "total paid"]);
      const colHuesped = findColumnIndex(headers, ["huésped", "guest", "hu sped"]);

      if (colTipo < 0 && colAnuncio < 0) continue;

      let payoutActual: string[] | null = null;
      let reservasDelPayout: string[][] = [];

      const cerrarPayout = () => {
        if (!payoutActual) return;

        const reservasValidas = reservasDelPayout.filter((row) => {
          const anuncio = (row[colAnuncio] || "").trim();
          return equivalenceMap.has(anuncio);
        });

        if (reservasValidas.length === 0) {
          payoutActual = null;
          reservasDelPayout = [];
          return;
        }

        const total = reservasValidas.reduce((sum, r) => {
          const val = parseFloat((r[colMonto >= 0 ? colMonto : 0] || "").replace(",", "."));
          return sum + (isNaN(val) ? 0 : val);
        }, 0);

        const payoutRow = [...payoutActual];
        if (colTotalPagado >= 0) {
          payoutRow[colTotalPagado] = total.toFixed(2);
        }

        if (allRows.length === 0) {
          allHeaders.push(...headers);
        }

        allRows.push(payoutRow);
        allRows.push(...reservasValidas);

        payoutActual = null;
        reservasDelPayout = [];
      };

      for (const row of rows) {
        if (row.length < Math.max(colTipo, colAnuncio, colMonto) + 1) continue;

        const tipo = (row[colTipo] || "").trim().toLowerCase();

        if (tipo === "payout") {
          cerrarPayout();
          payoutActual = row;
          reservasDelPayout = [];
        } else {
          if (payoutActual) reservasDelPayout.push(row);
        }
      }
      cerrarPayout();
    }

    if (allRows.length === 0) {
      res.status(400).json({ error: "No matching reservations found in any file" });
      return;
    }

    const buffer = await buildExcel(allHeaders, allRows);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=Reservas.xlsx");
    res.send(buffer);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── POST /process-reservations (JSON preview, multi-file) ───

router.post("/process-reservations", authMiddleware, upload.array("files", 4), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const contents = files.map((f) => f.buffer.toString("utf-8"));
    const result = await processUseCase.execute(contents, authReq.userId);
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── POST /download-report (Excel with formulas, multi-file) ───

router.post("/download-report", authMiddleware, upload.array("files", 4), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const contents = files.map((f) => f.buffer.toString("utf-8"));
    const result = await processUseCase.execute(contents, authReq.userId);

    const buffer = await buildExcelReport(result);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    const filename = `Reporte_Reservas_${result.summary.month.replace(/\s+/g, "_")}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── POST /filter-payouts (JSON preview, payout grouping + hardcoded equivalences) ───

router.post("/filter-payouts", authMiddleware, upload.array("files", 4), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const equivalenceMap = await buildEquivalenceMap();

    const allHeaders: string[] = [];
    const allRows: string[][] = [];
    let resortFeeCol = -1;

    for (const file of files) {
      const content = file.buffer.toString("utf-8");
      const lines = content.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) continue;

      const headerLine = lines[0];
      const tabs = (headerLine.match(/\t/g) || []).length;
      const commas = (headerLine.match(/,/g) || []).length;
      const delim = tabs > commas ? "\t" : ",";

      const headers = parseLine(headerLine, delim);

      const colTipo = headers.findIndex((h) => h.trim().toLowerCase() === "tipo");
      const colAnuncio = headers.findIndex((h) => h.trim().toLowerCase() === "anuncio");
      const colMonto = headers.findIndex((h) => h.trim().toLowerCase() === "monto");
      const colTotalPagado = headers.findIndex((h) => h.trim().toLowerCase() === "total pagado");
      const colResort = headers.findIndex((h) => /tarifa.*(complejo|comunidad)|(complejo|comunitat|resort).*(tarifa|fee)|resort fee/i.test(h.trim()));

      if (colTipo < 0 || colAnuncio < 0) continue;

      if (resortFeeCol < 0) resortFeeCol = colResort;

      let payoutActual: string[] | null = null;
      let reservasDelPayout: string[][] = [];

      const cerrarPayout = () => {
        if (!payoutActual) return;

        const reservasValidas = reservasDelPayout.filter((row) => {
          const anuncio = (row[colAnuncio] || "").trim();
          return equivalenceMap.has(anuncio);
        });

        if (reservasValidas.length === 0) {
          payoutActual = null;
          reservasDelPayout = [];
          return;
        }

        const total = reservasValidas.reduce((sum, r) => {
          const val = parseFloat((r[colMonto >= 0 ? colMonto : 0] || "").replace(",", "."));
          return sum + (isNaN(val) ? 0 : val);
        }, 0);

        const payoutRow = [...payoutActual];
        if (colMonto >= 0) payoutRow[colMonto] = "";
        if (colTotalPagado >= 0) payoutRow[colTotalPagado] = total.toFixed(2);

        if (allHeaders.length === 0) allHeaders.push(...headers);

        allRows.push(payoutRow);
        allRows.push(...reservasValidas);

        payoutActual = null;
        reservasDelPayout = [];
      };

      for (const line of lines.slice(1)) {
        const row = parseLine(line, delim);
        while (row.length < 20) row.push("");

        const tipo = (row[colTipo] || "").trim().toLowerCase();
        if (tipo === "payout") {
          cerrarPayout();
          payoutActual = row;
          reservasDelPayout = [];
        } else {
          if (payoutActual) reservasDelPayout.push(row);
        }
      }
      cerrarPayout();
    }

    if (allRows.length === 0) {
      res.status(400).json({ error: "No matching reservations found in any file" });
      return;
    }

    // Remove "Tarifa del complejo turístico" column from all rows
    if (resortFeeCol >= 0) {
      allHeaders.splice(resortFeeCol, 1);
      for (const row of allRows) {
        if (resortFeeCol < row.length) row.splice(resortFeeCol, 1);
      }
    }

    res.json({ headers: allHeaders, rows: allRows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── POST /download-payouts (CSV download, payout grouping + hardcoded equivalences) ───

router.post("/download-payouts", authMiddleware, upload.array("files", 4), async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const equivalenceMap = await buildEquivalenceMap();

    const allHeaders: string[] = [];
    const allRows: string[][] = [];
    let resortFeeCol = -1;

    for (const file of files) {
      const content = file.buffer.toString("utf-8");
      const lines = content.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) continue;

      const headerLine = lines[0];
      const tabs = (headerLine.match(/\t/g) || []).length;
      const commas = (headerLine.match(/,/g) || []).length;
      const delim = tabs > commas ? "\t" : ",";

      const headers = parseLine(headerLine, delim);

      const colTipo = headers.findIndex((h) => h.trim().toLowerCase() === "tipo");
      const colAnuncio = headers.findIndex((h) => h.trim().toLowerCase() === "anuncio");
      const colMonto = headers.findIndex((h) => h.trim().toLowerCase() === "monto");
      const colTotalPagado = headers.findIndex((h) => h.trim().toLowerCase() === "total pagado");
      const colResort = headers.findIndex((h) => /tarifa.*(complejo|comunidad)|(complejo|comunitat|resort).*(tarifa|fee)|resort fee/i.test(h.trim()));

      if (colTipo < 0 || colAnuncio < 0) continue;

      if (resortFeeCol < 0) resortFeeCol = colResort;

      let payoutActual: string[] | null = null;
      let reservasDelPayout: string[][] = [];

      const cerrarPayout = () => {
        if (!payoutActual) return;

        const reservasValidas = reservasDelPayout.filter((row) => {
          const anuncio = (row[colAnuncio] || "").trim();
          return equivalenceMap.has(anuncio);
        });

        if (reservasValidas.length === 0) {
          payoutActual = null;
          reservasDelPayout = [];
          return;
        }

        const total = reservasValidas.reduce((sum, r) => {
          const val = parseFloat((r[colMonto >= 0 ? colMonto : 0] || "").replace(",", "."));
          return sum + (isNaN(val) ? 0 : val);
        }, 0);

        const payoutRow = [...payoutActual];
        if (colMonto >= 0) payoutRow[colMonto] = "";
        if (colTotalPagado >= 0) payoutRow[colTotalPagado] = total.toFixed(2);

        if (allHeaders.length === 0) allHeaders.push(...headers);

        allRows.push(payoutRow);
        allRows.push(...reservasValidas);

        payoutActual = null;
        reservasDelPayout = [];
      };

      for (const line of lines.slice(1)) {
        const row = parseLine(line, delim);
        while (row.length < 20) row.push("");

        const tipo = (row[colTipo] || "").trim().toLowerCase();
        if (tipo === "payout") {
          cerrarPayout();
          payoutActual = row;
          reservasDelPayout = [];
        } else {
          if (payoutActual) reservasDelPayout.push(row);
        }
      }
      cerrarPayout();
    }

    if (allRows.length === 0) {
      res.status(400).json({ error: "No matching reservations found in any file" });
      return;
    }

    // Remove "Tarifa del complejo turístico" column from all rows
    if (resortFeeCol >= 0) {
      allHeaders.splice(resortFeeCol, 1);
      for (const row of allRows) {
        if (resortFeeCol < row.length) row.splice(resortFeeCol, 1);
      }
    }

    // Build CSV with BOM
    const outDelim = allHeaders.some((h) => h.includes(",")) ? "\t" : ",";
    const csvLines = [allHeaders.join(outDelim), ...allRows.map((r) => r.join(outDelim))];
    const bom = "\uFEFF";
    const buffer = Buffer.from(bom + csvLines.join("\n"), "utf-8");

    res.setHeader("Content-Type", "text/csv;charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"reservas_filtradas.csv\"");
    res.send(buffer);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ─── Excel generation with formulas ───

const EXCEL_HEADERS = [
  "Guest", "Platform", "Check-in", "Check-out", "Nights",
  "Price per Night", "Total", "Cleaning Fee", "Guest Insurance",
  "Resort Fee", "Host Fee", "Comision Stripe", "Income Tax",
  "Total Payout", "Net Income",
];

async function buildExcelReport(result: {
  properties: Record<string, { propertyId: string; reservations: any[]; totals: any }>;
  summary: { month: string };
}): Promise<Buffer> {
  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();

  for (const [propertyId, group] of Object.entries(result.properties)) {
    const safeName = propertyId.replace(/[\/\\*\?\[\]:]/g, "_");
    const sheetName = `${safeName}_${result.summary.month.replace(/\s+/g, "_")}`;
    const sheet = workbook.addWorksheet(sheetName.substring(0, 31));

    const headerRow = sheet.addRow(EXCEL_HEADERS);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0097A7" } };
    headerRow.height = 22;

    for (const res of group.reservations) {
      const rowNum = sheet.rowCount + 1;
      const row = sheet.addRow([
        res.guest,
        res.platform,
        res.checkIn,
        res.checkOut,
        res.nights,
        null,
        res.total,
        res.cleaningFee,
        res.guestInsurance,
        res.resortFee,
        res.hostFee,
        res.comisionStripe,
        res.incomeTax,
        null,
        null,
      ]);

      const pricePerNightCell = sheet.getCell(`F${rowNum}`);
      pricePerNightCell.value = { formula: `G${rowNum}/E${rowNum}` };
      pricePerNightCell.numFmt = '#,##0.00';

      const totalPayoutCell = sheet.getCell(`N${rowNum}`);
      totalPayoutCell.value = { formula: `G${rowNum}+H${rowNum}+I${rowNum}+J${rowNum}-K${rowNum}-L${rowNum}+M${rowNum}` };
      totalPayoutCell.numFmt = '#,##0.00';

      const netIncomeCell = sheet.getCell(`O${rowNum}`);
      netIncomeCell.value = { formula: `N${rowNum}-H${rowNum}-I${rowNum}-J${rowNum}` };
      netIncomeCell.numFmt = '#,##0.00';

      const dataCells = [row.getCell(6), row.getCell(7), row.getCell(8), row.getCell(9), row.getCell(10),
        row.getCell(11), row.getCell(12), row.getCell(13), row.getCell(14), row.getCell(15)];
      for (const cell of dataCells) {
        if (cell.numFmt === 'General' || !cell.numFmt) {
          cell.numFmt = '#,##0.00';
        }
      }
    }

    const totalRowNum = sheet.rowCount + 1;
    const totalRow = sheet.addRow([
      "TOTAL", "", "", "",
      group.totals.totalNights, "",
      group.totals.totalRevenue,
      "", "", "", "", "", "",
      group.totals.totalPayout,
      group.totals.totalNetIncome,
    ]);
    totalRow.font = { bold: true, size: 11 };
    totalRow.eachCell((cell: any) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
      if (typeof cell.value === "number") {
        cell.numFmt = '#,##0.00';
      }
    });

    sheet.columns.forEach((column: any, i: number) => {
      const allValues = [EXCEL_HEADERS[i], ...group.reservations.map((r: any) => {
        const map: Record<number, string> = { 0: r.guest, 1: r.platform, 2: r.checkIn, 3: r.checkOut,
          4: String(r.nights), 5: String(r.pricePerNight), 6: String(r.total),
          7: String(r.cleaningFee), 8: String(r.guestInsurance), 9: String(r.resortFee),
          10: String(r.hostFee), 11: String(r.comisionStripe), 12: String(r.incomeTax),
          13: String(r.totalPayout), 14: String(r.netIncome) };
        return map[i] || "";
      })];
      const maxLen = Math.max(...allValues.map((v: string) => (v || "").length));
      column.width = Math.min(Math.max(maxLen + 3, 12), 45);
    });

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: group.reservations.length + 1, column: EXCEL_HEADERS.length },
    };
  }

  return workbook.xlsx.writeBuffer() as Promise<Buffer>;
}

export default router;
