import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import Loader from '../components/Loader';
import { api } from '../services/api.ts';

type ViewState = 'login' | 'forgot_user' | 'forgot_pass' | 'reset_password_step';

interface LoginProps {
  onSwitch: () => void;
  onBackToHome: () => void;
}

const Login: React.FC<LoginProps> = ({ onSwitch, onBackToHome }) => {
  const [view, setView] = useState<ViewState>('login');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error } = useAuth();

  // Recovery States
  const [recoveryName, setRecoveryName] = useState('');
  const [recoveryMobile, setRecoveryMobile] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [foundUserId, setFoundUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isRecovering, setIsRecovering] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userId.trim() && password.trim()) {
      try {
        await login(userId.trim(), password.trim());
      } catch (err) {
        // Handled in AuthContext
      }
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    setRecoverySuccess(null);
    setIsRecovering(true);

    try {
      const response = await api.post('/auth/recover-identity', {
        username: recoveryName.trim(),
        mobile_no: recoveryMobile.trim(),
        email_id: recoveryEmail.trim()
      });

      if (view === 'forgot_user') {
        setRecoverySuccess(`Account found! Your User ID is: ${response.user_id}`);
        setFoundUserId(response.user_id);
      } else {
        setFoundUserId(response.user_id);
        setView('reset_password_step');
      }
    } catch (err: any) {
      setRecoveryError(err.message || 'We could not find an account with those details. Please check and try again.');
    } finally {
      setIsRecovering(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);
    setIsRecovering(true);

    try {
      await api.post('/auth/reset-password-recovery', {
        user_id: foundUserId,
        new_password: newPassword,
        username: recoveryName.trim(),
        mobile_no: recoveryMobile.trim(),
        email_id: recoveryEmail.trim()
      });
      setRecoverySuccess('Password changed successfully! You can now sign in.');
      setTimeout(() => setView('login'), 1800);
    } catch (err: any) {
      setRecoveryError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setIsRecovering(false);
    }
  };

  if (isLoading) return <Loader />;

  return (
    <div className="h-screen max-h-screen w-full overflow-hidden flex items-center justify-center p-3 sm:p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none">
      
      {/* Decorative background glows */}
      <div className="fixed top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-indigo-500/10 dark:bg-indigo-500/15 blur-3xl pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-80 h-80 rounded-full bg-violet-500/10 dark:bg-violet-500/15 blur-3xl pointer-events-none" />

      {/* Main Glassmorphic Card - Sized to fit screen with zero scrolling */}
      <div className="relative w-full max-w-[420px] rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-[0_20px_50px_rgba(15,23,42,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Top Navigation Row */}
        <div className="flex items-center justify-between mb-5">
          <button 
            type="button"
            onClick={view === 'login' ? onBackToHome : () => setView('login')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>{view === 'login' ? 'Back to Home' : 'Back to Sign In'}</span>
          </button>

          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
            Clientify
          </span>
        </div>

        {/* Card Header with Logo & Clear Titles */}
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-bold shadow-md shadow-indigo-500/20 overflow-hidden relative border border-indigo-400/30 shrink-0">
            <img 
              src="/icon.png" 
              alt="Clientify Logo" 
              className="relative z-10 h-full w-full object-cover rounded-2xl" 
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.dataset.triedIcon) {
                  target.dataset.triedIcon = 'true';
                  target.src = '/icon.svg';
                } else {
                  target.style.display = 'none';
                }
              }}
            />
            <span className="absolute z-0 text-xl font-black text-white">C</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {view === 'login' && 'Sign In'}
            {view === 'forgot_user' && 'Find Your User ID'}
            {view === 'forgot_pass' && 'Reset Password'}
            {view === 'reset_password_step' && 'Set New Password'}
          </h2>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {view === 'login' && 'Enter your User ID and password to access your workspace.'}
            {view === 'forgot_user' && 'Enter your details below to find your account ID.'}
            {view === 'forgot_pass' && 'Enter your registered details to reset your password.'}
            {view === 'reset_password_step' && 'Choose a new password for your account.'}
          </p>
        </div>

        {/* Status Messages */}
        {(error || recoveryError) && (
          <div className="mb-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 p-3 text-xs font-medium text-rose-600 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800 text-center">
            {error || recoveryError}
          </div>
        )}

        {recoverySuccess && (
          <div className="mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 p-3 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800 text-center">
            {recoverySuccess}
          </div>
        )}

        {/* View 1: Main Login Form */}
        {view === 'login' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  User ID
                </label>
                <button 
                  type="button" 
                  onClick={() => setView('forgot_user')} 
                  className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Forgot ID?
                </button>
              </div>
              <input
                type="text"
                required
                autoFocus
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                placeholder="Enter your User ID"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <button 
                  type="button" 
                  onClick={() => setView('forgot_pass')} 
                  className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 pr-10 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 10z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] py-2.5 sm:py-3 text-sm font-semibold text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer mt-2"
            >
              Sign In
            </button>
          </form>
        )}

        {/* View 2 & 3: Recovery Forms (Forgot ID / Forgot Password) */}
        {(view === 'forgot_user' || view === 'forgot_pass') && (
          <form onSubmit={handleRecovery} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Full Name
              </label>
              <input 
                type="text" 
                required 
                autoFocus 
                value={recoveryName} 
                onChange={(e) => setRecoveryName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mobile Number
              </label>
              <input 
                type="tel" 
                required 
                value={recoveryMobile} 
                onChange={(e) => setRecoveryMobile(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium" 
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Address
              </label>
              <input 
                type="email" 
                required 
                value={recoveryEmail} 
                onChange={(e) => setRecoveryEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium lowercase" 
              />
            </div>
            <button 
              type="submit" 
              disabled={isRecovering} 
              className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] py-2.5 sm:py-3 text-sm font-semibold text-white transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer mt-1"
            >
              {isRecovering ? 'Checking Details...' : 'Find Account'}
            </button>
          </form>
        )}

        {/* View 4: Set New Password */}
        {view === 'reset_password_step' && (
          <form onSubmit={handlePasswordReset} className="space-y-3.5">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl border border-indigo-200/80 dark:border-indigo-800/80 text-center">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Account Verified For</p>
              <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{foundUserId}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                New Password
              </label>
              <input 
                type="password" 
                required 
                autoFocus 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium" 
                placeholder="Enter new password" 
              />
            </div>
            <button 
              type="submit" 
              disabled={isRecovering} 
              className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] py-2.5 sm:py-3 text-sm font-semibold text-white transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
            >
              {isRecovering ? 'Saving Password...' : 'Save New Password'}
            </button>
          </form>
        )}

        {/* Bottom Switcher */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {view === 'login' ? (
              <>
                New to Clientify?{' '}
                <button 
                  type="button"
                  onClick={onSwitch} 
                  className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Create an Account
                </button>
              </>
            ) : (
              <button 
                type="button"
                onClick={() => setView('login')} 
                className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Return to Sign In
              </button>
            )}
          </p>
        </div>

      </div>
    </div>
  );
};

export default Login;
