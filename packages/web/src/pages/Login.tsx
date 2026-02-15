import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function Login() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  const handleLogin = () => {
    window.location.href = '/api/auth/login';
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">LinkedIn Leads</CardTitle>
          <CardDescription>Sign in to manage your LinkedIn leads</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error === 'no_code' && 'Authentication was cancelled or failed.'}
              {error === 'auth_failed' && 'Authentication failed. Please try again.'}
            </div>
          )}
          <Button onClick={handleLogin} className="w-full" size="lg">
            Sign in with WorkOS
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
