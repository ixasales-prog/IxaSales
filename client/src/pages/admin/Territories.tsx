import { type Component, createResource, createSignal, Show, For } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Plus, Search, MapPin, Loader2, RefreshCw, ChevronDown, ChevronRight, Edit, ToggleLeft, ToggleRight, FolderTree } from 'lucide-solid';
import { api } from '../../lib/api';
import { toast } from '../../components/Toast';
import { currentUser } from '../../stores/auth';
import AddTerritoryModal from './AddTerritoryModal';

interface Territory {
    id: string;
    name: string;
    parentId: string | null;
    level: number | null;
    isActive: boolean;
    children?: Territory[];
}

const flattenTerritories = (nodes: Territory[], depth = 0): Array<Territory & { depth: number }> => {
    const result: Array<Territory & { depth: number }> = [];
    nodes.forEach((node) => {
        result.push({ ...node, depth });
        if (node.children?.length) {
            result.push(...flattenTerritories(node.children, depth + 1));
        }
    });
    return result;
};

const AdminTerritories: Component = () => {
    const [search, setSearch] = createSignal('');
    const [showModal, setShowModal] = createSignal(false);
    const [editingTerritory, setEditingTerritory] = createSignal<Territory | null>(null);
    const [defaultParentId, setDefaultParentId] = createSignal<string | null>(null);
    const [expandedMap, setExpandedMap] = createStore<Record<string, boolean>>({});

    const canManage = () => ['tenant_admin', 'super_admin'].includes(currentUser()?.role);

    const [territoryTree, { refetch }] = createResource(async () => {
        const response = await api.get<Territory[]>('/customers/territories/tree');
        return response || [];
    });

    const allFlatTerritories = () => flattenTerritories(territoryTree() || []);

    const filteredTerritories = () => {
        const query = search().toLowerCase();
        if (!query) return territoryTree() || [];
        const matches = new Set(
            allFlatTerritories()
                .filter((territory) => territory.name.toLowerCase().includes(query))
                .map((territory) => territory.id)
        );

        const filterTree = (nodes: Territory[]): Territory[] => {
            return nodes
                .map((node) => {
                    const children = node.children ? filterTree(node.children) : [];
                    if (matches.has(node.id) || children.length > 0) {
                        return { ...node, children };
                    }
                    return null;
                })
                .filter(Boolean) as Territory[];
        };

        return filterTree(territoryTree() || []);
    };

    const toggleExpand = (id: string) => {
        setExpandedMap(id, (value) => !value);
    };

    const isExpanded = (id: string) => expandedMap[id] ?? true;

    const handleEdit = (territory: Territory) => {
        setEditingTerritory(territory);
        setDefaultParentId(territory.parentId || null);
        setShowModal(true);
    };

    const handleAddChild = (territory: Territory) => {
        setEditingTerritory(null);
        setDefaultParentId(territory.id);
        setShowModal(true);
    };

    const handleToggleActive = async (territory: Territory) => {
        if (!canManage()) return;
        try {
            await api.patch(`/customers/territories/${territory.id}`, { isActive: !territory.isActive });
            toast.success(`Territory ${territory.isActive ? 'disabled' : 'enabled'} successfully`);
            refetch();
        } catch (error: any) {
            console.error('Failed to update territory:', error);
            toast.error(error.message || 'Failed to update territory');
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingTerritory(null);
        setDefaultParentId(null);
    };

    const renderTerritory = (territory: Territory, depth: number) => {
        const hasChildren = (territory.children?.length || 0) > 0;
        const expanded = isExpanded(territory.id);

        return (
            <>
                <div class="flex items-center gap-3 py-3 pr-4 border-t border-slate-800/60 hover:bg-slate-800/40 transition-colors group">
                    <div class="flex items-center gap-2" style={{ 'padding-left': `${depth * 24 + 16}px` }}>
                        <button
                            class={`w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:text-white hover:bg-slate-800 transition-colors ${!hasChildren ? 'invisible' : ''}`}
                            onClick={() => toggleExpand(territory.id)}
                        >
                            <Show when={hasChildren}>
                                <Show when={expanded} fallback={<ChevronRight class="w-4 h-4" />}>
                                    <ChevronDown class="w-4 h-4" />
                                </Show>
                            </Show>
                        </button>
                        <div class="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                            <MapPin class="w-4.5 h-4.5" />
                        </div>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center gap-3">
                            <span class="font-semibold text-slate-200">{territory.name}</span>
                            <span class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${territory.isActive
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                }`}>
                                {territory.isActive ? 'Active' : 'Disabled'}
                            </span>
                        </div>
                        <div class="text-xs text-slate-500 mt-0.5">Level {territory.level || depth + 1}</div>
                    </div>

                    <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => handleToggleActive(territory)}
                            disabled={!canManage()}
                            class={`p-2 rounded-lg transition-colors ${territory.isActive ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-400 hover:bg-slate-800'} ${!canManage() ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={territory.isActive ? 'Disable territory' : 'Enable territory'}
                        >
                            <Show when={territory.isActive} fallback={<ToggleLeft class="w-4 h-4" />}>
                                <ToggleRight class="w-4 h-4" />
                            </Show>
                        </button>
                        <button
                            onClick={() => handleEdit(territory)}
                            disabled={!canManage()}
                            class={`p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ${!canManage() ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Edit territory"
                        >
                            <Edit class="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => handleAddChild(territory)}
                            disabled={!canManage()}
                            class={`px-3 py-1.5 text-sm bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors ${!canManage() ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            + Sub-territory
                        </button>
                    </div>
                </div>

                <Show when={hasChildren && expanded}>
                    <For each={territory.children}>{(child) => renderTerritory(child, depth + 1)}</For>
                </Show>
            </>
        );
    };

    return (
        <div class="p-4 sm:p-8 space-y-8">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-white tracking-tight">Territories</h1>
                    <p class="text-slate-400 mt-1">Organize territories into a hierarchy for assignment and reporting.</p>
                </div>
                <button
                    onClick={() => { setEditingTerritory(null); setDefaultParentId(null); setShowModal(true); }}
                    disabled={!canManage()}
                    class={`w-full sm:w-auto px-6 py-3 text-white font-semibold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 ${canManage() ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20' : 'bg-slate-700 cursor-not-allowed'}`}
                >
                    <Plus class="w-5 h-5" />
                    Add Territory
                </button>
            </div>

            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4">
                <div class="relative flex-1">
                    <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                        type="text"
                        value={search()}
                        onInput={(e) => setSearch(e.currentTarget.value)}
                        placeholder="Search territories..."
                        class="w-full pl-12 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                    />
                </div>
                <button
                    onClick={() => refetch()}
                    class="p-3 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors"
                    title="Refresh list"
                >
                    <RefreshCw class="w-5 h-5" />
                </button>
            </div>

            <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <Show when={!territoryTree.loading} fallback={
                    <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                        <Loader2 class="w-8 h-8 animate-spin mb-4 text-blue-500" />
                        <p>Loading territories...</p>
                    </div>
                }>
                    <Show when={(filteredTerritories() || []).length > 0} fallback={
                        <div class="p-12 flex flex-col items-center justify-center text-slate-500">
                            <FolderTree class="w-16 h-16 mb-4 opacity-20" />
                            <p class="text-lg font-medium text-slate-400">No territories found</p>
                            <p class="text-sm">Create a new territory to get started.</p>
                        </div>
                    }>
                        <div class="divide-y divide-slate-800">
                            <For each={filteredTerritories()}>{(territory) => renderTerritory(territory, 0)}</For>
                        </div>
                    </Show>
                </Show>
            </div>

            <Show when={showModal()}>
                <AddTerritoryModal
                    territory={editingTerritory()}
                    defaultParentId={defaultParentId()}
                    territories={allFlatTerritories()}
                    onClose={handleCloseModal}
                    onSuccess={() => refetch()}
                    canManage={canManage()}
                />
            </Show>
        </div>
    );
};

export default AdminTerritories;
