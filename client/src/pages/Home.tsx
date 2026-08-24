import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  History,
  Loader2,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const navItems = [
  { id: "studio", label: "Studio", icon: Radio },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "history", label: "History", icon: History },
];

const statusStyles = {
  draft: "bg-neutral-100 text-neutral-700",
  approved: "bg-black text-white",
  rejected: "bg-[#e31b23] text-white",
  published: "bg-[#e31b23] text-white",
} as const;

function toLocalDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [activeView, setActiveView] = useState("studio");
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [sourceKind, setSourceKind] = useState<"markdown" | "url">("markdown");
  const [campaignName, setCampaignName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [scheduleTimes, setScheduleTimes] = useState<Record<number, string>>({});
  const campaignInput = useMemo(
    () => (selectedCampaignId ? { campaignId: selectedCampaignId } : undefined),
    [selectedCampaignId]
  );
  const { data: campaigns, isLoading: campaignsLoading } = trpc.campaign.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: selectedCampaign, isLoading: campaignLoading } = trpc.campaign.get.useQuery(
    campaignInput as { campaignId: number },
    { enabled: Boolean(campaignInput) && isAuthenticated }
  );
  const { data: scheduler } = trpc.scheduler.get.useQuery(undefined, { enabled: isAuthenticated });

  useEffect(() => {
    if (!selectedCampaignId && campaigns?.[0]) setSelectedCampaignId(campaigns[0].id);
  }, [campaigns, selectedCampaignId]);

  const refreshCampaigns = async () => {
    await Promise.all([utils.campaign.list.invalidate(), utils.campaign.get.invalidate()]);
  };

  const createCampaign = trpc.campaign.create.useMutation({
    onSuccess: async campaign => {
      setSelectedCampaignId(campaign?.campaign.id ?? null);
      setCampaignName("");
      setSourceUrl("");
      setSourceContent("");
      await refreshCampaigns();
      toast.success("Canonical source stored. Generate variants when ready.");
    },
    onError: error => toast.error(error.message),
  });
  const generateVariants = trpc.campaign.generateVariants.useMutation({
    onSuccess: async () => {
      await refreshCampaigns();
      toast.success("Three validated drafts generated from the stored source.");
    },
    onError: error => toast.error(error.message),
  });
  const reviewVariant = trpc.campaign.reviewVariant.useMutation({
    onSuccess: refreshCampaigns,
    onError: error => toast.error(error.message),
  });
  const editVariant = trpc.campaign.editVariant.useMutation({
    onSuccess: async () => {
      await refreshCampaigns();
      toast.success("Variant saved as a revalidated draft.");
    },
    onError: error => toast.error(error.message),
  });
  const scheduleVariant = trpc.campaign.scheduleVariant.useMutation({
    onSuccess: async () => {
      await refreshCampaigns();
      toast.success("Time slot saved with a stable idempotency key.");
    },
    onError: error => toast.error(error.message),
  });
  const runDue = trpc.campaign.runDueProcessor.useMutation({
    onSuccess: async summary => {
      await refreshCampaigns();
      toast.success(`Due processor checked ${summary.claimed} slot${summary.claimed === 1 ? "" : "s"}.`);
    },
    onError: error => toast.error(error.message),
  });
  const activateScheduler = trpc.scheduler.activate.useMutation({
    onSuccess: () => {
      utils.scheduler.get.invalidate();
      toast.success("Automatic due-slot checks are enabled.");
    },
    onError: error => toast.error(error.message),
  });

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    createCampaign.mutate({
      name: campaignName,
      sourceKind,
      sourceUrl: sourceKind === "url" ? sourceUrl : undefined,
      canonicalContent: sourceKind === "markdown" ? sourceContent : undefined,
    });
  };

  const handleSaveVariant = (variantId: number, content: string) => {
    editVariant.mutate({ variantId, content });
  };

  const handleSchedule = (variantId: number) => {
    const raw = scheduleTimes[variantId];
    if (!raw) {
      toast.error("Choose a future UTC-compatible time slot first.");
      return;
    }
    scheduleVariant.mutate({ variantId, scheduledAt: new Date(raw) });
  };

  if (loading) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="animate-spin" /></div>;
  }

  if (!isAuthenticated) {
    return (
      <main className="grid min-h-screen place-items-center bg-white p-6 text-black">
        <section className="max-w-lg border-[3px] border-black p-8">
          <div className="mb-8 h-8 w-8 bg-[#e31b23]" />
          <p className="eyebrow">SOCIAL MEDIA STUDIO / ACCESS</p>
          <h1 className="mt-3 text-5xl font-black uppercase leading-[0.9] tracking-[-0.07em]">Review. Approve. Publish once.</h1>
          <p className="mt-6 max-w-md text-sm leading-6 text-neutral-600">Sign in to create a canonical campaign source and manage its reliable publishing workflow.</p>
          <Button onClick={() => startLogin()} className="mt-8 rounded-none bg-black px-5 text-white hover:bg-[#e31b23]">Sign in to studio <ArrowUpRight className="ml-2 h-4 w-4" /></Button>
        </section>
      </main>
    );
  }

  const variants = selectedCampaign?.variants ?? [];
  const slots = selectedCampaign?.slots ?? [];
  const attempts = selectedCampaign?.attempts ?? [];

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="grid-border flex min-h-16 items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 bg-[#e31b23]" />
          <span className="text-xs font-bold uppercase tracking-[0.18em]">Social Media Studio</span>
        </div>
        <div className="hidden items-center gap-5 text-[10px] font-bold uppercase tracking-[0.16em] sm:flex">
          <span>Canonical / Review-first</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#e31b23]" /> {scheduler?.isEnabled ? "Auto-run live" : "Manual run"}</span>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[205px_minmax(0,1fr)]">
        <aside className="grid-border lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-black px-5 py-5 lg:block lg:border-b-0 lg:py-8">
            <p className="eyebrow">OPERATOR</p>
            <p className="mt-1 text-sm font-bold">{user?.name ?? "Studio user"}</p>
          </div>
          <nav className="flex border-b border-black lg:block lg:border-b-0 lg:px-3">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button key={item.id} onClick={() => setActiveView(item.id)} className={cn("flex flex-1 items-center gap-2 border-r border-black px-3 py-4 text-left text-xs font-bold uppercase tracking-[0.08em] last:border-r-0 lg:mb-1 lg:border-r-0", active ? "bg-black text-white" : "hover:bg-[#e31b23] hover:text-white")}>
                  <Icon className="h-4 w-4" /> {item.label}
                </button>
              );
            })}
          </nav>
          <div className="hidden border-t border-black px-5 py-5 lg:block lg:absolute lg:bottom-0 lg:w-[205px]">
            <p className="eyebrow">SYSTEM</p>
            <p className="mt-2 text-xs leading-5 text-neutral-600">Deterministic templates. Database-backed slots. Adapter-isolated delivery.</p>
          </div>
        </aside>

        <main className="overflow-hidden">
          <section className="grid-border grid gap-6 px-5 py-8 sm:px-8 lg:grid-cols-12 lg:gap-8 lg:px-10 lg:py-12">
            <div className="lg:col-span-8">
              <p className="eyebrow">CAMPAIGN OPERATIONS / 01</p>
              <h1 className="mt-4 max-w-4xl text-5xl font-black uppercase leading-[0.84] tracking-[-0.075em] sm:text-7xl">Make one idea travel —<br /><span className="text-[#e31b23]">without losing control.</span></h1>
            </div>
            <div className="flex flex-col justify-end border-t-2 border-black pt-4 lg:col-span-4 lg:border-t-0 lg:border-l-2 lg:pl-6 lg:pt-0">
              <p className="text-sm leading-6">A deliberate system for authoring compliant variants, keeping a human approval gate, and publishing each scheduled delivery one time.</p>
              <div className="mt-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em]"><ShieldCheck className="h-4 w-4 text-[#e31b23]" /> Idempotency protected</div>
            </div>
          </section>

          <section className="grid gap-px bg-black lg:grid-cols-12">
            <form onSubmit={handleCreate} className="bg-white p-5 sm:p-8 lg:col-span-5">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div><p className="eyebrow">01 / CANONICAL SOURCE</p><h2 className="mt-2 text-2xl font-black uppercase tracking-[-0.04em]">Ingest once</h2></div>
                <Plus className="h-5 w-5 text-[#e31b23]" />
              </div>
              <label className="field-label">Campaign name</label>
              <Input value={campaignName} onChange={event => setCampaignName(event.target.value)} placeholder="e.g. Reliability essay" className="studio-input" />
              <div className="mt-5 grid grid-cols-2 gap-2">
                {(["markdown", "url"] as const).map(kind => <button key={kind} type="button" onClick={() => setSourceKind(kind)} className={cn("border border-black px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.12em]", sourceKind === kind ? "bg-black text-white" : "hover:bg-[#e31b23] hover:text-white")}>{kind === "markdown" ? "Paste text" : "Fetch URL"}</button>)}
              </div>
              {sourceKind === "markdown" ? <><label className="field-label mt-5">Stored Markdown / text</label><Textarea value={sourceContent} onChange={event => setSourceContent(event.target.value)} placeholder="Paste the canonical blog post. Every variant will be generated from this stored source only." className="studio-textarea min-h-40" /></> : <><label className="field-label mt-5">Published source URL</label><Input value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://example.com/blog/post" className="studio-input" /><p className="mt-3 text-xs leading-5 text-neutral-500">Only public http(s) pages are fetched. Private and local addresses are refused.</p></>}
              <Button disabled={createCampaign.isPending} type="submit" className="mt-6 w-full rounded-none bg-[#e31b23] font-bold uppercase tracking-[0.12em] text-white hover:bg-black">{createCampaign.isPending ? <Loader2 className="animate-spin" /> : "Store canonical source"}<ChevronRight className="ml-2 h-4 w-4" /></Button>
            </form>

            <section className="bg-[#f4f4f1] p-5 sm:p-8 lg:col-span-7">
              <div className="flex items-start justify-between gap-4 border-b border-black pb-5">
                <div><p className="eyebrow">02 / CAMPAIGN SELECTOR</p><h2 className="mt-2 text-2xl font-black uppercase tracking-[-0.04em]">Source is truth</h2></div>
                <Button variant="outline" onClick={() => refreshCampaigns()} className="rounded-none border-black"><RefreshCw className="h-4 w-4" /></Button>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {campaignsLoading ? <Loader2 className="m-3 animate-spin" /> : campaigns?.length ? campaigns.map(campaign => <button key={campaign.id} onClick={() => setSelectedCampaignId(campaign.id)} className={cn("border border-black p-4 text-left transition-colors", campaign.id === selectedCampaignId ? "bg-black text-white" : "bg-white hover:bg-[#e31b23] hover:text-white")}><p className="text-[10px] font-bold uppercase tracking-[0.12em]">{campaign.sourceKind}</p><p className="mt-2 font-bold">{campaign.name}</p><p className="mt-4 text-xs opacity-70">Updated {new Date(campaign.updatedAt).toLocaleDateString()}</p></button>) : <div className="border border-dashed border-neutral-400 p-5 text-sm text-neutral-600">Store a source at left to open the campaign review workspace.</div>}
              </div>
              {selectedCampaign && <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-black pt-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em]">Selected source</p><p className="mt-1 text-sm text-neutral-600">{selectedCampaign.campaign.canonicalContent.slice(0, 130)}{selectedCampaign.campaign.canonicalContent.length > 130 ? "…" : ""}</p></div><Button disabled={generateVariants.isPending} onClick={() => generateVariants.mutate({ campaignId: selectedCampaign.campaign.id })} className="rounded-none bg-black text-white hover:bg-[#e31b23]">{generateVariants.isPending ? <Loader2 className="animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}Generate 3 variants</Button></div>}
            </section>
          </section>

          <section className="grid-border px-5 py-8 sm:px-8 lg:px-10">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-black pb-4">
              <div><p className="eyebrow">03 / HUMAN REVIEW GATE</p><h2 className="mt-2 text-3xl font-black uppercase tracking-[-0.05em]">Variant desk <span className="text-[#e31b23]">/ {variants.length.toString().padStart(2, "0")}</span></h2></div>
              <p className="max-w-sm text-xs leading-5 text-neutral-600">Edited drafts are revalidated. Only variants that pass constraints and receive approval can enter a calendar slot.</p>
            </div>
            {campaignLoading ? <div className="py-12"><Loader2 className="animate-spin" /></div> : variants.length === 0 ? <div className="py-12 text-sm text-neutral-600">Generate variants from the stored source to start the review workflow.</div> : <div className="divide-y-2 divide-black">{variants.map(variant => {
              const profile = JSON.parse(variant.validationSnapshot) as { characterCount: number; hashtagCount: number; profile: { maxCharacters: number; maxHashtags: number; tone: string } };
              const nextSchedule = scheduleTimes[variant.id] ?? toLocalDateTime(new Date(Date.now() + 10 * 60_000));
              return <article key={variant.id} className="grid gap-5 py-6 lg:grid-cols-12 lg:gap-8"><div className="lg:col-span-2"><p className="text-2xl font-black uppercase tracking-[-0.05em]">{variant.platform}</p><span className={cn("mt-3 inline-flex px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em]", statusStyles[variant.status])}>{variant.status}</span><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">{profile.characterCount}/{profile.profile.maxCharacters} chars</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500">{profile.hashtagCount}/{profile.profile.maxHashtags} tags</p></div><div className="lg:col-span-6"><Textarea key={`${variant.id}-${variant.revision}`} defaultValue={variant.content} onBlur={event => { if (event.target.value !== variant.content) handleSaveVariant(variant.id, event.target.value); }} className="studio-textarea min-h-36" /><p className="mt-2 text-[10px] uppercase tracking-[0.1em] text-neutral-500">Tone: {profile.profile.tone} · revision {variant.revision}</p></div><div className="flex flex-col gap-2 lg:col-span-4"><div className="grid grid-cols-2 gap-2"><Button disabled={variant.status === "published" || reviewVariant.isPending} onClick={() => reviewVariant.mutate({ variantId: variant.id, status: "approved" })} className="rounded-none bg-black text-xs font-bold uppercase tracking-[0.08em] text-white hover:bg-[#e31b23]"><Check className="mr-1 h-3.5 w-3.5" />Approve</Button><Button disabled={variant.status === "published" || reviewVariant.isPending} onClick={() => reviewVariant.mutate({ variantId: variant.id, status: "rejected" })} variant="outline" className="rounded-none border-black text-xs font-bold uppercase tracking-[0.08em] hover:bg-[#e31b23] hover:text-white"><X className="mr-1 h-3.5 w-3.5" />Reject</Button></div><label className="field-label mt-2">Time slot</label><Input type="datetime-local" min={toLocalDateTime(new Date())} value={nextSchedule} onChange={event => setScheduleTimes(current => ({ ...current, [variant.id]: event.target.value }))} className="studio-input text-xs" /><Button disabled={variant.status !== "approved" || scheduleVariant.isPending} onClick={() => handleSchedule(variant.id)} variant="outline" className="rounded-none border-black text-xs font-bold uppercase tracking-[0.08em] hover:bg-black hover:text-white"><Clock3 className="mr-1 h-3.5 w-3.5" />Schedule approved</Button>{variant.status !== "approved" && variant.status !== "published" && <p className="mt-1 flex items-start gap-2 text-[11px] leading-4 text-[#e31b23]"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />Approval required before scheduling.</p>}</div></article>})}</div>}
          </section>

          <section className="grid gap-px bg-black lg:grid-cols-12">
            <section className="bg-white p-5 sm:p-8 lg:col-span-7">
              <div className="flex items-end justify-between border-b-2 border-black pb-4"><div><p className="eyebrow">04 / DURABLE CALENDAR</p><h2 className="mt-2 text-3xl font-black uppercase tracking-[-0.05em]">Scheduled slots</h2></div><Button disabled={runDue.isPending} onClick={() => runDue.mutate()} className="rounded-none bg-black text-white hover:bg-[#e31b23]"><Play className="mr-2 h-4 w-4" />Run due now</Button></div><div className="mt-5 space-y-2">{slots.length ? slots.map(slot => { const variant = variants.find(item => item.id === slot.variantId); return <div key={slot.id} className="grid grid-cols-[1fr_auto] gap-4 border border-black p-4 sm:grid-cols-[1.2fr_1fr_auto]"><div><p className="text-sm font-bold uppercase">{variant?.platform ?? "Variant"}</p><p className="mt-1 text-xs text-neutral-600">{new Date(slot.scheduledAt).toLocaleString()}</p></div><p className="hidden self-center text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-500 sm:block">key {slot.idempotencyKey.slice(0, 12)}…</p><span className={cn("self-center px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em]", slot.status === "published" ? "bg-[#e31b23] text-white" : slot.status === "processing" ? "bg-black text-white" : "bg-neutral-100")}>{slot.status}</span></div>}) : <p className="py-8 text-sm text-neutral-600">Approved variants will appear here after a UTC-backed slot is saved.</p>}</div></section>
            <section className="bg-[#e31b23] p-5 text-white sm:p-8 lg:col-span-5"><p className="eyebrow text-white">AUTOMATION / SERVER SIDE</p><h2 className="mt-3 text-3xl font-black uppercase leading-[0.9] tracking-[-0.06em]">Due slot<br />processor</h2><p className="mt-5 max-w-sm text-sm leading-6 text-white/85">The live callback validates its platform identity, resumes stale claims, and uses the same stable key for every retry.</p><div className="mt-8 border-t border-white/70 pt-5"><p className="text-[10px] font-bold uppercase tracking-[0.12em]">Recurrence</p><p className="mt-1 text-sm">{scheduler?.isEnabled ? `Active · ${scheduler.cronExpression} UTC` : "Manual until activated after publish"}</p><Button disabled={activateScheduler.isPending} onClick={() => activateScheduler.mutate({ cronExpression: "0 * * * * *" })} variant="outline" className="mt-5 rounded-none border-white bg-white text-black hover:bg-black hover:text-white">{activateScheduler.isPending ? <Loader2 className="animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{scheduler?.isEnabled ? "Refresh auto-run" : "Activate auto-run"}</Button><p className="mt-3 text-[11px] leading-4 text-white/75">Activation becomes available on the published site; the local “Run due now” control remains useful for review.</p></div></section>
          </section>

          <section className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
            <div className="flex items-end justify-between border-b-2 border-black pb-4"><div><p className="eyebrow">05 / AUDIT TRAIL</p><h2 className="mt-2 text-3xl font-black uppercase tracking-[-0.05em]">Publish history</h2></div><p className="text-[10px] font-bold uppercase tracking-[0.12em]">{attempts.length} recorded attempts</p></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] border-collapse text-left"><thead className="border-b border-black text-[10px] font-bold uppercase tracking-[0.13em]"><tr><th className="pb-3">Time</th><th className="pb-3">Adapter</th><th className="pb-3">Outcome</th><th className="pb-3">Delivery reference</th><th className="pb-3">Error</th></tr></thead><tbody>{attempts.length ? attempts.map(attempt => <tr key={attempt.id} className="border-b border-neutral-200 text-sm"><td className="py-4 text-neutral-600">{new Date(attempt.createdAt).toLocaleString()}</td><td className="py-4 font-bold uppercase">{attempt.adapter}</td><td className="py-4"><span className={cn("px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em]", attempt.status === "succeeded" ? "bg-black text-white" : attempt.status === "failed" ? "bg-[#e31b23] text-white" : "bg-neutral-100")}>{attempt.status}</span></td><td className="py-4">{attempt.deliveryUrl ? <a className="inline-flex items-center gap-1 underline decoration-[#e31b23] decoration-2 underline-offset-4" href={attempt.deliveryUrl} target="_blank" rel="noreferrer">{attempt.deliveryReference}<ArrowUpRight className="h-3.5 w-3.5" /></a> : attempt.deliveryReference ?? "—"}</td><td className="py-4 max-w-48 text-xs text-[#e31b23]">{attempt.errorMessage ?? "—"}</td></tr>) : <tr><td className="py-8 text-sm text-neutral-600" colSpan={5}>Every started, successful, duplicate, and failed delivery will be retained here.</td></tr>}</tbody></table></div>
          </section>
        </main>
      </div>
    </div>
  );
}
