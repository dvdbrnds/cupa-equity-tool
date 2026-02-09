/**
 * PC Report Generator
 * Generates a PDF report for President's Cabinet equity review.
 *
 * Uses pdfmake 0.3.x server-side API (js/Printer – default export).
 * createPdfKitDocument returns a Promise<PDFDocument>.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { dbAll, dbGet } from '../db/init.js';
import { getEquitySummary, getEquitySummaryByVp } from './equity-calculator.js';

// pdfmake is CJS-only; use createRequire to load it from ESM
const require = createRequire(import.meta.url);
const PdfPrinter = require('pdfmake/js/Printer').default;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve font paths (pdfmake ships Roboto in fonts/Roboto/)
const fontsRoot = path.resolve(__dirname, '../../../../node_modules/pdfmake/fonts/Roboto');
const fonts = {
  Roboto: {
    normal: path.join(fontsRoot, 'Roboto-Regular.ttf'),
    bold: path.join(fontsRoot, 'Roboto-Medium.ttf'),
    italics: path.join(fontsRoot, 'Roboto-Italic.ttf'),
    bolditalics: path.join(fontsRoot, 'Roboto-MediumItalic.ttf'),
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtPct(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(decimals)}%`;
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Table helper: header cell
function hdr(text: string): Record<string, unknown> {
  return { text, bold: true, fontSize: 8, fillColor: '#2563EB', color: '#FFFFFF', margin: [4, 4, 4, 4] };
}

// Table helper: data cell
function cell(text: string | number, opts: Record<string, unknown> = {}): Record<string, unknown> {
  return { text: String(text), fontSize: 8, margin: [4, 3, 4, 3], ...opts };
}

// Table helper: currency cell (right aligned)
function curr(value: number | null | undefined, opts: Record<string, unknown> = {}): Record<string, unknown> {
  return cell(fmt(value), { alignment: 'right', ...opts });
}

// Table helper: totals row
function totalCell(text: string | number, opts: Record<string, unknown> = {}): Record<string, unknown> {
  return { text: String(text), bold: true, fontSize: 8, fillColor: '#F1F5F9', margin: [4, 4, 4, 4], ...opts };
}

// ─── Data Interfaces ─────────────────────────────────────────────────────────

interface CycleData {
  id: number;
  name: string;
  fiscal_year: string;
  total_budget: number | null;
  status: string;
  cupa_data_year: string | null;
  deadline: string | null;
  created_at: string;
  notes: string | null;
  pc_submitted_at: string | null;
}

interface VpStatus {
  vp_stem: string;
  status: string;
  allocated_budget: number | null;
  proposed_total: number | null;
  employee_count: number | null;
  vp_supplemental_offer: number | null;
  supplemental_offer_notes: string | null;
  notes: string | null;
  reviewed_at: string | null;
}

interface PositionRow {
  employee_name: string;
  institutional_title: string;
  department: string;
  vp_stem: string;
  current_salary: number | null;
  fte: number;
  appointment_months: number;
  compensation_type: string;
  has_housing_benefit: number;
  cupa_code: string | null;
  base_median: number | null;
  adjusted_median: number | null;
  total_compensation: number | null;
  equity_gap: number | null;
  gap_percentage: number | null;
  proposed_raise: number | null;
}

interface FeedbackSummary {
  vp_stem: string;
  feedback_type: string;
  cnt: number;
}

// ─── Main Generator ──────────────────────────────────────────────────────────

export async function generatePcReport(cycleId: number): Promise<Buffer> {
  // ── Gather data ────────────────────────────────────────────────────────────
  const cycle = dbGet<CycleData>('SELECT * FROM equity_review_cycles WHERE id = ?', [cycleId]);
  if (!cycle) throw new Error('Review cycle not found');

  const vpStatuses = dbAll<VpStatus>(
    'SELECT * FROM vp_review_status WHERE cycle_id = ? ORDER BY allocated_budget DESC', [cycleId],
  );

  const positions = dbAll<PositionRow>(`
    SELECT pm.employee_name, pm.institutional_title, pm.department, pm.vp_stem,
           pm.current_salary, pm.fte, pm.appointment_months, pm.compensation_type,
           pm.has_housing_benefit, pm.cupa_code,
           ea.base_median, ea.adjusted_median, ea.total_compensation,
           ea.equity_gap, ea.gap_percentage, COALESCE(ea.proposed_raise, 0) as proposed_raise
    FROM position_mappings pm
    LEFT JOIN equity_analysis ea ON pm.id = ea.position_mapping_id
    ORDER BY pm.vp_stem, ea.equity_gap DESC
  `);

  const feedbackRows = dbAll<FeedbackSummary>(`
    SELECT pm.vp_stem, ef.feedback_type, COUNT(*) as cnt
    FROM employee_feedback ef
    JOIN position_mappings pm ON ef.position_mapping_id = pm.id
    WHERE ef.cycle_id = ?
    GROUP BY pm.vp_stem, ef.feedback_type
  `, [cycleId]);

  const overallSummary = getEquitySummary();
  const vpSummary = getEquitySummaryByVp();

  // ── Compute aggregates ─────────────────────────────────────────────────────
  const totalProposed = vpStatuses.reduce((s, v) => s + (v.proposed_total || 0), 0);
  const totalSupplemental = vpStatuses.reduce((s, v) => s + (v.vp_supplemental_offer || 0), 0);
  const totalEmployees = vpStatuses.reduce((s, v) => s + (v.employee_count || 0), 0);
  const coveragePct = overallSummary.totalGap > 0
    ? ((totalProposed / overallSummary.totalGap) * 100)
    : 0;
  const budgetCoveragePct = (cycle.total_budget || 0) > 0 && overallSummary.totalGap > 0
    ? (((cycle.total_budget || 0) / overallSummary.totalGap) * 100)
    : 0;

  // Group positions by VP
  const positionsByVp = new Map<string, PositionRow[]>();
  for (const p of positions) {
    if (!positionsByVp.has(p.vp_stem)) positionsByVp.set(p.vp_stem, []);
    positionsByVp.get(p.vp_stem)!.push(p);
  }

  // Group feedback by VP
  const feedbackByVp = new Map<string, Map<string, number>>();
  for (const f of feedbackRows) {
    if (!feedbackByVp.has(f.vp_stem)) feedbackByVp.set(f.vp_stem, new Map());
    feedbackByVp.get(f.vp_stem)!.set(f.feedback_type, f.cnt);
  }

  // Comp type breakdown
  const salariedPositions = positions.filter(p => p.compensation_type === 'salaried');
  const hourlyPositions = positions.filter(p => p.compensation_type === 'hourly');
  const partTimePositions = positions.filter(p => p.fte < 1);

  const salariedGap = salariedPositions.reduce((s, p) => s + Math.max(0, p.equity_gap || 0), 0);
  const hourlyGap = hourlyPositions.reduce((s, p) => s + Math.max(0, p.equity_gap || 0), 0);
  const salariedRaises = salariedPositions.reduce((s, p) => s + (p.proposed_raise || 0), 0);
  const hourlyRaises = hourlyPositions.reduce((s, p) => s + (p.proposed_raise || 0), 0);
  const salariedUnderpaid = salariedPositions.filter(p => (p.equity_gap || 0) > 0).length;
  const hourlyUnderpaid = hourlyPositions.filter(p => (p.equity_gap || 0) > 0).length;

  // ── Build document ─────────────────────────────────────────────────────────
  const content: unknown[] = [];

  // ── PAGE 1: Executive Summary ──────────────────────────────────────────────
  content.push(
    { text: 'EQUITY ADJUSTMENT PLAN', fontSize: 24, bold: true, color: '#1E3A5F', margin: [0, 0, 0, 4] },
    { text: `Fiscal Year ${cycle.fiscal_year}`, fontSize: 16, color: '#475569', margin: [0, 0, 0, 2] },
    { text: cycle.name, fontSize: 12, color: '#64748B', margin: [0, 0, 0, 16] },
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: '#2563EB' }],
      margin: [0, 0, 0, 16],
    },
  );

  // Prepared info
  content.push({
    columns: [
      { text: [{ text: 'Date Prepared: ', bold: true }, fmtDate(cycle.pc_submitted_at || new Date().toISOString())], fontSize: 9, width: 'auto' },
      { text: [{ text: 'CUPA Data Year: ', bold: true }, cycle.cupa_data_year || '-'], fontSize: 9, width: 'auto' },
    ],
    columnGap: 30,
    margin: [0, 0, 0, 20],
  });

  // Executive Summary narrative
  content.push(
    { text: 'EXECUTIVE SUMMARY', fontSize: 14, bold: true, color: '#1E3A5F', margin: [0, 0, 0, 8] },
    {
      text: `This plan proposes ${fmt(totalProposed)} in equity adjustments across ${totalEmployees} positions in ${vpStatuses.length} VP divisions. ` +
        `The total institutional equity gap is ${fmt(overallSummary.totalGap)} across ${overallSummary.positionsWithGap} underpaid positions ` +
        `out of ${overallSummary.totalPositions} total. ` +
        `The HR-allocated budget of ${fmt(cycle.total_budget)} covers ${fmtPct(budgetCoveragePct)} of the total gap. ` +
        (totalSupplemental > 0
          ? `VP divisions have offered an additional ${fmt(totalSupplemental)} in supplemental departmental funding. `
          : '') +
        `The proposed raises close ${fmtPct(coveragePct)} of the total equity gap.`,
      fontSize: 10,
      lineHeight: 1.4,
      margin: [0, 0, 0, 16],
    },
  );

  // Key metrics table
  content.push({
    table: {
      widths: ['*', '*', '*'],
      body: [
        [
          { text: 'Total Budget', fontSize: 8, color: '#64748B', border: [false, false, false, false] },
          { text: 'Total Equity Gap', fontSize: 8, color: '#64748B', border: [false, false, false, false] },
          { text: 'Total Proposed Raises', fontSize: 8, color: '#64748B', border: [false, false, false, false] },
        ],
        [
          { text: fmt(cycle.total_budget), fontSize: 16, bold: true, color: '#2563EB', border: [false, false, false, false] },
          { text: fmt(overallSummary.totalGap), fontSize: 16, bold: true, color: '#DC2626', border: [false, false, false, false] },
          { text: fmt(totalProposed), fontSize: 16, bold: true, color: '#16A34A', border: [false, false, false, false] },
        ],
        [
          { text: 'Budget Coverage', fontSize: 8, color: '#64748B', border: [false, false, false, false] },
          { text: 'Employees Affected', fontSize: 8, color: '#64748B', border: [false, false, false, false] },
          { text: 'VP Supplemental Funding', fontSize: 8, color: '#64748B', border: [false, false, false, false] },
        ],
        [
          { text: fmtPct(budgetCoveragePct), fontSize: 16, bold: true, border: [false, false, false, false] },
          { text: String(totalEmployees), fontSize: 16, bold: true, border: [false, false, false, false] },
          { text: totalSupplemental > 0 ? fmt(totalSupplemental) : 'None', fontSize: 16, bold: true, color: totalSupplemental > 0 ? '#7C3AED' : '#64748B', border: [false, false, false, false] },
        ],
      ],
    },
    layout: {
      fillColor: (rowIndex: number) => rowIndex % 2 === 0 ? '#F8FAFC' : null,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 12,
      paddingRight: () => 12,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 8],
  });

  // Additional stats row
  content.push({
    columns: [
      { text: [{ text: 'Average Gap: ', bold: true, fontSize: 9 }, { text: fmt(overallSummary.averageGap), fontSize: 9 }], width: 'auto' },
      { text: [{ text: 'Median Gap: ', bold: true, fontSize: 9 }, { text: fmt(overallSummary.medianGap), fontSize: 9 }], width: 'auto' },
      { text: [{ text: 'Positions with Gap: ', bold: true, fontSize: 9 }, { text: `${overallSummary.positionsWithGap} / ${overallSummary.totalPositions}`, fontSize: 9 }], width: 'auto' },
      { text: [{ text: 'VP Divisions: ', bold: true, fontSize: 9 }, { text: String(vpStatuses.length), fontSize: 9 }], width: 'auto' },
    ],
    columnGap: 20,
    margin: [0, 0, 0, 0],
  });

  // ── PAGE 2: Budget Allocation by VP Division ───────────────────────────────
  content.push(
    { text: '', pageBreak: 'after' },
    { text: 'BUDGET ALLOCATION BY VP DIVISION', fontSize: 14, bold: true, color: '#1E3A5F', margin: [0, 0, 0, 12] },
    {
      text: 'The budget is allocated proportionally based on each division\'s total equity gap. Divisions with larger gaps receive a larger share.',
      fontSize: 9,
      color: '#64748B',
      italics: true,
      margin: [0, 0, 0, 12],
    },
  );

  // VP allocation table
  const vpTableBody: unknown[][] = [
    [
      hdr('VP Division'),
      hdr('Positions'),
      hdr('Underpaid'),
      hdr('Total Gap'),
      hdr('HR Alloc.'),
      hdr('VP Suppl.'),
      hdr('Proposed'),
      hdr('Remaining'),
    ],
  ];

  let grandTotalGap = 0;
  let grandTotalAlloc = 0;
  let grandTotalSupp = 0;
  let grandTotalProposed = 0;
  let grandTotalRemaining = 0;
  let grandTotalPositions = 0;
  let grandTotalUnderpaid = 0;

  for (const vp of vpStatuses) {
    const summary = vpSummary.find(v => v.vpStem === vp.vp_stem);
    const vpPositions = positionsByVp.get(vp.vp_stem) || [];
    const vpProposed = vpPositions.reduce((s, p) => s + (p.proposed_raise || 0), 0);
    const vpGap = summary?.totalGap || 0;
    const remaining = Math.max(0, vpGap) - vpProposed;

    grandTotalGap += Math.max(0, vpGap);
    grandTotalAlloc += vp.allocated_budget || 0;
    grandTotalSupp += vp.vp_supplemental_offer || 0;
    grandTotalProposed += vpProposed;
    grandTotalRemaining += Math.max(0, remaining);
    grandTotalPositions += summary?.positionCount || 0;
    grandTotalUnderpaid += summary?.underpaidCount || 0;

    vpTableBody.push([
      cell(vp.vp_stem),
      cell(String(summary?.positionCount || 0), { alignment: 'right' }),
      cell(String(summary?.underpaidCount || 0), { alignment: 'right', color: (summary?.underpaidCount || 0) > 0 ? '#DC2626' : undefined }),
      curr(Math.max(0, vpGap), { color: vpGap > 0 ? '#DC2626' : '#16A34A' }),
      curr(vp.allocated_budget),
      curr(vp.vp_supplemental_offer, { color: (vp.vp_supplemental_offer || 0) > 0 ? '#7C3AED' : undefined }),
      curr(vpProposed, { color: '#16A34A' }),
      curr(remaining > 0 ? remaining : 0, { color: remaining > 0 ? '#DC2626' : '#16A34A' }),
    ]);
  }

  // Totals row
  vpTableBody.push([
    totalCell('TOTALS'),
    totalCell(String(grandTotalPositions), { alignment: 'right' }),
    totalCell(String(grandTotalUnderpaid), { alignment: 'right' }),
    totalCell(fmt(grandTotalGap), { alignment: 'right' }),
    totalCell(fmt(grandTotalAlloc), { alignment: 'right' }),
    totalCell(fmt(grandTotalSupp), { alignment: 'right' }),
    totalCell(fmt(grandTotalProposed), { alignment: 'right', color: '#16A34A' }),
    totalCell(fmt(grandTotalRemaining), { alignment: 'right' }),
  ]);

  content.push({
    table: {
      headerRows: 1,
      widths: ['*', 45, 45, 55, 55, 55, 55, 55],
      body: vpTableBody,
    },
    layout: {
      fillColor: (rowIndex: number) => rowIndex === 0 ? null : rowIndex % 2 === 0 ? '#F8FAFC' : null,
      hLineColor: () => '#E2E8F0',
      vLineColor: () => '#E2E8F0',
      hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
      vLineWidth: () => 0.5,
    },
    margin: [0, 0, 0, 16],
  });

  // Supplemental funding notes
  const vpsWithSupplemental = vpStatuses.filter(v => (v.vp_supplemental_offer || 0) > 0);
  if (vpsWithSupplemental.length > 0) {
    content.push(
      { text: 'VP Supplemental Funding Details', fontSize: 11, bold: true, color: '#7C3AED', margin: [0, 0, 0, 6] },
    );
    for (const vp of vpsWithSupplemental) {
      content.push({
        columns: [
          { text: `${vp.vp_stem}:`, bold: true, fontSize: 9, width: 100 },
          { text: `${fmt(vp.vp_supplemental_offer)} — ${vp.supplemental_offer_notes || 'No notes provided'}`, fontSize: 9, width: '*' },
        ],
        margin: [8, 0, 0, 4],
      });
    }
    content.push({ text: '', margin: [0, 0, 0, 8] });
  }

  // ── PAGES 3+: VP Division Detail ──────────────────────────────────────────
  for (const vp of vpStatuses) {
    const summary = vpSummary.find(v => v.vpStem === vp.vp_stem);
    const vpPositions = positionsByVp.get(vp.vp_stem) || [];
    const feedback = feedbackByVp.get(vp.vp_stem);
    const vpProposed = vpPositions.reduce((s, p) => s + (p.proposed_raise || 0), 0);

    content.push(
      { text: '', pageBreak: 'after' },
      { text: `${vp.vp_stem} Division`, fontSize: 14, bold: true, color: '#1E3A5F', margin: [0, 0, 0, 8] },
    );

    // Division summary row
    content.push({
      columns: [
        { text: [{ text: 'Positions: ', bold: true }, String(summary?.positionCount || 0)], fontSize: 9, width: 'auto' },
        { text: [{ text: 'Underpaid: ', bold: true }, String(summary?.underpaidCount || 0)], fontSize: 9, width: 'auto' },
        { text: [{ text: 'HR Allocation: ', bold: true }, fmt(vp.allocated_budget)], fontSize: 9, width: 'auto' },
        { text: [{ text: 'Proposed: ', bold: true }, fmt(vpProposed)], fontSize: 9, color: '#16A34A', width: 'auto' },
        { text: [{ text: 'Status: ', bold: true }, vp.status], fontSize: 9, width: 'auto' },
      ],
      columnGap: 16,
      margin: [0, 0, 0, 6],
    });

    // Supplemental note
    if ((vp.vp_supplemental_offer || 0) > 0) {
      content.push({
        text: [
          { text: 'VP Additional Funding: ', bold: true, color: '#7C3AED' },
          { text: `${fmt(vp.vp_supplemental_offer)} — ${vp.supplemental_offer_notes || 'No notes'}` },
        ],
        fontSize: 9,
        margin: [0, 0, 0, 6],
      });
    }

    // Feedback summary
    if (feedback && feedback.size > 0) {
      const feedbackParts: string[] = [];
      const types = ['approve', 'increase', 'decrease', 'defer', 'discuss'];
      const labels: Record<string, string> = { approve: 'Approve', increase: 'Increase', decrease: 'Decrease', defer: 'Defer', discuss: 'Discuss' };
      for (const t of types) {
        const c = feedback.get(t);
        if (c) feedbackParts.push(`${labels[t]}: ${c}`);
      }
      if (feedbackParts.length > 0) {
        content.push({
          text: [{ text: 'VP Feedback: ', bold: true }, feedbackParts.join('  |  ')],
          fontSize: 9,
          color: '#475569',
          margin: [0, 0, 0, 8],
        });
      }
    }

    // Position detail table
    if (vpPositions.length > 0) {
      const posBody: unknown[][] = [
        [
          hdr('Employee'),
          hdr('Title'),
          hdr('Current'),
          hdr('Median'),
          hdr('Gap'),
          hdr('Raise'),
          hdr('New Salary'),
          hdr('Remaining'),
        ],
      ];

      let vpTotalCurrent = 0;
      let vpTotalGap = 0;
      let vpTotalRaise = 0;

      for (const p of vpPositions) {
        const gap = p.equity_gap || 0;
        const raise = p.proposed_raise || 0;
        const newSalary = (p.current_salary || 0) + raise;
        const remaining = gap > 0 ? gap - raise : 0;

        vpTotalCurrent += p.current_salary || 0;
        vpTotalGap += Math.max(0, gap);
        vpTotalRaise += raise;

        posBody.push([
          cell(p.employee_name, { fontSize: 7 }),
          cell(p.institutional_title, { fontSize: 7 }),
          curr(p.current_salary, { fontSize: 7 }),
          curr(p.adjusted_median, { fontSize: 7 }),
          curr(gap > 0 ? gap : 0, { fontSize: 7, color: gap > 0 ? '#DC2626' : '#16A34A' }),
          curr(raise > 0 ? raise : null, { fontSize: 7, color: raise > 0 ? '#16A34A' : undefined }),
          curr(raise > 0 ? newSalary : null, { fontSize: 7 }),
          curr(remaining > 0 ? remaining : 0, { fontSize: 7, color: remaining > 0 ? '#DC2626' : '#16A34A' }),
        ]);
      }

      // Subtotals
      posBody.push([
        totalCell('Subtotals', { colSpan: 2 }),
        totalCell(''),
        totalCell(fmt(vpTotalCurrent), { alignment: 'right' }),
        totalCell(''),
        totalCell(fmt(vpTotalGap), { alignment: 'right', color: '#DC2626' }),
        totalCell(fmt(vpTotalRaise), { alignment: 'right', color: '#16A34A' }),
        totalCell(''),
        totalCell(fmt(Math.max(0, vpTotalGap - vpTotalRaise)), { alignment: 'right' }),
      ]);

      content.push({
        table: {
          headerRows: 1,
          widths: [85, '*', 50, 50, 50, 50, 50, 50],
          body: posBody,
        },
        layout: {
          fillColor: (rowIndex: number) => rowIndex === 0 ? null : rowIndex % 2 === 0 ? '#F8FAFC' : null,
          hLineColor: () => '#E2E8F0',
          vLineColor: () => '#E2E8F0',
          hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
          vLineWidth: () => 0.5,
        },
        margin: [0, 0, 0, 8],
      });
    }
  }

  // ── COMPENSATION TYPE BREAKDOWN ────────────────────────────────────────────
  content.push(
    { text: '', pageBreak: 'after' },
    { text: 'COMPENSATION TYPE BREAKDOWN', fontSize: 14, bold: true, color: '#1E3A5F', margin: [0, 0, 0, 12] },
  );

  // Salaried vs Hourly table
  content.push({
    table: {
      headerRows: 1,
      widths: ['*', 60, 60, 70, 70, 70],
      body: [
        [hdr('Type'), hdr('Positions'), hdr('Underpaid'), hdr('Total Gap'), hdr('Proposed'), hdr('Coverage')],
        [
          cell('Salaried'),
          cell(String(salariedPositions.length), { alignment: 'right' }),
          cell(String(salariedUnderpaid), { alignment: 'right' }),
          curr(salariedGap, { color: '#DC2626' }),
          curr(salariedRaises, { color: '#16A34A' }),
          cell(salariedGap > 0 ? fmtPct((salariedRaises / salariedGap) * 100) : 'N/A', { alignment: 'right' }),
        ],
        [
          cell('Hourly'),
          cell(String(hourlyPositions.length), { alignment: 'right' }),
          cell(String(hourlyUnderpaid), { alignment: 'right' }),
          curr(hourlyGap, { color: '#DC2626' }),
          curr(hourlyRaises, { color: '#16A34A' }),
          cell(hourlyGap > 0 ? fmtPct((hourlyRaises / hourlyGap) * 100) : 'N/A', { alignment: 'right' }),
        ],
        [
          totalCell('Total'),
          totalCell(String(positions.length), { alignment: 'right' }),
          totalCell(String(salariedUnderpaid + hourlyUnderpaid), { alignment: 'right' }),
          totalCell(fmt(salariedGap + hourlyGap), { alignment: 'right' }),
          totalCell(fmt(salariedRaises + hourlyRaises), { alignment: 'right' }),
          totalCell(overallSummary.totalGap > 0 ? fmtPct(coveragePct) : 'N/A', { alignment: 'right' }),
        ],
      ],
    },
    layout: {
      fillColor: (rowIndex: number) => rowIndex === 0 ? null : rowIndex % 2 === 0 ? '#F8FAFC' : null,
      hLineColor: () => '#E2E8F0',
      vLineColor: () => '#E2E8F0',
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
    },
    margin: [0, 0, 0, 20],
  });

  // FTE breakdown
  content.push(
    { text: 'FTE & Appointment Status', fontSize: 11, bold: true, color: '#1E3A5F', margin: [0, 0, 0, 8] },
    {
      table: {
        widths: ['*', 80],
        body: [
          [cell('Full-time positions (1.0 FTE, 12 months)', { bold: true }), cell(String(positions.filter(p => p.fte >= 1 && p.appointment_months >= 12).length), { alignment: 'right' })],
          [cell('Part-time / reduced FTE positions'), cell(String(partTimePositions.length), { alignment: 'right' })],
          [cell('Less than 12-month appointments'), cell(String(positions.filter(p => p.appointment_months < 12).length), { alignment: 'right' })],
          [cell('Positions with housing benefit'), cell(String(positions.filter(p => p.has_housing_benefit).length), { alignment: 'right' })],
        ],
      },
      layout: {
        hLineColor: () => '#E2E8F0',
        vLineColor: () => '#E2E8F0',
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        fillColor: (rowIndex: number) => rowIndex % 2 === 0 ? '#F8FAFC' : null,
      },
      margin: [0, 0, 0, 20],
    },
  );

  // ── METHODOLOGY NOTE ───────────────────────────────────────────────────────
  content.push(
    { text: '', pageBreak: 'after' },
    { text: 'METHODOLOGY', fontSize: 14, bold: true, color: '#1E3A5F', margin: [0, 0, 0, 12] },
    {
      text: 'CUPA-HR Benchmarking',
      fontSize: 11, bold: true, margin: [0, 0, 0, 6],
    },
    {
      text: 'Salary equity gaps are calculated using median salary data from the College and University Professional Association for Human Resources (CUPA-HR). ' +
        'Each institutional position is mapped to a CUPA classification code. The CUPA median salary for that code serves as the benchmark for equitable compensation.',
      fontSize: 9, lineHeight: 1.4, margin: [0, 0, 0, 12],
    },
    {
      text: 'Median Adjustments',
      fontSize: 11, bold: true, margin: [0, 0, 0, 6],
    },
    {
      text: 'CUPA medians are adjusted to account for individual position characteristics:\n' +
        '  \u2022 FTE Adjustment: For positions below 1.0 FTE, the median is prorated (e.g., 0.75 FTE = 75% of median).\n' +
        '  \u2022 Appointment Months: For positions with less than 12-month appointments, the median is prorated (e.g., 10 months = 10/12 of median).\n' +
        '  \u2022 Housing Benefits: Where applicable, the value of housing benefits is added to total compensation before comparison.',
      fontSize: 9, lineHeight: 1.4, margin: [0, 0, 0, 12],
    },
    {
      text: 'Budget Allocation Method',
      fontSize: 11, bold: true, margin: [0, 0, 0, 6],
    },
    {
      text: 'The total equity adjustment budget is distributed across VP divisions proportionally based on each division\'s share of the total institutional equity gap. ' +
        'Divisions with larger cumulative gaps receive proportionally more funding. Divisions where all employees are at or above their CUPA median receive no allocation. ' +
        'VP reviewers may propose individual raises within their allocation and may offer additional departmental funding to supplement the HR budget.',
      fontSize: 9, lineHeight: 1.4, margin: [0, 0, 0, 12],
    },
    {
      text: 'Data Sources',
      fontSize: 11, bold: true, margin: [0, 0, 0, 6],
    },
    {
      text: `  \u2022 CUPA Salary Data Year: ${cycle.cupa_data_year || 'Not specified'}\n` +
        `  \u2022 Analysis Calculated: ${fmtDate(overallSummary.calculatedAt)}\n` +
        `  \u2022 Comparison Groups: Multiple peer groups imported (Budget, Student FTE, Staff FTE, Landmark, NACU, etc.)`,
      fontSize: 9, lineHeight: 1.4, margin: [0, 0, 0, 12],
    },
  );

  // ── Document Definition ────────────────────────────────────────────────────
  const docDefinition = {
    pageSize: 'LETTER' as const,
    pageMargins: [40, 60, 40, 50] as [number, number, number, number],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
    },
    header: (currentPage: number) => ({
      columns: [
        {
          text: 'CONFIDENTIAL',
          fontSize: 7,
          bold: true,
          color: '#DC2626',
          margin: [40, 20, 0, 0],
        },
        {
          text: `Equity Adjustment Plan FY ${cycle.fiscal_year} — Moravian University`,
          fontSize: 7,
          color: '#94A3B8',
          alignment: 'right',
          margin: [0, 20, 40, 0],
        },
      ],
    }),
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: `Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
          fontSize: 7,
          color: '#94A3B8',
          margin: [40, 0, 0, 0],
        },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          fontSize: 7,
          color: '#94A3B8',
          alignment: 'right',
          margin: [0, 0, 40, 0],
        },
      ],
    }),
    content,
  };

  // ── Generate PDF ───────────────────────────────────────────────────────────
  const printer = new PdfPrinter(fonts);
  const pdfDoc = await printer.createPdfKitDocument(docDefinition);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    pdfDoc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', (err: Error) => reject(err));
    pdfDoc.end();
  });
}
