import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, UserPlus, LogIn, Calendar, Users, Clock, ChevronRight, Shield, Zap } from 'lucide-react';

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
      setError('Could not connect to the server. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  /* ── Inline styles for the steel/teal theme (isolated to this page) ── */
  const steel = {
    darkest: '#0f1419',
    darker: '#151b23',
    dark: '#1c2530',
    mid: '#2a3441',
    light: '#3d4f5f',
    lighter: '#5a7080',
    text: '#c8d6e0',
    textMuted: '#7e929e',
    teal: '#2dd4bf',
    tealDark: '#14b8a6',
    tealGlow: 'rgba(45, 212, 191, 0.15)',
    tealBorder: 'rgba(45, 212, 191, 0.25)',
    tealShadow: 'rgba(45, 212, 191, 0.12)',
    blue: '#38bdf8',
    blueGlow: 'rgba(56, 189, 248, 0.1)',
    cyan: '#22d3ee',
    border: 'rgba(93, 130, 155, 0.2)',
    borderLight: 'rgba(93, 130, 155, 0.12)',
    inputBg: 'rgba(15, 20, 25, 0.6)',
    cardBg: 'rgba(28, 37, 48, 0.65)',
    error: '#f87171',
    errorBg: 'rgba(248, 113, 113, 0.08)',
  };

  const featureItems = [
    {
      icon: <Clock className="size-5" style={{ color: steel.teal }} />,
      title: 'Intelligent Shift Management',
      desc: 'Empower your team with seamless shift swapping, real-time schedule visibility, and automated conflict resolution.',
    },
    {
      icon: <Users className="size-5" style={{ color: steel.blue }} />,
      title: 'Workforce Optimization',
      desc: 'Gain comprehensive oversight of team availability, attendance patterns, and staffing requirements at a glance.',
    },
    {
      icon: <Zap className="size-5" style={{ color: steel.cyan }} />,
      title: 'Predictive Analytics',
      desc: 'Leverage machine learning to forecast attendance trends, identify risk factors, and make data-driven scheduling decisions.',
    },
  ];

  const inputClasses =
    'w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200 placeholder:text-[#5a7080]';

  const inputStyle = {
    background: steel.inputBg,
    border: `1px solid ${steel.border}`,
    color: steel.text,
    backdropFilter: 'blur(8px)',
  };

  const inputFocusHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = steel.tealBorder;
    e.target.style.boxShadow = `0 0 0 3px ${steel.tealGlow}, 0 0 20px ${steel.tealShadow}`;
  };

  const inputBlurHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = steel.border;
    e.target.style.boxShadow = 'none';
  };

  return (
    <div
      className="min-h-screen w-full flex"
      style={{ background: steel.darkest, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
    >
      {/* ═══════════════ Left Panel ═══════════════ */}
      <div
        className="hidden lg:flex lg:w-[52%] p-14 flex-col justify-between relative overflow-hidden"
        style={{
          background: `linear-gradient(160deg, ${steel.darker} 0%, ${steel.darkest} 50%, #0c1015 100%)`,
        }}
      >
        {/* Ambient glow effects */}
        <div
          className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${steel.tealGlow} 0%, transparent 70%)`,
            transform: 'translate(30%, -30%)',
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${steel.blueGlow} 0%, transparent 70%)`,
            transform: 'translate(-30%, 30%)',
          }}
        />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(45,212,191,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(45,212,191,0.5) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />

        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <div
              className="p-2.5 rounded-xl"
              style={{
                background: `linear-gradient(135deg, ${steel.tealDark}, ${steel.teal})`,
                boxShadow: `0 0 24px ${steel.tealShadow}, 0 4px 12px rgba(0,0,0,0.3)`,
              }}
            >
              <Calendar className="size-6 text-white" />
            </div>
            <div>
              <h1
                className="text-2xl font-bold tracking-tight"
                style={{
                  background: `linear-gradient(135deg, #ffffff 0%, ${steel.text} 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '-0.02em',
                }}
              >
                ShiftSyncs
              </h1>
            </div>
          </div>

          {/* Hero text */}
          <div className="space-y-6 max-w-lg">
            <h2
              className="text-[2.75rem] leading-[1.15] font-bold"
              style={{
                color: '#ffffff',
                letterSpacing: '-0.03em',
              }}
            >
              Precision workforce
              <br />
              <span
                style={{
                  background: `linear-gradient(90deg, ${steel.teal}, ${steel.blue})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                management
              </span>
              , delivered.
            </h2>
            <p
              className="text-base leading-relaxed max-w-md"
              style={{ color: steel.textMuted }}
            >
              A comprehensive platform designed for businesses that demand reliable
              scheduling, actionable workforce insights, and the operational clarity
              to scale with confidence.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-5 mt-14">
            {featureItems.map(({ icon, title, desc }) => (
              <div
                key={title}
                className="flex items-start gap-4 p-4 rounded-2xl transition-all duration-300"
                style={{
                  background: steel.cardBg,
                  border: `1px solid ${steel.borderLight}`,
                  backdropFilter: 'blur(12px)',
                }}
              >
                <div
                  className="p-2.5 rounded-xl flex-shrink-0 mt-0.5"
                  style={{
                    background: 'rgba(45, 212, 191, 0.06)',
                    border: `1px solid ${steel.borderLight}`,
                  }}
                >
                  {icon}
                </div>
                <div>
                  <h3 className="font-semibold text-[15px] mb-1" style={{ color: '#e8eef2' }}>
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: steel.textMuted }}>
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <div
            className="mb-5"
            style={{
              height: '1px',
              background: `linear-gradient(90deg, transparent, ${steel.tealBorder}, transparent)`,
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: steel.textMuted }}>
              © 2026 ShiftSyncs. All rights reserved.
            </p>
            <div className="flex items-center gap-1.5">
              <Shield className="size-3.5" style={{ color: steel.tealDark }} />
              <span className="text-xs font-medium" style={{ color: steel.textMuted }}>
                Enterprise-grade security
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ Right Panel ═══════════════ */}
      <div
        className="w-full lg:w-[48%] flex items-center justify-center p-8 relative"
        style={{
          background: `linear-gradient(180deg, ${steel.darker} 0%, ${steel.darkest} 100%)`,
        }}
      >
        {/* Subtle top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, transparent, ${steel.teal}, ${steel.blue}, transparent)`,
            opacity: 0.5,
          }}
        />

        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10 justify-center">
            <div
              className="p-2 rounded-xl"
              style={{
                background: `linear-gradient(135deg, ${steel.tealDark}, ${steel.teal})`,
                boxShadow: `0 0 20px ${steel.tealShadow}`,
              }}
            >
              <Calendar className="size-5 text-white" />
            </div>
            <h1 className="text-xl font-bold" style={{ color: '#ffffff', letterSpacing: '-0.02em' }}>
              ShiftSyncs
            </h1>
          </div>

          {/* Card */}
          <div
            className="rounded-3xl p-8"
            style={{
              background: steel.cardBg,
              border: `1px solid ${steel.border}`,
              backdropFilter: 'blur(16px)',
              boxShadow: `0 4px 40px rgba(0,0,0,0.25), 0 0 80px ${steel.tealShadow}`,
            }}
          >
            {/* Tabs */}
            <div
              className="flex gap-1.5 mb-8 p-1 rounded-xl"
              style={{ background: 'rgba(15, 20, 25, 0.5)', border: `1px solid ${steel.borderLight}` }}
            >
              <button
                onClick={() => { setIsSignUp(true); setError(''); clearFields(); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
                style={
                  isSignUp
                    ? {
                        background: `linear-gradient(135deg, ${steel.tealDark}, ${steel.teal})`,
                        color: '#ffffff',
                        boxShadow: `0 2px 12px ${steel.tealShadow}`,
                      }
                    : { color: steel.textMuted, background: 'transparent' }
                }
              >
                <UserPlus className="size-4" />
                Create Account
              </button>
              <button
                onClick={() => { setIsSignUp(false); setError(''); clearFields(); }}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
                style={
                  !isSignUp
                    ? {
                        background: `linear-gradient(135deg, ${steel.tealDark}, ${steel.teal})`,
                        color: '#ffffff',
                        boxShadow: `0 2px 12px ${steel.tealShadow}`,
                      }
                    : { color: steel.textMuted, background: 'transparent' }
                }
              >
                <LogIn className="size-4" />
                Sign In
              </button>
            </div>

            {/* Header text */}
            <h2
              className="text-xl font-bold mb-1.5"
              style={{ color: '#ffffff', letterSpacing: '-0.01em' }}
            >
              {isSignUp ? 'Get started with ShiftSyncs' : 'Welcome back'}
            </h2>
            <p className="text-sm mb-7" style={{ color: steel.textMuted }}>
              {isSignUp
                ? 'Set up your business account and begin optimizing your workforce today.'
                : 'Sign in to access your dashboard and manage your team.'}
            </p>

            {/* Error */}
            {error && (
              <div
                className="text-sm p-3.5 rounded-xl mb-5 flex items-center gap-2.5"
                style={{
                  background: steel.errorBg,
                  border: `1px solid rgba(248, 113, 113, 0.15)`,
                  color: steel.error,
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: steel.error }} />
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: steel.lighter }}>
                      Business Name
                    </label>
                    <input
                      type="text"
                      autoComplete="organization"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className={inputClasses}
                      style={inputStyle}
                      onFocus={inputFocusHandler}
                      onBlur={inputBlurHandler}
                      placeholder="Enter your business name"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: steel.lighter }}>
                      Business Address
                    </label>
                    <input
                      type="text"
                      autoComplete="off"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className={inputClasses}
                      style={inputStyle}
                      onFocus={inputFocusHandler}
                      onBlur={inputBlurHandler}
                      placeholder="Street address, city, state"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: steel.lighter }}>
                      Industry
                    </label>
                    <select
                      autoComplete="off"
                      value={businessTypeId}
                      onChange={(e) => setBusinessTypeId(e.target.value)}
                      className={`${inputClasses} cursor-pointer`}
                      style={inputStyle}
                      onFocus={inputFocusHandler as any}
                      onBlur={inputBlurHandler as any}
                    >
                      <option value="">Select your industry</option>
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
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: steel.lighter }}>
                  Username
                </label>
                <input
                  type="text"
                  autoComplete={isSignUp ? 'off' : 'username'}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputClasses}
                  style={inputStyle}
                  onFocus={inputFocusHandler}
                  onBlur={inputBlurHandler}
                  placeholder="Choose a username"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: steel.lighter }}>
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClasses} pr-11`}
                    style={inputStyle}
                    onFocus={inputFocusHandler}
                    onBlur={inputBlurHandler}
                    placeholder={isSignUp ? 'Create a secure password' : 'Enter your password'}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: steel.lighter }}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {isSignUp && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: steel.lighter }}>
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`${inputClasses} pr-11`}
                      style={inputStyle}
                      onFocus={inputFocusHandler}
                      onBlur={inputBlurHandler}
                      placeholder="Re-enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: steel.lighter }}
                    >
                      {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
              )}

              {!isSignUp && (
                <div className="flex items-center justify-between text-sm pt-1">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      className="rounded"
                      style={{ accentColor: steel.teal }}
                    />
                    <span style={{ color: steel.textMuted }} className="text-xs">
                      Keep me signed in
                    </span>
                  </label>
                  <a
                    href="#"
                    className="text-xs font-medium transition-opacity hover:opacity-80"
                    style={{ color: steel.teal }}
                  >
                    Forgot password?
                  </a>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl text-sm font-bold transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                style={{
                  background: `linear-gradient(135deg, ${steel.tealDark}, ${steel.teal})`,
                  color: '#ffffff',
                  boxShadow: `0 4px 24px ${steel.tealShadow}, 0 2px 8px rgba(0,0,0,0.2)`,
                  letterSpacing: '0.02em',
                }}
              >
                {loading ? (
                  'Processing…'
                ) : (
                  <>
                    {isSignUp ? 'Create Your Account' : 'Sign In to Dashboard'}
                    <ChevronRight className="size-4" />
                  </>
                )}
              </button>

              {isSignUp && (
                <p className="text-[11px] text-center leading-relaxed pt-1" style={{ color: steel.textMuted }}>
                  By creating an account, you agree to our{' '}
                  <a href="#" style={{ color: steel.teal }} className="hover:opacity-80">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="#" style={{ color: steel.teal }} className="hover:opacity-80">
                    Privacy Policy
                  </a>
                  .
                </p>
              )}
            </form>
          </div>

          {/* Bottom trust indicator */}
          <div className="flex items-center justify-center mt-8">
            <div className="flex items-center gap-1.5">
              <Shield className="size-3" style={{ color: steel.lighter }} />
              <span className="text-[11px] font-medium" style={{ color: steel.textMuted }}>
                End-to-end encryption
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}