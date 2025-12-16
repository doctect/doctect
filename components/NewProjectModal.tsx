
import React, { useEffect, useState } from 'react';
import { ProjectPreset, PresetDefinition, getCustomPresets, deleteCustomPreset } from '../services/presets';
import { FilePlus, BookOpen, Calendar, X, Star, Trash2 } from 'lucide-react';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: ProjectPreset) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose, onSelectPreset }) => {
  const [customPresets, setCustomPresets] = useState<PresetDefinition[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
      if (isOpen) {
          const loaded = getCustomPresets();
          setCustomPresets(loaded);
          setDeleteId(null);
      }
  }, [isOpen]);

  if (!isOpen) return null;

  const defaultPresets: PresetDefinition[] = [
    {
      id: 'blank',
      title: 'Blank Project',
      desc: 'Start fresh with a single A4 page. Perfect for creating custom layouts from scratch.',
      icon: FilePlus,
      color: 'text-slate-500'
    },
    {
      id: 'notebook',
      title: 'Simple Notebook',
      desc: 'A structured digital notebook with a cover, subject dividers, and lined/grid pages.',
      icon: BookOpen,
      color: 'text-indigo-500'
    },
    {
      id: 'planner_2026',
      title: '2026 Planner',
      desc: 'A complex, hyperlinked planner with Year, Month, Week, Day, and Tracker views.',
      icon: Calendar,
      color: 'text-blue-500'
    }
  ];

  const handleDeleteCustom = (e: React.MouseEvent, id: string) => {
      // Stop event from bubbling to any parents
      e.stopPropagation();
      e.preventDefault();
      setDeleteId(id);
  };

  const confirmDelete = () => {
      if (deleteId) {
          deleteCustomPreset(deleteId);
          setCustomPresets(getCustomPresets());
          setDeleteId(null);
      }
  };

  const renderPresetCard = (p: PresetDefinition) => {
      const Icon = p.icon || Star;
      return (
        <div 
            key={p.id}
            className="group relative border rounded-xl hover:border-blue-400 hover:shadow-md hover:bg-blue-50/50 transition-all bg-white overflow-hidden"
        >
            {/* Selection Area - Sibling 1 */}
            <div 
                onClick={() => onSelectPreset(p.id)}
                className="flex flex-col items-center text-center p-6 w-full h-full cursor-pointer outline-none focus:ring-2 focus:ring-blue-400 focus:ring-inset rounded-xl"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectPreset(p.id);
                    }
                }}
            >
                <div className={`w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4 group-hover:bg-white group-hover:scale-110 transition-all ${p.color || 'text-slate-500'}`}>
                    <Icon size={24} />
                </div>
                <h3 className="font-bold text-slate-800 mb-2 truncate w-full">{p.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{p.desc}</p>
            </div>
            
            {/* Delete Action - Sibling 2 (On Top) */}
            {p.isCustom && (
                <button 
                    onClick={(e) => handleDeleteCustom(e, p.id)}
                    className="absolute top-2 right-2 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 z-10 border border-transparent hover:border-red-100 shadow-sm"
                    title="Delete Preset"
                    aria-label="Delete Preset"
                >
                    <Trash2 size={16} />
                </button>
            )}
        </div>
      );
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh] relative">
        
        {/* Delete Confirmation Overlay */}
        {deleteId && (
            <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200 backdrop-blur-sm">
                <div className="p-4 bg-red-100 rounded-full text-red-600 mb-4 shadow-sm">
                    <Trash2 size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Preset?</h3>
                <p className="text-slate-500 mb-8 max-w-xs leading-relaxed">
                    Are you sure you want to delete <span className="font-semibold text-slate-700">"{customPresets.find(p => p.id === deleteId)?.title}"</span>? This action cannot be undone.
                </p>
                <div className="flex gap-4">
                    <button 
                        onClick={() => setDeleteId(null)}
                        className="px-6 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors border border-transparent hover:border-slate-200"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={confirmDelete}
                        className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
                    >
                        Yes, Delete
                    </button>
                </div>
            </div>
        )}

        <div className="flex justify-between items-center p-6 border-b flex-shrink-0">
          <div>
              <h2 className="text-xl font-bold text-slate-800">Create New Project</h2>
              <p className="text-sm text-slate-500">Select a template to get started</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Standard Presets</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                {defaultPresets.map(renderPresetCard)}
            </div>

            {customPresets.length > 0 && (
                <>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-t pt-6">My Saved Presets</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {customPresets.map(p => ({...p, isCustom: true, icon: Star, color: 'text-amber-500'})).map(renderPresetCard)}
                    </div>
                </>
            )}
        </div>
      </div>
    </div>
  );
};
