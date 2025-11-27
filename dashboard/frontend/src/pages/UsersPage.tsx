import React, { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import apiService from '../services/api';
import type { ApiError, FilterParams, RiskLevel, UserProfile } from '../types';
import { Button, Input, LoadingSpinner } from '../components/ui';

const NUMBER_FORMATTER = new Intl.NumberFormat('zh-CN');

type FilterState = {
  userGroup: string;
  registrationStatus: string;
  riskLevel: string;
  keyword: string;
};

const DEFAULT_FILTERS: FilterState = {
  userGroup: 'all',
  registrationStatus: 'all',
  riskLevel: 'all',
  keyword: '',
};

const userGroupOptions = [
  { label: '所有用户组', value: 'all' },
  { label: 'Free', value: 'free' },
  { label: 'Standard', value: 'standard' },
  { label: 'Premium', value: 'premium' },
  { label: 'Enterprise', value: 'enterprise' },
  { label: 'General', value: 'general' },
];

const registrationStatusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '待审批', value: 'pending' },
  { label: '活跃', value: 'active' },
  { label: '已冻结', value: 'suspended' },
  { label: '已删除', value: 'deleted' },
];

const riskLevelOptions = [
  { label: '全部风险', value: 'all' },
  { label: '低风险', value: 'low' },
  { label: '中风险', value: 'medium' },
  { label: '高风险', value: 'high' },
  { label: '最高风险', value: 'critical' },
];

const orderedRiskLevels: RiskLevel[] = ['low', 'medium', 'high', 'critical'];

const userGroupLabels: Record<string, string> = {
  free: 'Free',
  standard: 'Standard',
  premium: 'Premium',
  enterprise: 'Enterprise',
  general: 'General',
};

const registrationStatusLabels: Record<string, string> = {
  pending: '待审批',
  active: '活跃',
  suspended: '已冻结',
  deleted: '已删除',
};

const riskLabels: Record<RiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '最高风险',
};

const BADGE_BASE_CLASSES = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium';

const userGroupTone: Record<string, string> = {
  free: 'bg-slate-100 text-slate-700',
  standard: 'bg-sky-100 text-sky-700',
  premium: 'bg-violet-100 text-violet-700',
  enterprise: 'bg-emerald-100 text-emerald-700',
  general: 'bg-gray-100 text-gray-700',
};

const registrationStatusTone: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  active: 'bg-emerald-50 text-emerald-700',
  suspended: 'bg-rose-50 text-rose-700',
  deleted: 'bg-gray-200 text-gray-600',
};

const riskTone: Record<RiskLevel, string> = {
  low: 'bg-green-50 text-green-700',
  medium: 'bg-yellow-50 text-yellow-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
};

const selectClassName =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';

const getBadgeClass = (
  value: string,
  toneMap: Record<string, string>,
  fallback: string
): string => {
  const tone = toneMap[value] ?? fallback;
  return `${BADGE_BASE_CLASSES} ${tone}`;
};

const formatNumber = (value: number): string => NUMBER_FORMATTER.format(value);

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return '未记录';
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false });
};

const UsersPage: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>(() => ({ ...DEFAULT_FILTERS }));

  const queryFilters = useMemo<FilterParams>(() => {
    const sanitized: FilterParams = {};

    if (filters.userGroup !== 'all') {
      sanitized.userGroup = filters.userGroup;
    }

    if (filters.registrationStatus !== 'all') {
      sanitized.registrationStatus = filters.registrationStatus;
    }

    if (filters.riskLevel !== 'all') {
      sanitized.riskLevel = filters.riskLevel;
    }

    const trimmedKeyword = filters.keyword.trim();
    if (trimmedKeyword) {
      sanitized.keyword = trimmedKeyword;
    }

    return sanitized;
  }, [filters]);

  // 使用 React Query 从后端拉取最新的用户画像
  const usersQuery = useQuery<UserProfile[], ApiError>({
    queryKey: ['users', queryFilters],
    queryFn: () => apiService.getUsers(queryFilters),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const users = usersQuery.data ?? [];
  const { isLoading, isFetching, isError, error, refetch } = usersQuery;

  const { summaryCards, riskSnapshot } = useMemo(() => {
    const riskCounts: Record<RiskLevel, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    let pending = 0;
    let suspended = 0;
    let highRisk = 0;

    users.forEach((user) => {
      riskCounts[user.riskLevel] += 1;

      if (user.registrationStatus === 'pending') {
        pending += 1;
      }

      if (user.registrationStatus === 'suspended') {
        suspended += 1;
      }

      if (user.riskLevel === 'high' || user.riskLevel === 'critical') {
        highRisk += 1;
      }
    });

    const total = users.length;
    const summary = [
      {
        label: '总用户档案',
        value: formatNumber(total),
        helper: 'dashboard.user_profiles 同步记录',
      },
      {
        label: '高风险占比',
        value: total ? `${Math.round((highRisk / Math.max(total, 1)) * 100)}%` : '0%',
        helper: `${formatNumber(highRisk)} 个高危账户`,
      },
      {
        label: '待审批注册',
        value: formatNumber(pending),
        helper: 'registration_status = pending',
      },
      {
        label: '受限账户',
        value: formatNumber(suspended),
        helper: 'registration_status = suspended',
      },
    ];

    const snapshot = orderedRiskLevels.map((level) => {
      const count = riskCounts[level];
      const percent = total ? Math.round((count / total) * 100) : 0;
      return { level, count, percent };
    });

    return {
      summaryCards: summary,
      riskSnapshot: snapshot,
    };
  }, [users]);

  const applySelectFilter = (field: keyof FilterState) => (event: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleKeywordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({
      ...prev,
      keyword: event.target.value,
    }));
  };

  const handleResetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
  };

  const hasActiveFilters =
    filters.userGroup !== 'all' ||
    filters.registrationStatus !== 'all' ||
    filters.riskLevel !== 'all' ||
    Boolean(filters.keyword.trim());

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-lg bg-white border border-gray-100 p-4 shadow-sm">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{card.value}</p>
            <p className="mt-1 text-xs text-gray-500">{card.helper}</p>
          </div>
        ))}
      </section>

      <section className="bg-white rounded-lg shadow border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">用户目录</h2>
            <p className="mt-1 text-sm text-gray-500">
              数据直接来源于共享 PostgreSQL schema，变更会通过 Redis 通知 Synapse 端更新缓存。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="border border-gray-200"
              onClick={() => {
                void refetch();
              }}
              loading={isFetching}
            >
              刷新数据
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="border border-gray-200"
              onClick={handleResetFilters}
              disabled={!hasActiveFilters || isFetching}
            >
              重置筛选
            </Button>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Input
              label="按 Matrix ID / 关键词检索"
              placeholder="@user:server"
              value={filters.keyword}
              onChange={handleKeywordChange}
            />
            <label className="text-sm text-gray-700">
              用户组
              <select
                className={`${selectClassName} mt-1`}
                value={filters.userGroup}
                onChange={applySelectFilter('userGroup')}
              >
                {userGroupOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-700">
              注册状态
              <select
                className={`${selectClassName} mt-1`}
                value={filters.registrationStatus}
                onChange={applySelectFilter('registrationStatus')}
              >
                {registrationStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-700">
              风险等级
              <select
                className={`${selectClassName} mt-1`}
                value={filters.riskLevel}
                onChange={applySelectFilter('riskLevel')}
              >
                {riskLevelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {isError && (
          <div className="px-6 py-3 bg-rose-50 text-rose-700 text-sm border-b border-rose-100" role="alert">
            {(error && (error.message || '无法加载用户数据')) || '无法加载用户数据'}
          </div>
        )}

        <div className="px-6 py-4 border-b border-gray-100">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {riskSnapshot.map((snapshot) => (
              <div key={snapshot.level} className="rounded-md border border-gray-100 p-4">
                <p className="text-xs font-medium text-gray-500">{riskLabels[snapshot.level]}</p>
                <p className="mt-2 text-xl font-semibold text-gray-900">{formatNumber(snapshot.count)}</p>
                <p className="text-xs text-gray-500">{snapshot.percent}% · 风险占比</p>
              </div>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="py-12">
            <LoadingSpinner label="正在同步用户档案..." />
          </div>
        ) : users.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            当前筛选条件下没有匹配的用户记录。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Synapse ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    用户组
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    注册状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    风险等级
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    最近登录
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{user.synapseUserId}</div>
                      <div className="text-xs text-gray-500">
                        更新于 {formatDateTime(user.updatedAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={getBadgeClass(
                          user.userGroup,
                          userGroupTone,
                          'bg-gray-100 text-gray-700'
                        )}
                      >
                        {userGroupLabels[user.userGroup] || user.userGroup}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={getBadgeClass(
                          user.registrationStatus,
                          registrationStatusTone,
                          'bg-gray-100 text-gray-700'
                        )}
                      >
                        {registrationStatusLabels[user.registrationStatus] || user.registrationStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={getBadgeClass(
                          user.riskLevel,
                          riskTone,
                          'bg-gray-100 text-gray-700'
                        )}
                      >
                        {riskLabels[user.riskLevel] || user.riskLevel}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDateTime(user.lastLoginAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default UsersPage;
