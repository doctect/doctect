
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Layers, LayoutTemplate, Link as LinkIcon, Download, MousePointer2, Github } from 'lucide-react';

export const LandingPage: React.FC = () => {
  return (
    <div className="h-screen w-full bg-slate-50 text-slate-900 overflow-y-auto font-sans relative selection:bg-blue-100 selection:text-blue-900">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.08),transparent_60%)]"></div>
        <div className="absolute top-[10%] right-[5%] w-96 h-96 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-pulse-slow"></div>
        <div className="absolute top-[20%] left-[5%] w-72 h-72 bg-indigo-100 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
        
        {/* Animated Grid Lines */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.02]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 font-bold text-xl text-slate-800">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20 transform hover:rotate-6 transition-transform">
            <Layers size={20} />
          </div>
          <span className="tracking-tight">PDF Architect</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="https://github.com/doctect/doctect" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-900 transition-colors" title="View Source on GitHub">
             <Github size={20} />
          </a>
          <Link to="/docs" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">Documentation</Link>
          <Link to="/app" className="bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 hover:shadow-slate-900/20 hover:-translate-y-0.5">
            Launch App
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-32">
        <div className="text-center max-w-4xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold uppercase tracking-wider mb-8 animate-fade-in-up">
            v1.0 Beta Release
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 mb-8 leading-[1.1] animate-fade-in-up delay-100">
            Design Complex <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Interlinked Documents</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed animate-fade-in-up delay-200">
            A visual builder for creating hierarchical, hyperlinked PDF planners, notebooks, and reports. 
            Define your structure once, apply templates, and generate massive PDFs in seconds.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up delay-300">
            <Link to="/app" className="group flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20 hover:shadow-blue-600/30 hover:-translate-y-1">
              Start Building Now
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/docs" className="flex items-center gap-2 px-8 py-4 rounded-xl text-lg font-semibold text-slate-600 hover:bg-white hover:text-slate-900 transition-all border border-transparent hover:border-slate-200 hover:shadow-lg">
              Read the Docs
            </Link>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24 animate-fade-in-up delay-500">
          <FeatureCard 
            icon={<LayoutTemplate className="text-blue-600" />}
            title="Template Based"
            desc="Create a layout once (like a Day View or Monthly Grid) and apply it to hundreds of nodes instantly."
          />
          <FeatureCard 
            icon={<LinkIcon className="text-indigo-600" />}
            title="Smart Linking"
            desc="Context-aware linking means a 'Back' button on a template always knows where to go, without manual wiring."
          />
          <FeatureCard 
            icon={<Download className="text-emerald-600" />}
            title="Instant Export"
            desc="Generates optimized, high-performance PDFs compatible with GoodNotes, Notability, and E-Ink tablets."
          />
        </div>

        {/* Interactive Preview / Mockup Area */}
        <div className="mt-32 relative rounded-2xl border bg-white/60 backdrop-blur-xl shadow-2xl overflow-hidden animate-fade-in-up delay-700 ring-1 ring-slate-200">
           <div className="absolute top-0 left-0 right-0 h-12 bg-white/80 border-b flex items-center px-4 gap-2 backdrop-blur">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-slate-200"></div>
                <div className="w-3 h-3 rounded-full bg-slate-200"></div>
                <div className="w-3 h-3 rounded-full bg-slate-200"></div>
              </div>
              <div className="ml-4 px-3 py-1 bg-slate-100 rounded-md text-xs text-slate-500 font-mono flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400"></div>
                My_Planner_2025.pdf
              </div>
           </div>
           
           <div className="pt-20 pb-16 px-8 md:px-16 bg-slate-50/50 flex justify-center items-center min-h-[500px]">
               <div className="relative w-full max-w-4xl aspect-[16/10] bg-white rounded-lg shadow-xl border border-slate-200 p-8 flex gap-8 transform hover:scale-[1.01] transition-transform duration-500">
                  {/* Mock UI Sidebar */}
                  <div className="w-56 border-r border-dashed border-slate-200 pr-6 hidden md:block">
                     <div className="h-4 w-32 bg-slate-200 rounded mb-6"></div>
                     <div className="space-y-3">
                        <div className="h-8 w-full bg-blue-50 border border-blue-100 rounded flex items-center px-3">
                            <div className="w-20 h-3 bg-blue-200 rounded"></div>
                        </div>
                        <div className="h-8 w-full flex items-center px-3">
                            <div className="w-24 h-3 bg-slate-100 rounded"></div>
                        </div>
                        <div className="h-8 w-full flex items-center px-3 pl-6">
                            <div className="w-16 h-3 bg-slate-100 rounded"></div>
                        </div>
                        <div className="h-8 w-full flex items-center px-3 pl-6">
                            <div className="w-16 h-3 bg-slate-100 rounded"></div>
                        </div>
                     </div>
                  </div>
                  
                  {/* Mock UI Canvas */}
                  <div className="flex-1 flex flex-col">
                      <div className="flex justify-between mb-8 items-end">
                         <div className="space-y-2">
                            <div className="h-8 w-64 bg-slate-800 rounded"></div>
                            <div className="h-4 w-32 bg-slate-300 rounded"></div>
                         </div>
                         <div className="h-8 w-24 bg-blue-100 rounded"></div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mb-8">
                         {[1,2,3].map(i => (
                             <div key={i} className="aspect-square bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center">
                                <div className="w-8 h-8 rounded bg-slate-200"></div>
                             </div>
                         ))}
                      </div>
                      <div className="flex-1 bg-slate-50 rounded-lg border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2">
                          <Grid3X3 size={24} className="opacity-20" />
                          <span className="font-mono text-xs">Dynamic Grid Area</span>
                      </div>
                  </div>
                  
                  {/* Floating Elements */}
                  <div className="absolute -right-12 top-24 bg-white p-4 rounded-xl shadow-2xl border border-slate-100 w-56 animate-float">
                      <div className="flex items-center gap-2 mb-3 border-b pb-2">
                          <MousePointer2 size={14} className="text-blue-500" />
                          <span className="text-xs font-bold text-slate-700">Element Properties</span>
                      </div>
                      <div className="space-y-3">
                          <div className="flex justify-between">
                             <div className="h-2 w-8 bg-slate-200 rounded"></div>
                             <div className="h-2 w-12 bg-slate-200 rounded"></div>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded"></div>
                          <div className="flex gap-2">
                              <div className="h-6 flex-1 bg-blue-50 rounded border border-blue-100"></div>
                              <div className="h-6 w-12 bg-slate-50 rounded"></div>
                          </div>
                      </div>
                  </div>
               </div>
           </div>
        </div>

      </main>

      <footer className="bg-white border-t border-slate-200 py-12 px-6">
         <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-center items-center gap-6">
            <div className="text-slate-500 text-sm">
               © 2025 PDF Architect. Built for the modern paperless era.
            </div>
         </div>
      </footer>
    </div>
  );
};

const FeatureCard: React.FC<{ icon: React.ReactNode, title: string, desc: string }> = ({ icon, title, desc }) => (
  <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-6">
      {icon}
    </div>
    <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
    <p className="text-slate-500 leading-relaxed">{desc}</p>
  </div>
);

// Helper component for mockup
const Grid3X3: React.FC<{size?:number, className?:string}> = ({size=24, className}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>
);
