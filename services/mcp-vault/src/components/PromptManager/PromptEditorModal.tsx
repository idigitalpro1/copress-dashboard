import React, { useState, useEffect } from 'react';
import {
  X,
  FileCode,
  Save,
  Key,
  Cpu,
  Layers,
  Sparkles,
  Sliders,
  CheckCircle,
} from 'lucide-react';
import { SystemPrompt, PromptCategory, VaultKey } from '../../types';

interface PromptEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (promptData: Partial<SystemPrompt> & { versionNotes?: string; author?: string; bumpVersion?: boolean }) => Promise<void>;
  editingPrompt: SystemPrompt | null;
  keys: VaultKey[];
}

export const PromptEditorModal: React.FC<PromptEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingPrompt,
  keys,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<PromptCategory>('headline-byline');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userTemplate, setUserTemplate] = useState('');
  const [targetFormat, setTargetFormat] = useState<'json' | 'markdown' | 'text'>('json');
  const [recommendedModel, setRecommendedModel] = useState('gemini-3.8-flash');
  const [mappedKeyId, setMappedKeyId] = useState<string | null>(null);
  const [temperature, setTemperature] = useState(0.2);
  const [versionNotes, setVersionNotes] = useState('');
  const [author, setAuthor] = useState('Newsroom Editor');
  const [bumpVersion, setBumpVersion] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (editingPrompt) {
      setTitle(editingPrompt.title);
      setDescription(editingPrompt.description);
      setCategory(editingPrompt.category);
      setSystemPrompt(editingPrompt.systemPrompt);
      setUserTemplate(editingPrompt.userTemplate);
      setTargetFormat(editingPrompt.targetFormat);
      setRecommendedModel(editingPrompt.recommendedModel);
      setMappedKeyId(editingPrompt.mappedKeyId);
      setTemperature(editingPrompt.temperature);
      setVersionNotes(`Update to v${editingPrompt.currentVersion}`);
      setBumpVersion(true);
    } else {
      setTitle('');
      setDescription('');
      setCategory('headline-byline');
      setSystemPrompt(
        `You are an expert newsroom copy editor and newspaper archivist.\nExtract the headline, byline, dateline, and lead paragraph in structured JSON format.`
      );
      setUserTemplate('Analyze the provided raw newspaper OCR text and extract all metadata.');
      setTargetFormat('json');
      setRecommendedModel('gemini-3.8-flash');
      setMappedKeyId(keys[0]?.id || null);
      setTemperature(0.2);
      setVersionNotes('Initial version baseline.');
      setBumpVersion(false);
    }
  }, [editingPrompt, isOpen, keys]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !systemPrompt.trim()) {
      alert('Please fill out Title and System Prompt.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        title,
        description,
        category,
        systemPrompt,
        userTemplate,
        targetFormat,
        recommendedModel,
        mappedKeyId: mappedKeyId || null,
        temperature,
        versionNotes,
        author,
        bumpVersion,
      });
      onClose();
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm sm:text-base">
                {editingPrompt ? `Edit Prompt (Current: v${editingPrompt.currentVersion})` : 'New Newspaper System Prompt'}
              </h3>
              <p className="text-xs text-slate-400">
                Configure extraction rules, output schemas, and API key routing.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Title & Category Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Prompt Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Headline & Byline AP Extractor"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PromptCategory)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="headline-byline">Headline & Byline</option>
                <option value="column-layout">Column Demarcation</option>
                <option value="wire-normalizer">Wire Copy Normalizer</option>
                <option value="sports-scores">Sports Scores & Agate</option>
                <option value="caption-parser">Photo Captions</option>
                <option value="custom">Custom Pipeline</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Description & Newsroom Purpose
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Extracts headline deck, author credits, and AP Style datelines from digitized newspaper pages."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* System Instructions (Core System Prompt) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-300">
                System Prompt Instructions *
              </label>
              <span className="text-[11px] text-slate-500 font-mono">
                {systemPrompt.length} chars
              </span>
            </div>
            <textarea
              rows={8}
              required
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Define model behavior, schema, and extraction guidelines..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono leading-relaxed"
            />
          </div>

          {/* User Prompt Template */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              User Prompt Template (Prepended to PDF Extract)
            </label>
            <input
              type="text"
              value={userTemplate}
              onChange={(e) => setUserTemplate(e.target.value)}
              placeholder="e.g. Analyze this newspaper OCR text and extract all metadata."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>

          {/* Provider Mapping & Model Selection Settings */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              Routing & Model Configuration
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Mapped Key Card */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Mapped API Key Card (Module 1)
                </label>
                <select
                  value={mappedKeyId || ''}
                  onChange={(e) => setMappedKeyId(e.target.value || null)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">(Default Key Fallback)</option>
                  {keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label} ({k.maskedKey.slice(-4)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Recommended Model */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Recommended Model
                </label>
                <select
                  value={recommendedModel}
                  onChange={(e) => setRecommendedModel(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended)</option>
                  <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Reasoning)</option>
                  <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                </select>
              </div>

              {/* Output Format */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Target Output Format
                </label>
                <select
                  value={targetFormat}
                  onChange={(e) => setTargetFormat(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="json">JSON (Structured AP Schema)</option>
                  <option value="markdown">Markdown (Formatted Story)</option>
                  <option value="text">Plain Text</option>
                </select>
              </div>
            </div>

            {/* Temperature Slider */}
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                <span>Temperature (Creativity vs Determinism):</span>
                <span className="font-mono text-indigo-300 font-semibold">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Versioning Changelog Box (if editing) */}
          {editingPrompt && (
            <div className="p-3 bg-indigo-950/20 border border-indigo-900/40 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-indigo-300">
                  Version Bump & Audit Trail
                </span>
                <label className="flex items-center space-x-1.5 cursor-pointer text-slate-400 text-[11px]">
                  <input
                    type="checkbox"
                    checked={bumpVersion}
                    onChange={(e) => setBumpVersion(e.target.checked)}
                    className="rounded accent-indigo-500"
                  />
                  <span>Bump version number (e.g. v{editingPrompt.currentVersion} → next)</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={versionNotes}
                  onChange={(e) => setVersionNotes(e.target.value)}
                  placeholder="Changelog notes (e.g., Improved AP dateline resolution)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500"
                />
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Author / Editor Name"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500"
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-200 px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center space-x-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/20"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{editingPrompt ? 'Save & Commit Version' : 'Create Prompt'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
