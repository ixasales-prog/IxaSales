import { type Component, For, Show } from 'solid-js';
import { Search, Filter, X } from 'lucide-solid';

interface OrderFilterOption {
  value: string;
  label: string;
}

interface OrderFiltersProps {
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  searchPlaceholder?: string;
  statusOptions: OrderFilterOption[];
  currentSearch: string;
  currentStatus: string;
  showStatusFilter?: boolean;
  compact?: boolean;
}

const OrderFilters: Component<OrderFiltersProps> = (props) => {
  const searchPlaceholder = () => props.searchPlaceholder || 'Search orders...';
  const showStatusFilter = () => props.showStatusFilter !== false;
  const compact = () => props.compact || false;

  return (
    <div class={`flex flex-col ${compact() ? 'sm:flex-row gap-2' : 'sm:flex-row gap-4'} mb-6`}>
      {/* Search Input */}
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder={searchPlaceholder()}
          value={props.currentSearch}
          onInput={(e) => props.onSearchChange(e.currentTarget.value)}
          class="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
        <Show when={props.currentSearch}>
          <button
            onClick={() => props.onSearchChange('')}
            class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white"
          >
            <X class="w-4 h-4" />
          </button>
        </Show>
      </div>

      {/* Status Filter */}
      <Show when={showStatusFilter()}>
        <div class="relative">
          <Filter class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <select
            value={props.currentStatus}
            onChange={(e) => props.onStatusChange(e.currentTarget.value)}
            class="pl-10 pr-8 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white appearance-none cursor-pointer focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <For each={props.statusOptions}>
              {(option) => <option value={option.value}>{option.label}</option>}
            </For>
          </select>
        </div>
      </Show>
    </div>
  );
};

export default OrderFilters;