import { useEffect } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Lenis from 'lenis';
import { Toaster } from 'sonner';
import { SecurityProvider } from '@/context/SecurityContext';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import Dashboard from '@/pages/Dashboard';
import FloorMap from '@/pages/FloorMap';
import LiveFeeds from '@/pages/LiveFeeds';
import Employees from '@/pages/Employees';
import Devices from '@/pages/Devices';
import Events from '@/pages/Events';

function App() {
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
        <BrowserRouter>
            <SecurityProvider>
                <div className="min-h-screen bg-[#050811]">
                    <div className="pointer-events-none fixed inset-0 z-0">
                        <div className="absolute -top-44 left-1/4 h-[480px] w-[480px] rounded-full bg-blue-700/10 blur-[140px]" />
                        <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-cyan-500/[0.07] blur-[140px]" />
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
                            </Routes>
                        </main>
                    </div>
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
                </div>
            </SecurityProvider>
        </BrowserRouter>
    );
}

export default App;
