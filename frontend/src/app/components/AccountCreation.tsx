import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, UserPlus, LogIn, Calendar, Users, Clock } from 'lucide-react';

interface BusinessType {
  business_type_id: number;
  business_type: string;
}

export function AccountCreation() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [isSignUp, setIsSignUp] = useState<boolean>(true);
  const [businessName, setBusinessName] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [businessTypeId, setBusinessTypeId] = useState<string>('');
  const [businessTypes, setBusinessTypes] = useState<BusinessType[]>([]);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    fetch('/api/business-types')
      .then((res) => res.json())
      .then((data: BusinessType[]) => setBusinessTypes(data))
      .catch((err: unknown) => console.error('Failed to load business types:', err));
  }, []);

  const clearFields = () => {
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setBusinessName('');
    setAddress('');
    setBusinessTypeId('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_name: businessName,
            username,
            password,
            address,
            business_type_id: businessTypeId ? parseInt(businessTypeId) : null,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Signup failed');
        } else {
          if (data.token) {
            clearFields();
            login(data.token);
            navigate('/dashboard');
          } else {
            clearFields();
            setIsSignUp(false);
            setError('');
            alert('Account created successfully! Please sign in.');
          }
        }
      } else {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Invalid username or password');
        } else {
          clearFields();
          login(data.token);
          if (data.role === 'ops') {
            navigate('/ops');
          } else {
            navigate('/dashboard');
          }
        }
      }
    } catch (err: unknown) {
      setError('Could not connect to the server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex">

      {/* Left Panel */}
      <div
        className="hidden lg:flex lg:w-1/2 p-12 flex-col justify-between text-primary-foreground"
        style={{ background: 'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 100%)' }}
      >
        <div>
          <div className="flex items-center gap-2 mb-8">
            <Calendar className="size-8" style={{ color: '#fbbf24' }} />
            <h1 className="text-3xl font-bold tracking-tight">ShiftSync</h1>
          </div>

          <div className="space-y-8 mt-16">
            <h2 className="text-4xl font-bold leading-tight">
              Simplify your team's<br />scheduling workflow
            </h2>
            <p className="text-lg" style={{ color: 'rgba(255,255,255,0.75)' }}>
              The all-in-one solution for businesses to manage shifts, enable employee
              shift swapping, and optimize your workforce scheduling.
            </p>

            <div className="space-y-6 mt-12">
              {[
                { icon: <Clock className="size-6" />, title: 'Easy Shift Swapping', desc: 'Employees can request and approve shift swaps with just a few clicks' },
                { icon: <Users className="size-6" />, title: 'Team Management', desc: "Keep track of your entire team's availability and preferences" },
                { icon: <Calendar className="size-6" />, title: 'Smart Scheduling', desc: 'AI-powered scheduling that considers availability and labor laws' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex items-start gap-4">
                  <div
                    className="p-3 rounded-lg flex-shrink-0"
                    style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.25)' }}
                  >
                    {icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-xl mb-1">{title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.65)' }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-4" style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.4), transparent)' }} />
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            © 2026 ShiftSync. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center text-primary">
            <Calendar className="size-8" />
            <h1 className="text-2xl font-bold">ShiftSync</h1>
          </div>

          <div
            className="bg-card rounded-2xl shadow-lg p-8"
            style={{ border: '1px solid rgba(202,138,4,0.15)' }}
          >
            {/* Tabs */}
            <div className="flex gap-2 mb-8 p-1 rounded-lg bg-muted">
              <button
                onClick={() => { setIsSignUp(true); setError(''); clearFields(); }}
                className={`flex-1 py-2.5 rounded-md font-medium transition-all ${
                  isSignUp ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <UserPlus className="size-4 inline mr-2" />
                Sign Up
              </button>
              <button
                onClick={() => { setIsSignUp(false); setError(''); clearFields(); }}
                className={`flex-1 py-2.5 rounded-md font-medium transition-all ${
                  !isSignUp ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LogIn className="size-4 inline mr-2" />
                Login
              </button>
            </div>

            <h2 className="text-2xl font-bold mb-2 text-foreground">
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-muted-foreground mb-6">
              {isSignUp ? 'Get started with your business scheduling' : 'Sign in to your account'}
            </p>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {isSignUp && (
                <>
                  <div>
                    <label htmlFor="businessName" className="block text-sm font-medium text-foreground mb-1.5">
                      Business Name
                    </label>
                    <input
                      type="text"
                      id="businessName"
                      name="business-name"
                      autoComplete="organization"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg outline-none transition bg-input-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                      style={{ border: '1px solid rgba(202,138,4,0.25)' }}
                      placeholder="Your Business Name"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="address" className="block text-sm font-medium text-foreground mb-1.5">
                      Address
                    </label>
                    <input
                      type="text"
                      id="address"
                      name="business-address"
                      autoComplete="off"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg outline-none transition bg-input-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                      style={{ border: '1px solid rgba(202,138,4,0.25)' }}
                      placeholder="Business address"
                    />
                  </div>

                  <div>
                    <label htmlFor="businessType" className="block text-sm font-medium text-foreground mb-1.5">
                      Business Type
                    </label>
                    <select
                      id="businessType"
                      name="business-type"
                      autoComplete="off"
                      value={businessTypeId}
                      onChange={(e) => setBusinessTypeId(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg outline-none transition bg-input-background text-foreground focus:ring-2 focus:ring-ring"
                      style={{ border: '1px solid rgba(202,138,4,0.25)' }}
                    >
                      <option value="">Select a business type</option>
                      {businessTypes.map((type) => (
                        <option key={type.business_type_id} value={type.business_type_id}>
                          {type.business_type}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label htmlFor={isSignUp ? "signup-username" : "login-username"} className="block text-sm font-medium text-foreground mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  id={isSignUp ? "signup-username" : "login-username"}
                  name={isSignUp ? "signup-username" : "login-username"}
                  autoComplete={isSignUp ? "off" : "username"}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg outline-none transition bg-input-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                  style={{ border: '1px solid rgba(202,138,4,0.25)' }}
                  placeholder="Enter your username"
                  required
                />
              </div>

              <div>
                <label htmlFor={isSignUp ? "signup-password" : "login-password"} className="block text-sm font-medium text-foreground mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id={isSignUp ? "signup-password" : "login-password"}
                    name={isSignUp ? "new-password" : "current-password"}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 pr-10 rounded-lg outline-none transition bg-input-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                    style={{ border: '1px solid rgba(202,138,4,0.25)' }}
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>

              {isSignUp && (
                <div>
                  <label htmlFor="signup-confirm-password" className="block text-sm font-medium text-foreground mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      id="signup-confirm-password"
                      name="new-password-confirm"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 rounded-lg outline-none transition bg-input-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                      style={{ border: '1px solid rgba(202,138,4,0.25)' }}
                      placeholder="Confirm your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </button>
                  </div>
                </div>
              )}

              {!isSignUp && (
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded" style={{ accentColor: '#b91c1c' }} />
                    <span className="text-muted-foreground">Remember me</span>
                  </label>
                  <a href="#" className="text-primary hover:opacity-80 font-medium transition-opacity">
                    Forgot password?
                  </a>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground py-3 rounded-lg font-medium transition-all disabled:opacity-50 hover:opacity-90"
                style={{ boxShadow: '0 4px 20px rgba(185,28,28,0.3)' }}
              >
                {loading ? 'Please wait…' : isSignUp ? 'Create Account' : 'Sign In'}
              </button>

              {isSignUp && (
                <p className="text-xs text-muted-foreground text-center">
                  By signing up, you agree to our Terms of Service and Privacy Policy
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}