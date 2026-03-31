import React, { useRef, useState } from 'react';
import { UploadCloud, CheckCircle, ArrowRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { parseCSV, parseXLSX, detectCities, findOpenCallSheet } from '../lib/fileIO';
import { processCallPlan } from '../lib/engine';

export default function UploadView() {
  const { 
    setFlexData, 
    setYesterdayData, 
    selectedCity, 
    setSelectedCity, 
    availableCities, 
    reportDate, 
    setReportDate,
    flexData,
    yesterdayData,
    setStep,
    setResult,
    setRows,
    setDroppedRows
  } = useStore();

  const [flexFile, setFlexFile] = useState<File | null>(null);
  const [yestFile, setYestFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const flexRef = useRef<HTMLInputElement>(null);
  const yestRef = useRef<HTMLInputElement>(null);

  const handleFlexUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      let data: Record<string, unknown>[];
      if (file.name.endsWith('.csv')) {
        data = await parseCSV(file);
      } else {
        const parsed = await parseXLSX(file);
        // CRITICAL: Flex XLSX has multiple sheets — "Pivot" (summary) and "Data" (actual WOs).
        // We MUST use the "Data" sheet. Fall back to the largest sheet if "Data" not found.
        let flexSheetName = parsed.sheets.find(
          s => s.toLowerCase() === 'data'
        );
        if (!flexSheetName) {
          // Fallback: pick the sheet with the most rows (skip small summary sheets)
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
    } catch (err) {
      setError('Failed to parse Flex file. Please ensure it is a valid CSV or XLSX download.');
      console.error(err);
    }
  };

  const handleYestUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const parsed = await parseXLSX(file);
      const sheetName = findOpenCallSheet(parsed.sheets);
      if (!sheetName) {
        throw new Error('Could not find "Open Call" sheet in the selected file.');
      }
      setYesterdayData(parsed.data[sheetName]);
      setYestFile(file);
    } catch (err: any) {
      setError(err.message || 'Failed to parse Yesterday\'s file. Ensure it is a valid XLSX file.');
      console.error(err);
    }
  };

  const handleGenerate = () => {
    if (!flexData || !yesterdayData) return;
    setIsProcessing(true);
    
    // Slight timeout strictly for UX (processing feeling)
    setTimeout(() => {
      try {
        const result = processCallPlan(flexData, yesterdayData, selectedCity, new Date(reportDate));
        
        setResult(result);
        setRows(result.all);
        setDroppedRows(result.dropped);
        setStep('review');
        
      } catch (err: any) {
        setError('Error generating plan: ' + err.message);
        setIsProcessing(false);
      }
    }, 400);
  };

  const UploadBox = ({ 
    title, desc, file, inputRef, onUpload, accept 
  }: { 
    title: string; desc: string; file: File | null; 
    inputRef: React.RefObject<HTMLInputElement | null>;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    accept: string;
  }) => (
    <div 
      onClick={() => inputRef.current?.click()}
      className={`glass-panel p-8 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 transform hover:scale-[1.02] border border-gray-700/50 hover:border-blue-500/50 group ${file ? 'bg-gray-800/80 border-green-500/30' : ''}`}
    >
      <input type="file" className="hidden" ref={inputRef} onChange={onUpload} accept={accept} />
      
      {file ? (
        <>
          <div className="h-16 w-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-100">{file.name}</h3>
          <p className="text-sm text-gray-400 mt-2">File loaded successfully</p>
        </>
      ) : (
        <>
          <div className="h-16 w-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
            <UploadCloud className="h-8 w-8 text-gray-400 group-hover:text-blue-400 transition-colors" />
          </div>
          <h3 className="text-lg font-medium text-gray-200">{title}</h3>
          <p className="text-sm text-gray-400 mt-2">{desc}</p>
        </>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold tracking-tight mb-3">Daily Call Plan Generator</h1>
        <p className="text-gray-400 text-lg">Upload today's Flex WIP and yesterday's plan to instantly generate the new Open Call sheet.</p>
      </div>

      {error && (
        <div className="w-full bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-8 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mb-10">
        <UploadBox 
          title="Today's Flex WIP" 
          desc="Download from HP Flex Portal (CSV format)"
          file={flexFile}
          inputRef={flexRef}
          onUpload={handleFlexUpload}
          accept=".csv,.xlsx"
        />
        <UploadBox 
          title="Yesterday's Call Plan" 
          desc="The previous Excel file sent to HP (XLSX format)"
          file={yestFile}
          inputRef={yestRef}
          onUpload={handleYestUpload}
          accept=".xlsx"
        />
      </div>

      <div className={`w-full glass-panel p-6 rounded-2xl transition-all duration-500 ${flexFile && yestFile ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-4 pointer-events-none'}`}>
        <div className="flex flex-col md:flex-row gap-6 items-end justify-between">
          
          <div className="flex-1 space-y-2 w-full">
            <label className="text-sm font-medium text-gray-300 block">ASP City Filter</label>
            <div className="relative">
              <select 
                value={selectedCity} 
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full glass-input appearance-none px-4 py-3 bg-gray-900 border border-gray-700 text-gray-100 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              >
                {availableCities.length > 0 ? availableCities.map(c => (
                  <option key={c} value={c}>{c}</option>
                )) : (
                  <option value="Chennai">Chennai (Auto-detected soon)</option>
                )}
              </select>
            </div>
          </div>

          <div className="flex-1 space-y-2 w-full">
            <label className="text-sm font-medium text-gray-300 block">Report Date</label>
            <input 
              type="date" 
              value={reportDate} 
              onChange={(e) => setReportDate(e.target.value)}
              className="w-full glass-input px-4 py-3 bg-gray-900 border border-gray-700 text-gray-100 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={!flexFile || !yestFile || isProcessing}
            className="w-full md:w-auto h-12 flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase text-sm tracking-wider"
          >
            {isProcessing ? 'Processing...' : 'Generate Plan'}
            {!isProcessing && <ArrowRight className="h-4 w-4" />}
          </button>

        </div>
      </div>
    </div>
  );
}
