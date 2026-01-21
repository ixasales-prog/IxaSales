import { type Component, createSignal, createResource, Show, createEffect, For } from 'solid-js';
import { createStore } from 'solid-js/store';
import { A } from '@solidjs/router';
import { Save, Loader2, ArrowLeft, Database, Clock, Calendar, Download, RefreshCw, FileText } from 'lucide-solid';
import { api } from '../../lib/api';
import { formatDate as formatDateBase } from '../../stores/settings';

interface BackupSettings {
    frequency: 'daily' | 'weekly' | 'monthly' | 'never';
    retentionDays: number;
    lastBackupAt: string | null;
}

interface BackupFile {
    filename: string;
    size: number;
    createdAt: string;
}

const BackupSettingsPage: Component = () => {
    const [submitting, setSubmitting] = createSignal(false);
    const [creatingBackup, setCreatingBackup] = createSignal(false);
    const [message, setMessage] = createSignal<string | null>(null);

    // Fetch settings
    const [settings, { refetch: refetchSettings }] = createResource(async () => {
        return await api<BackupSettings>('/super/settings/backup');
    });

    // Fetch backup list
    const [backups, { refetch: refetchBackups }] = createResource(async () => {
        const res = await api<{ success: boolean; data: BackupFile[] }>('/super/backups');
        return res.data;
    });

    const [form, setForm] = createStore<BackupSettings>({
        frequency: 'daily',
        retentionDays: 30,
        lastBackupAt: null,
    });

    createEffect(() => {
        const d = settings();
        if (d) setForm(d);
    });

    const handleSave = async () => {
        setSubmitting(true);
        setMessage(null);
        try {
            await api('/super/settings/backup', {
                method: 'PUT',
                body: JSON.stringify({ frequency: form.frequency, retentionDays: form.retentionDays })
            });
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
            const res = await api<{ success: boolean; filename?: string; message?: string }>('/super/backup/now', {
                method: 'POST'
            });

            if (res.success) {
                setMessage('✅ Backup created successfully!');
                refetchBackups();
                refetchSettings();
            } else {
                setMessage(`Error: ${res.message}`);
            }
            setTimeout(() => setMessage(null), 5000);
        } catch (err: any) {
            setMessage(`Error: ${err.message}`);
        } finally {
            setCreatingBackup(false);
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

            <Show when={settings.loading}>
                <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 text-blue-500 animate-spin" /></div>
            </Show>

            <Show when={!settings.loading}>
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
                                                    <span>•</span>
                                                    <span>{new Date(file.createdAt).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <a
                                            href={`/super/backups/${file.filename}`}
                                            download={file.filename}
                                            class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                            title="Download SQL"
                                        >
                                            <Download class="w-5 h-5" />
                                        </a>
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
        </div>
    );
};

export default BackupSettingsPage;
