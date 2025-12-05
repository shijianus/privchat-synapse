import React, { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';

import apiService from '../services/api';
import type {
  ApiError,
  FilterParams,
  RiskLevel,
  UserProfile,
  UserProvisionRequest,
  UserProvisionResponse,
  RegistrationApplication,
  RegistrationApplicationFilters,
  RegistrationApprovalPayload,
  RegistrationRejectionPayload,
  RegistrationBlacklistEntry,
  RegistrationBlacklistFilters,
  RegistrationBlacklistType,
  CreateBlacklistEntryRequest,
} from '../types';
import { Button, Input, LoadingSpinner } from '../components/ui';
import { hasRole, useAuthStore } from '../store/authStore';

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

type ProvisionStep = 'basic' | 'credential' | 'policy' | 'review' | 'success';
type ProvisionFormState = UserProvisionRequest & { password?: string };

const PROVISION_STEPS: Record<
  Exclude<ProvisionStep, 'success'>,
  { title: string; description: string }
> = {
  basic: { title: '账号信息', description: '用户名、显示昵称、可选联系信息' },
  credential: { title: '凭证策略', description: '一次性密码或自定义密码，安全复核' },
  policy: { title: '用户组与风控', description: '选择用户组、注册状态与初始风险' },
  review: { title: '复核与提交', description: '确认后调用服务器 API 并写审计日志' },
};

const DEFAULT_PROVISION_PAYLOAD: ProvisionFormState = {
  username: '',
  displayName: '',
  email: '',
  msisdn: '',
  userGroup: 'standard',
  registrationStatus: 'active',
  riskLevel: 'low',
  generatePassword: true,
  forcePasswordReset: true,
  joinDefaultRooms: true,
  sendWelcomeMessage: true,
  password: '',
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

const registrationApplicationStatusTone: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
};

const registrationApplicationStatusLabels: Record<string, string> = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已拒绝',
};

const registrationApplicationStatusOptions = [
  { label: '待审批', value: 'pending' },
  { label: '已批准', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
  { label: '全部', value: 'all' },
];

const blacklistTypeOptions: { label: string; value: RegistrationBlacklistType }[] = [
  { label: '用户名', value: 'username' },
  { label: '邮箱', value: 'email' },
  { label: '手机号', value: 'msisdn' },
  { label: 'IP 地址', value: 'ip_address' },
  { label: '设备指纹', value: 'device_fingerprint' },
];

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
  const { user } = useAuthStore();
  const isSuperAdmin = hasRole(user, 'super_admin');
  const [filters, setFilters] = useState<FilterState>(() => ({ ...DEFAULT_FILTERS }));
  const [showProvision, setShowProvision] = useState(false);
  const [provisionStep, setProvisionStep] = useState<ProvisionStep>('basic');
  const [provisionPayload, setProvisionPayload] = useState<ProvisionFormState>({
    ...DEFAULT_PROVISION_PAYLOAD,
  });
  const [provisionLoading, setProvisionLoading] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisionResult, setProvisionResult] = useState<UserProvisionResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'applications' | 'users' | 'blacklist'>('users');
  const [registrationFilters, setRegistrationFilters] = useState<RegistrationApplicationFilters>({
    status: 'pending',
    keyword: '',
    limit: 50,
    offset: 0,
  });
  const [blacklistFilters, setBlacklistFilters] = useState<RegistrationBlacklistFilters>({
    type: 'all',
    value: '',
    limit: 50,
    offset: 0,
  });
  const [decisionTarget, setDecisionTarget] = useState<RegistrationApplication | null>(null);
  const [decisionMode, setDecisionMode] = useState<'approve' | 'reject'>('approve');
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionSynapseId, setDecisionSynapseId] = useState('');
  const [decisionBlacklistTypes, setDecisionBlacklistTypes] = useState<RegistrationBlacklistType[]>([
    'username',
    'email',
    'ip_address',
  ]);
  const [decisionBlacklistExpiresAt, setDecisionBlacklistExpiresAt] = useState('');
  const [newBlacklistEntry, setNewBlacklistEntry] = useState<CreateBlacklistEntryRequest>({
    type: 'username',
    value: '',
    reason: '',
    expiresAt: null,
  });

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

  const registrationsQuery = useQuery<RegistrationApplication[], ApiError>({
    queryKey: ['registrations', registrationFilters],
    queryFn: () =>
      apiService.getRegistrationApplications({
        ...registrationFilters,
        status:
          registrationFilters.status && registrationFilters.status !== 'all'
            ? registrationFilters.status
            : undefined,
        keyword: registrationFilters.keyword?.trim() || undefined,
      }),
    enabled: activeTab === 'applications',
    placeholderData: keepPreviousData,
  });

  const registrationApplications = registrationsQuery.data ?? [];

  const approveRegistrationMutation = useMutation({
    mutationFn: async (payload: RegistrationApprovalPayload & { id: number }) => {
      return apiService.approveRegistration(payload.id, {
        reviewerNote: payload.reviewerNote,
        synapseUserId: payload.synapseUserId,
      });
    },
    onSuccess: () => {
      setDecisionTarget(null);
      setDecisionNote('');
      setDecisionSynapseId('');
      void registrationsQuery.refetch();
    },
  });

  const rejectRegistrationMutation = useMutation({
    mutationFn: async (payload: RegistrationRejectionPayload & { id: number }) => {
      return apiService.rejectRegistration(payload.id, {
        reviewerNote: payload.reviewerNote,
        blacklistTypes: payload.blacklistTypes,
        blacklistExpiresAt: payload.blacklistExpiresAt,
      });
    },
    onSuccess: () => {
      setDecisionTarget(null);
      setDecisionNote('');
      setDecisionBlacklistTypes(['username', 'email', 'ip_address']);
      setDecisionBlacklistExpiresAt('');
      void registrationsQuery.refetch();
    },
  });

  const blacklistQuery = useQuery<RegistrationBlacklistEntry[], ApiError>({
    queryKey: ['registration-blacklist', blacklistFilters],
    queryFn: () =>
      apiService.getRegistrationBlacklist({
        ...blacklistFilters,
        type: blacklistFilters.type && blacklistFilters.type !== 'all' ? blacklistFilters.type : undefined,
        value: blacklistFilters.value?.trim() || undefined,
      }),
    enabled: activeTab === 'blacklist',
    placeholderData: keepPreviousData,
  });

  const blacklistEntries = blacklistQuery.data ?? [];

  const addBlacklistMutation = useMutation({
    mutationFn: async (payload: CreateBlacklistEntryRequest) => {
      return apiService.createRegistrationBlacklistEntry(payload);
    },
    onSuccess: () => {
      setNewBlacklistEntry({
        type: 'username',
        value: '',
        reason: '',
        expiresAt: null,
      });
      void blacklistQuery.refetch();
    },
  });

  const deleteBlacklistMutation = useMutation({
    mutationFn: async (entryId: number) => apiService.deleteRegistrationBlacklistEntry(entryId),
    onSuccess: () => {
      void blacklistQuery.refetch();
    },
  });

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

  const handleRegistrationFilterChange = (
    field: keyof RegistrationApplicationFilters,
    value: string
  ) => {
    setRegistrationFilters((prev) => ({
      ...prev,
      [field]: value,
      offset: 0,
    }));
  };

  const resetRegistrationFilters = () => {
    setRegistrationFilters({
      status: 'pending',
      keyword: '',
      limit: 50,
      offset: 0,
    });
  };

  const handleBlacklistFilterChange = (field: keyof RegistrationBlacklistFilters, value: string) => {
    setBlacklistFilters((prev) => ({
      ...prev,
      [field]: value,
      offset: 0,
    }));
  };

  const resetBlacklistFilters = () => {
    setBlacklistFilters({
      type: 'all',
      value: '',
      limit: 50,
      offset: 0,
    });
  };

  const hasActiveFilters =
    filters.userGroup !== 'all' ||
    filters.registrationStatus !== 'all' ||
    filters.riskLevel !== 'all' ||
    Boolean(filters.keyword.trim());

  const resetProvisionFlow = () => {
    setProvisionPayload({ ...DEFAULT_PROVISION_PAYLOAD });
    setProvisionError(null);
    setProvisionResult(null);
    setProvisionStep('basic');
  };

  const openProvisionDrawer = () => {
    resetProvisionFlow();
    setShowProvision(true);
  };

  const closeProvisionDrawer = () => {
    setShowProvision(false);
  };

  const updateProvisionField = (field: keyof ProvisionFormState, value: string | boolean) => {
    setProvisionPayload((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const passwordLength = provisionPayload.password?.length ?? 0;
  const isPasswordValid = provisionPayload.generatePassword || passwordLength >= 12;
  const isBasicValid = provisionPayload.username.trim().length >= 3;
  const isPolicyValid =
    Boolean(provisionPayload.userGroup) &&
    Boolean(provisionPayload.registrationStatus) &&
    Boolean(provisionPayload.riskLevel);

  const stepOrder: Exclude<ProvisionStep, 'success'>[] = [
    'basic',
    'credential',
    'policy',
    'review',
  ];
  const currentStep: Exclude<ProvisionStep, 'success'> =
    provisionStep === 'success' ? 'review' : provisionStep;
  const rawActiveIndex = stepOrder.indexOf(currentStep);
  const activeStepIndex = rawActiveIndex === -1 ? stepOrder.length - 1 : rawActiveIndex;

  const goToNextStep = (): void => {
    if (provisionStep === 'basic' && !isBasicValid) return;
    if (provisionStep === 'credential' && !isPasswordValid) return;
    if (provisionStep === 'policy' && !isPolicyValid) return;
    const next = stepOrder[activeStepIndex + 1];
    if (next) {
      setProvisionStep(next);
      setProvisionError(null);
    }
  };

  const goToPreviousStep = (): void => {
    const prev = stepOrder[activeStepIndex - 1];
    if (prev) {
      setProvisionStep(prev);
    }
  };

  const handleProvisionSubmit = async (): Promise<void> => {
    setProvisionLoading(true);
    setProvisionError(null);
    try {
      const payload: UserProvisionRequest = {
        ...provisionPayload,
        password: provisionPayload.generatePassword ? undefined : provisionPayload.password,
      };
      const result = await apiService.provisionUser(payload);
      setProvisionResult(result);
      setProvisionStep('success');
      await refetch();
    } catch (err) {
      const message =
        (err as ApiError)?.message ||
        (typeof err === 'object' && err && 'message' in (err as Record<string, unknown>)
          ? String((err as { message?: string }).message)
          : '创建用户失败');
      setProvisionError(message);
    } finally {
      setProvisionLoading(false);
    }
  };

  const copyValue = (value: string) => {
    if (!value) return;
    if (navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(value);
    }
  };

  const openDecisionPanel = (application: RegistrationApplication, mode: 'approve' | 'reject') => {
    setDecisionTarget(application);
    setDecisionMode(mode);
    setDecisionNote('');
    setDecisionSynapseId(application.synapseUserId ?? '');
    setDecisionBlacklistTypes(['username', 'email', 'ip_address']);
    setDecisionBlacklistExpiresAt('');
  };

  const toggleDecisionBlacklistType = (type: RegistrationBlacklistType) => {
    setDecisionBlacklistTypes((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]
    );
  };

  const submitDecision = () => {
    if (!decisionTarget) return;

    if (decisionMode === 'approve') {
      approveRegistrationMutation.mutate({
        id: decisionTarget.id,
        reviewerNote: decisionNote || undefined,
        synapseUserId: decisionSynapseId || undefined,
      });
      return;
    }

    const trimmed = decisionNote.trim();
    if (trimmed.length < 3) return;

    rejectRegistrationMutation.mutate({
      id: decisionTarget.id,
      reviewerNote: trimmed,
      blacklistTypes: decisionBlacklistTypes,
      blacklistExpiresAt: decisionBlacklistExpiresAt
        ? new Date(decisionBlacklistExpiresAt).toISOString()
        : undefined,
    });
  };

  const handleCreateBlacklistEntry = () => {
    if (!newBlacklistEntry.value.trim()) {
      return;
    }

    const payload: CreateBlacklistEntryRequest = {
      ...newBlacklistEntry,
      value: newBlacklistEntry.value.trim(),
      expiresAt: newBlacklistEntry.expiresAt
        ? new Date(newBlacklistEntry.expiresAt).toISOString()
        : null,
    };

    addBlacklistMutation.mutate(payload);
  };

  const renderProvisionBody = () => {
    if (provisionStep === 'success') {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm text-emerald-800 font-semibold">用户创建成功</p>
            <p className="mt-1 text-sm text-emerald-700">
              Dashboard 已通过内网调用 Synapse 管理 API 完成创建并写入审计日志。
            </p>
          </div>
          {provisionResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                <div>
                  <p className="text-xs uppercase text-gray-500 tracking-wide">Matrix ID</p>
                  <p className="text-lg font-semibold text-gray-900">{provisionResult.synapseUserId}</p>
                  <p className="text-xs text-gray-500">
                    用户组 {userGroupLabels[provisionResult.userGroup] ?? provisionResult.userGroup} ·{' '}
                    状态 {registrationStatusLabels[provisionResult.registrationStatus] ?? provisionResult.registrationStatus} ·{' '}
                    风险 {riskLabels[provisionResult.riskLevel as RiskLevel] ?? provisionResult.riskLevel}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="border border-gray-200"
                  onClick={() => copyValue(provisionResult.synapseUserId)}
                >
                  复制
                </Button>
              </div>
              {provisionResult.initialPassword && (
                <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div>
                    <p className="text-xs uppercase text-amber-700 tracking-wide">一次性密码</p>
                    <p className="text-lg font-semibold text-amber-900 break-all">
                      {provisionResult.initialPassword}
                    </p>
                    <p className="text-xs text-amber-700">
                      请在安全渠道分发，并提示首次登录后修改密码。
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="border border-amber-200 text-amber-800"
                    onClick={() => copyValue(provisionResult.initialPassword ?? '')}
                  >
                    复制密码
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    if (provisionStep === 'basic') {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-700">
            Dashboard 将调用 <span className="font-semibold">Synapse 管理 API</span> 直接创建用户，所有唯一性、黑名单、密码强度校验均在服务器完成并写入审计日志。
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="用户名（本地部分）"
              placeholder="如：alice"
              value={provisionPayload.username}
              onChange={(event) => updateProvisionField('username', event.target.value)}
              helperText="仅允许当前服务器域，提交后将拼接 server_name 生成 Matrix ID"
            />
            <Input
              label="显示昵称（可选）"
              placeholder="团队展示名称"
              value={provisionPayload.displayName ?? ''}
              onChange={(event) => updateProvisionField('displayName', event.target.value)}
            />
            <Input
              label="邮箱（可选，用于 Profile）"
              placeholder="ops@example.com"
              value={provisionPayload.email ?? ''}
              onChange={(event) => updateProvisionField('email', event.target.value)}
            />
            <Input
              label="手机号（可选，用于 Profile）"
              placeholder="+86..."
              value={provisionPayload.msisdn ?? ''}
              onChange={(event) => updateProvisionField('msisdn', event.target.value)}
            />
          </div>
        </div>
      );
    }

    if (provisionStep === 'credential') {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">初始密码策略</p>
                <p className="text-sm text-gray-500">
                  支持自动生成一次性密码或自定义密码，强制包含大小写、数字与符号。
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={provisionPayload.generatePassword}
                  onChange={(event) => updateProvisionField('generatePassword', event.target.checked)}
                />
                自动生成
              </label>
            </div>
            <div className="mt-4">
              <Input
                label="自定义初始密码（可选）"
                type="password"
                placeholder="留空则自动生成 16 位一次性密码"
                value={provisionPayload.password ?? ''}
                onChange={(event) => updateProvisionField('password', event.target.value)}
                disabled={provisionPayload.generatePassword}
                helperText="至少 12 位，需包含大小写、数字与特殊字符"
                error={!isPasswordValid && !provisionPayload.generatePassword ? '密码需要至少 12 位并包含大小写、数字、符号' : undefined}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                checked={provisionPayload.forcePasswordReset}
                onChange={(event) => updateProvisionField('forcePasswordReset', event.target.checked)}
              />
              <div>
                <p className="text-sm font-semibold text-gray-900">首次登录提醒改密</p>
                <p className="text-xs text-gray-500">向用户传达安全提示，便于合规审计。</p>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                checked={provisionPayload.joinDefaultRooms}
                onChange={(event) => updateProvisionField('joinDefaultRooms', event.target.checked)}
              />
              <div>
                <p className="text-sm font-semibold text-gray-900">加入默认房间</p>
                <p className="text-xs text-gray-500">按服务器配置的默认房间列表自动加入。</p>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                checked={provisionPayload.sendWelcomeMessage}
                onChange={(event) => updateProvisionField('sendWelcomeMessage', event.target.checked)}
              />
              <div>
                <p className="text-sm font-semibold text-gray-900">发送 Bot 欢迎/安全提示</p>
                <p className="text-xs text-gray-500">便于新用户知晓风控规则与安全要求。</p>
              </div>
            </label>
          </div>
        </div>
      );
    }

    if (provisionStep === 'policy') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="text-sm text-gray-700">
              用户组
              <select
                className={`${selectClassName} mt-1`}
                value={provisionPayload.userGroup}
                onChange={(event) => updateProvisionField('userGroup', event.target.value)}
              >
                {userGroupOptions
                  .filter((option) => option.value !== 'all')
                  .map((option) => (
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
                value={provisionPayload.registrationStatus}
                onChange={(event) => updateProvisionField('registrationStatus', event.target.value)}
              >
                {registrationStatusOptions
                  .filter((option) => option.value !== 'all')
                  .map((option) => (
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
                value={provisionPayload.riskLevel}
                onChange={(event) => updateProvisionField('riskLevel', event.target.value)}
              >
                {riskLevelOptions
                  .filter((option) => option.value !== 'all')
                  .map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900">风险提示</p>
            <p className="text-xs text-gray-500 mt-1">
              创建后将立即刷新 Redis 缓存并广播给 Synapse，命中黑名单或弱口令策略会被服务器拒绝。
            </p>
          </div>
        </div>
      );
    }

    // review
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-primary-100 bg-primary-50 p-4">
          <p className="text-sm font-semibold text-primary-800">复核信息</p>
          <p className="text-xs text-primary-700 mt-1">
            确认后立即调用服务器 API 并写入 operation_logs，所有字段可追溯。
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">用户名</p>
            <p className="text-sm font-semibold text-gray-900 break-all">@{provisionPayload.username}</p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">显示昵称</p>
            <p className="text-sm font-semibold text-gray-900">
              {provisionPayload.displayName || '未设置'}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">用户组</p>
            <p className="text-sm font-semibold text-gray-900">
              {userGroupLabels[provisionPayload.userGroup ?? 'standard'] ?? provisionPayload.userGroup}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">注册状态</p>
            <p className="text-sm font-semibold text-gray-900">
              {registrationStatusLabels[provisionPayload.registrationStatus ?? 'active'] ??
                provisionPayload.registrationStatus}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">风险等级</p>
            <p className="text-sm font-semibold text-gray-900">
              {riskLabels[(provisionPayload.riskLevel as RiskLevel) ?? 'low'] ??
                provisionPayload.riskLevel}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">密码策略</p>
            <p className="text-sm font-semibold text-gray-900">
              {provisionPayload.generatePassword
                ? '自动生成一次性密码'
                : '使用自定义密码'}
            </p>
          </div>
        </div>
        <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
          <li>调用路径：Dashboard → Synapse Admin API（内网 127.0.0.1）</li>
          <li>审计：记录操作者、目标用户、策略选择、Synapse Request-ID</li>
          <li>安全：若命中黑名单或弱口令策略将被服务器拒绝</li>
        </ul>
      </div>
    );
  };

  const isDecisionNoteInvalid = decisionMode === 'reject' && decisionNote.trim().length < 3;

  const renderRegistrationDecisionPanel = () => {
    if (!decisionTarget) return null;

    const isSubmitting =
      approveRegistrationMutation.isPending || rejectRegistrationMutation.isPending;

    return (
      <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {decisionMode === 'approve' ? '批准注册申请' : '拒绝并可选加入黑名单'}
            </p>
            <p className="text-xs text-gray-500">
              申请人：{decisionTarget.username} · {decisionTarget.email} · IP {decisionTarget.ipAddress}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="border border-gray-200"
              onClick={() => setDecisionTarget(null)}
            >
              取消
            </Button>
            <Button
              variant={decisionMode === 'approve' ? 'primary' : 'danger'}
              size="sm"
              loading={isSubmitting}
              onClick={submitDecision}
            >
              确认{decisionMode === 'approve' ? '批准' : '拒绝'}
            </Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="处理备注"
            placeholder={
              decisionMode === 'approve' ? '可选：记录审批说明' : '必填：拒绝原因，至少 3 个字符'
            }
            value={decisionNote}
            onChange={(event) => setDecisionNote(event.target.value)}
            error={isDecisionNoteInvalid ? '拒绝原因至少 3 个字符' : undefined}
          />
          {decisionMode === 'approve' && (
            <Input
              label="Synapse 用户 ID（可选）"
              placeholder="@user:server"
              value={decisionSynapseId}
              onChange={(event) => setDecisionSynapseId(event.target.value)}
              helperText="若已在 Synapse 创建，可填入以补全 profile"
            />
          )}
        </div>
        {decisionMode === 'reject' && (
          <div className="mt-4 space-y-3 rounded-lg border border-rose-100 bg-white p-4">
            <p className="text-sm font-semibold text-rose-900">黑名单选项</p>
            <p className="text-xs text-rose-700">
              勾选后将按申请信息写入 registration_blacklist，可设置过期时间。
            </p>
            <div className="flex flex-wrap gap-2">
              {blacklistTypeOptions.map((option) => (
                <label
                  key={option.value}
                  className="inline-flex items-center gap-2 rounded border border-gray-200 px-3 py-1 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    checked={decisionBlacklistTypes.includes(option.value)}
                    onChange={() => toggleDecisionBlacklistType(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input
                label="黑名单过期时间（可选）"
                type="datetime-local"
                value={decisionBlacklistExpiresAt}
                onChange={(event) => setDecisionBlacklistExpiresAt(event.target.value)}
                helperText="留空表示永久生效"
              />
              <div className="rounded-md border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
                冷却期：管理员/小管变更黑名单有 7 天冷却期，超级管理员立即生效。
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRegistrationApplications = () => {
    const registrationLoading =
      registrationsQuery.isLoading || registrationsQuery.isFetching;

    return (
      <section className="bg-white rounded-lg shadow border border-gray-100">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">注册申请管理</h2>
            <p className="mt-1 text-sm text-gray-500">
              查看/审批 registration_applications，拒绝时可一键写入黑名单并记录审计日志。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="text-sm text-gray-700">
              状态
              <select
                className={`${selectClassName} mt-1`}
                value={registrationFilters.status ?? 'all'}
                onChange={(event) =>
                  handleRegistrationFilterChange('status', event.target.value)
                }
              >
                {registrationApplicationStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="关键词"
              placeholder="按用户名/邮箱搜索"
              value={registrationFilters.keyword ?? ''}
              onChange={(event) =>
                handleRegistrationFilterChange('keyword', event.target.value)
              }
            />
            <div className="flex items-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="border border-gray-200"
                onClick={() => {
                  void registrationsQuery.refetch();
                }}
                loading={registrationsQuery.isFetching}
              >
                刷新
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="border border-gray-200"
                onClick={resetRegistrationFilters}
                disabled={registrationsQuery.isFetching}
              >
                重置
              </Button>
            </div>
          </div>
        </div>

        {renderRegistrationDecisionPanel()}

        {registrationsQuery.isError && (
          <div className="bg-rose-50 px-6 py-3 text-sm text-rose-700">
            {(registrationsQuery.error && registrationsQuery.error.message) ||
              '无法加载注册申请'}
          </div>
        )}

        {registrationLoading ? (
          <div className="py-10">
            <LoadingSpinner label="正在加载注册申请..." />
          </div>
        ) : registrationApplications.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">
            当前没有匹配的注册申请。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    申请人
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    IP / 设备
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    审核备注
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    提交时间
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {registrationApplications.map((application) => (
                  <tr key={application.id}>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-gray-900">{application.username}</p>
                      <p className="text-xs text-gray-500">{application.email}</p>
                      {application.msisdn && (
                        <p className="text-xs text-gray-500">手机号：{application.msisdn}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={getBadgeClass(
                          application.status,
                          registrationApplicationStatusTone,
                          'bg-gray-100 text-gray-700'
                        )}
                      >
                        {registrationApplicationStatusLabels[application.status] ??
                          application.status}
                      </span>
                      {application.reviewer && (
                        <p className="mt-1 text-xs text-gray-500">审核人：{application.reviewer}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <p>IP：{application.ipAddress}</p>
                      {application.deviceFingerprint && (
                        <p className="text-xs text-gray-500">
                          设备：{application.deviceFingerprint}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">
                        {application.reviewerNote || '—'}
                      </p>
                      {application.synapseUserId && (
                        <p className="text-xs text-gray-500">
                          Synapse：{application.synapseUserId}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <p>提交：{formatDateTime(application.createdAt)}</p>
                      <p>处理：{formatDateTime(application.decidedAt)}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="border border-gray-200"
                          onClick={() => openDecisionPanel(application, 'approve')}
                        >
                          批准
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          className="border border-rose-200"
                          onClick={() => openDecisionPanel(application, 'reject')}
                        >
                          拒绝
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  const renderRegistrationBlacklist = () => {
    const blacklistLoading = blacklistQuery.isLoading || blacklistQuery.isFetching;

    return (
      <section className="bg-white rounded-lg shadow border border-gray-100">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">注册黑名单</h2>
            <p className="mt-1 text-sm text-gray-500">
              覆盖用户名/邮箱/IP/设备指纹等注册拒绝规则，写入 registration_blacklist。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="text-sm text-gray-700">
              类型
              <select
                className={`${selectClassName} mt-1`}
                value={blacklistFilters.type ?? 'all'}
                onChange={(event) => handleBlacklistFilterChange('type', event.target.value)}
              >
                <option value="all">全部</option>
                {blacklistTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="关键词"
              placeholder="值包含..."
              value={blacklistFilters.value ?? ''}
              onChange={(event) => handleBlacklistFilterChange('value', event.target.value)}
            />
            <div className="flex items-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="border border-gray-200"
                onClick={() => void blacklistQuery.refetch()}
                loading={blacklistQuery.isFetching}
              >
                刷新
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="border border-gray-200"
                onClick={resetBlacklistFilters}
                disabled={blacklistQuery.isFetching}
              >
                重置
              </Button>
            </div>
          </div>
        </div>

        <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <label className="text-sm text-gray-700">
              类型
              <select
                className={`${selectClassName} mt-1`}
                value={newBlacklistEntry.type}
                onChange={(event) =>
                  setNewBlacklistEntry((prev) => ({
                    ...prev,
                    type: event.target.value as RegistrationBlacklistType,
                  }))
                }
              >
                {blacklistTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="黑名单值"
              placeholder="如：username 或 IP"
              value={newBlacklistEntry.value}
              onChange={(event) =>
                setNewBlacklistEntry((prev) => ({
                  ...prev,
                  value: event.target.value,
                }))
              }
              helperText="提交时自动去除首尾空格"
            />
            <Input
              label="原因（可选）"
              placeholder="命中策略说明"
              value={newBlacklistEntry.reason ?? ''}
              onChange={(event) =>
                setNewBlacklistEntry((prev) => ({
                  ...prev,
                  reason: event.target.value,
                }))
              }
            />
            <Input
              label="过期时间（可选）"
              type="datetime-local"
              value={newBlacklistEntry.expiresAt ?? ''}
              onChange={(event) =>
                setNewBlacklistEntry((prev) => ({
                  ...prev,
                  expiresAt: event.target.value || null,
                }))
              }
              helperText="留空表示永久"
            />
          </div>
          <div className="mt-3 flex items-center justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateBlacklistEntry}
              loading={addBlacklistMutation.isPending}
              disabled={!newBlacklistEntry.value.trim()}
            >
              添加/更新黑名单
            </Button>
          </div>
        </div>

        {blacklistQuery.isError && (
          <div className="bg-rose-50 px-6 py-3 text-sm text-rose-700">
            {(blacklistQuery.error && blacklistQuery.error.message) || '无法加载黑名单'}
          </div>
        )}

        {blacklistLoading ? (
          <div className="py-10">
            <LoadingSpinner label="正在加载黑名单..." />
          </div>
        ) : blacklistEntries.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">暂无黑名单记录。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    类型
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    值
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    备注
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    过期 / 创建
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {blacklistEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {blacklistTypeOptions.find((item) => item.value === entry.type)?.label ??
                        entry.type}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-gray-900">{entry.value}</p>
                      {entry.reason && (
                        <p className="text-xs text-gray-500">原因：{entry.reason}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <p>创建人：{entry.createdBy}</p>
                      <p className="text-xs text-gray-500">创建于 {formatDateTime(entry.createdAt)}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <p>过期：{entry.expiresAt ? formatDateTime(entry.expiresAt) : '永久'}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="border border-gray-200"
                        loading={deleteBlacklistMutation.isPending}
                        onClick={() => deleteBlacklistMutation.mutate(entry.id)}
                      >
                        删除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  const tabOptions: { key: 'applications' | 'users' | 'blacklist'; label: string; helper: string }[] =
    [
      { key: 'applications', label: '注册申请', helper: '审批/拒绝 + 黑名单' },
      { key: 'users', label: '已注册用户', helper: '目录与内网开通' },
      { key: 'blacklist', label: '注册黑名单', helper: 'IP/邮箱/设备限制' },
    ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500">Member Governance</p>
          <h1 className="text-2xl font-semibold text-gray-900">
            注册审核 · 用户目录 · 黑名单
          </h1>
          <p className="text-sm text-gray-500">
            对齐 REQUEST.md 第 3.1/7.1 要求：注册审核、黑名单冷却期、已注册用户风控。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabOptions.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                className={`rounded-lg border px-4 py-2 text-left text-sm ${
                  isActive
                    ? 'border-primary-500 bg-primary-50 text-primary-800 shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                <p className="font-semibold">{tab.label}</p>
                <p className="text-xs text-gray-500">{tab.helper}</p>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'applications' && renderRegistrationApplications()}

      {activeTab === 'users' && (
        <>
          {isSuperAdmin && (
            <section className="rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg">
              <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-300">
                    Super Admin Only
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">直接在 Dashboard 创建 Synapse 用户</h2>
                  <p className="mt-1 text-sm text-slate-200">
                    调用服务器内网管理 API，沿用唯一性/黑名单/密码策略校验，并自动写入审计日志。
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100 border border-emerald-400/30">
                    内网 API · 127.0.0.1
                  </span>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="bg-white text-slate-900 hover:bg-slate-100"
                    onClick={openProvisionDrawer}
                  >
                    快速创建用户
                  </Button>
                </div>
              </div>
            </section>
          )}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                key={card.label}
                className="rounded-lg bg-white border border-gray-100 p-4 shadow-sm"
              >
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
              <div
                className="px-6 py-3 bg-rose-50 text-rose-700 text-sm border-b border-rose-100"
                role="alert"
              >
                {(error && (error.message || '无法加载用户数据')) || '无法加载用户数据'}
              </div>
            )}

            <div className="px-6 py-4 border-b border-gray-100">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {riskSnapshot.map((snapshot) => (
                  <div key={snapshot.level} className="rounded-md border border-gray-100 p-4">
                    <p className="text-xs font-medium text-gray-500">{riskLabels[snapshot.level]}</p>
                    <p className="mt-2 text-xl font-semibold text-gray-900">
                      {formatNumber(snapshot.count)}
                    </p>
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
                            {registrationStatusLabels[user.registrationStatus] ||
                              user.registrationStatus}
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
        </>
      )}

      {activeTab === 'blacklist' && renderRegistrationBlacklist()}

      {showProvision && isSuperAdmin && (
        <div className="fixed inset-0 z-30 flex">
          <div className="flex-1 bg-gray-900/50 backdrop-blur-sm" onClick={closeProvisionDrawer} />
          <div className="relative ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Provision User</p>
                <h3 className="text-lg font-semibold text-gray-900">调用服务器 API 创建用户</h3>
                <p className="text-sm text-gray-500">
                  仅超级管理员可见，调用 Synapse 管理接口并写入 operation_logs。
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="border border-gray-200"
                onClick={closeProvisionDrawer}
              >
                关闭
              </Button>
            </div>
            <div className="border-b border-gray-100 px-6 py-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-3">
                  {stepOrder.map((step, index) => {
                    const meta = PROVISION_STEPS[step];
                    const isDone = provisionStep === 'success' || activeStepIndex > index;
                    const isActive =
                      provisionStep === step ||
                      (provisionStep === 'success' && index === stepOrder.length - 1);
                    return (
                      <div
                        key={step}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                          isActive
                            ? 'border-primary-500 bg-primary-50 text-primary-900'
                            : isDone
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-gray-200 text-gray-700'
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                            isActive
                              ? 'bg-primary-600 text-white'
                              : isDone
                              ? 'bg-emerald-500 text-white'
                              : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{meta.title}</p>
                          <p className="text-xs">{meta.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {provisionStep === 'success' && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    已成功创建用户，以下信息仅本次展示，请妥善保存一次性凭证。
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {renderProvisionBody()}
              {provisionError && (
                <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {provisionError}
                </div>
              )}
            </div>
            <div className="border-t border-gray-100 bg-white px-6 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-xs text-gray-500">
                  调用链：Dashboard → Synapse Admin API → PostgreSQL/Redis 缓存刷新。
                </div>
                <div className="flex items-center gap-2">
                  {provisionStep !== 'basic' && provisionStep !== 'success' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="border border-gray-200"
                      onClick={goToPreviousStep}
                    >
                      上一步
                    </Button>
                  )}
                  {provisionStep !== 'success' && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="min-w-[120px]"
                      disabled={
                        provisionLoading ||
                        (provisionStep === 'basic' && !isBasicValid) ||
                        (provisionStep === 'credential' && !isPasswordValid) ||
                        (provisionStep === 'policy' && !isPolicyValid)
                      }
                      onClick={provisionStep === 'review' ? handleProvisionSubmit : goToNextStep}
                      loading={provisionLoading}
                    >
                      {provisionStep === 'review' ? '立即创建' : '下一步'}
                    </Button>
                  )}
                  {provisionStep === 'success' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="border border-gray-200"
                      onClick={() => {
                        resetProvisionFlow();
                        setProvisionStep('basic');
                      }}
                    >
                      继续创建
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="border border-gray-200"
                    onClick={closeProvisionDrawer}
                  >
                    关闭
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
