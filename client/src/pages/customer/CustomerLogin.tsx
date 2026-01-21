/**
 * Customer Login Component
 * 
 * Handles phone-based OTP authentication for customer portal.
 */

import { type Component, createSignal, Show, onMount } from 'solid-js';
import { Phone, ArrowRight, Loader2, User, AlertCircle, CheckCircle } from 'lucide-solid';
import { customerApi, tokenStorage, phoneStorage, getSubdomain } from '../../services/customer-api';
import type { TenantBranding } from '../../types/customer-portal';
import { useI18n } from '../../i18n';
import LanguageSelector from '../../components/LanguageSelector';

interface CustomerLoginProps {
    onLogin: (token: string) => void;
}

const CustomerLogin: Component<CustomerLoginProps> = (props) => {
    const { t } = useI18n();
    const [step, setStep] = createSignal<'phone' | 'otp'>('phone');
    const [phone, setPhone] = createSignal(phoneStorage.get());
    const [otp, setOtp] = createSignal('');
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal('');
    const [maskedName, setMaskedName] = createSignal('');
    const [branding, setBranding] = createSignal<TenantBranding | null>(null);

    onMount(async () => {
        const result = await customerApi.branding.getBySubdomain(getSubdomain());
        if (result.success && result.data) {
            setBranding(result.data);
        }
    });

    const handleRequestOtp = async (e: Event) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const result = await customerApi.auth.requestOtp(phone());
        setLoading(false);

        if (result.success && result.data) {
            setMaskedName(result.data.maskedName || '');
            setStep('otp');
        } else {
            setError(result.error?.message || t('login.errors.customerNotFound') as string);
        }
    };

    const handleVerifyOtp = async (e: Event) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const result = await customerApi.auth.verifyOtp(phone(), otp());
        setLoading(false);

        if (result.success && result.data?.token) {
            tokenStorage.set(result.data.token);
            props.onLogin(result.data.token);
        } else {
            setError(result.error?.message || t('login.errors.invalidOtp') as string);
        }
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

                <Show when={step() === 'phone'}>
                    <form onSubmit={handleRequestOtp}>
                        <div class="input-group">
                            <label>{t('login.phoneLabel')}</label>
                            <div class="input-with-icon">
                                <Phone size={20} />
                                <input
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

                        <button type="submit" class="btn-primary" disabled={loading()}>
                            <Show when={loading()} fallback={
                                <>{t('login.submit')} <ArrowRight size={18} /></>
                            }>
                                <Loader2 size={18} class="spin" /> {t('login.sending')}
                            </Show>
                        </button>
                    </form>
                </Show>

                <Show when={step() === 'otp'}>
                    <form onSubmit={handleVerifyOtp}>
                        <div class="otp-info">
                            <CheckCircle size={20} />
                            <span>{t('login.otpSent', { phone: maskedName() })}</span>
                        </div>

                        <div class="input-group">
                            <label>{t('login.otpLabel')}</label>
                            <input
                                type="text"
                                placeholder={t('login.otpPlaceholder') as string}
                                value={otp()}
                                onInput={(e) => setOtp(e.currentTarget.value)}
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

                <div class="login-footer">
                    <LanguageSelector />
                </div>
            </div>
        </div>
    );
};

export default CustomerLogin;

