import React from 'react';

const mockUsers = [
  { id: '1', name: 'Iris Liang', email: 'iris@example.com', role: 'super_admin', status: 'active', violations: 0 },
  { id: '2', name: 'Marcus Shen', email: 'marcus@example.com', role: 'admin', status: 'soft_ban', violations: 2 },
  { id: '3', name: 'Bot Agent', email: 'bot@example.com', role: 'operator', status: 'bot', violations: 0 },
  { id: '4', name: 'Appeal Monitor', email: 'appeals@example.com', role: 'moderator', status: 'active', violations: 1 },
];

const stats = [
  { label: 'Total Accounts', value: '4,218', helper: 'Active within past 30 days' },
  { label: 'Hard Bans', value: '48', helper: 'Strict lockouts per REQUEST.md §IV' },
  { label: 'Soft Bans', value: '141', helper: 'Cooling-off periods still running' },
  { label: 'Pending Registrations', value: '32', helper: 'Awaiting admin approval' },
];

const UsersPage: React.FC = () => {
  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="rounded-lg bg-white border border-gray-100 p-4 shadow">
            <p className="text-sm text-gray-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{item.value}</p>
            <p className="mt-1 text-xs text-gray-500">{item.helper}</p>
          </div>
        ))}
      </section>

      <section className="bg-white rounded-lg shadow border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Directory</h2>
            <p className="mt-1 text-sm text-gray-500">
              RBAC levels follow 5-tier hierarchy defined in REQUEST.md §III.
            </p>
          </div>
          <button className="text-sm font-medium text-primary-600 hover:text-primary-700">
            View filters
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Violations
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {mockUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{user.name}</div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                        user.status === 'active'
                          ? 'bg-green-50 text-green-700'
                          : user.status === 'soft_ban'
                            ? 'bg-yellow-50 text-yellow-700'
                            : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {user.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.violations}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default UsersPage;
