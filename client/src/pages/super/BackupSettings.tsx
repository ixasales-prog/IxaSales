import { type Component, createSignal, createResource, Show, createEffect, For } from 'solid-js';
import { createStore } from 'solid-js/store';
import { A } from '@solidjs/router';
import { Save, Loader2, ArrowLeft, Database, Clock, Calendar, Download, RefreshCw, FileText, RotateCcw } from 'lucide-solid';
import { api } from '../../lib/api';
import { formatDate as formatDateBase } from '../../stores/settings';

interface BackupSettings {
    frequency: 'daily' | 'weekly' | 'monthly' | 'never';
    scheduleTime: string;
    timezone: string;
    retentionDays: number;
    lastBackupAt: string | null;
}

interface BackupFile {
    filename: string;
    size: number;
    createdAt: string;
}

interface TenantOption {
    id: string;
    name: string;
    subdomain?: string;
}

const BackupSettingsPage: Component = () => {
    const [submitting, setSubmitting] = createSignal(false);
    const [creatingBackup, setCreatingBackup] = createSignal(false);
    const [restoringFilename, setRestoringFilename] = createSignal<string | null>(null);
    const [restoreModalOpen, setRestoreModalOpen] = createSignal(false);
    const [restoreTargetTenantId, setRestoreTargetTenantId] = createSignal('');
    const [confirmFullRestore, setConfirmFullRestore] = createSignal(false);
    const [restoreTenantFile, setRestoreTenantFile] = createSignal<File | null>(null);
    const [activeBackupFilename, setActiveBackupFilename] = createSignal<string | null>(null);
    const [message, setMessage] = createSignal<string | null>(null);

    // Fetch settings
    const [settings, { refetch: refetchSettings }] = createResource(async () => {
        return await api<BackupSettings>('/super/settings/backup', { timeoutMs: 15_000 });
    });

    // Fetch backup list
    const [backups, { refetch: refetchBackups }] = createResource(async () => {
        return await api<BackupFile[]>('/super/backups', { timeoutMs: 20_000 });
    });
    const [tenants] = createResource(async () => {
        return await api<TenantOption[]>('/super/tenants?limit=200');
    });

    const [form, setForm] = createStore<BackupSettings>({
        frequency: 'daily',
        scheduleTime: '00:00',
        timezone: 'Asia/Tashkent',
        retentionDays: 30,
        lastBackupAt: null,
    });

    createEffect(() => {
        const d = settings();
        if (d) setForm(d);
    });
    createEffect(() => {
        const list = tenants();
        if (list && list.length > 0 && !restoreTargetTenantId()) setRestoreTargetTenantId('');
    });

    const handleSave = async () => {
        setSubmitting(true);
        setMessage(null);
        try {
            const updated = await api<BackupSettings>('/super/settings/backup', {
                method: 'PUT',
                body: JSON.stringify({
                    frequency: form.frequency,
                    scheduleTime: form.scheduleTime,
                    timezone: form.timezone,
                    retentionDays: form.retentionDays
                })
            });
            setForm(updated);
            setMessage('Settings saved!');
            setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCreateBackup = async () => {
        if (creatingBackup()) return;
        setCreatingBackup(true);
        setMessage(null);
        try {
            const res = await api<{ filename?: string; message?: string }>('/super/backup/now', {
                method: 'POST',
                body: JSON.stringify({}),
                timeoutMs: 30 * 60 * 1000,
            });

            setMessage(`Backup created successfully${res.filename ? `: ${res.filename}` : ''}`);
            refetchBackups();
            refetchSettings();
            setTimeout(() => setMessage(null), 5000);
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        } finally {
            setCreatingBackup(false);
        }
    };

    const openRestoreModal = (filename: string) => {
        setActiveBackupFilename(filename);
        setRestoreTargetTenantId('');
        setConfirmFullRestore(false);
        setRestoreTenantFile(null);
        setRestoreModalOpen(true);
    };

    const handleRestoreSubmit = async () => {
        const filename = activeBackupFilename();
        if (!filename) return;
        const target = restoreTargetTenantId();
        if (!target) {
            setMessage('Error: Please select restore target');
            return;
        }

        setRestoringFilename(filename);
        setMessage(null);
        try {
            if (target === '__ALL__') {
                const res = await api<{ message?: string }>('/super/backup/restore', {
                    method: 'POST',
                    body: JSON.stringify({ filename, confirmInPlaceRestore: true }),
                    timeoutMs: 30 * 60 * 1000,
                });
                setMessage(res.message || `Restore completed successfully for ${filename}`);
            } else {
                const file = restoreTenantFile();
                const data = file ? await file.text() : undefined;
                const res = await api<{
                    message?: string;
                    note?: string;
                    imported?: Record<string, number>;
                    errors?: string[];
                    generatedTenantBackupFilename?: string | null;
                }>('/super/tenant-restore', {
                    method: 'POST',
                    body: JSON.stringify({
                        tenantId: target,
                        data,
                        sourceBackupFilename: data ? undefined : filename,
                    }),
                    timeoutMs: 10 * 60 * 1000,
                });
                const importedSummary = res.imported
                    ? Object.entries(res.imported)
                        .filter(([, v]) => Number(v) > 0)
                        .map(([k, v]) => `${k}:${v}`)
                        .join(', ')
                    : '';
                const warningSummary = res.errors && res.errors.length > 0
                    ? ` Warnings(${res.errors.length}): ${res.errors.slice(0, 2).join(' | ')}`
                    : '';
                const extractedSummary = res.generatedTenantBackupFilename
                    ? ` Extracted:${res.generatedTenantBackupFilename}`
                    : '';
                setMessage(
                    `${res.message || 'Tenant restore completed'}${importedSummary ? ` [${importedSummary}]` : ''}${warningSummary}${extractedSummary}`
                );
            }
            setRestoreModalOpen(false);
            refetchSettings();
            setTimeout(() => setMessage(null), 7000);
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        } finally {
            setRestoringFilename(null);
        }
    };

    // Use shared formatDate utility with null fallback
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Never';
        return formatDateBase(dateStr, { dateStyle: 'medium', timeStyle: 'short' });
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div class="p-6 lg:p-8">
            <A href="/super/settings" class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors">
                <ArrowLeft class="w-4 h-4" /> Back to Settings
            </A>
            <h1 class="text-2xl font-bold text-white mb-2">Backup & Recovery</h1>
            <p class="text-slate-400 mb-8">Manage automated backups and download database snapshots.</p>

            <Show when={settings.loading && !settings()}>
                <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 text-blue-500 animate-spin" /></div>
            </Show>

            <Show when={!settings.loading || !!settings()}>
                <div class="grid lg:grid-cols-2 gap-8">
                    {/* Settings Column */}
                    <div class="space-y-6">
                        <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 space-y-5">
                            <h2 class="text-lg font-semibold text-white mb-4">Schedule Settings</h2>

                            <div>
                                <label class="text-sm text-slate-400 mb-2 block">Backup Frequency</label>
                                <div class="flex gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                                    {(['daily', 'weekly', 'monthly', 'never'] as const).map(f => (
                                        <button
                                            onClick={() => setForm('frequency', f)}
                                            class={`flex-1 py-2 text-sm font-medium rounded-lg transition-all capitalize ${form.frequency === f
                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                                }`}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label class="text-sm text-slate-400">Backup Time (HH:MM)</label>
                                <input
                                    type="time"
                                    value={form.scheduleTime}
                                    onInput={(e) => setForm('scheduleTime', e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none mt-1"
                                />
                            </div>

                            <div>
                                <label class="text-sm text-slate-400">Timezone</label>
                                <input
                                    type="text"
                                    value={form.timezone}
                                    onInput={(e) => setForm('timezone', e.currentTarget.value)}
                                    placeholder="Asia/Tashkent"
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none mt-1"
                                />
                            </div>

                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                    <Calendar class="w-5 h-5 text-purple-400" />
                                </div>
                                <div class="flex-1">
                                    <label class="text-sm text-slate-400">Retention (days)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="365"
                                        value={form.retentionDays}
                                        onInput={(e) => setForm('retentionDays', parseInt(e.currentTarget.value) || 30)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none mt-1"
                                    />
                                </div>
                            </div>

                            <div class="flex items-center gap-3 pt-4 border-t border-slate-800">
                                <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                    <Clock class="w-5 h-5 text-emerald-400" />
                                </div>
                                <div>
                                    <div class="text-sm text-slate-400">Last Backup</div>
                                    <div class="text-white font-medium">{formatDate(form.lastBackupAt)}</div>
                                </div>
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={submitting()}
                                class="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                <Show when={submitting()} fallback={<Save class="w-5 h-5" />}>
                                    <Loader2 class="w-5 h-5 animate-spin" />
                                </Show>
                                Save Settings
                            </button>
                        </div>

                        <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6">
                            <h2 class="text-lg font-semibold text-white mb-4">Manual Backup</h2>
                            <p class="text-sm text-slate-400 mb-4">
                                Trigger an immediate backup of the entire database. This may take a few moments.
                            </p>
                            <button
                                onClick={handleCreateBackup}
                                disabled={creatingBackup()}
                                class="w-full flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-500 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                <Show when={creatingBackup()} fallback={<Database class="w-5 h-5" />}>
                                    <Loader2 class="w-5 h-5 animate-spin" />
                                </Show>
                                {creatingBackup() ? 'Creating Backup...' : 'Create Backup Now'}
                            </button>
                        </div>

                    </div>

                    {/* Backups List Column */}
                    <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 flex flex-col h-full">
                        <div class="flex items-center justify-between mb-4">
                            <h2 class="text-lg font-semibold text-white">Recent Backups</h2>
                            <button onClick={() => refetchBackups()} class="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
                                <RefreshCw class="w-4 h-4" />
                            </button>
                        </div>

                        <div class="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                            <Show when={backups.loading}>
                                <div class="flex justify-center py-10"><Loader2 class="w-8 h-8 text-blue-500 animate-spin" /></div>
                            </Show>

                            <Show when={!backups.loading && backups()?.length === 0}>
                                <div class="text-center py-10 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                                    <Database class="w-10 h-10 mx-auto mb-2 opacity-50" />
                                    No backups found
                                </div>
                            </Show>

                            <For each={backups()}>
                                {(file) => (
                                    <div class="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors group">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                                                <FileText class="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div class="text-sm font-medium text-white">{file.filename}</div>
                                                <div class="text-xs text-slate-500 flex items-center gap-2">
                                                    <span>{formatSize(file.size)}</span>
                                                    <span>-</span>
                                                    <span>{new Date(file.createdAt).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => openRestoreModal(file.filename)}
                                                disabled={!!restoringFilename()}
                                                class="p-2 text-amber-400 hover:text-white hover:bg-amber-600/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="Restore this backup"
                                            >
                                                <Show when={restoringFilename() === file.filename} fallback={<RotateCcw class="w-5 h-5" />}>
                                                    <Loader2 class="w-5 h-5 animate-spin" />
                                                </Show>
                                            </button>
                                            <a
                                                href={`/super/backups/${file.filename}`}
                                                download={file.filename}
                                                class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                                title="Download SQL"
                                            >
                                                <Download class="w-5 h-5" />
                                            </a>
                                        </div>
                                    </div>
                                )}
                            </For>
                        </div>
                    </div>
                </div>
            </Show>

            <Show when={message()}>
                <div class={`fixed bottom-6 right-6 px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-3 z-50 animate-in fade-in slide-in-from-bottom-5 ${message()?.startsWith('Error') ? 'bg-red-900/90 border-red-500/50 text-white' : 'bg-emerald-900/90 border-emerald-500/50 text-white'
                    }`}>
                    {message()?.startsWith('Error') ? <div class="w-2 h-2 rounded-full bg-red-400" /> : <div class="w-2 h-2 rounded-full bg-emerald-400" />}
                    {message()}
                </div>
            </Show>

            <Show when={restoreModalOpen()}>
                <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm pb-safe">
                    <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl">
                        <div class="p-6 space-y-4">
                            <h3 class="text-lg font-semibold text-white">Restore Backup</h3>
                            <p class="text-sm text-slate-400">
                                File: <span class="text-slate-200">{activeBackupFilename()}</span>
                            </p>
                            <div>
                                <label class="text-sm text-slate-400">Target</label>
                                <select
                                    value={restoreTargetTenantId()}
                                    onChange={(e) => setRestoreTargetTenantId(e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none mt-1"
                                >
                                    <option value="">Select target...</option>
                                    <option value="__ALL__">All tenants (full system restore)</option>
                                    <For each={tenants() || []}>
                                        {(tenant) => (
                                            <option value={tenant.id}>
                                                {tenant.name}{tenant.subdomain ? ` (${tenant.subdomain})` : ''}
                                            </option>
                                        )}
                                    </For>
                                </select>
                                <p class="text-xs text-slate-500 mt-2">
                                    Full system restore uses the selected SQL backup file. For tenant restore, upload tenant file (.json/.sql) or leave empty to extract tenant data from selected full backup.
                                </p>
                            </div>
                            <Show when={restoreTargetTenantId() && restoreTargetTenantId() !== '__ALL__'}>
                                <div class="space-y-3">
                                    <p class="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                                        Tenant restore runs in replace mode: current tenant products/customers/orders/payments data will be replaced by backup data.
                                    </p>
                                    <div>
                                        <label class="text-sm text-slate-400">Tenant Backup File (JSON or tenant SQL)</label>
                                        <input
                                            type="file"
                                            accept=".json,.sql,application/json,text/plain"
                                            onChange={(e) => setRestoreTenantFile(e.currentTarget.files?.[0] || null)}
                                            class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white mt-1"
                                        />
                                    </div>
                                </div>
                            </Show>
                            <Show when={restoreTargetTenantId() === '__ALL__'}>
                                <label class="flex items-start gap-3 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                                    <input
                                        type="checkbox"
                                        checked={confirmFullRestore()}
                                        onChange={(e) => setConfirmFullRestore(e.currentTarget.checked)}
                                        class="mt-0.5"
                                    />
                                    <span>
                                        I confirm this is a full in-place restore and will overwrite production data.
                                    </span>
                                </label>
                            </Show>
                            <div class="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setRestoreModalOpen(false)}
                                    disabled={!!restoringFilename()}
                                    class="flex-1 px-4 py-3 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRestoreSubmit}
                                    disabled={!!restoringFilename() || !restoreTargetTenantId() || (restoreTargetTenantId() === '__ALL__' && !confirmFullRestore())}
                                    class="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white font-medium hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <Show when={!!restoringFilename()}>
                                        <Loader2 class="w-5 h-5 animate-spin" />
                                    </Show>
                                    Restore
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default BackupSettingsPage;
