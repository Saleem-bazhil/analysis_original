import type { FlexRow, CallPlanRow, ClassifiedRow, ProcessingResult } from './types';

// ── Phone number cleanup ──
export function cleanPhone(raw: unknown): string {
  let s = String(raw ?? '').trim();
  s = s.replace(/\.0$/, '');
  s = s.replace(/\D/g, '');
  if (s.length === 12 && s.startsWith('91')) s = s.slice(2);
  return s;
}

// ── Flex Create Time → Date ──
export function parseFlexDate(raw: string): Date | null {
  if (!raw) return null;
  try {
    const cleaned = raw.replace(' UTC', '');
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// ── Segment mapping ──
export function mapSegment(otcCode: string, bizSegment: string): string {
  const otc = (otcCode ?? '').toLowerCase();
  if (otc.includes('trade')) return 'Trade';
  if (otc.includes('install') || otc.includes('05f')) return 'Install';
  const seg = (bizSegment ?? '').toLowerCase();
  if (seg === 'computing') return 'Pc';
  if (seg === 'printing') return 'print';
  return bizSegment || '';
}

// ── WIP Aging calculation for NEW rows ──
export function calcAging(createTime: string, reportDate: Date): number {
  const created = parseFlexDate(createTime);
  if (!created) return 0;
  const diff = reportDate.getTime() - created.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// ── WO ID validation ──
const WO_PATTERN = /^WO-\d{9}$/;
export function isValidWO(id: string): boolean {
  return WO_PATTERN.test((id ?? '').trim());
}

// ── Normalize raw flex data into typed rows ──
// Handles BOTH CSV format (with "Customer Phone No", "Create Time")
// AND XLSX format (with "WIP Aging", "Customer Address " trailing space, no phone)
export function normalizeFlexRow(raw: Record<string, unknown>): FlexRow {
  // Phone: try "Customer Phone No" (CSV), fall back to nothing (XLSX doesn't have it)
  const phone = String(raw['Customer Phone No'] ?? '').trim();

  // Address: try "Customer Address" then "Customer Address " (trailing space in XLSX)
  const address = String(
    raw['Customer Address'] ?? raw['Customer Address '] ?? ''
  ).trim();

  // WIP Aging: some XLSX sources have this pre-calculated
  const wipAgingRaw = parseInt(String(raw['WIP Aging'] ?? '0'), 10) || 0;

  return {
    ticketNo: String(raw['Ticket No'] ?? '').trim(),
    caseId: String(raw['Case Id'] ?? '').trim(),
    productName: String(raw['Product Name'] ?? '').trim(),
    createTime: String(raw['Create Time'] ?? '').trim(),
    aspCity: String(raw['ASP City'] ?? '').trim(),
    workLocation: String(raw['Work Location'] ?? '').trim(),
    woOtcCode: String(raw['WO OTC Code'] ?? '').trim(),
    businessSegment: String(raw['Business Segment'] ?? '').trim(),
    status: String(raw['Status'] ?? '').trim(),
    customerPhoneNo: phone,
    customerCity: String(raw['Customer City'] ?? '').trim(),
    customerAddress: address,
    bookingResource: String(raw['Booking Resource'] ?? '').trim(),
    wipAgingRaw,
  };
}

// ── Normalize yesterday's call plan row ──
export function normalizeCallPlanRow(raw: Record<string, unknown>): CallPlanRow {
  const monthVal = raw['Month'];
  let monthStr = '';
  if (monthVal instanceof Date) {
    monthStr = monthVal.toLocaleDateString('en-GB');
  } else if (monthVal != null && String(monthVal).trim() !== '' && String(monthVal) !== 'NaT') {
    monthStr = String(monthVal).trim();
  }

  return {
    month: monthStr,
    ticketNo: String(raw['Ticket No'] ?? '').trim(),
    caseId: String(raw['Case Id'] ?? '').trim(),
    product: String(raw['Product'] ?? '').trim(),
    wipAging: parseInt(String(raw['WIP Aging'] ?? '0'), 10) || 0,
    location: String(raw['Location'] ?? '').trim(),
    segment: String(raw['Segment'] ?? '').trim(),
    morningStatus: String(raw['Morning Status'] ?? '').trim(),
    eveningStatus: String(raw['Evening Status'] ?? '').trim(),
    currentStatusTAT: String(raw['Current Status-TAT'] ?? '').trim(),
    engg: String(raw['Engg.'] ?? '').trim(),
    contactNo: String(raw['Contact no.'] ?? '').trim(),
    parts: String(raw['Parts'] ?? '').trim(),
  };
}

// ── Detect if input is XLSX-format Flex (has WIP Aging column but no Create Time) ──
function detectFlexFormat(flexRaw: Record<string, unknown>[]): 'csv' | 'xlsx' {
  if (flexRaw.length === 0) return 'csv';
  const sample = flexRaw[0];
  const hasCreateTime = 'Create Time' in sample &&
    String(sample['Create Time'] ?? '').trim().length > 0;
  const hasWipAging = 'WIP Aging' in sample;
  // XLSX format: has pre-computed WIP Aging but no Create Time string
  if (hasWipAging && !hasCreateTime) return 'xlsx';
  return 'csv';
}

// ── Main comparison engine ──
export function processCallPlan(
  flexRaw: Record<string, unknown>[],
  yesterdayRaw: Record<string, unknown>[],
  city: string,
  reportDate: Date
): ProcessingResult {
  const format = detectFlexFormat(flexRaw);

  // STEP 1: Filter & deduplicate Flex
  const flexMap = new Map<string, FlexRow>();
  let flexTotal = 0;
  for (const raw of flexRaw) {
    flexTotal++;
    const row = normalizeFlexRow(raw);
    if (!isValidWO(row.ticketNo)) continue;
    if (row.aspCity.toLowerCase() !== city.toLowerCase()) continue;
    flexMap.set(row.ticketNo, row); // last occurrence wins
  }

  // STEP 2: Load yesterday's Open Call
  const rtplMap = new Map<string, CallPlanRow>();
  for (const raw of yesterdayRaw) {
    const row = normalizeCallPlanRow(raw);
    if (!isValidWO(row.ticketNo)) continue;
    rtplMap.set(row.ticketNo, row);
  }

  // STEP 3 & 4: Classify and build output
  const pending: ClassifiedRow[] = [];
  const newRows: ClassifiedRow[] = [];
  const dropped: ClassifiedRow[] = [];

  // Check each Flex WO
  for (const [ticketNo, flexRow] of flexMap) {
    const yesterday = rtplMap.get(ticketNo);
    if (yesterday) {
      // PENDING: carry from yesterday, aging +1, clear evening status
      pending.push({
        ...yesterday,
        wipAging: yesterday.wipAging + 1,
        eveningStatus: '',
        classification: 'PENDING',
      });
    } else {
      // NEW: populate from Flex
      // WIP Aging: use pre-calculated from XLSX if available, otherwise calc from Create Time
      let aging: number;
      if (format === 'xlsx' && flexRow.wipAgingRaw > 0) {
        aging = flexRow.wipAgingRaw;
      } else {
        aging = calcAging(flexRow.createTime, reportDate);
      }

      // Location: use Customer City (operator refines to area later in the app)
      const location = flexRow.customerCity;

      // Current Status-TAT: leave BLANK for new rows
      // (verified against real data — expected output has blank TAT for new entries,
      //  because the operator fills it manually during triage)
      const currentStatusTAT = '';

      // Contact: use phone from CSV, or blank if XLSX (operator fills in app)
      const contactNo = cleanPhone(flexRow.customerPhoneNo);

      newRows.push({
        month: '',
        ticketNo: flexRow.ticketNo,
        caseId: flexRow.caseId,
        product: flexRow.productName,
        wipAging: aging,
        location,
        segment: mapSegment(flexRow.woOtcCode, flexRow.businessSegment),
        morningStatus: '',
        eveningStatus: '',
        currentStatusTAT,
        engg: '',
        contactNo,
        parts: '',
        classification: 'NEW',
      });
    }
  }

  // Check yesterday's WOs not in Flex → DROPPED
  for (const [ticketNo, row] of rtplMap) {
    if (!flexMap.has(ticketNo)) {
      dropped.push({ ...row, classification: 'DROPPED' });
    }
  }

  // STEP 5: Sort — WIP Aging descending within each section
  // When aging is equal, maintain insertion order (JS sort is stable)
  pending.sort((a, b) => b.wipAging - a.wipAging);
  newRows.sort((a, b) => b.wipAging - a.wipAging);
  dropped.sort((a, b) => b.wipAging - a.wipAging);

  const all = [...pending, ...newRows];

  return {
    pending,
    new: newRows,
    dropped,
    all,
    metrics: {
      flexTotal,
      flexFiltered: flexMap.size,
      yesterdayTotal: rtplMap.size,
      pendingCount: pending.length,
      newCount: newRows.length,
      droppedCount: dropped.length,
      finalCount: all.length,
    },
  };
}

// ── Build summary rows ──
export function buildSummaryRows(rows: ClassifiedRow[]): string[][] {
  const outputRows = rows.filter(r => r.classification !== 'DROPPED');
  let actionableCount = 0;
  const engCounts = new Map<string, number>();

  for (const row of outputRows) {
    if (row.morningStatus.toLowerCase() === 'actionable') actionableCount++;
    if (row.engg) {
      engCounts.set(row.engg, (engCounts.get(row.engg) ?? 0) + 1);
    }
  }

  const summaryLines: string[][] = [];
  // 4 empty rows
  for (let i = 0; i < 4; i++) summaryLines.push(new Array(13).fill(''));

  // Actionable count in Location column (index 5)
  const actionRow = new Array(13).fill('');
  actionRow[5] = `Actionable-${actionableCount}`;
  summaryLines.push(actionRow);

  // Engineer counts sorted descending
  const sorted = [...engCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [eng, count] of sorted) {
    const engRow = new Array(13).fill('');
    engRow[5] = `${eng}-${count}`;
    summaryLines.push(engRow);
  }

  return summaryLines;
}
