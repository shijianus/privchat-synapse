import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Button, LoadingSpinner } from '../ui';
import { useAuthStore } from '../../store/authStore';

const navigationItems = [
  { label: 'Overview', to: '/' },
  { label: 'Users', to: '/users' },
  { label: 'Bans', to: '/bans' },
  { label: 'Appeals', to: '/appeals' },
  { label: 'Announcements', to: '/announcements' },
  { label: 'Reports', to: '/reports' },
  { label: 'Logs', to: '/logs' },
  { label: 'Settings', to: '/settings' },
];

const DashboardLayout: React.FC = () => {
  const { user, logout, isLoading } = useAuthStore();

  if (isLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" label="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Matrix Dashboard</p>
            <h1 className="text-2xl font-bold text-gray-900">Administrative Control Panel</h1>
          </div>
          <div className="flex items-center space-x-5">
            <div>
              <p className="text-sm text-gray-600">Signed in as</p>
              <p className="text-base font-semibold text-gray-900">
                {user?.name ?? user?.email}
              </p>
              <p className="text-xs text-gray-500">
                Role: {user?.role?.name ?? 'unknown'}
              </p>
            </div>
            <Button variant="secondary" onClick={() => { void logout(); }}>
              Sign out
            </Button>
          </div>
        </div>
        <nav className="border-t border-gray-100">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex space-x-8">
              {navigationItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    [
                      'py-4 text-sm font-medium border-b-2 -mb-px transition-colors duration-200',
                      isActive
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
