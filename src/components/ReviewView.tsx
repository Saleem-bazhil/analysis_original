import { useStore } from '../store/useStore';
import DataTable from './DataTable';
import { Download, FileDown, ArrowLeft, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { exportCSV, exportXLSX } from '../lib/fileIO';


export default function ReviewView() {
  const { 
    result, 
    rows, 
    droppedRows, 
    activeTab, 
    setActiveTab, 
    reset, 
    selectedCity, 
    reportDate 
  } = useStore();

  if (!result) return null;

  const handleExportXLSX = () => {
    try {
      exportXLSX(rows, droppedRows, selectedCity, reportDate);
    } catch (e) {
      alert("Export failed. File might be in use.");
      console.error(e);
    }
  };

  const handleExportCSV = () => {
    try {
      exportCSV(rows, `${selectedCity}_${reportDate}_Call_Plan.csv`);
    } catch (e) {
      alert("Export failed.");
      console.error(e);
    }
  };

  // Status Cards definition
  const metrics = [
    { label: 'Total Plan Call', value: result.metrics.finalCount, icon: RefreshCw, color: 'text-blue-400' },
    { label: 'Pending (Carried)', value: result.metrics.pendingCount, icon: AlertCircle, color: 'text-amber-400' },
    { label: 'New Entries', value: result.metrics.newCount, icon: Sparkles, color: 'text-green-400' },
    { label: 'Dropped', value: result.metrics.droppedCount, icon: FileDown, color: 'text-red-400' },
    { label: 'Total Flex WIP', value: result.metrics.flexTotal, icon: RefreshCw, color: 'text-gray-400' },
  ];

  const currentData = activeTab === 'all' ? rows :
                      activeTab === 'pending' ? rows.filter(r => r.classification === 'PENDING') :
                      activeTab === 'new' ? rows.filter(r => r.classification === 'NEW') :
                      droppedRows;

  return (
    <div className="w-full flex-col space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
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
            onClick={handleExportCSV}
            className="flex items-center gap-2 text-sm px-4 py-2 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors text-gray-300"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
          
          <button 
            onClick={handleExportXLSX}
            className="flex items-center gap-2 text-sm px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium tracking-wide shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all"
          >
            <Download className="h-4 w-4" /> Export XLSX
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {metrics.map((m, i) => (
          <div key={i} className="glass-panel p-5 rounded-xl flex items-center gap-4">
            <div className={`p-3 rounded-lg bg-gray-800/80 ${m.color.replace('text', 'bg').replace('400', '500/20')}`}>
              <m.icon className={`h-6 w-6 ${m.color}`} />
            </div>
            <div>
              <p className="text-gray-400 text-sm font-medium">{m.label}</p>
              <h4 className="text-2xl font-bold tracking-tight">{m.value}</h4>
            </div>
          </div>
        ))}
      </div>

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
              {tab} Rows
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
