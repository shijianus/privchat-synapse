import React from 'react';

const appealStats = [
  { label: 'Pending Appeals', value: '27', accent: 'bg-amber-500' },
  { label: 'Approved (30d)', value: '63', accent: 'bg-green-500' },
  { label: 'Rejected (30d)', value: '41', accent: 'bg-rose-500' },
  { label: 'Bot Coverage', value: '100%', accent: 'bg-blue-500' },
];

const checkpoints = [
  'Bot collects email + violation acknowledgement',
  'Dashboard API validates rate limits and violation ladder',
  'Administrators record decision & reasoning (Towncrier fragment ready)',
  'Bot relays verdict through encrypted DM, email fallback for hard bans',
];

const AppealsPage: React.FC = () => {
  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {appealStats.map((item) => (
          <div key={item.label} className="rounded-lg bg-white border border-gray-100 p-4 shadow">
            <p className="text-sm text-gray-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{item.value}</p>
            <span className={`mt-3 inline-flex h-2 w-12 rounded-full ${item.accent}`} />
          </div>
        ))}
      </section>

      <section className="bg-white rounded-lg shadow border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Workflow</h2>
            <p className="mt-1 text-sm text-gray-500">REQUEST.md §V mandates the following path.</p>
          </div>
          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
            Bot Integrated
          </span>
        </div>
        <div className="px-6 py-6">
          <ol className="space-y-3">
            {checkpoints.map((item, index) => (
              <li key={item} className="flex items-start space-x-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 text-primary-600 text-sm font-semibold">
                  {index + 1}
                </span>
                <p className="text-sm text-gray-700">{item}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-white rounded-lg shadow border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Rate Limits</h2>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Per ban severity</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Ban Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Appeals Via Bot
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Email Appeals
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100 text-sm text-gray-700">
              <tr>
                <td className="px-6 py-4 font-medium text-gray-900">Temporary ban</td>
                <td className="px-6 py-4">3 attempts (duration reduction) + 2 direct unban</td>
                <td className="px-6 py-4">N/A</td>
                <td className="px-6 py-4">Rate limited per requester to prevent abuse</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-gray-900">Permanent soft ban</td>
                <td className="px-6 py-4">2 conversions + 1 unban</td>
                <td className="px-6 py-4">Optional with manual verification</td>
                <td className="px-6 py-4">Requires acknowledgement of past violations</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-gray-900">Permanent hard ban</td>
                <td className="px-6 py-4">0 (Bot disabled)</td>
                <td className="px-6 py-4">1 appeal via security email</td>
                <td className="px-6 py-4">Outcome restricted to conversion to temporary ban</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AppealsPage;
