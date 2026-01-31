import { createSignal, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { showToast } from '../../components/Toast';
import { api } from '../../lib/api';

interface PaymentSettings {
    paymentPortalEnabled: boolean;
    clickMerchantId: string;
    clickServiceId: string;
    clickSecretKey: string;
    paymeMerchantId: string;
    paymeSecretKey: string;
}

const PaymentSettings: Component = () => {
    const [loading, setLoading] = createSignal(true);
    const [saving, setSaving] = createSignal(false);
    const [settings, setSettings] = createSignal<PaymentSettings>({
        paymentPortalEnabled: false,
        clickMerchantId: '',
        clickServiceId: '',
        clickSecretKey: '',
        paymeMerchantId: '',
        paymeSecretKey: '',
    });

    // For security, we mask the secret keys
    const [showClickSecret, setShowClickSecret] = createSignal(false);
    const [showPaymeSecret, setShowPaymeSecret] = createSignal(false);

    onMount(() => {
        fetchSettings();
    });

    const fetchSettings = async () => {
        try {
            const data = await api<PaymentSettings>('/tenant-self/payment-settings');
            if (data) setSettings(data);
        } catch (error) {
            console.error('Failed to fetch payment settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api('/tenant-self/payment-settings', {
                method: 'PUT',
                body: JSON.stringify(settings()),
            });
            showToast('To\'lov sozlamalari saqlandi', 'success');
        } catch (_error) {
            showToast('Xatolik yuz berdi', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field: keyof PaymentSettings, value: string | boolean) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div class="payment-settings-page">
            <div class="page-header">
                <h1>💳 To'lov Sozlamalari</h1>
                <p class="description">
                    Click va Payme orqali onlayn to'lovlarni qabul qilish uchun sozlamalar
                </p>
            </div>

            <Show when={!loading()} fallback={
                <div class="loading-state">
                    <div class="spinner"></div>
                    <span>Yuklanmoqda...</span>
                </div>
            }>
                <div class="settings-content">
                    {/* Enable/Disable Toggle */}
                    <div class="setting-card main-toggle">
                        <div class="setting-header">
                            <div class="setting-info">
                                <h3>Onlayn To'lov Portali</h3>
                                <p>Mijozlarga to'lov havolalari yuborish imkoniyati</p>
                            </div>
                            <label class="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={settings().paymentPortalEnabled}
                                    onChange={(e) => updateField('paymentPortalEnabled', e.currentTarget.checked)}
                                />
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>

                    <Show when={settings().paymentPortalEnabled}>
                        {/* Click Settings */}
                        <div class="setting-card provider-card click">
                            <div class="provider-header">
                                <div class="provider-logo click-logo">Click</div>
                                <span class="provider-status" classList={{ active: !!settings().clickMerchantId }}>
                                    {settings().clickMerchantId ? '✓ Sozlangan' : 'Sozlanmagan'}
                                </span>
                            </div>

                            <div class="form-grid">
                                <div class="form-group">
                                    <label>Merchant ID</label>
                                    <input
                                        type="text"
                                        placeholder="12345"
                                        value={settings().clickMerchantId}
                                        onInput={(e) => updateField('clickMerchantId', e.currentTarget.value)}
                                    />
                                </div>

                                <div class="form-group">
                                    <label>Service ID</label>
                                    <input
                                        type="text"
                                        placeholder="67890"
                                        value={settings().clickServiceId}
                                        onInput={(e) => updateField('clickServiceId', e.currentTarget.value)}
                                    />
                                </div>

                                <div class="form-group full-width">
                                    <label>Secret Key</label>
                                    <div class="password-input">
                                        <input
                                            type={showClickSecret() ? 'text' : 'password'}
                                            placeholder="••••••••••••••••"
                                            value={settings().clickSecretKey}
                                            onInput={(e) => updateField('clickSecretKey', e.currentTarget.value)}
                                        />
                                        <button
                                            type="button"
                                            class="toggle-visibility"
                                            onClick={() => setShowClickSecret(!showClickSecret())}
                                        >
                                            {showClickSecret() ? '🙈' : '👁️'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div class="provider-help">
                                <a href="https://click.uz/merchant" target="_blank" rel="noopener">
                                    Click merchant panelidan oling →
                                </a>
                            </div>
                        </div>

                        {/* Payme Settings */}
                        <div class="setting-card provider-card payme">
                            <div class="provider-header">
                                <div class="provider-logo payme-logo">Payme</div>
                                <span class="provider-status" classList={{ active: !!settings().paymeMerchantId }}>
                                    {settings().paymeMerchantId ? '✓ Sozlangan' : 'Sozlanmagan'}
                                </span>
                            </div>

                            <div class="form-grid">
                                <div class="form-group full-width">
                                    <label>Merchant ID</label>
                                    <input
                                        type="text"
                                        placeholder="5e730e8e0b852a417aa49ceb"
                                        value={settings().paymeMerchantId}
                                        onInput={(e) => updateField('paymeMerchantId', e.currentTarget.value)}
                                    />
                                </div>

                                <div class="form-group full-width">
                                    <label>Secret Key</label>
                                    <div class="password-input">
                                        <input
                                            type={showPaymeSecret() ? 'text' : 'password'}
                                            placeholder="••••••••••••••••"
                                            value={settings().paymeSecretKey}
                                            onInput={(e) => updateField('paymeSecretKey', e.currentTarget.value)}
                                        />
                                        <button
                                            type="button"
                                            class="toggle-visibility"
                                            onClick={() => setShowPaymeSecret(!showPaymeSecret())}
                                        >
                                            {showPaymeSecret() ? '🙈' : '👁️'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div class="provider-help">
                                <a href="https://merchant.payme.uz" target="_blank" rel="noopener">
                                    Payme merchant panelidan oling →
                                </a>
                            </div>
                        </div>

                        {/* Webhook URLs Info */}
                        <div class="setting-card info-card">
                            <h3>🔗 Webhook URL'lar</h3>
                            <p class="info-description">
                                Quyidagi URL'larni Click/Payme merchant panelida ko'rsating:
                            </p>

                            <div class="webhook-urls">
                                <div class="webhook-item">
                                    <label>Click Webhook:</label>
                                    <code>{window.location.origin}/api/payment-gateway/webhook/click</code>
                                </div>
                                <div class="webhook-item">
                                    <label>Payme Webhook:</label>
                                    <code>{window.location.origin}/api/payment-gateway/webhook/payme</code>
                                </div>
                            </div>
                        </div>
                    </Show>

                    {/* Save Button */}
                    <div class="actions">
                        <button
                            class="btn-save"
                            onClick={handleSave}
                            disabled={saving()}
                        >
                            {saving() ? 'Saqlanmoqda...' : '💾 Saqlash'}
                        </button>
                    </div>
                </div>
            </Show>

            <style>{`
                .payment-settings-page {
                    padding: 24px;
                    max-width: 800px;
                    margin: 0 auto;
                }

                .page-header {
                    margin-bottom: 32px;
                }

                .page-header h1 {
                    font-size: 24px;
                    font-weight: 700;
                    margin-bottom: 8px;
                }

                .page-header .description {
                    color: var(--text-secondary, #888);
                    font-size: 14px;
                }

                .loading-state {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    padding: 60px;
                    color: var(--text-secondary, #888);
                }

                .spinner {
                    width: 24px;
                    height: 24px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: var(--primary, #00d9ff);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .settings-content {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }

                .setting-card {
                    background: var(--card-bg, rgba(255, 255, 255, 0.05));
                    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
                    border-radius: 16px;
                    padding: 24px;
                }

                .setting-card.main-toggle .setting-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .setting-info h3 {
                    font-size: 16px;
                    font-weight: 600;
                    margin-bottom: 4px;
                }

                .setting-info p {
                    font-size: 13px;
                    color: var(--text-secondary, #888);
                }

                /* Toggle Switch */
                .toggle-switch {
                    position: relative;
                    display: inline-block;
                    width: 52px;
                    height: 28px;
                }

                .toggle-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }

                .toggle-slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: rgba(255, 255, 255, 0.1);
                    transition: 0.3s;
                    border-radius: 28px;
                }

                .toggle-slider:before {
                    position: absolute;
                    content: "";
                    height: 22px;
                    width: 22px;
                    left: 3px;
                    bottom: 3px;
                    background-color: white;
                    transition: 0.3s;
                    border-radius: 50%;
                }

                .toggle-switch input:checked + .toggle-slider {
                    background: linear-gradient(135deg, #00d9ff, #00ff88);
                }

                .toggle-switch input:checked + .toggle-slider:before {
                    transform: translateX(24px);
                }

                /* Provider Cards */
                .provider-card {
                    border-left: 4px solid;
                }

                .provider-card.click {
                    border-left-color: #00c2ff;
                }

                .provider-card.payme {
                    border-left-color: #00c896;
                }

                .provider-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }

                .provider-logo {
                    font-size: 18px;
                    font-weight: 700;
                    padding: 8px 16px;
                    border-radius: 8px;
                }

                .click-logo {
                    background: linear-gradient(135deg, #00c2ff, #0099ff);
                    color: white;
                }

                .payme-logo {
                    background: linear-gradient(135deg, #00c896, #00a67e);
                    color: white;
                }

                .provider-status {
                    font-size: 12px;
                    padding: 6px 12px;
                    border-radius: 20px;
                    background: rgba(255, 255, 255, 0.1);
                    color: var(--text-secondary, #888);
                }

                .provider-status.active {
                    background: rgba(0, 255, 136, 0.1);
                    color: #00ff88;
                }

                .form-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .form-group.full-width {
                    grid-column: 1 / -1;
                }

                .form-group label {
                    font-size: 12px;
                    font-weight: 500;
                    color: var(--text-secondary, #888);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .form-group input {
                    padding: 12px 16px;
                    background: rgba(0, 0, 0, 0.2);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    color: white;
                    font-size: 14px;
                    transition: border-color 0.2s;
                }

                .form-group input:focus {
                    outline: none;
                    border-color: var(--primary, #00d9ff);
                }

                .password-input {
                    position: relative;
                }

                .password-input input {
                    width: 100%;
                    padding-right: 48px;
                }

                .toggle-visibility {
                    position: absolute;
                    right: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 18px;
                    opacity: 0.6;
                    transition: opacity 0.2s;
                }

                .toggle-visibility:hover {
                    opacity: 1;
                }

                .provider-help {
                    margin-top: 16px;
                    padding-top: 16px;
                    border-top: 1px solid rgba(255, 255, 255, 0.05);
                }

                .provider-help a {
                    font-size: 13px;
                    color: var(--primary, #00d9ff);
                    text-decoration: none;
                }

                .provider-help a:hover {
                    text-decoration: underline;
                }

                /* Info Card */
                .info-card h3 {
                    font-size: 16px;
                    margin-bottom: 8px;
                }

                .info-description {
                    font-size: 13px;
                    color: var(--text-secondary, #888);
                    margin-bottom: 16px;
                }

                .webhook-urls {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .webhook-item {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .webhook-item label {
                    font-size: 12px;
                    color: var(--text-secondary, #888);
                }

                .webhook-item code {
                    padding: 10px 14px;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 6px;
                    font-size: 12px;
                    font-family: 'JetBrains Mono', monospace;
                    color: #00ff88;
                    word-break: break-all;
                }

                /* Actions */
                .actions {
                    display: flex;
                    justify-content: flex-end;
                    padding-top: 12px;
                }

                .btn-save {
                    padding: 14px 32px;
                    background: linear-gradient(135deg, #00d9ff, #00ff88);
                    border: none;
                    border-radius: 10px;
                    color: #0a0a0a;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }

                .btn-save:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px rgba(0, 217, 255, 0.3);
                }

                .btn-save:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                @media (max-width: 600px) {
                    .form-grid {
                        grid-template-columns: 1fr;
                    }

                    .form-group {
                        grid-column: 1;
                    }
                }
            `}</style>
        </div>
    );
};

export default PaymentSettings;
