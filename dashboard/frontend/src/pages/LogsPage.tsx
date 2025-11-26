import React from 'react';

const logEntries = [
  {
    id: 'LOG-1001',
    actor: 'super_admin@matrix.local',
    action: 'Lifted soft ban for @hazel:server',
    timestamp: '2025-11-25T10:24:00Z',
    risk: 'low',
  },
  {
    id: 'LOG-1002',
    actor: 'moderator@matrix.local',
    action: 'Rejected appeal for @nadir:server',
    timestamp: '2025-11-25T09:15:00Z',
    risk: 'medium',
  },
  {
    id: 'LOG-1003',
    actor: 'bot@matrix.local',
    action: 'Recorded friend verification challenge',
    timestamp: '2025-11-25T08:53:00Z',
    risk: 'info',
  },
];

const LogsPage: React.FC = () => {
  return (
    <div className="space-y-8">
      <section className="bg-white rounded-lg shadow border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Operation Logs</h2>
            <p className="mt-1 text-sm text-gray-500">
              Stored within dashboard schema with immutable audit fields and streaming export hooks.
            </p>
          </div>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            PostgreSQL + Redis
          </span>
        </div>
        <ul className="divide-y divide-gray-100">
          {logEntries.map((entry) => (
            <li key={entry.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{entry.action}</p>
                <p className="mt-1 text-xs text-gray-500">
                  Actor: {entry.actor} · {new Date(entry.timestamp).toLocaleString()}
                </p>
              </div>
              <span
                className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium md:mt-0 ${
                  entry.risk === 'low'
                    ? 'bg-green-50 text-green-700'
                    : entry.risk === 'medium'
                      ? 'bg-yellow-50 text-yellow-700'
                      : 'bg-blue-50 text-blue-700'
                }`}
              >
                {entry.risk.toUpperCase()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default LogsPage;
