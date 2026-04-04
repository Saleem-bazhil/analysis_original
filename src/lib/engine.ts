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
    hpOwner: String(raw['HP Owner'] ?? '').trim(),
    flexStatus: String(raw['Status'] ?? '').trim(),
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
    hpOwner: String(raw['HP Owner'] ?? '').trim(),
    flexStatus: String(raw['Flex Status'] ?? raw['Status Category'] ?? raw['Status'] ?? '').trim(),
    wipChanged: String(raw['WIP Changed'] ?? '').trim(),
    morningStatus: String(raw['Morning Report'] ?? raw['Morning Status'] ?? '').trim(),
    eveningStatus: String(raw['Evening Report'] ?? raw['Evening Status'] ?? '').trim(),
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
      // PENDING: carry from yesterday, use WIP Aging from Flex WIP, clear evening status
      // Update HP Owner & Status Category from latest Flex, detect WIP change
      const wipChanged = (yesterday.flexStatus !== flexRow.flexStatus)
        ? 'Yes' : 'No';
      pending.push({
        ...yesterday,
        wipAging: flexRow.wipAgingRaw,
        eveningStatus: '',
        hpOwner: flexRow.hpOwner,
        flexStatus: flexRow.flexStatus,
        wipChanged,
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
        hpOwner: flexRow.hpOwner,
        flexStatus: flexRow.flexStatus,
        wipChanged: 'New',
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

  // STEP 6: Calculate advanced metrics
  let tradeCount = 0;
  let actionableCount = 0;
  let toScheduleCount = 0;
  let sscPendingCount = 0;
  let techSupportCount = 0;
  let toYankCount = 0;
  const enggSet = new Set<string>();

  for (const row of all) {
    if (row.segment.toLowerCase() === 'trade') tradeCount++;
    const ms = row.morningStatus.toLowerCase();
    if (ms === 'actionable') actionableCount++;
    if (ms === 'to be scheduled') toScheduleCount++;
    if (ms === 'ssc pending') sscPendingCount++;
    if (ms === 'elevate/tech support') techSupportCount++;
    if (ms === 'to be yank') toYankCount++;
    if (row.engg && row.engg.trim() !== '') enggSet.add(row.engg.trim());
  }

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
      tradeCount,
      actionableCount,
      toScheduleCount,
      sscPendingCount,
      techSupportCount,
      toYankCount,
      enggPresentCount: enggSet.size,
    },
  };
}

// ── Build summary table for Excel (matching the user's 18-metric image) ──
export function buildSummaryTable(rows: ClassifiedRow[], engineersCount: number): string[][] {
  const outputRows = rows.filter(r => r.classification !== 'DROPPED');
  
  // Calculate all 18 metrics (consistent with ReviewView logic)
  const enggPresentCount = new Set(outputRows.map(r => r.engg).filter(e => e && e.trim() !== '')).size;
  const openCallsCount = outputRows.length;
  const actionableCount = outputRows.filter(r => r.morningStatus.toLowerCase() === 'actionable').length;
  const plannedCallsCount = outputRows.filter(r => r.engg && r.engg.trim() !== '').length;
  const closedCount = outputRows.filter(r => r.morningStatus.toLowerCase() === 'closed').length;
  const enggOnsiteCount = outputRows.filter(r => r.morningStatus.toLowerCase() === 'engg onsite').length;
  const toScheduleCount = outputRows.filter(r => r.morningStatus.toLowerCase() === 'to be scheduled').length;
  const cxRescheduleCount = outputRows.filter(r => r.morningStatus.toLowerCase() === 'cx reschedule' || r.morningStatus.toLowerCase() === 'cx pending').length;
  const sscPendingCount = outputRows.filter(r => r.morningStatus.toLowerCase() === 'ssc pending').length;
  const techSupportCount = outputRows.filter(r => r.morningStatus.toLowerCase() === 'elevate/tech support').length;
  const observationCount = outputRows.filter(r => r.morningStatus.toLowerCase() === 'under observation').length;
  const toYankCount = outputRows.filter(r => r.morningStatus.toLowerCase() === 'to be yank').length;
  const closedCancelledCount = outputRows.filter(r => r.morningStatus.toLowerCase() === 'closed cancelled').length;
  const partOrderedCount = outputRows.filter(r => r.morningStatus.toLowerCase() === 'additional part').length;
  const toCancelCount = outputRows.filter(r => r.morningStatus.toLowerCase().includes('cancel') && r.morningStatus.toLowerCase() !== 'closed cancelled').length;
  const newCallsCount = outputRows.filter(r => r.classification === 'NEW').length;
  const tradeCount = outputRows.filter(r => r.segment.toLowerCase() === 'trade').length;

  const table: string[][] = [
    ['S.No', 'Description', 'Count'],
    ['1', 'Engineer Count', String(engineersCount)],
    ['2', 'No.of Engg Presents', String(enggPresentCount)],
    ['3', 'Open Calls', String(openCallsCount)],
    ['4', 'Actionable Calls', String(actionableCount)],
    ['5', 'Planned Calls', String(plannedCallsCount)],
    ['6', 'Closed Calls', String(closedCount > 0 ? closedCount : '')],
    ['7', 'Engg onsite', String(enggOnsiteCount > 0 ? enggOnsiteCount : '')],
    ['8', 'To be schedule', String(toScheduleCount)],
    ['9', 'CX Reschedule Calls', String(cxRescheduleCount > 0 ? cxRescheduleCount : '')],
    ['10', 'SSC Pending Calls', String(sscPendingCount)],
    ['11', 'Elevate/Tech Support Calls', String(techSupportCount)],
    ['12', 'Under observation Calls', String(observationCount > 0 ? observationCount : '')],
    ['13', 'To be Yank', String(toYankCount)],
    ['14', 'Closed cancelled', String(closedCancelledCount > 0 ? closedCancelledCount : '')],
    ['15', 'Add.Part ordered', String(partOrderedCount > 0 ? partOrderedCount : '')],
    ['16', 'To be Cancel', String(toCancelCount)],
    ['17', 'New calls', String(newCallsCount > 0 ? newCallsCount : '')],
    ['18', 'Trade Open Calls', String(tradeCount)],
  ];

  return table;
}

// ── Build engineer breakdown for Excel ──
export function buildEngineerBreakdown(rows: ClassifiedRow[]): string[][] {
  const outputRows = rows.filter(r => r.classification !== 'DROPPED');
  const engCounts = new Map<string, number>();

  for (const row of outputRows) {
    if (row.engg) {
      engCounts.set(row.engg.trim(), (engCounts.get(row.engg.trim()) ?? 0) + 1);
    }
  }

  const sorted = [...engCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return [];

  const result: string[][] = [['Engineer', 'Allocated Calls']];
  for (const [eng, count] of sorted) {
    result.push([eng, String(count)]);
  }

  return result;
}
