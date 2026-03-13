import { type Component, Suspense, createEffect, lazy } from 'solid-js';
import { Router, Route, useLocation, useNavigate } from '@solidjs/router';
import { ToastContainer } from './components/Toast';
import InstallGating from './components/pwa/InstallGating';
import { currentUser } from './stores/auth';
import ImpersonationBanner from './components/common/ImpersonationBanner';

const Login = lazy(() => import('./pages/auth/Login'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const MobileSalesLayout = lazy(() => import('./components/layout/MobileSalesLayout'));
const MobileDriverLayout = lazy(() => import('./components/layout/MobileDriverLayout'));
const MobileSupervisorLayout = lazy(() => import('./components/layout/MobileSupervisorLayout'));
const MobileWarehouseLayout = lazy(() => import('./components/layout/MobileWarehouseLayout'));
const AdminLayout = lazy(() => import('./components/layout/AdminLayout'));
const SuperAdminLayout = lazy(() => import('./components/layout/SuperAdminLayout'));

const SalesDashboard = lazy(() => import('./pages/sales/Dashboard'));
const Catalog = lazy(() => import('./pages/sales/Catalog'));
const Cart = lazy(() => import('./pages/sales/Cart'));
const SalesVisits = lazy(() => import('./pages/sales/Visits'));
const SalesCustomers = lazy(() => import('./pages/sales/Customers'));
const SalesOrders = lazy(() => import('./pages/sales/Orders'));
const SalesOrderDetail = lazy(() => import('./pages/sales/OrderDetail'));
const SalesCustomerDetail = lazy(() => import('./pages/sales/CustomerDetail'));
const SalesVisitDetail = lazy(() => import('./pages/sales/VisitDetail'));

const Trips = lazy(() => import('./pages/driver/Trips'));
const TripDetail = lazy(() => import('./pages/driver/TripDetail'));
const Deliveries = lazy(() => import('./pages/driver/Deliveries'));
const DeliveryDetail = lazy(() => import('./pages/driver/DeliveryDetail'));
const DriverProfile = lazy(() => import('./pages/driver/Profile'));

const SupervisorDashboard = lazy(() => import('./pages/supervisor/Dashboard'));
const SupervisorApprovals = lazy(() => import('./pages/supervisor/Approvals'));
const SupervisorTeam = lazy(() => import('./pages/supervisor/Team'));
const SupervisorInsights = lazy(() => import('./pages/supervisor/Insights'));
const SupervisorApprovalDetail = lazy(() => import('./pages/supervisor/ApprovalDetail'));
const SupervisorTeamMemberDetail = lazy(() => import('./pages/supervisor/TeamMemberDetail'));
const SupervisorInsightDetail = lazy(() => import('./pages/supervisor/InsightDetail'));

const WarehouseDashboard = lazy(() => import('./pages/warehouse/Dashboard'));
const WarehouseTasks = lazy(() => import('./pages/warehouse/Tasks'));
const WarehouseInventory = lazy(() => import('./pages/warehouse/Inventory'));
const WarehouseReceiving = lazy(() => import('./pages/warehouse/Receiving'));
const WarehouseTaskDetail = lazy(() => import('./pages/warehouse/TaskDetail'));
const WarehouseInventoryDetail = lazy(() => import('./pages/warehouse/InventoryDetail'));
const WarehouseReceivingDetail = lazy(() => import('./pages/warehouse/ReceivingDetail'));
const WarehouseBatchPicking = lazy(() => import('./pages/warehouse/BatchPicking'));
const WarehouseCreatePO = lazy(() => import('./pages/warehouse/CreatePurchaseOrder'));

const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminProducts = lazy(() => import('./pages/admin/Products'));
const AdminCustomers = lazy(() => import('./pages/admin/Customers'));
const CustomerRegistrationRequests = lazy(() => import('./pages/admin/CustomerRegistrationRequests'));
const AdminOrders = lazy(() => import('./pages/admin/Orders'));
const AdminOrderDetail = lazy(() => import('./pages/admin/OrderDetail'));
const AdminCategories = lazy(() => import('./pages/admin/Categories'));
const AdminBrands = lazy(() => import('./pages/admin/Brands'));
const AdminDiscounts = lazy(() => import('./pages/admin/Discounts'));
const AdminProcurement = lazy(() => import('./pages/admin/Procurement'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const UserTerritoryAssignment = lazy(() => import('./pages/admin/UserTerritoryAssignment'));
const AdminProfile = lazy(() => import('./pages/admin/Profile'));
const AdminDeliveries = lazy(() => import('./pages/admin/Deliveries'));
const AdminNotificationSettings = lazy(() => import('./pages/admin/NotificationSettings'));
const AdminTelegram = lazy(() => import('./pages/admin/Telegram'));
const AdminSalesdoc = lazy(() => import('./pages/admin/Salesdoc'));
const AdminCompanyProfile = lazy(() => import('./pages/admin/CompanyProfile'));
const AdminBusinessSettings = lazy(() => import('./pages/admin/BusinessSettings'));
const AdminPaymentSettings = lazy(() => import('./pages/admin/PaymentSettings'));
const AdminSubscription = lazy(() => import('./pages/admin/Subscription'));
const GPSTrackingSettings = lazy(() => import('./pages/admin/GPSTrackingSettings'));
const UserLocationHistory = lazy(() => import('./pages/admin/UserLocationHistory'));
const UserLocationMapPage = lazy(() => import('./pages/admin/UserLocationMapPage'));
const AdminCustomerTiers = lazy(() => import('./pages/admin/CustomerTiers'));
const AdminTerritories = lazy(() => import('./pages/admin/Territories'));
const AdminReturns = lazy(() => import('./pages/admin/Returns'));
const AdminInventory = lazy(() => import('./pages/admin/Inventory'));
const AdminMoneyTransfers = lazy(() => import('./pages/admin/MoneyTransfers'));
const AdminVehicles = lazy(() => import('./pages/admin/Vehicles'));
const AdminReports = lazy(() => import('./pages/admin/Reports'));
const AdminDataExport = lazy(() => import('./pages/admin/DataExport'));

const Payroll = lazy(() => import('./pages/admin/Payroll'));
const PayrollRun = lazy(() => import('./pages/admin/PayrollRun'));
const PayrollSalaries = lazy(() => import('./pages/admin/PayrollSalaries'));
const PayrollCommissions = lazy(() => import('./pages/admin/PayrollCommissions'));
const PayrollPeriods = lazy(() => import('./pages/admin/PayrollPeriods'));
const PayrollPeriodDetail = lazy(() => import('./pages/admin/PayrollPeriodDetail'));
const PayrollBenefits = lazy(() => import('./pages/admin/PayrollBenefits'));
const PayrollAdvances = lazy(() => import('./pages/admin/PayrollAdvances'));
const PayrollSettings = lazy(() => import('./pages/admin/PayrollSettings'));

const SuperAdminDashboard = lazy(() => import('./pages/super/Dashboard'));
const SuperAdminTenants = lazy(() => import('./pages/super/Tenants'));
const SuperAdminSettings = lazy(() => import('./pages/super/Settings'));
const SuperAdminPlanLimits = lazy(() => import('./pages/super/PlanLimits'));
const DefaultSettings = lazy(() => import('./pages/super/DefaultSettings'));
const SecuritySettings = lazy(() => import('./pages/super/SecuritySettings'));
const AnnouncementSettings = lazy(() => import('./pages/super/AnnouncementSettings'));
const EmailSettings = lazy(() => import('./pages/super/EmailSettings'));
const TelegramSettings = lazy(() => import('./pages/super/TelegramSettings'));
const BrandingSettings = lazy(() => import('./pages/super/BrandingSettings'));
const BackupHub = lazy(() => import('./pages/super/BackupHub'));
const BackupOperations = lazy(() => import('./pages/super/BackupOperations'));
const BackupPolicy = lazy(() => import('./pages/super/BackupPolicy'));
const SuperAdminAuditLogs = lazy(() => import('./pages/super/AuditLogs'));
const SystemHealth = lazy(() => import('./pages/super/SystemHealth'));
const MasterCatalog = lazy(() => import('./pages/super/MasterCatalog'));
const SubscriptionRequests = lazy(() => import('./pages/super/SubscriptionRequests'));

const PaymentPortal = lazy(() => import('./pages/PaymentPortal'));
const CustomerPortalPage = lazy(() => import('./pages/customer/CustomerPortalPage'));
const PublicCatalogPage = lazy(() => import('./pages/customer/PublicCatalogPage'));
const CustomerOrderDetail = lazy(() => import('./pages/CustomerOrderDetail'));

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

    if (pathname === '/' || pathname.startsWith('/customer')) {
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
      <ImpersonationBanner />
      {props.children}
    </>
  );
};

const App: Component = () => {
  return (
    <>
      <InstallGating />
      <Suspense fallback={
        <div class="min-h-screen bg-slate-950 flex items-center justify-center">
          <div class="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
        </div>
      }>
        <Router>
          <Route path="/" component={PwaRoleMetaLayout}>
          <Route path="/" component={PublicCatalogPage} />
          <Route path="/login" component={Login} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />

          {/* Payment Portal (public - no auth required) */}
          <Route path="/pay/:token" component={PaymentPortal} />

          {/* Customer Self-Service Portal (mobile-optimized, OTP auth) */}
          <Route path="/customer" component={CustomerPortalPage} />
          <Route path="/customer/catalog" component={PublicCatalogPage} />
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
            <Route path="/profile" component={DriverProfile} />
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
            <Route path="/settings/backup" component={BackupHub} />
            <Route path="/backup/operations" component={BackupOperations} />
            <Route path="/backup/policy" component={BackupPolicy} />
            <Route path="/health" component={SystemHealth} />
            <Route path="/master-catalog" component={MasterCatalog} />
            <Route path="/audit-logs" component={SuperAdminAuditLogs} />
            <Route path="/subscription" component={SubscriptionRequests} />
            <Route path="/subscription-requests" component={SubscriptionRequests} />
            <Route path="/users" component={AdminUsers} />
            <Route path="/users/:id/territories" component={UserTerritoryAssignment} />
          </Route>

          {/* Admin Portal Routes */}
          <Route path="/admin" component={AdminLayoutWrapper}>
            <Route path="/" component={AdminDashboard} />
            <Route path="/orders" component={AdminOrders} />
            <Route path="/orders/:id" component={AdminOrderDetail} />
            <Route path="/money-transfers" component={AdminMoneyTransfers} />
            <Route path="/products" component={AdminProducts} />
            <Route path="/categories" component={AdminCategories} />
            <Route path="/brands" component={AdminBrands} />
            <Route path="/discounts" component={AdminDiscounts} />
            <Route path="/procurement" component={AdminProcurement} />
            <Route path="/customers" component={AdminCustomers} />
            <Route path="/customers/registration-requests" component={CustomerRegistrationRequests} />
            <Route path="/users" component={AdminUsers} />
            <Route path="/users/:id/territories" component={UserTerritoryAssignment} />
            <Route path="/profile" component={AdminProfile} />
            <Route path="/deliveries" component={AdminDeliveries} />
            <Route path="/vehicles" component={AdminVehicles} />
            <Route path="/reports" component={AdminReports} />
            <Route path="/returns" component={AdminReturns} />
            <Route path="/inventory" component={AdminInventory} />
            <Route path="/customer-tiers" component={AdminCustomerTiers} />
            <Route path="/territories" component={AdminTerritories} />
            <Route path="/telegram" component={AdminTelegram} />
            <Route path="/salesdoc" component={AdminSalesdoc} />
            <Route path="/notification-settings" component={AdminNotificationSettings} />
            <Route path="/company-profile" component={AdminCompanyProfile} />
            <Route path="/business-settings" component={AdminBusinessSettings} />
            <Route path="/payment-settings" component={AdminPaymentSettings} />
            <Route path="/subscription" component={AdminSubscription} />
            <Route path="/gps-tracking" component={GPSTrackingSettings} />
            <Route path="/gps-tracking/map" component={UserLocationMapPage} />
            <Route path="/gps-tracking/history" component={UserLocationHistory} />
            <Route path="/data-export" component={AdminDataExport} />
            
            {/* Payroll Routes */}
            <Route path="/payroll" component={Payroll} />
            <Route path="/payroll/run" component={PayrollRun} />
            <Route path="/payroll/salaries" component={PayrollSalaries} />
            <Route path="/payroll/commissions" component={PayrollCommissions} />
            <Route path="/payroll/benefits" component={PayrollBenefits} />
            <Route path="/payroll/advances" component={PayrollAdvances} />
            <Route path="/payroll/settings" component={PayrollSettings} />
            <Route path="/payroll/reports" component={AdminReports} />
            <Route path="/payroll/periods" component={PayrollPeriods} />
            <Route path="/payroll/periods/:id" component={PayrollPeriodDetail} />
          </Route>

            <Route path="/*all" component={Login} />
          </Route>
        </Router>
      </Suspense>
      <ToastContainer />
    </>
  );
};

export default App;
