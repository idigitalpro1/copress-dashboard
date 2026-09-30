import React, { useState, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import {
  Play,
  Copy,
  Check,
  Download,
  Sparkles,
  Cpu,
  Key,
  Layers,
  Clock,
  Coins,
  FileText,
  Code,
  Layout,
  AlertCircle,
  FileCode,
  Loader2,
  Upload,
} from 'lucide-react';
import {
  SystemPrompt,
  VaultKey,
  NewspaperSample,
} from '../../types';
import { api } from '../../services/api';
import { initialSandboxRunState, sandboxExportDetails, sandboxRunReducer } from './runState';

interface DualPaneSandboxProps {
  prompts: SystemPrompt[];
  keys: VaultKey[];
  initialSelectedPrompt?: SystemPrompt | null;
  executionEnabled: boolean;
}

export const DualPaneSandbox: React.FC<DualPaneSandboxProps> = ({
  prompts,
  keys,
  initialSelectedPrompt,
  executionEnabled,
}) => {
  const [selectedPromptId, setSelectedPromptId] = useState<string>('');
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  const [temperature, setTemperature] = useState<number>(0.15);
  const [outputFormat, setOutputFormat] = useState<'json' | 'markdown' | 'text'>('json');

  const [rawInputText, setRawInputText] = useState<string>('');
  const [samples, setSamples] = useState<NewspaperSample[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string>('');

  const [runState, dispatchRun] = useReducer(sandboxRunReducer, initialSandboxRunState);
  const nextRunId = useRef(0);
  const mounted = useRef(true);
  const isExecuting = runState.pendingRun !== null;
  const executionResult = runState.completedRun?.result ?? null;
  const errorMsg = runState.error;
  const copied = runState.copied;

  const [activeRightTab, setActiveRightTab] = useState<'formatted' | 'raw'>('formatted');

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const invalidateResult = () => dispatchRun({ type: 'invalidate' });

  // Load samples on mount
  useEffect(() => {
    api.getSamples().then((data) => {
      setSamples(data.samples || []);
      if (data.samples?.length > 0 && !rawInputText) {
        setRawInputText(data.samples[0].content);
        setSelectedSampleId(data.samples[0].id);
      }
    }).catch(() => {
      if (mounted.current) dispatchRun({ type: 'validation-error', error: 'Unable to load the beta sample texts.' });
    });
  }, []);

  // Update selected prompt if initialSelectedPrompt changes
  useEffect(() => {
    if (initialSelectedPrompt) {
      setSelectedPromptId(initialSelectedPrompt.id);
      setOutputFormat(initialSelectedPrompt.targetFormat);
      setSelectedModel(initialSelectedPrompt.recommendedModel);
      setTemperature(initialSelectedPrompt.temperature);
      setSelectedKeyId(initialSelectedPrompt.mappedKeyId || '');
    } else if (prompts.length > 0 && !selectedPromptId) {
      const first = prompts[0];
      setSelectedPromptId(first.id);
      setOutputFormat(first.targetFormat);
      setSelectedModel(first.recommendedModel);
      setTemperature(first.temperature);
      setSelectedKeyId(first.mappedKeyId || '');
    }
  }, [initialSelectedPrompt, prompts]);

  const activePrompt = prompts.find((p) => p.id === selectedPromptId);
  const executionKey = keys.find(key => key.id === (selectedKeyId || activePrompt?.mappedKeyId));
  const readyKey = executionKey?.status === 'active' && executionKey.provider !== 'custom';

  // Prop changes (including a rotated/revoked key or edited prompt) also invalidate output.
  // Layout timing clears it before paint; reducer revisions reject late in-flight responses.
  useLayoutEffect(() => {
    invalidateResult();
  }, [rawInputText, selectedPromptId, selectedKeyId, selectedModel, temperature, outputFormat,
    executionEnabled, activePrompt?.systemPrompt, activePrompt?.userTemplate,
    activePrompt?.currentVersion, activePrompt?.mappedKeyId, activePrompt?.updatedAt,
    executionKey?.id, executionKey?.provider, executionKey?.status, executionKey?.updatedAt,
    executionKey?.maskedKey]);

  useEffect(() => {
    if (runState.completedRun?.result.structuredData) setActiveRightTab('formatted');
  }, [runState.completedRun]);

  // When changing prompt from dropdown
  const handleSelectPrompt = (id: string) => {
    invalidateResult();
    setSelectedPromptId(id);
    const p = prompts.find((item) => item.id === id);
    if (p) {
      setOutputFormat(p.targetFormat);
      setSelectedModel(p.recommendedModel);
      setTemperature(p.temperature);
      setSelectedKeyId(p.mappedKeyId || '');
    }
  };

  const handleSelectSample = (sampleId: string) => {
    invalidateResult();
    setSelectedSampleId(sampleId);
    const s = samples.find((item) => item.id === sampleId);
    if (s) {
      setRawInputText(s.content);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text && mounted.current) {
          invalidateResult();
          setRawInputText(text);
          setSelectedSampleId('');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleExecute = async () => {
    if (isExecuting) return;
    if (!executionEnabled) { dispatchRun({ type: 'validation-error', error: 'Provider execution is disabled for this beta server.' }); return; }
    if (!readyKey) { dispatchRun({ type: 'validation-error', error: 'Choose a tested active key or map the selected prompt to one.' }); return; }
    if (!rawInputText.trim()) {
      dispatchRun({ type: 'validation-error', error: 'Please provide raw newspaper PDF extracted text.' });
      return;
    }

    const id = ++nextRunId.current;
    dispatchRun({ type: 'start', id, model: selectedModel, outputFormat });

    try {
      const res = await api.executePrompt({
        promptId: selectedPromptId || undefined,
        systemPrompt: activePrompt?.systemPrompt,
        userTemplate: activePrompt?.userTemplate,
        inputText: rawInputText,
        keyId: selectedKeyId || undefined,
        modelOverride: selectedModel,
        temperature,
        outputFormat,
      });

      if (mounted.current) dispatchRun({ type: 'success', id, result: res.result });
    } catch (err: any) {
      if (mounted.current) dispatchRun({ type: 'failure', id, error: err.message || 'Execution error during proxy generation' });
    }
  };

  const copyOutput = () => {
    const completed = runState.completedRun;
    if (completed?.result.output) {
      navigator.clipboard.writeText(completed.result.output).then(() => {
        if (!mounted.current) return;
        dispatchRun({ type: 'copy', id: completed.id, copied: true });
        setTimeout(() => {
          if (mounted.current) dispatchRun({ type: 'copy', id: completed.id, copied: false });
        }, 2000);
      }).catch(() => {});
    }
  };

  const downloadOutput = () => {
    const completed = runState.completedRun;
    if (!completed?.result.output) return;
    const details = sandboxExportDetails(completed.outputFormat);
    const blob = new Blob([completed.result.output], {
      type: details.mimeType,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `newsflow-extract-${Date.now()}.${details.extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Estimated tokens
  const estimatedInputTokens = Math.ceil(rawInputText.length / 4);

  return (
    <div className="space-y-4">
      <p className="text-xs p-3 rounded-xl bg-amber-950/30 border border-amber-800 text-amber-200">{executionEnabled ? 'Run Extraction sends the chosen text to the selected provider and may incur charges. Review the input, key, and model before running.' : 'Provider execution is disabled for this beta. Prompt editing and sample review remain available. The beta server operator must enable execution before a provider can be called.'}</p>
      {/* Control Banner: Prompt Selector, Key Selector, Model & Settings */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
          {/* 1. Prompt Selector */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
              <FileCode className="w-3 h-3 text-indigo-400" />
              <span>Target System Prompt</span>
            </label>
            <select
              value={selectedPromptId}
              onChange={(e) => handleSelectPrompt(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} (v{p.currentVersion})
                </option>
              ))}
            </select>
          </div>

          {/* 2. Key Card Routing Mapping */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
              <Key className="w-3 h-3 text-emerald-400" />
              <span>API Key Vault Card</span>
            </label>
            <select
              value={selectedKeyId}
              onChange={(e) => { invalidateResult(); setSelectedKeyId(e.target.value); }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">(Use selected prompt’s mapped key)</option>
              {keys.map((k) => (
                <option key={k.id} value={k.id} disabled={k.status !== 'active' || k.provider === 'custom'}>
                  {k.label} [{k.maskedKey.slice(-4)}] - {k.status.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Model Override */}
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
              <Cpu className="w-3 h-3 text-sky-400" />
              <span>Model Endpoint</span>
            </label>
            <select
              value={selectedModel}
              onChange={(e) => { invalidateResult(); setSelectedModel(e.target.value); }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            >
              <option value="gemini-3.8-flash">gemini-3.8-flash (Ultra-Fast Newsroom)</option>
              <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Deep Reasoning)</option>
              <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
            </select>
          </div>

          {/* 4. Output Format & Execute Action */}
          <div className="flex items-center space-x-2 pt-1 sm:pt-4">
            <select
              value={outputFormat}
              onChange={(e) => { invalidateResult(); setOutputFormat(e.target.value as any); }}
              className="bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-300 font-medium focus:outline-none"
            >
              <option value="json">JSON</option>
              <option value="markdown">Markdown</option>
              <option value="text">Raw Text</option>
            </select>

            <button
              type="button"
              disabled={!executionEnabled || !readyKey || isExecuting || !rawInputText.trim()}
              onClick={handleExecute}
              className="flex-1 flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold py-2 px-4 rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Extraction</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Selected Prompt Rule Reminder */}
        {activePrompt && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-300">{activePrompt.title}:</span>
              <span className="text-slate-400 line-clamp-1">{activePrompt.description}</span>
            </div>
            <div className="flex items-center space-x-3 font-mono text-[11px] text-slate-400">
              <span>Temp: {temperature}</span>
              <span>Format: {outputFormat.toUpperCase()}</span>
              <span>Version: v{activePrompt.currentVersion}</span>
            </div>
          </div>
        )}
      </div>

      {/* Error notification if any */}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Extraction Proxy Error: </span>
            <span className="font-mono text-rose-300">{errorMsg}</span>
          </div>
        </div>
      )}

      {/* Dual-Pane Workbench Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT PANE: Raw Extracted PDF Text */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[650px]">
          {/* Pane Header */}
          <div className="p-3.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-200">
                Input: Raw Newspaper PDF OCR Extract
              </span>
            </div>

            {/* Quick Sample Selector */}
            <div className="flex items-center space-x-2">
              <label className="text-[11px] text-slate-400 hidden sm:inline">Load Sample:</label>
              <select
                value={selectedSampleId}
                onChange={(e) => handleSelectSample(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none max-w-[170px] truncate"
              >
                <option value="">(Custom Upload/Paste)</option>
                {samples.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>

              <label
                htmlFor="pdf-text-upload"
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                title="Upload text file"
              >
                <Upload className="w-3.5 h-3.5" />
                <input
                  id="pdf-text-upload"
                  type="file"
                  accept=".txt,.ocr,.json,.md"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Textarea for raw PDF text */}
          <div className="flex-1 p-3.5 bg-slate-950 relative">
            <textarea
              value={rawInputText}
              onChange={(e) => {
                invalidateResult();
                setRawInputText(e.target.value);
                setSelectedSampleId('');
              }}
              placeholder="Paste noisy newspaper broadsheet OCR text here..."
              className="w-full h-full bg-transparent text-slate-200 text-xs font-mono leading-relaxed placeholder-slate-600 focus:outline-none resize-none selection:bg-indigo-900"
            />
          </div>

          {/* Left Pane Footer stats */}
          <div className="p-2.5 bg-slate-950/80 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between font-mono">
            <span>
              {rawInputText.length.toLocaleString()} characters • ~{estimatedInputTokens.toLocaleString()} tokens
            </span>
            <button
              type="button"
              onClick={() => { invalidateResult(); setRawInputText(''); setSelectedSampleId(''); }}
              className="hover:text-slate-300 transition-colors"
            >
              Clear Text
            </button>
          </div>
        </div>

        {/* RIGHT PANE: LLM Output & Formatted Results */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[650px]">
          {/* Pane Header with View Switcher */}
          <div className="p-3.5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveRightTab('formatted')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeRightTab === 'formatted'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layout className="w-3.5 h-3.5" />
                <span>Formatted Result</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveRightTab('raw')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeRightTab === 'raw'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>Raw Output</span>
              </button>
            </div>

            {/* Export & Copy buttons */}
            {executionResult && (
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={copyOutput}
                  className="flex items-center space-x-1 text-[11px] text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-700/60 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  onClick={downloadOutput}
                  className="flex items-center space-x-1 text-[11px] text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg border border-slate-700/60 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  <span>Export</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Pane Body */}
          <div className="flex-1 p-4 bg-slate-950 overflow-y-auto">
            {isExecuting ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                  <Sparkles className="w-5 h-5 text-indigo-400 absolute inset-0 m-auto" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">
                    Routing Prompt to Proxy...
                  </h4>
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    Calling {runState.pendingRun?.model}
                  </p>
                  {runState.pendingRun?.revision !== runState.revision && (
                    <p className="text-xs text-amber-300 mt-2 max-w-xs">Inputs or settings changed. This run’s output will be discarded when it finishes; provider charges may still apply.</p>
                  )}
                </div>
              </div>
            ) : executionResult ? (
              activeRightTab === 'formatted' ? (
                // Formatted Article Layout / JSON Schema Inspector
                executionResult.structuredData ? (
                  <div className="space-y-4">
                    {/* Rendered Newspaper Meta Banner if AP schema */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-md">
                      {executionResult.structuredData.kicker && (
                        <div className="text-[11px] font-mono uppercase font-bold tracking-widest text-indigo-400">
                          {executionResult.structuredData.kicker}
                        </div>
                      )}

                      {executionResult.structuredData.headline && (
                        <h2 className="text-lg font-serif font-bold text-slate-100 leading-snug tracking-tight">
                          {executionResult.structuredData.headline}
                        </h2>
                      )}

                      {executionResult.structuredData.subhead && (
                        <p className="text-xs text-slate-300 italic border-l-2 border-indigo-500 pl-3">
                          {executionResult.structuredData.subhead}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                        {executionResult.structuredData.byline && (
                          <span className="font-semibold text-slate-200">
                            {executionResult.structuredData.byline}
                          </span>
                        )}
                        {executionResult.structuredData.dateline && (
                          <span className="font-mono text-indigo-300">
                            {executionResult.structuredData.dateline}
                          </span>
                        )}
                        {executionResult.structuredData.newspaper_section && (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                            {executionResult.structuredData.newspaper_section}
                          </span>
                        )}
                      </div>

                      {executionResult.structuredData.lead_paragraph && (
                        <div className="text-xs text-slate-200 leading-relaxed font-serif bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                          <span className="font-sans font-bold text-indigo-400 text-[11px] uppercase mr-1">
                            Lead Paragraph:
                          </span>
                          {executionResult.structuredData.lead_paragraph}
                        </div>
                      )}

                      {/* Tags */}
                      {Array.isArray(executionResult.structuredData.tags) && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {executionResult.structuredData.tags.map((t: string, i: number) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 border border-slate-700"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Full JSON Tree Viewer */}
                    <div>
                      <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider block mb-1">
                        Parsed JSON Payload:
                      </span>
                      <pre className="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 font-mono text-xs text-emerald-300 whitespace-pre-wrap selection:bg-emerald-900/60">
                        {JSON.stringify(executionResult.structuredData, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  // Formatted Markdown preview
                  <div className="prose prose-invert max-w-none text-xs leading-relaxed font-sans space-y-3 p-2">
                    <pre className="whitespace-pre-wrap font-sans text-slate-200 text-xs bg-slate-900/90 p-4 rounded-xl border border-slate-800 leading-relaxed">
                      {executionResult.output}
                    </pre>
                  </div>
                )
              ) : (
                // Raw LLM Output view
                <pre className="font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed selection:bg-indigo-900">
                  {executionResult.output}
                </pre>
              )
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <Play className="w-10 h-10 text-slate-600 mb-3 stroke-1" />
                <h4 className="text-xs font-semibold text-slate-400">
                  Dual-Pane Sandbox Ready
                </h4>
                <p className="text-[11px] text-slate-500 max-w-xs mt-1">
                  Select a prompt and click "Run Extraction" to test the pipeline against the mapped key card.
                </p>
              </div>
            )}
          </div>

          {/* Right Pane Footer Metrics Bar */}
          {executionResult && (
            <div className="p-3 bg-slate-950/90 border-t border-slate-800 text-[11px] font-mono text-slate-400 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>{executionResult.latencyMs}ms</span>
              </div>

              <div className="flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                <span className="truncate">{executionResult.modelUsed}</span>
              </div>

              <div className="flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  {executionResult.promptTokens} in / {executionResult.completionTokens} out
                </span>
              </div>

              <div className="flex items-center space-x-1.5">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span>{executionResult.estimatedCostUsd == null ? 'Cost unavailable — check provider billing' : `$${executionResult.estimatedCostUsd}`}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
