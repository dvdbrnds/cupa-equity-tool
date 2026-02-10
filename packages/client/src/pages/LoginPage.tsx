import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Shield } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [samlEnabled, setSamlEnabled] = useState(false);
  const [showLocalLogin, setShowLocalLogin] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Check if SAML is enabled and handle error params from SAML callback
  useEffect(() => {
    const samlError = searchParams.get('error');
    if (samlError) {
      setError(`SSO Error: ${decodeURIComponent(samlError)}`);
      setShowLocalLogin(true);
    }

    fetch('/api/auth/saml/enabled')
      .then(res => res.json())
      .then(data => setSamlEnabled(data.enabled))
      .catch(() => setSamlEnabled(false));
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOktaLogin = () => {
    // Redirect to server-side SAML endpoint which redirects to Okta
    window.location.href = '/api/auth/saml/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">CUPA Position & Equity Tool</CardTitle>
          <CardDescription className="text-center">
            Moravian University HR Compensation Tools
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4">
              {error}
            </div>
          )}

          {/* Okta SSO Button (primary login method when enabled) */}
          {samlEnabled && (
            <>
              <Button
                type="button"
                className="w-full h-12 text-base"
                onClick={handleOktaLogin}
              >
                <Shield className="mr-2 h-5 w-5" />
                Sign in with Moravian Okta
              </Button>

              {!showLocalLogin && (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => setShowLocalLogin(true)}
                  >
                    Admin: use local login
                  </button>
                </div>
              )}

              {showLocalLogin && (
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      Or sign in with password
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Local email/password login */}
          {(!samlEnabled || showLocalLogin) && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@moravian.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading} variant={samlEnabled ? 'outline' : 'default'}>
                {isLoading ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Signing in...
                  </>
                ) : (
                  'Sign in with password'
                )}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center text-xs text-muted-foreground">
            <p>Moravian University HR Compensation Tools</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
