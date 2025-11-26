import React from 'react';

const statusCards = [
  { label: 'Backend API', description: '95% complete, awaiting docs & more tests', status: 'Healthy', accent: 'bg-green-500' },
  { label: 'Frontend', description: '30% complete, navigation & data binding pending', status: 'Needs focus', accent: 'bg-yellow-500' },
  { label: 'Matrix Bot', description: '0% complete, depends on messaging APIs', status: 'Not started', accent: 'bg-rose-500' },
  { label: 'Deployment', description: 'Docker orchestration pending', status: 'In planning', accent: 'bg-blue-500' },
];

const priorityRoadmap = [
  {
    title: 'Week 1: Authentication + Navigation',
    detail: 'Finish dashboard routing, connect Zustand auth store, and align permissions.',
    owner: 'Frontend Team',
  },
  {
    title: 'Week 2: User & Ban Consoles',
    detail: 'Implement data tables, filters, and ban workflows backed by API service.',
    owner: 'Frontend + Backend',
  },
  {
    title: 'Week 3: Appeals & Auditing',
    detail: 'Wire bot-ready appeal flows, decision logging, and audit exports.',
    owner: 'Governance Squad',
  },
];

const DashboardHomePage: React.FC = () => {
  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statusCards.map((item) => (
          <div key={item.label} className="rounded-lg bg-white shadow border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">{item.label}</p>
              <span className={`h-2 w-2 rounded-full ${item.accent}`} />
            </div>
            <p className="mt-3 text-xl font-semibold text-gray-900">{item.status}</p>
            <p className="mt-2 text-sm text-gray-600">{item.description}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 bg-white rounded-lg shadow border border-gray-100">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Execution Roadmap</h2>
            <p className="mt-1 text-sm text-gray-500">
              Tasks extracted from REQUEST.md planning milestones.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {priorityRoadmap.map((item) => (
              <div key={item.title} className="px-6 py-4">
                <p className="text-base font-medium text-gray-900">{item.title}</p>
                <p className="mt-1 text-sm text-gray-600">{item.detail}</p>
                <p className="mt-2 text-xs font-semibold text-primary-600 uppercase tracking-wide">
                  Owner: {item.owner}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900">Readiness Checklist</h2>
          <ul className="mt-4 space-y-3 text-sm text-gray-700">
            <li>✅ Database schema complete with 2FA and message sync tables</li>
            <li>✅ Redis cache invalidation channels ready for risk control</li>
            <li>⚠️ Frontend routing & state management must reach parity</li>
            <li>⚠️ Bot service blocked until appeals UI is functional</li>
            <li>⚙️ Docker stack needs dashboard API, Bot, and Nginx services</li>
          </ul>
        </div>
      </section>

      <section className="bg-white rounded-lg shadow border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Operational Metrics (Target)</h2>
            <p className="mt-1 text-sm text-gray-500">
              Targets defined in REQUEST.md §XIII for initial releases.
            </p>
          </div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Internal Only
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          <div className="p-6">
            <p className="text-sm text-gray-500">Risk Control Response</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">&lt; 50ms</p>
            <p className="mt-1 text-xs text-gray-500">
              Cache invalidation via Redis pub/sub with TTL fallback
            </p>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-500">Media Deduplication</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">&gt; 65%</p>
            <p className="mt-1 text-xs text-gray-500">
              Metadata-driven policies before object storage synchronization
            </p>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-500">Appeal Handling SLA</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">&lt; 4h</p>
            <p className="mt-1 text-xs text-gray-500">
              Bot to dashboard API integration delivers instant notifications
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DashboardHomePage;
