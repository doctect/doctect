
import React, { useState } from 'react';
import { Save, X } from 'lucide-react';

interface SavePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, description: string) => void;
  defaultTitle?: string;
}

export const SavePresetModal: React.FC<SavePresetModalProps> = ({ isOpen, onClose, onSave, defaultTitle }) => {
  const [title, setTitle] = useState(defaultTitle || "");
  const [description, setDescription] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Save size={18} className="text-amber-500" />
            Save As Preset
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full text-slate-500">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Preset Name</label>
                <input 
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="My Custom Project"
                    autoFocus
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea 
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none h-24"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="A short description of this template..."
                />
            </div>
        </div>

        <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium text-sm"
          >
            Cancel
          </button>
          <button 
            onClick={() => onSave(title, description)}
            disabled={!title.trim()}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            Save Preset
          </button>
        </div>
      </div>
    </div>
  );
};
