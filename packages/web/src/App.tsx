import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthData, useSelectOrganization } from '@/lib/queries';
import { logout } from '@/lib/api';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { LeadDetail } from '@/pages/LeadDetail';
import { Settings } from '@/pages/Settings';
import { OrganizationSelector } from '@/pages/OrganizationSelector';
import { NewOrganization } from '@/pages/NewOrganization';
import { ExtensionAuth } from '@/pages/ExtensionAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LogOut,
  User,
  Building2,
  Settings as SettingsIcon,
  ChevronDown,
  Check,
} from 'lucide-react';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { data: authData } = useAuthData();
  const selectOrg = useSelectOrganization();

  const user = authData?.user;
  const organizations = authData?.organizations ?? [];
  const currentOrg = authData?.currentOrganization;

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    window.location.href = '/login';
  };

  const handleSwitchOrg = async (orgId: string) => {
    try {
      await selectOrg.mutateAsync(orgId);
    } catch (err) {
      console.error('Failed to switch org:', err);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold">LinkedIn Leads</h1>

            {/* Organization Switcher */}
            {currentOrg && organizations.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Building2 className="h-4 w-4" />
                    {currentOrg.name}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Switch Organization</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {organizations.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      onClick={() => handleSwitchOrg(org.id)}
                      disabled={selectOrg.isPending}
                    >
                      <span className="flex-1">{org.name}</span>
                      {org.id === currentOrg.id && <Check className="h-4 w-4 ml-2" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/organizations/new')}>
                    Create New Organization
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {user && (
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    {user.email}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/settings')}>
                    <SettingsIcon className="mr-2 h-4 w-4" />
                    Organization Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/extension-auth')}>
                    <Building2 className="mr-2 h-4 w-4" />
                    Connect Extension
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

function ProtectedRoute({
  children,
  requireOrg = true,
}: {
  children: ReactNode;
  requireOrg?: boolean;
}) {
  const { data: authData, isLoading } = useAuthData();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!authData?.user) {
    return <Navigate to="/login" replace />;
  }

  // If org is required and user has no org selected
  if (requireOrg && !authData.currentOrganization) {
    // If user has orgs but none selected, go to selector
    if (authData.organizations && authData.organizations.length > 0) {
      return <Navigate to="/organizations/select" replace />;
    }
    // No orgs at all - go to create
    return <Navigate to="/organizations/new" replace />;
  }

  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Organization setup routes - don't require org */}
      <Route path="/organizations/select" element={<OrganizationSelector />} />
      <Route path="/organizations/new" element={<NewOrganization />} />

      {/* Extension auth - standalone page */}
      <Route path="/extension-auth" element={<ExtensionAuth />} />

      {/* Protected routes - require org */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads/:id"
        element={
          <ProtectedRoute>
            <LeadDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
