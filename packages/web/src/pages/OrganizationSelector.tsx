import { useNavigate } from 'react-router-dom';
import { useAuthData, useSelectOrganization } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, ChevronRight, Plus } from 'lucide-react';

export function OrganizationSelector() {
  const navigate = useNavigate();
  const { data: authData, isLoading } = useAuthData();
  const selectOrg = useSelectOrganization();

  const organizations = authData?.organizations ?? [];

  const handleSelect = async (orgId: string) => {
    try {
      await selectOrg.mutateAsync(orgId);
      navigate('/');
    } catch (err) {
      console.error('Failed to select organization:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Select Organization</CardTitle>
          <CardDescription>Choose which workspace to use</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => handleSelect(org.id)}
              disabled={selectOrg.isPending}
              className="flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors hover:bg-muted disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{org.name}</p>
                  <p className="text-sm text-muted-foreground capitalize">{org.role}</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          ))}

          <div className="pt-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/organizations/new')}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create New Organization
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
