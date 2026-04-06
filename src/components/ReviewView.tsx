import { useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import DataTable from './DataTable';
import {
  Download, FileDown, ArrowLeft, RefreshCw, AlertCircle, Sparkles,
  UploadCloud, CheckCircle, ArrowRight, PlusCircle, X, History
} from 'lucide-react';
import {
  exportSummaryXLSX, exportCallPlanXLSX,
  parseCSV, parseXLSX, detectCities, findOpenCallSheet
} from '../lib/fileIO';
import { processCallPlan } from '../lib/engine';
import type { ClassifiedRow } from '../lib/types';
import { MORNING_STATUS_OPTIONS } from '../lib/types';
import { uploadFile, processCallPlan as apiProcessCallPlan, exportCallPlan as apiExportCallPlan, listFiles, type ApiRow, type FileListItem } from '../api/client';

export default function ReviewView() {
  const {
    result,
    rows,
    droppedRows,
    activeTab,
    setActiveTab,
    reset,
    selectedCity,
    reportDate,
    engineers,
    setFlexData,
    setYesterdayData,
    availableCities,
    setSelectedCity,
    setReportDate,
    flexData,
    yesterdayData,
    setResult,
    setRows,
    setDroppedRows,
    addRow,
    username
  } = useStore();

  const [flexFile, setFlexFile] = useState<File | null>(null);
  const [yestFile, setYestFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showImport, setShowImport] = useState(!result && rows.length === 0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Backend file IDs (stored after upload)
  const [flexFileId, setFlexFileId] = useState<number | null>(null);
  const [yestFileId, setYestFileId] = useState<number | null>(null);
  const [uploadHistory, setUploadHistory] = useState<FileListItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Expanded Manual Row State - All 17 fields (including woOtcCode)
  const [newRow, setNewRow] = useState<Partial<ClassifiedRow>>({
    classification: 'NEW',
    month: '',
    ticketNo: '',
    woOtcCode: '',
    caseId: '',
    product: '',
    wipAging: 0,
    location: '',
    segment: 'Trade',
    hpOwner: 'Manual',
    flexStatus: 'Manual Entry',
    morningStatus: 'Actionable',
    eveningStatus: '',
    currentStatusTAT: '',
    engg: '',
    contactNo: '',
    parts: ''
  });

  const flexRef = useRef<HTMLInputElement>(null);
  const yestRef = useRef<HTMLInputElement>(null);

  const handleFlexUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      // Parse locally for preview & city detection
      let data: Record<string, unknown>[];
      if (file.name.endsWith('.csv')) {
        data = await parseCSV(file);
      } else {
        const parsed = await parseXLSX(file);
        let flexSheetName = parsed.sheets.find(s => s.toLowerCase() === 'data');
        if (!flexSheetName) {
          flexSheetName = parsed.sheets.reduce((best, s) => {
            const len = (parsed.data[s] || []).length;
            const bestLen = (parsed.data[best] || []).length;
            return len > bestLen ? s : best;
          }, parsed.sheets[0]);
        }
        data = parsed.data[flexSheetName] || [];
      }
      const cities = detectCities(data);
      setFlexData(data, cities);
      setFlexFile(file);

      // Upload to backend for DB storage (fire-and-forget, non-blocking)
      uploadFile(file, 'flex_wip', selectedCity, reportDate, username)
        .then(resp => setFlexFileId(resp.file.id))
        .catch(() => console.warn('Backend upload failed for flex file'));
    } catch (err) {
      setError('Failed to parse Flex file.');
    }
  };

  const handleYestUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const parsed = await parseXLSX(file);
      const sheetName = findOpenCallSheet(parsed.sheets);
      if (!sheetName) throw new Error('Could not find "Open Call" sheet.');
      setYesterdayData(parsed.data[sheetName]);
      setYestFile(file);

      // Upload to backend for DB storage (fire-and-forget, non-blocking)
      uploadFile(file, 'call_plan', selectedCity, reportDate, username)
        .then(resp => setYestFileId(resp.file.id))
        .catch(() => console.warn('Backend upload failed for yesterday file'));
    } catch (err: any) {
      setError(err.message || 'Failed to parse Yesterday\'s file.');
    }
  };

  const handleGenerate = () => {
    if (!flexData || !yesterdayData) return;
    setIsProcessing(true);

    // Always use local processing first (reliable, no backend dependency)
    setTimeout(() => {
      try {
        const res = processCallPlan(flexData, yesterdayData, selectedCity, new Date(reportDate));
        setResult(res);
        setRows(res.all);
        setDroppedRows(res.dropped);
        setShowImport(false);
        setIsProcessing(false);
      } catch (err: any) {
        setError('Error generating plan: ' + err.message);
        setIsProcessing(false);
      }
    }, 400);
  };

  const handleExportSummary = () => {
    try {
      const enggCount = engineers.filter(e => e.trim() !== '').length;
      exportSummaryXLSX(rows, enggCount, selectedCity, reportDate);
    } catch (e) {
      alert("Summary Export failed.");
    }
  };

  const handleExportCallPlan = async () => {
    try {
      // Local export (immediate download)
      exportCallPlanXLSX(rows, droppedRows, selectedCity, reportDate);

      // Also save to backend DB
      try {
        const apiRows: ApiRow[] = rows.map(r => ({
          ticket_no: r.ticketNo,
          case_id: r.caseId,
          product: r.product,
          wip_aging: r.wipAging,
          location: r.location,
          segment: r.segment,
          classification: r.classification,
          morning_status: r.morningStatus,
          evening_status: r.eveningStatus,
          engineer: r.engg,
          contact_no: r.contactNo,
          parts: r.parts,
          month: r.month,
          wo_otc_code: r.woOtcCode,
          hp_owner: r.hpOwner,
          flex_status: r.flexStatus,
          wip_changed: r.wipChanged,
          current_status_tat: r.currentStatusTAT,
        }));
        await apiExportCallPlan(apiRows, selectedCity, reportDate);
      } catch {
        console.warn('Backend export save failed, local file was still downloaded');
      }
    } catch (e) {
      alert("Call Plan Export failed.");
    }
  };

  const loadHistory = async () => {
    try {
      const files = await listFiles(undefined, undefined, username);
      setUploadHistory(files);
      setShowHistory(true);
    } catch {
      console.warn('Could not load history from backend');
    }
  };

  const handleAddManualRow = () => {
    if (!newRow.ticketNo) {
      alert("Ticket No is required");
      return;
    }
    addRow(newRow as ClassifiedRow);
    setIsModalOpen(false);
    setNewRow({
        classification: 'NEW',
        month: '',
        ticketNo: '',
        woOtcCode: '',
        caseId: '',
        product: '',
        wipAging: 0,
        location: '',
        segment: 'Trade',
        hpOwner: 'Manual',
        flexStatus: 'Manual Entry',
        morningStatus: 'Actionable',
        eveningStatus: '',
        currentStatusTAT: '',
        engg: '',
        contactNo: '',
        parts: ''
    });
  };

  // ── Dynamic Metric Calculations ──
  const openCallsCount = rows.length;
  const actionableCount = rows.filter(r => r.morningStatus.toLowerCase() === 'actionable').length;
  const plannedCallsCount = rows.filter(r => r.engg && r.engg.trim() !== '').length;
  const totalEngineersCount = engineers.filter(e => e.trim() !== '').length;
  const enggPresentCount = new Set(rows.map(r => r.engg).filter(e => e && e.trim() !== '')).size;

  const toScheduleCount = rows.filter(r => r.morningStatus.toLowerCase() === 'to be scheduled').length;
  const cxRescheduleCount = rows.filter(r => r.morningStatus.toLowerCase() === 'cx reschedule' || r.morningStatus.toLowerCase() === 'cx pending').length;
  const sscPendingCount = rows.filter(r => r.morningStatus.toLowerCase() === 'ssc pending').length;
  const techSupportCount = rows.filter(r => r.morningStatus.toLowerCase() === 'elevate/tech support').length;
  const observationCount = rows.filter(r => r.morningStatus.toLowerCase() === 'under observation').length;
  const enggOnsiteCount = rows.filter(r => r.morningStatus.toLowerCase() === 'engg onsite').length;
  const toYankCount = rows.filter(r => r.morningStatus.toLowerCase() === 'to be yank').length;
  const toCancelCount = rows.filter(r => r.morningStatus.toLowerCase().includes('cancel') && r.morningStatus.toLowerCase() !== 'closed cancelled').length;
  const partOrderedCount = rows.filter(r => r.morningStatus.toLowerCase() === 'additional part').length;
  const newCallsCount = rows.filter(r => r.classification === 'NEW').length;
  const tradeCount = rows.filter(r => r.segment.toLowerCase() === 'trade').length;
  const closedCount = rows.filter(r => r.morningStatus.toLowerCase() === 'closed').length;
  const closedCancelledCount = rows.filter(r => r.morningStatus.toLowerCase() === 'closed cancelled').length;

  const allMetrics = [
    { label: 'Engineer Count', value: totalEngineersCount, icon: Sparkles, color: 'text-pink-400', bg: 'bg-pink-500/10' },
    { label: 'No. of Engg Presents', value: enggPresentCount, icon: RefreshCw, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Open Calls', value: openCallsCount, icon: FileDown, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Actionable Calls', value: actionableCount, icon: AlertCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Planned Calls', value: plannedCallsCount, icon: RefreshCw, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'To be scheduled', value: toScheduleCount, icon: FileDown, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { label: 'CX Reschedule Calls', value: cxRescheduleCount, icon: RefreshCw, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'SSC Pending Calls', value: sscPendingCount, icon: AlertCircle, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { label: 'Elevate/Tech Support', value: techSupportCount, icon: RefreshCw, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'Under Observation', value: observationCount, icon: FileDown, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Engg Onsite', value: enggOnsiteCount, icon: Sparkles, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { label: 'To Be Yanked', value: toYankCount, icon: AlertCircle, color: 'text-rose-400', bg: 'bg-rose-500/10' },
    { label: 'To Be Cancel', value: toCancelCount, icon: RefreshCw, color: 'text-gray-400', bg: 'bg-gray-800/20' },
    { label: 'Add.Part Ordered', value: partOrderedCount, icon: FileDown, color: 'text-sky-400', bg: 'bg-sky-500/10' },
    { label: 'Trade Open Calls', value: tradeCount, icon: Sparkles, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'New Calls', value: newCallsCount, icon: Sparkles, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    { label: 'Closed Calls', value: closedCount, icon: AlertCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
    { label: 'Closed Cancelled', value: closedCancelledCount, icon: FileDown, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Closed(OTB)', value: result?.metrics.droppedCount || 0, icon: FileDown, color: 'text-red-400', bg: 'bg-red-500/10' },
  ];

  const enggBreakdown = rows.reduce((acc, row) => {
    if (row.engg && row.engg.trim() !== '') {
      acc[row.engg] = (acc[row.engg] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const sortedEnggs = Object.entries(enggBreakdown).sort((a, b) => b[1] - a[1]);

  const currentData = activeTab === 'all' ? rows :
                      activeTab === 'pending' ? rows.filter(r => r.classification === 'PENDING') :
                      activeTab === 'new' ? rows.filter(r => r.classification === 'NEW') :
                      droppedRows;

  return (
    <div className="w-full flex-col space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Global Data Import Panel */}
      <div className={`glass-panel p-6 rounded-2xl border border-gray-700/50 transition-all duration-500 overflow-hidden ${(!result && rows.length === 0) || showImport ? 'max-h-[1000px]' : 'max-h-[70px] opacity-70 hover:opacity-100'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <UploadCloud className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-100">Data Import Dashboard</h2>
              {(!result && rows.length === 0) && <p className="text-gray-400 text-xs">Start by uploading your today's Flex WIP and yesterday's plan.</p>}
            </div>
          </div>
          {(result || rows.length > 0) && (
            <button 
              onClick={() => setShowImport(!showImport)}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-widest px-3 py-1 bg-blue-500/10 rounded-md border border-blue-500/20"
            >
              {showImport ? 'Close Import' : 'Update Data / Import'}
            </button>
          )}
        </div>

        {((!result && rows.length === 0) || showImport) && (
          <div className="space-y-6 animate-in zoom-in-95 duration-300">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-xs italic">
                {error}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                onClick={() => flexRef.current?.click()}
                className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer ${flexFile ? 'bg-green-500/5 border-green-500/30' : 'bg-gray-900/50 border-gray-800 hover:border-blue-500/50'}`}
              >
                <input type="file" className="hidden" ref={flexRef} onChange={handleFlexUpload} accept=".csv,.xlsx" />
                {flexFile ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span className="text-sm font-medium text-gray-200 truncate max-w-[150px]">{flexFile.name}</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-500">Upload Today's Flex WIP</span>
                )}
              </div>

              <div 
                onClick={() => yestRef.current?.click()}
                className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer ${yestFile ? 'bg-green-500/5 border-green-500/30' : 'bg-gray-900/50 border-gray-800 hover:border-blue-500/50'}`}
              >
                <input type="file" className="hidden" ref={yestRef} onChange={handleYestUpload} accept=".xlsx" />
                {yestFile ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span className="text-sm font-medium text-gray-200 truncate max-w-[150px]">{yestFile.name}</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-500">Upload Yesterday's Plan</span>
                )}
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-1 w-full">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 ml-1">City Filter</label>
                <select 
                  value={selectedCity} 
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full glass-input bg-gray-900 border-gray-800 text-xs py-2"
                >
                  {availableCities.length > 0 ? availableCities.map(c => (
                    <option key={c} value={c}>{c}</option>
                  )) : (
                    <option value="Chennai">Chennai (Auto-detect)</option>
                  )}
                </select>
              </div>

              <div className="flex-1 space-y-1 w-full">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 ml-1">Report Date</label>
                <input 
                  type="date" 
                  value={reportDate} 
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full glass-input bg-gray-900 border-gray-800 text-xs py-2"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={!flexData || !yesterdayData || isProcessing}
                className="flex-1 h-[34px] flex items-center justify-center gap-2 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs transition-all disabled:opacity-50 shadow-lg shadow-blue-900/20 w-full"
              >
                {isProcessing ? 'Processing...' : 'Run Analysis'}
                {!isProcessing && <ArrowRight className="h-3 w-3" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {(result || rows.length > 0) && (
        <>
          <div className="flex items-center justify-between glass-panel p-4 rounded-xl border border-gray-700/50">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => { reset(); setFlexFile(null); setYestFile(null); setShowImport(true); }}
                className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Start Over
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={loadHistory}
                className="flex items-center gap-2 text-sm px-4 py-2 border border-gray-600/30 rounded-lg hover:bg-gray-700/30 transition-all text-gray-400 font-medium"
              >
                <History className="h-4 w-4" /> History
              </button>

              <button
                onClick={handleExportSummary}
                className="flex items-center gap-2 text-sm px-4 py-2 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-all text-blue-400 font-medium"
              >
                <Download className="h-4 w-4" /> Download Counts
              </button>

              <button
                onClick={handleExportCallPlan}
                className="flex items-center gap-2 text-sm px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium tracking-wide shadow-[0_0_15px_rgba(37,99,235,0.3)] transition-all"
              >
                <Download className="h-4 w-4" /> Download Call Plan
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {allMetrics.map((m, i) => (
              <div key={i} className="glass-panel p-5 rounded-2xl flex items-center justify-between group hover:border-gray-600/80 transition-all duration-300 hover:scale-[1.02]">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${m.bg}`}>
                    <m.icon className={`h-6 w-6 ${m.color}`} />
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-tight">{m.label}</p>
                    <h4 className="text-3xl font-black tabular-nums tracking-tighter mt-1">{m.value}</h4>
                  </div>
                </div>
              </div>
            ))}
          </div>
            
          {sortedEnggs.length > 0 && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 ml-1">Engineer Allocation Breakdown</h3>
              <div className="flex flex-wrap gap-3">
                {sortedEnggs.map(([eng, count]) => (
                  <div key={eng} className="glass-panel px-4 py-3 rounded-xl border border-gray-700/30 flex items-center gap-3 hover:border-purple-500/40 transition-colors group bg-gray-800/40">
                    <div className="h-2 w-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
                    <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{eng}</span>
                    <span className="bg-gray-900 text-purple-400 text-xs font-bold px-2 py-0.5 rounded-lg border border-purple-500/20">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="glass-panel rounded-xl flex flex-col overflow-hidden border border-gray-700/50">
            <div className="flex bg-gray-900 border-b border-gray-700/80">
              {(['all', 'pending', 'new', 'dropped'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 text-sm font-medium capitalize tracking-wide transition-colors relative
                    ${activeTab === tab ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {tab === 'dropped' ? 'Closed(OTB)' : tab} Rows
                  {activeTab === tab && (
                    <div className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.8)]" />
                  )}
                </button>
              ))}
            </div>

            <div className="p-1">
              <DataTable 
                data={currentData} 
                isDroppedTab={activeTab === 'dropped'} 
                onAddRow={() => setIsModalOpen(true)}
              />
            </div>
          </div>
        </>
      )}

      {/* UPLOAD HISTORY MODAL */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="glass-panel w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl shadow-2xl border border-white/10 flex flex-col">
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                <History className="h-5 w-5 text-blue-400" />
                Upload History (Database)
              </h3>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/5 rounded-full text-gray-500 hover:text-white transition-all">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {uploadHistory.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">No files stored in database yet. Upload files and they will be saved automatically.</p>
              ) : (
                uploadHistory.map((f) => (
                  <div key={f.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700/30">
                    <div>
                      <p className="text-sm font-medium text-gray-200">{f.original_name}</p>
                      <p className="text-xs text-gray-500">
                        {f.file_type === 'flex_wip' ? 'Flex WIP' : f.file_type === 'call_plan' ? 'Call Plan' : 'Generated'}
                        {' '}&middot; {f.row_count} rows &middot; {f.city} &middot; {new Date(f.uploaded_at).toLocaleString()}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${
                      f.file_type === 'flex_wip' ? 'bg-blue-500/10 text-blue-400' :
                      f.file_type === 'call_plan' ? 'bg-amber-500/10 text-amber-400' :
                      'bg-green-500/10 text-green-400'
                    }`}>
                      {f.file_type.replace('_', ' ')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MANUAL ENTRY MODAL - COMPREHENSIVE FORM */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="glass-panel w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl shadow-2xl border border-white/10 flex flex-col animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h3 className="text-2xl font-black text-gray-100 flex items-center gap-3 tracking-tight">
                  <div className="p-2 bg-purple-500/20 rounded-xl">
                    <PlusCircle className="h-6 w-6 text-purple-400" />
                  </div>
                  New Work Order Entry
                </h3>
                <p className="text-gray-500 text-xs mt-1 ml-11 font-medium uppercase tracking-widest">Complete all 17 fields for a full record</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-white/5 rounded-full text-gray-500 hover:text-white transition-all"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            {/* Scrollable Form Body */}
            <div className="p-8 overflow-y-auto space-y-8 bg-gray-900/40 custom-scrollbar">
              
              {/* Row 1: Identification */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Type</label>
                  <select 
                    value={newRow.classification}
                    onChange={(e) => setNewRow({ ...newRow, classification: e.target.value as any })}
                    className="w-full glass-input bg-black/40 border-white/10 text-sm py-2.5 focus:border-purple-500/50"
                  >
                    <option value="NEW">NEW</option>
                    <option value="PENDING">PENDING</option>
                    <option value="DROPPED">CLOSED (OTB)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-purple-400 ml-1">Ticket No *</label>
                  <input 
                    type="text" 
                    placeholder="WO-XXXXXXXX"
                    value={newRow.ticketNo}
                    onChange={(e) => setNewRow({ ...newRow, ticketNo: e.target.value })}
                    className="w-full glass-input bg-black/40 border-purple-500/30 text-sm py-2.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-purple-400 ml-1">WO OTC Code</label>
                  <input 
                    type="text" 
                    placeholder="OTC Code..."
                    value={newRow.woOtcCode}
                    onChange={(e) => setNewRow({ ...newRow, woOtcCode: e.target.value })}
                    className="w-full glass-input bg-black/40 border-purple-500/20 text-sm py-2.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Case ID</label>
                  <input 
                    type="text" 
                    placeholder="E.g. 5xxxxxxx"
                    value={newRow.caseId}
                    onChange={(e) => setNewRow({ ...newRow, caseId: e.target.value })}
                    className="w-full glass-input bg-black/40 border-white/10 text-sm py-2.5"
                  />
                </div>
              </div>

              {/* Row 2: Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Month</label>
                  <input 
                    type="text" 
                    placeholder="E.g. Mar-24"
                    value={newRow.month}
                    onChange={(e) => setNewRow({ ...newRow, month: e.target.value })}
                    className="w-full glass-input bg-black/40 border-white/10 text-sm py-2.5"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Product Description</label>
                  <input 
                    type="text" 
                    placeholder="Full product name or model..."
                    value={newRow.product}
                    onChange={(e) => setNewRow({ ...newRow, product: e.target.value })}
                    className="w-full glass-input bg-black/40 border-white/10 text-sm py-2.5"
                  />
                </div>
              </div>

              {/* Row 3: Status & Aging */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">WIP Aging</label>
                  <input 
                    type="number" 
                    value={newRow.wipAging}
                    onChange={(e) => setNewRow({ ...newRow, wipAging: parseInt(e.target.value) || 0 })}
                    className="w-full glass-input bg-black/40 border-white/10 text-sm py-2.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Location / Area</label>
                  <input 
                    type="text" 
                    placeholder="E.g. Adyar, Chennai"
                    value={newRow.location}
                    onChange={(e) => setNewRow({ ...newRow, location: e.target.value })}
                    className="w-full glass-input bg-black/40 border-white/10 text-sm py-2.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Segment</label>
                  <select 
                    value={newRow.segment}
                    onChange={(e) => setNewRow({ ...newRow, segment: e.target.value })}
                    className="w-full glass-input bg-black/40 border-white/10 text-sm py-2.5"
                  >
                    <option value="Trade">Trade</option>
                    <option value="Consumer">Consumer</option>
                    <option value="Corporate">Corporate</option>
                  </select>
                </div>
              </div>

              {/* Row 4: Ownership & Flex Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">HP Owner</label>
                  <input 
                    type="text" 
                    value={newRow.hpOwner}
                    onChange={(e) => setNewRow({ ...newRow, hpOwner: e.target.value })}
                    className="w-full glass-input bg-black/40 border-white/10 text-sm py-2.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Flex Status</label>
                  <input 
                    type="text" 
                    value={newRow.flexStatus}
                    onChange={(e) => setNewRow({ ...newRow, flexStatus: e.target.value })}
                    className="w-full glass-input bg-black/40 border-white/10 text-sm py-2.5"
                  />
                </div>
              </div>

              {/* Row 5: Reports */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-amber-500/80 ml-1">Morning Report Status</label>
                  <select 
                    value={newRow.morningStatus}
                    onChange={(e) => setNewRow({ ...newRow, morningStatus: e.target.value })}
                    className="w-full glass-input bg-black/40 border-amber-500/20 text-sm py-2.5"
                  >
                    {MORNING_STATUS_OPTIONS.map(opt => (
                      <option key={opt} value={opt} className="bg-gray-900">{opt || '-- Select --'}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-blue-400/80 ml-1">Evening Report Status</label>
                  <input 
                    type="text" 
                    placeholder="Latest update..."
                    value={newRow.eveningStatus}
                    onChange={(e) => setNewRow({ ...newRow, eveningStatus: e.target.value })}
                    className="w-full glass-input bg-black/40 border-blue-500/20 text-sm py-2.5"
                  />
                </div>
              </div>

              {/* Row 6: Execution Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Current Status-TAT</label>
                  <input 
                    type="text" 
                    value={newRow.currentStatusTAT}
                    onChange={(e) => setNewRow({ ...newRow, currentStatusTAT: e.target.value })}
                    className="w-full glass-input bg-black/40 border-white/10 text-sm py-2.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Assigned Engg.</label>
                  <select 
                    value={newRow.engg}
                    onChange={(e) => setNewRow({ ...newRow, engg: e.target.value })}
                    className="w-full glass-input bg-black/40 border-white/10 text-sm py-2.5"
                  >
                    <option value="">Unassigned</option>
                    {engineers.filter(e => e).map(eng => (
                      <option key={eng} value={eng} className="bg-gray-900">{eng}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Contact No.</label>
                  <input 
                    type="text" 
                    value={newRow.contactNo}
                    onChange={(e) => setNewRow({ ...newRow, contactNo: e.target.value })}
                    className="w-full glass-input bg-black/40 border-white/10 text-sm py-2.5"
                  />
                </div>
              </div>

              {/* Row 7: Parts Information */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Parts Information</label>
                <textarea 
                  rows={2}
                  placeholder="Enter part details, part IDs, or notes..."
                  value={newRow.parts}
                  onChange={(e) => setNewRow({ ...newRow, parts: e.target.value })}
                  className="w-full glass-input bg-black/40 border-white/10 text-sm py-3 rounded-2xl resize-none"
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-8 bg-black/60 border-t border-white/5 flex gap-4">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-gray-400 hover:text-white hover:bg-white/10 transition-all border border-white/10 uppercase tracking-widest"
              >
                Cancel
              </button>
              <button 
                onClick={handleAddManualRow}
                className="flex-[2] py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-2xl text-sm font-black text-white transition-all shadow-2xl shadow-purple-900/40 uppercase tracking-widest flex items-center justify-center gap-3"
              >
                <Sparkles className="h-5 w-5" />
                Add Record to Database
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
