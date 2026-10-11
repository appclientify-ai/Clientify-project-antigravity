import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import Loader from '../components/Loader';

interface SignupProps {
  onSwitch: () => void;
  onBackToHome: () => void;
}

const Signup: React.FC<SignupProps> = ({ onSwitch, onBackToHome }) => {
  const [formData, setFormData] = useState({
    username: '',
    mobile_no: '',
    email_id: '',
    firm_name: '',
    gstn: '',
    user_id: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const { signup, isLoading, error } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    
    try {
      await signup(formData);
    } catch (err) {
      // Handled in AuthContext
    }
  };

  if (isLoading) return <Loader />;

  return (
    <div className="h-screen max-h-screen w-full overflow-hidden flex items-center justify-center p-3 sm:p-4 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none">
      
      {/* Decorative background glows */}
      <div className="fixed top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-indigo-500/10 dark:bg-indigo-500/15 blur-3xl pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-80 h-80 rounded-full bg-violet-500/10 dark:bg-violet-500/15 blur-3xl pointer-events-none" />

      {/* Main Glassmorphic Card - Fits entire viewport with no scroll */}
      <div className="relative w-full max-w-xl rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-[0_20px_50px_rgba(15,23,42,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] p-5 sm:p-7 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Top Navigation Row */}
        <div className="flex items-center justify-between mb-4">
          <button 
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Home</span>
          </button>

          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
            Clientify
          </span>
        </div>

        {/* Card Header */}
        <div className="text-center mb-4">
          <div className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-bold shadow-md shadow-indigo-500/20 overflow-hidden relative border border-indigo-400/30 shrink-0">
            <img 
              src="/icon.png" 
              alt="Clientify Logo" 
              className="relative z-10 h-full w-full object-cover rounded-full" 
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
            Create Your Account
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Set up your office practice in less than a minute.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 p-2.5 text-xs font-medium text-rose-600 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800 text-center">
            {error}
          </div>
        )}

        {/* 2-Column Compact Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            
            {/* Field 1: Full Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Full Name
              </label>
              <input 
                type="text" 
                name="username" 
                required 
                value={formData.username} 
                onChange={handleChange} 
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium" 
              />
            </div>

            {/* Field 2: Mobile Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Mobile Number
              </label>
              <input 
                type="tel" 
                name="mobile_no" 
                required 
                value={formData.mobile_no} 
                onChange={handleChange} 
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium" 
              />
            </div>

            {/* Field 3: Email Address */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Address
              </label>
              <input 
                type="email" 
                name="email_id" 
                required 
                value={formData.email_id} 
                onChange={handleChange} 
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium lowercase" 
              />
            </div>

            {/* Field 4: Firm Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Firm / Office Name
              </label>
              <input 
                type="text" 
                name="firm_name" 
                value={formData.firm_name} 
                onChange={handleChange} 
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium" 
              />
            </div>

            {/* Field 5: Firm GSTIN */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Firm GSTIN <span className="text-[11px] font-normal text-slate-400">(Optional)</span>
              </label>
              <input 
                type="text" 
                name="gstn" 
                value={formData.gstn} 
                onChange={handleChange} 
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium uppercase" 
              />
            </div>

            {/* Field 6: User ID */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Choose User ID
              </label>
              <input 
                type="text" 
                name="user_id" 
                required 
                value={formData.user_id} 
                onChange={handleChange} 
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium" 
              />
            </div>

            {/* Field 7: Password (Spanning across 2 columns) */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  name="password" 
                  required 
                  value={formData.password} 
                  onChange={handleChange} 
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 pr-10 text-xs sm:text-sm text-slate-900 dark:text-white focus:border-indigo-600 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium" 
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

          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] py-2.5 sm:py-3 text-sm font-semibold text-white transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer mt-1"
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        {/* Bottom Switcher */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Already have an account?{' '}
            <button 
              type="button"
              onClick={onSwitch} 
              disabled={isLoading} 
              className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              Sign In
            </button>
          </p>
        </div>

      </div>
    </div>
  );
};

export default Signup;
