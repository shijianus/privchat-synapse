import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';

interface ReportItem {
  id: string;
  reporter: string;
  target: string;
  reason: string;
  description?: string | null;
  createdAt: string;
}

const ReportsPage: React.FC = () => {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.listReports({ limit: 100, offset: 0 });
      setItems(res.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载失败';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">用户举报</h1>
          <p className="text-sm text-gray-500">
            来自 Bot 的举报记录，需 moderator 及以上处理。数据来源：dashboard.operation_logs (action =
            user.report)。
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center px-3 py-2 rounded bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="bg-white rounded-lg shadow border border-gray-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                时间
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                举报人
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                被举报
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                理由
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                详情
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
            {items.length === 0 && !loading && (
              <tr>
                <td className="px-4 py-4 text-center text-gray-500" colSpan={5}>
                  暂无举报记录
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-gray-600">{new Date(item.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-700 break-all">{item.reporter}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-700 break-all">{item.target}</td>
                <td className="px-4 py-3">{item.reason}</td>
                <td className="px-4 py-3 text-gray-500">{item.description || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportsPage;
