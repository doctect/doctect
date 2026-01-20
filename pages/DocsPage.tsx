
import React from 'react';
import { Link } from 'react-router-dom';
import { Book, Home, Grid3X3, Layers, Settings2, Link as LinkIcon, Command, Zap, CheckCircle2, Code, Wand2, Network } from 'lucide-react';
import { HighlightedCode } from '../components/HighlightedCode';

const Section: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
   <div className="mb-12">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">{title}</h3>
      <div className="flex flex-col space-y-1">
         {children}
      </div>
   </div>
);

const NavLink: React.FC<{ id: string, children: React.ReactNode }> = ({ id, children }) => (
   <button
      onClick={() => {
         const el = document.getElementById(id);
         if (el) el.scrollIntoView({ behavior: 'smooth' });
      }}
      className="w-full text-left text-base font-medium text-slate-600 hover:text-blue-600 hover:bg-white hover:shadow-sm px-4 py-3 rounded-lg transition-all border border-transparent hover:border-slate-100"
   >
      {children}
   </button>
);

const ConceptCard: React.FC<{ title: string, desc: string }> = ({ title, desc }) => (
   <div className="bg-white border border-slate-200 p-8 rounded-2xl hover:border-blue-200 hover:shadow-md hover:-translate-y-1 transition-all group">
      <h4 className="font-bold text-slate-900 mb-3 text-xl group-hover:text-blue-600 transition-colors">{title}</h4>
      <p className="text-base text-slate-500 leading-relaxed">{desc}</p>
   </div>
);

const Shortcut: React.FC<{ k: string, desc: string }> = ({ k, desc }) => (
   <div className="bg-white border border-slate-200 p-5 rounded-xl flex flex-col items-center text-center shadow-sm">
      <code className="bg-slate-100 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-700 mb-3 border border-slate-200 min-w-[80px]">{k}</code>
      <span className="text-base text-slate-600 font-medium">{desc}</span>
   </div>
);

export const DocsPage: React.FC = () => {
   return (
      <div className="h-screen w-full bg-white text-slate-900 font-sans flex flex-col overflow-y-auto">
         <header className="h-16 border-b bg-white/90 backdrop-blur fixed top-0 w-full z-50 flex items-center justify-between px-6 shadow-sm">
            <div className="flex items-center gap-2 font-bold text-slate-800">
               <Link to="/" className="hover:opacity-70 transition-opacity flex items-center gap-2">
                  <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                     <Book size={16} />
                  </div>
                  <span>PDF Architect Docs</span>
               </Link>
            </div>
            <Link to="/app" className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
               Go to App &rarr;
            </Link>
         </header>

         <div className="flex flex-1 pt-16 max-w-7xl mx-auto w-full">
            {/* Sidebar */}
            <aside className="w-64 hidden md:block fixed top-16 h-[calc(100vh-64px)] overflow-y-auto border-r bg-slate-50/50 px-6 py-8">
               <div className="space-y-8">
                  <Section title="Getting Started">
                     <NavLink id="intro">Introduction</NavLink>
                     <NavLink id="walkthroughs">Video Walkthroughs</NavLink>
                     <NavLink id="core-concepts">Core Concepts</NavLink>
                  </Section>
                  <Section title="The Interface">
                     <NavLink id="interface">Interface Overview</NavLink>
                     <NavLink id="grids">Dynamic Grids</NavLink>
                     <NavLink id="linking">Smart Linking</NavLink>
                     <NavLink id="variants">Multi-Device Variants</NavLink>
                  </Section>
                  <Section title="Advanced Tools">
                     <NavLink id="referencing">Reference Fields</NavLink>
                     <NavLink id="json-editor">JSON Inspector</NavLink>
                     <NavLink id="hierarchy-generator">Hierarchy Scripting</NavLink>
                  </Section>
                  <Section title="Power User">
                     <NavLink id="shortcuts">Shortcuts</NavLink>
                     <NavLink id="tips">Tips & Tricks</NavLink>
                  </Section>
               </div>
            </aside>

            {/* Content */}
            <main className="flex-1 md:ml-64 p-8 md:p-16 max-w-5xl scroll-smooth">
               <div className="
                prose prose-slate max-w-none 
                prose-headings:scroll-mt-32 
                prose-headings:font-bold prose-headings:text-slate-900
                
                prose-h1:text-5xl md:prose-h1:text-6xl prose-h1:mb-10 prose-h1:tracking-tight
                
                prose-h2:text-4xl prose-h2:mt-24 prose-h2:mb-10 prose-h2:pb-6 prose-h2:border-b prose-h2:border-slate-100
                
                prose-h3:text-2xl prose-h3:mt-16 prose-h3:mb-6 prose-h3:text-slate-800 prose-h3:font-semibold
                prose-h4:text-xl prose-h4:mt-8 prose-h4:mb-4 prose-h4:text-slate-900 prose-h4:font-bold
                
                prose-p:text-lg prose-p:leading-8 prose-p:text-slate-600 prose-p:mb-8
                
                prose-ul:my-8 prose-li:text-lg prose-li:leading-8 prose-li:text-slate-600 prose-li:mb-4
                
                prose-a:text-blue-600 prose-a:no-underline hover:prose-a:text-blue-700
             ">
                  <h1 className="font-extrabold text-slate-900 mb-6">Documentation</h1>
                  <p className="text-xl md:text-2xl text-slate-500 mb-16 leading-relaxed font-light">
                     Welcome to the comprehensive guide for PDF Architect. Learn how to design complex, data-driven layouts for digital planners, notebooks, and reports.
                  </p>

                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-8 mb-20 flex gap-6 shadow-sm">
                     <div className="p-3 bg-blue-100 rounded-xl h-fit text-blue-600 flex-shrink-0"><Zap size={24} /></div>
                     <div>
                        <h3 className="font-bold text-blue-900 text-xl m-0 mb-3 !mt-0">Quick Start</h3>
                        <p className="m-0 text-blue-800 text-lg leading-relaxed">
                           Launch the app and select the <strong>"2026 Planner"</strong> preset. Click around the hierarchy sidebar to see how the "Year View" communicates with the "Month View" templates using dynamic data.
                        </p>
                     </div>
                  </div>

                  <section id="intro">
                     <h2><span className="flex items-center gap-4"><Home className="text-blue-500" size={32} /> Introduction</span></h2>
                     <p>
                        PDF Architect is different from standard design tools like Canva or InDesign. Instead of designing every single page manually, you design <strong>Templates</strong> and build a <strong>Hierarchy of Nodes</strong>.
                     </p>
                     <p>
                        This approach allows you to generate a 400-page daily planner by defining just 3 or 4 unique templates. The system automatically populates dates, titles, and—most importantly—hyperlinks between pages based on their relationship in the tree.
                     </p>
                  </section>

                  <section id="walkthroughs">
                     <h2><span className="flex items-center gap-4"><Wand2 className="text-blue-500" size={32} /> Video Walkthroughs</span></h2>
                     <p>
                        Learn by watching. We have recorded four key workflows to get you started with PDF Architect.
                     </p>

                     <div className="grid grid-cols-1 gap-12 mt-12">
                        <div className="space-y-4">
                           <h3 className="text-lg font-bold text-slate-900 border-l-4 border-blue-500 pl-4">1. New Project Creation</h3>
                           <p className="text-slate-600">
                              See how to launch the app and select the <strong>'2026 Planner'</strong> preset to start with a fully pre-configured project structure.
                           </p>
                           <div className="rounded-xl overflow-hidden shadow-lg border border-slate-200">
                              <img src="/walkthroughs/new_project_creation.webp" alt="New Project Creation Walkthrough" className="w-full h-auto" />
                           </div>
                        </div>

                        <div className="space-y-4">
                           <h3 className="text-lg font-bold text-slate-900 border-l-4 border-emerald-500 pl-4">2. Manual Document Design</h3>
                           <p className="text-slate-600">
                              Learn the basics of placing elements. <strong>Important:</strong> You must <strong>Click & Drag</strong> to create text boxes and shapes on the canvas.
                           </p>
                           <div className="rounded-xl overflow-hidden shadow-lg border border-slate-200">
                              <img src="/walkthroughs/manual_document_design.webp" alt="Manual Document Design Walkthrough" className="w-full h-auto" />
                           </div>
                        </div>

                        <div className="space-y-4">
                           <h3 className="text-lg font-bold text-slate-900 border-l-4 border-amber-500 pl-4">3. Interactive Navigation</h3>
                           <p className="text-slate-600">
                              See how to use <strong>Data Grids</strong> to create automatic navigation menus that link to child nodes.
                           </p>
                           <div className="rounded-xl overflow-hidden shadow-lg border border-slate-200">
                              <img src="/walkthroughs/interactive_navigation.webp" alt="Interactive Navigation Walkthrough" className="w-full h-auto" />
                           </div>
                        </div>
                     </div>
                  </section>

                  <section id="core-concepts">
                     <h2>Core Concepts</h2>
                     <div className="grid md:grid-cols-2 gap-8 mt-12 not-prose">
                        <ConceptCard
                           title="Nodes"
                           desc="A Node represents a specific page in your PDF (e.g., 'January 1st'). Nodes contain metadata (like dates) and an ordered list of children."
                        />
                        <ConceptCard
                           title="Templates"
                           desc="A Template defines the visual layout (text, shapes, grids). Multiple nodes can share one template to ensure consistency."
                        />
                        <ConceptCard
                           title="References"
                           desc="A special node that acts as a shortcut to another node. Useful for including the same 'Day' page inside a 'Week' view."
                        />
                        <ConceptCard
                           title="Data Binding"
                           desc="Using variables like {{title}} or {{date}} in text elements to make templates dynamic for each unique node."
                        />
                     </div>
                  </section>

                  <section id="interface">
                     <h2>The Interface</h2>
                     <p>The editor is divided into three main areas:</p>
                     <ul className="space-y-8 list-none pl-0 mt-10">
                        <li className="flex gap-6 items-start">
                           <div className="p-4 bg-slate-100 rounded-xl text-slate-600 mt-1"><Layers size={28} /></div>
                           <div>
                              <strong className="block text-slate-900 text-xl mb-3">Sidebar (Left)</strong>
                              <p className="mt-0">Switch between <strong>Hierarchy Mode</strong> and <strong>Templates Mode</strong>. In Templates Mode, use the dropdown at the top to manage <strong>Variants</strong> (e.g., A4 vs reMarkable). Hover over nodes for actions.</p>
                           </div>
                        </li>
                        <li className="flex gap-6 items-start">
                           <div className="p-4 bg-slate-100 rounded-xl text-slate-600 mt-1"><Settings2 size={28} /></div>
                           <div>
                              <strong className="block text-slate-900 text-xl mb-3">Properties Panel (Right)</strong>
                              <p className="mt-0">When a node is selected, edit its Title and Data Fields here. When an element on the canvas is selected, use this panel to change colors, fonts, links, and grid configurations.</p>
                           </div>
                        </li>
                        <li className="flex gap-6 items-start">
                           <div className="p-4 bg-slate-100 rounded-xl text-slate-600 mt-1"><Grid3X3 size={28} /></div>
                           <div>
                              <strong className="block text-slate-900 text-xl mb-3">Canvas (Center)</strong>
                              <p className="mt-0">The infinite workspace. Hold <strong>Spacebar</strong> to pan. Use <strong>Ctrl + Scroll</strong> to zoom. Objects snap to grid if the magnet icon is enabled.</p>
                           </div>
                        </li>
                     </ul>
                  </section>

                  <section id="grids">
                     <h2><span className="flex items-center gap-4"><Grid3X3 className="text-blue-500" size={32} /> Dynamic Grids</span></h2>
                     <p>The <strong>Grid Tool</strong> is the most powerful feature in the architect. It allows a template to automatically render a list of items based on the Node's children.</p>

                     <h3>Grid Source Types</h3>
                     <ul className="list-disc pl-5 space-y-4">
                        <li><strong>Current Page Children:</strong> Useful for a "Month View" that displays all 30 "Day" children contained within it.</li>
                        <li><strong>Specific Page Children:</strong> Useful for a navigation sidebar that always links to the 12 Months, regardless of which page you are currently viewing.</li>
                     </ul>

                     <h3>Creating a Calendar</h3>
                     <p>
                        To create a proper calendar where the 1st of the month starts on the correct weekday column, use <strong>Dynamic Offset</strong>.
                     </p>
                     <div className="bg-slate-50 p-8 rounded-xl border border-slate-200 font-mono text-base mt-8 text-slate-700">
                        <div className="mb-3"><span className="text-slate-400">Offset Mode:</span> <span className="text-blue-600 font-bold ml-2">Dynamic</span></div>
                        <div className="mb-3"><span className="text-slate-400">Field:</span> <span className="text-emerald-600 ml-2">"dayOfWeekNum"</span> <span className="text-slate-400 text-sm ml-2">(e.g., 0 for Sun)</span></div>
                        <div><span className="text-slate-400">Adjustment:</span> <span className="text-purple-600 font-bold ml-2">0</span></div>
                     </div>
                  </section>

                  <section id="linking">
                     <h2><span className="flex items-center gap-4"><LinkIcon className="text-blue-500" size={32} /> Context-Aware Linking</span></h2>
                     <p>
                        In a template-based system, you cannot link to a specific URL because the destination changes depending on which node is using the template. We use logical linking instead.
                     </p>
                     <div className="overflow-hidden mt-10 border rounded-xl shadow-sm">
                        <table className="w-full text-left text-base">
                           <thead className="bg-slate-50 text-slate-500 uppercase text-xs tracking-wider">
                              <tr>
                                 <th className="py-5 px-6 border-b font-semibold">Link Target</th>
                                 <th className="py-5 px-6 border-b font-semibold">Behavior</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-100 bg-white">
                              <tr>
                                 <td className="py-5 px-6 font-bold text-blue-700 whitespace-nowrap">Parent</td>
                                 <td className="py-5 px-6 text-slate-600">Navigates to the parent of the current node. Perfect for "Back" buttons.</td>
                              </tr>
                              <tr>
                                 <td className="py-5 px-6 font-bold text-blue-700 whitespace-nowrap">Child Index</td>
                                 <td className="py-5 px-6 text-slate-600">Navigates to the Nth child. (e.g., A "Month" template linking to its 1st child opens the "1st Day").</td>
                              </tr>
                              <tr>
                                 <td className="py-5 px-6 font-bold text-blue-700 whitespace-nowrap">Child Referrer</td>
                                 <td className="py-5 px-6 text-slate-600">
                                    Advanced. Used to jump to a page that contains a reference to the current page (e.g., Day -- Week).
                                 </td>
                              </tr>
                              <tr>
                                 <td className="py-5 px-6 font-bold text-blue-700 whitespace-nowrap">Specific Node</td>
                                 <td className="py-5 px-6 text-slate-600">Hard-links to a specific unique ID (e.g., "Home" or "Index").</td>
                              </tr>
                           </tbody>
                        </table>
                     </div>
                  </section>

                  <section id="variants">
                     <h2><span className="flex items-center gap-4"><Layers className="text-blue-500" size={32} /> Multi-Device Variants</span></h2>
                     <p>
                        Variants allow you to maintain multiple template sets for different device sizes (e.g., reMarkable Paper Pro, iPad, A4) while sharing a single page hierarchy.
                     </p>

                     <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 mb-8">
                        <h4 className="font-bold text-indigo-900 text-lg mb-2">Why Variants?</h4>
                        <p className="text-indigo-800 m-0">
                           Instead of duplicating your entire project to change the page size, you simply add a new Variant.
                           Your nodes (dates, titles, structure) stay the same, but the visual layout (CSS/coordinates) switches instantly.
                        </p>
                     </div>

                     <h3>Managing Variants</h3>
                     <p>
                        In the <strong>Sidebar (Templates Mode)</strong>, use the controls at the top:
                     </p>
                     <ul className="list-disc pl-5 mt-4 space-y-2 text-slate-700">
                        <li><strong>Dropdown</strong>: Switch the active variant to view/edit templates for that specific device size.</li>
                        <li><strong><Zap size={16} className="inline text-slate-400" /> Actions</strong>: Use the inline buttons to Rename, Duplicate, or Delete variants.</li>
                     </ul>

                     <h3 className="mt-8">Workflow</h3>
                     <ol className="list-decimal pl-5 mt-4 space-y-4 text-slate-700">
                        <li><strong>Design First Variant</strong>: Create your templates for your primary device (e.g., reMarkable Paper Pro).</li>
                        <li><strong>Duplicate</strong>: Click the Copy/Duplicate button on the variant. Name it "iPad A4".</li>
                        <li><strong>Resize & Reflow</strong>: Switch to the new variant. Your templates now exist as copies. Change their dimensions and move elements to fit the new screen size.</li>
                        <li><strong>Export</strong>: When you generate a PDF, it uses the currently active variant's dimensions.</li>
                     </ol>
                  </section>

                  <section id="referencing">
                     <h2><span className="flex items-center gap-4"><Network className="text-indigo-500" size={32} /> Reference Fields & Advanced Linking</span></h2>

                     <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-xl mb-8 text-indigo-900">
                        <p className="font-bold text-lg mb-2">What are References?</p>
                        <p>
                           In complex documents like Planners, you often want the same page to appear in multiple contexts.
                           For example, "January 1st" belongs to "January" (Month View), but it also belongs to "Week 1" (Week View).
                        </p>
                        <p className="mt-2">
                           Instead of duplicating the page (which would split your notes), you create a <strong>Reference Node</strong> under Week 1.
                           This Reference acts like a shortcut. It sits in the hierarchy under "Week 1" but points to the original "January 1st" node.
                        </p>
                     </div>

                     <h3>1. Linking Back to Parents (Context-Aware)</h3>
                     <p>
                        When you are viewing "January 1st", you might want a button that says "Back to Week".
                        However, "January 1st" is technically a child of "January", not "Week 1".
                        "Week 1" only contains a <em>Reference</em> to the day.
                     </p>
                     <p>
                        To solve this, we use the <strong>Child Referrer</strong> link target. This tells the system:
                        <em>"Find any node in the project that lists me (or my siblings) as a reference, and link to that parent node."</em>
                     </p>

                     <div className="my-8 border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 font-bold text-slate-700">
                           Step-by-Step: Creating a "Back to Week" Link
                        </div>
                        <div className="p-6 space-y-6">
                           <div className="flex gap-4">
                              <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">1</div>
                              <div>
                                 <h4 className="font-bold text-slate-900">Open the Template</h4>
                                 <p className="text-slate-600">Go to your <strong>Day View</strong> template. Select the text box or shape you want to use as the button (e.g., "Week View").</p>
                              </div>
                           </div>

                           <div className="flex gap-4">
                              <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">2</div>
                              <div>
                                 <h4 className="font-bold text-slate-900">Configure the Link</h4>
                                 <p className="text-slate-600">In the Properties Panel (right sidebar), find the <strong>Interaction</strong> section.</p>
                                 <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-600">
                                    <li><strong>On Click:</strong> Select <code>Child Referrer</code>.</li>
                                    <li><strong>Start Index:</strong> Set to <code>0</code>. (This means "Check my own ID").</li>
                                    <li><strong>Count:</strong> Set to <code>1</code>. (Only check once).</li>
                                 </ul>
                                 <p className="text-sm text-slate-500 mt-2 italic">
                                    Logic: "Find a node that has 'Jan 1st' as a child reference. Oh, 'Week 1' has it! Link to 'Week 1'."
                                 </p>
                              </div>
                           </div>
                        </div>
                     </div>

                     <h3>2. Displaying Referrer Text (Dynamic Titles)</h3>
                     <p>
                        Sometimes you want to display the name of that parent context. For example, on a Month view grid, you might want to label each row with "Week 1", "Week 2", etc.
                        Since the Month page doesn't inherently know about Weeks, we use a formula.
                     </p>

                     <div className="bg-slate-100 text-slate-700 border border-slate-200 p-4 rounded-lg overflow-x-auto my-4 font-mono text-sm font-bold">
                        {"{{child_referrer:StartIndex:Count:TypeFilter:FieldName}}"}
                     </div>

                     <p><strong>Formula Arguments:</strong></p>
                     <ul className="list-disc pl-5 space-y-2 mb-8 text-slate-600">
                        <li><code>StartIndex</code>: Which child of the current page to start searching from. (e.g., <code>0</code> is the first day of the month).</li>
                        <li><code>Count</code>: How many siblings to scan. Use <code>7</code> to check a full week row.</li>
                        <li><code>TypeFilter</code>: (Optional) Only match referrer parents of a specific template type (e.g., <code>week</code>).</li>
                        <li><code>FieldName</code>: The data field from the referrer parent to display (e.g., <code>title</code>).</li>
                     </ul>

                     <div className="space-y-6 mt-6">
                        <div className="border-l-4 border-blue-500 pl-4">
                           <h4 className="font-bold text-slate-900">Example: Adding Week Labels to a Month Calendar</h4>
                           <p className="text-slate-600 mb-2">
                              You have a calendar grid. You want a text box to the left of the first row that says "Week 1".
                           </p>
                           <p className="font-mono text-sm bg-slate-100 p-2 rounded text-slate-700 border border-slate-200">
                              {"{{child_referrer:0:7:week:title}}"}
                           </p>
                           <p className="text-sm text-slate-500 mt-2">
                              <strong>Translation:</strong> "Look at my first 7 children (Days 1-7). Find which 'Week' node references any of them. Display that Week's title."
                           </p>
                        </div>
                     </div>

                     <h3>3. Using References in Grids</h3>
                     <p>
                        Grids are powerful because they can render lists of References just like normal nodes. This creates a seamless navigation experience.
                     </p>
                     <div className="bg-green-50 border border-green-100 rounded-xl p-6 my-4">
                        <h4 className="font-bold text-green-900 mb-2"><Wand2 className="inline mr-2" size={20} /> Pro Tip: The Weekly Overview</h4>
                        <p className="text-green-800 mb-4">
                           To build a Weekly Overview page that shows 7 days:
                        </p>
                        <ol className="list-decimal pl-5 space-y-2 text-green-900">
                           <li>Create a <strong>"Week" Node</strong> in your hierarchy.</li>
                           <li>Add 7 children to it. Instead of creating new pages, use <strong>"Add Reference"</strong> and pick the existing Days (e.g., Jan 1 - Jan 7).</li>
                           <li>In the <strong>Week Template</strong>, add a Grid.</li>
                           <li>Set <strong>Source</strong> to "Children of Current Page".</li>
                           <li>Set <strong>Cols</strong> to 7 (or 1 for a vertical list).</li>
                           <li>In <strong>Display Field</strong>, use <code>{"{{day_name}}"}</code> or <code>{"{{title}}"}</code>.</li>
                        </ol>
                        <p className="mt-4 text-green-800 text-sm">
                           The Grid will automatically pull the data (Title, Day Name, Date) from the <em>Target Node</em> (the actual Day page) that the Reference points to.
                           When you click a grid cell, it takes you to that Day page.
                        </p>
                     </div>
                  </section>

                  <section id="json-editor">
                     <h2><span className="flex items-center gap-4"><Code className="text-blue-500" size={32} /> JSON Inspector</span></h2>
                     <p>
                        The <strong>JSON Inspector</strong> gives you low-level access to the entire application state. It is essential for debugging, bulk operations, or verifying your data structure.
                     </p>

                     <h3>Visual Mode</h3>
                     <p>
                        A tree-based interactive view of your project.
                     </p>
                     <ul className="list-disc pl-5 space-y-2">
                        <li><strong>Navigate:</strong> Click arrows to expand objects and arrays.</li>
                        <li><strong>Edit:</strong> Directly modify values (strings, numbers, booleans) by typing in the input fields. Changes are applied immediately to the internal state but require clicking "Apply Changes" to save.</li>
                        <li><strong>Add Properties:</strong> Use the "Add Property" button on objects to inject new data fields or configuration keys that might not be exposed in the UI.</li>
                     </ul>

                     <h3>Text Mode</h3>
                     <p>
                        A raw text editor for the project's JSON string.
                     </p>
                     <ul className="list-disc pl-5 space-y-2">
                        <li><strong>Bulk Edits:</strong> Copy the entire string to your favorite text editor (VS Code, Sublime) to perform complex Find & Replace operations, then paste it back.</li>
                        <li><strong>Backups:</strong> Save the text string to a local file to create a manual backup of your project.</li>
                     </ul>
                  </section>

                  <section id="hierarchy-generator">
                     <h2><span className="flex items-center gap-4"><Wand2 className="text-purple-500" size={32} /> Hierarchy Scripting</span></h2>
                     <p className="lead">
                        The Hierarchy Generator is a powerful developer tool that allows you to programmatically build your PDF structure using JavaScript.
                        Instead of manually clicking "Add Page" 365 times for a daily planner, you can write a loop.
                     </p>

                     <div className="bg-slate-50 border-l-4 border-purple-500 p-4 my-6">
                        <p className="text-slate-700 font-medium m-0">
                           <strong>Concept:</strong> You write code in two stages. First, define your <em>Visual Templates</em>. Second, define your <em>Content Tree (Nodes)</em>.
                        </p>
                     </div>

                     <h3>Stage 1: Template Definitions</h3>
                     <p>
                        The left panel is for defining the visual layout of your pages. You must return an object where keys are Template IDs.
                     </p>
                     <p><strong>Available Constants:</strong> <code>RM_PP_WIDTH</code>, <code>RM_PP_HEIGHT</code>, <code>A4_WIDTH</code>, <code>A4_HEIGHT</code>.</p>

                     <div className="not-prose bg-slate-800 text-slate-200 p-4 rounded-lg font-mono text-sm overflow-x-auto mb-6">
                        <pre><HighlightedCode code={`const t = {};

t.day_page = {
  id: 'day_page', 
  name: 'Day View', 
  width: RM_PP_WIDTH, 
  height: RM_PP_HEIGHT,
  elements: [
    // Rectangle background
    { type: 'rect', x: 0, y: 0, w: RM_PP_WIDTH, h: RM_PP_HEIGHT, fill: '#ffffff' },
    
    // Title bound to node data
    { type: 'text', x: 20, y: 40, w: 200, h: 30, text: '{{title}}', fontSize: 24 }
  ]
};

return t;`} /></pre>
                     </div>

                     <h3>Stage 2: Hierarchy Logic</h3>
                     <p>
                        The right panel is for building the tree structure. You must return an object containing <code>nodes</code> (a map of IDs to Node objects) and <code>rootId</code>.
                     </p>
                     <p><strong>Available Helpers:</strong> <code>createId(prefix)</code> generates a random unique ID.</p>
                     <p><strong>Context:</strong> The <code>templates</code> object from Stage 1 is available here to reference template IDs.</p>

                     <div className="not-prose bg-slate-800 text-slate-200 p-4 rounded-lg font-mono text-sm overflow-x-auto mb-6">
                        <pre><HighlightedCode code={`const nodes = {};
const rootId = 'root';

// 1. Define Root
nodes[rootId] = {
  id: rootId,
  parentId: null,
  type: 'cover_page', // Must match a template ID from Stage 1
  title: 'My Planner',
  data: {},
  children: []
};

// 2. Generate Children in a loop
for (let i = 1; i <= 7; i++) {
  const dayId = createId('day');
  
  nodes[dayId] = {
      id: dayId,
      parentId: rootId,
      type: 'day_page',
      title: \`Day \${i}\`,
      data: { dayNum: i }, // Custom data for templates
      children: []
    };
  
  // Link parent to child
  nodes[rootId].children.push(dayId);
}

return { nodes, rootId };`} /></pre>
                     </div>

                     <h3>Common Patterns</h3>

                     <h4>References</h4>
                     <p>
                        To include the same page in multiple places (e.g., a Day page appearing inside a Weekly View), create a <strong>Reference Node</strong>.
                     </p>
                     <div className="not-prose bg-slate-800 text-slate-200 p-4 rounded-lg font-mono text-sm overflow-x-auto mb-6">
                        <pre><HighlightedCode code={`const refId = createId('ref');
nodes[refId] = {
   id: refId,
   parentId: weekId,
   type: 'day_page', // Visual look
   title: originalDayNode.title,
   children: [],
   referenceId: originalDayNode.id // <--- IMPORTANT
};`} /></pre>
                     </div>

                     <h4>Grid Data Preparation</h4>
                     <p>
                        If you plan to use a Dynamic Grid in your template, ensure your nodes have the necessary data in their <code>data</code> object.
                     </p>
                     <ul>
                        <li>If your grid offset depends on the day of the week, add <code>weekday: 0-6</code> to your node data.</li>
                        <li>If your grid displays custom labels, add those fields to node data.</li>
                     </ul>

                     <p className="bg-amber-50 border-l-4 border-amber-400 p-4 text-amber-900 text-sm mt-8">
                        <strong>Warning:</strong> The generated code replaces the current project state. If you want to merge, you need to manually handle that in the JSON editor, or rely on the fact that this tool is primarily for starting new complex projects.
                     </p>
                  </section>

                  <section id="shortcuts">
                     <h2><span className="flex items-center gap-4"><Command className="text-blue-500" size={32} /> Keyboard Shortcuts</span></h2>
                     <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mt-10 not-prose">
                        <Shortcut k="Ctrl + Z" desc="Undo" />
                        <Shortcut k="Ctrl + Y" desc="Redo" />
                        <Shortcut k="Delete" desc="Delete Selection" />
                        <Shortcut k="Ctrl + C" desc="Copy Element" />
                        <Shortcut k="Ctrl + X" desc="Cut Element" />
                        <Shortcut k="Ctrl + V" desc="Paste Element" />
                        <Shortcut k="Ctrl + D" desc="Duplicate" />
                        <Shortcut k="Arrows" desc="Nudge Position" />
                        <Shortcut k="Shift + Arrow" desc="Fast Nudge" />
                        <Shortcut k="Esc" desc="Cancel Selection" />
                        <Shortcut k="Middle Click" desc="Pan Canvas" />
                     </div>

                     <h3 className="text-lg font-bold text-slate-800 mt-8 mb-4">Tools</h3>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4 not-prose">
                        <Shortcut k="V" desc="Select" />
                        <Shortcut k="H" desc="Hand / Pan" />
                        <Shortcut k="T" desc="Text Box" />
                        <Shortcut k="R" desc="Rectangle" />
                        <Shortcut k="E" desc="Ellipse" />
                        <Shortcut k="Y" desc="Triangle" />
                        <Shortcut k="L" desc="Line" />
                        <Shortcut k="G" desc="Data Grid" />
                     </div>
                  </section>

                  <section id="tips">
                     <h2>Tips & Tricks</h2>
                     <ul className="space-y-6 list-none pl-0 mt-10">
                        <li className="flex gap-4 p-6 bg-green-50/50 rounded-xl border border-green-100">
                           <CheckCircle2 className="text-green-600 flex-shrink-0 mt-1" size={24} />
                           <span className="text-slate-700 text-lg"><strong>Use References for Weeks:</strong> Don't duplicate Day nodes for Weekly views. Create a "Week" node and add 7 children that are <em>References</em> to the existing Day nodes. This keeps your data consistent.</span>
                        </li>
                        <li className="flex gap-4 p-6 bg-green-50/50 rounded-xl border border-green-100">
                           <CheckCircle2 className="text-green-600 flex-shrink-0 mt-1" size={24} />
                           <span className="text-slate-700 text-lg"><strong>Pattern Fills:</strong> Use 'Dots' pattern with a high spacing value to create bullet journal style grid pages without adding thousands of individual circle elements, keeping PDF file size low.</span>
                        </li>
                     </ul>
                  </section>

               </div>
            </main>
         </div>
      </div>
   );
};
