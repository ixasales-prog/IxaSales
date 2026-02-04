import { type Component, createEffect } from 'solid-js';
import { Router, Route, useLocation, useNavigate } from '@solidjs/router';
import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import MobileSalesLayout from './components/layout/MobileSalesLayout';
import MobileDriverLayout from './components/layout/MobileDriverLayout';
import MobileSupervisorLayout from './components/layout/MobileSupervisorLayout';
import MobileWarehouseLayout from './components/layout/MobileWarehouseLayout';
import AdminLayout from './components/layout/AdminLayout';
import SuperAdminLayout from './components/layout/SuperAdminLayout';
import { ToastContainer } from './components/Toast';
import InstallGating from './components/pwa/InstallGating';
import { currentUser } from './stores/auth';

// Sales Pages
import SalesDashboard from './pages/sales/Dashboard';
import Catalog from './pages/sales/Catalog';
import Cart from './pages/sales/Cart';
import SalesVisits from './pages/sales/Visits';
import SalesCustomers from './pages/sales/Customers';
import SalesOrders from './pages/sales/Orders';
import SalesOrderDetail from './pages/sales/OrderDetail';
import SalesCustomerDetail from './pages/sales/CustomerDetail';
import SalesVisitDetail from './pages/sales/VisitDetail';

// Driver Pages
import Trips from './pages/driver/Trips';
import TripDetail from './pages/driver/TripDetail';
import Deliveries from './pages/driver/Deliveries';
import DeliveryDetail from './pages/driver/DeliveryDetail';

// Supervisor Pages
import SupervisorDashboard from './pages/supervisor/Dashboard';
import SupervisorApprovals from './pages/supervisor/Approvals';
import SupervisorTeam from './pages/supervisor/Team';
import SupervisorInsights from './pages/supervisor/Insights';
import SupervisorApprovalDetail from './pages/supervisor/ApprovalDetail';
import SupervisorTeamMemberDetail from './pages/supervisor/TeamMemberDetail';
import SupervisorInsightDetail from './pages/supervisor/InsightDetail';

// Warehouse Pages
import WarehouseDashboard from './pages/warehouse/Dashboard';
import WarehouseTasks from './pages/warehouse/Tasks';
import WarehouseInventory from './pages/warehouse/Inventory';
import WarehouseReceiving from './pages/warehouse/Receiving';
import WarehouseTaskDetail from './pages/warehouse/TaskDetail';
import WarehouseInventoryDetail from './pages/warehouse/InventoryDetail';
import WarehouseReceivingDetail from './pages/warehouse/ReceivingDetail';
import WarehouseBatchPicking from './pages/warehouse/BatchPicking';
import WarehouseCreatePO from './pages/warehouse/CreatePurchaseOrder';

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
import AdminTelegramLink from './pages/admin/TelegramLink';
import AdminCompanyProfile from './pages/admin/CompanyProfile';
import AdminBusinessSettings from './pages/admin/BusinessSettings';
import AdminPaymentSettings from './pages/admin/PaymentSettings';
import AdminSubscription from './pages/admin/Subscription';
import GPSTrackingSettings from './pages/admin/GPSTrackingSettings';
import UserLocationHistory from './pages/admin/UserLocationHistory';
import UserLocationMapPage from './pages/admin/UserLocationMapPage';
import AdminCustomerTiers from './pages/admin/CustomerTiers';
import AdminTerritories from './pages/admin/Territories';
import AdminReturns from './pages/admin/Returns';
import AdminInventory from './pages/admin/Inventory';
import AdminVehicles from './pages/admin/Vehicles';
import AdminReports from './pages/admin/Reports';
import AdminDataExport from './pages/admin/DataExport';
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
  <RoleGuard roles={['sales_rep']}>
    <MobileSalesLayout>{props.children}</MobileSalesLayout>
  </RoleGuard>
);

const DriverLayoutWrapper: Component = (props: any) => (
  <RoleGuard roles={['driver']}>
    <MobileDriverLayout>{props.children}</MobileDriverLayout>
  </RoleGuard>
);

const SupervisorLayoutWrapper: Component = (props: any) => (
  <RoleGuard roles={['supervisor']}>
    <MobileSupervisorLayout>{props.children}</MobileSupervisorLayout>
  </RoleGuard>
);

const WarehouseLayoutWrapper: Component = (props: any) => (
  <RoleGuard roles={['warehouse']}>
    <MobileWarehouseLayout>{props.children}</MobileWarehouseLayout>
  </RoleGuard>
);

const AdminLayoutWrapper: Component = (props: any) => (
  <RoleGuard roles={['tenant_admin']}>
    <AdminLayout>{props.children}</AdminLayout>
  </RoleGuard>
);

const SuperAdminLayoutWrapper: Component = (props: any) => (
  <RoleGuard roles={['super_admin']}>
    <SuperAdminLayout>{props.children}</SuperAdminLayout>
  </RoleGuard>
);

const roleRedirects: Record<string, string> = {
  sales_rep: '/sales',
  supervisor: '/supervisor',
  warehouse: '/warehouse',
  driver: '/driver',
  tenant_admin: '/admin',
  super_admin: '/super'
};

const RoleGuard: Component<{ roles: string[]; children?: any }> = (props) => {
  const navigate = useNavigate();

  createEffect(() => {
    const user = currentUser();
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (!props.roles.includes(user.role)) {
      navigate(roleRedirects[user.role] ?? '/login', { replace: true });
    }
  });

  return <>{props.children}</>;
};

const PwaRoleMetaLayout: Component<{ children?: any }> = (props) => {
  const location = useLocation();

  createEffect(() => {
    const role = currentUser()?.role;
    const pathname = location.pathname;

    let manifestHref = '/manifest.json';
    let iconHref = '/icons/icon.svg';
    let appleIconHref = '/icons/icon-192.svg';

    if (pathname.startsWith('/customer')) {
      manifestHref = '/manifest.customer.json';
      iconHref = '/icons/customer.svg';
      appleIconHref = '/icons/customer.svg';
    } else if (role === 'sales_rep') {
      manifestHref = '/manifest.sales.json';
      iconHref = '/icons/sales.svg';
      appleIconHref = '/icons/sales.svg';
    } else if (role === 'supervisor') {
      manifestHref = '/manifest.supervisor.json';
      iconHref = '/icons/sales.svg';
      appleIconHref = '/icons/sales.svg';
    } else if (role === 'driver') {
      manifestHref = '/manifest.driver.json';
      iconHref = '/icons/driver.svg';
      appleIconHref = '/icons/driver.svg';
    } else if (role === 'warehouse') {
      manifestHref = '/manifest.warehouse.json';
      iconHref = '/icons/warehouse.svg';
      appleIconHref = '/icons/warehouse.svg';
    } else if (role === 'super_admin') {
      manifestHref = '/manifest.superadmin.json';
      iconHref = '/icons/admin.svg';
      appleIconHref = '/icons/admin.svg';
    } else if (role === 'tenant_admin') {
      manifestHref = '/manifest.admin.json';
      iconHref = '/icons/admin.svg';
      appleIconHref = '/icons/admin.svg';
    }

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink && manifestLink.getAttribute('href') !== manifestHref) {
      manifestLink.setAttribute('href', manifestHref);
    }

    const iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (iconLink && iconLink.getAttribute('href') !== iconHref) {
      iconLink.setAttribute('href', iconHref);
    }

    const appleLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (appleLink && appleLink.getAttribute('href') !== appleIconHref) {
      appleLink.setAttribute('href', appleIconHref);
    }
  });

  return (
    <>
      {props.children}
    </>
  );
};

const App: Component = () => {
  return (
    <>
      <InstallGating />
      <Router>
        <Route path="/" component={PwaRoleMetaLayout}>
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
            <Route path="/visits/:id" component={SalesVisitDetail} />
            <Route path="/orders" component={SalesOrders} />
            <Route path="/orders/:id" component={SalesOrderDetail} />
            <Route path="/customers" component={SalesCustomers} />
            <Route path="/customers/:id" component={SalesCustomerDetail} />
          </Route>

          {/* Supervisor App Routes */}
          <Route path="/supervisor" component={SupervisorLayoutWrapper}>
            <Route path="/" component={SupervisorDashboard} />
            <Route path="/approvals" component={SupervisorApprovals} />
            <Route path="/approvals/:id" component={SupervisorApprovalDetail} />
            <Route path="/team" component={SupervisorTeam} />
            <Route path="/team/:id" component={SupervisorTeamMemberDetail} />
            <Route path="/insights" component={SupervisorInsights} />
            <Route path="/insights/:id" component={SupervisorInsightDetail} />
          </Route>

          {/* Driver App Routes */}
          <Route path="/driver" component={DriverLayoutWrapper}>
            <Route path="/" component={Trips} />
            <Route path="/trips/:id" component={TripDetail} />
            <Route path="/deliveries" component={Deliveries} />
            <Route path="/deliveries/:id" component={DeliveryDetail} />
          </Route>

          {/* Warehouse App Routes */}
          <Route path="/warehouse" component={WarehouseLayoutWrapper}>
            <Route path="/" component={WarehouseDashboard} />
            <Route path="/tasks" component={WarehouseTasks} />
            <Route path="/tasks/batch" component={WarehouseBatchPicking} />
            <Route path="/tasks/:id" component={WarehouseTaskDetail} />
            <Route path="/inventory" component={WarehouseInventory} />
            <Route path="/inventory/:id" component={WarehouseInventoryDetail} />
            <Route path="/receiving" component={WarehouseReceiving} />
            <Route path="/receiving/create" component={WarehouseCreatePO} />
            <Route path="/receiving/:id" component={WarehouseReceivingDetail} />
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
            <Route path="/reports" component={AdminReports} />
            <Route path="/returns" component={AdminReturns} />
            <Route path="/inventory" component={AdminInventory} />
            <Route path="/customer-tiers" component={AdminCustomerTiers} />
            <Route path="/territories" component={AdminTerritories} />
            <Route path="/settings" component={AdminSettings} />
            <Route path="/telegram" component={AdminTelegram} />
            <Route path="/telegram-link" component={AdminTelegramLink} />
            <Route path="/notification-settings" component={AdminNotificationSettings} />
            <Route path="/company-profile" component={AdminCompanyProfile} />
            <Route path="/business-settings" component={AdminBusinessSettings} />
            <Route path="/payment-settings" component={AdminPaymentSettings} />
            <Route path="/subscription" component={AdminSubscription} />
            <Route path="/gps-tracking" component={GPSTrackingSettings} />
            <Route path="/gps-tracking/map" component={UserLocationMapPage} />
            <Route path="/gps-tracking/history" component={UserLocationHistory} />
            <Route path="/data-export" component={AdminDataExport} />
          </Route>

          <Route path="/" component={Login} />
        </Route>
      </Router>
      <ToastContainer />
    </>
  );
};

export default App;
