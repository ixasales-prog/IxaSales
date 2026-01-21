import type { Component } from 'solid-js';
import { Router, Route } from '@solidjs/router';
import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import MobileSalesLayout from './components/layout/MobileSalesLayout';
import MobileDriverLayout from './components/layout/MobileDriverLayout';
import AdminLayout from './components/layout/AdminLayout';
import SuperAdminLayout from './components/layout/SuperAdminLayout';
import { ToastContainer } from './components/Toast';
import OfflineIndicator from './components/OfflineIndicator';

// Sales Pages
import SalesDashboard from './pages/sales/Dashboard';
import Catalog from './pages/sales/Catalog';
import Cart from './pages/sales/Cart';
import SalesVisits from './pages/sales/Visits';
import SalesCustomers from './pages/sales/Customers';
import SalesOrders from './pages/sales/Orders';
import Menu from './pages/sales/Menu';

// Driver Pages
import Trips from './pages/driver/Trips';
import TripDetail from './pages/driver/TripDetail';
import Deliveries from './pages/driver/Deliveries';

// Admin Pages
import AdminDashboard from './pages/admin/Dashboard';
import AdminProducts from './pages/admin/Products';
import AdminCustomers from './pages/admin/Customers';
import AdminOrders from './pages/admin/Orders';
import AdminCategories from './pages/admin/Categories';
import AdminBrands from './pages/admin/Brands';
import AdminDiscounts from './pages/admin/Discounts';
import AdminProcurement from './pages/admin/Procurement';
import AdminUsers from './pages/admin/Users';
import AdminDeliveries from './pages/admin/Deliveries';
import AdminNotificationSettings from './pages/admin/NotificationSettings';
import AdminSettings from './pages/admin/Settings';
import AdminTelegram from './pages/admin/Telegram';
import AdminCompanyProfile from './pages/admin/CompanyProfile';
import AdminBusinessSettings from './pages/admin/BusinessSettings';
import AdminPaymentSettings from './pages/admin/PaymentSettings';
import AdminSubscription from './pages/admin/Subscription';
import AdminCustomerTiers from './pages/admin/CustomerTiers';
import AdminReturns from './pages/admin/Returns';
import AdminInventory from './pages/admin/Inventory';
import AdminVehicles from './pages/admin/Vehicles';
import SuperAdminDashboard from './pages/super/Dashboard';
import SuperAdminTenants from './pages/super/Tenants';
import SuperAdminSettings from './pages/super/Settings';
import SuperAdminPlanLimits from './pages/super/PlanLimits';
import DefaultSettings from './pages/super/DefaultSettings';
import SecuritySettings from './pages/super/SecuritySettings';
import AnnouncementSettings from './pages/super/AnnouncementSettings';
import EmailSettings from './pages/super/EmailSettings';
import TelegramSettings from './pages/super/TelegramSettings';
import BrandingSettings from './pages/super/BrandingSettings';
import BackupSettings from './pages/super/BackupSettings';
import SuperAdminAuditLogs from './pages/super/AuditLogs';
import SystemHealth from './pages/super/SystemHealth';
import MasterCatalog from './pages/super/MasterCatalog';



// Payment Portal (public)
import PaymentPortal from './pages/PaymentPortal';

// Customer Self-Service Portal (mobile-optimized, OTP auth)
import CustomerPortalPage from './pages/customer/CustomerPortalPage';
import CustomerOrderDetail from './pages/CustomerOrderDetail';

const SalesLayoutWrapper: Component = (props: any) => (
  <MobileSalesLayout>{props.children}</MobileSalesLayout>
);

const DriverLayoutWrapper: Component = (props: any) => (
  <MobileDriverLayout>{props.children}</MobileDriverLayout>
);

const AdminLayoutWrapper: Component = (props: any) => (
  <AdminLayout>{props.children}</AdminLayout>
);

const SuperAdminLayoutWrapper: Component = (props: any) => (
  <SuperAdminLayout>{props.children}</SuperAdminLayout>
);



const App: Component = () => {
  return (
    <>
      <Router>
        <Route path="/login" component={Login} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />

        {/* Payment Portal (public - no auth required) */}
        <Route path="/pay/:token" component={PaymentPortal} />

        {/* Customer Self-Service Portal (mobile-optimized, OTP auth) */}
        <Route path="/customer" component={CustomerPortalPage} />
        <Route path="/customer/orders/:id" component={CustomerOrderDetail} />
        <Route path="/customer/*" component={CustomerPortalPage} />

        {/* Sales App Routes */}
        <Route path="/sales" component={SalesLayoutWrapper}>
          <Route path="/" component={SalesDashboard} />
          <Route path="/catalog" component={Catalog} />
          <Route path="/cart" component={Cart} />
          <Route path="/visits" component={SalesVisits} />
          <Route path="/orders" component={SalesOrders} />
          <Route path="/customers" component={SalesCustomers} />
          <Route path="/menu" component={Menu} />
        </Route>

        {/* Driver App Routes */}
        <Route path="/driver" component={DriverLayoutWrapper}>
          <Route path="/" component={Trips} />
          <Route path="/trips/:id" component={TripDetail} />
          <Route path="/deliveries" component={Deliveries} />
        </Route>

        {/* Super Admin Routes */}
        <Route path="/super" component={SuperAdminLayoutWrapper}>
          <Route path="/" component={SuperAdminDashboard} />
          <Route path="/tenants" component={SuperAdminTenants} />
          <Route path="/settings" component={SuperAdminSettings} />
          <Route path="/plan-limits" component={SuperAdminPlanLimits} />
          <Route path="/settings/defaults" component={DefaultSettings} />
          <Route path="/settings/security" component={SecuritySettings} />
          <Route path="/settings/announcement" component={AnnouncementSettings} />
          <Route path="/settings/email" component={EmailSettings} />
          <Route path="/settings/telegram" component={TelegramSettings} />
          <Route path="/settings/branding" component={BrandingSettings} />
          <Route path="/settings/backup" component={BackupSettings} />
          <Route path="/health" component={SystemHealth} />
          <Route path="/master-catalog" component={MasterCatalog} />
          <Route path="/audit-logs" component={SuperAdminAuditLogs} />
          <Route path="/users" component={AdminUsers} />
        </Route>

        {/* Admin Portal Routes */}
        <Route path="/admin" component={AdminLayoutWrapper}>
          <Route path="/" component={AdminDashboard} />
          <Route path="/orders" component={AdminOrders} />
          <Route path="/products" component={AdminProducts} />
          <Route path="/categories" component={AdminCategories} />
          <Route path="/brands" component={AdminBrands} />
          <Route path="/discounts" component={AdminDiscounts} />
          <Route path="/procurement" component={AdminProcurement} />
          <Route path="/customers" component={AdminCustomers} />
          <Route path="/users" component={AdminUsers} />
          <Route path="/deliveries" component={AdminDeliveries} />
          <Route path="/vehicles" component={AdminVehicles} />
          <Route path="/returns" component={AdminReturns} />
          <Route path="/inventory" component={AdminInventory} />
          <Route path="/customer-tiers" component={AdminCustomerTiers} />
          <Route path="/settings" component={AdminSettings} />
          <Route path="/telegram" component={AdminTelegram} />
          <Route path="/notification-settings" component={AdminNotificationSettings} />
          <Route path="/company-profile" component={AdminCompanyProfile} />
          <Route path="/business-settings" component={AdminBusinessSettings} />
          <Route path="/payment-settings" component={AdminPaymentSettings} />
          <Route path="/subscription" component={AdminSubscription} />
        </Route>



        <Route path="/" component={Login} />
      </Router>
      <ToastContainer />
      <OfflineIndicator />
    </>
  );
};

export default App;
