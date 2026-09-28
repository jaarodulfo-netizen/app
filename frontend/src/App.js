import { useEffect } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Lenis from 'lenis';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SecurityProvider } from '@/context/SecurityContext';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import Login from '@/pages/Login';
import ChangePassword from '@/pages/ChangePassword';
import Dashboard from '@/pages/Dashboard';
import FloorMap from '@/pages/FloorMap';
import LiveFeeds from '@/pages/LiveFeeds';
import Employees from '@/pages/Employees';
import Devices from '@/pages/Devices';
import Events from '@/pages/Events';
import Officers from '@/pages/Officers';
import Attendance from '@/pages/Attendance';

function BootScreen() {
    return (
        <div className="min-h-screen bg-[#050811] flex flex-col items-center justify-center gap-4" data-testid="boot-screen">
            <Loader2 className="animate-spin text-sky-400" size={30} />
            <p className="mono text-[10px] tracking-[0.35em] text-slate-600">ESTABLISHING SECURE SESSION…</p>
        </div>
    );
}

function Console() {
    useEffect(() => {
        const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
        let raf;
        const loop = (t) => {
            lenis.raf(t);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => {
            cancelAnimationFrame(raf);
            lenis.destroy();
        };
    }, []);

    return (
        <SecurityProvider>
            <div className="min-h-screen bg-[#050811]">
                <div className="pointer-events-none fixed inset-0 z-0">
                    <div className="absolute -top-44 left-1/4 h-[480px] w-[480px] rounded-full bg-blue-700/10 blur-[140px]" />
                    <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-cyan-500/[0.07] blur-[140px]" />
                    <div className="absolute top-1/3 right-1/4 h-[360px] w-[360px] rounded-full bg-[#ea7f2b]/[0.05] blur-[130px]" />
                </div>
                <Sidebar />
                <div className="relative z-10 lg:pl-64">
                    <Topbar />
                    <main className="px-5 sm:px-8 py-8 max-w-[1600px] mx-auto w-full">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/map" element={<FloorMap />} />
                            <Route path="/feeds" element={<LiveFeeds />} />
                            <Route path="/employees" element={<Employees />} />
                            <Route path="/devices" element={<Devices />} />
                            <Route path="/events" element={<Events />} />
                            <Route path="/attendance" element={<Attendance />} />
                            <Route path="/officers" element={<Officers />} />
                        </Routes>
                    </main>
                </div>
            </div>
        </SecurityProvider>
    );
}

function Gate() {
    const { user } = useAuth();
    if (user === undefined) return <BootScreen />;
    if (!user) return <Login />;
    if (user.must_change_password) return <ChangePassword />;
    return <Console />;
}

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Gate />
                <Toaster
                    theme="dark"
                    position="bottom-right"
                    toastOptions={{
                        style: {
                            background: '#0b1220',
                            border: '1px solid rgba(56,189,248,0.25)',
                            color: '#e2e8f0',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '12px',
                        },
                    }}
                />
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
