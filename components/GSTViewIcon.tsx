import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import GSTDetailModal from './GSTDetailModal';
import GSTClientFormModal from '../pages/Clientform/GSTClientFormModal';

interface GSTViewIconProps {
  client: Client;
  className?: string;
  showLabel?: boolean;
  label?: string;
  onEdit?: (client: Client) => void;
  onDataChange?: () => void;
  onView?: (client: Client) => void;
}

const GSTViewIcon: React.FC<GSTViewIconProps> = ({ client, className = '', showLabel = true, label = 'View', onEdit, onDataChange, onView }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [currentClient, setCurrentClient] = useState(client);

  useEffect(() => {
    setCurrentClient(client);
  }, [client]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onView) {
      onView(currentClient);
    } else {
      setIsOpen(true);
    }
  };

  const handleEditClick = (c: Client) => {
    setIsOpen(false);
    if (onEdit) {
      onEdit(c);
    } else {
      setIsEditOpen(true);
    }
  };

  const handleSave = (data: Client) => {
    setCurrentClient(data);
    setIsEditOpen(false);
    if (onDataChange) {
      onDataChange();
    }
  };

  return (
    <>
      <button 
        type="button"
        onClick={handleClick}
        className={showLabel 
          ? `h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all flex items-center gap-1 shadow-2xs cursor-pointer text-xs font-medium active:scale-95 ${className}`
          : `h-7 w-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-750 transition-all flex items-center justify-center shadow-xs cursor-pointer ${className}`
        }
        title="View GST Profile Dossier"
      >
        <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7S1.732 16.057.458 12z" />
        </svg>
        {showLabel && <span>{label}</span>}
      </button>

      {!onView && (
        <>
          <GSTDetailModal 
            isOpen={isOpen} 
            onClose={() => setIsOpen(false)} 
            client={currentClient} 
            onEdit={handleEditClick} 
            onDataChange={onDataChange}
          />
          {isEditOpen && (
            <GSTClientFormModal
              isOpen={isEditOpen}
              onClose={() => setIsEditOpen(false)}
              onSave={handleSave}
              initialData={currentClient}
            />
          )}
        </>
      )}
    </>
  );
};

export default GSTViewIcon;
