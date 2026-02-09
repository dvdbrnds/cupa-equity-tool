import { useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Wand2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { importApi } from '@/services/api';
import type { ImportResult } from '@cupa/shared';

interface SheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
}

export function ImportPage() {
  const [cupaCatalogFile, setCupaCatalogFile] = useState<File | null>(null);
  const [catalogYear, setCatalogYear] = useState('2024-25');
  const [cupaSheets, setCupaSheets] = useState<SheetInfo[]>([]);
  const [selectedCupaSheet, setSelectedCupaSheet] = useState<string>('');
  const [positionsFile, setPositionsFile] = useState<File | null>(null);
  const [positionsSheets, setPositionsSheets] = useState<SheetInfo[]>([]);
  const [selectedPositionSheets, setSelectedPositionSheets] = useState<string[]>([]);
  
  // Compensation data import state
  const [compensationFile, setCompensationFile] = useState<File | null>(null);
  const [compensationSheets, setCompensationSheets] = useState<SheetInfo[]>([]);
  const [selectedCompSheet, setSelectedCompSheet] = useState<string>('');
  
  // CUPA salary data import state
  const [cupaSalaryFile, setCupaSalaryFile] = useState<File | null>(null);
  const [salaryDataYear, setSalaryDataYear] = useState('2024-25');
  const [cupaSalarySheets, setCupaSalarySheets] = useState<SheetInfo[]>([]);
  const [selectedSalarySheet, setSelectedSalarySheet] = useState<string>('');
  
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importType, setImportType] = useState<'cupa' | 'positions' | 'compensation' | 'salary' | null>(null);
  
  // Fake data generation
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load sheets when CUPA catalog file is selected
  useEffect(() => {
    if (cupaCatalogFile) {
      setIsLoadingSheets(true);
      importApi.previewSheets(cupaCatalogFile)
        .then(({ sheets }) => {
          setCupaSheets(sheets);
          // Auto-select "Master Sheet" if it exists
          const masterSheet = sheets.find(s => s.name.toLowerCase().includes('master'));
          setSelectedCupaSheet(masterSheet?.name || sheets[0]?.name || '');
        })
        .catch(console.error)
        .finally(() => setIsLoadingSheets(false));
    } else {
      setCupaSheets([]);
      setSelectedCupaSheet('');
    }
  }, [cupaCatalogFile]);

  // Load sheets when positions file is selected
  useEffect(() => {
    if (positionsFile) {
      setIsLoadingSheets(true);
      importApi.previewSheets(positionsFile)
        .then(({ sheets }) => {
          setPositionsSheets(sheets);
          // Auto-select all sheets except "Master Sheet"
          const vpSheets = sheets.filter(s => !s.name.toLowerCase().includes('master'));
          setSelectedPositionSheets(vpSheets.map(s => s.name));
        })
        .catch(console.error)
        .finally(() => setIsLoadingSheets(false));
    } else {
      setPositionsSheets([]);
      setSelectedPositionSheets([]);
    }
  }, [positionsFile]);

  // Load sheets when compensation file is selected
  useEffect(() => {
    if (compensationFile) {
      setIsLoadingSheets(true);
      importApi.previewSheets(compensationFile)
        .then(({ sheets }) => {
          setCompensationSheets(sheets);
          setSelectedCompSheet(sheets[0]?.name || '');
        })
        .catch(console.error)
        .finally(() => setIsLoadingSheets(false));
    } else {
      setCompensationSheets([]);
      setSelectedCompSheet('');
    }
  }, [compensationFile]);

  // Load sheets when CUPA salary file is selected
  useEffect(() => {
    if (cupaSalaryFile) {
      setIsLoadingSheets(true);
      importApi.previewSheets(cupaSalaryFile)
        .then(({ sheets }) => {
          setCupaSalarySheets(sheets);
          setSelectedSalarySheet(sheets[0]?.name || '');
        })
        .catch(console.error)
        .finally(() => setIsLoadingSheets(false));
    } else {
      setCupaSalarySheets([]);
      setSelectedSalarySheet('');
    }
  }, [cupaSalaryFile]);

  const handleCupaImport = async () => {
    if (!cupaCatalogFile || !selectedCupaSheet) return;
    setIsImporting(true);
    setImportType('cupa');
    setImportResult(null);
    try {
      const result = await importApi.importCupaCatalog(cupaCatalogFile, catalogYear, selectedCupaSheet);
      setImportResult(result);
      if (result.success) {
        setCupaCatalogFile(null);
        setCupaSheets([]);
        setSelectedCupaSheet('');
      }
    } catch (error) {
      setImportResult({
        success: false,
        imported: 0,
        skipped: 0,
        errors: [{ row: 0, field: 'file', message: error instanceof Error ? error.message : 'Import failed' }],
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handlePositionsImport = async () => {
    if (!positionsFile || selectedPositionSheets.length === 0) return;
    setIsImporting(true);
    setImportType('positions');
    setImportResult(null);
    try {
      const result = await importApi.importPositions(positionsFile, selectedPositionSheets);
      setImportResult(result);
      if (result.success) {
        setPositionsFile(null);
        setPositionsSheets([]);
        setSelectedPositionSheets([]);
      }
    } catch (error) {
      setImportResult({
        success: false,
        imported: 0,
        skipped: 0,
        errors: [{ row: 0, field: 'file', message: error instanceof Error ? error.message : 'Import failed' }],
      });
    } finally {
      setIsImporting(false);
    }
  };

  const togglePositionSheet = (sheetName: string) => {
    setSelectedPositionSheets(prev => 
      prev.includes(sheetName) 
        ? prev.filter(s => s !== sheetName)
        : [...prev, sheetName]
    );
  };

  const handleCompensationImport = async () => {
    if (!compensationFile) return;
    setIsImporting(true);
    setImportType('compensation');
    setImportResult(null);
    try {
      const result = await importApi.importCompensation(compensationFile, selectedCompSheet || undefined);
      setImportResult(result);
      if (result.success) {
        setCompensationFile(null);
        setCompensationSheets([]);
        setSelectedCompSheet('');
      }
    } catch (error) {
      setImportResult({
        success: false,
        imported: 0,
        skipped: 0,
        errors: [{ row: 0, field: 'file', message: error instanceof Error ? error.message : 'Import failed' }],
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleGenerateFakeCompensation = async () => {
    setIsGenerating(true);
    setGenerateResult(null);
    try {
      const result = await importApi.generateFakeCompensation();
      setGenerateResult(result);
    } catch (error) {
      setGenerateResult({
        success: false,
        message: error instanceof Error ? error.message : 'Generation failed',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCupaSalaryImport = async () => {
    if (!cupaSalaryFile || !salaryDataYear) return;
    setIsImporting(true);
    setImportType('salary');
    setImportResult(null);
    try {
      const result = await importApi.importCupaSalary(cupaSalaryFile, salaryDataYear, selectedSalarySheet || undefined);
      setImportResult(result);
      if (result.success) {
        setCupaSalaryFile(null);
        setCupaSalarySheets([]);
        setSelectedSalarySheet('');
      }
    } catch (error) {
      setImportResult({
        success: false,
        imported: 0,
        skipped: 0,
        errors: [{ row: 0, field: 'file', message: error instanceof Error ? error.message : 'Import failed' }],
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import Data</h1>
        <p className="text-muted-foreground">
          Import CUPA catalog and institutional position data from Excel files
        </p>
      </div>

      {/* Import Result */}
      {importResult && (
        <Card className={importResult.success ? 'border-green-500' : 'border-red-500'}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              {importResult.success ? (
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className="font-medium">
                  {importResult.success ? 'Import Successful' : 'Import Completed with Errors'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Imported: {importResult.imported} | Skipped: {importResult.skipped}
                </p>
                {importResult.errors.length > 0 && (
                  <div className="mt-3 max-h-40 overflow-y-auto">
                    <p className="text-sm font-medium text-red-600 mb-1">Errors:</p>
                    {importResult.errors.slice(0, 10).map((error, i) => (
                      <p key={i} className="text-xs text-red-600">
                        Row {error.row}: {error.field} - {error.message}
                      </p>
                    ))}
                    {importResult.errors.length > 10 && (
                      <p className="text-xs text-muted-foreground">
                        ...and {importResult.errors.length - 10} more errors
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* CUPA Catalog Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              CUPA Catalog
            </CardTitle>
            <CardDescription>
              Import the master CUPA position descriptions catalog
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Catalog Year</Label>
              <Input
                value={catalogYear}
                onChange={(e) => setCatalogYear(e.target.value)}
                placeholder="e.g., 2023-24"
              />
            </div>
            <div>
              <Label>Excel File</Label>
              <div className="mt-2">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    {cupaCatalogFile ? (
                      <p className="text-sm font-medium">{cupaCatalogFile.name}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Click to upload Excel file</p>
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setCupaCatalogFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>
            {cupaSheets.length > 0 && (
              <div>
                <Label>Select Sheet</Label>
                <Select value={selectedCupaSheet} onValueChange={setSelectedCupaSheet}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select a sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {cupaSheets.map((sheet) => (
                      <SelectItem key={sheet.name} value={sheet.name}>
                        {sheet.name} ({sheet.rowCount} rows)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button 
              onClick={handleCupaImport} 
              disabled={!cupaCatalogFile || !selectedCupaSheet || isImporting || isLoadingSheets}
              className="w-full"
            >
              {isImporting && importType === 'cupa' ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Importing...
                </>
              ) : isLoadingSheets ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Loading sheets...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import CUPA Catalog
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Positions Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Institutional Positions
            </CardTitle>
            <CardDescription>
              Import position data from the CUPA audit workbook
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Excel File</Label>
              <div className="mt-2">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    {positionsFile ? (
                      <p className="text-sm font-medium">{positionsFile.name}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Click to upload Excel file</p>
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setPositionsFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>
            {positionsSheets.length > 0 && (
              <div>
                <Label>Select VP Sheets to Import</Label>
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                  {positionsSheets.map((sheet) => (
                    <label key={sheet.name} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPositionSheets.includes(sheet.name)}
                        onChange={() => togglePositionSheet(sheet.name)}
                        className="rounded border-gray-300"
                      />
                      <span>{sheet.name}</span>
                      <span className="text-muted-foreground">({sheet.rowCount} rows)</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedPositionSheets.length} sheet(s) selected
                </p>
              </div>
            )}
            <Button 
              onClick={handlePositionsImport} 
              disabled={!positionsFile || selectedPositionSheets.length === 0 || isImporting || isLoadingSheets}
              className="w-full"
            >
              {isImporting && importType === 'positions' ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Importing...
                </>
              ) : isLoadingSheets ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Loading sheets...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Positions
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Equity Analysis Imports */}
      <h2 className="text-xl font-semibold pt-4">Equity Analysis Data</h2>
      
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Compensation Data Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Compensation Data
            </CardTitle>
            <CardDescription>
              Import salary, hire date, FTE, and other compensation details (matches by Employee ID)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Excel File</Label>
              <div className="mt-2">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    {compensationFile ? (
                      <p className="text-sm font-medium">{compensationFile.name}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Click to upload Excel file</p>
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setCompensationFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>
            {compensationSheets.length > 0 && (
              <div>
                <Label>Select Sheet</Label>
                <Select value={selectedCompSheet} onValueChange={setSelectedCompSheet}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select a sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {compensationSheets.map((sheet) => (
                      <SelectItem key={sheet.name} value={sheet.name}>
                        {sheet.name} ({sheet.rowCount} rows)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button 
              onClick={handleCompensationImport} 
              disabled={!compensationFile || isImporting || isLoadingSheets}
              className="w-full"
            >
              {isImporting && importType === 'compensation' ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Compensation Data
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* CUPA Salary Data Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              CUPA Salary Data
            </CardTitle>
            <CardDescription>
              Import CUPA median salaries and percentiles for equity calculations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Data Year</Label>
              <Input
                value={salaryDataYear}
                onChange={(e) => setSalaryDataYear(e.target.value)}
                placeholder="e.g., 2024-25"
              />
            </div>
            <div>
              <Label>Excel File</Label>
              <div className="mt-2">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    {cupaSalaryFile ? (
                      <p className="text-sm font-medium">{cupaSalaryFile.name}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Click to upload Excel file</p>
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => setCupaSalaryFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>
            {cupaSalarySheets.length > 0 && (
              <div>
                <Label>Select Sheet</Label>
                <Select value={selectedSalarySheet} onValueChange={setSelectedSalarySheet}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select a sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {cupaSalarySheets.map((sheet) => (
                      <SelectItem key={sheet.name} value={sheet.name}>
                        {sheet.name} ({sheet.rowCount} rows)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button 
              onClick={handleCupaSalaryImport} 
              disabled={!cupaSalaryFile || !salaryDataYear || isImporting || isLoadingSheets}
              className="w-full"
            >
              {isImporting && importType === 'salary' ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import CUPA Salary Data
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Test Data Generator */}
      <Card className="border-dashed border-2 border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-purple-600" />
            Generate Test Compensation Data
          </CardTitle>
          <CardDescription>
            No real compensation file? Generate realistic fake salary data for all imported positions.
            Creates a mix of salaried and hourly workers with varied FTE, tenure, and housing benefits.
            If CUPA salary data is imported first, salaries will be calibrated to CUPA medians.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {generateResult && (
            <Alert variant={generateResult.success ? 'default' : 'destructive'}>
              {generateResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertTitle>{generateResult.success ? 'Success' : 'Error'}</AlertTitle>
              <AlertDescription>{generateResult.message}</AlertDescription>
            </Alert>
          )}
          <Button
            onClick={handleGenerateFakeCompensation}
            disabled={isGenerating}
            variant="outline"
            className="border-purple-300 text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-300"
          >
            {isGenerating ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Generate Fake Compensation Data
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Import Instructions</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <h4>CUPA Catalog Import</h4>
          <p>
            Upload the master CUPA position descriptions file. The import expects columns for:
            CUPA #, CUPA Title, CUPA Position Description, BLS SOC #, BLS SOC Category Name.
          </p>
          
          <h4>Positions Import</h4>
          <p>
            Upload the audit workbook with VP tabs. Each sheet will be processed as positions for that division.
            Expected columns: Employee ID, Moravian Job Title, Last Name, First Name, Division, Department, 
            Supervisor, VP Stem, and optionally CUPA # for existing mappings.
          </p>

          <h4>Compensation Data Import</h4>
          <p>
            Upload employee compensation details. This data is matched to existing positions by Employee ID.
            Expected columns: Employee ID, Salary/Annual Salary, Hire Date/Start Date, FTE, Appointment Months (10/12), 
            Compensation Type (Salaried/Hourly), Housing Benefit (Yes/No).
          </p>

          <h4>CUPA Salary Data Import</h4>
          <p>
            Upload CUPA median salary data for equity calculations. Expected columns: CUPA Code, 
            Median Salary, 25th Percentile (optional), 75th Percentile (optional), Sample Count (optional).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
