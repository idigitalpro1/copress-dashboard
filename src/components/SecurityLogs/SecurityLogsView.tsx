import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  Trash2,
  Clock,
  User,
  Key,
  ChevronDown,
  ChevronRight,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Sparkles,
  FileSpreadsheet,
  FileText,
  Lock,
  Unlock,
  Radio,
  Globe,
  SlidersHorizontal,
} from 'lucide-react';
import { SecurityLogItem, SecurityLogStats, SecurityActionType, SecurityStatus } from '../../types';
import { api } from '../../services/api';

interface SecurityLogsViewProps {
  onRefreshKeys?: () => void;
}

export const SecurityLogsView: React.FC<SecurityLogsViewProps> = () => {
  const [logs, setLogs] = useState<SecurityLogItem[]>([]);
  const [stats, setStats] = useState<SecurityLogStats>({
    total: 0,
    validations: 0,
    rotations: 0,
    revocations: 0,
    failures: 0,
    avgLatency: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [triggerFilter, setTriggerFilter] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await api.getAuditLogs({
        action: actionFilter,
        status: statusFilter,
        trigger: triggerFilter,
        search: searchQuery,
      });
      setLogs(res.logs || []);
      setStats(
        res.stats || {
          total: 0,
          validations: 0,
          rotations: 0,
          revocations: 0,
          failures: 0,
          avgLatency: 0,
        }
      );
    } catch (err: any) {
      console.error('Failed to load security logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, statusFilter, triggerFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  const handleClearLogs = async () => {
    if (
      !window.confirm(
        'Are you sure you want to reset the security audit log? An audit reset record will be preserved for compliance.'
      )
    ) {
      return;
    }
    setIsClearing(true);
    try {
      await api.clearSecurityLogs();
      await fetchLogs();
    } catch (err: any) {
      alert(`Failed to reset logs: ${err.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  const exportToJson = () => {
    // Strictly zero-leak payload
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `newsflow-security-audit-logs-${new Date().toISOString().split('T')[0]}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportToCsv = () => {
    const headers = [
      'ID',
      'Timestamp',
      'Action',
      'Trigger',
      'Key Label',
      'Provider',
      'Masked Key',
      'Status',
      'Actor',
      'IP / Origin',
      'Latency (ms)',
      'Details',
    ];
    const rows = logs.map((l) => [
      l.id,
      l.timestamp,
      l.action,
      l.trigger || 'manual',
      l.keyLabel || '',
      l.provider || '',
      l.maskedKey || '',
      l.status,
      l.actor,
      l.ip ? `${l.ip}${l.origin ? ` (${l.origin})` : ''}` : '',
      l.latencyMs !== undefined ? String(l.latencyMs) : '',
      `"${(l.details || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `newsflow-security-audit-logs-${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const getActionBadge = (action: SecurityActionType) => {
    const act = action.toUpperCase();

    if (act.includes('VALIDATION_SUCCESS')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span>Validation Success</span>
        </span>
      );
    }
    if (act.includes('VALIDATION_FAILED')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/80 text-rose-300 border border-rose-800">
          <XCircle className="w-3 h-3 text-rose-400" />
          <span>Validation Failed</span>
        </span>
      );
    }
    if (act.includes('VALIDAT')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-sky-950/80 text-sky-300 border border-sky-800">
          <Radio className="w-3 h-3 text-sky-400" />
          <span>Validation Ping</span>
        </span>
      );
    }
    if (act.includes('ROTAT')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-950/80 text-purple-300 border border-purple-800">
          <RefreshCw className="w-3 h-3 text-purple-400" />
          <span>Key Rotated</span>
        </span>
      );
    }
    if (act.includes('REVOK')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/80 text-rose-300 border border-rose-800">
          <Lock className="w-3 h-3 text-rose-400" />
          <span>Key Revoked</span>
        </span>
      );
    }
    if (act.includes('REACTIVAT')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800">
          <Unlock className="w-3 h-3 text-emerald-400" />
          <span>Re-Activated</span>
        </span>
      );
    }
    if (act.includes('CREAT')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-950/80 text-indigo-300 border border-indigo-800">
          <Key className="w-3 h-3 text-indigo-400" />
          <span>Key Created</span>
        </span>
      );
    }
    if (act.includes('IMPORT')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-teal-950/80 text-teal-300 border border-teal-800">
          <Sparkles className="w-3 h-3 text-teal-400" />
          <span>Env Imported</span>
        </span>
      );
    }
    if (act.includes('DELET') || act.includes('PURG')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/80 text-amber-300 border border-amber-800">
          <Trash2 className="w-3 h-3 text-amber-400" />
          <span>Key Purged</span>
        </span>
      );
    }
    if (act.includes('DEFAULT')) {
      return (
        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-950/80 text-blue-300 border border-blue-800">
          <CheckCircle2 className="w-3 h-3 text-blue-400" />
          <span>Default Key</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 font-mono">
        {action}
      </span>
    );
  };

  const getStatusBadge = (status: SecurityStatus) => {
    switch (status) {
      case 'success':
        return (
          <span className="inline-flex items-center space-x-1 text-emerald-400 text-xs font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Success</span>
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center space-x-1 text-amber-400 text-xs font-medium">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Warning</span>
          </span>
        );
      case 'failure':
        return (
          <span className="inline-flex items-center space-x-1 text-rose-400 text-xs font-medium">
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Failed</span>
          </span>
        );
      case 'info':
      default:
        return (
          <span className="inline-flex items-center space-x-1 text-indigo-400 text-xs font-medium">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Notice</span>
          </span>
        );
    }
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Auditing KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Audit Events */}
        <div
          onClick={() => {
            setActionFilter('all');
            setStatusFilter('all');
          }}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3 shadow-sm hover:border-slate-700 cursor-pointer transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-100">{stats.total}</div>
            <div className="text-xs text-slate-400 font-medium">Total Events</div>
          </div>
        </div>

        {/* Validations */}
        <div
          onClick={() => setActionFilter('validations')}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3 shadow-sm hover:border-sky-800 cursor-pointer transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-sky-300">{stats.validations}</div>
            <div className="text-xs text-slate-400 font-medium">Validations</div>
          </div>
        </div>

        {/* Rotations */}
        <div
          onClick={() => setActionFilter('rotations')}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3 shadow-sm hover:border-purple-800 cursor-pointer transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-purple-300">{stats.rotations}</div>
            <div className="text-xs text-slate-400 font-medium">Key Rotations</div>
          </div>
        </div>

        {/* Revocations */}
        <div
          onClick={() => setActionFilter('revocations')}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3 shadow-sm hover:border-rose-800 cursor-pointer transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-rose-300">{stats.revocations}</div>
            <div className="text-xs text-slate-400 font-medium">Revocations</div>
          </div>
        </div>

        {/* Avg Latency */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-emerald-300">{stats.avgLatency}ms</div>
            <div className="text-xs text-slate-400 font-medium">Avg Ping Latency</div>
          </div>
        </div>

        {/* Failed Checks */}
        <div
          onClick={() => setStatusFilter('failure')}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3 shadow-sm hover:border-amber-800 cursor-pointer transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-amber-300">{stats.failures}</div>
            <div className="text-xs text-slate-400 font-medium">Flagged Errors</div>
          </div>
        </div>
      </div>

      {/* Quick Filter Pills Row */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mr-1">
          <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
          <span>Quick Filters:</span>
        </span>

        <button
          type="button"
          onClick={() => {
            setActionFilter('all');
            setStatusFilter('all');
            setTriggerFilter('all');
          }}
          className={`px-3 py-1 rounded-xl text-xs font-medium transition-all ${
            actionFilter === 'all' && statusFilter === 'all' && triggerFilter === 'all'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
          }`}
        >
          All ({stats.total})
        </button>

        <button
          type="button"
          onClick={() => setActionFilter(actionFilter === 'validations' ? 'all' : 'validations')}
          className={`px-3 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
            actionFilter === 'validations'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'bg-slate-900 text-sky-400/90 border border-slate-800 hover:border-sky-800'
          }`}
        >
          <ShieldCheck className="w-3 h-3" />
          <span>Validations ({stats.validations})</span>
        </button>

        <button
          type="button"
          onClick={() => setActionFilter(actionFilter === 'rotations' ? 'all' : 'rotations')}
          className={`px-3 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
            actionFilter === 'rotations'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-slate-900 text-purple-400/90 border border-slate-800 hover:border-purple-800'
          }`}
        >
          <RefreshCw className="w-3 h-3" />
          <span>Rotations ({stats.rotations})</span>
        </button>

        <button
          type="button"
          onClick={() => setActionFilter(actionFilter === 'revocations' ? 'all' : 'revocations')}
          className={`px-3 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
            actionFilter === 'revocations'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-slate-900 text-rose-400/90 border border-slate-800 hover:border-rose-800'
          }`}
        >
          <Lock className="w-3 h-3" />
          <span>Revocations ({stats.revocations})</span>
        </button>

        <button
          type="button"
          onClick={() => setActionFilter(actionFilter === 'imports' ? 'all' : 'imports')}
          className={`px-3 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
            actionFilter === 'imports'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'bg-slate-900 text-teal-400/90 border border-slate-800 hover:border-teal-800'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          <span>Env Imports</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'failure' ? 'all' : 'failure')}
          className={`px-3 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
            statusFilter === 'failure'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-slate-900 text-amber-400/90 border border-slate-800 hover:border-amber-800'
          }`}
        >
          <AlertTriangle className="w-3 h-3" />
          <span>Failures Only ({stats.failures})</span>
        </button>

        <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

        <button
          type="button"
          onClick={() => setTriggerFilter(triggerFilter === 'manual' ? 'all' : 'manual')}
          className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1 ${
            triggerFilter === 'manual'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
          }`}
        >
          <User className="w-3 h-3" />
          <span>Manual UI</span>
        </button>

        <button
          type="button"
          onClick={() => setTriggerFilter(triggerFilter === 'automated' ? 'all' : 'automated')}
          className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1 ${
            triggerFilter === 'automated'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-3 h-3" />
          <span>Automated</span>
        </button>
      </div>

      {/* Audit Search, Detailed Filter, and Export Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs by keyword, actor, key label, or masked key..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </form>

        {/* Detailed Filters & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Action Filter */}
          <div className="flex items-center space-x-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All Event Types</option>
              <option value="validations">Validations Only</option>
              <option value="rotations">Rotations Only</option>
              <option value="revocations">Revocations Only</option>
              <option value="imports">Env Imports Only</option>
              <option value="KEY_CREATED">Key Creations</option>
              <option value="KEY_DELETED">Purged Keys</option>
              <option value="DEFAULT_SET">Default Designations</option>
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="failure">Failed</option>
            <option value="info">Notice / Info</option>
          </select>

          {/* Refresh */}
          <button
            type="button"
            onClick={fetchLogs}
            disabled={isLoading}
            title="Refresh logs"
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`}
            />
          </button>

          {/* Export Audit Log (JSON) Button */}
          <button
            type="button"
            onClick={exportToJson}
            disabled={logs.length === 0}
            className="flex items-center space-x-1.5 text-xs text-indigo-300 hover:text-white bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-800/80 px-3.5 py-2 rounded-xl transition-colors cursor-pointer font-medium shadow-sm"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span>Export Audit Log (JSON)</span>
          </button>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={exportToCsv}
            disabled={logs.length === 0}
            className="flex items-center space-x-1.5 text-xs text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800/80 px-3.5 py-2 rounded-xl transition-colors cursor-pointer font-medium shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>

          {/* Reset Log */}
          <button
            type="button"
            onClick={handleClearLogs}
            disabled={isClearing}
            title="Clear and reset audit log table"
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Audit Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            <h3 className="font-semibold text-slate-100 text-sm">
              Cryptographic Key Lifecycle & Proxy Audit Trail
            </h3>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              Showing {logs.length} record{logs.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="text-[11px] text-slate-400 font-mono hidden sm:flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Zero-Leak Enforced • AES-256 GCM Storage</span>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-mono">
              Loading security logs & validation audit trail...
            </p>
          </div>
        ) : logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-mono border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Key / Provider</th>
                  <th className="py-3 px-4">Actor / Trigger</th>
                  <th className="py-3 px-4">Outcome</th>
                  <th className="py-3 px-4">Details</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-sans">
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-slate-800/30' : ''
                        }`}
                      >
                        {/* Timestamp */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[11px] text-slate-400">
                          {formatTimestamp(log.timestamp)}
                        </td>

                        {/* Action Badge */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {getActionBadge(log.action)}
                        </td>

                        {/* Key & Provider (Strictly Masked) */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {log.keyLabel ? (
                            <div>
                              <div className="font-semibold text-slate-200 text-xs">
                                {log.keyLabel}
                              </div>
                              <div className="font-mono text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <span className="capitalize">{log.provider || 'AI'}</span>
                                {log.maskedKey && (
                                  <span className="text-slate-300 font-mono tracking-wider">
                                    • {log.maskedKey}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-500 font-mono text-[11px]">—</span>
                          )}
                        </td>

                        {/* Actor & Trigger Context */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[11px] text-slate-300">
                          <div className="flex items-center space-x-1.5">
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-800/70 border border-slate-700/60">
                              {log.trigger === 'automated' ? (
                                <Cpu className="w-3 h-3 text-cyan-400" />
                              ) : (
                                <User className="w-3 h-3 text-indigo-400" />
                              )}
                              <span>{log.actor}</span>
                            </span>
                            <span className="text-[10px] text-slate-500 capitalize">
                              ({log.trigger || 'manual'})
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            {getStatusBadge(log.status)}
                            {log.latencyMs !== undefined && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                ({log.latencyMs}ms)
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Details */}
                        <td className="py-3.5 px-4 text-slate-300 text-xs max-w-md truncate">
                          {log.details}
                        </td>

                        {/* Expand toggle */}
                        <td className="py-3.5 px-4 text-right text-slate-400">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 ml-auto text-indigo-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 ml-auto text-slate-500" />
                          )}
                        </td>
                      </tr>

                      {/* Expanded Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-950/80">
                          <td colSpan={7} className="p-4 border-b border-slate-800">
                            <div className="space-y-3 pl-2 sm:pl-4">
                              <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
                                <div>
                                  <span className="text-slate-500">Record ID: </span>
                                  <span className="text-slate-300">{log.id}</span>
                                </div>
                                {log.keyId && (
                                  <div>
                                    <span className="text-slate-500">Key ID: </span>
                                    <span className="text-slate-300">{log.keyId}</span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-slate-500">Trigger Mode: </span>
                                  <span className="text-indigo-300 capitalize">
                                    {log.trigger || 'manual'}
                                  </span>
                                </div>
                                {log.ip && (
                                  <div className="flex items-center gap-1">
                                    <Globe className="w-3 h-3 text-slate-500" />
                                    <span className="text-slate-500">Origin / IP: </span>
                                    <span className="text-slate-300">
                                      {log.ip} {log.origin ? `(${log.origin})` : ''}
                                    </span>
                                  </div>
                                )}
                                {log.latencyMs !== undefined && (
                                  <div>
                                    <span className="text-slate-500">Proxy Latency: </span>
                                    <span className="text-emerald-400">{log.latencyMs} ms</span>
                                  </div>
                                )}
                              </div>

                              <div>
                                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                  Audit Log Description:
                                </div>
                                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 font-sans leading-relaxed">
                                  {log.details}
                                </div>
                              </div>

                              {log.metadata && Object.keys(log.metadata).length > 0 && (
                                <div>
                                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                    Technical Audit Metadata (Sanitized):
                                  </div>
                                  <pre className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-indigo-300 overflow-x-auto">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center space-y-2">
            <ShieldCheck className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-sm font-semibold text-slate-300">No Security Events Found</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No audit records matched your search query or filter. Clear the filters or execute
              validations/rotations in the vault to observe logs.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
