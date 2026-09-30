import React, { useState } from 'react';
import {
  FileCode,
  Plus,
  Search,
  Filter,
  Layers,
  Sparkles,
  ArrowRight,
  Sliders,
} from 'lucide-react';
import { SystemPrompt, VaultKey } from '../../types';
import { PromptCard } from './PromptCard';
import { PromptEditorModal } from './PromptEditorModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import { api } from '../../services/api';

interface PromptManagerViewProps {
  prompts: SystemPrompt[];
  keys: VaultKey[];
  onPromptsChange: (prompts: SystemPrompt[]) => void;
  onSelectPromptForSandbox: (prompt: SystemPrompt) => void;
}

export const PromptManagerView: React.FC<PromptManagerViewProps> = ({
  prompts,
  keys,
  onPromptsChange,
  onSelectPromptForSandbox,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<SystemPrompt | null>(null);
  const [historyPrompt, setHistoryPrompt] = useState<SystemPrompt | null>(null);

  const handleCreateNew = () => {
    setEditingPrompt(null);
    setIsEditorOpen(true);
  };

  const handleEdit = (prompt: SystemPrompt) => {
    setEditingPrompt(prompt);
    setIsEditorOpen(true);
  };

  const handleSavePrompt = async (
    data: Partial<SystemPrompt> & { versionNotes?: string; author?: string; bumpVersion?: boolean }
  ) => {
    if (editingPrompt) {
      const res = await api.updatePrompt(editingPrompt.id, data);
      onPromptsChange(
        prompts.map((p) => (p.id === editingPrompt.id ? res.prompt : p))
      );
    } else {
      const res = await api.createPrompt(data);
      onPromptsChange([res.prompt, ...prompts]);
    }
  };

  const handleDeletePrompt = async (id: string) => {
    try {
      await api.deletePrompt(id);
      onPromptsChange(prompts.filter((p) => p.id !== id));
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  const handleMapKey = async (promptId: string, mappedKeyId: string | null) => {
    try {
      const res = await api.mapPromptKey(promptId, mappedKeyId);
      onPromptsChange(
        prompts.map((p) => (p.id === promptId ? res.prompt : p))
      );
    } catch (err: any) {
      alert(`Failed to update key mapping: ${err.message}`);
    }
  };

  const handleRestoreVersion = async (promptId: string, version: string, notes?: string) => {
    const res = await api.restorePromptVersion(promptId, version, notes);
    onPromptsChange(
      prompts.map((p) => (p.id === promptId ? res.prompt : p))
    );
  };

  // Filter prompts
  const filteredPrompts = prompts.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.systemPrompt.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === 'all' || p.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header controls & stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-4 sm:p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>Newsroom Prompt Manager</span>
            <span className="text-xs font-mono font-normal px-2.5 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-800 text-indigo-300">
              {prompts.length} Pipeline Prompts
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Create and maintain versioned prompt templates for automated broadsheet PDF extraction, layout de-scrambling, and AP styling.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCreateNew}
          className="flex items-center justify-center space-x-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New System Prompt</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search prompts by title, description, or system text..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'all', label: 'All' },
            { id: 'headline-byline', label: 'Headline & Byline' },
            { id: 'column-layout', label: 'Column Demarcator' },
            { id: 'wire-normalizer', label: 'Wire Normalizer' },
            { id: 'sports-scores', label: 'Sports Agate' },
            { id: 'caption-parser', label: 'Photo Captions' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap text-xs font-medium transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-800/60'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Prompts Cards Grid */}
      {filteredPrompts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPrompts.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              keys={keys}
              onEdit={handleEdit}
              onViewHistory={(p) => setHistoryPrompt(p)}
              onDelete={handleDeletePrompt}
              onTestInSandbox={onSelectPromptForSandbox}
              onMapKey={handleMapKey}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 px-4 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
          <FileCode className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-200">No Prompts Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
            No system prompts match your filter criteria. Create a new prompt or adjust search terms.
          </p>
          <button
            onClick={handleCreateNew}
            className="inline-flex items-center space-x-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Create Prompt</span>
          </button>
        </div>
      )}

      {/* Modals */}
      <PromptEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleSavePrompt}
        editingPrompt={editingPrompt}
        keys={keys}
      />

      <VersionHistoryModal
        isOpen={Boolean(historyPrompt)}
        onClose={() => setHistoryPrompt(null)}
        prompt={historyPrompt}
        onRestoreVersion={handleRestoreVersion}
      />
    </div>
  );
};
