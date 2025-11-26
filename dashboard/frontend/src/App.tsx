import React, { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { LoadingSpinner } from './components/ui';
import './index.css';

function App() {
  const { user, isAuthenticated, isLoading, initializeAuth } = useAuthStore();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" label="Initializing dashboard..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Matrix Dashboard</h1>
            <p className="text-gray-600">Administrative Management System</p>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                Please configure the dashboard backend API and login functionality to continue.
              </p>
            </div>
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800 font-medium mb-2">Frontend Status: Ready</p>
              <ul className="text-xs text-green-700 space-y-1">
                <li>✅ React + TypeScript setup complete</li>
                <li>✅ Tailwind CSS configured</li>
                <li>✅ Core components created</li>
                <li>✅ Authentication store ready</li>
                <li>✅ API service layer implemented</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-xl font-semibold text-gray-900">Matrix Dashboard</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Welcome, {user?.name || user?.email}
              </span>
              <div className="h-8 w-8 bg-primary-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Dashboard Cards */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-primary-500 rounded-md flex items-center justify-center">
                      <span className="text-white text-sm font-medium">U</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">User Management</dt>
                      <dd className="text-lg font-medium text-gray-900">Manage Users</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-warning-500 rounded-md flex items-center justify-center">
                      <span className="text-white text-sm font-medium">B</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Ban Control</dt>
                      <dd className="text-lg font-medium text-gray-900">Risk Management</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-success-500 rounded-md flex items-center justify-center">
                      <span className="text-white text-sm font-medium">A</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Appeals</dt>
                      <dd className="text-lg font-medium text-gray-900">Review Appeals</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Status Section */}
          <div className="mt-8 bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">System Status</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="p-4 bg-green-50 rounded-md">
                  <p className="text-sm font-medium text-green-800">Frontend</p>
                  <p className="text-xs text-green-600 mt-1">Operational</p>
                </div>
                <div className="p-4 bg-yellow-50 rounded-md">
                  <p className="text-sm font-medium text-yellow-800">Backend API</p>
                  <p className="text-xs text-yellow-600 mt-1">Configuration Required</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-md">
                  <p className="text-sm font-medium text-blue-800">Database</p>
                  <p className="text-xs text-blue-600 mt-1">Schema Ready</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-md">
                  <p className="text-sm font-medium text-gray-800">Matrix Bot</p>
                  <p className="text-xs text-gray-600 mt-1">Not Started</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
