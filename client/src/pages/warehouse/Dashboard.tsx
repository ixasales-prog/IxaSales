import { type Component } from 'solid-js';
import { ClipboardList, Boxes, AlertTriangle, Truck } from 'lucide-solid';

const WarehouseDashboard: Component = () => (
    <div class="min-h-screen bg-slate-950 pb-24">
        <div class="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/50 px-4 py-4">
            <h1 class="text-xl font-bold text-white">Warehouse Overview</h1>
            <p class="text-slate-500 text-sm">Task queue, stock alerts, and receiving</p>
        </div>

        <div class="px-4 pt-4 space-y-4">
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3">
                    <div class="flex items-center gap-2 text-slate-400 text-xs">
                        <ClipboardList class="w-4 h-4 text-amber-400" /> Open Tasks
                    </div>
                    <div class="text-2xl font-semibold text-white mt-2">24</div>
                </div>
                <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-3">
                    <div class="flex items-center gap-2 text-slate-400 text-xs">
                        <Boxes class="w-4 h-4 text-indigo-400" /> Low Stock
                    </div>
                    <div class="text-2xl font-semibold text-white mt-2">8</div>
                </div>
            </div>

            <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                <div class="flex items-center gap-2 mb-3">
                    <AlertTriangle class="w-5 h-5 text-amber-400" />
                    <h2 class="text-white font-semibold">Alerts</h2>
                </div>
                <div class="space-y-2 text-sm text-slate-400">
                    <div class="flex justify-between">
                        <span>Awaiting putaway</span>
                        <span class="text-amber-400 font-semibold">6</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Damaged items</span>
                        <span class="text-amber-400 font-semibold">2</span>
                    </div>
                </div>
            </div>

            <div class="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                <div class="flex items-center gap-2 mb-3">
                    <Truck class="w-5 h-5 text-emerald-400" />
                    <h2 class="text-white font-semibold">Inbound Today</h2>
                </div>
                <div class="text-sm text-slate-400">3 shipments scheduled for receiving.</div>
            </div>
        </div>
    </div>
);

export default WarehouseDashboard;
