import { create } from 'zustand';
import type { AppStep, ClassifiedRow, ProcessingResult } from '../lib/types';
import { DEFAULT_ENGINEERS } from '../lib/types';
import { isValidWO } from '../lib/engine';

interface AppState {
  // Navigation
  step: AppStep;
  setStep: (step: AppStep) => void;

  // Auth state
  isLoggedIn: boolean;
  username: string;
  setLoggedIn: (isLoggedIn: boolean) => void;
  setUsername: (username: string) => void;
  logout: () => void;

  // Upload state
  flexData: Record<string, unknown>[] | null;
  yesterdayData: Record<string, unknown>[] | null;
  availableCities: string[];
  selectedCity: string;
  reportDate: string; // YYYY-MM-DD
  setFlexData: (data: Record<string, unknown>[], cities: string[]) => void;
  setYesterdayData: (data: Record<string, unknown>[]) => void;
  setSelectedCity: (city: string) => void;
  setReportDate: (date: string) => void;

  // Processing result
  result: ProcessingResult | null;
  setResult: (result: ProcessingResult) => void;

  // Editable rows (the working copy)
  rows: ClassifiedRow[];
  droppedRows: ClassifiedRow[];
  setRows: (rows: ClassifiedRow[]) => void;
  setDroppedRows: (rows: ClassifiedRow[]) => void;
  addRow: (row: ClassifiedRow) => void;
  updateRow: (ticketNo: string, field: keyof ClassifiedRow, value: string | number) => void;

  // Active tab in review
  activeTab: 'all' | 'pending' | 'new' | 'dropped';
  setActiveTab: (tab: 'all' | 'pending' | 'new' | 'dropped') => void;

  // Engineer list (configurable)
  engineers: string[];
  setEngineers: (engineers: string[]) => void;

  // Reset
  reset: () => void;
}

const today = new Date().toISOString().split('T')[0];

export const useStore = create<AppState>((set) => ({
  step: 'login',
  setStep: (step) => set({ step }),

  isLoggedIn: false,
  username: '',
  setLoggedIn: (isLoggedIn) => set({ isLoggedIn }),
  setUsername: (username) => set({ username }),
  logout: () => set({
    isLoggedIn: false,
    username: '',
    step: 'login',
    flexData: null,
    yesterdayData: null,
    availableCities: [],
    selectedCity: 'all',
    reportDate: today,
    result: null,
    rows: [],
    droppedRows: [],
    activeTab: 'all',
  }),

  flexData: null,
  yesterdayData: null,
  availableCities: [],
  selectedCity: 'Chennai',
  reportDate: today,
  setFlexData: (data, cities) => set({
    flexData: data,
    availableCities: cities.length > 0 ? ['all', ...cities] : [],
    selectedCity: 'all',
  }),
  setYesterdayData: (data) => set({ yesterdayData: data }),
  setSelectedCity: (city) => set({ selectedCity: city }),
  setReportDate: (date) => set({ reportDate: date }),

  result: null,
  setResult: (result) => set({ result }),

  rows: [],
  droppedRows: [],
  setRows: (rows) => set({ rows }),
  setDroppedRows: (rows) => set({ droppedRows: rows }),
  
  addRow: (row) => set((state) => {
    const trimmedWO = row.ticketNo.trim().toUpperCase();
    if (!isValidWO(trimmedWO)) {
       alert('Invalid Work Order Format (Expected: WO-XXXXXXXXX)');
       return state;
    }
    const exists = state.rows.some(r => r.ticketNo.trim().toUpperCase() === trimmedWO);
    if (exists) {
      alert(`Work Order ${trimmedWO} already exists in the table.`);
      return state;
    }
    return { rows: [row, ...state.rows] };
  }),

  updateRow: (ticketNo, field, value) =>
    set((state) => {
      const up = (r: ClassifiedRow) => 
        r.ticketNo.trim().toUpperCase() === ticketNo.trim().toUpperCase() ? { ...r, [field]: value } : r;
      
      return {
        rows: state.rows.map(up),
        droppedRows: state.droppedRows.map(up)
      };
    }),

  activeTab: 'all',
  setActiveTab: (tab) => set({ activeTab: tab }),

  engineers: DEFAULT_ENGINEERS,
  setEngineers: (engineers) => set({ engineers }),

  reset: () =>
    set({
      step: 'review',
      flexData: null,
      yesterdayData: null,
      availableCities: [],
      selectedCity: 'all',
      reportDate: today,
      result: null,
      rows: [],
      droppedRows: [],
      activeTab: 'all',
    }),
}));
