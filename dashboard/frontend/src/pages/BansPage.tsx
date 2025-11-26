import React from 'react';

const banMatrix = [
  {
    level: 'Minor',
    actions: ['8-hour mute', '7-day soft ban', '14-day soft ban', '1-month soft ban'],
    notes: 'Triggered by repeated low-risk spam per REQUEST.md §IV.',
  },
  {
    level: 'Standard',
    actions: ['24-hour mute', '2-month soft ban', '4-month soft ban', '1-year soft ban'],
    notes: 'Covers standard violations with progressive escalation.',
  },
  {
    level: 'Severe',
    actions: ['72-hour mute', '8-month hard ban', '2-year hard ban', 'Account deletion'],
    notes: 'Permanent bans communicate via Bot or manual email.',
  },
];

const BansPage: React.FC = () => {
  return (
    <div className="space-y-8">
      <section className="bg-white rounded-lg shadow border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Penalty Structure</h2>
          <p className="mt-1 text-sm text-gray-500">
            Synapse enforces controls via shared database state while Dashboard handles issuance,
            cache invalidation, and Redis pub/sub.
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {banMatrix.map((tier) => (
            <div key={tier.level} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold text-gray-900">{tier.level} Violations</p>
                  <p className="text-sm text-gray-500">{tier.notes}</p>
                </div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Dashboard Controlled
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                {tier.actions.map((action) => (
                  <div
                    key={action}
                    className="rounded-md border border-dashed border-gray-200 p-3 bg-gray-50 text-sm font-medium text-gray-700"
                  >
                    {action}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-lg shadow border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Realtime Enforcement Signals</h2>
            <p className="mt-1 text-sm text-gray-500">
              Redis topic `dashboard.risk_control.invalidate` coordinates cache refreshes.
            </p>
          </div>
          <span className="text-xs font-semibold text-primary-600 uppercase tracking-wide">
            Pub/Sub Ready
          </span>
        </div>
        <div className="p-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-gray-100 p-4">
            <p className="text-sm text-gray-500">Soft Ban Updates</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">~420 / day</p>
            <p className="mt-1 text-xs text-gray-500">Typically triggered by moderation team</p>
          </div>
          <div className="rounded-lg border border-gray-100 p-4">
            <p className="text-sm text-gray-500">Hard Ban Updates</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">12 / day</p>
            <p className="mt-1 text-xs text-gray-500">Immediately terminates active logins</p>
          </div>
          <div className="rounded-lg border border-gray-100 p-4">
            <p className="text-sm text-gray-500">Cooling-Off Windows</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">60 days</p>
            <p className="mt-1 text-xs text-gray-500">Applies to soft deletion states</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default BansPage;
