
import type { ClassifiedRow } from '../lib/types';
import { COLUMNS, MORNING_STATUS_OPTIONS } from '../lib/types';
import { useStore } from '../store/useStore';

interface DataTableProps {
  data: ClassifiedRow[];
  isDroppedTab: boolean;
}

export default function DataTable({ data, isDroppedTab }: DataTableProps) {
  const { updateRow, engineers } = useStore();

  if (data.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-gray-500 bg-gray-900/40">
        <p>No records found for this view.</p>
      </div>
    );
  }

  // Determine row color based on classification
  const getRowClass = (klass: string) => {
    switch (klass) {
      case 'PENDING': return 'border-l-4 border-l-amber-500/80 bg-amber-500/5 hover:bg-amber-500/10';
      case 'NEW': return 'border-l-4 border-l-green-500/80 bg-green-500/5 hover:bg-green-500/10';
      case 'DROPPED': return 'border-l-4 border-l-red-500/80 bg-red-500/5 hover:bg-red-500/10 opacity-70';
      default: return 'hover:bg-gray-800/40 border-l-4 border-l-transparent';
    }
  };

  const handleChange = (
    ticketNo: string,
    field: keyof ClassifiedRow,
    value: string
  ) => {
    updateRow(ticketNo, field, value);
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead className="bg-gray-800/80 text-gray-400 font-medium sticky top-0 z-10 shadow-sm">
          <tr>
            <th className="px-4 py-3">Type</th>
            {COLUMNS.map((col) => (
              <th key={col} className="px-4 py-3 border-l border-gray-700/50">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700/50">
          {data.map((row) => (
            <tr key={row.ticketNo} className={`transition-colors ${getRowClass(row.classification)}`}>
              {/* Type indicator */}
              <td className="px-4 py-3 font-semibold text-xs tracking-wider">
                {row.classification === 'PENDING' && <span className="text-amber-500">PENDING</span>}
                {row.classification === 'NEW' && <span className="text-green-500">NEW</span>}
                {row.classification === 'DROPPED' && <span className="text-red-500">CLOSED(OTB)</span>}
              </td>

              <td className="px-4 py-3 text-gray-400">{row.month || '-'}</td>
              <td className="px-4 py-3 font-mono text-gray-200">{row.ticketNo}</td>
              <td className="px-4 py-3 text-gray-300">{row.caseId}</td>
              <td className="px-4 py-3 truncate max-w-[200px]" title={row.product}>{row.product}</td>

              <td className="px-4 py-3 text-center">
                <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${row.wipAging > 5 ? 'bg-red-500/20 text-red-400' : 'bg-gray-700/50 text-gray-300'}`}>
                  {row.wipAging}
                </span>
              </td>

              <td className="px-2 py-2">
                <input
                  type="text"
                  value={row.location}
                  onChange={(e) => handleChange(row.ticketNo, 'location', e.target.value)}
                  disabled={isDroppedTab}
                  placeholder="Area..."
                  className="w-full bg-transparent border border-transparent hover:border-gray-600 focus:border-blue-500 focus:bg-gray-900 px-2 py-1 rounded transition-all disabled:opacity-50"
                />
              </td>

              <td className="px-4 py-3 text-blue-400 font-medium">{row.segment}</td>

              <td className="px-4 py-3 text-gray-300">{row.hpOwner || '-'}</td>
              <td className="px-4 py-3 text-gray-300 italic text-xs">{row.flexStatus || '-'}</td>

              <td className="px-2 py-2">
                <select
                  value={row.morningStatus}
                  onChange={(e) => handleChange(row.ticketNo, 'morningStatus', e.target.value)}
                  disabled={isDroppedTab}
                  className="w-full bg-transparent border border-transparent hover:border-gray-600 focus:border-blue-500 focus:bg-gray-900 px-2 py-1 rounded transition-all appearance-none cursor-pointer disabled:opacity-50"
                  style={{ backgroundImage: 'none' }} // Hide default dropdown arrow
                >
                  <option value="" className="bg-gray-900">-- Select --</option>
                  {MORNING_STATUS_OPTIONS.filter(opt => opt !== '').map(opt => (
                    <option key={opt} value={opt} className="bg-gray-900">{opt}</option>
                  ))}
                  {/* Allow custom existing status not in list */}
                  {!MORNING_STATUS_OPTIONS.includes(row.morningStatus) && row.morningStatus !== '' && (
                    <option value={row.morningStatus} className="bg-gray-900">{row.morningStatus}</option>
                  )}
                </select>
              </td>

              <td className="px-4 py-3 text-gray-500 italic">{row.eveningStatus || '-'}</td>

              <td className="px-2 py-2">
                <input
                  type="text"
                  value={row.currentStatusTAT}
                  onChange={(e) => handleChange(row.ticketNo, 'currentStatusTAT', e.target.value)}
                  disabled={isDroppedTab}
                  className="w-full min-w-[150px] bg-transparent border border-transparent hover:border-gray-600 focus:border-blue-500 focus:bg-gray-900 px-2 py-1 rounded transition-all disabled:opacity-50 text-xs"
                />
              </td>

              <td className="px-2 py-2">
                <select
                  value={row.engg}
                  onChange={(e) => handleChange(row.ticketNo, 'engg', e.target.value)}
                  disabled={isDroppedTab}
                  className="w-full bg-transparent border border-transparent hover:border-gray-600 focus:border-blue-500 focus:bg-gray-900 px-2 py-1 rounded transition-all appearance-none cursor-pointer disabled:opacity-50"
                  style={{ backgroundImage: 'none' }}
                >
                  <option value="" className="bg-gray-900">Unassigned</option>
                  {engineers.filter(e => e !== '').map(eng => (
                    <option key={eng} value={eng} className="bg-gray-900">{eng}</option>
                  ))}
                  {/* Provide pre-existing missing ones */}
                  {!engineers.includes(row.engg) && row.engg !== '' && (
                    <option value={row.engg} className="bg-gray-900">{row.engg}</option>
                  )}
                </select>
              </td>

              <td className="px-4 py-3 text-gray-300 font-mono text-xs">{row.contactNo}</td>

              <td className="px-2 py-2">
                <input
                  type="text"
                  value={row.parts}
                  onChange={(e) => handleChange(row.ticketNo, 'parts', e.target.value)}
                  disabled={isDroppedTab}
                  placeholder="Parts info..."
                  className="w-full min-w-[120px] bg-transparent border border-transparent hover:border-gray-600 focus:border-blue-500 focus:bg-gray-900 px-2 py-1 rounded transition-all disabled:opacity-50 text-xs"
                />
              </td>

              <td className="px-4 py-3 text-center">
                <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${row.wipChanged === 'Yes' ? 'bg-orange-500/20 text-orange-400' :
                    row.wipChanged === 'New' ? 'bg-green-500/20 text-green-400' :
                      'bg-gray-700/50 text-gray-400'
                  }`}>
                  {row.wipChanged || '-'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
