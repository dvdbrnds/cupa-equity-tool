import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  Upload,
  Calculator,
  ClipboardList,
  BookOpen,
  Users,
  DollarSign,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  AlertCircle,
  Wand2,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { dashboardApi, importApi, equityAnalysisApi } from '@/services/api';
import type { ImportResult } from '@cupa/shared';

interface DataHealth {
  cupaCatalog: { imported: boolean; count: number; year: string | null };
  positions: { imported: boolean; count: number };
  compensation: { imported: boolean; matchedCount: number; unmatchedCount: number };
  cupaSalary: { imported: boolean; count: number; year: string | null };
  equityAnalysis: { calculated: boolean; analyzedCount: number; lastCalculated: string | null };
  activeCycle: { exists: boolean; name: string | null; status: string | null };
}

interface SheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
}

type StepKey =
  | 'cupa-catalog'
  | 'positions'
  | 'compensation'
  | 'cupa-salary'
  | 'equity-analysis'
  | 'review-cycle';

export function SetupChecklist() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<DataHealth | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Upload dialog state
  const [activeDialog, setActiveDialog] = useState<StepKey | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [yearInput, setYearInput] = useState('2024-25');
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Equity calculation
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [salaryYears, setSalaryYears] = useState<Array<{ data_year: string; count: number }>>([]);
  const [selectedYear, setSelectedYear] = useState<string>('');

  // Generate fake data
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);

  const loadHealth = useCallback(() => {
    dashboardApi.getDataHealth().then(setHealth).catch(console.error);
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  // Load sheets when file is selected
  useEffect(() => {
    if (!file) {
      setSheets([]);
      setSelectedSheet('');
      setSelectedSheets([]);
      return;
    }
    setIsLoadingSheets(true);
    importApi
      .previewSheets(file)
      .then(({ sheets: s }) => {
        setSheets(s);
        if (activeDialog === 'positions') {
          const vpSheets = s.filter(
            (sh) => !sh.name.toLowerCase().includes('master')
          );
          setSelectedSheets(vpSheets.map((sh) => sh.name));
        } else if (activeDialog === 'cupa-catalog') {
          const master = s.find((sh) =>
            sh.name.toLowerCase().includes('master')
          );
          setSelectedSheet(master?.name || s[0]?.name || '');
        } else {
          setSelectedSheet(s[0]?.name || '');
        }

      })
      .catch(console.error)
      .finally(() => setIsLoadingSheets(false));
  }, [file, activeDialog]);

  if (!health) return null;

  const steps: Array<{
    key: StepKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    isDone: boolean;
    detail: string;
    hasUpload: boolean;
    actionLabel?: string;
  }> = [
    {
      key: 'cupa-catalog',
      label: 'CUPA Catalog',
      icon: BookOpen,
      isDone: health.cupaCatalog.imported,
      detail: health.cupaCatalog.imported
        ? `${health.cupaCatalog.count} positions (${health.cupaCatalog.year})`
        : 'Upload CUPA-HR position classification data',
      hasUpload: true,
    },
    {
      key: 'positions',
      label: 'Institutional Positions',
      icon: Users,
      isDone: health.positions.imported,
      detail: health.positions.imported
        ? `${health.positions.count} positions`
        : 'Upload institutional position data',
      hasUpload: true,
    },
    {
      key: 'cupa-salary',
      label: 'CUPA Salary Data',
      icon: FileSpreadsheet,
      isDone: health.cupaSalary.imported,
      detail: health.cupaSalary.imported
        ? `${health.cupaSalary.count} codes (${health.cupaSalary.year})`
        : 'Upload CUPA salary survey data',
      hasUpload: true,
    },
    {
      key: 'compensation',
      label: 'Compensation Data',
      icon: DollarSign,
      isDone: health.compensation.imported,
      detail: health.compensation.imported
        ? `${health.compensation.matchedCount} matched${health.compensation.unmatchedCount > 0 ? `, ${health.compensation.unmatchedCount} unmatched` : ''}`
        : 'Upload salary data or generate test data',
      hasUpload: true,
    },
    {
      key: 'equity-analysis',
      label: 'Run Equity Analysis',
      icon: Calculator,
      isDone: health.equityAnalysis.calculated,
      detail: health.equityAnalysis.calculated
        ? `${health.equityAnalysis.analyzedCount} analyzed (${health.equityAnalysis.lastCalculated ? new Date(health.equityAnalysis.lastCalculated).toLocaleDateString() : ''})`
        : 'Calculate equity gaps across all positions',
      hasUpload: false,
      actionLabel: 'Calculate',
    },
    {
      key: 'review-cycle',
      label: 'Create Review Cycle',
      icon: ClipboardList,
      isDone: health.activeCycle.exists,
      detail: health.activeCycle.exists
        ? `${health.activeCycle.name} (${health.activeCycle.status?.replace(/_/g, ' ')})`
        : 'Start an equity review cycle for VP approval',
      hasUpload: false,
      actionLabel: 'Create',
    },
  ];

  const completedCount = steps.filter((s) => s.isDone).length;

  function openDialog(key: StepKey) {
    setFile(null);
    setSheets([]);
    setSelectedSheet('');
    setSelectedSheets([]);
    setImportResult(null);
    setYearInput('2024-25');
    setGenerateMsg(null);

    if (key === 'equity-analysis') {
      handleOpenEquityCalc();
      return;
    }
    if (key === 'review-cycle') {
      navigate('/review-cycles');
      return;
    }
    setActiveDialog(key);
  }

  async function handleOpenEquityCalc() {
    setActiveDialog('equity-analysis');
    setCalcError(null);
    try {
      const years = await equityAnalysisApi.getSalaryDataYears();
      setSalaryYears(years);
      if (years.length > 0) setSelectedYear(years[0].data_year);
    } catch {
      setSalaryYears([]);
    }
  }

  async function handleImport() {
    if (!file) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      let result: ImportResult;
      switch (activeDialog) {
        case 'cupa-catalog':
          result = await importApi.importCupaCatalog(file, yearInput, selectedSheet);
          break;
        case 'positions':
          result = await importApi.importPositions(file, selectedSheets);
          break;
        case 'compensation':
          result = await importApi.importCompensation(file, selectedSheet || undefined);
          break;
        case 'cupa-salary':
          result = await importApi.importCupaSalary(file, yearInput, selectedSheet || undefined);
          break;
        default:
          return;
      }
      setImportResult(result);
      if (result.success || result.imported > 0) {
        loadHealth();
      }
    } catch (err) {
      setImportResult({
        success: false,
        imported: 0,
        skipped: 0,
        errors: [
          {
            row: 0,
            field: 'file',
            message: err instanceof Error ? err.message : 'Import failed',
          },
        ],
      });
    } finally {
      setIsImporting(false);
    }
  }

  async function handleCalculate() {
    if (!selectedYear) return;
    setIsCalculating(true);
    setCalcError(null);
    try {
      const result = await equityAnalysisApi.calculate(selectedYear);
      if (result.success) {
        loadHealth();
        setActiveDialog(null);
      } else {
        setCalcError(result.message);
      }
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setIsCalculating(false);
    }
  }

  async function handleGenerateFake() {
    setIsGenerating(true);
    setGenerateMsg(null);
    try {
      const result = await importApi.generateFakeCompensation();
      setGenerateMsg(result.message);
      if (result.success) loadHealth();
    } catch (err) {
      setGenerateMsg(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }

  function toggleSheet(name: string) {
    setSelectedSheets((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    );
  }

  const dialogTitle: Record<StepKey, string> = {
    'cupa-catalog': 'Import CUPA Catalog',
    positions: 'Import Institutional Positions',
    compensation: 'Import Compensation Data',
    'cupa-salary': 'Import CUPA Salary Data',
    'equity-analysis': 'Run Equity Analysis',
    'review-cycle': 'Create Review Cycle',
  };

  const dialogDesc: Record<StepKey, string> = {
    'cupa-catalog':
      'Upload the CUPA-HR position descriptions catalog. Expects columns: CUPA #, CUPA Title, Description.',
    positions:
      'Upload the audit workbook with VP division tabs. Each sheet is imported as a division.',
    compensation:
      'Upload employee compensation data matched by Employee ID. Or generate test data below.',
    'cupa-salary':
      'Upload CUPA median salary survey data for equity gap calculations.',
    'equity-analysis': 'Calculate equity gaps for all positions using CUPA salary data.',
    'review-cycle': '',
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <button
              className="flex items-center gap-2 hover:text-primary transition-colors"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <CardTitle className="text-lg">Data Pipeline</CardTitle>
            </button>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {steps.map((step) => (
                  <div
                    key={step.key}
                    className={`h-2 w-2 rounded-full ${step.isDone ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    title={step.label}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {completedCount}/{steps.length}
              </span>
            </div>
          </div>
        </CardHeader>
        {!isCollapsed && (
          <CardContent>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div
                  key={step.key}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    step.isDone
                      ? 'bg-green-50 dark:bg-green-950/20'
                      : 'bg-muted/30 border'
                  }`}
                >
                  {/* Step number / check */}
                  {step.isDone ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                    </div>
                  )}

                  {/* Label & detail */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-medium ${step.isDone ? 'text-green-700 dark:text-green-400' : ''}`}
                    >
                      {step.label}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {step.detail}
                    </div>
                    {step.key === 'compensation' && generateMsg && (
                      <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                        {generateMsg}
                      </div>
                    )}
                  </div>

                  {/* Action button(s) */}
                  {step.key === 'compensation' ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateFake}
                        disabled={isGenerating}
                        className="border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950/30"
                      >
                        {isGenerating ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Generate
                      </Button>
                      <Button
                        variant={step.isDone ? 'ghost' : 'outline'}
                        size="sm"
                        onClick={() => openDialog(step.key)}
                      >
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                        {step.isDone ? 'Re-upload' : 'Upload'}
                      </Button>
                    </div>
                  ) : step.hasUpload ? (
                    <Button
                      variant={step.isDone ? 'ghost' : 'outline'}
                      size="sm"
                      onClick={() => openDialog(step.key)}
                      className="flex-shrink-0"
                    >
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      {step.isDone ? 'Re-upload' : 'Upload'}
                    </Button>
                  ) : (
                    <Button
                      variant={step.isDone ? 'ghost' : 'outline'}
                      size="sm"
                      onClick={() => openDialog(step.key)}
                      className="flex-shrink-0"
                    >
                      {step.isDone ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                          Redo
                        </>
                      ) : (
                        <>
                          <step.icon className="h-3.5 w-3.5 mr-1.5" />
                          {step.actionLabel}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Upload Dialogs */}
      {activeDialog && activeDialog !== 'equity-analysis' && activeDialog !== 'review-cycle' && (
        <Dialog open onOpenChange={() => setActiveDialog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{dialogTitle[activeDialog]}</DialogTitle>
              <DialogDescription>{dialogDesc[activeDialog]}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Year input for catalog and salary */}
              {(activeDialog === 'cupa-catalog' || activeDialog === 'cupa-salary') && (
                <div>
                  <Label>Data Year</Label>
                  <Input
                    value={yearInput}
                    onChange={(e) => setYearInput(e.target.value)}
                    placeholder="e.g., 2024-25"
                  />
                </div>
              )}

              {/* File picker */}
              <div>
                <Label>Excel File</Label>
                <label className="mt-2 flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex flex-col items-center py-4">
                    <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                    {file ? (
                      <p className="text-sm font-medium">{file.name}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Click to select .xlsx or .csv
                      </p>
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] || null);
                      setImportResult(null);
                    }}
                  />
                </label>
              </div>

              {/* Sheet selection -- single sheet */}
              {sheets.length > 0 && activeDialog !== 'positions' && (
                <div>
                  <Label>Select Sheet</Label>
                  <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select a sheet" />
                    </SelectTrigger>
                    <SelectContent>
                      {sheets.map((s) => (
                        <SelectItem key={s.name} value={s.name}>
                          {s.name} ({s.rowCount} rows)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Sheet selection -- multi sheet for positions */}
              {sheets.length > 0 && activeDialog === 'positions' && (
                <div>
                  <Label>Select VP Sheets to Import</Label>
                  <div className="mt-1 space-y-1.5 max-h-48 overflow-y-auto border rounded-md p-2">
                    {sheets.map((s) => (
                      <label
                        key={s.name}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSheets.includes(s.name)}
                          onChange={() => toggleSheet(s.name)}
                          className="rounded border-gray-300"
                        />
                        <span className="flex-1">{s.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {s.rowCount} rows
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedSheets.length} sheet(s) selected
                  </p>
                </div>
              )}

              {/* Import result */}
              {importResult && (
                <>
                  <div
                    className={`p-3 rounded-lg text-sm ${importResult.success ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'}`}
                  >
                    <div className="flex items-center gap-2 font-medium">
                      {importResult.success ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <AlertCircle className="h-4 w-4" />
                      )}
                      {importResult.success ? 'Import Successful' : 'Import Failed'}
                    </div>
                    <p className="text-xs mt-1">
                      Imported: {importResult.imported} | Skipped: {importResult.skipped}
                    </p>
                    {importResult.errors.length > 0 && (
                      <div className="mt-2 max-h-24 overflow-y-auto">
                        {importResult.errors.slice(0, 5).map((e, idx) => (
                          <p key={idx} className="text-xs">
                            Row {e.row}: {e.message}
                          </p>
                        ))}
                        {importResult.errors.length > 5 && (
                          <p className="text-xs text-muted-foreground">
                            ...and {importResult.errors.length - 5} more
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Warnings (non-fatal) */}
                  {importResult.warnings && importResult.warnings.length > 0 && (
                    <div className="p-3 rounded-lg text-sm bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertCircle className="h-4 w-4" />
                        {importResult.warnings.length} warning{importResult.warnings.length !== 1 ? 's' : ''}
                      </div>
                      <div className="mt-2 max-h-24 overflow-y-auto">
                        {importResult.warnings.slice(0, 5).map((w, idx) => (
                          <p key={idx} className="text-xs">
                            Row {w.row}: {w.message}
                          </p>
                        ))}
                        {importResult.warnings.length > 5 && (
                          <p className="text-xs text-muted-foreground">
                            ...and {importResult.warnings.length - 5} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Generate fake compensation option */}
              {activeDialog === 'compensation' && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                        No compensation file?
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Generate realistic test data for all imported positions
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateFake}
                      disabled={isGenerating}
                      className="border-purple-300 text-purple-700 hover:bg-purple-50"
                    >
                      {isGenerating ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Generate
                    </Button>
                  </div>
                  {generateMsg && (
                    <p className="text-xs text-green-600 mt-2">{generateMsg}</p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setActiveDialog(null)}>
                {importResult && (importResult.success || importResult.imported > 0) ? 'Done' : 'Cancel'}
              </Button>
              {!(importResult && (importResult.success || importResult.imported > 0)) && (
                <Button
                  onClick={handleImport}
                  disabled={
                    !file ||
                    isImporting ||
                    isLoadingSheets ||
                    (activeDialog === 'positions' && selectedSheets.length === 0) ||
                    ((activeDialog === 'cupa-catalog' || activeDialog === 'cupa-salary') &&
                      !yearInput)
                  }
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : isLoadingSheets ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Import
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Equity Analysis Dialog */}
      {activeDialog === 'equity-analysis' && (
        <Dialog open onOpenChange={() => setActiveDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Run Equity Analysis</DialogTitle>
              <DialogDescription>
                Calculate equity gaps for all positions using CUPA salary data
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>CUPA Salary Data Year</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {salaryYears.map((y) => (
                      <SelectItem key={y.data_year} value={y.data_year}>
                        {y.data_year} ({y.count} codes)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {salaryYears.length === 0 && (
                  <p className="text-sm text-destructive mt-1">
                    No CUPA salary data imported yet. Import salary data first.
                  </p>
                )}
              </div>
              {calcError && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                  {calcError}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActiveDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleCalculate}
                disabled={!selectedYear || isCalculating || salaryYears.length === 0}
              >
                {isCalculating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <Calculator className="h-4 w-4 mr-2" />
                    Calculate
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
