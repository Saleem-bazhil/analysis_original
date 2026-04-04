import { useStore } from '../store/useStore';
import DataTable from './DataTable';
import { Download, FileDown, ArrowLeft, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { exportSummaryXLSX, exportCallPlanXLSX } from '../lib/fileIO';


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
    engineers
  } = useStore();

  if (!result) return null;

  const handleExportSummary = () => {
    try {
      const enggCount = engineers.filter(e => e.trim() !== '').length;
      exportSummaryXLSX(rows, enggCount, selectedCity, reportDate);
    } catch (e) {
      alert("Summary Export failed.");
      console.error(e);
    }
  };

  const handleExportCallPlan = () => {
    try {
      exportCallPlanXLSX(rows, droppedRows, selectedCity, reportDate);
    } catch (e) {
      alert("Call Plan Export failed.");
      console.error(e);
    }
  };

  // ── Dynamic Metric Calculations (Real-time Accuracy) ──
  // Core Metrics
  const totalEngineersCount = engineers.filter(e => e.trim() !== '').length;
  const enggPresentCount = new Set(rows.map(r => r.engg).filter(e => e && e.trim() !== '')).size;
  const openCallsCount = rows.length;
  const actionableCount = rows.filter(r => r.morningStatus.toLowerCase() === 'actionable').length;
  const plannedCallsCount = rows.filter(r => r.engg && r.engg.trim() !== '').length;

  // Status-based Metrics
  const enggOnsiteCount = rows.filter(r => r.morningStatus.toLowerCase() === 'engg onsite').length;
  const toScheduleCount = rows.filter(r => r.morningStatus.toLowerCase() === 'to be scheduled').length;
  const cxRescheduleCount = rows.filter(r => r.morningStatus.toLowerCase() === 'cx reschedule' || r.morningStatus.toLowerCase() === 'cx pending').length;
  const sscPendingCount = rows.filter(r => r.morningStatus.toLowerCase() === 'ssc pending').length;
  const techSupportCount = rows.filter(r => r.morningStatus.toLowerCase() === 'elevate/tech support').length;
  const observationCount = rows.filter(r => r.morningStatus.toLowerCase() === 'under observation').length;
  const toYankCount = rows.filter(r => r.morningStatus.toLowerCase() === 'to be yank').length;
  const toCancelCount = rows.filter(r => r.morningStatus.toLowerCase().includes('cancel') && r.morningStatus.toLowerCase() !== 'closed cancelled').length;
  const partOrderedCount = rows.filter(r => r.morningStatus.toLowerCase() === 'additional part').length;
  const newCallsCount = rows.filter(r => r.classification === 'NEW').length;
  const tradeCount = rows.filter(r => r.segment.toLowerCase() === 'trade').length;

  // Outcome Metrics
  const closedCount = rows.filter(r => r.morningStatus.toLowerCase() === 'closed').length;
  const closedCancelledCount = rows.filter(r => r.morningStatus.toLowerCase() === 'closed cancelled').length;

  // Engineer Breakdown
  const enggBreakdown = rows.reduce((acc, row) => {
    if (row.engg && row.engg.trim() !== '') {
      acc[row.engg] = (acc[row.engg] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const sortedEnggs = Object.entries(enggBreakdown).sort((a, b) => b[1] - a[1]);

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
    { label: 'Closed(OTB)', value: result.metrics.droppedCount, icon: FileDown, color: 'text-red-400', bg: 'bg-red-500/10' },
  ];

  const currentData = activeTab === 'all' ? rows :
                      activeTab === 'pending' ? rows.filter(r => r.classification === 'PENDING') :
                      activeTab === 'new' ? rows.filter(r => r.classification === 'NEW') :
                      droppedRows;

  return (
    <div className="w-full flex-col space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Top Header Actions */}
      <div className="flex items-center justify-between glass-panel p-4 rounded-xl border border-gray-700/50">
        <button 
          onClick={reset}
          className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Start Over
        </button>
        
        <div className="flex items-center gap-3">
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

      {/* Metrics Dashboard - Flat Grid */}
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
        
      {/* Engineer Breakdown Section (Moved back to Bottom) */}
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

      {/* Main Table Interface */}
      <div className="glass-panel rounded-xl flex flex-col overflow-hidden border border-gray-700/50">
        {/* Tabs */}
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

        {/* Dynamic Table */}
        <div className="p-1">
          <DataTable data={currentData} isDroppedTab={activeTab === 'dropped'} />
        </div>
      </div>
    </div>
  );
}
