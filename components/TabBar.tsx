
import React from 'react';
import { X, Plus, FileText } from 'lucide-react';
import clsx from 'clsx';

interface TabBarProps {
  projects: { id: string; name: string }[];
  activeProjectId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({ projects, activeProjectId, onSelect, onClose, onNew }) => {
  return (
    <div className="flex items-center h-full gap-1 overflow-x-auto no-scrollbar mask-gradient px-2">
      {projects.map((project) => (
        <div
          key={project.id}
          className={clsx(
            "group flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-sm font-medium cursor-pointer transition-all border-t border-x border-transparent min-w-[120px] max-w-[200px] h-full mt-1 relative",
            project.id === activeProjectId 
              ? "bg-slate-100 text-blue-700 border-slate-200 shadow-sm z-10" 
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          )}
          onClick={() => onSelect(project.id)}
        >
          <FileText size={14} className={clsx("flex-shrink-0", project.id === activeProjectId ? "text-blue-500" : "text-slate-400")} />
          <span className="truncate flex-1">{project.name}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(project.id);
            }}
            className={clsx(
              "p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0",
              project.id === activeProjectId ? "hover:bg-blue-100 text-blue-600" : "hover:bg-slate-200 text-slate-500"
            )}
            title="Close Project"
          >
            <X size={12} />
          </button>
          
          {/* Active indicator line if needed, currently using background */}
          {project.id === activeProjectId && (
             <div className="absolute bottom-[-1px] left-0 right-0 h-[1px] bg-slate-100 z-20"></div>
          )}
        </div>
      ))}
      
      <button
        onClick={onNew}
        className="p-1.5 ml-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0"
        title="New Project"
      >
        <Plus size={18} />
      </button>
    </div>
  );
};
