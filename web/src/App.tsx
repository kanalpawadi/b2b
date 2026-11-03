import { Navigate, Route, Routes } from 'react-router-dom';
import { Bell, Building2, ClipboardList, LayoutDashboard, Users as UsersIcon } from 'lucide-react';
import { isConfigured } from './lib/supabase';
import { useAuth } from './features/auth/AuthProvider';
import { AdminJoin, ForgotPassword, Onboarding, Register, ResetPassword, SignIn, StaffRequest, wantsStaffAccess } from './features/auth/AuthScreens';
import { AwaitingApproval, Blocked, ProfileMissing, SetupNeeded } from './features/auth/GateScreens';
import { AdminShell, RetailerShell, type NavItem } from './components/Shell';
import { FullScreenLoader } from './components/ui';
import { Landing } from './features/landing/Landing';
import { RetailerHome } from './features/catalogue/Home';
import { CompanyPage } from './features/catalogue/CompanyPage';
import { TradePage } from './features/catalogue/TradePage';
import { About } from './features/about/About';
import { Cart } from './features/cart/Cart';
import { OrderDetail, OrderList } from './features/orders/Orders';
import { Alerts } from './features/notifications/Alerts';
import { Account } from './features/account/Account';
import { Dashboard } from './features/admin/Dashboard';
import { AddCompany, CompanyDetail, CompanyList } from './features/admin/Companies';
import { ProductFormPage } from './features/admin/ProductForm';
import { Trades } from './features/admin/Trades';
import { UserDetail, Users } from './features/admin/Users';

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Today', icon: <LayoutDashboard className="size-5" />, end: true },
  { to: '/admin/orders', label: 'Orders', icon: <ClipboardList className="size-5" /> },
  { to: '/admin/companies', label: 'Companies', icon: <Building2 className="size-5" /> },
  { to: '/admin/users', label: 'People', icon: <UsersIcon className="size-5" /> },
  { to: '/admin/alerts', label: 'Alerts', icon: <Bell className="size-5" /> },
];

export function App() {
  const { session, profile, loading } = useAuth();

  if (!isConfigured) {
    return (
      <Routes>
        <Route index element={<Landing />} />
        <Route path="*" element={<SetupNeeded />} />
      </Routes>
    );
  }
  if (loading) return <FullScreenLoader />;

  return (
    <Routes>
      {/* The reset email signs the user in, so this works in both states. */}
      <Route path="/reset-password" element={<ResetPassword />} />
      {!session ? (
        <>
          <Route index element={<Landing />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/admin/join" element={<AdminJoin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : !profile || !profile.verified_at ? (
        <Route path="*" element={<ProfileMissing />} />
      ) : profile.status === 'blocked' ? (
        <Route path="*" element={<Blocked />} />
      ) : profile.role === 'retailer' && !profile.shop_name && wantsStaffAccess() ? (
        <Route path="*" element={<StaffRequest />} />
      ) : profile.status === 'pending' ? (
        <Route path="*" element={<AwaitingApproval />} />
      ) : profile.role === 'retailer' && !profile.shop_name ? (
        <Route path="*" element={<Onboarding />} />
      ) : profile.role === 'admin' ? (
        <>
          <Route path="/admin" element={<AdminShell items={adminNav} />}>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<OrderList admin />} />
            <Route path="orders/:id" element={<OrderDetail admin />} />
            <Route path="companies" element={<CompanyList />} />
            <Route path="companies/new" element={<AddCompany />} />
            <Route path="companies/:companyId" element={<CompanyDetail />} />
            <Route path="companies/:companyId/products/new" element={<ProductFormPage />} />
            <Route path="companies/:companyId/products/:productId" element={<ProductFormPage />} />
            <Route path="trades" element={<Trades />} />
            {/* Old bookmarks */}
            <Route path="catalogue" element={<Navigate to="/admin/companies" replace />} />
            <Route path="masters" element={<Navigate to="/admin/trades" replace />} />
            <Route path="users" element={<Users />} />
            <Route path="users/:id" element={<UserDetail />} />
            <Route path="alerts" element={<Alerts admin />} />
            <Route path="account" element={<Account />} />
          </Route>
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </>
      ) : (
        <>
          <Route element={<RetailerShell />}>
            <Route index element={<RetailerHome />} />
            <Route path="companies/:companyId" element={<CompanyPage />} />
            <Route path="companies/:companyId/trades/:tradeId" element={<TradePage />} />
            <Route path="about" element={<About />} />
            <Route path="cart" element={<Cart />} />
            <Route path="orders" element={<OrderList />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="account" element={<Account />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}
