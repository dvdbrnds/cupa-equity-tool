import type {
  User,
  AuthSession,
  CupaPosition,
  PositionMappingWithCupa,
  AuditCycleWithStats,
  ReviewCommentWithUser,
  PaginatedResponse,
  ImportResult,
  DashboardStats,
  AuditProgressByVp,
  VpRole,
  EquityAnalysisWithPosition,
  EquitySummaryByVp,
  EquityAnalysisSummary,
  BudgetAllocation,
} from '@cupa/shared';

const API_BASE = '/api';

class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(error.message || 'Request failed', response.status, error.code);
  }

  return response.json();
}

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    fetchApi<AuthSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    fetchApi<{ message: string }>('/auth/logout', { method: 'POST' }),

  getSession: () => fetchApi<AuthSession>('/auth/session'),

  changePassword: (currentPassword: string, newPassword: string) =>
    fetchApi<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

// Users API
export const usersApi = {
  list: (params?: { page?: number; limit?: number; search?: string; role?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.role) searchParams.set('role', params.role);
    return fetchApi<PaginatedResponse<User>>(`/users?${searchParams}`);
  },

  get: (id: number) => fetchApi<User>(`/users/${id}`),

  create: (data: { email: string; password: string; name: string; role: string; division?: string }) =>
    fetchApi<User>('/users', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: Partial<User>) =>
    fetchApi<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: number) =>
    fetchApi<{ message: string }>(`/users/${id}`, { method: 'DELETE' }),

  resetPassword: (id: number, newPassword: string) =>
    fetchApi<{ message: string }>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),
};

// CUPA Catalog API
export const cupaCatalogApi = {
  list: (params?: { page?: number; limit?: number; search?: string; category?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.category) searchParams.set('category', params.category);
    return fetchApi<PaginatedResponse<CupaPosition>>(`/cupa-catalog?${searchParams}`);
  },

  search: (query: string, limit = 10) =>
    fetchApi<Array<{ cupaCode: string; title: string; description: string }>>(`/cupa-catalog/search?q=${encodeURIComponent(query)}&limit=${limit}`),

  get: (code: string) => fetchApi<CupaPosition>(`/cupa-catalog/${code}`),

  getCategories: () => fetchApi<Array<{ category: string; count: number }>>('/cupa-catalog/categories/list'),

  getYears: () => fetchApi<Array<{ year: string; count: number }>>('/cupa-catalog/years/list'),
};

// Positions API
export const positionsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    division?: string;
    vpStem?: string;
    auditStatus?: string;
    auditCycleId?: number;
    unmappedOnly?: boolean;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.search) searchParams.set('search', params.search);
    if (params?.division) searchParams.set('division', params.division);
    if (params?.vpStem) searchParams.set('vpStem', params.vpStem);
    if (params?.auditStatus) searchParams.set('auditStatus', params.auditStatus);
    if (params?.auditCycleId) searchParams.set('auditCycleId', String(params.auditCycleId));
    if (params?.unmappedOnly) searchParams.set('unmappedOnly', 'true');
    return fetchApi<PaginatedResponse<PositionMappingWithCupa>>(`/positions?${searchParams}`);
  },

  get: (id: number) => fetchApi<PositionMappingWithCupa>(`/positions/${id}`),

  create: (data: Partial<PositionMappingWithCupa>) =>
    fetchApi<PositionMappingWithCupa>('/positions', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: Partial<PositionMappingWithCupa>) =>
    fetchApi<PositionMappingWithCupa>(`/positions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: number) =>
    fetchApi<{ message: string }>(`/positions/${id}`, { method: 'DELETE' }),

  getDivisions: () => fetchApi<Array<{ division: string; count: number }>>('/positions/divisions'),

  getVpStems: () => fetchApi<Array<{ vpStem: string; count: number }>>('/positions/vp-stems'),

  getHistory: (id: number) => fetchApi<Array<{
    id: number;
    oldCupaCode: string | null;
    newCupaCode: string | null;
    oldStatus: string | null;
    newStatus: string | null;
    notes: string | null;
    createdAt: string;
    userName: string;
  }>>(`/positions/${id}/history`),
};

// Audit Cycles API
export const auditCyclesApi = {
  list: () => fetchApi<AuditCycleWithStats[]>('/audit-cycles'),

  get: (id: number) => fetchApi<AuditCycleWithStats>(`/audit-cycles/${id}`),

  create: (data: { name: string; startDate: string; endDate?: string }) =>
    fetchApi<AuditCycleWithStats>('/audit-cycles', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: number, data: Partial<{ name: string; startDate: string; endDate: string; status: string }>) =>
    fetchApi<AuditCycleWithStats>(`/audit-cycles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: number) =>
    fetchApi<{ message: string }>(`/audit-cycles/${id}`, { method: 'DELETE' }),

  getProgressByVp: (id: number) =>
    fetchApi<AuditProgressByVp[]>(`/audit-cycles/${id}/progress-by-vp`),

  assignPositions: (id: number, data: { positionIds?: number[]; vpStem?: string; assignAll?: boolean }) =>
    fetchApi<{ message: string }>(`/audit-cycles/${id}/assign-positions`, { method: 'POST', body: JSON.stringify(data) }),

  assignReviewers: (id: number) =>
    fetchApi<{ message: string; reviewersMatched: number }>(`/audit-cycles/${id}/assign-reviewers`, { method: 'POST' }),
};

// Reviews API
export const reviewsApi = {
  getMyQueue: (params?: { page?: number; limit?: number; auditStatus?: string; auditCycleId?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.auditStatus) searchParams.set('auditStatus', params.auditStatus);
    if (params?.auditCycleId) searchParams.set('auditCycleId', String(params.auditCycleId));
    return fetchApi<PaginatedResponse<PositionMappingWithCupa>>(`/reviews/my-queue?${searchParams}`);
  },

  getStats: (auditCycleId?: number) => {
    const params = auditCycleId ? `?auditCycleId=${auditCycleId}` : '';
    return fetchApi<{
      total: number;
      pending: number;
      underReview: number;
      confirmed: number;
      flagged: number;
      resolved: number;
      needsAction: number;
    }>(`/reviews/stats${params}`);
  },

  confirm: (id: number, comment?: string) =>
    fetchApi<{ message: string }>(`/reviews/${id}/confirm`, { method: 'PATCH', body: JSON.stringify({ comment }) }),

  flag: (id: number, data: { reason: string; comment: string; suggestedCupaCode?: string }) =>
    fetchApi<{ message: string }>(`/reviews/${id}/flag`, { method: 'PATCH', body: JSON.stringify(data) }),

  resolve: (id: number, data: { newCupaCode?: string; comment: string }) =>
    fetchApi<{ message: string }>(`/reviews/${id}/resolve`, { method: 'PATCH', body: JSON.stringify(data) }),

  getComments: (id: number) => fetchApi<ReviewCommentWithUser[]>(`/reviews/${id}/comments`),

  addComment: (id: number, comment: string) =>
    fetchApi<ReviewCommentWithUser>(`/reviews/${id}/comments`, { method: 'POST', body: JSON.stringify({ comment }) }),

  batchConfirm: (positionIds: number[]) =>
    fetchApi<{ confirmed: number; skipped: number; skippedDetails: Array<{ id: number; reason: string }> }>('/reviews/batch-confirm', {
      method: 'POST',
      body: JSON.stringify({ positionIds }),
    }),
};

// Dashboard API
export const dashboardApi = {
  getStats: () => fetchApi<DashboardStats>('/dashboard/stats'),

  getAuditProgress: (auditCycleId?: number) => {
    const params = auditCycleId ? `?auditCycleId=${auditCycleId}` : '';
    return fetchApi<AuditProgressByVp[]>(`/dashboard/audit-progress${params}`);
  },

  getRecentActivity: (limit = 10) =>
    fetchApi<Array<{
      id: number;
      positionMappingId: number;
      oldCupaCode: string | null;
      newCupaCode: string | null;
      oldStatus: string | null;
      newStatus: string | null;
      notes: string | null;
      createdAt: string;
      userName: string;
      employeeName: string;
      institutionalTitle: string;
    }>>(`/dashboard/recent-activity?limit=${limit}`),

  getFlaggedPositions: (limit = 10) =>
    fetchApi<Array<{
      id: number;
      employeeId: string;
      employeeName: string;
      institutionalTitle: string;
      vpStem: string;
      cupaCode: string | null;
      cupaTitle: string | null;
      latestComment: string | null;
      flagReason: string | null;
      suggestedCupaCode: string | null;
      flaggedAt: string | null;
      flaggedBy: string | null;
    }>>(`/dashboard/flagged-positions?limit=${limit}`),

  getStatusSummary: (auditCycleId?: number) => {
    const params = auditCycleId ? `?auditCycleId=${auditCycleId}` : '';
    return fetchApi<Record<string, number>>(`/dashboard/status-summary${params}`);
  },
};

// Import API
export const importApi = {
  previewSheets: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/import/preview-sheets`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new ApiError(error.message, response.status);
    }
    return response.json() as Promise<{ sheets: Array<{ name: string; rowCount: number; columnCount: number }> }>;
  },

  previewData: async (file: File, sheetName: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sheetName', sheetName);
    const response = await fetch(`${API_BASE}/import/preview-data`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }));
      throw new ApiError(error.message, response.status);
    }
    return response.json() as Promise<{ headers: string[]; preview: unknown[][]; totalRows: number }>;
  },

  importCupaCatalog: async (file: File, catalogYear: string, sheetName?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('catalogYear', catalogYear);
    if (sheetName) formData.append('sheetName', sheetName);
    const response = await fetch(`${API_BASE}/import/cupa-catalog`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Import failed' }));
      throw new ApiError(error.message, response.status);
    }
    return response.json() as Promise<ImportResult>;
  },

  importPositions: async (file: File, sheetNames?: string[]) => {
    const formData = new FormData();
    formData.append('file', file);
    if (sheetNames) formData.append('sheetNames', JSON.stringify(sheetNames));
    const response = await fetch(`${API_BASE}/import/positions`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Import failed' }));
      throw new ApiError(error.message, response.status);
    }
    return response.json() as Promise<ImportResult>;
  },

  importCompensation: async (file: File, sheetName?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (sheetName) formData.append('sheetName', sheetName);
    const response = await fetch(`${API_BASE}/import/compensation`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Import failed' }));
      throw new ApiError(error.message, response.status);
    }
    return response.json() as Promise<ImportResult>;
  },

  importCupaSalary: async (file: File, dataYear: string, sheetName?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('dataYear', dataYear);
    if (sheetName) formData.append('sheetName', sheetName);
    const response = await fetch(`${API_BASE}/import/cupa-salary`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Import failed' }));
      throw new ApiError(error.message, response.status);
    }
    return response.json() as Promise<ImportResult>;
  },
};

// Equity Analysis API
export const equityAnalysisApi = {
  calculate: (dataYear: string) =>
    fetchApi<{ success: boolean; analyzed: number; errors: number; message: string }>(
      '/equity-analysis/calculate',
      { method: 'POST', body: JSON.stringify({ dataYear }) }
    ),

  getSummary: () =>
    fetchApi<EquityAnalysisSummary>('/equity-analysis/summary'),

  getByVp: () =>
    fetchApi<EquitySummaryByVp[]>('/equity-analysis/by-vp'),

  getPositions: (params?: {
    vpStem?: string;
    compensationType?: string;
    gapOnly?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.vpStem) searchParams.set('vpStem', params.vpStem);
    if (params?.compensationType) searchParams.set('compensationType', params.compensationType);
    if (params?.gapOnly) searchParams.set('gapOnly', 'true');
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    return fetchApi<PaginatedResponse<EquityAnalysisWithPosition>>(
      `/equity-analysis/positions?${searchParams}`
    );
  },

  allocateBudget: (totalBudget: number) =>
    fetchApi<{ totalBudget: number; allocation: BudgetAllocation[]; totalAllocated: number }>(
      '/equity-analysis/allocate-budget',
      { method: 'POST', body: JSON.stringify({ totalBudget }) }
    ),

  proposeRaise: (positionMappingId: number, proposedRaise: number) =>
    fetchApi<{ success: boolean; positionMappingId: number; proposedRaise: number }>(
      '/equity-analysis/propose-raise',
      { method: 'POST', body: JSON.stringify({ positionMappingId, proposedRaise }) }
    ),

  getProposedRaises: () =>
    fetchApi<Array<{
      positionMappingId: number;
      employeeName: string;
      vpStem: string;
      currentSalary: number | null;
      equityGap: number | null;
      proposedRaise: number;
      newSalary: number | null;
      remainingGap: number | null;
    }>>('/equity-analysis/proposed-raises'),

  autoAllocate: (totalBudget: number, vpStem?: string) =>
    fetchApi<{ success: boolean; totalBudget: number; allocated: number; positionsUpdated: number }>(
      '/equity-analysis/auto-allocate',
      { method: 'POST', body: JSON.stringify({ totalBudget, vpStem }) }
    ),

  clearRaises: (vpStem?: string) =>
    fetchApi<{ success: boolean; cleared: number }>(
      '/equity-analysis/clear-raises',
      { method: 'POST', body: JSON.stringify({ vpStem }) }
    ),

  export: () => {
    // Direct download - returns a blob
    window.open(`${API_BASE}/equity-analysis/export`, '_blank');
  },

  getSalaryDataYears: () =>
    fetchApi<Array<{ data_year: string; count: number }>>('/equity-analysis/salary-data-years'),

  // Salary History endpoints
  getHistoryYears: () =>
    fetchApi<string[]>('/equity-analysis/history/years'),

  getHistorySummary: (vpStem?: string) => {
    const params = vpStem ? `?vpStem=${encodeURIComponent(vpStem)}` : '';
    return fetchApi<{
      years: string[];
      totalRaisesByYear: Array<{ year: string; totalRaises: number; avgRaise: number; employeesHelped: number }>;
      employeesWithClosedGap: number;
      employeesStillNeedingHelp: number;
    }>(`/equity-analysis/history/summary${params}`);
  },

  getHistory: (vpStem?: string) => {
    const params = vpStem ? `?vpStem=${encodeURIComponent(vpStem)}` : '';
    return fetchApi<Array<{
      employeeId: string;
      employeeName: string;
      vpStem: string;
      department: string;
      institutionalTitle: string;
      years: Array<{ year: string; salary: number | null; gap: number | null; raiseGiven: number | null }>;
      gapTrend: 'improving' | 'worsening' | 'stable' | 'unknown';
      totalRaisesReceived: number;
      currentGap: number | null;
    }>>(`/equity-analysis/history${params}`);
  },

  getEmployeeHistory: (employeeId: string) =>
    fetchApi<Array<{
      id: number;
      employeeId: string;
      employeeName: string;
      vpStem: string;
      department: string;
      institutionalTitle: string;
      currentSalary: number | null;
      equityGap: number | null;
      proposedRaise: number | null;
      actualRaiseGiven: number | null;
      dataYear: string;
      snapshotDate: string;
    }>>(`/equity-analysis/history/employee/${encodeURIComponent(employeeId)}`),

  createSnapshot: (dataYear: string) =>
    fetchApi<{ success: boolean; snapshotCount: number; dataYear: string }>(
      '/equity-analysis/history/snapshot',
      { method: 'POST', body: JSON.stringify({ dataYear }) }
    ),

  submitReview: (vpStem?: string, notes?: string) =>
    fetchApi<{ 
      success: boolean; 
      employeesUpdated: number; 
      totalRaisesApproved: number; 
      dataYear: string;
    }>(
      '/equity-analysis/submit-review',
      { method: 'POST', body: JSON.stringify({ vpStem, notes }) }
    ),
};

// VP Roles API
export const vpRolesApi = {
  list: () => fetchApi<VpRole[]>('/vp-roles'),

  get: (id: number) => fetchApi<VpRole>(`/vp-roles/${id}`),

  assign: (roleId: number, email: string | null, name: string | null) =>
    fetchApi<VpRole>(`/vp-roles/${roleId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ email, name }),
    }),

  update: (id: number, data: { title?: string; description?: string | null }) =>
    fetchApi<VpRole>(`/vp-roles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  sync: () =>
    fetchApi<{ message: string; created: number; updated: number }>('/vp-roles/sync', {
      method: 'POST',
    }),
};
