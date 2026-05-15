import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { login } from '../services/auth.service';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { GraduationCap } from 'lucide-react';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentUser = useAuthStore((s) => s.currentUser);
  const navigate = useNavigate();

  useEffect(() => {
    if (accessToken && currentUser) {
      const isAdmin = ['super_admin', 'center_admin', 'tech_admin'].includes(currentUser.role);
      navigate(isAdmin ? '/dashboard' : '/students', { replace: true });
    }
  }, [accessToken, currentUser, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { accessToken: token, user } = await login(username.trim(), password.trim());
      if (!token) throw new Error('No access token received');
      
      setAuth(
        {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
          centerIds: user.centerIds ?? [],
        },
        token,
      );
      
      const isAdmin = ['super_admin', 'center_admin', 'tech_admin'].includes(user.role);
      navigate(isAdmin ? '/dashboard' : '/students');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Login failed. Check your credentials.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (accessToken) {
    return <LoadingSpinner label="Redirecting…" />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-100">
      <Card className="max-w-md w-full shadow-lg border-primary/10">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 bg-brand-50 rounded-2xl flex items-center justify-center mb-4 text-brand-600">
            <GraduationCap size={32} />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">SPARSHA System</h1>
          <p className="text-neutral-500 mt-1">Student Management Portal</p>
        </div>

        {error && (
          <div className="mb-6">
            <ErrorMessage message={error} />
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. super_admin@sparsha.org"
            autoComplete="email"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />

          <Button type="submit" variant="primary" className="w-full mt-2" isLoading={isLoading}>
            Sign In
          </Button>
        </form>
      </Card>
    </div>
  );
};
