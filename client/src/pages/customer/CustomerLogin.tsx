/**
 * Customer Login Component
 * 
 * Handles phone-based OTP authentication for customer portal.
 */

import { type Component, createSignal, Show, onMount, createResource, For, createEffect } from 'solid-js';
import { A } from '@solidjs/router';
import { Phone, ArrowRight, Loader2, User, AlertCircle, CheckCircle, UserPlus, LogIn, Search, Store } from 'lucide-solid';
import { customerApi, tokenStorage, phoneStorage, getSubdomain } from '../../services/customer-api';
import type { Product, TenantBranding } from '../../types/customer-portal';
import { useI18n } from '../../i18n';
import LanguageSelector from '../../components/LanguageSelector';

interface CustomerLoginProps {
    onLogin: (token: string) => void;
}

interface PublicSubcategory {
    id: string;
    name: string;
}

const CustomerLogin: Component<CustomerLoginProps> = (props) => {
    const { t } = useI18n();
    const [mode, setMode] = createSignal<'login' | 'register'>('login');
    const [step, setStep] = createSignal<'phone' | 'otp'>('phone');
    const [phone, setPhone] = createSignal(phoneStorage.get());
    const [otp, setOtp] = createSignal('');
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal('');
    const [successMessage, setSuccessMessage] = createSignal('');
    const [maskedName, setMaskedName] = createSignal('');
    const [branding, setBranding] = createSignal<TenantBranding | null>(null);
    const [registerName, setRegisterName] = createSignal('');
    const [registerPhone, setRegisterPhone] = createSignal(phoneStorage.get());
    const [registerTelegram, setRegisterTelegram] = createSignal('');
    const [registerNotes, setRegisterNotes] = createSignal('');
    const [catalogSearch, setCatalogSearch] = createSignal('');
    const [debouncedCatalogSearch, setDebouncedCatalogSearch] = createSignal('');
    const [catalogCategoryId, setCatalogCategoryId] = createSignal('');
    const [selectedPublicProductId, setSelectedPublicProductId] = createSignal<string | null>(null);

    const [publicProductDetail] = createResource(
        () => selectedPublicProductId(),
        async (productId) => {
            if (!productId) return null;
            const result = await customerApi.products.getPublicDetail(productId);
            return result.success && result.data ? result.data : null;
        }
    );

    const [publicCategories] = createResource(async () => {
        const result = await customerApi.products.getPublicCategories();
        return result.success && result.data ? (result.data.subcategories || []) : ([] as PublicSubcategory[]);
    });

    const [publicProducts] = createResource(
        () => ({
            search: debouncedCatalogSearch(),
            categoryId: catalogCategoryId(),
        }),
        async (params) => {
            const result = await customerApi.products.listPublic(1, params.search, params.categoryId);
            return result.success && result.data ? result.data : ([] as Product[]);
        }
    );

    const telegramBotUsername = () => {
        const raw = branding()?.telegramBotUsername?.trim();
        if (!raw) return '';
        return raw.startsWith('@') ? raw.slice(1) : raw;
    };

    const hasConfiguredTelegramBot = () => {
        const current = branding();
        return Boolean(current?.hasTelegramBot || current?.telegramEnabled);
    };

    const openTelegramRegistration = () => {
        const bot = telegramBotUsername();
        if (!bot) {
            if (hasConfiguredTelegramBot()) {
                setError('Telegram bot is configured, but bot username is missing. Ask admin to re-save bot token.');
            } else {
                setError('Telegram bot is not configured yet. Please use the regular form.');
            }
            return;
        }
        const startPayload = `reg_${getSubdomain()}`;
        const url = `https://t.me/${encodeURIComponent(bot)}?start=${encodeURIComponent(startPayload)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    onMount(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('mode') === 'register') {
            setMode('register');
            setStep('phone');
            setError('');
            setSuccessMessage('');
        }

        const result = await customerApi.branding.getBySubdomain(getSubdomain());
        if (result.success && result.data) {
            setBranding(result.data);
        }
    });

    createEffect(() => {
        const query = catalogSearch();
        const timer = setTimeout(() => {
            setDebouncedCatalogSearch(query.trim());
        }, 250);
        return () => clearTimeout(timer);
    });

    const handleRequestOtp = async (e: Event) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');

        const result = await customerApi.auth.requestOtp(phone());
        setLoading(false);

        if (result.success && result.data) {
            setMaskedName(result.data.maskedName || '');
            setStep('otp');
        } else {
            const details = result.error?.details?.length ? ` (${result.error.details[0]})` : '';
            setError((result.error?.message || t('login.errors.customerNotFound') as string) + details);
        }
    };

    const handleVerifyOtp = async (e: Event) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');

        const result = await customerApi.auth.verifyOtp(phone(), otp());
        setLoading(false);

        if (result.success && result.data?.token) {
            tokenStorage.set(result.data.token);
            props.onLogin(result.data.token);
        } else {
            const details = result.error?.details?.length ? ` (${result.error.details[0]})` : '';
            setError((result.error?.message || t('login.errors.invalidOtp') as string) + details);
        }
    };

    const handleRegisterRequest = async (e: Event) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');

        const result = await customerApi.auth.registerRequest({
            name: registerName().trim(),
            phone: registerPhone().trim(),
            telegramUsername: registerTelegram().trim() || undefined,
            registrationSource: 'web',
            consentGiven: true,
            consentAt: new Date().toISOString(),
            notes: registerNotes().trim() || undefined,
        });

        setLoading(false);

        if (result.success && result.data) {
            if (result.data.status === 'already_registered') {
                setMode('login');
                setPhone(registerPhone());
                setStep('phone');
                setSuccessMessage(result.data.message || t('login.alreadyRegistered'));
            } else {
                setSuccessMessage(result.data.message || t('login.registerSubmitted'));
                setRegisterName('');
                setRegisterTelegram('');
                setRegisterNotes('');
            }
            return;
        }

        const details = result.error?.details?.length ? ` (${result.error.details[0]})` : '';
        setError((result.error?.message || t('login.registerFailed')) + details);
    };

    return (
        <div class="portal-login">
            <div class="login-card">
                <div class="login-header">
                    <Show when={branding()?.logo} fallback={
                        <div class="login-icon"><User size={32} /></div>
                    }>
                        <img src={branding()?.logo} alt={branding()?.name} class="login-logo" />
                    </Show>
                    <h1>{branding()?.name || t('login.title')}</h1>
                    <p>{t('login.subtitle')}</p>
                </div>

                <div class="flex items-center gap-2 mb-4">
                    <button
                        type="button"
                        class={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${mode() === 'login'
                            ? 'bg-blue-600 border-blue-500 text-white force-white-text'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'}`}
                        onClick={() => {
                            setMode('login');
                            setError('');
                            setSuccessMessage('');
                        }}
                    >
                        <LogIn size={16} />
                        {t('login.loginTab')}
                    </button>
                    <button
                        type="button"
                        class={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors ${mode() === 'register'
                            ? 'bg-blue-600 border-blue-500 text-white force-white-text'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'}`}
                        onClick={() => {
                            setMode('register');
                            setError('');
                            setSuccessMessage('');
                        }}
                    >
                        <UserPlus size={16} />
                        {t('login.registerTab')}
                    </button>
                </div>

                <Show when={mode() === 'login' && step() === 'phone'}>
                    <form onSubmit={handleRequestOtp}>
                        <div class="input-group">
                            <label for="customer-login-phone">{t('login.phoneLabel')}</label>
                            <div class="input-with-icon">
                                <Phone size={20} />
                                <input
                                    id="customer-login-phone"
                                    type="tel"
                                    placeholder={t('login.phonePlaceholder') as string}
                                    value={phone()}
                                    onInput={(e) => setPhone(e.currentTarget.value)}
                                    required
                                />
                            </div>
                        </div>

                        <Show when={error()}>
                            <div class="error-message">
                                <AlertCircle size={16} />
                                {error()}
                            </div>
                        </Show>
                        <Show when={successMessage()}>
                            <div class="otp-info">
                                <CheckCircle size={16} />
                                <span>{successMessage()}</span>
                            </div>
                        </Show>

                        <button type="submit" class="btn-primary" disabled={loading()}>
                            <Show when={loading()} fallback={
                                <>{t('login.submit')} <ArrowRight size={18} /></>
                            }>
                                <Loader2 size={18} class="spin" /> {t('login.sending')}
                            </Show>
                        </button>
                    </form>
                </Show>

                <Show when={mode() === 'login' && step() === 'otp'}>
                    <form onSubmit={handleVerifyOtp}>
                        <div class="otp-info">
                            <CheckCircle size={20} />
                            <span>{t('login.otpSent', { phone: maskedName() })}</span>
                        </div>

                        <div class="input-group">
                            <label for="customer-login-otp">{t('login.otpLabel')}</label>
                            <input
                                id="customer-login-otp"
                                type="text"
                                placeholder={t('login.otpPlaceholder') as string}
                                value={otp()}
                                onInput={(e) => setOtp(e.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
                                maxLength={6}
                                class="otp-input"
                                required
                            />
                        </div>

                        <Show when={error()}>
                            <div class="error-message">
                                <AlertCircle size={16} />
                                {error()}
                            </div>
                        </Show>

                        <button type="submit" class="btn-primary" disabled={loading()}>
                            <Show when={loading()} fallback={
                                <>{t('login.verify')} <ArrowRight size={18} /></>
                            }>
                                <Loader2 size={18} class="spin" /> {t('login.checking')}
                            </Show>
                        </button>

                        <button type="button" class="btn-secondary" onClick={() => setStep('phone')}>
                            {t('login.back')}
                        </button>
                    </form>
                </Show>

                <Show when={mode() === 'register'}>
                    <form onSubmit={handleRegisterRequest}>
                        <div class="input-group">
                            <button type="button" class="btn-secondary" style="width:100%;" onClick={openTelegramRegistration}>
                                Telegram orqali ro'yxatdan o'tish
                            </button>
                            <Show when={telegramBotUsername()}>
                                <div class="text-xs text-slate-400 mt-2">
                                    Bot: @{telegramBotUsername()}
                                </div>
                            </Show>
                        </div>

                        <div class="input-group">
                            <label for="customer-register-name">{t('login.fullName')}</label>
                            <div class="input-with-icon">
                                <User size={20} />
                                <input
                                    id="customer-register-name"
                                    type="text"
                                    placeholder={t('login.fullNamePlaceholder') as string}
                                    value={registerName()}
                                    onInput={(e) => setRegisterName(e.currentTarget.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div class="input-group">
                            <label for="customer-register-phone">{t('login.phoneLabel')}</label>
                            <div class="input-with-icon">
                                <Phone size={20} />
                                <input
                                    id="customer-register-phone"
                                    type="tel"
                                    placeholder={t('login.phonePlaceholder') as string}
                                    value={registerPhone()}
                                    onInput={(e) => setRegisterPhone(e.currentTarget.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div class="input-group">
                            <label for="customer-register-telegram">{t('login.telegramOptional')}</label>
                            <div class="input-with-icon">
                                <User size={20} />
                                <input
                                    id="customer-register-telegram"
                                    type="text"
                                    placeholder={t('login.telegramPlaceholder') as string}
                                    value={registerTelegram()}
                                    onInput={(e) => setRegisterTelegram(e.currentTarget.value)}
                                />
                            </div>
                        </div>

                        <div class="input-group">
                            <label for="customer-register-notes">{t('login.notesOptional')}</label>
                            <textarea
                                id="customer-register-notes"
                                placeholder={t('login.notesPlaceholder') as string}
                                value={registerNotes()}
                                onInput={(e) => setRegisterNotes(e.currentTarget.value)}
                                class="w-full min-h-[88px] px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                        </div>

                        <Show when={error()}>
                            <div class="error-message">
                                <AlertCircle size={16} />
                                {error()}
                            </div>
                        </Show>
                        <Show when={successMessage()}>
                            <div class="otp-info">
                                <CheckCircle size={16} />
                                <span>{successMessage()}</span>
                            </div>
                        </Show>

                        <button type="submit" class="btn-primary" disabled={loading()}>
                            <Show when={loading()} fallback={<>{t('login.submitRequest')} <ArrowRight size={18} /></>}>
                                <Loader2 size={18} class="spin" /> {t('login.submitting')}
                            </Show>
                        </button>
                    </form>
                </Show>

                <div class="login-footer">
                    <LanguageSelector />
                </div>

                <div class="public-catalog">
                    <div class="public-catalog-header">
                        <Store size={16} />
                        <span>{t('publicCatalog.title')}</span>
                    </div>

                    <div class="public-catalog-filters">
                        <div class="public-catalog-search">
                            <Search size={14} />
                            <input
                                type="text"
                                placeholder={t('publicCatalog.searchProducts') as string}
                                value={catalogSearch()}
                                onInput={(e) => setCatalogSearch(e.currentTarget.value)}
                            />
                        </div>
                        <select
                            id="public-catalog-category"
                            value={catalogCategoryId()}
                            onInput={(e) => setCatalogCategoryId(e.currentTarget.value)}
                            aria-label="Filter products by category"
                            title="Filter products by category"
                        >
                            <option value="">{t('publicCatalog.allCategories')}</option>
                            <For each={publicCategories()}>
                                {(cat: PublicSubcategory) => (
                                    <option value={cat.id}>{cat.name}</option>
                                )}
                            </For>
                        </select>
                    </div>

                    <Show when={publicProducts.loading}>
                        <div class="public-catalog-loading">
                            <Loader2 size={16} class="spin" />
                            <span>{t('publicCatalog.loadingProducts')}</span>
                        </div>
                    </Show>

                    <Show when={!publicProducts.loading && (publicProducts() || []).length === 0}>
                        <div class="public-catalog-empty">{t('publicCatalog.noProducts')}</div>
                    </Show>

                    <Show when={!publicProducts.loading && (publicProducts() || []).length > 0}>
                        <div class="public-catalog-list">
                            <For each={(publicProducts() || []).slice(0, 8)}>
                                {(product: Product) => (
                                    <button
                                        type="button"
                                        class="public-catalog-item"
                                        onClick={() => setSelectedPublicProductId(product.id)}
                                    >
                                        <div class="public-catalog-item-content">
                                            <Show when={product.imageUrl} fallback={
                                                <div class="public-catalog-thumb-placeholder">{t('publicCatalog.noImage')}</div>
                                            }>
                                                <img
                                                    src={product.imageUrl || ''}
                                                    alt={product.name}
                                                    class="public-catalog-thumb"
                                                    onError={(e) => {
                                                        const target = e.currentTarget as HTMLImageElement & { dataset: { fallbackApplied?: string } };
                                                        if (target.dataset.fallbackApplied === '1') return;
                                                        target.dataset.fallbackApplied = '1';
                                                        target.src = '/icons/customer.svg';
                                                    }}
                                                />
                                            </Show>
                                            <div class="public-catalog-text">
                                                <div class="public-catalog-name">{product.name}</div>
                                                <div class="public-catalog-meta">
                                                    <span class="public-catalog-price">
                                                        {Number(product.sellingPrice || 0).toLocaleString()} {branding()?.currency || 'UZS'}
                                                    </span>
                                                    <span class={`public-catalog-stock ${product.inStock ? 'in' : 'out'}`}>
                                                        {product.inStock ? t('publicCatalog.inStock') : t('publicCatalog.outOfStock')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                )}
                            </For>
                        </div>
                    </Show>

                    <A href={`/customer/catalog?tenant=${encodeURIComponent(getSubdomain())}`} class="public-catalog-view-all">
                        {t('publicCatalog.viewAllProducts')}
                    </A>
                </div>
            </div>

            <Show when={selectedPublicProductId()}>
                <div class="public-product-overlay" onClick={(e) => e.target === e.currentTarget && setSelectedPublicProductId(null)}>
                    <div class="public-product-modal">
                        <Show when={publicProductDetail.loading}>
                            <div class="public-product-loading">
                                <Loader2 size={22} class="spin" />
                                <span>{t('publicCatalog.loadingProduct')}</span>
                            </div>
                        </Show>

                        <Show when={!publicProductDetail.loading && publicProductDetail()}>
                            <button
                                type="button"
                                class="public-product-close"
                                onClick={() => setSelectedPublicProductId(null)}
                            >
                                {t('login.back')}
                            </button>

                            <Show when={publicProductDetail()!.imageUrl}>
                                <img
                                    src={publicProductDetail()!.imageUrl || ''}
                                    alt={publicProductDetail()!.name}
                                    class="public-product-image"
                                    onError={(e) => {
                                        const target = e.currentTarget as HTMLImageElement & { dataset: { fallbackApplied?: string } };
                                        if (target.dataset.fallbackApplied === '1') return;
                                        target.dataset.fallbackApplied = '1';
                                        target.src = '/icons/customer.svg';
                                    }}
                                />
                            </Show>

                            <h3 class="public-product-title">{publicProductDetail()!.name}</h3>
                            <p class="public-product-sku">{t('publicCatalog.sku')}: {publicProductDetail()!.sku || '-'}</p>
                            <Show when={publicProductDetail()!.description}>
                                <p class="public-product-description">{publicProductDetail()!.description}</p>
                            </Show>
                            <div class="public-product-footer">
                                <div class="public-product-price">
                                    {Number(publicProductDetail()!.sellingPrice || 0).toLocaleString()} {branding()?.currency || 'UZS'}
                                </div>
                                <div class={`public-product-stock ${publicProductDetail()!.inStock ? 'in' : 'out'}`}>
                                    {publicProductDetail()!.inStock
                                        ? `${t('publicCatalog.inStock')} (${publicProductDetail()!.stockQty || 0})`
                                        : t('publicCatalog.outOfStock')}
                                </div>
                            </div>
                        </Show>

                        <Show when={!publicProductDetail.loading && !publicProductDetail()}>
                            <div class="public-product-error">
                                {t('publicCatalog.productUnavailable')}
                            </div>
                        </Show>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default CustomerLogin;

