import { type Component, For, Show, createSignal, createResource, createMemo, createEffect } from 'solid-js';
import { createStore } from 'solid-js/store';
import { currentUser, login } from '../../stores/auth';
import {
    Search,
    UserPlus,
    Edit,
    Trash2,
    Shield,
    ShieldCheck,
    User,
    Truck,
    Package,
    Loader2,
    ChevronLeft,
    ChevronRight,
    CheckCircle,
    XCircle,
    LogIn,
    LayoutGrid,
    Table as TableIcon,
    List
} from 'lucide-solid';
import { api } from '../../lib/api';
import { formatDate } from '../../stores/settings';

interface UserData {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    isActive: boolean;
    createdAt: string;
    lastLoginAt: string | null;
    supervisorId?: string | null;
    tenantId?: string | null;
    gpsTrackingEnabled?: boolean;
    lastLocationUpdateAt?: string | null;
}

const Users: Component = () => {
    const [search, setSearch] = createSignal('');
    const [roleFilter, setRoleFilter] = createSignal('');
    const [page, setPage] = createSignal(1);
    const limit = 20;

    // Add User Modal State
    const [showCreateModal, setShowCreateModal] = createSignal(false);
    const [submitting, setSubmitting] = createSignal(false);
    const [editingId, setEditingId] = createSignal<string | null>(null);
    const [error, setError] = createSignal<string | null>(null);
    const storedView = localStorage.getItem('users_view_mode') as 'grid' | 'table' | 'list' | null;
    const [viewMode, setViewMode] = createSignal<'grid' | 'table' | 'list'>(storedView || 'table');

    createEffect(() => {
        localStorage.setItem('users_view_mode', viewMode());
    });

    const [formData, setFormData] = createStore({
        name: '',
        email: '',
        password: '',
        role: 'sales_rep',
        phone: '',
        tenantId: '', // For super admins
        supervisorId: '' // For sales reps (future)
    });

    const [users, { refetch }] = createResource(
        () => ({ search: search(), role: roleFilter(), page: page() }),
        async (params) => {
            const queryParams: Record<string, string> = {
                page: params.page.toString(),
                limit: limit.toString(),
            };
            if (params.search) queryParams.search = params.search;
            if (params.role) queryParams.role = params.role;

            const result = await api<{ data: UserData[]; total: number }>('/users', { params: queryParams });
            return result;
        }
    );

    // Fetch tenants for super admin dropdown
    const [tenants] = createResource(async () => {
        if (currentUser()?.role !== 'super_admin') return [];
        const result = await api<any[]>('/super/tenants?limit=100');
        return result || [];
    });

    // Fetch supervisors for dropdown
    const [supervisors] = createResource(async () => {
        const result = await api<{ data: { id: string; name: string; email: string; phone: string | null }[] }>('/users/supervisors');
        return result?.data || [];
    });

    const userList = createMemo(() => (users() as any)?.data || users() || []);
    const total = createMemo(() => (users() as any)?.total || userList().length);
    const totalPages = createMemo(() => Math.ceil(total() / limit));

    const roleOptions = [
        { value: '', label: 'All Roles' },
        { value: 'super_admin', label: 'Super Admin' },
        { value: 'tenant_admin', label: 'Tenant Admin' },
        { value: 'supervisor', label: 'Supervisor' },
        { value: 'sales_rep', label: 'Sales Rep' },
        { value: 'warehouse', label: 'Warehouse' },
        { value: 'driver', label: 'Driver' },
    ];

    // Roles available for creation
    const creationRoles = createMemo(() => {
        const roles = [
            { value: 'tenant_admin', label: 'Tenant Admin' },
            { value: 'supervisor', label: 'Supervisor' },
            { value: 'sales_rep', label: 'Sales Rep' },
            { value: 'warehouse', label: 'Warehouse' },
            { value: 'driver', label: 'Driver' },
        ];

        // Super Admin can create other Super Admins
        if (currentUser()?.role === 'super_admin') {
            roles.unshift({ value: 'super_admin', label: 'Super Admin' });
        }
        return roles;
    });

    const getRoleConfig = (role: string) => {
        const configs: Record<string, { bg: string; text: string; icon: any }> = {
            super_admin: { bg: 'bg-red-500/10', text: 'text-red-400', icon: ShieldCheck },
            tenant_admin: { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: Shield },
            supervisor: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: Shield },
            sales_rep: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: User },
            warehouse: { bg: 'bg-orange-500/10', text: 'text-orange-400', icon: Package },
            driver: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', icon: Truck },
        };
        return configs[role] || configs.sales_rep;
    };

    // Using shared formatDate from settings store (returns '-' for null values)

    const handleEdit = (user: UserData) => {
        setEditingId(user.id);
        // const roleConfig = getRoleConfig(user.role); // Just to verify role exists

        // We need specific implementation for populating formData
        // UserData has name, email, role, phone, isActive
        // Password is NOT returned.

        setFormData({
            name: user.name,
            email: user.email,
            password: '', // Leave empty to keep existing
            role: user.role,
            phone: user.phone || '',
            supervisorId: user.supervisorId || '',
            tenantId: user.tenantId || ''
        });
        setShowCreateModal(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            await api(`/users/${id}`, { method: 'DELETE' });
            refetch();
        } catch (err: any) {
            alert(err.message || 'Failed to delete user');
        }
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            await api(editingId() ? `/users/${editingId()}` : '/users', {
                method: editingId() ? 'PATCH' : 'POST',
                body: JSON.stringify({
                    ...formData,
                    password: formData.password || undefined // Only send if changed
                })
            });

            setShowCreateModal(false);
            setEditingId(null);
            setFormData({
                name: '',
                email: '',
                password: '',
                role: 'sales_rep',
                phone: '',
                tenantId: '',
                supervisorId: ''
            });
            refetch();
        } catch (err: any) {
            setError(err.message || 'Failed to create user.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleImpersonate = async (userId: string, e: Event) => {
        e.stopPropagation();
        if (!confirm('Login as this user? You will be logged out of your current session.')) return;

        try {
            const result = await api<{ token: string; user: any }>('/auth/impersonate', {
                method: 'POST',
                body: JSON.stringify({ userId })
            });

            login(result.token, result.user);

            // Redirect based on the impersonated user's role
            const role = result.user.role;
            if (['sales_rep', 'supervisor'].includes(role)) {
                window.location.href = '/sales';
            } else if (role === 'driver') {
                window.location.href = '/driver';
            } else if (role === 'super_admin') {
                window.location.href = '/super';
            } else {
                window.location.href = '/admin';
            }
        } catch (err: any) {
            console.error(err);
            alert(err.message || 'Impersonation failed');
        }
    };

    return (
        <div class="p-6 lg:p-8">
            {/* Header */}
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <div>
                    <h1 class="text-2xl lg:text-3xl font-bold text-white">Users</h1>
                    <p class="text-slate-400">Manage system users and access</p>
                </div>
                <button
                    onClick={() => {
                        setEditingId(null);
                        setFormData({
                            name: '',
                            email: '',
                            password: '',
                            role: 'sales_rep',
                            phone: '',
                            tenantId: '',
                            supervisorId: ''
                        });
                        setShowCreateModal(true);
                    }}
                    class="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-500 active:scale-[0.98] transition-all"
                >
                    <UserPlus class="w-5 h-5" />
                    Add User
                </button>
            </div>

            {/* Filters */}
            <div class="flex flex-col sm:flex-row gap-4 mb-6">
                <div class="relative flex-1">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={search()}
                        onInput={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
                        class="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    />
                </div>
                <select
                    value={roleFilter()}
                    onChange={(e) => { setRoleFilter(e.currentTarget.value); setPage(1); }}
                    class="px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                    <For each={roleOptions}>
                        {(option) => <option value={option.value}>{option.label}</option>}
                    </For>
                </select>

                {/* View Toggle */}
                <div class="flex items-center gap-4">
                    <div class="flex bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1 shrink-0">
                        <button
                            onClick={() => setViewMode('grid')}
                            class={`p-2 rounded-lg transition-colors ${viewMode() === 'grid' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                            title="Grid View"
                        >
                            <LayoutGrid class="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('table')}
                            class={`p-2 rounded-lg transition-colors ${viewMode() === 'table' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                            title="Table View"
                        >
                            <TableIcon class="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            class={`p-2 rounded-lg transition-colors ${viewMode() === 'list' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
                            title="List View"
                        >
                            <List class="w-5 h-5" />
                        </button>
                    </div>

                    {/* Pagination */}
                    <div class="flex gap-2">
                        <button
                            disabled={page() === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            class="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-800 transition-colors"
                        >
                            <ChevronLeft class="w-5 h-5" />
                        </button>
                        <button
                            disabled={page() >= totalPages()}
                            onClick={() => setPage(p => p + 1)}
                            class="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-50 hover:bg-slate-800 transition-colors"
                        >
                            <ChevronRight class="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Loading */}
            <Show when={users.loading}>
                <div class="flex items-center justify-center py-20">
                    <Loader2 class="w-10 h-10 text-blue-400 animate-spin" />
                </div>
            </Show>

            {/* Content Views */}
            <Show when={!users.loading && userList().length > 0}>
                <div class="space-y-4">
                    {/* TABLE VIEW */}
                    <Show when={viewMode() === 'table'}>
                        <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl overflow-hidden">
                            <div class="overflow-x-auto">
                                <table class="w-full">
                                    <thead>
                                        <tr class="border-b border-slate-800/50">
                                            <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">User</th>
                                            <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Role</th>
                                            <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Supervisor</th>
                                            <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Status</th>
                                            <th class="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Last Login</th>
                                            <th class="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-800/50">
                                        <For each={userList()}>
                                            {(user) => {
                                                const roleConfig = getRoleConfig(user.role);
                                                const RoleIcon = roleConfig.icon;
                                                const assignedSupervisor = supervisors()?.find(s => s.id === user.supervisorId);
                                                return (
                                                    <tr class="hover:bg-slate-800/30 transition-colors">
                                                        <td class="px-6 py-4">
                                                            <div class="flex items-center gap-3">
                                                                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
                                                                    {user.name.charAt(0).toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <div class="text-white font-medium">{user.name}</div>
                                                                    <div class="text-slate-400 text-sm">{user.email}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td class="px-6 py-4">
                                                            <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleConfig.bg} ${roleConfig.text}`}>
                                                                <RoleIcon class="w-3.5 h-3.5" />
                                                                {user.role.replace('_', ' ')}
                                                            </span>
                                                        </td>
                                                        <td class="px-6 py-4">
                                                            <Show when={user.role === 'sales_rep' && assignedSupervisor} fallback={
                                                                <span class="text-slate-500 text-sm">-</span>
                                                            }>
                                                                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400">
                                                                    <Shield class="w-3 h-3" />
                                                                    {assignedSupervisor?.name}
                                                                </span>
                                                            </Show>
                                                        </td>
                                                        <td class="px-6 py-4">
                                                            <Show when={user.isActive} fallback={
                                                                <span class="inline-flex items-center gap-1.5 text-red-400 text-sm">
                                                                    <XCircle class="w-4 h-4" /> Inactive
                                                                </span>
                                                            }>
                                                                <span class="inline-flex items-center gap-1.5 text-emerald-400 text-sm">
                                                                    <CheckCircle class="w-4 h-4" /> Active
                                                                </span>
                                                            </Show>
                                                        </td>
                                                        <td class="px-6 py-4 text-slate-400 text-sm">
                                                            {formatDate(user.lastLoginAt)}
                                                        </td>
                                                        <td class="px-6 py-4">
                                                            <div class="flex items-center justify-end gap-2">
                                                                <button
                                                                    onClick={() => handleEdit(user)}
                                                                    class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                                                >
                                                                    <Edit class="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDelete(user.id)}
                                                                    class="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                                >
                                                                    <Trash2 class="w-4 h-4" />
                                                                </button>
                                                                <Show when={currentUser()?.role === 'super_admin' && user.id !== currentUser()?.id}>
                                                                    <button
                                                                        onClick={(e) => handleImpersonate(user.id, e)}
                                                                        title="Login as this user"
                                                                        class="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                                                                    >
                                                                        <LogIn class="w-4 h-4" />
                                                                    </button>
                                                                </Show>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            }}
                                        </For>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </Show>

                    {/* GRID VIEW */}
                    <Show when={viewMode() === 'grid'}>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            <For each={userList()}>
                                {(user) => {
                                    const roleConfig = getRoleConfig(user.role);
                                    const RoleIcon = roleConfig.icon;
                                    const assignedSupervisor = supervisors()?.find(s => s.id === user.supervisorId);
                                    return (
                                        <div class="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 hover:border-slate-700/50 transition-all group">
                                            <div class="flex items-start justify-between mb-4">
                                                <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                                    {user.name.charAt(0).toUpperCase()}
                                                </div>
                                                <Show when={user.isActive} fallback={
                                                    <span class="p-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                                                        <XCircle class="w-4 h-4" />
                                                    </span>
                                                }>
                                                    <span class="p-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                        <CheckCircle class="w-4 h-4" />
                                                    </span>
                                                </Show>
                                            </div>

                                            <h3 class="text-lg font-bold text-white mb-1">{user.name}</h3>
                                            <div class="text-slate-400 text-sm mb-4">{user.email}</div>

                                            <div class="flex items-center gap-2 mb-2">
                                                <span class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleConfig.bg} ${roleConfig.text}`}>
                                                    <RoleIcon class="w-3.5 h-3.5" />
                                                    {user.role.replace('_', ' ')}
                                                </span>
                                            </div>

                                            <Show when={user.role === 'sales_rep' && assignedSupervisor}>
                                                <div class="flex items-center gap-2 mb-4">
                                                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400">
                                                        <Shield class="w-3 h-3" />
                                                        {assignedSupervisor?.name}
                                                    </span>
                                                </div>
                                            </Show>

                                            <div class="flex items-center gap-2 pt-4 border-t border-slate-800/50">
                                                <button
                                                    onClick={() => handleEdit(user)}
                                                    class="flex-1 py-2 text-sm text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <Edit class="w-3.5 h-3.5" /> Edit
                                                </button>
                                                <Show when={currentUser()?.role === 'super_admin' && user.id !== currentUser()?.id}>
                                                    <button
                                                        onClick={(e) => handleImpersonate(user.id, e)}
                                                        class="p-2 text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors"
                                                        title="Login as User"
                                                    >
                                                        <LogIn class="w-4 h-4" />
                                                    </button>
                                                </Show>
                                            </div>
                                        </div>
                                    );
                                }}
                            </For>
                        </div>
                    </Show>

                    {/* LIST VIEW */}
                    <Show when={viewMode() === 'list'}>
                        <div class="space-y-1">
                            <For each={userList()}>
                                {(user) => {
                                    const roleConfig = getRoleConfig(user.role);
                                    const assignedSupervisor = supervisors()?.find(s => s.id === user.supervisorId);
                                    return (
                                        <div class="group flex items-center justify-between p-2 pl-4 bg-slate-900/40 border border-slate-800/40 rounded-lg hover:border-slate-700 hover:bg-slate-800/60 transition-all">
                                            <div class="flex items-center gap-4 flex-1 min-w-0">
                                                <div class="w-2 h-2 rounded-full shrink-0" classList={{ 'bg-emerald-500': user.isActive, 'bg-red-500': !user.isActive }} />
                                                <div class="flex items-center gap-3 w-64">
                                                    <div class="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                                                        {user.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span class="font-medium text-white truncate">{user.name}</span>
                                                </div>
                                                <div class="text-sm text-slate-500 truncate w-48">{user.email}</div>
                                                <div class={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${roleConfig.bg} ${roleConfig.text}`}>
                                                    {user.role.replace('_', ' ')}
                                                </div>
                                                <Show when={user.role === 'sales_rep' && assignedSupervisor}>
                                                    <div class="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-blue-500/10 text-blue-400">
                                                        <Shield class="w-3 h-3" />
                                                        {assignedSupervisor?.name}
                                                    </div>
                                                </Show>
                                            </div>

                                            <div class="flex items-center gap-2 pl-4 border-l border-slate-800/50">
                                                <button
                                                    onClick={() => handleEdit(user)}
                                                    class="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit class="w-4 h-4" />
                                                </button>
                                                <Show when={currentUser()?.role === 'super_admin' && user.id !== currentUser()?.id}>
                                                    <button
                                                        onClick={(e) => handleImpersonate(user.id, e)}
                                                        class="p-1 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
                                                        title="Login as User"
                                                    >
                                                        <LogIn class="w-4 h-4" />
                                                    </button>
                                                </Show>
                                            </div>
                                        </div>
                                    );
                                }}
                            </For>
                        </div>
                    </Show>

                    {/* Pagination */}
                    <div class="flex items-center justify-between px-6 py-4 border-t border-slate-800/50 bg-slate-900/40 rounded-b-2xl">
                        <span class="text-slate-400 text-sm">
                            Showing {(page() - 1) * limit + 1} to {Math.min(page() * limit, total())} of {total()} users
                        </span>
                        <div class="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page() === 1}
                                class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft class="w-5 h-5" />
                            </button>
                            <span class="text-white text-sm px-3">
                                Page {page()} of {totalPages()}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages(), p + 1))}
                                disabled={page() >= totalPages()}
                                class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ChevronRight class="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </Show>

            {/* Empty State */}
            <Show when={!users.loading && userList().length === 0}>
                <div class="text-center py-20">
                    <User class="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h3 class="text-xl font-semibold text-white mb-2">No users found</h3>
                    <p class="text-slate-400">Add users to manage your team</p>
                </div>
            </Show>

            {/* Create User Modal */}
            <Show when={showCreateModal()}>
                <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div class="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                        <div class="p-6 border-b border-slate-800 flex justify-between items-center">
                            <h2 class="text-xl font-bold text-white">{editingId() ? 'Edit User' : 'Add New User'}</h2>
                            <button onClick={() => setShowCreateModal(false)} class="text-slate-400 hover:text-white transition-colors">
                                <XCircle class="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} class="p-6 space-y-4">
                            <Show when={error()}>
                                <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                                    {error()}
                                </div>
                            </Show>

                            <div class="space-y-1.5">
                                <label class="text-sm font-medium text-slate-300">Full Name</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onInput={(e) => setFormData('name', e.currentTarget.value)}
                                    class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="John Doe"
                                />
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Email Address</label>
                                    <input
                                        type="email"
                                        required
                                        value={formData.email}
                                        onInput={(e) => setFormData('email', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="john@example.com"
                                    />
                                </div>
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Phone</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onInput={(e) => setFormData('phone', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="+1 234 567 890"
                                    />
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Role</label>
                                    <select
                                        value={formData.role}
                                        onInput={(e) => {
                                            const newRole = e.currentTarget.value;
                                            setFormData('role', newRole);
                                            // Clear supervisor if role is not sales_rep
                                            if (newRole !== 'sales_rep') {
                                                setFormData('supervisorId', '');
                                            }
                                        }}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <For each={creationRoles()}>
                                            {(role) => <option value={role.value}>{role.label}</option>}
                                        </For>
                                    </select>
                                </div>
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Password</label>
                                    <input
                                        type="password"
                                        required={!editingId()}
                                        minlength="8"
                                        value={formData.password}
                                        onInput={(e) => setFormData('password', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder={editingId() ? "Leave empty to keep current" : "Min. 8 characters"}
                                    />
                                </div>
                            </div>

                            {/* Supervisor Selection for Sales Reps */}
                            <Show when={formData.role === 'sales_rep'}>
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Assign to Supervisor</label>
                                    <select
                                        value={formData.supervisorId}
                                        onInput={(e) => setFormData('supervisorId', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="">No Supervisor</option>
                                        <For each={supervisors()}>
                                            {(supervisor) => (
                                                <option value={supervisor.id}>
                                                    {supervisor.name} ({supervisor.email})
                                                </option>
                                            )}
                                        </For>
                                    </select>
                                    <p class="text-xs text-slate-500">
                                        Optional: Assign this sales rep to a supervisor for management and reporting
                                    </p>
                                </div>
                            </Show>

                            {/* Tenant Selection for Super Admin */}
                            {/* Tenant Selection for Super Admin */}
                            <Show when={currentUser()?.role === 'super_admin'}>
                                <div class="space-y-1.5">
                                    <label class="text-sm font-medium text-slate-300">Assign to Tenant (Organization)</label>
                                    <select
                                        required={formData.role !== 'super_admin'}
                                        value={formData.tenantId}
                                        onInput={(e) => setFormData('tenantId', e.currentTarget.value)}
                                        class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="">
                                            {formData.role === 'super_admin' ? 'Global User (No Tenant)' : 'Select a Tenant...'}
                                        </option>
                                        <For each={tenants()}>
                                            {(tenant) => <option value={tenant.id}>{tenant.name} ({tenant.subdomain})</option>}
                                        </For>
                                    </select>
                                    <Show when={formData.role === 'super_admin'}>
                                        <p class="text-xs text-slate-500">
                                            Optional for Super Admins. Leave empty for Global access.
                                        </p>
                                    </Show>
                                </div>
                            </Show>

                            <div class="pt-4 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    class="px-5 py-2.5 text-slate-300 font-medium hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting()}
                                    class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Show when={submitting()} fallback={editingId() ? 'Update User' : 'Create User'}>
                                        <Loader2 class="w-4 h-4 animate-spin" />
                                        {editingId() ? 'Updating...' : 'Creating...'}
                                    </Show>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default Users;
