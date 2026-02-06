import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';

export default function Login() {
  const navigate = useNavigate();
  const [agentId, setAgentId] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await authService.login(agentId.trim(), pin);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page relative min-h-dvh flex items-center justify-center bg-gradient-to-br from-[#0f1419] via-[#1a1f2a] to-[#2c3e50] font-sans p-4 overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(15,20,25,0.9)_0%,rgba(121,213,233,0.15)_20%,rgba(26,31,42,0.95)_40%,rgba(77,174,172,0.1)_60%,rgba(44,62,80,0.9)_80%,rgba(121,213,233,0.1)_100%)] bg-[length:300%_300%] animate-gradient-shift" />

      {/* Radial overlay for depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,rgba(121,213,233,0.12)_0%,transparent_40%),radial-gradient(ellipse_at_70%_60%,rgba(77,174,172,0.08)_0%,transparent_50%)] animate-gradient-pulse pointer-events-none z-[1]" />

      {/* Floating accent blob */}
      <div className="absolute top-[20%] right-[15%] w-[clamp(200px,30vw,300px)] h-[clamp(200px,30vw,300px)] bg-[radial-gradient(circle,rgba(121,213,233,0.1)_0%,rgba(121,213,233,0.05)_50%,transparent_100%)] rounded-full blur-[40px] animate-gentle-float pointer-events-none z-[3] max-sm:hidden" />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-[400px] md:max-w-[440px] lg:max-w-[480px]">
        <div className="bg-[rgba(26,31,42,0.95)] backdrop-blur-xl border-2 border-brand-300/30 rounded-2xl p-8 lg:p-10 shadow-[0_25px_50px_rgba(0,0,0,0.5),0_0_40px_rgba(121,213,233,0.1)] transition-shadow duration-300 hover:shadow-[0_25px_50px_rgba(0,0,0,0.5),0_0_60px_rgba(121,213,233,0.15)]">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <img
                src="/logos/splitfinrow.png"
                alt="Splitfin"
                className="h-[clamp(2.5rem,8vw,3rem)] w-auto object-contain brightness-110 drop-shadow-[0_4px_8px_rgba(121,213,233,0.3)] transition-transform duration-300 hover:scale-105"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground font-medium opacity-90">
              Access your dashboard
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-1">
            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-medium mb-4 backdrop-blur-sm animate-error-slide-in">
                <span className="text-xl shrink-0">&#9888;&#65039;</span>
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-col gap-2 mb-4">
              <label htmlFor="agentId" className="text-xs font-semibold text-white pl-1">
                Agent ID
              </label>
              <input
                id="agentId"
                type="text"
                placeholder="Enter your agent ID"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full px-5 py-3 border-2 border-transparent rounded-xl text-sm font-medium bg-input text-foreground placeholder-muted-foreground outline-none transition-all duration-300 shadow-md min-h-[48px] focus:border-primary focus:bg-muted focus:shadow-[0_0_0_3px_rgba(121,213,233,0.1),0_8px_25px_rgba(0,0,0,0.15)] focus:-translate-y-0.5 disabled:bg-muted/50 disabled:text-muted-foreground disabled:cursor-not-allowed md:text-base"
                required
                disabled={loading}
                autoComplete="username"
              />
            </div>

            <div className="flex flex-col gap-2 mb-4">
              <label htmlFor="pin" className="text-xs font-semibold text-white pl-1">
                PIN
              </label>
              <input
                id="pin"
                type="password"
                placeholder="Enter your PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full px-5 py-3 border-2 border-transparent rounded-xl text-sm font-medium bg-input text-foreground placeholder-muted-foreground outline-none transition-all duration-300 shadow-md min-h-[48px] focus:border-primary focus:bg-muted focus:shadow-[0_0_0_3px_rgba(121,213,233,0.1),0_8px_25px_rgba(0,0,0,0.15)] focus:-translate-y-0.5 disabled:bg-muted/50 disabled:text-muted-foreground disabled:cursor-not-allowed md:text-base"
                required
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="flex items-center justify-center gap-2 w-full px-6 py-3.5 mt-4 bg-gradient-to-br from-brand-300 to-brand-400 text-[#0f1419] border-none rounded-xl text-sm font-bold cursor-pointer transition-all duration-300 shadow-[0_8px_25px_rgba(121,213,233,0.15)] min-h-[48px] relative overflow-hidden hover:-translate-y-0.5 hover:shadow-[0_15px_35px_rgba(121,213,233,0.3)] hover:from-brand-400 hover:to-brand-300 active:-translate-y-px disabled:cursor-not-allowed disabled:opacity-80 disabled:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-brand-300 focus-visible:outline-offset-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <svg className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Need help? Contact your administrator for assistance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
