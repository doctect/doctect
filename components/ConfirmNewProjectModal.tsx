import React from 'react';
import { AlertTriangle, Save, X } from 'lucide-react';

interface ConfirmNewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmDiscard: () => void; // Proceed to new project without saving
  onSaveAndContinue: () => void; // Save and then proceed
}

export const ConfirmNewProjectModal: React.FC<ConfirmNewProjectModalProps> = ({ 
    isOpen, onClose, onConfirmDiscard, onSaveAndContinue 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-4 border-b">
             <h2 className="text-lg font-bold text-slate-800">Start New Project?</h2>
             <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full text-slate-500"><X size={20}/></button>
        </div>
        
        <div className="p-6">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-100 text-amber-600 rounded-full flex-shrink-0">
                    <AlertTriangle size={24} />
                </div>
                <div>
                    <p className="text-slate-600 font-medium mb-1">
                        Unsaved changes will be lost.
                    </p>
                    <p className="text-sm text-slate-500 leading-relaxed">
                        You are about to create a new project. Would you like to save your current progress as a JSON file first?
                    </p>
                </div>
            </div>
        </div>

        <div className="p-4 border-t bg-slate-50 flex flex-col sm:flex-row gap-2 sm:justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium text-sm transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirmDiscard}
            className="px-4 py-2 text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg font-medium text-sm transition-colors"
          >
            Don't Save
          </button>
          <button 
            onClick={onSaveAndContinue}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            <Save size={16} /> Save & New
          </button>
        </div>
      </div>
    </div>
  );
};
