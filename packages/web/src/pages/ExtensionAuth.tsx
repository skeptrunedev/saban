import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthData } from '@/lib/queries';
import { getExtensionToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CheckCircle2, Copy, AlertCircle, Loader2 } from 'lucide-react';
import type { ExtensionAuthResponse } from '@saban/shared';

export function ExtensionAuth() {
  const navigate = useNavigate();
  const { data: authData, isLoading: authLoading } = useAuthData();

  const [status, setStatus] = useState<
    'loading' | 'no-org' | 'sending' | 'success' | 'fallback' | 'error'
  >('loading');
  const [error, setError] = useState<string | null>(null);
  const [tokenData, setTokenData] = useState<ExtensionAuthResponse | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (authLoading) return;

    if (!authData?.user) {
      // Not logged in - redirect to login
      window.location.href = '/api/auth/login';
      return;
    }

    if (!authData.currentOrganization) {
      setStatus('no-org');
      return;
    }

    // User is authenticated with an org - get the extension token
    authenticateExtension();
  }, [authData, authLoading]);

  async function authenticateExtension() {
    setStatus('loading');
    setError(null);

    try {
      const data = await getExtensionToken();
      setTokenData(data);

      // Try to send to extension
      setStatus('sending');
      const sent = await sendTokenToExtension(data);

      if (sent) {
        setStatus('success');
        // Auto-close after a delay
        setTimeout(() => {
          window.close();
        }, 2000);
      } else {
        // Extension not detected - show manual copy option
        setStatus('fallback');
      }
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  async function sendTokenToExtension(data: ExtensionAuthResponse): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false;

      // Listen for response from extension content script
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        if (event.data?.type === 'EXTENSION_AUTH_SUCCESS') {
          resolved = true;
          window.removeEventListener('message', handleMessage);
          resolve(true);
        } else if (event.data?.type === 'EXTENSION_AUTH_ERROR') {
          resolved = true;
          window.removeEventListener('message', handleMessage);
          resolve(false);
        }
      };

      window.addEventListener('message', handleMessage);

      // Send token via postMessage (extension content script will receive this)
      window.postMessage(
        {
          type: 'EXTENSION_AUTH_TOKEN',
          token: data.token,
          user: data.user,
          organization: data.organization,
        },
        window.location.origin
      );

      // Timeout after 2 seconds
      setTimeout(() => {
        if (!resolved) {
          window.removeEventListener('message', handleMessage);
          resolve(false);
        }
      }, 2000);
    });
  }

  const handleCopy = async () => {
    if (tokenData?.token) {
      await navigator.clipboard.writeText(tokenData.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (authLoading || status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Preparing authentication...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'no-org') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
            <CardTitle className="text-xl">Organization Required</CardTitle>
            <CardDescription>
              Please select or create an organization before connecting the extension.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" onClick={() => navigate('/organizations/select')}>
              Select Organization
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/organizations/new')}
            >
              Create Organization
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
            <CardTitle className="text-xl">Authentication Failed</CardTitle>
            <CardDescription>{error || 'An unexpected error occurred.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={authenticateExtension}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'sending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Connecting to extension...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <CardTitle className="text-xl">Extension Connected!</CardTitle>
            <CardDescription>
              You're now signed in as {tokenData?.user.email} in{' '}
              {tokenData?.organization?.name || 'your organization'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            This window will close automatically...
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback - show token for manual copy
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Connect Extension</CardTitle>
          <CardDescription>
            Copy this token and paste it in the extension popup to authenticate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Signed in as <strong>{tokenData?.user.email}</strong>
              <br />
              Organization: <strong>{tokenData?.organization?.name}</strong>
            </p>
          </div>

          <div className="flex gap-2">
            <Input readOnly value={tokenData?.token || ''} className="font-mono text-xs" />
            <Button onClick={handleCopy} variant="outline">
              {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            This token expires in 30 days. You can generate a new one anytime by visiting this page.
          </p>

          <Button variant="outline" className="w-full" onClick={() => window.close()}>
            Close Window
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
