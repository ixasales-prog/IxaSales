import { type Component, createResource, createSignal, Show, For, createEffect, createMemo } from 'solid-js';
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
    
    // Auto-expand on search
    createEffect(() => {
        const query = search().toLowerCase();
        if (query) {
            const flat = allFlatTerritories();
            const matches = new Set(
                flat.filter((t: Territory & { depth: number }) => 
                    t.name.toLowerCase().includes(query))
                .map((t: Territory & { depth: number }) => t.id)
            );
            
            // Build parent map
            const parentMap: Record<string, string> = {};
            flat.forEach((t: Territory & { depth: number }) => {
                if (t.parentId) {
                    parentMap[t.id] = t.parentId;
                }
            });
            
            // Expand all ancestors of matching territories
            const toExpand = new Set<string>();
            matches.forEach(matchId => {
                let currentId: string | null = parentMap[matchId] || null;
                while (currentId) {
                    toExpand.add(currentId);
                    currentId = parentMap[currentId] || null;
                }
            });
            
            // Apply expansion
            toExpand.forEach(id => {
                setExpandedMap(id, true);
            });
        }
    });
    const [showModal, setShowModal] = createSignal(false);
    const [editingTerritory, setEditingTerritory] = createSignal<Territory | null>(null);
    const [defaultParentId, setDefaultParentId] = createSignal<string | null>(null);
    const [expandedMap, setExpandedMap] = createStore<Record<string, boolean>>({});

    // Collapse all territories
    const collapseAll = () => {
        const newExpandedMap: Record<string, boolean> = {};
        flatTerritories().forEach((territory: Territory & { depth: number }) => {
            newExpandedMap[territory.id] = false;
        });
        setExpandedMap(newExpandedMap);
    };

    // Expand all territories
    const expandAll = () => {
        const newExpandedMap: Record<string, boolean> = {};
        flatTerritories().forEach((territory: Territory & { depth: number }) => {
            newExpandedMap[territory.id] = true;
        });
        setExpandedMap(newExpandedMap);
    };

    // Initialize expandedMap when territories load - preserve existing state and expand top-level by default
    createEffect(() => {
        const territories = territoryTree();
        if (territories && territories.length > 0) {
            setExpandedMap(prev => {
                const next = { ...prev };
                flatTerritories().forEach((t: Territory & { depth: number }) => {
                    if (!(t.id in next)) {
                        next[t.id] = t.depth === 0; // Expand top-level by default
                    }
                });
                return next;
            });
        }
    });

    const canManage = () => ['tenant_admin', 'super_admin'].includes(currentUser()?.role);

    const [territoryTree, { refetch }] = createResource(async () => {
        try {
            const response = await api.get<Territory[]>('/customers/territories/tree');
            return response || [];
        } catch (err: any) {
            console.error('Failed to load territories:', err);
            toast.error(err?.message || 'Failed to load territories');
            return [];
        }
    });

    // Memoize flattened territories for performance
    const flatTerritories = createMemo(() => 
        flattenTerritories(territoryTree() || [])
    );

    const allFlatTerritories = () => {
        // Sort flat list in descending order by name
        return flatTerritories().sort((a: Territory & { depth: number }, b: Territory & { depth: number }) => b.name.localeCompare(a.name));
    };

    const filteredTerritories = () => {
        const query = search().toLowerCase();
        const territories = territoryTree() || [];
        
        // Sort territories in descending order by name
        const sortTerritories = (nodes: Territory[]): Territory[] => {
            return [...nodes]
                .sort((a, b) => b.name.localeCompare(a.name)) // Descending order
                .map((node) => ({
                    ...node,
                    children: node.children ? sortTerritories(node.children) : undefined
                }));
        };

        if (!query) return sortTerritories(territories);

        const matches = new Set(
            allFlatTerritories()
                .filter((territory: Territory & { depth: number }) => territory.name.toLowerCase().includes(query))
                .map((territory: Territory & { depth: number }) => territory.id)
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

        return sortTerritories(filterTree(territories));
    };

    const toggleExpand = (id: string) => {
        setExpandedMap(id, (value) => !value);
    };

    // Helper function for search auto-expand
    const hasMatchingDescendant = (territory: Territory, matchIds: Set<string>): boolean => {
        if (matchIds.has(territory.id)) return true;
        if (!territory.children) return false;
        return territory.children.some(child => hasMatchingDescendant(child, matchIds));
    };

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
        const expanded = () => expandedMap[territory.id] ?? false; // Reactive getter

        return (
            <>
                <div class="flex items-center gap-1.5 py-1.5 pr-2 border-t border-slate-800/60 hover:bg-slate-800/40 transition-colors group">
                    <div class="flex items-center gap-1.5" style={{ 'padding-left': `${depth * 16 + 8}px` }}>
                        <button
                            class={`w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors ${!hasChildren ? 'invisible' : ''}`}
                            onClick={() => toggleExpand(territory.id)}
                        >
                            <Show when={hasChildren}>
                                <Show when={expanded()} fallback={<ChevronRight class="w-3.5 h-3.5" />}>
                                    <ChevronDown class="w-3.5 h-3.5" />
                                </Show>
                            </Show>
                        </button>
                        <div class="w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center text-blue-400">
                            <MapPin class="w-3 h-3" />
                        </div>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="font-medium text-slate-200 truncate">{territory.name}</span>
                            <span class={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap ${territory.isActive
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                }`}>
                                {territory.isActive ? 'Active' : 'Disabled'}
                            </span>
                        </div>
                        <div class="text-xs text-slate-500">Level {territory.level || depth + 1}</div>
                    </div>

                    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => handleToggleActive(territory)}
                            disabled={!canManage()}
                            class={`p-1.5 rounded transition-colors ${territory.isActive ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-400 hover:bg-slate-800'} ${!canManage() ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={territory.isActive ? 'Disable territory' : 'Enable territory'}
                        >
                            <Show when={territory.isActive} fallback={<ToggleLeft class="w-3.5 h-3.5" />}>
                                <ToggleRight class="w-3.5 h-3.5" />
                            </Show>
                        </button>
                        <button
                            onClick={() => handleEdit(territory)}
                            disabled={!canManage()}
                            class={`p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors ${!canManage() ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Edit territory"
                        >
                            <Edit class="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => handleAddChild(territory)}
                            disabled={!canManage()}
                            class={`px-2 py-1 text-xs bg-slate-800 text-slate-300 rounded hover:bg-slate-700 hover:text-white transition-colors ${!canManage() ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            + Sub
                        </button>
                    </div>
                </div>

                <Show when={hasChildren && expanded()}>
                    <For each={territory.children}>{(child) => renderTerritory(child, depth + 1)}</For>
                </Show>
            </>
        );
    };

    return (
        <div class="p-4 pt-6 sm:p-8 sm:pt-8 space-y-8">
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

            <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
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
                <div class="flex gap-2">
                    <button
                        onClick={() => {
                            const allExpanded = flatTerritories().every(t => expandedMap[t.id] ?? false);
                            if (allExpanded) {
                                collapseAll();
                            } else {
                                expandAll();
                            }
                        }}
                        class="px-3 py-3 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors flex items-center gap-2"
                        title="Toggle expand/collapse all"
                    >
                        <Show when={flatTerritories().every(t => expandedMap[t.id] ?? false)} fallback={<ChevronDown class="w-4 h-4" />}>
                            <ChevronRight class="w-4 h-4" />
                        </Show>
                        <span class="hidden sm:inline text-sm">
                            <Show when={flatTerritories().every(t => expandedMap[t.id] ?? false)} fallback="Expand All">
                                Collapse All
                            </Show>
                        </span>
                    </button>
                    <button
                        onClick={() => refetch()}
                        class="p-3 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors"
                        title="Refresh list"
                    >
                        <RefreshCw class="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <Show when={!territoryTree.loading} fallback={
                    <div class="p-8 flex flex-col items-center justify-center text-slate-500">
                        <Loader2 class="w-6 h-6 animate-spin mb-3 text-blue-500" />
                        <p class="text-sm">Loading territories...</p>
                    </div>
                }>
                    <Show when={territoryTree.error} fallback={
                        <Show when={(filteredTerritories() || []).length > 0} fallback={
                            <div class="p-8 flex flex-col items-center justify-center text-slate-500">
                                <FolderTree class="w-12 h-12 mb-3 opacity-20" />
                                <p class="text-base font-medium text-slate-400">No territories found</p>
                                <p class="text-sm">Create a new territory to get started.</p>
                            </div>
                        }>
                            <div class="divide-y divide-slate-800/60">
                                <For each={filteredTerritories()}>{(territory) => renderTerritory(territory, 0)}</For>
                            </div>
                        </Show>
                    }>
                        <div class="p-8 flex flex-col items-center justify-center text-slate-500">
                            <FolderTree class="w-12 h-12 mb-3 opacity-20 text-red-400" />
                            <p class="text-base font-medium text-red-400">Failed to load territories</p>
                            <p class="text-sm">{(territoryTree.error as any)?.message || 'An error occurred while loading territories.'}</p>
                            <button
                                onClick={() => refetch()}
                                class="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors flex items-center gap-1.5 text-sm"
                            >
                                <RefreshCw class="w-3.5 h-3.5" />
                                Retry
                            </button>
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

