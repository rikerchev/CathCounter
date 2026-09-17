import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { captureReferralFromUrl, captureMerchantFromUrl } from '@/lib/referral';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
import { LanguageProvider } from '@/lib/i18n';
import SyncProvider from '@/components/SyncProvider';
// Auth pages
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
// Add page imports here
import Layout from '@/components/Layout';
import Home from './pages/Home';
import ActiveSession from './pages/ActiveSession';
import LogCatch from './pages/LogCatch';
import CatchHistory from './pages/CatchHistory';
import Sessions from './pages/Sessions';
import CatchDetails from './pages/CatchDetails';
import EditCatch from './pages/EditCatch';
import Statistics from './pages/Statistics';
import Locations from './pages/Locations';
import PersonalBest from './pages/PersonalBest';
import BaitInventory from './pages/BaitInventory';
import Profile from './pages/Profile';
import Advertise from './pages/Advertise';
import CustomAds from './pages/CustomAds';
import AdminUsers from './pages/AdminUsers';
import AdminSetup from './pages/AdminSetup';
import WaterBodies from './pages/WaterBodies';
import MerchantRequest from './pages/MerchantRequest';
import Competitions from './pages/Competitions';
import WaterBodyManagement from './pages/WaterBodyManagement';
import TraderVenues from './pages/TraderVenues';
import CommercialVenues from './pages/CommercialVenues';
import AdminTraders from './pages/AdminTraders';
import AdminRoleRequests from './pages/AdminRoleRequests';
import AdManagement from './pages/AdManagement';
import AdminAdRequests from './pages/AdminAdRequests';
import MyAdRequests from './pages/MyAdRequests';
import SectorReservations from './pages/SectorReservations';
import AdminDataExport from './pages/AdminDataExport';
import BaseItems from './pages/BaseItems';
import UserInventoryPage from './pages/UserInventoryPage';
import AdminTranslations from './pages/AdminTranslations';
import ContactUs from './pages/ContactUs';
import Terms from './pages/Terms';

// v2.68/v2.69 — capture a ?ref=<code> (peer invite) or ?merchant=<type:id>
// (printed brochure) param as early as possible (module load, before
// anything renders), so either survives a full-page redirect to Google
// sign-in and back. Actual redemption happens once the user is
// authenticated — see AuthContext.jsx.
captureReferralFromUrl();
captureMerchantFromUrl();

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const isAuthPage = ["/login", "/register", "/forgot-password", "/reset-password"].includes(window.location.pathname);

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors (but not on auth pages)
  if (authError && !isAuthPage) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      {/* Auth routes — accessible without authentication */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* Add your page Route elements here */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/active-session" element={<ActiveSession />} />
          <Route path="/log-catch" element={<LogCatch />} />
          <Route path="/catch-history" element={<CatchHistory />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/catch-details" element={<CatchDetails />} />
          <Route path="/edit-catch" element={<EditCatch />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/locations" element={<Locations />} />
          <Route path="/personal-best" element={<PersonalBest />} />
          <Route path="/bait-inventory" element={<BaitInventory />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/advertise" element={<Advertise />} />
          <Route path="/custom-ads" element={<CustomAds />} />
          <Route path="/admin-users" element={<AdminUsers />} />
          <Route path="/admin-setup" element={<AdminSetup />} />
          <Route path="/water-bodies" element={<WaterBodies />} />
          <Route path="/commercial-venues" element={<CommercialVenues />} />
          {/* /water-body-request kept as an alias to the old bookmarked/
              linked URL — both point at the same unified type-picker form. */}
          <Route path="/water-body-request" element={<MerchantRequest />} />
          <Route path="/merchant-request" element={<MerchantRequest />} />
          <Route path="/competitions" element={<Competitions />} />
          <Route path="/water-body-management" element={<WaterBodyManagement />} />
          <Route path="/trader-venues" element={<TraderVenues />} />
          <Route path="/admin-traders" element={<AdminTraders />} />
          <Route path="/admin-role-requests" element={<AdminRoleRequests />} />
          <Route path="/admin-ad-slots" element={<AdManagement />} />
          <Route path="/admin-ad-requests" element={<AdminAdRequests />} />
          <Route path="/my-ad-requests" element={<MyAdRequests />} />
          <Route path="/sector-reservations" element={<SectorReservations />} />
          <Route path="/admin-data-export" element={<AdminDataExport />} />
          <Route path="/inventory/base-items" element={<BaseItems />} />
          <Route path="/inventory/my-inventory" element={<UserInventoryPage />} />
          <Route path="/admin-translations" element={<AdminTranslations />} />
          <Route path="/contact-us" element={<ContactUs />} />
        </Route>
      </Route>
      {/* Terms is reachable without being logged in too (public legal page) */}
      <Route path="/terms" element={<Terms />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <LanguageProvider>
        <SyncProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        </SyncProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App