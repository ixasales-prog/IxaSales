/**
 * Customer Portal Page
 * 
 * Main entry point for the Customer Portal.
 * Handles authentication state and renders login or dashboard.
 * Wrapped with ThemeProvider for dark/light mode support.
 */

import { type Component, createSignal, Show } from 'solid-js';
import { tokenStorage } from '../../services/customer-api';
import { ToastContainer } from '../../components/Toast';
import { ThemeProvider } from '../../context/ThemeContext';
import CustomerLogin from './CustomerLogin';
import CustomerDashboard from './CustomerDashboard';
import '../../styles/CustomerPortal.css';

const CustomerPortalPage: Component = () => {
    const [token, setToken] = createSignal<string | null>(tokenStorage.get());

    const handleLogin = (newToken: string) => {
        tokenStorage.set(newToken);
        setToken(newToken);
    };

    const handleLogout = () => {
        tokenStorage.clear();
        setToken(null);
    };

    return (
        <ThemeProvider>
            <div class="customer-portal">
                <ToastContainer />
                <Show when={token()} fallback={<CustomerLogin onLogin={handleLogin} />}>
                    <CustomerDashboard token={token()!} onLogout={handleLogout} />
                </Show>
            </div>
        </ThemeProvider>
    );
};

export default CustomerPortalPage;
