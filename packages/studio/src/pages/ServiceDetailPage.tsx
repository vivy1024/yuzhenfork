import { useState, useEffect } from "react";
import { fetchJson } from "../hooks/use-api";
import { useServiceStore } from "../store/service";
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { ServiceConfigSourceCard } from "../components/ServiceConfigSourceCard";

interface Nav {
  toServices: () => void;
}

interface ModelInfo {
  readonly id: string;
  readonly name?: string;
}

interface DetectedConfig {
  readonly apiFormat?: "chat" | "responses";
  readonly stream?: boolean;
  readonly baseUrl?: string;
  readonly modelsSource?: "api" | "fallback";
}

interface ServiceProbeResponse {
  readonly ok: boolean;
  readonly models?: ModelInfo[];
  readonly modelCount?: number;
  readonly selectedModel?: string;
  readonly detected?: DetectedConfig;
  readonly error?: string;
}

// Unified page state
type ConnectionStatus =
  | { state: "idle" }               // No action taken yet
  | { state: "testing" }            // Test in progress
  | { state: "connected"; models: ModelInfo[] }  // Test succeeded
  | { state: "error"; message: string }          // Test failed
  | { state: "saving" }             // Save in progress
  | { state: "saved" }              // Save succeeded

export async function probeServiceForDetail(
  fetcher: typeof fetchJson,
  args: {
    readonly effectiveServiceId: string;
    readonly apiKey: string;
    readonly apiFormat: "chat" | "responses";
    readonly stream: boolean;
    readonly isCustom: boolean;
    readonly baseUrl: string;
  },
): Promise<ServiceProbeResponse> {
  return fetcher<ServiceProbeResponse>(
    `/services/${encodeURIComponent(args.effectiveServiceId)}/test`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: args.apiKey,
        apiFormat: args.apiFormat,
        stream: args.stream,
        ...(args.isCustom ? { baseUrl: args.baseUrl.trim() } : {}),
      }),
    },
  );
}

export async function rehydrateServiceConnectionStatus(
  fetcher: typeof fetchJson,
  args: {
    readonly connected: boolean;
    readonly effectiveServiceId: string;
    readonly apiFormat: "chat" | "responses";
    readonly stream: boolean;
    readonly isCustom: boolean;
    readonly baseUrl: string;
  },
): Promise<ServiceProbeResponse | null> {
  if (!args.connected) return null;
  const secret = await fetcher<{ apiKey?: string }>(`/services/${encodeURIComponent(args.effectiveServiceId)}/secret`);
  const savedKey = secret.apiKey?.trim();
  if (!savedKey) return null;
  return probeServiceForDetail(fetcher, {
    effectiveServiceId: args.effectiveServiceId,
    apiKey: savedKey,
    apiFormat: args.apiFormat,
    stream: args.stream,
    isCustom: args.isCustom,
    baseUrl: args.baseUrl,
  });
}

export async function saveServiceConfigWithValidation(
  fetcher: typeof fetchJson,
  args: {
    readonly effectiveServiceId: string;
    readonly serviceId: string;
    readonly isCustom: boolean;
    readonly resolvedCustomName: string;
    readonly baseUrl: string;
    readonly apiKey: string;
    readonly apiFormat: "chat" | "responses";
    readonly stream: boolean;
    readonly temperature: string;
    readonly maxTokens: string;
    readonly defaultModel?: string;
  },
): Promise<{ probe: ServiceProbeResponse | null }> {
  const trimmedKey = args.apiKey.trim();
  let probe: ServiceProbeResponse | null = null;
  if (trimmedKey) {
    probe = await probeServiceForDetail(fetcher, {
      effectiveServiceId: args.effectiveServiceId,
      apiKey: trimmedKey,
      apiFormat: args.apiFormat,
      stream: args.stream,
      isCustom: args.isCustom,
      baseUrl: args.baseUrl,
    });
    if (!probe.ok) {
      throw new Error(probe.error ?? "连接失败");
    }
  }

  await fetcher(`/services/${encodeURIComponent(args.effectiveServiceId)}/secret`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: trimmedKey }),
  });
  await fetcher("/services/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service: args.effectiveServiceId,
      ...(args.defaultModel ? { defaultModel: args.defaultModel } : {}),
      services: [
        {
          service: args.isCustom ? "custom" : args.serviceId,
          temperature: parseFloat(args.temperature),
          maxTokens: parseInt(args.maxTokens, 10),
          apiFormat: args.apiFormat,
          stream: args.stream,
          ...(args.isCustom ? { name: args.resolvedCustomName, baseUrl: args.baseUrl.trim() } : {}),
        },
      ],
    }),
  });
  return { probe };
}

function DetailSkeleton() {
  return (
    <div className="max-w-xl mx-auto space-y-6 animate-pulse">
      <div className="h-4 w-16 bg-muted rounded" />
      <div className="h-7 w-40 bg-muted rounded" />
      <div className="space-y-2"><div className="h-3 w-16 bg-muted/60 rounded" /><div className="h-10 w-full bg-muted/40 rounded-lg" /></div>
      <div className="h-9 w-24 bg-muted/40 rounded-lg" />
    </div>
  );
}

export function ServiceDetailPage({ serviceId, nav }: { serviceId: string; nav: Nav }) {
  // -- Service store --
  const services = useServiceStore((s) => s.services);
  const loading = useServiceStore((s) => s.servicesLoading);
  const fetchServices = useServiceStore((s) => s.fetchServices);
  const refreshServices = useServiceStore((s) => s.refreshServices);
  const setStoreModels = useServiceStore((s) => s.setModels);
  const clearStoreModels = useServiceStore((s) => s.clearModels);

  useEffect(() => { void fetchServices(); }, [fetchServices]);

  const svc = services.find((s) => s.service === serviceId);
  const isCustom = serviceId === "custom" || serviceId.startsWith("custom:");
  const persistedCustomName = serviceId.startsWith("custom:") ? decodeURIComponent(serviceId.slice("custom:".length)) : "";

  // -- Local form state --
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [customName, setCustomName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [temperature, setTemperature] = useState("0.7");
  const [maxTokens, setMaxTokens] = useState("4096");
  const [apiFormat, setApiFormat] = useState<"chat" | "responses">("chat");
  const [stream, setStream] = useState(true);
  const [detectedModel, setDetectedModel] = useState<string>("");
  const [detectedConfig, setDetectedConfig] = useState<DetectedConfig | null>(null);

  // -- Unified connection status --
  const [status, setStatus] = useState<ConnectionStatus>({ state: "idle" });
  const resolvedCustomName = persistedCustomName || customName.trim() || "Custom";
  const effectiveServiceId = isCustom ? `custom:${resolvedCustomName}` : serviceId;
  const label = isCustom ? (customName || persistedCustomName || "自定义服务") : (svc?.label ?? serviceId);

  useEffect(() => {
    let cancelled = false;
    void fetchJson<{ services: Array<Record<string, unknown>> }>("/services/config")
      .then((data) => {
        if (cancelled) return;
        const matched = (data.services ?? []).find((entry) => {
          if (typeof entry.service !== "string") return false;
          if (serviceId.startsWith("custom:")) {
            return entry.service === "custom" && `custom:${String(entry.name ?? "")}` === serviceId;
          }
          return entry.service === serviceId;
        });
        if (!matched) return;
        if (isCustom) {
          setCustomName(String(matched.name ?? persistedCustomName));
          setBaseUrl(String(matched.baseUrl ?? ""));
        }
        if (typeof matched.temperature === "number") setTemperature(String(matched.temperature));
        if (typeof matched.maxTokens === "number") setMaxTokens(String(matched.maxTokens));
        if (matched.apiFormat === "chat" || matched.apiFormat === "responses") setApiFormat(matched.apiFormat);
        if (typeof matched.stream === "boolean") setStream(matched.stream);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isCustom, persistedCustomName, serviceId]);

  // Validate existing key on mount via /test, not just /models
  useEffect(() => {
    let cancelled = false;
    if (!svc?.connected) return;
    setStatus({ state: "testing" });
    void rehydrateServiceConnectionStatus(fetchJson, {
      connected: svc.connected,
      effectiveServiceId,
      apiFormat,
      stream,
      isCustom,
      baseUrl,
    })
      .then((result) => {
        if (cancelled || !result) return;
        if (result.ok && result.models) {
          setStatus({ state: "connected", models: result.models });
        } else {
          setStatus({ state: "idle" });
        }
      })
      .catch(() => {
        if (!cancelled) setStatus({ state: "idle" });
      });
    return () => { cancelled = true; };
  }, [svc?.connected, effectiveServiceId, apiFormat, stream, isCustom, baseUrl]);

  useEffect(() => {
    let cancelled = false;
    void fetchJson<{ apiKey?: string }>(`/services/${encodeURIComponent(effectiveServiceId)}/secret`)
      .then((data) => {
        if (cancelled) return;
        if (typeof data.apiKey === "string") {
          setApiKey(data.apiKey);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [effectiveServiceId]);

  if (loading) return <DetailSkeleton />;

  // -- Derived state --
  const isConnected = status.state === "connected";
  const models = status.state === "connected" ? status.models : [];
  const isBusy = status.state === "testing" || status.state === "saving";

  // -- Handlers --
  const handleTest = async () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setStatus({ state: "error", message: "请先输入 API Key" });
      return;
    }
    if (isCustom && !baseUrl.trim()) {
      setStatus({ state: "error", message: "请先填写 Base URL" });
      return;
    }
    setApiKey(trimmedKey);
    setStatus({ state: "testing" });
    try {
      const result = await probeServiceForDetail(fetchJson, {
        effectiveServiceId,
        apiKey: trimmedKey,
        apiFormat,
        stream,
        isCustom,
        baseUrl,
      });
      if (result.ok) {
        const models = result.models ?? [];
        if (result.detected?.apiFormat) setApiFormat(result.detected.apiFormat);
        if (typeof result.detected?.stream === "boolean") setStream(result.detected.stream);
        if (isCustom && result.detected?.baseUrl) setBaseUrl(result.detected.baseUrl);
        setDetectedModel(result.selectedModel ?? "");
        setDetectedConfig(result.detected ?? null);
        setStatus({ state: "connected", models });
        setStoreModels(effectiveServiceId, models); // Write to global store
      } else {
        setStatus({ state: "error", message: result.error ?? "连接失败" });
        clearStoreModels(effectiveServiceId);
      }
    } catch (e) {
      setStatus({ state: "error", message: e instanceof Error ? e.message : "连接失败" });
    }
  };

  const handleSave = async () => {
    const trimmedKey = apiKey.trim();
    setApiKey(trimmedKey);
    if (isCustom && !baseUrl.trim()) {
      setStatus({ state: "error", message: "请先填写 Base URL" });
      return;
    }
    setStatus({ state: "saving" });
    try {
      const { probe: validatedResult } = await saveServiceConfigWithValidation(fetchJson, {
        effectiveServiceId,
        serviceId,
        isCustom,
        resolvedCustomName,
        baseUrl,
        apiKey: trimmedKey,
        apiFormat,
        stream,
        temperature,
        maxTokens,
        defaultModel: detectedModel || undefined,
      });

      if (trimmedKey && validatedResult?.models) {
        if (validatedResult.detected?.apiFormat) setApiFormat(validatedResult.detected.apiFormat);
        if (typeof validatedResult.detected?.stream === "boolean") setStream(validatedResult.detected.stream);
        if (isCustom && validatedResult.detected?.baseUrl) setBaseUrl(validatedResult.detected.baseUrl);
        setDetectedModel(validatedResult.selectedModel ?? detectedModel);
        setDetectedConfig(validatedResult.detected ?? detectedConfig);
        setStoreModels(effectiveServiceId, validatedResult.models);
        setStatus({ state: "connected", models: validatedResult.models });
      } else {
        clearStoreModels(effectiveServiceId);
        setStatus({ state: "saved" });
      }

      await refreshServices();
      nav.toServices();
    } catch (e) {
      setStatus({ state: "error", message: e instanceof Error ? e.message : "保存失败" });
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Back */}
      <button
        onClick={nav.toServices}
        className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-card/60 px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors"
      >
        <ArrowLeft size={14} />
        返回服务商管理
      </button>

      {/* Title + status */}
      <div className="flex items-center gap-3">
        <h1 className="font-serif text-2xl">{label}</h1>
        {isConnected && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-medium">
            已连接
          </span>
        )}
      </div>

      <ServiceConfigSourceCard onChange={() => { void refreshServices(); }} />

      <div className="space-y-5">
        {/* Custom fields */}
        {isCustom && (
        <div className="grid grid-cols-2 gap-4">
            <Field label="服务名称">
              <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)}
                placeholder="例如：本地 Ollama" className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm" />
            </Field>
            <Field label="Base URL">
              <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1" className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-mono" />
            </Field>
          </div>
        )}

        {/* API Key */}
        <Field label="API Key">
          <div className="relative">
            <input
              type={showKey ? "text" : "password"} value={apiKey}
              onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..."
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 pr-10 text-sm font-mono"
            />
            <button type="button" onClick={() => setShowKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>

        {/* Actions + feedback */}
        <div className="flex items-center gap-2">
          <button onClick={handleTest} disabled={isBusy}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-lg border border-border/60 hover:bg-secondary/50 transition-colors disabled:opacity-50">
            {status.state === "testing" && <Loader2 size={12} className="animate-spin" />}
            测试连接
          </button>
          <button onClick={handleSave} disabled={isBusy}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {status.state === "saving" && <Loader2 size={12} className="animate-spin" />}
            保存
          </button>
          {/* Status feedback */}
          {status.state === "connected" && (
            <span className="text-xs text-emerald-500">
              连接成功，{models.length} 个模型
              {detectedModel ? `，已自动匹配 ${detectedModel}${detectedConfig ? ` / ${detectedConfig.apiFormat === "responses" ? "Responses" : "Chat"} / ${detectedConfig.stream ? "流式" : "非流式"}` : ""}` : ""}
            </span>
          )}
          {status.state === "error" && (
            <span className="text-xs text-destructive">{status.message}</span>
          )}
          {status.state === "saved" && (
            <span className="text-xs text-emerald-500">已保存</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="协议类型">
            <select
              value={apiFormat}
              onChange={(e) => setApiFormat(e.target.value as "chat" | "responses")}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            >
              <option value="chat">Chat / Completions</option>
              <option value="responses">Responses</option>
            </select>
          </Field>

          <Field label="流式响应">
            <label className="flex h-10 items-center gap-2 rounded-lg border border-border/60 bg-background px-3 text-sm">
              <input
                type="checkbox"
                checked={stream}
                onChange={(e) => setStream(e.target.checked)}
              />
              <span>{stream ? "开启" : "关闭"}</span>
            </label>
          </Field>
        </div>

        {/* Models */}
        {models.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider">
              可用模型（{models.length}）
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {models.map((m) => (
                <span key={m.id} className="text-[11px] px-2.5 py-1 rounded-md bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400 border border-emerald-500/15">
                  {m.name ?? m.id}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Advanced params */}
        <details className="group pt-2 border-t border-border/20">
          <summary className="text-xs text-muted-foreground/60 cursor-pointer select-none hover:text-muted-foreground transition-colors py-2">
            高级参数
          </summary>
          <div className="space-y-4 pt-2">
            <Field label="temperature">
              <div className="flex items-center gap-3">
                <input type="range" min="0" max="2" step="0.05" value={temperature}
                  onChange={(e) => setTemperature(e.target.value)} className="flex-1 accent-primary h-1" />
                <input type="number" value={temperature} onChange={(e) => setTemperature(e.target.value)}
                  min="0" max="2" step="0.05" className="w-16 rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-right font-mono" />
              </div>
            </Field>
            <Field label="maxTokens">
              <input type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)}
                min="256" max="200000" step="256" className="w-full rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs font-mono" />
            </Field>
          </div>
        </details>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs text-muted-foreground/70 font-medium">{label}</label>
      {children}
    </div>
  );
}
