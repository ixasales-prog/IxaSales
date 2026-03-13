import { type Component, createResource, createSignal, For, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { ArrowLeft, Database, Download, Loader2, RefreshCw, RotateCcw } from 'lucide-solid';
import { api, API_BASE_URL } from '../../lib/api';
import { getStoredAuthToken } from '../../stores/auth';

interface TenantBackupFile {
    filename: string;
    size: number;
    createdAt: string;
    format: 'json' | 'sql';
}

interface RestoreResult {
    imported?: Record<string, number>;
    errors?: string[];
}

const DataExport: Component = () => {
    const [creatingBackup, setCreatingBackup] = createSignal(false);
    const [restoringFilename, setRestoringFilename] = createSignal<string | null>(null);
    const [message, setMessage] = createSignal<{ type: 'success' | 'error'; text: string } | null>(null);

    const [tenantBackups, { refetch: refetchTenantBackups }] = createResource(async () => {
        const res = await api<TenantBackupFile[]>('/tenant/backup-files');
        return res || [];
    });

    const formatSize = (bytes: number) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

    const handleCreateBackup = async () => {
        if (creatingBackup()) return;
        setCreatingBackup(true);
        setMessage(null);
        try {
            const res = await api<{ filename?: string }>('/tenant/backup-file', {
                method: 'POST',
                body: JSON.stringify({ format: 'json' }),
                timeoutMs: 2 * 60 * 1000,
            });
            setMessage({ type: 'success', text: `Backup created${res?.filename ? `: ${res.filename}` : ''}` });
            refetchTenantBackups();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to create backup' });
        } finally {
            setCreatingBackup(false);
        }
    };

    const handleRestoreBackup = async (filename: string) => {
        if (restoringFilename()) return;
        setRestoringFilename(filename);
        setMessage(null);
        try {
            const res = await api<RestoreResult>(`/tenant/backup-files/${encodeURIComponent(filename)}/restore`, {
                method: 'POST',
                body: JSON.stringify({}),
                timeoutMs: 10 * 60 * 1000,
            });

            const importedCount = Object.values(res.imported || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
            if (res.errors && res.errors.length > 0) {
                const firstError = res.errors[0] ? ` (${res.errors[0]})` : '';
                setMessage({ type: 'error', text: `Restore completed with warnings: imported ${importedCount}, errors ${res.errors.length}${firstError}` });
            } else {
                setMessage({ type: 'success', text: `Restore completed successfully: imported ${importedCount}` });
            }
            refetchTenantBackups();
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Failed to restore backup' });
        } finally {
            setRestoringFilename(null);
        }
    };

    const handleDownloadBackup = async (filename: string) => {
        try {
            const token = getStoredAuthToken();
            const response = await fetch(`${API_BASE_URL}/tenant/backup-files/${encodeURIComponent(filename)}/download`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) throw new Error('Download failed');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Download failed' });
        }
    };

    return (
        <div class="p-6 pt-6 lg:p-8 lg:pt-8 max-w-5xl mx-auto">
            <A href="/admin" class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors">
                <ArrowLeft class="w-4 h-4" /> Back to Dashboard
            </A>
            <h1 class="text-2xl font-bold text-white mb-2">Tenant Backup & Restore</h1>
            <p class="text-slate-400 mb-8">Create tenant backups and restore them when needed.</p>

            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 mb-6">
                <div class="flex items-center justify-between gap-3">
                    <button
                        onClick={handleCreateBackup}
                        disabled={creatingBackup()}
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-all disabled:opacity-50"
                    >
                        <Show when={creatingBackup()} fallback={<Database class="w-4 h-4" />}>
                            <Loader2 class="w-4 h-4 animate-spin" />
                        </Show>
                        {creatingBackup() ? 'Creating Backup...' : 'Create Backup Now'}
                    </button>
                    <button
                        onClick={() => refetchTenantBackups()}
                        class="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                        title="Refresh backups"
                    >
                        <RefreshCw class="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                <h2 class="text-lg font-semibold text-white mb-4">Backup Files</h2>

                <Show when={tenantBackups.loading}>
                    <div class="flex justify-center py-10"><Loader2 class="w-8 h-8 text-blue-500 animate-spin" /></div>
                </Show>

                <Show when={!tenantBackups.loading && (tenantBackups()?.length || 0) === 0}>
                    <div class="text-center py-10 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                        No tenant backup files found
                    </div>
                </Show>

                <div class="space-y-3">
                    <For each={tenantBackups() || []}>
                        {(file) => (
                            <div class="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-800 rounded-xl">
                                <div class="min-w-0">
                                    <div class="text-sm font-medium text-white truncate">{file.filename}</div>
                                    <div class="text-xs text-slate-500">{formatSize(file.size)} - {formatDate(file.createdAt)}</div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button
                                        onClick={() => handleRestoreBackup(file.filename)}
                                        disabled={!!restoringFilename() || creatingBackup()}
                                        class="p-2 text-amber-400 hover:text-white hover:bg-amber-600/20 rounded-lg transition-colors disabled:opacity-50"
                                        title="Restore backup"
                                    >
                                        <Show when={restoringFilename() === file.filename} fallback={<RotateCcw class="w-4 h-4" />}>
                                            <Loader2 class="w-4 h-4 animate-spin" />
                                        </Show>
                                    </button>
                                    <button
                                        onClick={() => handleDownloadBackup(file.filename)}
                                        class="p-2 text-blue-400 hover:text-white hover:bg-blue-600/20 rounded-lg transition-colors"
                                        title="Download backup"
                                    >
                                        <Download class="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </For>
                </div>
            </div>

            <Show when={message()}>
                <div class={`fixed bottom-6 right-6 px-5 py-3 rounded-xl border text-white z-50 ${message()?.type === 'error'
                    ? 'bg-red-900/90 border-red-500/50'
                    : 'bg-emerald-900/90 border-emerald-500/50'
                    }`}>
                    {message()?.text}
                </div>
            </Show>
        </div>
    );
};

export default DataExport;
