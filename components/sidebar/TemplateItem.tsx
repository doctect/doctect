
import React, { useState } from 'react';
import { PageTemplate } from '../../types';
import { LayoutTemplate, Edit2, Trash2 } from 'lucide-react';
import clsx from 'clsx';

interface TemplateItemProps {
    template: PageTemplate;
    isSelected: boolean;
    onSelect: () => void;
    onDelete: () => void;
    onUpdateName: (name: string) => void;
}

export const TemplateItem: React.FC<TemplateItemProps> = ({ template, isSelected, onSelect, onDelete, onUpdateName }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(template.name);

    const handleSubmit = () => {
        if (editName.trim()) onUpdateName(editName);
        else setEditName(template.name);
        setIsEditing(false);
    };

    return (
        <div 
            onClick={onSelect}
            className={clsx(
                "flex items-center justify-between p-2 cursor-pointer text-sm hover:bg-slate-100 group",
                isSelected && "bg-blue-50 text-blue-700 font-medium"
            )}
        >
             <div className="flex items-center gap-2 flex-1 min-w-0">
                <LayoutTemplate size={14} className={isSelected ? "text-blue-500" : "text-slate-400"} />
                {isEditing ? (
                    <input 
                        autoFocus
                        className="flex-1 bg-white border border-blue-300 rounded px-1 min-w-0"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={handleSubmit}
                        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <div className="flex flex-col min-w-0">
                        <span className="truncate">{template.name}</span>
                    </div>
                )}
             </div>

             <div className="hidden group-hover:flex items-center gap-1">
                <button type="button"
                    className="p-1 hover:bg-slate-200 rounded text-slate-500" 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditName(template.name); setIsEditing(true); }}
                >
                    <Edit2 size={12} className="pointer-events-none" />
                </button>
                <button type="button"
                    className="p-1 hover:bg-red-100 text-red-500 rounded" 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
                >
                    <Trash2 size={12} className="pointer-events-none" />
                </button>
             </div>
        </div>
    );
};
