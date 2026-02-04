import { type Component, createSignal, createResource, Show, For, createEffect, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import { A } from '@solidjs/router';
import {
    ArrowLeft, Download, Upload, Loader2, Database, Clock, Calendar,
    RefreshCw, FileText, Settings, Check, X, AlertCircle, Package,
    Users, ShoppingCart, CreditCard, Warehouse
} from 'lucide-solid';
import { api, API_BASE_URL } from '../../lib/api';

// Types
interface ExportRecord {
    id: string;
    format: 'json' | 'csv';
    status: 'pending' | 'processing' | 'completed' | 'failed';
    filename: string | null;
    fileSize: number | null;
    includeProducts: boolean;
    includeCustomers: boolean;
    includeOrders: boolean;
    includePayments: boolean;
    includeInventory: boolean;
    createdAt: string;
    completedAt: string | null;
    expiresAt: string | null;
    downloadedAt: string | null;
    errorMessage: string | null;
}

interface ExportSettings {
    id: string;
    tenantId: string;
    frequency: 'never' | 'daily' | 'weekly' | 'monthly';
    format: 'json' | 'csv' | 'xlsx';
    scheduleTime: string; // HH:MM format
    sendToTelegram: boolean; // Send export to Telegram
    includeProducts: boolean;
    includeCustomers: boolean;
    includeOrders: boolean;
    includePayments: boolean;
    includeInventory: boolean;
    retentionDays: number;
    lastExportAt: string | null;
    nextExportAt: string | null;
}

interface ImportResult {
    imported: {
        products?: number;
        customers?: number;
    };
    errors?: string[];
}

const DataExport: Component = () => {
    const [creating, setCreating] = createSignal(false);
    const [importing, setImporting] = createSignal(false);
    const [savingSettings, setSavingSettings] = createSignal(false);
    const [message, setMessage] = createSignal<{ type: 'success' | 'error'; text: string } | null>(null);
    const [activeTab, setActiveTab] = createSignal<'export' | 'import' | 'schedule'>('export');

    // Export options
    const [exportOptions, setExportOptions] = createStore({
        format: 'json' as 'json' | 'csv' | 'xlsx',
        includeProducts: true,
        includeCustomers: true,
        includeOrders: true,
        includePayments: true,
        includeInventory: true,
    });

    // Import options
    const [importOptions, setImportOptions] = createStore({
        importProducts: true,
        importCustomers: true,
        skipExisting: true,
    });

    // Fetch exports list
    const [exports, { refetch: refetchExports }] = createResource(async () => {
        const res = await api<ExportRecord[]>('/tenant/exports');
        return res || [];
    });

    // Auto-refresh exports list every 30 seconds when on export tab
    createEffect(() => {
        if (activeTab() === 'export') {
            const interval = setInterval(() => {
                refetchExports();
            }, 30000); // 30 seconds
            onCleanup(() => clearInterval(interval));
        }
    });

    // Fetch export settings
    const [settings, { refetch: refetchSettings }] = createResource(async () => {
        const res = await api<ExportSettings>('/tenant/export-settings');
        return res;
    });

    // Update schedule form when settings load
    const [scheduleForm, setScheduleForm] = createStore<Partial<ExportSettings & { scheduleTime: string }>>({
        frequency: 'never',
        format: 'json',
        scheduleTime: '03:00',
        sendToTelegram: false,
        includeProducts: true,
        includeCustomers: true,
        includeOrders: true,
        includePayments: true,
        includeInventory: true,
        retentionDays: 30,
    });

    createEffect(() => {
        const s = settings();
        if (s) {
            setScheduleForm({
                frequency: s.frequency,
                format: s.format,
                scheduleTime: s.scheduleTime || '03:00',
                sendToTelegram: s.sendToTelegram ?? false,
                includeProducts: s.includeProducts,
                includeCustomers: s.includeCustomers,
                includeOrders: s.includeOrders,
                includePayments: s.includePayments,
                includeInventory: s.includeInventory,
                retentionDays: s.retentionDays,
            });
        }
    });

    // Create export
    const handleCreateExport = async () => {
        if (creating()) return;
        setCreating(true);
        setMessage(null);

        try {
            await api('/tenant/export', {
                method: 'POST',
                body: JSON.stringify(exportOptions),
            });
            setMessage({ type: 'success', text: 'Export started! It will be ready in a few moments.' });
            setTimeout(() => refetchExports(), 2000); // Refresh after a delay
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to create export' });
        } finally {
            setCreating(false);
        }
    };

    // Save schedule settings
    const handleSaveSettings = async () => {
        if (savingSettings()) return;
        setSavingSettings(true);
        setMessage(null);

        try {
            await api('/tenant/export-settings', {
                method: 'PUT',
                body: JSON.stringify(scheduleForm),
            });
            setMessage({ type: 'success', text: 'Schedule saved successfully!' });
            refetchSettings();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to save settings' });
        } finally {
            setSavingSettings(false);
        }
    };

    // Handle file import
    const handleFileImport = async (event: Event) => {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        setImporting(true);
        setMessage(null);

        try {
            const content = await file.text();
            const res = await api<ImportResult>('/tenant/import', {
                method: 'POST',
                body: JSON.stringify({
                    data: content,
                    ...importOptions,
                }),
            });

            const importedCount = (res.imported?.products || 0) + (res.imported?.customers || 0);
            if (res.errors && res.errors.length > 0) {
                setMessage({
                    type: 'error',
                    text: `Imported ${importedCount} items with ${res.errors.length} errors`,
                });
            } else {
                setMessage({
                    type: 'success',
                    text: `Successfully imported ${importedCount} items!`,
                });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to import data' });
        } finally {
            setImporting(false);
            input.value = '';
        }
    };

    // Format helpers
    const formatSize = (bytes: number | null) => {
        if (!bytes) return '—';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleString();
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'text-emerald-400 bg-emerald-500/10';
            case 'processing': return 'text-blue-400 bg-blue-500/10';
            case 'pending': return 'text-amber-400 bg-amber-500/10';
            case 'failed': return 'text-red-400 bg-red-500/10';
            default: return 'text-slate-400 bg-slate-500/10';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return Check;
            case 'processing': return Loader2;
            case 'pending': return Clock;
            case 'failed': return X;
            default: return FileText;
        }
    };

    // Handle download with authentication
    const handleDownload = async (exportId: string, filename: string) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE_URL}/tenant/exports/${exportId}/download`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Download failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || `export-${exportId}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            // Refresh to update downloadedAt
            refetchExports();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Download failed' });
        }
    };

    // Data type toggle component
    const DataTypeToggle = (props: {
        icon: any;
        label: string;
        checked: boolean;
        onChange: (v: boolean) => void;
    }) => (
        <button
            type="button"
            onClick={() => props.onChange(!props.checked)}
            class={`flex items-center gap-3 p-3 rounded-xl border transition-all ${props.checked
                ? 'bg-blue-500/10 border-blue-500/30 text-white'
                : 'bg-slate-900/50 border-slate-700/50 text-slate-400 hover:border-slate-600'
                }`}
        >
            <div class={`w-8 h-8 rounded-lg flex items-center justify-center ${props.checked ? 'bg-blue-500/20' : 'bg-slate-800'
                }`}>
                <props.icon class={`w-4 h-4 ${props.checked ? 'text-blue-400' : 'text-slate-500'}`} />
            </div>
            <span class="flex-1 text-left text-sm font-medium">{props.label}</span>
            <div class={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${props.checked
                ? 'bg-blue-500 border-blue-500'
                : 'border-slate-600'
                }`}>
                <Show when={props.checked}>
                    <Check class="w-3 h-3 text-white" />
                </Show>
            </div>
        </button>
    );

    return (
        <div class="p-6 lg:p-8 max-w-6xl mx-auto">
            {/* Header */}
            <A href="/admin/settings" class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors">
                <ArrowLeft class="w-4 h-4" /> Back to Settings
            </A>
            <h1 class="text-2xl font-bold text-white mb-2 flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                    <Database class="w-5 h-5 text-white" />
                </div>
                Data Export & Import
            </h1>
            <p class="text-slate-400 mb-8">Download your data or import from a backup file</p>

            {/* Tabs */}
            <div class="flex gap-2 mb-6 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800/50 w-fit">
                <button
                    onClick={() => setActiveTab('export')}
                    class={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${activeTab() === 'export'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                >
                    <Download class="w-4 h-4 inline-block mr-2" />
                    Export
                </button>
                <button
                    onClick={() => setActiveTab('import')}
                    class={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${activeTab() === 'import'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                >
                    <Upload class="w-4 h-4 inline-block mr-2" />
                    Import
                </button>
                <button
                    onClick={() => setActiveTab('schedule')}
                    class={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${activeTab() === 'schedule'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                >
                    <Calendar class="w-4 h-4 inline-block mr-2" />
                    Schedule
                </button>
            </div>

            {/* Export Tab */}
            <Show when={activeTab() === 'export'}>
                <div class="grid lg:grid-cols-2 gap-8">
                    {/* Create Export */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Download class="w-5 h-5 text-blue-400" />
                            Create New Export
                        </h2>

                        {/* Format Selection */}
                        <div class="mb-6">
                            <label class="text-sm text-slate-400 mb-2 block">Export Format</label>
                            <div class="flex gap-2">
                                <button
                                    onClick={() => setExportOptions('format', 'json')}
                                    class={`flex-1 py-2.5 rounded-xl font-medium transition-all ${exportOptions.format === 'json'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                        }`}
                                >
                                    JSON
                                </button>
                                <button
                                    onClick={() => setExportOptions('format', 'csv')}
                                    class={`flex-1 py-2.5 rounded-xl font-medium transition-all ${exportOptions.format === 'csv'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                        }`}
                                >
                                    CSV
                                </button>
                                <button
                                    onClick={() => setExportOptions('format', 'xlsx')}
                                    class={`flex-1 py-2.5 rounded-xl font-medium transition-all ${exportOptions.format === 'xlsx'
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                        }`}
                                >
                                    Excel
                                </button>
                            </div>
                        </div>

                        {/* Data Types */}
                        <div class="mb-6">
                            <label class="text-sm text-slate-400 mb-3 block">Include Data</label>
                            <div class="grid grid-cols-1 gap-2">
                                <DataTypeToggle
                                    icon={Package}
                                    label="Products"
                                    checked={exportOptions.includeProducts}
                                    onChange={(v) => setExportOptions('includeProducts', v)}
                                />
                                <DataTypeToggle
                                    icon={Users}
                                    label="Customers"
                                    checked={exportOptions.includeCustomers}
                                    onChange={(v) => setExportOptions('includeCustomers', v)}
                                />
                                <DataTypeToggle
                                    icon={ShoppingCart}
                                    label="Orders"
                                    checked={exportOptions.includeOrders}
                                    onChange={(v) => setExportOptions('includeOrders', v)}
                                />
                                <DataTypeToggle
                                    icon={CreditCard}
                                    label="Payments"
                                    checked={exportOptions.includePayments}
                                    onChange={(v) => setExportOptions('includePayments', v)}
                                />
                                <DataTypeToggle
                                    icon={Warehouse}
                                    label="Inventory"
                                    checked={exportOptions.includeInventory}
                                    onChange={(v) => setExportOptions('includeInventory', v)}
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleCreateExport}
                            disabled={creating()}
                            class="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <Show when={creating()} fallback={<Download class="w-5 h-5" />}>
                                <Loader2 class="w-5 h-5 animate-spin" />
                            </Show>
                            {creating() ? 'Creating Export...' : 'Create Export'}
                        </button>
                    </div>

                    {/* Export History */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 flex flex-col">
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center gap-2">
                                <h2 class="text-lg font-semibold text-white">Export History</h2>
                                <span class="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded" title="List refreshes automatically every 30 seconds">
                                    Auto-refresh
                                </span>
                            </div>
                            <button
                                onClick={() => refetchExports()}
                                class="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                                title="Refresh now"
                            >
                                <RefreshCw class="w-4 h-4" />
                            </button>
                        </div>

                        <div class="flex-1 overflow-y-auto space-y-3 max-h-96">
                            <Show when={exports.loading}>
                                <div class="flex justify-center py-10">
                                    <Loader2 class="w-8 h-8 text-blue-500 animate-spin" />
                                </div>
                            </Show>

                            <Show when={!exports.loading && exports()?.length === 0}>
                                <div class="text-center py-10 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                                    <Database class="w-10 h-10 mx-auto mb-2 opacity-50" />
                                    No exports yet
                                </div>
                            </Show>

                            <For each={exports()}>
                                {(exp) => {
                                    const StatusIcon = getStatusIcon(exp.status);
                                    return (
                                        <div class="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors">
                                            <div class="flex items-center gap-3">
                                                <div class={`w-10 h-10 rounded-lg flex items-center justify-center ${getStatusColor(exp.status)}`}>
                                                    <StatusIcon class={`w-5 h-5 ${exp.status === 'processing' ? 'animate-spin' : ''}`} />
                                                </div>
                                                <div>
                                                    <div class="text-sm font-medium text-white flex items-center gap-2">
                                                        {exp.filename || `Export ${exp.id.slice(0, 8)}`}
                                                        <span class="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-300 uppercase">
                                                            {exp.format}
                                                        </span>
                                                    </div>
                                                    <div class="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                                                        <span>{formatDate(exp.createdAt)}</span>
                                                        <Show when={exp.fileSize}>
                                                            <span>•</span>
                                                            <span>{formatSize(exp.fileSize)}</span>
                                                        </Show>
                                                    </div>
                                                </div>
                                            </div>
                                            <Show when={exp.status === 'completed' && exp.filename}>
                                                <button
                                                    onClick={() => handleDownload(exp.id, exp.filename!)}
                                                    class="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                    title="Download"
                                                >
                                                    <Download class="w-5 h-5" />
                                                </button>
                                            </Show>
                                            <Show when={exp.status === 'failed'}>
                                                <div class="text-xs text-red-400 max-w-32 truncate" title={exp.errorMessage || ''}>
                                                    {exp.errorMessage || 'Export failed'}
                                                </div>
                                            </Show>
                                        </div>
                                    );
                                }}
                            </For>
                        </div>
                    </div>
                </div>
            </Show >

            {/* Import Tab */}
            < Show when={activeTab() === 'import'}>
                <div class="max-w-xl mx-auto">
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Upload class="w-5 h-5 text-emerald-400" />
                            Import Data
                        </h2>

                        <p class="text-sm text-slate-400 mb-6">
                            Upload a JSON export file to import data. Only JSON format is supported for import.
                        </p>

                        {/* Import Options */}
                        <div class="mb-6">
                            <label class="text-sm text-slate-400 mb-3 block">Import Options</label>
                            <div class="space-y-2">
                                <DataTypeToggle
                                    icon={Package}
                                    label="Import Products"
                                    checked={importOptions.importProducts}
                                    onChange={(v) => setImportOptions('importProducts', v)}
                                />
                                <DataTypeToggle
                                    icon={Users}
                                    label="Import Customers"
                                    checked={importOptions.importCustomers}
                                    onChange={(v) => setImportOptions('importCustomers', v)}
                                />
                            </div>

                            <label class="flex items-center gap-3 mt-4 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 cursor-pointer hover:border-slate-600 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={importOptions.skipExisting}
                                    onChange={(e) => setImportOptions('skipExisting', e.currentTarget.checked)}
                                    class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                                />
                                <div>
                                    <div class="text-sm font-medium text-white">Skip existing records</div>
                                    <div class="text-xs text-slate-500">Don't overwrite products/customers that already exist</div>
                                </div>
                            </label>
                        </div>

                        {/* File Upload */}
                        <label class="block">
                            <div class={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${importing()
                                ? 'border-blue-500/50 bg-blue-500/5'
                                : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/30'
                                }`}>
                                <Show when={importing()} fallback={
                                    <>
                                        <Upload class="w-10 h-10 text-slate-500 mx-auto mb-3" />
                                        <div class="text-white font-medium mb-1">Drop file here or click to upload</div>
                                        <div class="text-sm text-slate-500">JSON export files only</div>
                                    </>
                                }>
                                    <Loader2 class="w-10 h-10 text-blue-400 mx-auto mb-3 animate-spin" />
                                    <div class="text-white font-medium">Importing data...</div>
                                </Show>
                            </div>
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleFileImport}
                                disabled={importing()}
                                class="hidden"
                            />
                        </label>

                        <div class="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                            <div class="flex items-start gap-2 text-amber-400">
                                <AlertCircle class="w-4 h-4 mt-0.5 flex-shrink-0" />
                                <div class="text-sm">
                                    <strong>Note:</strong> Import will add new records. Existing data with matching SKU/phone will be skipped if "Skip existing" is enabled.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Show >

            {/* Schedule Tab */}
            < Show when={activeTab() === 'schedule'}>
                <div class="max-w-xl mx-auto">
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                        <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Calendar class="w-5 h-5 text-purple-400" />
                            Scheduled Exports
                        </h2>

                        <p class="text-sm text-slate-400 mb-6">
                            Configure automatic exports to run on a schedule. Export files will be available for download for the retention period.
                        </p>

                        <Show when={settings.loading}>
                            <div class="flex justify-center py-10">
                                <Loader2 class="w-8 h-8 text-blue-500 animate-spin" />
                            </div>
                        </Show>

                        <Show when={!settings.loading}>
                            {/* Frequency */}
                            <div class="mb-6">
                                <label class="text-sm text-slate-400 mb-2 block">Export Frequency</label>
                                <div class="grid grid-cols-4 gap-2">
                                    {(['never', 'daily', 'weekly', 'monthly'] as const).map(freq => (
                                        <button
                                            onClick={() => setScheduleForm('frequency', freq)}
                                            class={`py-2.5 rounded-xl font-medium text-sm transition-all capitalize ${scheduleForm.frequency === freq
                                                ? 'bg-purple-600 text-white shadow-lg'
                                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                                }`}
                                        >
                                            {freq}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Show when={scheduleForm.frequency !== 'never'}>
                                {/* Schedule Time */}
                                <div class="mb-6">
                                    <label class="text-sm text-slate-400 mb-2 block">Export Time</label>
                                    <input
                                        type="time"
                                        step="900"
                                        value={scheduleForm.scheduleTime ?? '03:00'}
                                        onInput={(e) => setScheduleForm('scheduleTime', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                    <p class="text-xs text-slate-500 mt-1">Exports run at 15-minute intervals (:00, :15, :30, :45)</p>
                                </div>

                                {/* Telegram Delivery */}
                                <div class="mb-6 bg-gradient-to-r from-blue-950/30 to-purple-950/30 border border-blue-800/30 rounded-xl p-4">
                                    <label class="flex items-center justify-between cursor-pointer group">
                                        <div class="flex items-center gap-3">
                                            <div class="p-2 bg-blue-600/20 rounded-lg group-hover:bg-blue-600/30 transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <div class="text-sm font-medium text-white">Send to Telegram</div>
                                                <div class="text-xs text-slate-400 mt-0.5">Automatically deliver exports to admins' Telegram</div>
                                            </div>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={scheduleForm.sendToTelegram ?? false}
                                            onChange={(e) => setScheduleForm('sendToTelegram', e.currentTarget.checked)}
                                            class="w-5 h-5 rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                                        />
                                    </label>
                                    <Show when={scheduleForm.sendToTelegram}>
                                        <div class="mt-3 pt-3 border-t border-blue-800/30">
                                            <p class="text-xs text-blue-300/80 flex items-start gap-2">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <span>Files will be sent to all tenant admins who have connected their Telegram account. This provides off-server backup for disaster recovery.</span>
                                            </p>
                                        </div>
                                    </Show>
                                </div>

                                {/* Format */}
                                <div class="mb-6">
                                    <label class="text-sm text-slate-400 mb-2 block">Export Format</label>
                                    <div class="flex gap-2">
                                        <button
                                            onClick={() => setScheduleForm('format', 'json')}
                                            class={`flex-1 py-2.5 rounded-xl font-medium transition-all ${scheduleForm.format === 'json'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                                }`}
                                        >
                                            JSON
                                        </button>
                                        <button
                                            onClick={() => setScheduleForm('format', 'csv')}
                                            class={`flex-1 py-2.5 rounded-xl font-medium transition-all ${scheduleForm.format === 'csv'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                                }`}
                                        >
                                            CSV
                                        </button>
                                        <button
                                            onClick={() => setScheduleForm('format', 'xlsx')}
                                            class={`flex-1 py-2.5 rounded-xl font-medium transition-all ${scheduleForm.format === 'xlsx'
                                                ? 'bg-emerald-600 text-white'
                                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                                }`}
                                        >
                                            Excel
                                        </button>
                                    </div>
                                </div>

                                {/* Data Types */}
                                <div class="mb-6">
                                    <label class="text-sm text-slate-400 mb-3 block">Include in Scheduled Exports</label>
                                    <div class="grid grid-cols-1 gap-2">
                                        <DataTypeToggle
                                            icon={Package}
                                            label="Products"
                                            checked={scheduleForm.includeProducts ?? true}
                                            onChange={(v) => setScheduleForm('includeProducts', v)}
                                        />
                                        <DataTypeToggle
                                            icon={Users}
                                            label="Customers"
                                            checked={scheduleForm.includeCustomers ?? true}
                                            onChange={(v) => setScheduleForm('includeCustomers', v)}
                                        />
                                        <DataTypeToggle
                                            icon={ShoppingCart}
                                            label="Orders"
                                            checked={scheduleForm.includeOrders ?? true}
                                            onChange={(v) => setScheduleForm('includeOrders', v)}
                                        />
                                        <DataTypeToggle
                                            icon={CreditCard}
                                            label="Payments"
                                            checked={scheduleForm.includePayments ?? true}
                                            onChange={(v) => setScheduleForm('includePayments', v)}
                                        />
                                        <DataTypeToggle
                                            icon={Warehouse}
                                            label="Inventory"
                                            checked={scheduleForm.includeInventory ?? true}
                                            onChange={(v) => setScheduleForm('includeInventory', v)}
                                        />
                                    </div>
                                </div>

                                {/* Retention */}
                                <div class="mb-6">
                                    <label class="text-sm text-slate-400 mb-2 block">Keep exports for (days)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="365"
                                        value={scheduleForm.retentionDays ?? 30}
                                        onInput={(e) => setScheduleForm('retentionDays', parseInt(e.currentTarget.value) || 30)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                </div>

                                {/* Next Export Info */}
                                <Show when={settings()?.nextExportAt}>
                                    <div class="mb-6 p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
                                        <div class="flex items-center gap-3 text-purple-300">
                                            <Clock class="w-5 h-5" />
                                            <div>
                                                <div class="text-sm font-medium">Next scheduled export</div>
                                                <div class="text-xs text-purple-400/70">
                                                    {formatDate(settings()?.nextExportAt ?? null)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Show>
                            </Show>

                            <button
                                onClick={handleSaveSettings}
                                disabled={savingSettings()}
                                class="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-500 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                <Show when={savingSettings()} fallback={<Settings class="w-5 h-5" />}>
                                    <Loader2 class="w-5 h-5 animate-spin" />
                                </Show>
                                {savingSettings() ? 'Saving...' : 'Save Schedule'}
                            </button>
                        </Show>
                    </div>
                </div>
            </Show >

            {/* Toast Message */}
            < Show when={message()} >
                <div class={`fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-3 z-50 animate-in fade-in slide-in-from-bottom-5 ${message()?.type === 'error'
                    ? 'bg-red-900/90 border-red-500/50 text-white'
                    : 'bg-emerald-900/90 border-emerald-500/50 text-white'
                    }`}>
                    <div class={`w-2 h-2 rounded-full ${message()?.type === 'error' ? 'bg-red-400' : 'bg-emerald-400'}`} />
                    {message()?.text}
                    <button
                        onClick={() => setMessage(null)}
                        class="ml-2 text-white/60 hover:text-white"
                    >
                        <X class="w-4 h-4" />
                    </button>
                </div>
            </Show >
        </div >
    );
};

export default DataExport;
