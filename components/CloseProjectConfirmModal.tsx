
import React from 'react';
import { AlertTriangle, Download, X, Trash2 } from 'lucide-react';

interface CloseProjectConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmClose: () => void;
  onSaveAndClose: () => void;
  projectName: string;
}

export const CloseProjectConfirmModal: React.FC<CloseProjectConfirmModalProps> = ({ 
    isOpen, onClose, onConfirmClose, onSaveAndClose, projectName 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-4 border-b">
             <h2 className="text-lg font-bold text-slate-800">Close Project?</h2>
             <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full text-slate-500"><X size={20}/></button>
        </div>
        
        <div className="p-6">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-100 text-amber-600 rounded-full flex-shrink-0">
                    <AlertTriangle size={24} />
                </div>
                <div>
                    <p className="text-slate-600 font-medium mb-1">
                        Do you want to save changes to <span className="font-bold text-slate-800">"{projectName}"</span>?
                    </p>
                    <p className="text-sm text-slate-500 leading-relaxed">
                        If you close without saving, any unsaved changes will be lost permanently.
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
            onClick={onConfirmClose}
            className="px-4 py-2 text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 size={16} /> Close without Saving
          </button>
          <button 
            onClick={onSaveAndClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            <Download size={16} /> Save JSON & Close
          </button>
        </div>
      </div>
    </div>
  );
};
